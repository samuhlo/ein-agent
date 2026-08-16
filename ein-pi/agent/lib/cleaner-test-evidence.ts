import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { CleanerEnvironmentEvidence } from "./cleaner-environment-evidence.ts";
import { projectProjectState } from "./project-state.ts";

export const CLEANER_TEST_EVIDENCE_VERSION = "cleaner-test-evidence/v1" as const;
type Runner = "bun" | "vitest";
type Format = "junit" | "json";
type Limits = { maxArtifactBytes: number; maxTests: number; maxFailures: number; maxMessageChars: number; maxDurationMs: number };
const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({ maxArtifactBytes: 1024 * 1024, maxTests: 10_000, maxFailures: 32, maxMessageChars: 500, maxDurationMs: 300_000 });
type Scope = Readonly<{ files: readonly string[]; selectors?: readonly string[] }>;
export type CleanerTestPlan = Readonly<{
	status: "available" | "unavailable"; reason: "planned" | "capability-unavailable" | "vitest-executable-unproven";
	runner: Runner; format: Format; argv?: readonly [string, ...string[]]; outputPath?: string;
	sourceState: CleanerEnvironmentEvidence["sourceState"]; invocationIdentity?: Readonly<{ algorithm: "sha256"; digest: string }>;
}>;
export type CleanerTestBinding = Readonly<{ preStateRef: string; postStateRef: string; exitCode?: number; signal?: string }>;
type Failure = Readonly<{ path: string; name: string; message: string }>;
type Result = Readonly<{ suites: number; tests: number; passed: number; failed: number; skipped: number; failures: readonly Failure[]; failuresTruncated: boolean; durationMs: number | null }>;
export type CleanerTestEvidence = Readonly<{
	version: typeof CLEANER_TEST_EVIDENCE_VERSION; collectorKind: "test-results"; status: "available" | "unavailable"; freshness: "current" | "stale" | "unavailable";
	reason: "collected" | "invocation-unbound" | "source-state-changed"; runner: Runner; format: Format; argv: readonly [string, ...string[]];
	exitOutcome: Readonly<{ exitCode?: number; signal?: string }> | null; result: Result | null; artifactIdentity: Readonly<{ algorithm: "sha256"; digest: string }> | null;
	sourceState: Readonly<{ kind: "git-state"; stateRef: string; freshness: "current" | "stale" | "unavailable" }>;
	invocationIdentity: Readonly<{ algorithm: "sha256"; digest: string }>; outputIdentity: Readonly<{ algorithm: "sha256"; digest: string }>;
	budget: Readonly<Limits & { observedArtifactBytes: number; observedTests: number; observedFailures: number; durationExceeded: boolean }>;
}>;

function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
function safeRelative(path: string): boolean { return !!path && !isAbsolute(path) && !path.includes("\\") && !path.split("/").includes("..") && !/[\u0000-\u001f\u007f]/.test(path); }
function inside(root: string, path: string): boolean { const rel = relative(root, path); return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel); }
function outputPath(root: string, path: string, approved: readonly string[]): string {
	const absolute = resolve(path); const canonicalRoot = realpathSync(root); const canonicalOutput = resolve(realpathSync(dirname(absolute)), absolute.split(sep).at(-1)!); if (!inside(canonicalRoot, canonicalOutput) || approved.map((item) => resolve(item)).includes(absolute)) return absolute;
	throw new Error("Cleaner test output path must be repository-external or explicitly approved");
}
function scopeArgs(root: string, scope: Scope, runner: Runner): string[] {
	if (!scope.files.length || scope.files.length > 32 || (scope.selectors?.length ?? 0) > 8) throw new Error("Cleaner test scope exceeds bounds");
	const files = [...new Set(scope.files)].sort();
	for (const file of files) { if (!safeRelative(file)) throw new Error("Cleaner test scope contains an unsafe path"); const target = resolve(root, file); if (!inside(root, target) || !lstatSync(target).isFile() || realpathSync(target) !== target) throw new Error("Cleaner test scope must contain exact regular files"); }
	const selectors = [...new Set(scope.selectors ?? [])].sort();
	if (selectors.some((item) => !item || item.length > 120 || /[\u0000-\u001f\u007f]/.test(item))) throw new Error("Cleaner test selector is invalid");
	return selectors.length ? [...files, runner === "bun" ? "--test-name-pattern" : "-t", `^(?:${selectors.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`] : files;
}
function hasCapability(environment: CleanerEnvironmentEvidence, kind: "bun-junit" | "vitest-json"): boolean { return environment.capabilities.some((item) => item.kind === kind && item.status === "available" && item.freshness === "current"); }

export function planCleanerTestEvidence(environment: CleanerEnvironmentEvidence, input: Readonly<{ runner: Runner; format: Format; scope: Scope; outputPath: string; approvedEvidencePaths?: readonly string[] }>): CleanerTestPlan {
	const sourceState = environment.sourceState; const unavailable = (reason: CleanerTestPlan["reason"]): CleanerTestPlan => freeze({ status: "unavailable", reason, runner: input.runner, format: input.format, sourceState });
	if ((input.runner === "bun" && input.format !== "junit") || (input.runner === "vitest" && input.format !== "json")) return unavailable("capability-unavailable");
	const kind = input.runner === "bun" ? "bun-junit" : "vitest-json"; if (!hasCapability(environment, kind)) return unavailable("capability-unavailable");
	const root = environment.scope.root; const out = outputPath(root, input.outputPath, input.approvedEvidencePaths ?? []); const scoped = scopeArgs(root, input.scope, input.runner);
	let executable = "bun";
	if (input.runner === "bun" && !environment.tools.bun.provenance.includes("current-executable")) return unavailable("capability-unavailable");
	if (input.runner === "vitest") {
		try { const candidate = resolve(root, "node_modules/.bin/vitest"); const resolved = realpathSync(candidate); if (!inside(resolve(root, "node_modules"), resolved) || !lstatSync(resolved).isFile() || !environment.tools.vitest.provenance.includes("package.json#dependencies.vitest")) throw new Error(); executable = candidate; }
		catch { return unavailable("vitest-executable-unproven"); }
	}
	const argv = input.runner === "bun" ? [executable, "test", ...scoped, "--reporter=junit", `--reporter-outfile=${out}`] : [executable, "run", ...scoped, "--reporter=json", `--outputFile=${out}`];
	const base = { runner: input.runner, format: input.format, argv, outputPath: out, sourceStateRef: sourceState.stateRef };
	return freeze({ status: "available", reason: "planned", runner: input.runner, format: input.format, argv: argv as [string, ...string[]], outputPath: out, sourceState, invocationIdentity: { algorithm: "sha256", digest: hash(base) } });
}

export function extendCleanerTestPlanInvocation(plan: CleanerTestPlan, suffix: readonly string[]): CleanerTestPlan {
	if (plan.status !== "available" || !plan.argv || !plan.outputPath || !suffix.length || suffix.some((item) => !item || /[\u0000-\u001f\u007f]/.test(item))) throw new Error("Cleaner test invocation cannot be extended");
	const argv = [...plan.argv, ...suffix] as [string, ...string[]];
	const base = { runner: plan.runner, format: plan.format, argv, outputPath: plan.outputPath, sourceStateRef: plan.sourceState.stateRef };
	return freeze({ ...plan, argv, invocationIdentity: { algorithm: "sha256", digest: hash(base) } });
}

function text(value: unknown, label: string): string { if (typeof value !== "string" || !value || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`Invalid ${label}`); return value; }
function path(value: unknown): string { const result = text(value, "test path"); if (!safeRelative(result)) throw new Error("Unsafe test source path"); return result; }
function duration(value: unknown): number | null { if (value === undefined || value === null) return null; const result = Number(value); if (!Number.isFinite(result) || result < 0) throw new Error("Invalid test duration"); return result; }
function message(value: unknown, limit: number): string { if (typeof value !== "string") throw new Error("Invalid failure message"); const clean = value.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, ""); if (!clean.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) throw new Error("Invalid failure message"); return clean.replace(/\s+/g, " ").trim().slice(0, limit); }
function integer(record: Record<string, unknown>, key: string): number { const value = record[key]; if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`Invalid ${key}`); return value as number; }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed test artifact"); return value as Record<string, unknown>; }
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void { if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("Unsupported test artifact schema"); }

function vitestJson(source: string, limits: Limits): Result {
	const root = object(JSON.parse(source)); exactKeys(root, ["numTotalTestSuites", "numPassedTestSuites", "numFailedTestSuites", "numPendingTestSuites", "numTotalTests", "numPassedTests", "numFailedTests", "numPendingTests", "numTodoTests", "snapshot", "startTime", "success", "testResults", "coverageMap"]);
	const suites = integer(root, "numTotalTestSuites"), suitePass = integer(root, "numPassedTestSuites"), suiteFail = integer(root, "numFailedTestSuites"), suiteSkip = integer(root, "numPendingTestSuites");
	const tests = integer(root, "numTotalTests"), passed = integer(root, "numPassedTests"), failed = integer(root, "numFailedTests"), pending = integer(root, "numPendingTests"), todo = integer(root, "numTodoTests");
	if (suites !== suitePass + suiteFail + suiteSkip || tests !== passed + failed + pending + todo || tests > limits.maxTests || typeof root.success !== "boolean" || root.success !== (failed === 0 && suiteFail === 0)) throw new Error("Conflicting Vitest counts");
	if (!Array.isArray(root.testResults)) throw new Error("Malformed Vitest results"); const failures: Failure[] = []; let seen = 0; let totalDuration = 0; let reliable = true;
	for (const rawFile of root.testResults) { const file = object(rawFile); exactKeys(file, ["assertionResults", "startTime", "endTime", "status", "message", "name"]); const filePath = path(file.name); if (!Array.isArray(file.assertionResults) || !["passed", "failed"].includes(String(file.status))) throw new Error("Unsupported Vitest file result");
		for (const rawTest of file.assertionResults) { const test = object(rawTest); exactKeys(test, ["ancestorTitles", "fullName", "status", "title", "duration", "failureMessages", "location", "meta", "tags", "benchmarks"]); const status = text(test.status, "test status"); if (!["passed", "failed", "skipped", "pending", "todo", "disabled"].includes(status)) throw new Error("Unsupported Vitest test status"); seen += 1; const ms = duration(test.duration); if (ms === null) reliable = false; else totalDuration += ms;
			if (!Array.isArray(test.failureMessages) || test.failureMessages.some((item) => typeof item !== "string")) throw new Error("Malformed Vitest failure"); if (status === "failed" && !test.failureMessages.length) throw new Error("Failed Vitest test lacks a message");
			if (status === "failed" && failures.length < limits.maxFailures) failures.push({ path: filePath, name: text(test.fullName, "test name"), message: message(test.failureMessages[0], limits.maxMessageChars) }); }
	}
	if (seen !== tests) throw new Error("Conflicting Vitest test count"); return { suites, tests, passed, failed, skipped: pending + todo, failures, failuresTruncated: failed > failures.length, durationMs: reliable ? totalDuration : null };
}

type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; body: string };
function xml(source: string): XmlNode {
		const document = source.replace(/^<\?xml version="1\.0" encoding="UTF-8"\?>\r?\n?/, "");
		if (/<!DOCTYPE|<!ENTITY|<\?|<!--|<!\[CDATA\[/i.test(document) || /&(?!amp;|lt;|gt;|quot;|apos;)/.test(document)) throw new Error("Unsafe or unsupported XML"); const roots: XmlNode[] = [], stack: XmlNode[] = []; const token = /<[^>]+>|[^<]+/g; let offset = 0; let count = 0;
		for (const match of document.matchAll(token)) { if (match.index !== offset) throw new Error("Malformed XML"); offset += match[0].length; const part = match[0]; if (!part.startsWith("<")) { if (stack.length) stack[stack.length - 1]!.body += part; else if (part.trim()) throw new Error("Malformed XML"); continue; }
		const close = part.match(/^<\/([a-z-]+)>$/), open = part.match(/^<([a-z-]+)((?:\s+[A-Za-z_:][\w:.-]*="[^"<>]*")*)\s*(\/?)>$/); if (close) { const node = stack.pop(); if (!node || node.name !== close[1]) throw new Error("Malformed XML"); continue; } if (!open || !["testsuites", "testsuite", "testcase", "failure", "skipped", "system-out", "system-err"].includes(open[1]!)) throw new Error("Unsupported XML element");
		const attrs: Record<string, string> = {}; for (const item of open[2]!.matchAll(/\s+([A-Za-z_:][\w:.-]*)="([^"<>]*)"/g)) { if (attrs[item[1]!] !== undefined) throw new Error("Duplicate XML attribute"); attrs[item[1]!] = item[2]!.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity: string) => ({ amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" })[entity]!); }
		const node = { name: open[1]!, attrs, children: [], body: "" }; const parent = stack[stack.length - 1]; if (parent) parent.children.push(node); else roots.push(node); if (++count > 40_100) throw new Error("XML node budget exceeded"); if (!open[3]) stack.push(node);
	}
		if (offset !== document.length || stack.length || roots.length !== 1 || !["testsuites", "testsuite"].includes(roots[0]!.name)) throw new Error("Malformed XML"); return roots[0]!;
}
function bunJunit(source: string, limits: Limits): Result {
	const root = xml(source); const suites = root.name === "testsuite" ? [root] : root.children; if (!suites.length || suites.some((item) => item.name !== "testsuite" || item.children.some((child) => !["testcase", "system-out", "system-err"].includes(child.name)))) throw new Error("Unsupported JUnit structure");
	let tests = 0, passed = 0, failed = 0, skipped = 0, total = 0; let reliable = true; const failures: Failure[] = [];
	for (const suite of suites) { const suitePath = path(suite.attrs.file ?? suite.attrs.name); const cases = suite.children.filter((item) => item.name === "testcase"); let sf = 0, ss = 0; for (const item of cases) { if (item.children.some((child) => !["failure", "skipped", "system-out", "system-err"].includes(child.name)) || item.children.filter((child) => child.name === "failure").length > 1 || item.children.filter((child) => child.name === "skipped").length > 1) throw new Error("Unsupported JUnit testcase");
		const failure = item.children.find((child) => child.name === "failure"), skip = item.children.some((child) => child.name === "skipped"); if (failure && skip) throw new Error("Conflicting JUnit status"); tests += 1; const seconds = duration(item.attrs.time); if (seconds === null) reliable = false; else total += seconds * 1000;
		if (failure) { failed += 1; sf += 1; if (failures.length < limits.maxFailures) failures.push({ path: suitePath, name: text(item.attrs.name, "test name"), message: message(failure.attrs.message ?? failure.body, limits.maxMessageChars) }); } else if (skip) { skipped += 1; ss += 1; } else passed += 1; }
		for (const [key, actual] of [["tests", cases.length], ["failures", sf], ["skipped", ss]] as const) if (suite.attrs[key] !== undefined && Number(suite.attrs[key]) !== actual) throw new Error("Conflicting JUnit counts"); }
	if (tests > limits.maxTests) throw new Error("Test artifact exceeds test budget"); for (const [key, actual] of [["tests", tests], ["failures", failed], ["skipped", skipped]] as const) if (root.attrs[key] !== undefined && Number(root.attrs[key]) !== actual) throw new Error("Conflicting JUnit counts");
	return { suites: suites.length, tests, passed, failed, skipped, failures, failuresTruncated: failed > failures.length, durationMs: reliable ? total : null };
}

export function collectCleanerTestEvidence(environment: CleanerEnvironmentEvidence, plan: CleanerTestPlan, artifactPath: string, binding?: CleanerTestBinding, budget: Partial<Limits> = {}): CleanerTestEvidence {
	if (plan.status !== "available" || !plan.argv || !plan.outputPath || !plan.invocationIdentity) throw new Error("Cleaner test invocation was not planned"); const limits = { ...DEFAULT_LIMITS, ...budget }; if (Object.values(limits).some((value) => !Number.isInteger(value) || value < 1)) throw new Error("Cleaner test budget must contain positive integers");
	const common = { version: CLEANER_TEST_EVIDENCE_VERSION, collectorKind: "test-results" as const, runner: plan.runner, format: plan.format, argv: plan.argv, invocationIdentity: plan.invocationIdentity };
	const unavailable = (reason: "invocation-unbound" | "source-state-changed", freshness: "stale" | "unavailable"): CleanerTestEvidence => { const base = { ...common, status: "unavailable" as const, freshness, reason, exitOutcome: binding ? { ...(binding.exitCode !== undefined ? { exitCode: binding.exitCode } : {}), ...(binding.signal ? { signal: binding.signal } : {}) } : null, result: null, artifactIdentity: null, sourceState: { kind: "git-state" as const, stateRef: environment.sourceState.stateRef, freshness }, budget: { ...limits, observedArtifactBytes: 0, observedTests: 0, observedFailures: 0, durationExceeded: false } }; return freeze({ ...base, outputIdentity: { algorithm: "sha256", digest: hash(base) } }); };
	if (!binding) return unavailable("invocation-unbound", "unavailable"); const current = projectProjectState({ cwd: environment.scope.root }); if (binding.preStateRef !== environment.sourceState.stateRef || binding.postStateRef !== binding.preStateRef || current.git.stateRef !== binding.postStateRef) return unavailable("source-state-changed", "stale");
	if (resolve(artifactPath) !== plan.outputPath) throw new Error("Artifact does not match planned output"); const stat = lstatSync(artifactPath); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limits.maxArtifactBytes) throw new Error("Invalid or oversized test artifact"); const bytes = readFileSync(artifactPath); const source = bytes.toString("utf8"); if ((plan.format === "junit" && !source.trimStart().startsWith("<")) || (plan.format === "json" && !source.trimStart().startsWith("{"))) throw new Error("Test artifact runner/format mismatch"); const result = plan.runner === "bun" ? bunJunit(source, limits) : vitestJson(source, limits); const artifactIdentity = { algorithm: "sha256" as const, digest: createHash("sha256").update(bytes).digest("hex") };
	const base = { ...common, status: "available" as const, freshness: "current" as const, reason: "collected" as const, exitOutcome: { ...(binding.exitCode !== undefined ? { exitCode: binding.exitCode } : {}), ...(binding.signal ? { signal: binding.signal } : {}) }, result, artifactIdentity, sourceState: { ...environment.sourceState, freshness: "current" as const }, budget: { ...limits, observedArtifactBytes: bytes.byteLength, observedTests: result.tests, observedFailures: result.failed, durationExceeded: result.durationMs !== null && result.durationMs > limits.maxDurationMs } };
	return freeze({ ...base, outputIdentity: { algorithm: "sha256", digest: hash(base) } });
}
