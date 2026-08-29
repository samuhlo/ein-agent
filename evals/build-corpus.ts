// =============================================================================
// [CORE] BORDE DE E/S DEL CORPUS DE EVALUACIÓN
//
// Reúne los hechos y los entrega a `apply-corpus.ts`, que es quien decide. Este
// fichero NO toma ninguna decisión de pertenencia: si la tomara, la regla
// dejaría de poder probarse sin un árbol real.
//
// Todo se lee de git EN EL COMMIT BASE, nunca del árbol de trabajo. Leer el
// árbol hacía que archivar cualquier cambio moviera el corpus — incluido el
// cambio que lo creó, que se incluía a sí mismo.
//
// Vive fuera de `ein-pi/` a propósito: es dato de evaluación, no payload que se
// instala. Y fuera de `openspec/`, cuya autoridad es el spec-sync.
//
// Uso: `bun run evals/build-corpus.ts` congela contra `HEAD`.
// =============================================================================

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { type ArchivedChangeFacts, buildApplyCorpus, serializeApplyCorpus } from "../ein-pi/agent/lib/apply-corpus.ts";

const ARCHIVE = "openspec/changes/archive";

function git(cwd: string, args: readonly string[]): string | null {
	try {
		// RUIDO -> stderr silenciado: un artefacto ausente en el commit base es un
		// hecho normal (carril micro sin `tasks.md`), no un incidente que reportar.
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			maxBuffer: 32 * 1024 * 1024,
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		// Un fallo de git es AUSENCIA de hecho, no un cero. La regla de pertenencia
		// lo traduce a exclusión con motivo.
		return null;
	}
}

function lines(output: string | null): string[] {
	return (output ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
}

function frozenCommitId(value: string): string {
	return value.slice(0, 7);
}

export function resolveBaseCommit(cwd: string): string {
	return frozenCommitId(lines(git(cwd, ["rev-parse", "HEAD"]))[0] ?? "");
}

export function collectArchivedFacts(cwd: string, baseCommit: string): ArchivedChangeFacts[] {
	if (!baseCommit) return [];
	const tree = git(cwd, ["ls-tree", "--name-only", baseCommit, `${ARCHIVE}/`]);
	if (tree === null) return [];

	const changes = lines(tree)
		.map((path) => path.replace(`${ARCHIVE}/`, "").replace(/\/$/, ""))
		.filter(Boolean)
		.sort();

	return changes.map((change) => {
		const summary = `${ARCHIVE}/${change}/summary.md`;
		const deliveringCommits = lines(git(cwd, ["log", baseCommit, "--format=%H", "--diff-filter=A", "--", summary]))
			.map(frozenCommitId);
		const deliveringCommit = deliveringCommits.length === 1 ? deliveringCommits[0] : null;
		const touchedFiles =
			deliveringCommit
				? lines(git(cwd, ["show", "--name-only", "--format=", deliveringCommit]))
				: [];
		const historicalArtifact = (file: string): string | null =>
			git(cwd, ["show", `${baseCommit}:${ARCHIVE}/${change}/${file}`])
			?? (deliveringCommit ? git(cwd, ["show", `${deliveringCommit}:${ARCHIVE}/${change}/${file}`]) : null);

		return {
			change,
			deliveringCommits,
			touchedFiles,
			tasksText: historicalArtifact("tasks.md"),
			verifyText: historicalArtifact("verify-report.md"),
		};
	});
}

if (import.meta.main) {
	const cwd = process.cwd();
	const baseCommit = resolveBaseCommit(cwd);
	const corpus = buildApplyCorpus(collectArchivedFacts(cwd, baseCommit), baseCommit);
	const target = join(cwd, "evals", "apply-corpus.json");
	writeFileSync(target, serializeApplyCorpus(corpus));
	console.log(
		`apply-corpus/v1 @ ${baseCommit} → ${corpus.items.length} items · ${corpus.exclusions.length} exclusiones → ${target}`,
	);
}
