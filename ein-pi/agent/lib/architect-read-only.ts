import { createHash } from "node:crypto";

import { collectCleanerAuditEvidence } from "./cleaner-audit-evidence.ts";
import { canonicalArea, type AreaSelector } from "./reviewed-area-ledger.ts";

export const ARCHITECT_EVIDENCE_VERSION = "architect-evidence/v1" as const;
export const ARCHITECT_PLAN_VERSION = "architect-plan/v1" as const;

type ArchitectScope = Readonly<{ kind: "selectors"; selectors: readonly AreaSelector[] }>;
type PlanContent = Readonly<{
	proposedBoundaries: readonly string[];
	affectedModules: readonly string[];
	migrationSteps: readonly string[];
	risks: readonly string[];
	invariants: readonly string[];
	verification: readonly string[];
	unresolvedDecisions: readonly string[];
	propertyTests: readonly string[];
}>;

export type ArchitectEvidence = Readonly<{
	version: typeof ARCHITECT_EVIDENCE_VERSION;
	mode: "read-only";
	evidenceId: string;
	scope: Readonly<{ areaId: string; selectors: readonly AreaSelector[] }>;
	sourceIdentity: Readonly<{ stateRef: string; freshness: "current" }>;
	repository: Readonly<{ branch: string; dirty: boolean; files: number; sourceBytes: number }>;
	files: readonly Readonly<{ path: string; sha256: string; bytes: number; source: string }>[];
	modules: readonly string[];
	graph: Readonly<{ availability: "unavailable"; provenance: "pi-runtime"; reason: string; edges: readonly never[]; cycles: readonly never[] }>;
	semanticInspection: readonly string[];
	constraints: readonly string[];
}>;

export type BoundArchitectPlan = Readonly<{
	version: typeof ARCHITECT_PLAN_VERSION;
	binding: Readonly<{ evidenceId: string; areaId: string; stateRef: string; selectors: readonly AreaSelector[] }>;
	plan: PlanContent;
}>;

export class ArchitectAdmissionError extends Error {
	constructor(readonly code: string) {
		super(`Architect request rejected: ${code}`);
		this.name = "ArchitectAdmissionError";
	}
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
	const actual = Object.keys(value).sort();
	return actual.length === keys.length && [...keys].sort().every((key, index) => actual[index] === key);
};
const strings = (value: unknown, allowEmpty = false): value is string[] => Array.isArray(value)
	&& (allowEmpty || value.length > 0)
	&& value.length <= 32
	&& value.every((item) => typeof item === "string" && item.trim() === item && item.length > 0 && item.length <= 2_000);
const pathEncoder = new TextEncoder();
const affectedModules = (value: unknown): value is string[] => strings(value)
	&& new Set(value).size === value.length
	&& value.every((path) => path !== "." && pathEncoder.encode(path).byteLength <= 512
		&& path.trim() === path && !/[\\\u0000-\u001f\u007f]/.test(path)
		&& !path.startsWith("/") && !/^[A-Za-z]:/.test(path)
		&& !path.split("/").some((segment) => segment === "" || segment === "." || segment === ".."));

function freeze<T>(value: T): T {
	if (value && typeof value === "object") {
		Object.freeze(value);
		for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
	}
	return value;
}

function boundedScope(input: unknown): ArchitectScope {
	if (!record(input) || !exact(input, ["kind", "selectors"]) || input.kind !== "selectors" || !Array.isArray(input.selectors)) {
		throw new ArchitectAdmissionError("malformed-or-missing-scope");
	}
	let area: ReturnType<typeof canonicalArea>;
	try { area = canonicalArea(input.selectors as AreaSelector[]); } catch { throw new ArchitectAdmissionError("invalid-or-unbounded-scope"); }
	if (area.selectors.some(({ path }) => path === ".")) throw new ArchitectAdmissionError("root-wide-scope");
	return freeze({ kind: "selectors", selectors: area.selectors });
}

function moduleFor(path: string): string {
	const parts = path.split("/");
	return parts.length > 1 ? parts.slice(0, -1).join("/") : path;
}

function identity(value: unknown): string {
	return `architect-evidence-v1:sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function collectArchitectEvidence(cwd: string, requested: unknown): ArchitectEvidence {
	const scope = boundedScope(requested);
	let base: ReturnType<typeof collectCleanerAuditEvidence>;
	try { base = collectCleanerAuditEvidence(cwd, scope); } catch (error) {
		const code = record(error) && typeof error.code === "string" ? error.code : "scope-unavailable";
		throw new ArchitectAdmissionError(code);
	}
	const files = base.files.map(({ path, sha256, bytes, source }) => ({ path, sha256, bytes, source }));
	const evidenceId = identity({ version: ARCHITECT_EVIDENCE_VERSION, areaId: base.scope.areaId, stateRef: base.sourceIdentity.stateRef, files: files.map(({ path, sha256 }) => ({ path, sha256 })) });
	return freeze({
		version: ARCHITECT_EVIDENCE_VERSION,
		mode: "read-only",
		evidenceId,
		scope: base.scope,
		sourceIdentity: { stateRef: base.sourceIdentity.stateRef, freshness: "current" },
		repository: { branch: base.repository.branch, dirty: base.repository.dirty, files: files.length, sourceBytes: base.repository.sourceBytes },
		files,
		modules: [...new Set(files.map(({ path }) => moduleFor(path)))].sort(),
		graph: { availability: "unavailable", provenance: "pi-runtime", reason: "No authoritative programmatic CodeGraph contract is injected into the Pi tool runtime; dependency edges, direction, and cycles were not collected.", edges: [], cycles: [] },
		semanticInspection: ["module-package-boundaries", "dependency-direction-cycles", "policy-detail-coupling", "encapsulation-information-hiding", "accidental-public-surfaces", "ownership-responsibility", "supported-invariants"],
		constraints: ["do-not-reconstruct-computable-facts", "separate-measurement-interpretation-inference-uncertainty", "constrain-claims-to-available-evidence", "no-source-writes"],
	});
}

function planContent(input: unknown): PlanContent {
	const keys = ["proposedBoundaries", "affectedModules", "migrationSteps", "risks", "invariants", "verification", "unresolvedDecisions", "propertyTests"] as const;
	if (!record(input) || !exact(input, keys) || !affectedModules(input.affectedModules)
		|| !keys.filter((key) => key !== "affectedModules").every((key) => strings(input[key], key === "propertyTests" || key === "unresolvedDecisions"))) {
		throw new ArchitectAdmissionError("malformed-plan");
	}
	return freeze({
		proposedBoundaries: [...input.proposedBoundaries as string[]],
		affectedModules: [...input.affectedModules as string[]],
		migrationSteps: [...input.migrationSteps as string[]],
		risks: [...input.risks as string[]],
		invariants: [...input.invariants as string[]],
		verification: [...input.verification as string[]],
		unresolvedDecisions: [...input.unresolvedDecisions as string[]],
		propertyTests: [...input.propertyTests as string[]],
	});
}

function inScope(path: string, selectors: readonly AreaSelector[]): boolean {
	return selectors.some((selector) => selector.kind === "file" ? selector.path === path : path === selector.path || path.startsWith(`${selector.path}/`));
}

export function bindArchitectPlan(cwd: string, evidence: unknown, input: unknown): BoundArchitectPlan {
	if (!record(evidence) || evidence.version !== ARCHITECT_EVIDENCE_VERSION || !record(evidence.scope) || !Array.isArray(evidence.scope.selectors)) {
		throw new ArchitectAdmissionError("unbound-plan");
	}
	const current = collectArchitectEvidence(cwd, { kind: "selectors", selectors: evidence.scope.selectors });
	if (evidence.evidenceId !== current.evidenceId) throw new ArchitectAdmissionError("stale-evidence");
	const plan = planContent(input);
	if (plan.affectedModules.some((path) => !inScope(path, current.scope.selectors))) throw new ArchitectAdmissionError("plan-out-of-scope");
	return freeze({ version: ARCHITECT_PLAN_VERSION, binding: { evidenceId: current.evidenceId, areaId: current.scope.areaId, stateRef: current.sourceIdentity.stateRef, selectors: current.scope.selectors }, plan });
}

export function validateArchitectPlan(cwd: string, candidate: unknown): Readonly<{ mode: "read-only"; status: "admitted"; evidence: ArchitectEvidence; plan: BoundArchitectPlan; checklist: readonly string[] }> {
	if (!record(candidate) || !exact(candidate, ["version", "binding", "plan"]) || candidate.version !== ARCHITECT_PLAN_VERSION || !record(candidate.binding) || !exact(candidate.binding, ["evidenceId", "areaId", "stateRef", "selectors"]) || !Array.isArray(candidate.binding.selectors)) {
		throw new ArchitectAdmissionError("unbound-or-malformed-plan");
	}
	const evidence = collectArchitectEvidence(cwd, { kind: "selectors", selectors: candidate.binding.selectors });
	if (candidate.binding.evidenceId !== evidence.evidenceId || candidate.binding.areaId !== evidence.scope.areaId || candidate.binding.stateRef !== evidence.sourceIdentity.stateRef) {
		throw new ArchitectAdmissionError("stale-plan");
	}
	const plan = bindArchitectPlan(cwd, evidence, candidate.plan);
	return freeze({ mode: "read-only", status: "admitted", evidence, plan, checklist: ["Assess proposed boundaries against measured repository evidence.", "Assess dependency direction and cycles only if authoritative graph evidence is available.", "Check migration ordering, invariants, risks, verification, and unresolved decisions for consistency.", "Separate semantic interpretation, inference/confidence, and missing evidence.", "Do not apply, edit, reorganize, format, or execute the migration."] });
}
