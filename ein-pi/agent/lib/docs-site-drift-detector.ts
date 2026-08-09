// =============================================================================
// DOCS SITE DRIFT DETECTOR
// Compara las fuentes declaradas de cada página de `docs-site/` contra su
// propio `verified_rev` — sin rev global. Nunca lanza excepción: cualquier
// fallo de git se traduce en estado `unknown` con razón explícita. `GitRunner`
// es inyectable para tests unitarios; por defecto ejecuta `git` real.
// =============================================================================

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Parser mínimo del frontmatter que nos interesa. Solo `sources` y
// `verified_rev`: es lo que sostiene la procedencia de una página.
export function readProvenance(content: string): { verifiedRev: string; sources: string[] } {
	const fm = /^---\n([\s\S]*?)\n---/.exec(content.replaceAll("\r\n", "\n"));
	if (!fm) return { verifiedRev: "", sources: [] };

	const rev = /^verified_rev:\s*"?([^"\n]+)"?\s*$/m.exec(fm[1]);
	const src = /^sources:\s*\[([^\]]*)\]/m.exec(fm[1]);

	return {
		verifiedRev: rev?.[1]?.trim() ?? "",
		sources: src
			? [...src[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
			: [],
	};
}

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

// -----------------------------------------------------------------------------
// Punto de entrada ejecutable — recorre las páginas reales de
// `docs-site/src/content/docs/`, extrae `sources`/`verified_rev` de cada
// frontmatter (vía `parsePage`, sin fs propia más allá de leer el fichero) y
// produce un informe legible. Separado de `detectDrift` para que ese siga
// siendo puro/inyectable en tests.
// -----------------------------------------------------------------------------

function listMarkdownFilesRec(dir: string): string[] {
	const result: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) result.push(...listMarkdownFilesRec(full));
		else if (entry.isFile() && entry.name.endsWith(".md")) result.push(full);
	}
	return result;
}

export function collectDriftPageInputs(
	repoRoot: string,
	docsDir = "docs-site/src/content/docs",
): DriftPageInput[] {
	const absoluteDocsDir = join(repoRoot, docsDir);
	const files = listMarkdownFilesRec(absoluteDocsDir);

	return files
		.map((absPath) => {
			const relToRepo = relative(repoRoot, absPath).split(sep).join("/");
			const { verifiedRev, sources } = readProvenance(readFileSync(absPath, "utf8"));
			return { path: relToRepo, verifiedRev, sources };
		})
		.sort((a, b) => a.path.localeCompare(b.path));
}

// Informe legible para consola: agrupa por estado, siempre marca los `unknown`
// (y su razón) de forma explícita — un rev que no se encuentra es ausencia de
// información, nunca se presenta como "sin drift".
export function formatDriftReport(report: DriftReport): string {
	const lines: string[] = [];
	lines.push(
		`Drift de fuentes de docs-site: ${report.counts.clean} clean, ${report.counts.drifted} drifted, ${report.counts.unknown} unknown (de ${report.pages.length} páginas).`,
	);

	const unknown = report.pages.filter((p) => p.status === "unknown");
	const drifted = report.pages.filter((p) => p.status === "drifted");

	if (unknown.length > 0) {
		lines.push("");
		lines.push("UNKNOWN (no se pudo verificar — no es 'sin drift'):");
		for (const p of unknown) {
			lines.push(`  - ${p.path} (verified_rev=${p.verifiedRev}) — ${p.reason}${p.detail ? `: ${p.detail}` : ""}`);
		}
	}

	if (drifted.length > 0) {
		lines.push("");
		lines.push("DRIFTED (fuentes cambiaron desde verified_rev):");
		for (const p of drifted) {
			lines.push(`  - ${p.path} (verified_rev=${p.verifiedRev}):`);
			for (const src of p.sourcesChanged) {
				lines.push(`      ${src.status} ${src.path} (+${src.linesAdded}/-${src.linesRemoved})`);
			}
		}
	}

	if (unknown.length === 0 && drifted.length === 0) {
		lines.push("Todas las páginas están clean respecto a su verified_rev.");
	}

	return lines.join("\n");
}

// Código de salida: distingue "hay algo que revisar" (drift o rev-not-found,
// informativo, el paso de CI sigue con continue-on-error) de "el detector no
// pudo ejecutarse" (not-a-repo/git-error, un fallo real de la herramienta).
// 0 = todo clean. 1 = error de ejecución real. 2 = drift o rev stale a revisar.
export function driftExitCode(report: DriftReport): number {
	const hasExecutionError = report.pages.some((p) => p.reason === "not-a-repo" || p.reason === "git-error");
	if (hasExecutionError) return 1;
	if (report.counts.drifted > 0 || report.counts.unknown > 0) return 2;
	return 0;
}

// Una fuente declarada que no existe no produce drift (git no ve cambios en algo
// que no está), así que sin esta comprobación una ruta mal escrita pasaría
// desapercibida y la página parecería trazable sin serlo.
export function findMissingSources(
	pages: DriftPageInput[],
	repoRoot: string,
): { path: string; missing: string[] }[] {
	return pages
		.map((p) => ({
			path: p.path,
			missing: p.sources.filter((s) => !existsSync(join(repoRoot, s))),
		}))
		.filter((r) => r.missing.length > 0);
}

if (import.meta.main) {
	const repoRoot = process.cwd();
	const pages = collectDriftPageInputs(repoRoot);
	const report = detectDrift(pages, repoRoot);
	console.log(formatDriftReport(report));

	const broken = findMissingSources(pages, repoRoot);
	if (broken.length > 0) {
		console.log("");
		console.log("FUENTES DECLARADAS QUE NO EXISTEN:");
		for (const b of broken) console.log(`  - ${b.path}: ${b.missing.join(", ")}`);
	}

	process.exitCode = broken.length > 0 ? 2 : driftExitCode(report);
}
