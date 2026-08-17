// =============================================================================
// [CORE] PROJECT DIRECTIVES
// Traduce los ajustes del proyecto (.pi/ein/*.json) a las directivas que un
// runtime debe inyectar para trabajar bajo las reglas que el usuario eligió.
//
// Existe porque los ajustes vivían solo en la cabeza de Pi: Claude arrancaba
// con sus defaults de fábrica y el trabajo cambiaba de estándar a mitad de un
// handoff — TDD estricto en Pi, sin TDD en Claude — sin que nadie lo notara
// hasta mirar el resultado.
//
// El catálogo manda: se recorre `SETTING_DEFINITIONS`, así que un ajuste nuevo
// sin traducción sale como `unhandled` y el test de paridad falla. FAIL CLOSED:
// un ajuste que no se puede leer es `unreadable`, nunca su valor por defecto,
// y un ajuste que este runtime no puede honrar es `unsupported` con su motivo,
// nunca una directiva silenciosamente omitida.
//
// Módulo puro: lee ficheros a través de los lectores que ya poseen cada ajuste
// y no ejecuta nada más.
// =============================================================================

import { SETTING_DEFINITIONS } from "./project-settings.ts";
import { modeDirective, type EinMode } from "./mode.ts";
import { participationDirective, type AgentActivationProfileState } from "./agent-controls.ts";
import { tddDirective, type TddMode } from "./tdd.ts";
import { codegraphDirective } from "./codegraph.ts";
import { responseVoiceDirective } from "./persona.ts";
import {
	artifactLanguageDirective,
	responseLanguageDirective,
	readArtifactLang,
	type Lang,
} from "./lang.ts";

/** Runtimes que consumen estas directivas. Pi es la referencia; Claude el relevo. */
export type DirectiveRuntime = "pi" | "claude";

export type DirectiveStatus =
	| "applied"
	| "inactive"
	| "unsupported"
	| "unreadable"
	| "unhandled";

export type ProjectDirective = Readonly<{
	/** Id del ajuste en `SETTING_DEFINITIONS`. */
	id: string;
	/** Valor observado en disco, o `undefined` si no se pudo leer. */
	value: string | undefined;
	status: DirectiveStatus;
	/** Texto a inyectar. Vacío salvo en `applied`. */
	directive: string;
	/** Por qué no se aplica. Presente salvo en `applied`. */
	reason?: string;
}>;

/**
 * Traductor de un ajuste a su directiva. Devuelve `null` cuando el ajuste está
 * en un valor que no manda nada (p. ej. codegraph apagado): eso es `inactive`,
 * no un fallo.
 */
type Translator = (value: string, cwd: string) => string | null;

/** Ajustes que un runtime no puede honrar, con el motivo concreto. */
const UNSUPPORTED: Readonly<Record<DirectiveRuntime, Readonly<Record<string, string>>>> = {
	pi: {},
	claude: {
		// Hypa envuelve el tool `bash` desde una extensión de Pi. Claude no tiene
		// ese punto de enganche, así que el ajuste se reporta, no se finge.
		hypa: "Hypa wraps the Pi bash tool through a Pi extension; this runtime has no equivalent hook.",
		// Cleaner y Architect solo existen en Pi. Y aunque se portaran, la
		// participación automática se quedaría OFF aquí a propósito: el perfil del
		// proyecto declara una preferencia de CALIDAD, mientras que ejecutar pasadas
		// automáticas es una decisión de capacidad y coste DEL RUNTIME. Se llega a
		// Claude porque el presupuesto se agotó; gastarlo en pasadas opcionales es
		// justo al revés. Se declara para que el cambio de estándar no sea silencioso.
		agents:
			"Cleaner and Architect are Pi-only subagents. Automatic participation stays off in this runtime by design, so the project's quality profile is recorded here but not applied; ask explicitly if a change needs that pass, and run it in Pi.",
	},
};

const TRANSLATORS: Readonly<Record<string, Translator>> = {
	mode: (value) => modeDirective(value as EinMode),
	agents: (value) => participationDirective(value as AgentActivationProfileState),
	tdd: (value) => tddDirective(value as TddMode),
	"chat-lang": (value) => responseLanguageDirective(value as Lang),
	persona: (value) =>
		// `neutral` es la ausencia de voz propia: el runtime se queda con su
		// registro por defecto en vez de recibir el de Samu.
		value === "samuhlo" ? responseVoiceDirective() : null,
	// El override vive por proyecto y `auto` hereda del idioma de chat; el lector
	// resuelve esa herencia, así que la directiva sale siempre con un idioma real.
	lang: (_value, cwd) => artifactLanguageDirective(readArtifactLang(cwd)),
	// Ya devuelve "" cuando el grafo está apagado o sin indexar.
	codegraph: (_value, cwd) => codegraphDirective(cwd) || null,
	hypa: () => null,
};

/**
 * Resuelve una entrada por cada ajuste del catálogo, en su orden. Nunca lanza:
 * un lector roto se convierte en `unreadable`, que es un estado honesto.
 */
export function resolveProjectDirectives(
	cwd: string,
	runtime: DirectiveRuntime,
): readonly ProjectDirective[] {
	return Object.freeze(
		SETTING_DEFINITIONS.map((definition): ProjectDirective => {
			const { id } = definition;

			let value: string | undefined;
			try {
				value = definition.read(cwd);
			} catch {
				value = undefined;
			}

			const unsupported = UNSUPPORTED[runtime][id];
			if (unsupported) {
				return Object.freeze({ id, value, status: "unsupported", directive: "", reason: unsupported });
			}

			const translate = TRANSLATORS[id];
			if (!translate) {
				return Object.freeze({
					id,
					value,
					status: "unhandled",
					directive: "",
					reason: "the setting has no directive translation; add one next to its reader",
				});
			}

			if (value === undefined) {
				return Object.freeze({
					id,
					value,
					status: "unreadable",
					directive: "",
					reason: "the setting could not be read; the runtime must not assume a default",
				});
			}

			let directive: string | null;
			try {
				directive = translate(value, cwd);
			} catch {
				directive = null;
			}

			if (!directive) {
				return Object.freeze({
					id,
					value,
					status: "inactive",
					directive: "",
					reason: "the current value injects nothing",
				});
			}

			return Object.freeze({ id, value, status: "applied", directive });
		}),
	);
}

/**
 * Una línea con el valor de cada ajuste, para el status. Marca lo que el
 * runtime no honra: un status que enseña `hypa=auto` a secas afirma algo que no
 * es cierto en Claude.
 */
export function summarizeProjectDirectives(
	directives: readonly ProjectDirective[],
): string {
	if (directives.length === 0) return "";
	const parts = directives.map((entry) => {
		const value = entry.value ?? "unknown";
		if (entry.status === "unsupported") return `${entry.id}=${value} (no aplica aquí)`;
		if (entry.status === "unreadable") return `${entry.id}=ilegible`;
		return `${entry.id}=${value}`;
	});
	return `- Ajustes del proyecto: ${parts.join(" · ")}`;
}

/**
 * Bloque inyectable. Las directivas activas van primero y enteras; el resto se
 * resume en una línea por ajuste para que el runtime sepa qué NO está honrando
 * — un ajuste omitido en silencio es justo el fallo que este módulo evita.
 */
export function renderProjectDirectives(
	directives: readonly ProjectDirective[],
): string {
	const applied = directives.filter((entry) => entry.status === "applied");
	const skipped = directives.filter((entry) => entry.status !== "applied");

	const lines = ["## Project settings (from this project's Ein configuration)"];

	if (applied.length === 0) {
		lines.push("", "No project setting produces a directive in this runtime.");
	}

	for (const entry of applied) lines.push("", entry.directive);

	if (skipped.length > 0) {
		lines.push("", "Not applied:");
		for (const entry of skipped) {
			lines.push(`- \`${entry.id}\` = ${entry.value ?? "unknown"} (${entry.status}): ${entry.reason ?? ""}`.trimEnd());
		}
	}

	return lines.join("\n");
}
