import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

export const REVIEWED_AREA_LEDGER_SCHEMA_VERSION = 1 as const;
export const MAX_SELECTORS = 64;
export const MAX_PATH_BYTES = 512;
export const MAX_RECORDS = 256;
export const MAX_LEDGER_BYTES = 256 * 1024;
const AREA_ID = /^area-v1:sha256:[0-9a-f]{64}$/;
const STATE_REF = /^git-v1:sha256:[0-9a-f]{64}$/;
const EVIDENCE_REFERENCE = /^review-evidence-v1:[0-9a-f]{32,64}$/;
const EVIDENCE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const REVIEWER_REFERENCE = /^reviewer-v1:sha256:[0-9a-f]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const SELECTOR_KINDS = new Set(["file", "tree"]);
const CHANGE_KINDS = new Set([
	"added", "copied", "deleted", "modified", "renamed", "type-changed", "unmerged", "untracked",
]);
const TEXT_ENCODER = new TextEncoder();

export type SelectorKind = "file" | "tree";
export type AreaSelector = Readonly<{ kind: SelectorKind; path: string }>;
export type Area = Readonly<{ id: string; selectors: readonly AreaSelector[] }>;

export type Evidence = Readonly<{
	kind: "human-review";
	reference: string;
	digest: string;
	reviewerRef: string;
}>;
export type GitBinding = Readonly<{ stateRef: string }>;
export type LedgerRecord = Readonly<{
	area: Area;
	status: "reviewed" | "unreviewed";
	evidence?: Evidence;
	git?: GitBinding;
}>;
export type LedgerSnapshot = Readonly<{
	schemaVersion: typeof REVIEWED_AREA_LEDGER_SCHEMA_VERSION;
	records: readonly LedgerRecord[];
}>;

export type GitChange = Readonly<{
	kind: "added" | "copied" | "deleted" | "modified" | "renamed" | "type-changed" | "unmerged" | "untracked";
	path: string;
	previousPath?: string;
	indexStatus?: string;
	worktreeStatus?: string;
}>;
export type GitTransition = Readonly<{
	fromStateRef: string;
	toStateRef: string;
	complete: boolean;
	overflowed?: boolean;
	changes: readonly GitChange[];
}>;
export type CurrentGitState = Readonly<{
	repository: boolean | null;
	complete: boolean;
	quality: string;
	stateRef?: string;
	dirty?: boolean | null;
}>;

export type EvidenceResolution =
	| Readonly<{ status: "verified"; reference: string; digest: string; reviewerRef: string; areaId: string; stateRef: string }>
	| Readonly<{ status: "missing" | "mismatch" | "invalid" | "unavailable" }>;

export type LedgerParseResult =
	| Readonly<{ status: "valid"; ledger: LedgerSnapshot }>
	| Readonly<{ status: "invalid"; reason: "malformed-ledger" }>
	| Readonly<{ status: "unavailable"; reason: "oversized" | "unsupported-version" | "unreadable" }>;

export type LedgerEvaluation = Readonly<{
	outcome: "reviewed" | "unreviewed" | "stale" | "invalid" | "unavailable" | "unknown";
	freshness: "current" | "stale" | "unavailable" | "invalid" | "unknown";
	reason:
		| "exact-git-binding"
		| "no-record"
		| "explicit-unreviewed"
		| "malformed-ledger"
		| "invalid-area"
		| "invalid-evidence"
		| "evidence-mismatch"
		| "evidence-unavailable"
		| "git-state-unavailable"
		| "relevant-git-change"
		| "binding-mismatch-unaffected"
		| "git-transition-unverifiable"
		| "unsupported-version"
		| "ledger-oversized"
		| "ledger-unreadable";
	observedStateRef?: string;
}>;

export class ReviewedAreaLedgerError extends Error {
	readonly code: string;
	constructor(code: string) {
		super(code);
		this.name = "ReviewedAreaLedgerError";
		this.code = code;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
	const keys = Object.keys(value);
	return keys.every((key) => allowed.includes(key)) && allowed.every((key) => !Object.prototype.hasOwnProperty.call(value, key) || keys.includes(key));
}

function utf8Bytes(value: string): number {
	return TEXT_ENCODER.encode(value).byteLength;
}

function byteCompare(left: string, right: string): number {
	return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function validPath(value: unknown): value is string {
	if (typeof value !== "string" || value.length === 0 || utf8Bytes(value) > MAX_PATH_BYTES) return false;
	if (value.includes("\\") || value.includes("\0") || CONTROL.test(value) || value.endsWith("/")) return false;
	if (value.startsWith("/") || value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return false;
	return true;
}

function selectorBoundaryContains(selector: AreaSelector, path: string): boolean {
	return selector.kind === "file" ? selector.path === path : selector.path === path || path.startsWith(`${selector.path}/`);
}

function normalizeSelectors(value: unknown): readonly AreaSelector[] | undefined {
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SELECTORS) return undefined;
	const selectors: AreaSelector[] = [];
	for (const item of value) {
		if (!isRecord(item) || !exactKeys(item, ["kind", "path"]) || !SELECTOR_KINDS.has(String(item.kind)) || !validPath(item.path)) return undefined;
		selectors.push({ kind: item.kind as SelectorKind, path: item.path });
	}
	const ordered = [...selectors].sort((left, right) => byteCompare(`${left.kind}\0${left.path}`, `${right.kind}\0${right.path}`));
	for (let index = 0; index < ordered.length; index += 1) {
		for (let prior = 0; prior < index; prior += 1) {
			const left = ordered[prior]!;
			const right = ordered[index]!;
			if (left.kind === right.kind && left.path === right.path) return undefined;
			if (left.kind === "tree" && selectorBoundaryContains(left, right.path)) return undefined;
			if (right.kind === "tree" && selectorBoundaryContains(right, left.path)) return undefined;
		}
	}
	return Object.freeze(ordered.map((selector) => Object.freeze(selector)));
}

function identityFor(selectors: readonly AreaSelector[]): string {
	const canonical = JSON.stringify(selectors.map((selector) => ({ kind: selector.kind, path: selector.path })));
	return `area-v1:sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

export function canonicalArea(selectors: readonly AreaSelector[]): Area {
	const normalized = normalizeSelectors(selectors);
	if (!normalized) throw new ReviewedAreaLedgerError("invalid-area");
	return freeze({ id: identityFor(normalized), selectors: normalized });
}

export function normalizeArea(input: unknown): Area | null {
	if (!isRecord(input) || !exactKeys(input, ["id", "selectors"])) return null;
	const selectors = normalizeSelectors(input.selectors);
	if (!selectors) return null;
	const id = identityFor(selectors);
	if (input.id !== undefined && (typeof input.id !== "string" || input.id !== id || !AREA_ID.test(input.id))) return null;
	return freeze({ id, selectors });
}

function normalizePersistedArea(input: unknown): Area | null {
	if (!isRecord(input) || !Object.prototype.hasOwnProperty.call(input, "id") || typeof input.id !== "string") return null;
	return normalizeArea(input);
}

export function areaPath(area: Area, path: string): boolean {
	const canonical = normalizeArea(area);
	if (!canonical || !validPath(path)) return false;
	return canonical.selectors.some((selector) => selectorBoundaryContains(selector, path));
}

function normalizeEvidence(value: unknown): Evidence | undefined {
	if (!isRecord(value) || !exactKeys(value, ["kind", "reference", "digest", "reviewerRef"])) return undefined;
	if (value.kind !== "human-review" || typeof value.reference !== "string" || !EVIDENCE_REFERENCE.test(value.reference)) return undefined;
	if (typeof value.digest !== "string" || !EVIDENCE_DIGEST.test(value.digest)) return undefined;
	if (typeof value.reviewerRef !== "string" || !REVIEWER_REFERENCE.test(value.reviewerRef)) return undefined;
	return freeze({ kind: "human-review", reference: value.reference, digest: value.digest, reviewerRef: value.reviewerRef });
}

function normalizeRecord(value: unknown): LedgerRecord | undefined {
	if (!isRecord(value) || !exactKeys(value, ["area", "status", "evidence", "git"])) return undefined;
	const area = normalizePersistedArea(value.area);
	if (!area || (value.status !== "reviewed" && value.status !== "unreviewed")) return undefined;
	if (value.status === "unreviewed") {
		if (value.evidence !== undefined || value.git !== undefined || Object.keys(value).length !== 2) return undefined;
		return freeze({ area, status: "unreviewed" });
	}
	if (!isRecord(value.git) || !exactKeys(value.git, ["stateRef"]) || typeof value.git.stateRef !== "string" || !STATE_REF.test(value.git.stateRef)) return undefined;
	const evidence = normalizeEvidence(value.evidence);
	if (!evidence) return undefined;
	return freeze({ area, status: "reviewed", evidence, git: freeze({ stateRef: value.git.stateRef }) });
}

export function normalizeLedger(input: unknown): LedgerSnapshot | null {
	if (!isRecord(input) || !exactKeys(input, ["schemaVersion", "records"]) || input.schemaVersion !== 1 || !Array.isArray(input.records) || input.records.length > MAX_RECORDS) return null;
	const records: LedgerRecord[] = [];
	for (const value of input.records) {
		const record = normalizeRecord(value);
		if (!record) return null;
		records.push(record);
	}
	records.sort((left, right) => byteCompare(left.area.id, right.area.id));
	for (let index = 1; index < records.length; index += 1) if (records[index - 1]!.area.id === records[index]!.area.id) return null;
	return freeze({ schemaVersion: 1, records: Object.freeze(records) });
}

function serializeArea(area: Area): Record<string, unknown> {
	return {
		id: area.id,
		selectors: area.selectors.map((selector) => ({ kind: selector.kind, path: selector.path })),
	};
}

export function serializeLedger(input: unknown): string {
	const ledger = normalizeLedger(input);
	if (!ledger) throw new ReviewedAreaLedgerError("malformed-ledger");
	const records = ledger.records.map((record) => ({
		area: serializeArea(record.area),
		status: record.status,
		...(record.status === "reviewed" ? { evidence: record.evidence, git: record.git } : {}),
	}));
	const output = `${JSON.stringify({ schemaVersion: 1, records })}\n`;
	if (utf8Bytes(output) > MAX_LEDGER_BYTES) throw new ReviewedAreaLedgerError("oversized");
	return output;
}

function duplicateKeysOrMalformedJson(value: string): boolean {
	let index = 0;
	const whitespace = () => { while (/\s/.test(value[index] ?? "")) index += 1; };
	const stringEnd = (): boolean => {
		if (value[index] !== '"') return false;
		index += 1;
		while (index < value.length) {
			const char = value[index++];
			if (char === "\\") { if (index >= value.length) return false; index += 1; continue; }
			if (char === '"') return true;
			if (char.charCodeAt(0) < 0x20) return false;
		}
		return false;
	};
	const valueEnd = (): boolean => {
		whitespace();
		if (value[index] === "{") {
			index += 1;
			const keys = new Set<string>();
			whitespace();
			if (value[index] === "}") { index += 1; return true; }
			while (index < value.length) {
				whitespace();
				const start = index;
				if (!stringEnd()) return false;
				let key: string;
				try { key = JSON.parse(value.slice(start, index)) as string; } catch { return false; }
				if (keys.has(key)) return false;
				keys.add(key);
				whitespace();
				if (value[index++] !== ":" || !valueEnd()) return false;
				whitespace();
				if (value[index] === "}") { index += 1; return true; }
				if (value[index++] !== ",") return false;
			}
			return false;
		}
		if (value[index] === "[") {
			index += 1;
			whitespace();
			if (value[index] === "]") { index += 1; return true; }
			while (index < value.length) {
				if (!valueEnd()) return false;
				whitespace();
				if (value[index] === "]") { index += 1; return true; }
				if (value[index++] !== ",") return false;
			}
			return false;
		}
		if (value[index] === '"') return stringEnd();
		const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(value.slice(index));
		if (!primitive) return false;
		index += primitive[0].length;
		return true;
	};
	if (!valueEnd()) return true;
	whitespace();
	return index !== value.length;
}

export function parseLedger(input: string | Uint8Array): LedgerParseResult {
	let text: string;
	try {
		const bytes = typeof input === "string" ? TEXT_ENCODER.encode(input) : input;
		if (bytes.byteLength > MAX_LEDGER_BYTES) return { status: "unavailable", reason: "oversized" };
		text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch { return { status: "unavailable", reason: "unreadable" }; }
	if (utf8Bytes(text) > MAX_LEDGER_BYTES) return { status: "unavailable", reason: "oversized" };
	if (!text.endsWith("\n") || duplicateKeysOrMalformedJson(text)) return { status: "invalid", reason: "malformed-ledger" };
	let parsed: unknown;
	try { parsed = JSON.parse(text); } catch { return { status: "invalid", reason: "malformed-ledger" }; }
	if (isRecord(parsed) && typeof parsed.schemaVersion === "number" && parsed.schemaVersion !== 1) return { status: "unavailable", reason: "unsupported-version" };
	const ledger = normalizeLedger(parsed);
	return ledger ? { status: "valid", ledger } : { status: "invalid", reason: "malformed-ledger" };
}

function validTransition(transition: GitTransition, fromStateRef: string, toStateRef: string): boolean {
	if (!isRecord(transition) || transition.complete !== true || transition.overflowed === true || transition.fromStateRef !== fromStateRef || transition.toStateRef !== toStateRef || !Array.isArray(transition.changes) || transition.changes.length > MAX_RECORDS) return false;
	if (!STATE_REF.test(transition.fromStateRef) || !STATE_REF.test(transition.toStateRef)) return false;
	for (const change of transition.changes) {
		if (!isRecord(change) || !CHANGE_KINDS.has(String(change.kind)) || !validPath(change.path)) return false;
		if ((change.kind === "renamed" || change.kind === "copied") && !validPath(change.previousPath)) return false;
		if (change.kind === "deleted" && change.previousPath !== undefined && !validPath(change.previousPath)) return false;
		if (change.kind !== "renamed" && change.kind !== "copied" && change.kind !== "deleted" && change.previousPath !== undefined) return false;
	}
	return true;
}

function transitionPaths(change: GitChange): readonly string[] {
	return change.kind === "renamed" || change.kind === "copied"
		? [change.previousPath!, change.path]
		: change.kind === "deleted" && change.previousPath
			? [change.path, change.previousPath]
			: [change.path];
}

function intersectionStatus(area: Area, transition: GitTransition): "intersects" | "disjoint" | "unverifiable" {
	if (!validTransition(transition, transition.fromStateRef, transition.toStateRef)) return "unverifiable";
	return transition.changes.some((change) => transitionPaths(change).some((path) => areaPath(area, path))) ? "intersects" : "disjoint";
}

export function intersects(area: Area, transition: GitTransition): boolean {
	return intersectionStatus(area, transition) === "intersects";
}

export const transitionIntersects = intersects;

function validCurrentGit(current: CurrentGitState): current is CurrentGitState & { stateRef: string } {
	return isRecord(current) && current.repository === true && current.complete === true && current.quality === "current" && typeof current.stateRef === "string" && STATE_REF.test(current.stateRef);
}

function validEvidenceMatch(record: LedgerRecord, areaId: string, stateRef: string, resolution: EvidenceResolution | undefined): LedgerEvaluation | undefined {
	if (!resolution || resolution.status === "missing") return freeze({ outcome: "unavailable", freshness: "unavailable", reason: "evidence-unavailable" });
	if (resolution.status === "unavailable") return freeze({ outcome: "unavailable", freshness: "unavailable", reason: "evidence-unavailable" });
	if (resolution.status === "invalid") return freeze({ outcome: "invalid", freshness: "invalid", reason: "invalid-evidence" });
	if (resolution.status === "mismatch") return freeze({ outcome: "unknown", freshness: "unknown", reason: "evidence-mismatch" });
	if (!isRecord(resolution) || !exactKeys(resolution, ["status", "reference", "digest", "reviewerRef", "areaId", "stateRef", "kind"]) || (resolution.kind !== undefined && resolution.kind !== "human-review") || resolution.reference !== record.evidence?.reference || resolution.digest !== record.evidence?.digest || resolution.reviewerRef !== record.evidence?.reviewerRef || resolution.areaId !== areaId || resolution.stateRef !== stateRef) return freeze({ outcome: "unknown", freshness: "unknown", reason: "evidence-mismatch" });
	return undefined;
}

export function evaluateReviewedArea(
	input: LedgerSnapshot | LedgerRecord,
	areaId: string,
	current: CurrentGitState,
	transition?: GitTransition,
	evidence?: EvidenceResolution,
): LedgerEvaluation {
	const ledger = isRecord(input) && Array.isArray(input.records) ? normalizeLedger(input) : normalizeLedger({ schemaVersion: 1, records: [input] });
	if (!ledger) return freeze({ outcome: "invalid", freshness: "invalid", reason: "malformed-ledger" });
	if (!AREA_ID.test(areaId)) return freeze({ outcome: "invalid", freshness: "invalid", reason: "invalid-area" });
	const record = ledger.records.find((candidate) => candidate.area.id === areaId);
	if (!record) return freeze({ outcome: "unreviewed", freshness: "unknown", reason: "no-record" });
	if (record.status === "unreviewed") return freeze({ outcome: "unreviewed", freshness: "unknown", reason: "explicit-unreviewed" });
	if (!AREA_ID.test(areaId) || record.area.id !== areaId) return freeze({ outcome: "invalid", freshness: "invalid", reason: "invalid-area" });
	const evidenceResult = validEvidenceMatch(record, areaId, record.git!.stateRef, evidence);
	if (evidenceResult) return evidenceResult;
	if (!validCurrentGit(current)) return freeze({ outcome: "unavailable", freshness: "unavailable", reason: "git-state-unavailable" });
	if (record.git!.stateRef === current.stateRef) return freeze({ outcome: "reviewed", freshness: "current", reason: "exact-git-binding", observedStateRef: current.stateRef });
	if (!transition || !validTransition(transition, record.git!.stateRef, current.stateRef)) return freeze({ outcome: "unknown", freshness: "unknown", reason: "git-transition-unverifiable", observedStateRef: current.stateRef });
	const status = intersectionStatus(record.area, transition);
	if (status === "intersects") return freeze({ outcome: "stale", freshness: "stale", reason: "relevant-git-change", observedStateRef: current.stateRef });
	if (status === "disjoint") return freeze({ outcome: "unknown", freshness: "unknown", reason: "binding-mismatch-unaffected", observedStateRef: current.stateRef });
	return freeze({ outcome: "unknown", freshness: "unknown", reason: "git-transition-unverifiable", observedStateRef: current.stateRef });
}

export const evaluateLedgerRecord = evaluateReviewedArea;

function freeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	Object.freeze(value);
	for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
	return value;
}

export function ledgerDigest(bytes: string | Uint8Array): string {
	return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export { AREA_ID as AREA_ID_PATTERN, STATE_REF as STATE_REF_PATTERN };
