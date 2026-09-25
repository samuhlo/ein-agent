import { createHash } from "node:crypto";
import { isSafeCheckpointText } from "./continuity-checkpoint.ts";

export type NativeCallRef = { sessionRef: string; toolCallId: string };
export type OperationRecovery = {
	token: string; stateRef: string; kind: "local-attested" | "external-observed";
	source: "pi-coordinator" | "claude-coordinator"; summary: string; callRef: NativeCallRef;
	evidenceRefs: string[]; evidence: { path: string; digest: string }[]; resolvedAt: string;
};
export type ContinuityOperation = {
	id: string; runtime: "pi" | "claude"; tool: string; inputDigest: string;
	admissionRef?: string;
	startedAt: string; beforeStateRef: string | null; nativeCallRef: NativeCallRef;
	effectScope: "local" | "external-or-unknown"; status: "running" | "uncertain" | "settled";
	outcome?: "succeeded" | "observed" | "not-started" | "recovered"; afterStateRef?: string | null;
	reason?: string; recovery?: OperationRecovery;
};
export type ContinuityOperationJournal = { schemaVersion: 1; revision: string; operations: ContinuityOperation[]; extraActiveSlots?: number };
// The active limit covers in-flight calls; uncertain results remain recoverable evidence.
export const OPERATION_LIMITS = { active: 32, extraActiveSlots: 32, settled: 64, bytes: 256 * 1024 } as const;
export const MUTATING_CONTINUITY_TOOLS = new Set(["write", "edit", "bash", "subagent", "ein_cleaner_improve_apply", "ein_openspec_sync", "ein_openspec_delta_write", "ein_sdd_preflight", "Write", "Edit", "Bash", "Task"]);
const READ_TOOLS = new Set(["read", "grep", "find", "Read", "Grep", "Glob"]);
const READ_COMMANDS = new Set(["false", "true", "git diff --check", "git status --short", "git rev-parse HEAD"]);
const HASH = /^sha256:[a-f0-9]{64}$/;
const text = (x: unknown, max = 256): x is string => typeof x === "string" && x.length > 0 && Buffer.byteLength(x) <= max && !/[\x00-\x1f\x7f]/.test(x);
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const date = (x: unknown) => typeof x === "string" && Number.isFinite(Date.parse(x));
const state = (x: unknown) => x === null || typeof x === "string" && /^git-v1:sha256:[a-f0-9]{64}$/.test(x);
const exact = (x: Record<string, unknown>, keys: string[]) => Object.keys(x).every((k) => keys.includes(k));
export function validNativeCallRef(value: unknown): value is NativeCallRef {
	return record(value) && exact(value, ["sessionRef", "toolCallId"]) && typeof value.sessionRef === "string"
		&& /^(?:pi|claude):v1:sha256:[a-f0-9]{64}$/.test(value.sessionRef) && text(value.toolCallId);
}
export function operationInputDigest(input: unknown): string {
	const canonical = (value: unknown, depth: number): unknown => {
		if (depth > 32) throw new Error("input too deep");
		if (Array.isArray(value)) return value.map((v) => canonical(v, depth + 1));
		if (record(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], depth + 1)]));
		return value ?? null;
	};
	return `sha256:${createHash("sha256").update(JSON.stringify(canonical(input, 0))).digest("hex")}`;
}
export function operationId(runtime: "pi" | "claude", ref: NativeCallRef): string {
	return `${runtime}:${operationInputDigest(ref).slice(7)}`;
}
export function classifyContinuityTool(tool: string, input: unknown, admittedReadOnly = false): "read" | "local" | "external-or-unknown" | "uncovered" {
	if (READ_TOOLS.has(tool)) return "read";
	if ((tool === "bash" || tool === "Bash") && record(input) && typeof input.command === "string" && READ_COMMANDS.has(input.command.trim())) return "read";
	if (tool === "subagent" && record(input) && ["status", "get", "list"].includes(String(input.action))) return "read";
	if (tool === "subagent" && admittedReadOnly) return "read";
	if (!MUTATING_CONTINUITY_TOOLS.has(tool)) return "uncovered";
	// Adapters may only narrow writes after resolving their path inside the project.
	return "external-or-unknown";
}
function validRecovery(value: unknown): value is OperationRecovery {
	if (!record(value) || !exact(value, ["token", "stateRef", "kind", "source", "summary", "callRef", "evidenceRefs", "evidence", "resolvedAt"])) return false;
	return typeof value.token === "string" && HASH.test(value.token) && state(value.stateRef) && value.stateRef !== null
		&& ["local-attested", "external-observed"].includes(String(value.kind)) && ["pi-coordinator", "claude-coordinator"].includes(String(value.source))
		&& isSafeCheckpointText(value.summary, 512) && validNativeCallRef(value.callRef) && date(value.resolvedAt)
		&& Array.isArray(value.evidenceRefs) && value.evidenceRefs.length <= 16 && value.evidenceRefs.every((r) => text(r))
		&& Array.isArray(value.evidence) && value.evidence.length <= 16 && value.evidence.every((e) => record(e) && exact(e, ["path", "digest"]) && text(e.path, 1024) && typeof e.digest === "string" && HASH.test(e.digest));
}
export function validContinuityOperation(value: unknown): value is ContinuityOperation {
	if (!record(value) || !exact(value, ["id", "runtime", "tool", "inputDigest", "admissionRef", "startedAt", "beforeStateRef", "nativeCallRef", "effectScope", "status", "outcome", "afterStateRef", "reason", "recovery"])) return false;
	if (!text(value.id) || !["pi", "claude"].includes(String(value.runtime)) || !text(value.tool, 128) || typeof value.inputDigest !== "string" || !HASH.test(value.inputDigest)
		|| !date(value.startedAt) || !state(value.beforeStateRef) || !validNativeCallRef(value.nativeCallRef)
		|| !["local", "external-or-unknown"].includes(String(value.effectScope)) || !["running", "uncertain", "settled"].includes(String(value.status))) return false;
	if (value.afterStateRef !== undefined && !state(value.afterStateRef) || value.reason !== undefined && !text(value.reason, 512)) return false;
	if (value.admissionRef !== undefined && (typeof value.admissionRef !== "string" || !HASH.test(value.admissionRef))) return false;
	if (!value.nativeCallRef.sessionRef.startsWith(`${value.runtime}:`) || value.id !== operationId(value.runtime as "pi" | "claude", value.nativeCallRef)) return false;
	if (value.status === "settled" ? !["succeeded", "observed", "not-started", "recovered"].includes(String(value.outcome)) : value.outcome !== undefined) return false;
	return value.outcome === "recovered" ? validRecovery(value.recovery) : value.recovery === undefined;
}
export function buildOperationJournal(operations: readonly ContinuityOperation[], extraActiveSlots = 0): ContinuityOperationJournal {
	if (!operations.every(validContinuityOperation) || new Set(operations.map((o) => o.id)).size !== operations.length) throw new Error("invalid-operations");
	if (!Number.isInteger(extraActiveSlots) || extraActiveSlots < 0 || extraActiveSlots > OPERATION_LIMITS.extraActiveSlots) throw new Error("invalid-active-slots");
	const active = operations.filter((o) => o.status !== "settled");
	const running = active.filter((o) => o.status === "running");
	// A failed call remains evidence for handoff/recovery, not an in-flight slot.
	if (running.length > OPERATION_LIMITS.active + extraActiveSlots) throw new Error(`active-limit:${running.map((o) => o.id).join(",")}`);
	const settled = operations.filter((o) => o.status === "settled").sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id)).slice(-OPERATION_LIMITS.settled);
	for (;;) {
		const items = [...active, ...settled].sort((a, b) => a.id.localeCompare(b.id));
		const fields = { schemaVersion: 1 as const, operations: items, ...(extraActiveSlots ? { extraActiveSlots } : {}) };
		const journal = { ...fields, revision: operationInputDigest(fields) };
		if (Buffer.byteLength(JSON.stringify(journal)) <= OPERATION_LIMITS.bytes) return journal;
		if (!settled.length) throw new Error("journal-size-limit");
		settled.shift();
	}
}
export function parseOperationJournal(value: unknown): ContinuityOperationJournal | null {
	if (!record(value) || !exact(value, ["schemaVersion", "revision", "operations", "extraActiveSlots"]) || value.schemaVersion !== 1 || typeof value.revision !== "string" || !Array.isArray(value.operations)) return null;
	try {
		const canonical = buildOperationJournal(value.operations, value.extraActiveSlots === undefined ? 0 : value.extraActiveSlots as number);
		return canonical.operations.length === value.operations.length && canonical.revision === value.revision && (canonical.extraActiveSlots ?? 0) === (value.extraActiveSlots ?? 0) ? canonical : null;
	} catch { return null; }
}
