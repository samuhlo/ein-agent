// =============================================================================
// [CORE] APPLY PACKET OBSERVATION RECORD
// Convierte una observación pre-ejecución en evidencia pequeña para la sesión.
// No guarda el packet, la task ni detalles libres; esos bytes pertenecen a los
// artefactos fuente. El parser es fail-closed y el resumen no lee disco.
// =============================================================================

import { createHash } from "node:crypto";

import type { ApplyPacketIssue, ApplyPacketV2 } from "./apply-packet.ts";

export const APPLY_PACKET_OBSERVATION_CUSTOM_TYPE = "ein.apply-packet-observation";
export const APPLY_PACKET_OBSERVATION_RECORD_FORMAT = "apply-packet-observation/v1";
export const MAX_APPLY_PACKET_OBSERVATION_ISSUES = 32;

export type ApplyPacketObservation =
	| Readonly<{
		status: "executable";
		change: string;
		group: string;
		packet: ApplyPacketV2;
	}>
	| Readonly<{
		status: "incomplete";
		change: string;
		group: string;
		sources?: Readonly<Record<string, string>>;
		issues: readonly ApplyPacketIssue[];
	}>
	| Readonly<{
		status: "rejected";
		change: string;
		group: string;
		code: string;
		detail: string;
		sources?: Readonly<Record<string, string>>;
		issues?: readonly ApplyPacketIssue[];
	}>
	| Readonly<{
		status: "unavailable";
		code: "no-active-change" | "ambiguous-change" | "missing-group" | "unreadable-artifact";
		detail: string;
	}>;

type ObservationStatus = ApplyPacketObservation["status"];
type SourceDigests = Readonly<{ "design.md": string; "tasks.md": string }>;
type IssueRef = Readonly<{ code: string; field: string }>;
type PacketCounts = Readonly<{
	steps: number;
	writablePaths: number;
	checks: number;
	behaviorSeams: number;
}>;

type RecordBase = Readonly<{
	format: typeof APPLY_PACKET_OBSERVATION_RECORD_FORMAT;
	observedAt: string;
	toolCallId: string;
}>;

export type ApplyPacketObservationRecord =
	| Readonly<RecordBase & { status: "executable"; change: string; group: string; sourceDigests: SourceDigests; packetDigest: string; counts: PacketCounts }>
	| Readonly<RecordBase & { status: "incomplete"; change: string; group: string; sourceDigests?: SourceDigests; issueCount: number; issues: readonly IssueRef[] }>
	| Readonly<RecordBase & { status: "rejected"; change: string; group: string; sourceDigests?: SourceDigests; code: string; issueCount: number; issues: readonly IssueRef[] }>
	| Readonly<RecordBase & { status: "unavailable"; code: string }>;

export type ApplyPacketReadinessReport = Readonly<{
	observed: number;
	malformed: number;
	byStatus: Readonly<Record<ObservationStatus, number>>;
	distinctExecutablePackets: number;
	distinctChanges: number;
	currentExecutableStreak: number;
	currentStreakDistinctChanges: number;
	executableRate: Readonly<{ status: "known"; value: number }> | Readonly<{ status: "unknown" }>;
	latestObservedAt: Readonly<{ status: "known"; value: string }> | Readonly<{ status: "unknown" }>;
}>;

const SHA256 = /^[a-f0-9]{64}$/;
const SHA256_REF = /^sha256:[a-f0-9]{64}$/;
const CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TEXT_BYTES = 512;

function hash(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function boundedReference(value: string): string {
	if (Buffer.byteLength(value, "utf8") <= MAX_TEXT_BYTES) return value;
	const suffix = `…sha256:${hash(value)}`;
	let prefix = value.slice(0, MAX_TEXT_BYTES - Buffer.byteLength(suffix, "utf8"));
	while (Buffer.byteLength(`${prefix}${suffix}`, "utf8") > MAX_TEXT_BYTES) prefix = prefix.slice(0, -1);
	return `${prefix}${suffix}`;
}

function knownCode(value: string): string {
	if (!CODE.test(value) || Buffer.byteLength(value, "utf8") > MAX_TEXT_BYTES) {
		throw new TypeError("Apply packet observation code is not bounded kebab-case");
	}
	return value;
}

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right, "en"))
			.map(([key, child]) => [key, canonical(child)]),
	);
}

export function applyPacketDigest(packet: ApplyPacketV2): string {
	return `sha256:${hash(JSON.stringify(canonical(packet)))}`;
}

function exactSources(value: unknown): SourceDigests | null {
	if (!isRecord(value) || !exactKeys(value, ["design.md", "tasks.md"])) return null;
	return typeof value["design.md"] === "string" && SHA256.test(value["design.md"])
		&& typeof value["tasks.md"] === "string" && SHA256.test(value["tasks.md"])
		? { "design.md": value["design.md"], "tasks.md": value["tasks.md"] }
		: null;
}

function issueRefs(issues: readonly ApplyPacketIssue[] | undefined): IssueRef[] {
	const seen = new Set<string>();
	const refs: IssueRef[] = [];
	for (const issue of issues ?? []) {
		const key = `${issue.code}\0${issue.field}`;
		if (seen.has(key)) continue;
		seen.add(key);
		refs.push({ code: knownCode(issue.code), field: boundedReference(issue.field) });
		if (refs.length === MAX_APPLY_PACKET_OBSERVATION_ISSUES) break;
	}
	return refs;
}

function packetCounts(packet: ApplyPacketV2): PacketCounts {
	return {
		steps: packet.steps.length,
		writablePaths: packet.writeAllowlist.length,
		checks: packet.checks.length,
		behaviorSeams: packet.behaviorSeams.length,
	};
}

export function createApplyPacketObservationRecord(
	observation: ApplyPacketObservation,
	identity: Readonly<{ observedAt: string; toolCallId: string }>,
): ApplyPacketObservationRecord {
	if (!exactIso(identity.observedAt) || !identity.toolCallId.trim()) {
		throw new TypeError("Apply packet observation identity is invalid");
	}
	const base: RecordBase = {
		format: APPLY_PACKET_OBSERVATION_RECORD_FORMAT,
		observedAt: identity.observedAt,
		toolCallId: boundedReference(identity.toolCallId),
	};
	if (observation.status === "executable") {
		return {
			...base,
			status: observation.status,
			change: boundedReference(observation.change),
			group: boundedReference(observation.group),
			sourceDigests: observation.packet.sources as SourceDigests,
			packetDigest: applyPacketDigest(observation.packet),
			counts: packetCounts(observation.packet),
		};
	}
	if (observation.status === "incomplete") {
		return {
			...base,
			status: observation.status,
			change: boundedReference(observation.change),
			group: boundedReference(observation.group),
			...(observation.sources ? { sourceDigests: observation.sources as SourceDigests } : {}),
			issueCount: observation.issues.length,
			issues: issueRefs(observation.issues),
		};
	}
	if (observation.status === "rejected") {
		return {
			...base,
			status: observation.status,
			change: boundedReference(observation.change),
			group: boundedReference(observation.group),
			...(observation.sources ? { sourceDigests: observation.sources as SourceDigests } : {}),
			code: knownCode(observation.code),
			issueCount: observation.issues?.length ?? 0,
			issues: issueRefs(observation.issues),
		};
	}
	return { ...base, status: observation.status, code: knownCode(observation.code) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function boundedText(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= MAX_TEXT_BYTES;
}

function exactIso(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try { return new Date(value).toISOString() === value; } catch { return false; }
}

function natural(value: unknown, positive = false): value is number {
	return Number.isSafeInteger(value) && (value as number) >= (positive ? 1 : 0);
}

function parseIssues(value: unknown, total: unknown): readonly IssueRef[] | null {
	if (!Array.isArray(value) || value.length > MAX_APPLY_PACKET_OBSERVATION_ISSUES || !natural(total) || total < value.length) return null;
	const seen = new Set<string>();
	const result: IssueRef[] = [];
	for (const candidate of value) {
		if (!isRecord(candidate) || !exactKeys(candidate, ["code", "field"]) || !boundedText(candidate.code) || !CODE.test(candidate.code) || !boundedText(candidate.field)) return null;
		const key = `${candidate.code}\0${candidate.field}`;
		if (seen.has(key)) return null;
		seen.add(key);
		result.push({ code: candidate.code, field: candidate.field });
	}
	return result;
}

/** Devuelve null para cualquier forma desconocida; nunca repara evidencia. */
export function parseApplyPacketObservationRecord(value: unknown): ApplyPacketObservationRecord | null {
	if (!isRecord(value) || value.format !== APPLY_PACKET_OBSERVATION_RECORD_FORMAT || !exactIso(value.observedAt) || !boundedText(value.toolCallId)) return null;
	const base = { format: APPLY_PACKET_OBSERVATION_RECORD_FORMAT, observedAt: value.observedAt, toolCallId: value.toolCallId } as const;
	if (value.status === "executable") {
		if (!exactKeys(value, ["change", "counts", "format", "group", "observedAt", "packetDigest", "sourceDigests", "status", "toolCallId"]) || !boundedText(value.change) || !boundedText(value.group) || typeof value.packetDigest !== "string" || !SHA256_REF.test(value.packetDigest)) return null;
		const sourceDigests = exactSources(value.sourceDigests);
		const counts = value.counts;
		if (!sourceDigests || !isRecord(counts) || !exactKeys(counts, ["behaviorSeams", "checks", "steps", "writablePaths"]) || !natural(counts.steps, true) || !natural(counts.writablePaths, true) || !natural(counts.checks, true) || !natural(counts.behaviorSeams, true)) return null;
		return { ...base, status: value.status, change: value.change, group: value.group, sourceDigests, packetDigest: value.packetDigest, counts: counts as PacketCounts };
	}
	if (value.status === "incomplete" || value.status === "rejected") {
		const required = value.status === "rejected" ? ["change", "code", "format", "group", "issueCount", "issues", "observedAt", "status", "toolCallId"] : ["change", "format", "group", "issueCount", "issues", "observedAt", "status", "toolCallId"];
		const allowed = value.sourceDigests === undefined ? required : [...required, "sourceDigests"];
		if (!exactKeys(value, allowed) || !boundedText(value.change) || !boundedText(value.group)) return null;
		const issues = parseIssues(value.issues, value.issueCount);
		const sourceDigests = value.sourceDigests === undefined ? undefined : exactSources(value.sourceDigests);
		if (!issues || (value.sourceDigests !== undefined && !sourceDigests)) return null;
		if (value.status === "rejected") {
			if (!boundedText(value.code) || !CODE.test(value.code)) return null;
			return { ...base, status: value.status, change: value.change, group: value.group, ...(sourceDigests ? { sourceDigests } : {}), code: value.code, issueCount: value.issueCount as number, issues };
		}
		return { ...base, status: value.status, change: value.change, group: value.group, ...(sourceDigests ? { sourceDigests } : {}), issueCount: value.issueCount as number, issues };
	}
	if (value.status === "unavailable") {
		if (!exactKeys(value, ["code", "format", "observedAt", "status", "toolCallId"]) || !boundedText(value.code) || !CODE.test(value.code)) return null;
		return { ...base, status: value.status, code: value.code };
	}
	return null;
}

export function summarizeApplyPacketObservations(
	records: readonly ApplyPacketObservationRecord[],
	malformed: number,
): ApplyPacketReadinessReport {
	const byStatus = { executable: 0, incomplete: 0, rejected: 0, unavailable: 0 };
	for (const record of records) byStatus[record.status] += 1;
	const distinctExecutablePackets = new Set(records.filter((record) => record.status === "executable").map((record) => record.packetDigest)).size;
	const withChange = records.filter((record) => record.status !== "unavailable");
	const distinctChanges = new Set(withChange.map((record) => record.change)).size;
	const ordered = [...records].sort((left, right) => left.observedAt.localeCompare(right.observedAt, "en") || left.toolCallId.localeCompare(right.toolCallId, "en"));
	const streak = ordered.slice().reverse().findIndex((record) => record.status !== "executable");
	const currentExecutableStreak = streak === -1 ? ordered.length : streak;
	const streakRecords = currentExecutableStreak === 0 ? [] : ordered.slice(-currentExecutableStreak);
	const currentStreakDistinctChanges = new Set(streakRecords.filter((record) => record.status === "executable").map((record) => record.change)).size;
	const latest = ordered.at(-1)?.observedAt;
	return {
		observed: records.length,
		malformed,
		byStatus,
		distinctExecutablePackets,
		distinctChanges,
		currentExecutableStreak,
		currentStreakDistinctChanges,
		executableRate: records.length > 0 ? { status: "known", value: byStatus.executable / records.length } : { status: "unknown" },
		latestObservedAt: latest ? { status: "known", value: latest } : { status: "unknown" },
	};
}
