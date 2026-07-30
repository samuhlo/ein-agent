// =============================================================================
// SDD RECONCILE — el filesystem manda sobre lo que el runner cree
// =============================================================================
// Una fase SDD entrega UN artefacto. Si el artefacto está escrito y sano, la
// fase está hecha — da igual lo que el runner opine del proceso.
//
// El runner marca ✗ por cosas que no dicen nada del trabajo:
//   - una tool declarada que Pi no registra (el diagnóstico se convierte en
//     `closeError` AL CERRAR, con el artefacto ya escrito);
//   - una respuesta final vacía del modelo (cold start) tras 38 tool uses;
//   - un timeout durante la lectura final, no durante el trabajo.
// En los tres casos el orquestador reaccionaba a un ✗ falso: reintentaba una
// fase ya completa y pagaba dos veces.
//
// Reconciliar NO es enmascarar. Es CONSERVADOR por diseño y solo procede si:
//   1. el artefacto de ESA fase apareció o cambió DURANTE el run (mtime contra
//      un snapshot previo) — un artefacto viejo no rescata nada;
//   2. es el único candidato (varios = ambiguo → se respeta el fallo);
//   3. pasa el lint de su fase sin errores.
// El error original SIEMPRE viaja en el reporte: nada se traga en silencio.
// =============================================================================

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { collectDelegationAgents } from "./guardrails.ts";
import { lintPhaseArtifact, type GuardrailIssue, type SddPhase } from "./sdd-guardrails.ts";
import { listActiveChanges, resolveChangesDir } from "./sdd-router.ts";

// Fase → artefacto que la da por hecha. Espejo del router y del lint; se repite
// aquí para no exportar el mapa privado de ninguno de los dos.
const PHASE_ARTIFACT: Record<SddPhase, string> = {
	scope: "scope.md",
	map: "map.md",
	design: "design.md",
	tasks: "tasks.md",
	apply: "apply-progress.md",
	verify: "verify-report.md",
	close: "summary.md",
};

const SDD_PHASES = new Set<string>(Object.keys(PHASE_ARTIFACT));

// `sdd-map` → `map`. Solo los agentes de fase canónicos: cualquier otro nombre
// (ein-git, un agente ad-hoc) devuelve null y nunca se reconcilia.
export function phaseForAgent(agent: unknown): SddPhase | null {
	if (typeof agent !== "string") return null;
	const name = agent.trim().toLowerCase();
	if (!name.startsWith("sdd-")) return null;
	const phase = name.slice(4);
	return SDD_PHASES.has(phase) ? (phase as SddPhase) : null;
}

// ¿Qué fase SDD entrega esta delegación? Solo si es UNA sola. Un chain o un
// parallel con varias fases no dice cuál falló, y reconciliar a ciegas ahí sí
// sería enmascarar: se devuelve null y el fallo queda intacto.
export function resolveDelegationPhase(input: unknown): SddPhase | null {
	const phases = new Set(
		collectDelegationAgents(input)
			.map(phaseForAgent)
			.filter((phase): phase is SddPhase => phase !== null),
	);
	if (phases.size !== 1) return null;
	return [...phases][0] as SddPhase;
}

// mtime del artefacto de `phase` en cada cambio activo. Ausente = sin entrada:
// así `sdd-scope`, que CREA el directorio del cambio, produce un candidato
// "nuevo" al comparar.
export type PhaseSnapshot = Record<string, number>;

export function snapshotPhaseArtifacts(cwd: string, phase: SddPhase): PhaseSnapshot {
	const snapshot: PhaseSnapshot = {};
	const base = resolveChangesDir(cwd);
	for (const change of listActiveChanges(cwd)) {
		const path = join(base, change, PHASE_ARTIFACT[phase]);
		if (!existsSync(path)) continue;
		try {
			snapshot[change] = statSync(path).mtimeMs;
		} catch {
			// ilegible ahora = se tratará como candidato si luego se puede leer
		}
	}
	return snapshot;
}

export type Reconciliation = {
	// ¿Se puede dar la fase por hecha pese al fallo reportado?
	reconciled: boolean;
	phase: SddPhase;
	// Cambio y artefacto que la sostienen (solo si `reconciled`).
	change?: string;
	artifact?: string;
	// Warnings del lint: se propagan, no se ocultan.
	warnings: GuardrailIssue[];
	// Por qué NO se reconcilió. Vacío si se reconcilió.
	reason: string;
};

// Compara el estado actual contra el snapshot previo al run y decide.
export function reconcilePhaseFailure(
	cwd: string,
	phase: SddPhase,
	before: PhaseSnapshot,
): Reconciliation {
	const base = resolveChangesDir(cwd);
	const candidates: string[] = [];
	for (const change of listActiveChanges(cwd)) {
		const path = join(base, change, PHASE_ARTIFACT[phase]);
		if (!existsSync(path)) continue;
		let mtime: number;
		try {
			mtime = statSync(path).mtimeMs;
		} catch {
			continue;
		}
		const previous = before[change];
		// Nuevo, o reescrito durante el run. `>` estricto: un artefacto intacto
		// no cuenta, aunque exista.
		if (previous === undefined || mtime > previous) candidates.push(change);
	}

	if (candidates.length === 0) {
		return {
			reconciled: false,
			phase,
			warnings: [],
			reason: `no se escribió ${PHASE_ARTIFACT[phase]} durante el run`,
		};
	}
	if (candidates.length > 1) {
		return {
			reconciled: false,
			phase,
			warnings: [],
			reason: `varios cambios escribieron ${PHASE_ARTIFACT[phase]} (${candidates.join(", ")}); ambiguo`,
		};
	}

	const change = candidates[0] as string;
	const artifact = join(base, change, PHASE_ARTIFACT[phase]);
	let content = "";
	try {
		content = readFileSync(artifact, "utf8");
	} catch {
		return {
			reconciled: false,
			phase,
			reason: `${PHASE_ARTIFACT[phase]} existe pero no se pudo leer`,
			warnings: [],
		};
	}

	const report = lintPhaseArtifact(phase, content);
	if (report.errors > 0) {
		const errors = report.issues.filter((i) => i.level === "error");
		return {
			reconciled: false,
			phase,
			warnings: [],
			reason: `${PHASE_ARTIFACT[phase]} tiene ${report.errors} error(es) de lint: ${errors.map((i) => i.code).join(", ")}`,
		};
	}

	return {
		reconciled: true,
		phase,
		change,
		artifact,
		warnings: report.issues.filter((i) => i.level === "warning"),
		reason: "",
	};
}

// Texto que sustituye al resultado fallido. El error original va DENTRO: el
// orquestador debe poder ver que el runner falló y por qué, aunque la fase
// cuente como hecha. Sin esto estaríamos mintiendo, no reconciliando.
export function formatReconciliation(
	result: Reconciliation,
	originalError: string,
): string {
	const lines = [
		`/// SDD RECONCILE — fase '${result.phase}' COMPLETA pese al fallo del runner`,
		"",
		`El runner reportó un fallo, pero \`${PHASE_ARTIFACT[result.phase]}\` se escribió durante este run en '${result.change}' y pasa el lint de su fase.`,
		"El artefacto es el entregable: la fase cuenta como hecha. NO la repitas.",
		"",
		"fallo original del runner (informativo, no bloquea):",
		originalError.trim() ? indent(originalError.trim()) : "  (sin detalle)",
	];
	if (result.warnings.length > 0) {
		lines.push("", "warnings del artefacto (siguen aplicando):");
		for (const warning of result.warnings) {
			lines.push(`  - [${warning.code}] ${warning.message}`);
		}
	}
	lines.push("", "Continúa con la fase siguiente según `ein_sdd_status`.");
	return lines.join("\n");
}

function indent(text: string): string {
	return text
		.split("\n")
		.map((line) => `  ${line}`)
		.join("\n");
}
