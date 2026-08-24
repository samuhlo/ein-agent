// =============================================================================
// [CORE] CORPUS DE EVALUACIÓN CONGELADO (`apply-corpus/v1`)
//
// El corpus es el examen fijo contra el que se mide cualquier candidato a
// ejecutor. Su pertenencia se CALCULA desde hechos comprobables por máquina —
// commit de entrega, ficheros tocados, comando enfocado, veredicto de verify —
// y nunca se elige a mano: una selección humana no es reproducible y deja
// escoger los casos favorables.
//
// Congelar no es guardar un fichero: es que regenerarlo produzca los mismos
// bytes. De ahí la serialización canónica, el digest y el `baseCommit`: sin
// anclar el examen a un punto del historial, archivar cualquier cambio nuevo lo
// movería, y las notas dejarían de compararse entre sí.
//
// NO es fuente de verdad de nada. Ninguna herramienta de fase puede leerlo.
// =============================================================================

import { sha256 } from "./openspec-spec-contract.ts";
import { isTestPath } from "./sdd-router.ts";

export const APPLY_CORPUS_FORMAT = "apply-corpus/v1";

export type ArchivedChangeFacts = Readonly<{
	change: string;
	/** Commits que AÑADEN el `summary.md` archivado. Uno solo es verdad; varios o ninguno, no. */
	deliveringCommits: readonly string[];
	touchedFiles: readonly string[];
	tasksText: string | null;
	verifyText: string | null;
}>;

export type CorpusExclusionReason = "sin-commit" | "solo-artefactos" | "sin-tasks" | "verify-sin-status";

export type CorpusItem = Readonly<{
	change: string;
	commit: string;
	outcome: "pass";
	productionFiles: readonly string[];
	testFiles: readonly string[];
	focusedChecks: readonly string[];
	groups: number;
}>;

export type CorpusExclusion = Readonly<{ change: string; reason: CorpusExclusionReason }>;

export type ApplyCorpus = Readonly<{
	format: typeof APPLY_CORPUS_FORMAT;
	/** Commit al que está anclado el examen. Sin él, archivar cualquier cambio lo movería. */
	baseCommit: string;
	items: readonly CorpusItem[];
	exclusions: readonly CorpusExclusion[];
}>;

const VERIFY_PASS_RE = /^\s*(?:status|result|resultado)\s*[:=]\s*(?:pass|passed|ok|pasa)\b/im;
const FOCUSED_CHECK_RE = /^\s*-\s*verify\s*:\s*(.+)$/gim;
const GROUP_RE = /^##\s+.+$/gm;

// Artefactos de proceso SDD: el commit de entrega los mueve siempre, y contarlos
// como trabajo haría que un cambio que solo archiva papeles pareciera código.
function isProcessArtifact(path: string): boolean {
	return /^(?:openspec|\.sdd)\//.test(path);
}

function stripTicks(value: string): string {
	return value.trim().replace(/^`+|`+$/g, "").trim();
}

function focusedChecksOf(tasksText: string): string[] {
	return [...tasksText.matchAll(FOCUSED_CHECK_RE)].map((match) => stripTicks(match[1])).filter(Boolean);
}

/**
 * [DATA] MOTIVO DE EXCLUSIÓN, EN ORDEN FIJO
 * ---------------------------------------------------------
 * FAIL CLOSED -> se devuelve el PRIMER motivo que aplica. Elegir "el mejor
 * motivo" sería una opinión, y el orden fijo hace el resultado reproducible.
 */
function exclusionReason(facts: ArchivedChangeFacts): CorpusExclusionReason | null {
	if (facts.deliveringCommits.length !== 1) return "sin-commit";
	if (!facts.touchedFiles.some((path) => !isProcessArtifact(path))) return "solo-artefactos";
	if (!facts.tasksText || focusedChecksOf(facts.tasksText).length === 0) return "sin-tasks";
	if (!facts.verifyText || !VERIFY_PASS_RE.test(facts.verifyText)) return "verify-sin-status";
	return null;
}

function itemOf(facts: ArchivedChangeFacts): CorpusItem {
	const delivered = facts.touchedFiles.filter((path) => !isProcessArtifact(path));
	const tasksText = facts.tasksText ?? "";
	return {
		change: facts.change,
		commit: facts.deliveringCommits[0],
		outcome: "pass",
		productionFiles: delivered.filter((path) => !isTestPath(path)).sort(),
		testFiles: delivered.filter((path) => isTestPath(path)).sort(),
		focusedChecks: focusedChecksOf(tasksText),
		groups: (tasksText.match(GROUP_RE) ?? []).length,
	};
}

export function buildApplyCorpus(facts: readonly ArchivedChangeFacts[], baseCommit: string): ApplyCorpus {
	const items: CorpusItem[] = [];
	const exclusions: CorpusExclusion[] = [];

	for (const change of facts) {
		const reason = exclusionReason(change);
		if (reason) exclusions.push({ change: change.change, reason });
		else items.push(itemOf(change));
	}

	const byChange = (a: { change: string }, b: { change: string }) => a.change.localeCompare(b.change);
	return { format: APPLY_CORPUS_FORMAT, baseCommit, items: items.sort(byChange), exclusions: exclusions.sort(byChange) };
}

/**
 * [DATA] SERIALIZACIÓN CANÓNICA
 * ---------------------------------------------------------
 * Claves en orden fijo e ítems ordenados. Sin esto, dos generaciones del mismo
 * corpus podrían diferir en bytes y el congelado no significaría nada.
 */
export function serializeApplyCorpus(corpus: ApplyCorpus): string {
	const items = corpus.items.map((item) => ({
		change: item.change,
		commit: item.commit,
		outcome: item.outcome,
		productionFiles: [...item.productionFiles],
		testFiles: [...item.testFiles],
		focusedChecks: [...item.focusedChecks],
		groups: item.groups,
	}));
	const exclusions = corpus.exclusions.map((exclusion) => ({ change: exclusion.change, reason: exclusion.reason }));
	return `${JSON.stringify({ format: corpus.format, baseCommit: corpus.baseCommit, items, exclusions }, null, "\t")}\n`;
}

export function applyCorpusDigest(corpus: ApplyCorpus): string {
	return sha256(serializeApplyCorpus(corpus));
}
