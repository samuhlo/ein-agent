// =============================================================================
// DOCS SITE DRIFT DETECTOR
// Compara las fuentes declaradas de cada página de `docs-site/` contra su
// propio `verified_rev` — sin rev global. Nunca lanza excepción: cualquier
// fallo de git se traduce en estado `unknown` con razón explícita. `GitRunner`
// es inyectable para tests unitarios; por defecto ejecuta `git` real.
// =============================================================================

import { execFileSync } from "node:child_process";

export type GitRunResult = { ok: boolean; code: number; stdout: string; stderr: string };
export type GitRunner = (args: string[]) => GitRunResult;

export type SourceChangeStatus = "modified" | "added" | "deleted";
export type SourceChange = { path: string; status: SourceChangeStatus; linesAdded: number; linesRemoved: number };

export type DriftPageStatus = "clean" | "drifted" | "unknown";
export type DriftUnknownReason = "not-a-repo" | "rev-not-found" | "git-error";

export type DriftPageReport = {
	path: string;
	status: DriftPageStatus;
	verifiedRev: string;
	reason?: DriftUnknownReason;
	detail?: string;
	sourcesChanged: SourceChange[];
};

export type DriftPageInput = { path: string; verifiedRev: string; sources: string[] };

export type DriftReport = {
	pages: DriftPageReport[];
	counts: { clean: number; drifted: number; unknown: number };
};

function defaultGitRunner(repoRoot: string): GitRunner {
	return (args: string[]): GitRunResult => {
		try {
			const stdout = execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", timeout: 10_000 });
			return { ok: true, code: 0, stdout, stderr: "" };
		} catch (err) {
			const e = err as { status?: number; stdout?: string; stderr?: string };
			return { ok: false, code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
		}
	};
}

function parseNumstat(stdout: string): Map<string, { added: number; removed: number }> {
	const result = new Map<string, { added: number; removed: number }>();
	for (const line of stdout.split("\n")) {
		if (!line.trim()) continue;
		const [added, removed, path] = line.split("\t");
		result.set(path, { added: added === "-" ? 0 : Number(added), removed: removed === "-" ? 0 : Number(removed) });
	}
	return result;
}

function parseNameStatus(stdout: string): Map<string, SourceChangeStatus> {
	const result = new Map<string, SourceChangeStatus>();
	for (const line of stdout.split("\n")) {
		if (!line.trim()) continue;
		const [code, path] = line.split("\t");
		const letter = code[0];
		const status: SourceChangeStatus = letter === "D" ? "deleted" : letter === "A" ? "added" : "modified";
		result.set(path, status);
	}
	return result;
}

function detectPageDrift(page: DriftPageInput, gitRunner: GitRunner): DriftPageReport {
	if (page.sources.length === 0) {
		return { path: page.path, status: "clean", verifiedRev: page.verifiedRev, sourcesChanged: [] };
	}

	const revCheck = gitRunner(["rev-parse", "--verify", "--quiet", `${page.verifiedRev}^{commit}`]);
	if (!revCheck.ok) {
		return {
			path: page.path,
			status: "unknown",
			verifiedRev: page.verifiedRev,
			reason: "rev-not-found",
			detail: `Rev ${page.verifiedRev} no encontrado en el árbol.`,
			sourcesChanged: [],
		};
	}

	const numstatRes = gitRunner(["diff", "--numstat", "--no-renames", `${page.verifiedRev}..HEAD`, "--", ...page.sources]);
	const nameStatusRes = gitRunner(["diff", "--name-status", "--no-renames", `${page.verifiedRev}..HEAD`, "--", ...page.sources]);

	if (!numstatRes.ok || !nameStatusRes.ok) {
		const failed = !numstatRes.ok ? numstatRes : nameStatusRes;
		return {
			path: page.path,
			status: "unknown",
			verifiedRev: page.verifiedRev,
			reason: "git-error",
			detail: failed.stderr.slice(0, 300),
			sourcesChanged: [],
		};
	}

	const numstat = parseNumstat(numstatRes.stdout);
	const nameStatus = parseNameStatus(nameStatusRes.stdout);

	const sourcesChanged: SourceChange[] = [];
	for (const [path, status] of nameStatus) {
		const counts = numstat.get(path) ?? { added: 0, removed: 0 };
		sourcesChanged.push({ path, status, linesAdded: counts.added, linesRemoved: counts.removed });
	}

	return {
		path: page.path,
		status: sourcesChanged.length === 0 ? "clean" : "drifted",
		verifiedRev: page.verifiedRev,
		sourcesChanged,
	};
}

export function detectDrift(pages: DriftPageInput[], repoRoot: string, gitRunner?: GitRunner): DriftReport {
	const runner = gitRunner ?? defaultGitRunner(repoRoot);

	const repoCheck = runner(["rev-parse", "--git-dir"]);
	if (!repoCheck.ok) {
		const unknownPages: DriftPageReport[] = pages.map((p) => ({
			path: p.path,
			status: "unknown",
			verifiedRev: p.verifiedRev,
			reason: "not-a-repo",
			detail: "El directorio no es un repositorio git.",
			sourcesChanged: [],
		}));
		return { pages: unknownPages, counts: { clean: 0, drifted: 0, unknown: unknownPages.length } };
	}

	const reports = pages.map((p) => detectPageDrift(p, runner));
	const counts = { clean: 0, drifted: 0, unknown: 0 };
	for (const r of reports) counts[r.status]++;

	return { pages: reports, counts };
}
