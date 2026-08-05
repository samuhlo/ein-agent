// =============================================================================
// GIT BASELINE
// Snapshot determinista del estado del árbol ANTES de que el flujo SDD mute
// nada. Existe por un incidente real: un `reset` dejó los commits de otro
// agente huérfanos (fuera de la rama), el flujo siguió refactorizando encima
// del árbol revertido, y verify firmó PASS sobre trabajo perdido — sin que
// ningún gate lo detectara. Este probe surface la señal en el preflight para
// que el parent RECONCILIE con el usuario antes del primer edit/commit/apply.
//
// Determinista, no "el modelo se acuerda de mirar": corre git y devuelve
// hechos. Los parsers son puros (testeables sin repo); solo `readGitBaseline`
// toca git, siempre con fallback seguro (sin repo / git caído → baseline vacío).
// =============================================================================

import { execFileSync } from "node:child_process";

export interface GitReset {
	// Selector del reflog, p.ej. `HEAD@{2026-07-07 17:14:53 +0200}`.
	selector: string;
	// Sujeto del reflog, p.ej. `reset: moving to HEAD`.
	action: string;
	// Fecha extraída del selector si `--date=iso` la incrustó; undefined si no.
	date?: string;
}

export interface GitBaseline {
	isRepo: boolean;
	dirty: boolean;
	stashes: number;
	// Reset MÁS RECIENTE dentro de la ventana de lookback del reflog, o null.
	// Un `reset` mueve HEAD y puede huérfanar trabajo previo — la señal clave.
	recentReset: GitReset | null;
}

const EMPTY_BASELINE: GitBaseline = {
	isRepo: false,
	dirty: false,
	stashes: 0,
	recentReset: null,
};

function git(cwd: string, args: string[]): string | null {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return null;
	}
}

// Puro: busca el `reset:` más reciente en las primeras `lookback` entradas del
// reflog. Solo `reset` (no `checkout`): cambiar de rama es rutina y ruido; un
// reset es la operación que huérfana trabajo. Formato de línea esperado:
// `<selector>\t<action>` (de `git reflog --format='%gd%x09%gs'`).
export function parseRecentReset(reflog: string, lookback = 15): GitReset | null {
	const lines = reflog.split("\n").filter((l) => l.trim().length > 0).slice(0, lookback);
	for (const line of lines) {
		const tab = line.indexOf("\t");
		if (tab < 0) continue;
		const selector = line.slice(0, tab).trim();
		const action = line.slice(tab + 1).trim();
		if (/^reset:/i.test(action)) {
			const braced = selector.match(/@\{([^}]+)\}/);
			const date = braced && /\d{4}-\d{2}-\d{2}/.test(braced[1]) ? braced[1] : undefined;
			return { selector, action, date };
		}
	}
	return null;
}

export function readGitBaseline(cwd: string, lookback = 15): GitBaseline {
	const inside = git(cwd, ["rev-parse", "--is-inside-work-tree"]);
	if (!inside || inside.trim() !== "true") return { ...EMPTY_BASELINE };
	const status = git(cwd, ["status", "--porcelain"]) ?? "";
	const reflog = git(cwd, ["reflog", "--date=iso", "--format=%gd%x09%gs", "-n", "40"]) ?? "";
	const stashRaw = git(cwd, ["stash", "list"]) ?? "";
	return {
		isRepo: true,
		dirty: status.trim().length > 0,
		stashes: stashRaw.split("\n").filter((l) => l.trim().length > 0).length,
		recentReset: parseRecentReset(reflog, lookback),
	};
}

// Puro: traduce el baseline a la línea inyectada en el bloque de preflight.
// - No repo → null (no ensuciamos el bloque en un dir sin git).
// - Solo un `reset` reciente → WARNING con directiva de PARAR y reconciliar: es
//   la operación que huérfana trabajo (el incidente que motivó el probe).
// - Los stashes son trabajo APARCADO, no evidencia de que HEAD sea incorrecto:
//   se MENCIONAN como información, nunca disparan por sí solos la reconciliación
//   (un repo con stashes históricos convertía cada SDD en una falsa emergencia).
export function renderGitBaselineLine(b: GitBaseline): string | null {
	if (!b.isRepo) return null;
	const stashNote =
		b.stashes > 0
			? ` (${b.stashes} stash entr${b.stashes === 1 ? "y" : "ies"} present — parked work, informational only, not a blocker)`
			: "";
	if (!b.recentReset) {
		return `- Working-tree baseline: clean start (no recent \`reset\` in reflog)${stashNote}. Still confirm HEAD is the state the user expects before the first mutation.`;
	}
	const when = b.recentReset.date ? ` (${b.recentReset.date})` : "";
	return `- Working-tree baseline — INSPECT BEFORE MUTATING: a recent \`${b.recentReset.action}\` at ${b.recentReset.selector}${when} — HEAD was moved, which can ORPHAN prior work (this is exactly how a previous agent's commits get lost). Before ANY edit, commit, or SDD apply, run \`git reflog\` / \`git fsck --lost-found\` and RECONCILE with the user that current HEAD is what they expect. If work looks orphaned, recover it FIRST — do not build on top of a possibly-reverted tree (a green build/verify will not catch lost content)${stashNote}.`;
}

// Puro: única fuente del texto de working-tree para `cc-ein-sdd status`. CANAL
// ÚNICO por diseño — ni el envelope de permission-decision (guardrails) ni el
// deploy de `sync.ts` (que escribe en ~/.claude-ein y nunca ve el árbol del
// proyecto) repiten esta señal. Si hace falta mostrarla en otro sitio, se
// llama a esta función, nunca se duplica el texto.
// Clasificación (isRepo/dirty) viene ya resuelta de readGitBaseline; esta
// función solo formatea, no vuelve a tocar git ni el filesystem.
export function renderWorkingTreeLine(b: GitBaseline): string | null {
	if (!b.isRepo) return null;
	if (!b.dirty) return "- Working tree: clean (no uncommitted changes).";
	return [
		"- Working tree: UNCOMMITTED changes present.",
		"  Stash (`git stash`) or commit before continuing, so SDD state and the tree stay in sync.",
	].join("\n");
}
