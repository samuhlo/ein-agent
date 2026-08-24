// =============================================================================
// [CORE] COBERTURA DE ESTADOS EN SUPERFICIES
//
// POR QUÉ -> los cinco hallazgos del bloque A eran el mismo defecto cinco
// veces: código correcto detrás de una pantalla que afirma otra cosa. Los tests
// de superficie que ya existían fijaban el ASPECTO, no la CORRESPONDENCIA: por
// eso `sdd-overlay.test.ts` estaba verde mientras `verify: fail` se pintaba
// igual que `verify: pass`.
//
// QUÉ COMPRUEBA -> recorre el espacio de estados declarado de una superficie y
// exige que dos estados semánticamente distintos no produzcan la misma salida.
// No compara contra una captura: una captura te dice que el dibujo cambió, no
// que dos verdades distintas se vean igual.
//
// El color se retira antes de comparar. Una diferencia que solo existe como
// código ANSI no es una diferencia legible en un log, una captura o un terminal
// monocromo.
//
// Módulo PURO: entra la declaración, sale la lista de incumplimientos. Quien
// afirma y quien falla es el test.
// =============================================================================

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** Una superficie declarada: cómo se pinta y qué estados recibe. */
export type SurfaceDeclaration<S> = {
	/** Nombre humano; aparece en el mensaje de fallo. */
	readonly surface: string;
	/** La unión de estado que se recorre; aparece en el mensaje de fallo. */
	readonly union: string;
	/** Estados a recorrer, con la etiqueta con la que se nombran. */
	readonly states: readonly { readonly label: string; readonly state: S }[];
	/** Render bajo prueba. Devuelve líneas o texto. */
	readonly render: (state: S) => readonly string[] | string;
	/**
	 * Estados que legítimamente no pintan nada, con su razón. Vacío NO está
	 * prohibido: lo que está prohibido es un vacío que nadie declaró.
	 */
	readonly emptyByDesign?: Readonly<Record<string, string>>;
};

export type CoverageViolation =
	| { kind: "collision"; surface: string; union: string; states: readonly [string, string] }
	| { kind: "undeclared-empty"; surface: string; union: string; state: string }
	| { kind: "stale-empty-declaration"; surface: string; union: string; state: string; reason: string };

function textOf(output: readonly string[] | string): string {
	const text = typeof output === "string" ? output : output.join("\n");
	return text.replace(ANSI, "").trim();
}

export function findCoverageViolations<S>(declaration: SurfaceDeclaration<S>): readonly CoverageViolation[] {
	const violations: CoverageViolation[] = [];
	const byOutput = new Map<string, string>();
	const declaredEmpty = declaration.emptyByDesign ?? {};

	for (const { label, state } of declaration.states) {
		const text = textOf(declaration.render(state));
		const isEmpty = text.length === 0;
		const declaration_reason = declaredEmpty[label];

		if (isEmpty && declaration_reason === undefined) {
			violations.push({ kind: "undeclared-empty", surface: declaration.surface, union: declaration.union, state: label });
			continue;
		}
		// Una declaración obsoleta deja de proteger sin que nadie lo note: si el
		// estado empieza a pintar, la declaración se ha quedado atrás.
		if (!isEmpty && declaration_reason !== undefined) {
			violations.push({
				kind: "stale-empty-declaration",
				surface: declaration.surface,
				union: declaration.union,
				state: label,
				reason: declaration_reason,
			});
			continue;
		}
		if (isEmpty) continue;

		const previous = byOutput.get(text);
		if (previous !== undefined) {
			violations.push({ kind: "collision", surface: declaration.surface, union: declaration.union, states: [previous, label] });
			continue;
		}
		byOutput.set(text, label);
	}

	return violations;
}

/** El mensaje que lee una persona: qué superficie, qué unión y qué estados. */
export function describeViolations(violations: readonly CoverageViolation[]): string {
	return violations
		.map((violation) => {
			switch (violation.kind) {
				case "collision":
					return `${violation.surface}: los estados ${violation.states[0]} y ${violation.states[1]} de ${violation.union} se pintan igual — la pantalla no los distingue.`;
				case "undeclared-empty":
					return `${violation.surface}: el estado ${violation.state} de ${violation.union} no pinta nada y no está declarado como vacío a propósito.`;
				case "stale-empty-declaration":
					return `${violation.surface}: el estado ${violation.state} de ${violation.union} está declarado vacío ("${violation.reason}") pero ahora pinta.`;
			}
		})
		.join("\n");
}
