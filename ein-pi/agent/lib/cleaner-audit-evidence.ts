import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { projectProjectState } from "./project-state.ts";
import { canonicalArea, type AreaSelector } from "./reviewed-area-ledger.ts";

export const CLEANER_EVIDENCE_VERSION = "cleaner-audit-evidence/v1" as const;
export const CLEANER_AUDIT_LIMITS = Object.freeze({ maxFiles: 32, maxSourceBytes: 128 * 1024 } as const);
const SOURCE_EXTENSIONS = new Set([
	".astro", ".bash", ".c", ".cc", ".cjs", ".cpp", ".css", ".cts", ".cxx", ".fish", ".go", ".h", ".hpp", ".html", ".java", ".js", ".json", ".jsonc", ".jsx", ".md", ".mjs", ".mts", ".php", ".py", ".rs", ".scss", ".sh", ".svelte", ".toml", ".ts", ".tsx", ".vue", ".yaml", ".yml", ".zsh",
]);
const SOURCE_FILENAMES = new Set(["Dockerfile", "Makefile"]);
const EXCLUDED_SEGMENTS = new Set([".atl", ".git", ".pi", "build", "coverage", "dist", "generated", "node_modules", "runtime", "vendor"]);

export type CleanerAuditScope =
	| Readonly<{ kind: "selectors"; selectors: readonly AreaSelector[] }>
	| Readonly<{ kind: "changed-files" }>;

export type CleanerAuditEvidence = Readonly<{
	version: typeof CLEANER_EVIDENCE_VERSION;
	mode: "read-only";
	scope: Readonly<{ areaId: string; selectors: readonly AreaSelector[] }>;
	sourceIdentity: Readonly<{ kind: "git-state"; stateRef: string; freshness: "current" }>;
	repository: Readonly<{ root: string; branch: string; dirty: boolean; scopedFiles: number; sourceBytes: number }>;
	files: readonly Readonly<{ path: string; bytes: number; lines: number; sha256: string; source: string }>[];
	measuredEvidence: Readonly<{ tooling: readonly string[]; changedFilesInScope: readonly string[] }>;
	missingEvidence: readonly Readonly<{ kind: "test-results" | "coverage" | "crap"; reason: string }>[];
	semanticInspection: readonly ["naming", "responsibility", "coupling", "dead-code", "readability", "semantic-duplication"];
	constraints: readonly ["do-not-recompute-measured-facts", "report-judgments-separately", "no-source-writes"];
}>;

export class CleanerAuditScopeError extends Error {
	constructor(readonly code: string) {
		super(`Cleaner audit scope rejected: ${code}`);
		this.name = "CleanerAuditScopeError";
	}
}

function exactKeys(value: object, keys: readonly string[]): boolean {
	const actual = Object.keys(value).sort();
	return actual.length === keys.length && [...keys].sort().every((key, index) => actual[index] === key);
}

function excluded(path: string): boolean {
	return path.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment.toLowerCase()));
}

const supportedSource = (path: string): boolean => SOURCE_EXTENSIONS.has(extname(path).toLowerCase()) || SOURCE_FILENAMES.has(basename(path));

function readRegularSource(root: string, path: string): Buffer {
	const target = join(root, path);
	let descriptor: number | undefined;
	try {
		const initial = lstatSync(target);
		if (initial.isSymbolicLink()) throw new CleanerAuditScopeError("symlink-not-supported");
		if (!initial.isFile()) throw new CleanerAuditScopeError("path-not-found");
		descriptor = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
		const opened = fstatSync(descriptor);
		const current = lstatSync(target);
		if (!opened.isFile() || !current.isFile() || current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino || realpathSync(target) !== target) {
			throw new CleanerAuditScopeError("symlink-not-supported");
		}
		return readFileSync(descriptor);
	} catch (error) {
		if (error instanceof CleanerAuditScopeError) throw error;
		throw new CleanerAuditScopeError("path-not-found");
	} finally {
		if (descriptor !== undefined) closeSync(descriptor);
	}
}

function collectTree(root: string, relativePath: string, paths: string[]): void {
	for (const entry of readdirSync(join(root, relativePath), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
		const path = `${relativePath}/${entry.name}`;
		if (excluded(path) || entry.isSymbolicLink()) continue;
		if (entry.isDirectory()) collectTree(root, path, paths);
		else if (entry.isFile() && supportedSource(path)) paths.push(path);
		if (paths.length > CLEANER_AUDIT_LIMITS.maxFiles) throw new CleanerAuditScopeError("scope-exceeds-32-source-files");
	}
}

function resolveSelectors(root: string, selectors: readonly AreaSelector[]): string[] {
	const canonicalRoot = realpathSync(root);
	const paths: string[] = [];
	for (const selector of selectors) {
		if (excluded(selector.path)) throw new CleanerAuditScopeError("restricted-path");
		let stat: ReturnType<typeof lstatSync>;
		const target = join(canonicalRoot, selector.path);
		try { stat = lstatSync(target); } catch { throw new CleanerAuditScopeError("path-not-found"); }
		if (stat.isSymbolicLink()) throw new CleanerAuditScopeError("symlink-not-supported");
		try { if (realpathSync(target) !== target) throw new CleanerAuditScopeError("symlink-not-supported"); } catch (error) {
			if (error instanceof CleanerAuditScopeError) throw error;
			throw new CleanerAuditScopeError("path-not-found");
		}
		if (selector.kind === "file") {
			if (!stat.isFile()) throw new CleanerAuditScopeError("file-selector-not-file");
			if (supportedSource(selector.path)) paths.push(selector.path);
		} else {
			if (!stat.isDirectory()) throw new CleanerAuditScopeError("tree-selector-not-directory");
			collectTree(canonicalRoot, selector.path, paths);
		}
	}
	return [...new Set(paths)].sort((a, b) => a.localeCompare(b, "en"));
}

function tooling(root: string): string[] {
	try {
		const parsed: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return ["package.json:invalid"];
		const scripts = (parsed as { scripts?: unknown }).scripts;
		if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return [];
		return Object.keys(scripts).filter((name) => ["test", "coverage", "test:coverage", "lint", "typecheck"].includes(name)).sort().map((name) => `package-script:${name}`);
	} catch { return []; }
}

export function collectCleanerAuditEvidence(cwd: string, requested: CleanerAuditScope): CleanerAuditEvidence {
	if (!requested || typeof requested !== "object" || Array.isArray(requested)) throw new CleanerAuditScopeError("malformed-scope");
	if (requested.kind === "changed-files") {
		if (!exactKeys(requested, ["kind"])) throw new CleanerAuditScopeError("malformed-scope");
	} else if (requested.kind !== "selectors" || !exactKeys(requested, ["kind", "selectors"]) || !Array.isArray(requested.selectors)) {
		throw new CleanerAuditScopeError("malformed-scope");
	}
	const state = projectProjectState({ cwd });
	if (state.git.repository !== true || !state.git.root) throw new CleanerAuditScopeError("repository-root-unavailable");
	if (!state.git.complete || state.git.quality !== "current" || !state.git.stateRef) throw new CleanerAuditScopeError("repository-state-incomplete");
	const root = state.git.root;
	let selectors: readonly AreaSelector[];
	if (requested.kind === "changed-files") {
		const changed = state.git.changes.flatMap((change) => [change.path, ...(change.previousPath ? [change.previousPath] : [])]);
		const existing = [...new Set(changed)].filter((path) => {
			try { return !excluded(path) && lstatSync(join(root, path)).isFile(); } catch { return false; }
		}).sort();
		if (existing.length === 0) throw new CleanerAuditScopeError("changed-file-set-empty");
		selectors = existing.map((path) => ({ kind: "file" as const, path }));
	} else {
		try { selectors = canonicalArea(requested.selectors).selectors; } catch { throw new CleanerAuditScopeError("invalid-or-unbounded-selectors"); }
	}
	const area = canonicalArea(selectors);
	const canonicalRoot = realpathSync(root);
	const paths = resolveSelectors(canonicalRoot, area.selectors);
	if (paths.length > CLEANER_AUDIT_LIMITS.maxFiles) throw new CleanerAuditScopeError("scope-exceeds-32-source-files");
	if (paths.length === 0) throw new CleanerAuditScopeError("scope-has-no-supported-source");
	let sourceBytes = 0;
	const files = paths.map((path) => {
		const bytes = readRegularSource(canonicalRoot, path);
		sourceBytes += bytes.byteLength;
		if (sourceBytes > CLEANER_AUDIT_LIMITS.maxSourceBytes) throw new CleanerAuditScopeError("scope-exceeds-128-kib-source");
		let source: string;
		try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new CleanerAuditScopeError("non-utf8-source"); }
		return Object.freeze({ path, bytes: bytes.byteLength, lines: source === "" ? 0 : source.split(/\r\n|\r|\n/).length, sha256: createHash("sha256").update(bytes).digest("hex"), source });
	});
	const changedFilesInScope = state.git.changes.map((change) => change.path).filter((path) => paths.includes(path)).sort();
	return Object.freeze({
		version: CLEANER_EVIDENCE_VERSION,
		mode: "read-only",
		scope: Object.freeze({ areaId: area.id, selectors: area.selectors }),
		sourceIdentity: Object.freeze({ kind: "git-state", stateRef: state.git.stateRef, freshness: "current" }),
		repository: Object.freeze({ root, branch: state.git.branch ?? "unknown", dirty: state.git.dirty === true, scopedFiles: files.length, sourceBytes }),
		files: Object.freeze(files),
		measuredEvidence: Object.freeze({ tooling: Object.freeze(tooling(root)), changedFilesInScope: Object.freeze(changedFilesInScope) }),
		missingEvidence: Object.freeze([
			{ kind: "test-results", reason: "No authorized audit-time test execution or fresh bounded result contract." },
			{ kind: "coverage", reason: "No fresh source-bound coverage contract available." },
			{ kind: "crap", reason: "No fresh bound test and coverage evidence has been ingested for CRAP." },
		] as const),
		semanticInspection: Object.freeze(["naming", "responsibility", "coupling", "dead-code", "readability", "semantic-duplication"] as const),
		constraints: Object.freeze(["do-not-recompute-measured-facts", "report-judgments-separately", "no-source-writes"] as const),
	});
}
