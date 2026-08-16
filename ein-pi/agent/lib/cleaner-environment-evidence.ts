import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";

import { projectProjectState } from "./project-state.ts";

export const CLEANER_ENVIRONMENT_VERSION = "cleaner-environment-evidence/v1" as const;
export type EvidenceStatus = "available" | "unavailable" | "unsupported" | "invalid";
export type EvidenceFreshness = "current" | "stale" | "unavailable";
export type EvidenceReason = "detected" | "signal-absent" | "scan-truncated" | "invalid-package-json" | "unsafe-command" | "planned";
export type EvidenceCommand = Readonly<{ argv: readonly [string, ...string[]]; provenance: string }>;
export type EvidenceCapability = Readonly<{
	kind: "bun-junit" | "vitest-json" | "vitest-junit" | "bun-lcov" | "vitest-lcov" | "complexity-js-ts" | "complexity-vue" | "complexity-astro" | "duplication";
	status: EvidenceStatus;
	freshness: EvidenceFreshness;
	reason: EvidenceReason;
	provenance: readonly string[];
}>;
export type CleanerEnvironmentEvidence = Readonly<{
	version: typeof CLEANER_ENVIRONMENT_VERSION;
	collectorKind: "environment-capabilities";
	sourceState: Readonly<{ kind: "git-state"; stateRef: string; freshness: "current" }>;
	scope: Readonly<{ root: string; selectors: readonly [Readonly<{ kind: "bounded-project-root"; path: "." }>]; files: readonly Readonly<{ path: string; sha256: string }>[]; truncated: boolean }>;
	budget: Readonly<{ maxFiles: number; maxBytes: number; maxDirectories: number; maxDurationMs: number; maxExactFiles: number; maxExactBytes: number; observedFiles: number; observedBytes: number; observedDirectories: number; observedExactFiles: number; observedExactBytes: number; observedScripts: number; scriptsTruncated: boolean }>;
	languages: readonly string[];
	frameworks: Readonly<{ vue: readonly string[]; astro: readonly string[] }>;
	tools: Readonly<{
		packageManager: Readonly<{ name: "bun" | "npm" | "pnpm" | "yarn" | "unknown"; provenance: readonly string[] }>;
		bun: Readonly<{ status: EvidenceStatus; observedVersion: string | null; provenance: readonly string[] }>;
		vitest: Readonly<{ status: EvidenceStatus; observedVersion: null; provenance: readonly string[] }>;
	}>;
	scripts: readonly Readonly<{ name: string; command?: EvidenceCommand; reason?: "unsafe-command" }> [];
	capabilities: readonly EvidenceCapability[];
	outputIdentity: Readonly<{ algorithm: "sha256"; digest: string }>;
}>;

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx", ".vue", ".astro"]);
const PLAIN_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx"]);
const EXCLUDED = new Set([".atl", ".git", ".pi", "build", "coverage", "dist", "generated", "node_modules", "runtime", "vendor"]);
const CONFIG_RE = /^(?:astro|vitest)\.config\.(?:js|mjs|cjs|ts|mts|cts)$/;
const SAFE_TOKEN = /^[A-Za-z0-9_@./:=,+%~-]+$/;
type EvidenceBudget = { maxFiles: number; maxBytes: number; maxDirectories: number; maxDurationMs: number };
const DEFAULT_BUDGET: Readonly<EvidenceBudget> = Object.freeze({ maxFiles: 256, maxBytes: 1024 * 1024, maxDirectories: 128, maxDurationMs: 250 });
const MAX_EXACT_FILES = 32;
const MAX_EXACT_BYTES = 128 * 1024;

type PackageData = { valid: boolean; packageManager?: string; scripts: Readonly<Record<string, string>>; dependencies: Readonly<Record<string, string>> };
type Scan = { files: { path: string; sha256: string }[]; names: Set<string>; extensions: Set<string>; filesSeen: number; bytes: number; directories: number; truncated: boolean };

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function strings(value: unknown): Record<string, string> | undefined {
	if (value === undefined) return {};
	if (!record(value) || Object.values(value).some((item) => typeof item !== "string")) return undefined;
	return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en"))) as Record<string, string>;
}
function packageData(root: string, maxBytes: number): PackageData {
	try {
		const path = join(root, "package.json");
		if (lstatSync(path).size > maxBytes) throw new Error();
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!record(parsed) || (parsed.packageManager !== undefined && typeof parsed.packageManager !== "string")) throw new Error();
		const scripts = strings(parsed.scripts); const dependencies = strings(parsed.dependencies); const devDependencies = strings(parsed.devDependencies);
		if (!scripts || !dependencies || !devDependencies) throw new Error();
		return { valid: true, ...(parsed.packageManager ? { packageManager: parsed.packageManager } : {}), scripts, dependencies: { ...dependencies, ...devDependencies } };
	} catch { return { valid: false, scripts: {}, dependencies: {} }; }
}
function tokenize(command: string): readonly [string, ...string[]] | undefined {
	const argv = command.trim().split(/\s+/).filter(Boolean);
	return argv.length && argv.every((token) => SAFE_TOKEN.test(token)) ? argv as [string, ...string[]] : undefined;
}
function runner(argv: readonly string[]): "bun" | "vitest" | undefined {
	if (argv[0] === "bun" && argv[1] === "test") return "bun";
	if (argv[0] === "vitest" || (["bunx", "npx"].includes(argv[0] ?? "") && argv[1] === "vitest") || (argv[0] === "pnpm" && argv[1] === "exec" && argv[2] === "vitest")) return "vitest";
}
function scan(root: string, limits: Readonly<EvidenceBudget>): Scan {
	const out: Scan = { files: [], names: new Set(), extensions: new Set(), filesSeen: 0, bytes: 0, directories: 0, truncated: false };
	const visit = (relative: string): void => {
		if (out.truncated) return;
		out.directories += 1;
		if (out.directories > limits.maxDirectories) { out.truncated = true; return; }
		for (const entry of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
			if (EXCLUDED.has(entry.name.toLowerCase()) || entry.isSymbolicLink()) continue;
			const path = relative ? `${relative}/${entry.name}` : entry.name;
			if (entry.isDirectory()) { visit(path); if (out.truncated) return; continue; }
			if (!entry.isFile()) continue;
			out.filesSeen += 1;
			if (out.filesSeen > limits.maxFiles) { out.truncated = true; return; }
			out.names.add(path); const extension = extname(path).toLowerCase();
			if (!SOURCE_EXTENSIONS.has(extension) && !CONFIG_RE.test(entry.name) && !["package.json", "bun.lock", "bun.lockb", "bunfig.toml", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(entry.name)) continue;
			const bytes = readFileSync(join(root, path));
			if (out.bytes + bytes.byteLength > limits.maxBytes) { out.truncated = true; return; }
			out.bytes += bytes.byteLength;
			if (SOURCE_EXTENSIONS.has(extension)) { out.extensions.add(extension); out.files.push({ path, sha256: createHash("sha256").update(bytes).digest("hex") }); }
		}
	};
	visit(""); return out;
}
function capability(kind: EvidenceCapability["kind"], yes: boolean, provenance: string[], truncated: boolean): EvidenceCapability {
	return Object.freeze({ kind, status: yes ? "available" : "unavailable", freshness: yes ? "current" : "unavailable", reason: yes ? "detected" : truncated ? "scan-truncated" : "signal-absent", provenance: Object.freeze(provenance) });
}
function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
	return value;
}

function includeExact(root: string, found: Scan, paths: readonly string[]): Readonly<{ files: number; bytes: number }> {
	if (paths.length > MAX_EXACT_FILES || new Set(paths).size !== paths.length) throw new Error("Cleaner environment exact scope is duplicate or over budget"); let bytes = 0; const known = new Set(found.files.map((file) => file.path));
	for (const path of [...paths].sort((a, b) => a.localeCompare(b, "en"))) { if (!path || isAbsolute(path) || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === ".." || EXCLUDED.has(part.toLowerCase())) || !SOURCE_EXTENSIONS.has(extname(path).toLowerCase())) throw new Error("Cleaner environment exact scope contains an unsafe or unsupported path"); const target = resolve(root, path); let content: Buffer; try { if (lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error(); content = readFileSync(target); } catch { throw new Error("Cleaner environment exact scope is unavailable"); } bytes += content.byteLength; if (bytes > MAX_EXACT_BYTES) throw new Error("Cleaner environment exact scope exceeds byte budget"); if (!known.has(path)) { found.files.push({ path, sha256: createHash("sha256").update(content).digest("hex") }); known.add(path); } found.extensions.add(extname(path).toLowerCase()); }
	found.files.sort((a, b) => a.path.localeCompare(b.path, "en"));
	return { files: paths.length, bytes };
}

export function collectCleanerEnvironmentEvidence(cwd: string, budget: Partial<EvidenceBudget> = {}, exactPaths: readonly string[] = []): CleanerEnvironmentEvidence {
	const limits = { ...DEFAULT_BUDGET, ...budget };
	if (Object.values(limits).some((value) => !Number.isInteger(value) || value < 1)) throw new Error("Cleaner environment budget must contain positive integers");
	const state = projectProjectState({ cwd });
	if (state.git.repository !== true || !state.git.root) throw new Error("Cleaner environment repository root unavailable");
	if (!state.git.complete || state.git.quality !== "current" || !state.git.stateRef) throw new Error("Cleaner environment repository state unavailable");
	const root = state.git.root; const found = scan(root, limits); const exact = includeExact(root, found, exactPaths); const pkg = packageData(root, limits.maxBytes);
	const scripts = Object.entries(pkg.scripts).slice(0, 32).map(([name, value]) => { const argv = tokenize(value); return argv ? { name, command: { argv, provenance: `package.json#scripts.${name}` } } : { name, reason: "unsafe-command" as const }; });
	const runners = scripts.flatMap(({ command }) => command ? [runner(command.argv)] : []).filter((value): value is "bun" | "vitest" => !!value);
	const bunSignals = [found.names.has("bun.lock") ? "bun.lock" : "", found.names.has("bun.lockb") ? "bun.lockb" : "", found.names.has("bunfig.toml") ? "bunfig.toml" : "", pkg.packageManager?.startsWith("bun@") ? "package.json#packageManager" : "", runners.includes("bun") ? "package.json#scripts" : "", typeof Bun !== "undefined" ? "current-executable" : ""].filter(Boolean);
	const vitestSignals = [pkg.dependencies.vitest ? "package.json#dependencies.vitest" : "", [...found.names].some((name) => /(^|\/)vitest\.config\./.test(name)) ? "vitest.config.*" : "", runners.includes("vitest") ? "package.json#scripts" : ""].filter(Boolean);
	const vueSignals = [[...found.extensions].includes(".vue") ? "*.vue" : "", pkg.dependencies.vue ? "package.json#dependencies.vue" : ""].filter(Boolean);
	const astroSignals = [[...found.extensions].includes(".astro") ? "*.astro" : "", pkg.dependencies.astro ? "package.json#dependencies.astro" : "", [...found.names].some((name) => /(^|\/)astro\.config\./.test(name)) ? "astro.config.*" : ""].filter(Boolean);
	const lockManager = found.names.has("bun.lock") || found.names.has("bun.lockb") ? "bun" : found.names.has("pnpm-lock.yaml") ? "pnpm" : found.names.has("yarn.lock") ? "yarn" : found.names.has("package-lock.json") ? "npm" : "unknown";
	const declaredManager = pkg.packageManager?.split("@")[0]; const packageManager = (["bun", "npm", "pnpm", "yarn"].includes(declaredManager ?? "") ? declaredManager : lockManager) as "bun" | "npm" | "pnpm" | "yarn" | "unknown";
	const plain = [...found.extensions].some((extension) => PLAIN_EXTENSIONS.has(extension));
	const capabilities = [capability("bun-junit", !!bunSignals.length, bunSignals, found.truncated), capability("vitest-json", !!vitestSignals.length, vitestSignals, found.truncated), capability("vitest-junit", !!vitestSignals.length, vitestSignals, found.truncated), capability("bun-lcov", !!bunSignals.length, bunSignals, found.truncated), capability("vitest-lcov", !!vitestSignals.length, vitestSignals, found.truncated), capability("complexity-js-ts", plain, [...found.extensions].filter((item) => PLAIN_EXTENSIONS.has(item)), found.truncated), capability("complexity-vue", vueSignals.includes("*.vue"), vueSignals, found.truncated), capability("complexity-astro", astroSignals.includes("*.astro"), astroSignals, found.truncated), capability("duplication", plain || vueSignals.includes("*.vue") || astroSignals.includes("*.astro"), [...found.extensions].filter((item) => SOURCE_EXTENSIONS.has(item)), found.truncated)] as const;
	const current = projectProjectState({ cwd: root });
	if (current.git.quality !== "current" || current.git.stateRef !== state.git.stateRef) throw new Error("Cleaner environment repository state changed during collection");
	const base = { version: CLEANER_ENVIRONMENT_VERSION, collectorKind: "environment-capabilities" as const, sourceState: { kind: "git-state" as const, stateRef: state.git.stateRef, freshness: "current" as const }, scope: { root, selectors: [{ kind: "bounded-project-root" as const, path: "." as const }] as const, files: found.files, truncated: found.truncated }, budget: { ...limits, maxExactFiles: MAX_EXACT_FILES, maxExactBytes: MAX_EXACT_BYTES, observedFiles: found.filesSeen, observedBytes: found.bytes, observedDirectories: found.directories, observedExactFiles: exact.files, observedExactBytes: exact.bytes, observedScripts: Object.keys(pkg.scripts).length, scriptsTruncated: Object.keys(pkg.scripts).length > 32 }, languages: [...found.extensions].filter((item) => PLAIN_EXTENSIONS.has(item)).sort(), frameworks: { vue: vueSignals, astro: astroSignals }, tools: { packageManager: { name: packageManager, provenance: packageManager === "unknown" ? [] : [declaredManager ? "package.json#packageManager" : `${packageManager}-lock`] }, bun: { status: bunSignals.length ? "available" as const : pkg.valid ? "unavailable" as const : "invalid" as const, observedVersion: typeof Bun !== "undefined" ? Bun.version : null, provenance: bunSignals }, vitest: { status: vitestSignals.length ? "available" as const : pkg.valid ? "unavailable" as const : "invalid" as const, observedVersion: null, provenance: vitestSignals } }, scripts, capabilities };
	const digest = createHash("sha256").update(JSON.stringify(base)).digest("hex");
	return deepFreeze({ ...base, outputIdentity: { algorithm: "sha256", digest } }) as CleanerEnvironmentEvidence;
}
