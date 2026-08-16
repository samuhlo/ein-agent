import { extname } from "node:path";

import { collectCleanerAuditEvidence, type CleanerAuditEvidence, type CleanerAuditScope } from "./cleaner-audit-evidence.ts";
import { collectCleanerComplexityEvidence, type CleanerComplexityEvidence } from "./cleaner-complexity-evidence.ts";
import { collectCleanerCoverageEvidence, planCleanerCoverageEvidence, type CleanerCoverageEvidence, type CleanerCoveragePlan } from "./cleaner-coverage-evidence.ts";
import { deriveCleanerCrapEvidence, type CleanerCrapEvidence } from "./cleaner-crap-evidence.ts";
import { collectCleanerDuplicationEvidence, type CleanerDuplicationEvidence } from "./cleaner-duplication-evidence.ts";
import { collectCleanerEnvironmentEvidence, type CleanerEnvironmentEvidence } from "./cleaner-environment-evidence.ts";
import { collectCleanerTestEvidence, planCleanerTestEvidence, type CleanerTestBinding, type CleanerTestEvidence, type CleanerTestPlan } from "./cleaner-test-evidence.ts";
import { projectProjectState } from "./project-state.ts";

const ELIGIBLE = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx", ".vue", ".astro"]);
const TOP = 10;
const MAX_COMPACT_BYTES = 16 * 1024;
export const CLEANER_OPERATIONAL_EVIDENCE_VERSION = "cleaner-operational-evidence/v1" as const;

export type CleanerPassiveEvidence = Readonly<{ version: typeof CLEANER_OPERATIONAL_EVIDENCE_VERSION; stateRef: string; areaId: string; audit: CleanerAuditEvidence; environment: CleanerEnvironmentEvidence; complexity: CleanerComplexityEvidence | null; duplication: CleanerDuplicationEvidence | null; unsupported: readonly Readonly<{ kind: "complexity" | "duplication"; reason: string }>[] }>;
export type CleanerActivePlan = Readonly<{ test: CleanerTestPlan; coverage: CleanerCoveragePlan | null }>;
export type CleanerActiveEvidence = Readonly<{ test: CleanerTestEvidence; coverage: CleanerCoverageEvidence | null; crap: CleanerCrapEvidence | null; crapUnavailableReason: string | null }>;
export type CleanerPlanInput = Parameters<typeof planCleanerTestEvidence>[1] & Readonly<{ coverage?: Readonly<{ outputDirectory: string; approvedEvidenceDirectories?: readonly string[] }> }>;

function same(passive: CleanerPassiveEvidence, stateRef: string): void { const current = projectProjectState({ cwd: passive.audit.repository.root }); if (passive.stateRef !== stateRef || passive.audit.sourceIdentity.stateRef !== stateRef || passive.environment.sourceState.stateRef !== stateRef || current.git.stateRef !== stateRef || current.git.quality !== "current") throw new Error("Cleaner operational evidence state mismatch"); }

export function collectCleanerPassiveEvidence(cwd: string, scope: CleanerAuditScope): CleanerPassiveEvidence {
	const audit = collectCleanerAuditEvidence(cwd, scope), paths = audit.files.filter((file) => ELIGIBLE.has(extname(file.path).toLowerCase())).map((file) => file.path), environment = collectCleanerEnvironmentEvidence(cwd, {}, paths); same({ stateRef: audit.sourceIdentity.stateRef, audit, environment } as CleanerPassiveEvidence, audit.sourceIdentity.stateRef);
	const known = new Map(environment.scope.files.map((file) => [file.path, file.sha256])); for (const file of audit.files.filter((item) => paths.includes(item.path))) if (known.get(file.path) !== file.sha256) throw new Error("Cleaner operational evidence file digest mismatch");
	const unsupported = paths.length ? [] : [{ kind: "complexity" as const, reason: "no-eligible-admitted-source" }, { kind: "duplication" as const, reason: "no-eligible-admitted-source" }];
	return Object.freeze({ version: CLEANER_OPERATIONAL_EVIDENCE_VERSION, stateRef: audit.sourceIdentity.stateRef, areaId: audit.scope.areaId, audit, environment, complexity: paths.length ? collectCleanerComplexityEvidence(environment, paths) : null, duplication: paths.length ? collectCleanerDuplicationEvidence(environment, paths) : null, unsupported: Object.freeze(unsupported) });
}

export function planCleanerActiveEvidence(passive: CleanerPassiveEvidence, input: CleanerPlanInput): CleanerActivePlan {
	same(passive, passive.stateRef); const test = planCleanerTestEvidence(passive.environment, input); const coverage = input.coverage ? planCleanerCoverageEvidence(passive.environment, test, input.coverage) : null; return Object.freeze({ test, coverage });
}

export function ingestCleanerActiveEvidence(passive: CleanerPassiveEvidence, plan: CleanerActivePlan, input: Readonly<{ testArtifactPath: string; coverageArtifactPath?: string; binding?: CleanerTestBinding }>): CleanerActiveEvidence {
	same(passive, plan.test.sourceState.stateRef); const test = collectCleanerTestEvidence(passive.environment, plan.coverage?.testPlan ?? plan.test, input.testArtifactPath, input.binding); let coverage: CleanerCoverageEvidence | null = null, crap: CleanerCrapEvidence | null = null, crapUnavailableReason: string | null = "coverage-not-ingested";
	if (plan.coverage && input.coverageArtifactPath) { coverage = collectCleanerCoverageEvidence(passive.environment, plan.coverage, test, input.coverageArtifactPath, input.binding); if (coverage.status === "available" && passive.complexity) { crap = deriveCleanerCrapEvidence(passive.complexity, coverage); crapUnavailableReason = null; } else crapUnavailableReason = passive.complexity ? coverage.reason : "complexity-unsupported"; }
	return Object.freeze({ test, coverage, crap, crapUnavailableReason });
}

export function compactCleanerEvidence(passive: CleanerPassiveEvidence, active?: CleanerActiveEvidence): string {
	same(passive, active?.test.sourceState.stateRef ?? passive.stateRef); const complexity = passive.complexity; const duplication = passive.duplication; const topComplexity = [...(complexity?.functions ?? [])].sort((a, b) => b.complexity - a.complexity || a.path.localeCompare(b.path, "en") || a.span.startLine - b.span.startLine || a.span.startColumn - b.span.startColumn).slice(0, TOP).map(({ path, displayName, complexity, span }) => ({ path, line: span.startLine, name: displayName, complexity }));
	const cloneLocations = (duplication?.groups ?? []).flatMap((group) => group.occurrences.map((item) => ({ path: item.path, line: item.span.startLine, tokens: group.tokenCount }))).sort((a, b) => b.tokens - a.tokens || a.path.localeCompare(b.path, "en") || a.line - b.line).slice(0, TOP); const result = active?.test.result; const crapTop = [...(active?.crap?.measured ?? [])].sort((a, b) => b.crap - a.crap || a.path.localeCompare(b.path, "en") || a.span.startLine - b.span.startLine).slice(0, TOP).map(({ path, span, complexity, coverageFraction, crap }) => ({ path, line: span.startLine, complexity, coverageFraction, crap }));
	const failures = [...(result?.failures.slice(0, TOP) ?? [])]; const summary = { version: CLEANER_OPERATIONAL_EVIDENCE_VERSION, stateRef: passive.stateRef, areaId: passive.areaId, source: { files: passive.audit.repository.scopedFiles, bytes: passive.audit.repository.sourceBytes }, stack: { packageManager: passive.environment.tools.packageManager.name, languages: passive.environment.languages, frameworks: { vue: passive.environment.frameworks.vue.length > 0, astro: passive.environment.frameworks.astro.length > 0 }, capabilities: passive.environment.capabilities.map(({ kind, status, reason }) => ({ kind, status, reason })) }, complexity: complexity ? { status: "available", aggregate: { count: complexity.aggregate.count, max: complexity.aggregate.max }, top: topComplexity } : { status: "unsupported" }, duplication: duplication ? { status: "available", aggregate: duplication.aggregate, locations: cloneLocations } : { status: "unsupported" }, active: { test: active ? { status: active.test.status, runner: active.test.runner, argv: active.test.argv, totals: result && { tests: result.tests, passed: result.passed, failed: result.failed, skipped: result.skipped }, failures } : { status: "unavailable" }, coverage: active?.coverage ? { status: active.coverage.status, reason: active.coverage.reason, totals: active.coverage.totals } : { status: "unavailable" }, crap: active?.crap ? { status: "available", aggregate: { count: active.crap.aggregate.count, max: active.crap.aggregate.max, unavailableCount: active.crap.aggregate.unavailableCount, unavailableReasons: active.crap.aggregate.unavailableReasons }, top: crapTop } : { status: "unavailable", reason: active?.crapUnavailableReason ?? "active-evidence-not-ingested" } }, unsupported: passive.unsupported }; const trimmable: unknown[][] = []; if (complexity) trimmable.push(topComplexity); if (duplication) trimmable.push(cloneLocations); if (active?.crap) trimmable.push(crapTop); if (active) trimmable.push(failures); let text = JSON.stringify(summary); while (Buffer.byteLength(text) > MAX_COMPACT_BYTES && trimmable.some((items) => items.length)) { trimmable.sort((a, b) => b.length - a.length); trimmable[0]!.pop(); text = JSON.stringify(summary); } if (Buffer.byteLength(text) > MAX_COMPACT_BYTES) throw new Error("Cleaner compact evidence exceeds byte cap"); return text;
}
