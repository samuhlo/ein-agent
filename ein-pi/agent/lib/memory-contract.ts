import { createHash } from "node:crypto";
import { isAbsolute, join } from "node:path";

export const ENGRAM_TIMEOUT_MS = 1_500;
export const MAX_RETRIEVALS = 5;
export const MAX_SAVES = 10;
export const MAX_CONTEXT_BYTES = 6 * 1024;
export const MAX_SAVE_CONTENT_BYTES = 4 * 1024;

export type EngramProvider = "pi" | "claude";
export function resolveEngramDataDir(provider: EngramProvider, environment: Readonly<Record<string, string | undefined>>): string | undefined {
	const home = environment.HOME;
	return typeof home === "string" && isAbsolute(home) ? join(home, provider === "pi" ? ".engram-pi" : ".engram-cc-ein") : undefined;
}

export const RETRIEVAL_BUDGET = {
	stdoutBytes: 16 * 1024,
	stderrBytes: 4 * 1024,
} as const;

export const SAVE_BUDGET = {
	stdoutBytes: 4 * 1024,
	stderrBytes: 2 * 1024,
} as const;

export type EngramReason =
	| "ok" | "no_results" | "acknowledged" | "binary_missing" | "timeout" | "output_cap"
	| "malformed_output" | "nonzero_exit" | "spawn_error" | "unknown_project"
	| "budget_exhausted" | "duplicate" | "noise_rejected" | "secret_detected" | "invalid_candidate"
	| "no_candidate" | "artifact_gate_failed" | "memory_disabled";

export type MemoryEntry = string | {
	content: string;
	topic?: string;
	projectId?: string;
	timestamp?: string;
};

export type RetrievalResult = {
	operation: "search";
	status: "retrieved" | "empty" | "skipped" | "unavailable" | "failed";
	reason: EngramReason;
	entries: MemoryEntry[];
	exitCode?: number;
};

export type SaveResult = {
	operation: "save";
	status: "saved" | "skipped" | "unavailable" | "failed";
	reason: EngramReason;
	exitCode?: number;
};

export type SearchInput = { query: string; projectId: string };
export type SaveInput = { title: string; content: string; type: string; projectId: string; topic: string };

export interface EngramTransport {
	search(input: SearchInput): Promise<RetrievalResult>;
	save(input: SaveInput): Promise<SaveResult>;
}

export type ProjectIdentity = { kind: "remote" | "root"; id: string } | { kind: "unknown" };
export type ProjectIdentityInput = {
	originFetchRemote?: string | null;
	fetchRemotes?: readonly string[];
	rootCommits?: readonly string[];
};

function digest(value: string, length = 20): string {
	return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function canonicalRemote(remote: string): string | undefined {
	let value = remote.trim().replace(/[?#].*$/, "").replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
	value = value.replace(/^[^/@\s]+@/, "").replace(/^\/+/, "");
	const colon = value.indexOf(":");
	const slash = value.indexOf("/");
	if (colon >= 0 && (slash < 0 || colon < slash)) value = `${value.slice(0, colon)}/${value.slice(colon + 1)}`;
	const [host, ...path] = value.split("/").filter(Boolean);
	const repository = path.join("/").replace(/\.git$/i, "");
	return host && repository && /^[a-z0-9.-]+(?::\d+)?$/i.test(host) && !/\s/.test(repository)
		? `${host.toLowerCase()}/${repository}`
		: undefined;
}

export function resolveProjectIdentity(input: ProjectIdentityInput): ProjectIdentity {
	if (input.originFetchRemote !== undefined && input.originFetchRemote !== null) {
		const origin = canonicalRemote(input.originFetchRemote);
		return origin ? { kind: "remote", id: `ein-git-${digest(origin)}` } : { kind: "unknown" };
	}
	const remotes = input.fetchRemotes ?? [];
	if (remotes.length === 1) {
		const remote = canonicalRemote(remotes[0]);
		if (remote) return { kind: "remote", id: `ein-git-${digest(remote)}` };
		return { kind: "unknown" };
	}
	if (remotes.length > 1) return { kind: "unknown" };
	const roots = [...new Set((input.rootCommits ?? []).map((value) => value.toLowerCase()).filter((value) => /^[a-f0-9]{7,64}$/.test(value)))].sort();
	return roots.length ? { kind: "root", id: `ein-root-${digest(roots.join("\n"))}` } : { kind: "unknown" };
}

export type MemoryType = "decision" | "architecture" | "bugfix" | "pattern" | "config" | "discovery" | "learning";
export type MemoryCandidate = {
	type: MemoryType;
	stableId: string;
	title: string;
	summary: string;
	rationale?: string;
	evidence?: string;
	change?: string;
	phase?: "scope" | "map" | "design" | "tasks" | "apply-progress" | "verify-report" | "close";
};

const SDD_PHASES = new Set(["scope", "map", "design", "tasks", "apply-progress", "verify-report", "close"]);
const FAMILIES: Record<MemoryType, string> = { decision: "decision", architecture: "architecture", bugfix: "bug", pattern: "pattern", config: "constraint", discovery: "discovery", learning: "learning" };

export function generateTopic(candidate: Pick<MemoryCandidate, "type" | "stableId" | "change" | "phase">): string | undefined {
	if (candidate.change && candidate.phase && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.change) && SDD_PHASES.has(candidate.phase)) return `sdd/${candidate.change}/${candidate.phase}`;
	const normalized = candidate.stableId.normalize("NFKC").trim();
	const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
	return slug ? `${FAMILIES[candidate.type]}/${slug}-${digest(normalized, 8)}` : undefined;
}

const encoder = new TextEncoder();
export function limitBytes(value: string, max: number): string {
	if (encoder.encode(value).byteLength <= max) return value;
	let end = value.length;
	while (encoder.encode(value.slice(0, end)).byteLength > max) end -= 1;
	return value.slice(0, end);
}

function scrub(value: string): { value?: string; rejected: boolean } {
	if (/-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/i.test(value)) return { rejected: true };
	const redacted = value
		.replace(/\bauthorization\s*[:=]\s*(?:bearer|basic)\s+[^\s,;]+/gi, "[REDACTED]")
		.replace(/\b(?:token|api[ _-]?key|private[ _-]?key|authorization|password|cookie)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED]")
		.replace(/\b[A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD)\s*=\s*[^\s,;]+/g, "[REDACTED]")
		.replace(/\b(?:bearer|basic)\s+[a-z0-9._~+\/-]+=*/gi, "[REDACTED]")
		.replace(/\b(?:token|api[ _-]?key|private[ _-]?key|authorization|password|cookie)\b/gi, "[REDACTED]");
	return { value: redacted, rejected: false };
}

function isNoise(value: string): boolean {
	return /diff --git|```|^\s*(?:\$ |git |bun test|npm |pnpm |(?:const|let|function|import|export)\b)|^\s*(?:user|assistant|system)\s*:|^\s*\[[A-Z]+\]\s*(?::|>>|->)|\b(?:stack trace|test output)\b/im.test(value);
}

export type ApprovedCandidate = { type: MemoryType; title: string; content: string; topic: string; digest: string };
export function approveCandidate(candidate: MemoryCandidate): { approved?: ApprovedCandidate; reason?: EngramReason } {
	if (!FAMILIES[candidate.type] || !candidate.stableId || !candidate.title || !candidate.summary) return { reason: "invalid_candidate" };
	if (/\b(?:token|api[ _-]?key|private[ _-]?key|authorization|password|cookie)\b/i.test(candidate.stableId)) return { reason: "secret_detected" };
	const source = [candidate.summary, candidate.rationale, candidate.evidence].filter((value): value is string => Boolean(value)).join("\n");
	if (isNoise(source)) return { reason: "noise_rejected" };
	const safe = scrub(source);
	if (safe.rejected || !safe.value || safe.value.replace(/\[REDACTED\]/g, "").trim().length < 3) return { reason: "secret_detected" };
	const title = scrub(candidate.title);
	const topic = generateTopic(candidate);
	if (title.rejected || !title.value || !topic) return { reason: "secret_detected" };
	const content = limitBytes(safe.value, MAX_SAVE_CONTENT_BYTES);
	return { approved: { type: candidate.type, title: limitBytes(title.value, 160), content, topic, digest: digest(content, 64) } };
}

export type Freshness = "fresh" | "stale" | "unverified";
export type PreparedEntry = { content: string; topic?: string; freshness: Freshness };
export function filterRetrievalEntries(entries: MemoryEntry[], projectId: string, now: Date): PreparedEntry[] {
	const parsed = entries.flatMap((entry) => {
		const item = typeof entry === "string" ? { content: entry } : entry;
		if (!item.content || (item.projectId && item.projectId !== projectId) || isNoise(item.content)) return [];
		const safe = scrub(item.content);
		if (safe.rejected || !safe.value) return [];
		const timestamp = item.timestamp ? Date.parse(item.timestamp) : Number.NaN;
		const days = Number.isFinite(timestamp) && timestamp <= now.getTime() ? (now.getTime() - timestamp) / 86_400_000 : Number.NaN;
		if (Number.isFinite(days) && days > 180) return [];
		const freshness: Freshness = Number.isFinite(days) ? (days <= 30 ? "fresh" : "stale") : "unverified";
		return [{ content: safe.value, topic: item.topic, freshness, timestamp: Number.isFinite(timestamp) ? timestamp : -1 }];
	}).sort((a, b) => b.timestamp - a.timestamp);
	const topics = new Set<string>(); let stale = 0; let bytes = 0; const result: PreparedEntry[] = [];
	for (const entry of parsed) {
		const key = entry.topic ?? digest(entry.content, 64);
		if (topics.has(key) || result.length === MAX_RETRIEVALS || (entry.freshness !== "fresh" && stale >= 2)) continue;
		const content = limitBytes(entry.content, MAX_CONTEXT_BYTES - bytes);
		if (!content) break;
		topics.add(key); bytes += encoder.encode(content).byteLength; if (entry.freshness !== "fresh") stale += 1;
		result.push({ content, ...(entry.topic ? { topic: entry.topic } : {}), freshness: entry.freshness });
	}
	return result;
}

export type MemoryReceipt = {
	operation: "search" | "save";
	status: "retrieved" | "empty" | "saved" | "skipped" | "unavailable" | "failed";
	reason: EngramReason;
	lifecycleKey?: string;
	projectHash?: string;
	topic?: string;
	count?: number;
	bytes?: number;
	durationMs: number;
	timestamp: string;
	digest?: string;
};

export function projectHash(project: ProjectIdentity): string | undefined {
	return project.kind === "unknown" ? undefined : digest(project.id, 20);
}
