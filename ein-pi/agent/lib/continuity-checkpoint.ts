import { createHash } from "node:crypto";
import { isAbsolute, posix } from "node:path";
import type { ProjectStateV1 } from "./project-state.ts";
export const CONTINUITY_CHECKPOINT_VERSION = 1 as const;
export const CONTINUITY_CHECKPOINT_LIMITS = Object.freeze({
	maxObjectiveBytes: 512,
	maxNextActionBytes: 512,
	maxItemBytes: 256,
	maxChangeBytes: 128,
	maxListItems: 32,
	maxChangedPaths: 256,
	maxPathBytes: 512,
	maxWarnings: 12,
	maxSerializedBytes: 32_768,
} as const);
export type ContinuityMode = "adhoc" | "sdd";
export type ContinuityVerificationStatus = "fresh" | "stale" | "failed" | "not-run" | "unknown";
export type ContinuityWarning =
	| "git-dirty"
	| "git-staged"
	| "git-untracked"
	| "git-unknown-change"
	| "git-incomplete"
	| "verification-stale"
	| "verification-failed"
	| "verification-unknown"
	| "openspec-ambiguous"
	| "provider-runtime-unavailable";
export type ContinuityCheckpointV1 = Readonly<{
	version: typeof CONTINUITY_CHECKPOINT_VERSION;
	revision: string;
	mode: ContinuityMode;
	change: string | null;
	stateRef: string | null;
	capturedAt: string;
	objective: string;
	completed: readonly string[];
	nextAction: string;
	unresolvedDecisions: readonly string[];
	changedPaths: readonly string[];
	verification: Readonly<{
		status: ContinuityVerificationStatus;
		observedStateRef: string | null;
	}>;
	warnings: readonly ContinuityWarning[];
}>;
export type ContinuityCheckpointReason =
	| "invalid-state"
	| "invalid-checkpoint"
	| "invalid-timestamp"
	| "invalid-path"
	| "unsafe-content"
	| "limit-exceeded"
	| "revision-mismatch";
export type ContinuityCheckpointResult =
	| Readonly<{ ok: true; checkpoint: ContinuityCheckpointV1 }>
	| Readonly<{ ok: false; reason: ContinuityCheckpointReason }>;
export type ContinuityCheckpointFacts = Readonly<{
	capturedAt: string;
	objective: string;
	completed: readonly string[];
	nextAction: string;
	unresolvedDecisions: readonly string[];
}>;
type CheckpointContent = Omit<ContinuityCheckpointV1, "revision">;
const STATE_REF = /^git-v1:sha256:[a-f0-9]{64}$/;
const REVISION = /^sha256:[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const PRIVATE_PATH = /(?:^|[^A-Za-z0-9])(?:\/(?:Users|home|private|var\/folders|tmp)\/|[A-Za-z]:\\Users\\|~\/\.(?:config|local)\/)/i;
const SECRET = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+\/-]{12,}|\bAKIA[A-Z0-9]{16}\b|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|client[_-]?secret|authorization)\s*[:=]\s*\S+)/i;
const PRIVATE_PAYLOAD = /(?:<\/?tool_(?:call|result)>|\btool[_ -]?payload\s*[:=]|\btranscript\s*[:=]|\bsession[_-]?id\s*[:=]|["']messages["']\s*:)/i;
const WARNING_ORDER: readonly ContinuityWarning[] = [
	"git-dirty", "git-staged", "git-untracked", "git-unknown-change", "git-incomplete",
	"verification-stale", "verification-failed", "verification-unknown", "openspec-ambiguous",
	"provider-runtime-unavailable",
];
/**
 * Un solo item indebido tumbaría el paquete entero y lo degradaría a los valores
 * genéricos, así que quien construye hechos filtra con el MISMO contrato que
 * después los valida, en vez de duplicar los patrones de privacidad.
 */
export function isSafeCheckpointText(value: unknown, max: number): value is string {
	return textReason(value, max) === null;
}

function textReason(value: unknown, max: number): ContinuityCheckpointReason | null {
	if (typeof value !== "string" || value.length === 0) return "invalid-checkpoint";
	if (utf8Bytes(value) > max) return "limit-exceeded";
	if (CONTROL.test(value) || PRIVATE_PATH.test(value) || SECRET.test(value) || PRIVATE_PAYLOAD.test(value)) return "unsafe-content";
	return null;
}
function safePath(value: unknown): value is string {
	if (typeof value !== "string" || value.length === 0 || utf8Bytes(value) > CONTINUITY_CHECKPOINT_LIMITS.maxPathBytes) return false;
	if (value === "." || isAbsolute(value) || /^[A-Za-z]:\//.test(value) || value.includes("\\") || CONTROL.test(value)) return false;
	const parts = value.split("/");
	return !parts.includes("..") && posix.normalize(value) === value && !value.startsWith("../");
}
function safeChange(value: unknown): value is string {
	return typeof value === "string" && !value.includes("/") && safePath(value)
		&& textReason(value, CONTINUITY_CHECKPOINT_LIMITS.maxChangeBytes) === null;
}
function validIsoTimestamp(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
	const time = Date.parse(value);
	if (!Number.isFinite(time)) return false;
	const canonical = new Date(time).toISOString();
	return canonical === value || canonical.replace(".000Z", "Z") === value;
}
function validStateRef(value: unknown): value is string {
	return typeof value === "string" && STATE_REF.test(value);
}
function canonicalContent(checkpoint: ContinuityCheckpointV1 | CheckpointContent): CheckpointContent {
	return {
		version: checkpoint.version, mode: checkpoint.mode, change: checkpoint.change, stateRef: checkpoint.stateRef,
		capturedAt: checkpoint.capturedAt, objective: checkpoint.objective, completed: [...checkpoint.completed],
		nextAction: checkpoint.nextAction, unresolvedDecisions: [...checkpoint.unresolvedDecisions],
		changedPaths: [...checkpoint.changedPaths], verification: {
			status: checkpoint.verification.status, observedStateRef: checkpoint.verification.observedStateRef,
		}, warnings: [...checkpoint.warnings],
	};
}

function revisionFor(content: CheckpointContent): string {
	return `sha256:${createHash("sha256").update(JSON.stringify(canonicalContent(content))).digest("hex")}`;
}

function checkpointFrom(content: CheckpointContent, revision = revisionFor(content)): ContinuityCheckpointV1 {
	return {
		version: content.version, revision, mode: content.mode, change: content.change, stateRef: content.stateRef,
		capturedAt: content.capturedAt, objective: content.objective, completed: content.completed,
		nextAction: content.nextAction, unresolvedDecisions: content.unresolvedDecisions,
		changedPaths: content.changedPaths, verification: content.verification, warnings: content.warnings,
	};
}

function utf8Bytes(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

function serializedBytes(value: unknown): number {
	return utf8Bytes(JSON.stringify(value));
}

function verificationFrom(state: ProjectStateV1): ContinuityCheckpointV1["verification"] {
	const verification = state.verification;
	const current = validStateRef(state.git.stateRef) ? state.git.stateRef : null;
	const observed = validStateRef(verification.observedStateRef) ? verification.observedStateRef : null;
	const boundCurrent = validStateRef(verification.currentStateRef) ? verification.currentStateRef : null;
	const mismatch = (observed !== null && current !== observed) || (boundCurrent !== null && current !== boundCurrent);
	const trustworthyGit = state.git.repository === true && state.git.complete && state.git.dirty !== null
		&& state.git.quality === "current" && current !== null;
	const fresh = trustworthyGit && verification.reportedOutcome === "pass" && verification.effectiveOutcome === "pass"
		&& verification.freshness === "current" && verification.quality === "current"
		&& observed === current && boundCurrent === current;
	const evidenceExists = verification.reportedOutcome === "pass" || verification.effectiveOutcome === "pass"
		|| observed !== null || boundCurrent !== null;
	let status: ContinuityVerificationStatus = "unknown";
	if (verification.reportedOutcome === "absent" && verification.effectiveOutcome === "absent") status = "not-run";
	else if (verification.reportedOutcome === "fail" || verification.effectiveOutcome === "fail") status = "failed";
	else if (fresh) status = "fresh";
	else if (verification.freshness === "stale" || mismatch || evidenceExists) status = "stale";
	return { status, observedStateRef: observed };
}

function deriveWarnings(state: ProjectStateV1, status: ContinuityVerificationStatus): ContinuityWarning[] {
	const warnings = new Set<ContinuityWarning>();
	if (state.git.dirty === true) warnings.add("git-dirty");
	if (state.git.changes.some(({ indexStatus }) => indexStatus !== "." && indexStatus !== "?")) warnings.add("git-staged");
	if (state.git.changes.some(({ indexStatus, worktreeStatus }) => indexStatus === "?" || worktreeStatus === "?")) warnings.add("git-untracked");
	if (state.git.changes.some(({ kind, indexStatus, worktreeStatus }) => kind === "unknown" || indexStatus === "U" || worktreeStatus === "U")) warnings.add("git-unknown-change");
	if (!state.git.complete || state.git.repository !== true || state.git.dirty === null || state.git.quality === "incomplete" || state.git.quality === "unavailable") warnings.add("git-incomplete");
	if (status === "stale") warnings.add("verification-stale");
	if (status === "failed") warnings.add("verification-failed");
	if (status === "unknown") warnings.add("verification-unknown");
	if (state.openspec.selection === "ambiguous" || state.openspec.quality === "ambiguous") warnings.add("openspec-ambiguous");
	if (Object.values(state.runtimes).some(({ availability }) => availability === "unavailable")) warnings.add("provider-runtime-unavailable");
	return WARNING_ORDER.filter((warning) => warnings.has(warning));
}

function validateFacts(facts: ContinuityCheckpointFacts): ContinuityCheckpointReason | null {
	if (!validIsoTimestamp(facts?.capturedAt)) return "invalid-timestamp";
	const fields: readonly [unknown, number][] = [[facts.objective, CONTINUITY_CHECKPOINT_LIMITS.maxObjectiveBytes], [facts.nextAction, CONTINUITY_CHECKPOINT_LIMITS.maxNextActionBytes]];
	for (const [value, max] of fields) { const reason = textReason(value, max); if (reason) return reason; }
	for (const list of [facts.completed, facts.unresolvedDecisions]) {
		if (!Array.isArray(list)) return "invalid-checkpoint";
		if (list.length > CONTINUITY_CHECKPOINT_LIMITS.maxListItems) return "limit-exceeded";
		for (const value of list) { const reason = textReason(value, CONTINUITY_CHECKPOINT_LIMITS.maxItemBytes); if (reason) return reason; }
	}
	return null;
}

export function deriveContinuityCheckpoint(state: ProjectStateV1, facts: ContinuityCheckpointFacts): ContinuityCheckpointResult {
	try {
		const factsError = validateFacts(facts); if (factsError) return { ok: false, reason: factsError };
		if (!state || state.schemaVersion !== 1 || !state.git || !state.openspec || !state.verification || !state.runtimes) return { ok: false, reason: "invalid-state" };
		const paths = new Set<string>();
		for (const change of state.git.changes) {
			for (const path of [change.path, ...(change.previousPath === undefined ? [] : [change.previousPath])]) {
				if (!safePath(path)) return { ok: false, reason: "invalid-path" };
				paths.add(path);
			}
		}
		if (paths.size > CONTINUITY_CHECKPOINT_LIMITS.maxChangedPaths) return { ok: false, reason: "limit-exceeded" };
		const selected = state.openspec.selectedChange;
		const sdd = state.openspec.selection === "selected" && state.openspec.provenance === "canonical"
			&& (state.openspec.quality === "current" || state.openspec.quality === "incomplete")
			&& state.openspec.activeChanges.length === 1 && state.openspec.activeChanges[0] === selected && safeChange(selected);
		const verification = verificationFrom(state);
		const content: CheckpointContent = canonicalContent({
			version: 1, mode: sdd ? "sdd" : "adhoc", change: sdd ? selected : null,
			stateRef: validStateRef(state.git.stateRef) ? state.git.stateRef : null, capturedAt: facts.capturedAt,
			objective: facts.objective, completed: facts.completed, nextAction: facts.nextAction,
			unresolvedDecisions: facts.unresolvedDecisions, changedPaths: [...paths].sort(), verification,
			warnings: deriveWarnings(state, verification.status),
		});
		const checkpoint = checkpointFrom(content);
		if (serializedBytes(checkpoint) > CONTINUITY_CHECKPOINT_LIMITS.maxSerializedBytes) return { ok: false, reason: "limit-exceeded" };
		return { ok: true, checkpoint };
	} catch { return { ok: false, reason: "invalid-state" }; }
}

function recordWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		&& Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function parseContinuityCheckpoint(input: unknown): ContinuityCheckpointResult {
	try {
		if (typeof input === "string" && new TextEncoder().encode(input).byteLength > CONTINUITY_CHECKPOINT_LIMITS.maxSerializedBytes) return { ok: false, reason: "limit-exceeded" };
		const value: unknown = typeof input === "string" ? JSON.parse(input) : input;
		const keys = ["version", "revision", "mode", "change", "stateRef", "capturedAt", "objective", "completed", "nextAction", "unresolvedDecisions", "changedPaths", "verification", "warnings"] as const;
		if (!recordWithKeys(value, keys) || value.version !== 1 || typeof value.revision !== "string" || !REVISION.test(value.revision)
			|| (value.mode !== "adhoc" && value.mode !== "sdd") || (value.mode === "adhoc" ? value.change !== null : !safeChange(value.change))
			|| (value.stateRef !== null && !validStateRef(value.stateRef)) || !validIsoTimestamp(value.capturedAt)) return { ok: false, reason: "invalid-checkpoint" };
		const facts = { capturedAt: value.capturedAt, objective: value.objective, completed: value.completed, nextAction: value.nextAction, unresolvedDecisions: value.unresolvedDecisions };
		const factsError = validateFacts(facts as ContinuityCheckpointFacts); if (factsError) return { ok: false, reason: factsError };
		if (!Array.isArray(value.changedPaths)) return { ok: false, reason: "invalid-checkpoint" };
		if (value.changedPaths.length > CONTINUITY_CHECKPOINT_LIMITS.maxChangedPaths) return { ok: false, reason: "limit-exceeded" };
		const changedPaths = value.changedPaths;
		if (changedPaths.some((path) => !safePath(path)) || new Set(changedPaths).size !== changedPaths.length
			|| [...changedPaths].sort().some((path, index) => path !== changedPaths[index])) return { ok: false, reason: "invalid-path" };
		if (!recordWithKeys(value.verification, ["status", "observedStateRef"])) return { ok: false, reason: "invalid-checkpoint" };
		const statuses: readonly unknown[] = ["fresh", "stale", "failed", "not-run", "unknown"];
		if (!statuses.includes(value.verification.status) || (value.verification.observedStateRef !== null && !validStateRef(value.verification.observedStateRef))) return { ok: false, reason: "invalid-checkpoint" };
		if (!Array.isArray(value.warnings)) return { ok: false, reason: "invalid-checkpoint" };
		if (value.warnings.length > CONTINUITY_CHECKPOINT_LIMITS.maxWarnings) return { ok: false, reason: "limit-exceeded" };
		const warnings = value.warnings;
		if (new Set(warnings).size !== warnings.length || warnings.some((warning) => !WARNING_ORDER.includes(warning as ContinuityWarning))
			|| WARNING_ORDER.filter((warning) => warnings.includes(warning)).some((warning, index) => warning !== warnings[index])) return { ok: false, reason: "invalid-checkpoint" };
		const checkpoint = value as ContinuityCheckpointV1;
		const verificationWarnings = ["verification-stale", "verification-failed", "verification-unknown"] as const;
		const expectedWarning: ContinuityWarning | null = checkpoint.verification.status === "stale" ? "verification-stale"
			: checkpoint.verification.status === "failed" ? "verification-failed" : checkpoint.verification.status === "unknown" ? "verification-unknown" : null;
		const actualVerificationWarnings = verificationWarnings.filter((warning) => checkpoint.warnings.includes(warning));
		if ((checkpoint.verification.status === "fresh" && (checkpoint.stateRef === null || checkpoint.verification.observedStateRef !== checkpoint.stateRef))
			|| (expectedWarning === null ? actualVerificationWarnings.length !== 0 : actualVerificationWarnings.length !== 1 || actualVerificationWarnings[0] !== expectedWarning)) return { ok: false, reason: "invalid-checkpoint" };
		if (serializedBytes(checkpoint) > CONTINUITY_CHECKPOINT_LIMITS.maxSerializedBytes) return { ok: false, reason: "limit-exceeded" };
		if (revisionFor(canonicalContent(checkpoint)) !== checkpoint.revision) return { ok: false, reason: "revision-mismatch" };
		return { ok: true, checkpoint: checkpointFrom(canonicalContent(checkpoint), checkpoint.revision) };
	} catch { return { ok: false, reason: "invalid-checkpoint" }; }
}
