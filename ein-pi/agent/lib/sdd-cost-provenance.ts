import {
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, join, relative, resolve } from "node:path";
import { listActiveChanges, resolveChangesDir } from "./sdd-router.ts";

export const SDD_COST_LEDGER_SCHEMA_VERSION = 1 as const;
export const SDD_PHASES = ["scope", "map", "design", "tasks", "apply", "verify", "close"] as const;
export type SddPhase = (typeof SDD_PHASES)[number];
export type MetricProvenance = "reported" | "estimated" | "unavailable";

export type Metric =
	| { value: number; provenance: "reported" | "estimated"; source: { artifactSha256: string; jsonPointer: string } }
	| { value: null; provenance: "unavailable"; reason: string };

export type SourceBinding = {
	relativePath: string;
	basename: string;
	byteCount: number;
	sha256: string;
	fileIdentity: { dev: string; ino: string; mtimeMs: number };
};

export type FlowManifestV1 = {
	schemaVersion: 1;
	flowId: string;
	changeId: string;
	changeDirectory: { relativePath: string; dev: string; ino: string };
	createdAt: string;
};

export type RunReceiptV1 = {
	schemaVersion: 1;
	identity: { flowId: string; changeId: string; phase: SddPhase; runId: string; attempt: number; retryOrdinal: number };
	timestamps: { startedAt: string; endedAt: string; observedAt: string };
	producerArtifact: SourceBinding & { agent: string | null };
	phaseArtifact: Pick<SourceBinding, "relativePath" | "byteCount" | "sha256">;
	metrics: Record<"inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "providerCostUsd" | "estimatedCostUsd" | "durationMs", Metric>;
	problems: string[];
};

export type RunIdentity = RunReceiptV1["identity"];
export type CandidateSnapshot = SourceBinding;

const PHASE_ARTIFACT: Record<SddPhase, string> = {
	scope: "scope.md", map: "map.md", design: "design.md", tasks: "tasks.md",
	apply: "apply-progress.md", verify: "verify-report.md", close: "summary.md",
};

type PhaseCandidate = CandidateSnapshot & { changeId: string; changeDirectory: string };

export type DelegationObservation = {
	phase: SddPhase;
	startedAt: string;
	metadataBefore: Map<string, CandidateSnapshot>;
	phaseBefore: Map<string, CandidateSnapshot>;
	metadataUnreadableBefore: number;
	phaseUnreadableBefore: number;
};

export type ObservationResult = { receipt: RunReceiptV1 | null; problem: string | null };

export type AggregateV1 = {
	key: { flowId: string; changeId: string; phase?: SddPhase; attempt?: number; retryOrdinal?: number; agent?: string };
	memberRunIds: string[];
	metrics: RunReceiptV1["metrics"];
};

export type SddCostLedgerV1 = {
	schemaVersion: 1;
	flow: FlowManifestV1 | null;
	runs: number;
	memberRunIds: string[];
	receipts: RunReceiptV1[];
	changeAggregate: AggregateV1 | null;
	byPhase: AggregateV1[];
	byAttempt: AggregateV1[];
	byAgent: AggregateV1[];
	problems: Array<{ code: string; message: string; count?: number }>;
	inputTokens: number | null;
	outputTokens: number | null;
	costUsd: number | null;
	durationMs: number | null;
};

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function ledgerRoot(cwd: string): string {
	return join(cwd, ".pi", "ein", "sdd-cost-ledger", "v1");
}

function fileKey(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function directoryIdentity(path: string) {
	const stat = statSync(path);
	return { dev: String(stat.dev), ino: String(stat.ino) };
}

/** Reads a file twice so a rewrite cannot be silently bound to a receipt. */
export function readStableSource(cwd: string, path: string): CandidateSnapshot | null {
	try {
		const absolutePath = resolve(path);
		const before = statSync(absolutePath);
		const bytes = readFileSync(absolutePath);
		const after = statSync(absolutePath);
		if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.size !== after.size) return null;
		return {
			relativePath: relative(cwd, absolutePath),
			basename: basename(absolutePath),
			byteCount: bytes.byteLength,
			sha256: sha256(bytes),
			fileIdentity: { dev: String(after.dev), ino: String(after.ino), mtimeMs: after.mtimeMs },
		};
	} catch {
		return null;
	}
}

/** Captures only byte identities. Names and metadata prose never establish identity. */
export function snapshotMetadataCandidates(cwd: string): Map<string, CandidateSnapshot> {
	const artifacts = join(cwd, ".pi-subagents", "artifacts");
	const snapshot = new Map<string, CandidateSnapshot>();
	try {
		for (const entry of readdirSync(artifacts, { withFileTypes: true })) {
			if (!entry.isFile() || !entry.name.endsWith("_meta.json")) continue;
			const binding = readStableSource(cwd, join(artifacts, entry.name));
			if (binding) snapshot.set(binding.relativePath, binding);
		}
	} catch { /* Missing producer state is an empty snapshot, not an identity guess. */ }
	return snapshot;
}

export function changedCandidates(before: ReadonlyMap<string, CandidateSnapshot>, after: ReadonlyMap<string, CandidateSnapshot>): CandidateSnapshot[] {
	return [...after.values()].filter((candidate) => {
		const previous = before.get(candidate.relativePath);
		return !previous || previous.sha256 !== candidate.sha256 || previous.fileIdentity.mtimeMs !== candidate.fileIdentity.mtimeMs;
	});
}

export function normalizeMetrics(metadata: unknown, artifactSha256: string): RunReceiptV1["metrics"] {
	const usage = typeof metadata === "object" && metadata !== null && typeof (metadata as { usage?: unknown }).usage === "object"
		? (metadata as { usage: Record<string, unknown> }).usage : {};
	const root = metadata as Record<string, unknown> | null;
	const reported = (value: unknown, pointer: string): Metric =>
		typeof value === "number" && Number.isFinite(value) && value >= 0
			? { value, provenance: "reported", source: { artifactSha256, jsonPointer: pointer } }
			: { value: null, provenance: "unavailable", reason: `missing or invalid ${pointer}` };
	const unavailable = (reason: string): Metric => ({ value: null, provenance: "unavailable", reason });
	return {
		inputTokens: reported(usage.input, "/usage/input"),
		outputTokens: reported(usage.output, "/usage/output"),
		cacheReadTokens: unavailable("no supported cache-read field"),
		cacheWriteTokens: unavailable("no supported cache-write field"),
		providerCostUsd: unavailable("no supported provider billing field"),
		estimatedCostUsd: unavailable("no supported estimated cost field"),
		durationMs: reported(root?.durationMs, "/durationMs"),
	};
}

export function getOrCreateFlow(cwd: string, changeId: string, changeDirectory: string, now = new Date()): FlowManifestV1 {
	const absoluteDirectory = resolve(changeDirectory);
	const identity = directoryIdentity(absoluteDirectory);
	const key = fileKey(`${resolve(cwd)}\0${changeId}\0${absoluteDirectory}\0${identity.dev}\0${identity.ino}`);
	const path = join(ledgerRoot(cwd), "flows", key, "flow.json");
	try {
		const existing = JSON.parse(readFileSync(path, "utf8")) as FlowManifestV1;
		if (existing.schemaVersion !== 1 || existing.changeId !== changeId || existing.changeDirectory.dev !== identity.dev || existing.changeDirectory.ino !== identity.ino) {
			throw new Error("flow manifest conflicts with the current change directory");
		}
		return existing;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const flow: FlowManifestV1 = {
		schemaVersion: 1, flowId: randomUUID(), changeId,
		changeDirectory: { relativePath: relative(cwd, absoluteDirectory), ...identity }, createdAt: now.toISOString(),
	};
	mkdirSync(join(ledgerRoot(cwd), "flows", key), { recursive: true });
	writeFileSync(path, `${JSON.stringify(flow)}\n`, { flag: "wx" });
	return flow;
}

function receiptDirectory(cwd: string, flowId: string): string {
	return join(ledgerRoot(cwd), "runs", flowId);
}

export function mintRunIdentity(cwd: string, flow: FlowManifestV1, phase: SddPhase): RunIdentity {
	const directory = receiptDirectory(cwd, flow.flowId);
	let attempt = 1;
	try {
		for (const entry of readdirSync(directory)) {
			try {
				const receipt = JSON.parse(readFileSync(join(directory, entry), "utf8")) as RunReceiptV1;
				if (receipt.identity.phase === phase) attempt = Math.max(attempt, receipt.identity.attempt + 1);
			} catch { /* Invalid sidecars never influence an attempt number. */ }
		}
	} catch { /* First attempt has no receipt directory. */ }
	return { flowId: flow.flowId, changeId: flow.changeId, phase, runId: randomUUID(), attempt, retryOrdinal: attempt - 1 };
}

export function persistReceipt(cwd: string, receipt: RunReceiptV1): RunReceiptV1 {
	const directory = receiptDirectory(cwd, receipt.identity.flowId);
	const path = join(directory, `${receipt.identity.runId}.json`);
	const bytes = `${JSON.stringify(receipt)}\n`;
	mkdirSync(directory, { recursive: true });
	try {
		writeFileSync(path, bytes, { flag: "wx" });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		if (readFileSync(path, "utf8") !== bytes) throw new Error(`immutable receipt collision for run ${receipt.identity.runId}`);
	}
	return receipt;
}

export function createReceipt(input: Omit<RunReceiptV1, "schemaVersion">): RunReceiptV1 {
	return { schemaVersion: SDD_COST_LEDGER_SCHEMA_VERSION, ...input };
}

function phaseCandidates(cwd: string, phase: SddPhase): { candidates: PhaseCandidate[]; unreadable: number } {
	const root = resolveChangesDir(cwd);
	const candidates: PhaseCandidate[] = [];
	let unreadable = 0;
	for (const changeId of listActiveChanges(cwd)) {
		const changeDirectory = join(root, changeId);
		const path = join(changeDirectory, PHASE_ARTIFACT[phase]);
		if (!exists(path)) continue;
		const binding = readStableSource(cwd, path);
		if (!binding) {
			unreadable += 1;
			continue;
		}
		candidates.push({ ...binding, changeId, changeDirectory });
	}
	return { candidates, unreadable };
}

function exists(path: string): boolean {
	try { return statSync(path).isFile(); } catch { return false; }
}

function metadataCandidates(cwd: string): { candidates: CandidateSnapshot[]; unreadable: number } {
	const artifacts = join(cwd, ".pi-subagents", "artifacts");
	const candidates: CandidateSnapshot[] = [];
	let unreadable = 0;
	try {
		for (const entry of readdirSync(artifacts, { withFileTypes: true })) {
			if (!entry.isFile() || !entry.name.endsWith("_meta.json")) continue;
			const binding = readStableSource(cwd, join(artifacts, entry.name));
			if (binding) candidates.push(binding);
			else unreadable += 1;
		}
	} catch { /* Missing producer state is handled as zero candidates. */ }
	return { candidates, unreadable };
}

function changedPhaseCandidates(before: ReadonlyMap<string, CandidateSnapshot>, after: PhaseCandidate[]): PhaseCandidate[] {
	return after.filter((candidate) => {
		const previous = before.get(candidate.relativePath);
		return !previous || previous.sha256 !== candidate.sha256 || previous.fileIdentity.mtimeMs !== candidate.fileIdentity.mtimeMs;
	});
}

/** Starts a local-only observation. It never changes the external subagent input. */
export function beginDelegationObservation(cwd: string, phase: SddPhase, now = new Date()): DelegationObservation {
	const metadata = metadataCandidates(cwd);
	const artifacts = phaseCandidates(cwd, phase);
	return {
		phase,
		startedAt: now.toISOString(),
		metadataBefore: new Map(metadata.candidates.map((candidate) => [candidate.relativePath, candidate])),
		phaseBefore: new Map(artifacts.candidates.map((candidate) => [candidate.relativePath, candidate])),
		metadataUnreadableBefore: metadata.unreadable,
		phaseUnreadableBefore: artifacts.unreadable,
	};
}

function recordProblem(cwd: string, code: string): void {
	const path = join(ledgerRoot(cwd), "problems.json");
	let problems: string[] = [];
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (Array.isArray(parsed)) problems = parsed.filter((value): value is string => typeof value === "string");
	} catch { /* A broken problem log must not prevent an excluded observation. */ }
	problems.push(code.slice(0, 160));
	mkdirSync(ledgerRoot(cwd), { recursive: true });
	writeFileSync(path, `${JSON.stringify(problems.slice(-100))}\n`);
}

function excluded(cwd: string, code: string): ObservationResult {
	recordProblem(cwd, code);
	return { receipt: null, problem: code };
}

/** Resolves both artifacts exactly once, then persists an immutable local receipt or a bounded exclusion. */
export function observeDelegationResult(cwd: string, observation: DelegationObservation, now = new Date()): ObservationResult {
	const phaseScan = phaseCandidates(cwd, observation.phase);
	const metadataScan = metadataCandidates(cwd);
	if (observation.phaseUnreadableBefore > 0 || phaseScan.unreadable > 0) return excluded(cwd, "phase-artifact-unreadable-or-unstable");
	if (observation.metadataUnreadableBefore > 0 || metadataScan.unreadable > 0) return excluded(cwd, "producer-meta-unreadable-or-unstable");
	const phases = changedPhaseCandidates(observation.phaseBefore, phaseScan.candidates);
	if (phases.length !== 1) return excluded(cwd, phases.length === 0 ? "change-unresolved" : "change-ambiguous");
	const metadata = changedCandidates(observation.metadataBefore, new Map(metadataScan.candidates.map((candidate) => [candidate.relativePath, candidate])));
	if (metadata.length !== 1) return excluded(cwd, metadata.length === 0 ? "producer-meta-missing" : "producer-meta-ambiguous");
	const phase = phases[0] as PhaseCandidate;
	const producer = metadata[0] as CandidateSnapshot;
	let parsed: unknown;
	try {
		const bytes = readFileSync(resolve(cwd, producer.relativePath));
		if (sha256(bytes) !== producer.sha256) return excluded(cwd, "producer-meta-unreadable-or-unstable");
		parsed = JSON.parse(bytes.toString("utf8"));
	} catch { return excluded(cwd, "producer-meta-unreadable-or-unstable"); }
	try {
		const flow = getOrCreateFlow(cwd, phase.changeId, phase.changeDirectory, now);
		const receipt = createReceipt({
			identity: mintRunIdentity(cwd, flow, observation.phase),
			timestamps: { startedAt: observation.startedAt, endedAt: now.toISOString(), observedAt: now.toISOString() },
			producerArtifact: { ...producer, agent: null },
			phaseArtifact: phase,
			metrics: normalizeMetrics(parsed, producer.sha256),
			problems: typeof (parsed as { usage?: unknown })?.usage === "object" && (parsed as { usage: Record<string, unknown> }).usage.cost !== undefined ? ["usage.cost semantics unsupported"] : [],
		});
		return { receipt: persistReceipt(cwd, receipt), problem: null };
	} catch {
		return excluded(cwd, "flow-or-receipt-persistence-failed");
	}
}

const METRIC_NAMES = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "providerCostUsd", "estimatedCostUsd", "durationMs"] as const;

type MetricName = (typeof METRIC_NAMES)[number];

function isMetric(value: unknown): value is Metric {
	if (!value || typeof value !== "object") return false;
	const metric = value as Partial<Metric>;
	return metric.provenance === "unavailable"
		? metric.value === null && typeof metric.reason === "string"
		: (metric.provenance === "reported" || metric.provenance === "estimated") &&
			typeof metric.value === "number" && Number.isFinite(metric.value) && metric.value >= 0 &&
			!!metric.source && typeof metric.source.artifactSha256 === "string" && typeof metric.source.jsonPointer === "string";
}

function isReceipt(value: unknown): value is RunReceiptV1 {
	if (!value || typeof value !== "object") return false;
	const receipt = value as Partial<RunReceiptV1>;
	const identity = receipt.identity;
	return receipt.schemaVersion === 1 && !!identity && typeof identity.flowId === "string" &&
		typeof identity.changeId === "string" && SDD_PHASES.includes(identity.phase as SddPhase) &&
		typeof identity.runId === "string" && Number.isSafeInteger(identity.attempt) && identity.attempt > 0 &&
		Number.isSafeInteger(identity.retryOrdinal) && identity.retryOrdinal === identity.attempt - 1 &&
		!!receipt.metrics && METRIC_NAMES.every((name) => isMetric(receipt.metrics![name]));
}

function loadProblems(cwd: string): string[] {
	try {
		const parsed = JSON.parse(readFileSync(join(ledgerRoot(cwd), "problems.json"), "utf8")) as unknown;
		return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : ["problem-log-invalid"];
	} catch { return []; }
}

function currentFlow(cwd: string, changeId: string): FlowManifestV1 | null {
	const directory = join(resolveChangesDir(cwd), changeId);
	try {
		const identity = directoryIdentity(directory);
		const flows = join(ledgerRoot(cwd), "flows");
		const matches = readdirSync(flows).flatMap((entry) => {
			try { return [JSON.parse(readFileSync(join(flows, entry, "flow.json"), "utf8")) as unknown]; } catch { return []; }
		}).filter((value): value is FlowManifestV1 => !!value && typeof value === "object" &&
			(value as FlowManifestV1).schemaVersion === 1 && (value as FlowManifestV1).changeId === changeId &&
			(value as FlowManifestV1).changeDirectory?.dev === identity.dev && (value as FlowManifestV1).changeDirectory?.ino === identity.ino);
		return matches.length === 1 ? matches[0]! : null;
	} catch { return null; }
}

function aggregate(flow: FlowManifestV1, receipts: RunReceiptV1[], key: AggregateV1["key"]): AggregateV1 {
	const metrics = {} as AggregateV1["metrics"];
	for (const name of METRIC_NAMES) {
		const values = receipts.map((receipt) => receipt.metrics[name]);
		if (values.length === 0 || values.some((metric) => metric.provenance === "unavailable")) {
			metrics[name] = { value: null, provenance: "unavailable", reason: "incomplete aggregate" };
			continue;
		}
		const available = values as Array<Exclude<Metric, { provenance: "unavailable" }>>;
		metrics[name] = {
			value: available.reduce((sum, metric) => sum + metric.value, 0),
			provenance: available.some((metric) => metric.provenance === "estimated") ? "estimated" : "reported",
			source: { artifactSha256: "aggregate", jsonPointer: "/receipts" },
		};
	}
	return { key: { flowId: flow.flowId, changeId: flow.changeId, ...key }, memberRunIds: receipts.map((receipt) => receipt.identity.runId).sort(), metrics };
}

/** Reads only validated immutable local sidecars; producer metadata is legacy visibility, never a ledger input. */
export function readSddCostLedger(cwd: string, changeId: string): SddCostLedgerV1 {
	const flow = currentFlow(cwd, changeId);
	const problemCodes = loadProblems(cwd);
	const problems = new Map<string, number>();
	for (const code of problemCodes) problems.set(code, (problems.get(code) ?? 0) + 1);
	if (!flow) {
		try {
			const legacy = readdirSync(join(cwd, ".pi-subagents", "artifacts")).filter((name) => name.endsWith("_meta.json")).length;
			if (legacy) problems.set("legacy-metadata-excluded", legacy);
		} catch { /* Producer artifacts are optional. */ }
		return { schemaVersion: 1, flow: null, runs: 0, memberRunIds: [], receipts: [], changeAggregate: null, byPhase: [], byAttempt: [], byAgent: [], problems: [...problems].map(([code, count]) => ({ code, message: code, count })), inputTokens: null, outputTokens: null, costUsd: null, durationMs: null };
	}
	const byRunId = new Map<string, RunReceiptV1>();
	const conflictedRunIds = new Set<string>();
	try {
		for (const entry of readdirSync(receiptDirectory(cwd, flow.flowId))) {
			try {
				const receipt = JSON.parse(readFileSync(join(receiptDirectory(cwd, flow.flowId), entry), "utf8")) as unknown;
				if (!isReceipt(receipt) || receipt.identity.flowId !== flow.flowId || receipt.identity.changeId !== changeId) { problems.set("sidecar-invalid", (problems.get("sidecar-invalid") ?? 0) + 1); continue; }
				const runId = receipt.identity.runId;
				if (conflictedRunIds.has(runId)) continue;
				const prior = byRunId.get(runId);
				if (prior && JSON.stringify(prior) !== JSON.stringify(receipt)) { byRunId.delete(runId); conflictedRunIds.add(runId); problems.set("run-conflict", (problems.get("run-conflict") ?? 0) + 1); continue; }
				if (!prior) byRunId.set(runId, receipt);
			} catch { problems.set("sidecar-invalid", (problems.get("sidecar-invalid") ?? 0) + 1); }
		}
	} catch { /* No sidecars is a valid empty local ledger. */ }
	const receipts = [...byRunId.values()].sort((left, right) => left.identity.runId.localeCompare(right.identity.runId, "en"));
	const validSources = new Set(receipts.map((receipt) => receipt.producerArtifact.relativePath));
	try {
		const legacy = readdirSync(join(cwd, ".pi-subagents", "artifacts")).filter((name) => name.endsWith("_meta.json") && !validSources.has(relative(cwd, join(cwd, ".pi-subagents", "artifacts", name))));
		if (legacy.length) problems.set("legacy-metadata-excluded", legacy.length);
	} catch { /* Producer artifacts are optional. */ }
	const groups = <T extends string | number>(values: T[], select: (receipt: RunReceiptV1) => T, build: (value: T) => AggregateV1["key"]) => values.sort((a, b) => typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "en")).map((value) => aggregate(flow, receipts.filter((receipt) => select(receipt) === value), build(value)));
	const changeAggregate = aggregate(flow, receipts, {});
	return {
		schemaVersion: 1, flow, runs: receipts.length, memberRunIds: receipts.map((receipt) => receipt.identity.runId), receipts, changeAggregate,
		byPhase: groups([...new Set(receipts.map((receipt) => receipt.identity.phase))], (receipt) => receipt.identity.phase, (phase) => ({ phase })),
		byAttempt: groups([...new Set(receipts.map((receipt) => receipt.identity.attempt))], (receipt) => receipt.identity.attempt, (attempt) => ({ attempt, retryOrdinal: attempt - 1 })),
		byAgent: groups([...new Set(receipts.map((receipt) => receipt.producerArtifact.agent ?? "unattributed"))], (receipt) => receipt.producerArtifact.agent ?? "unattributed", (agent) => ({ agent })),
		problems: [...problems].sort(([left], [right]) => left.localeCompare(right, "en")).map(([code, count]) => ({ code, message: code.replaceAll("-", " "), count })),
		inputTokens: changeAggregate.metrics.inputTokens.value,
		outputTokens: changeAggregate.metrics.outputTokens.value,
		costUsd: changeAggregate.metrics.providerCostUsd.provenance === "reported" ? changeAggregate.metrics.providerCostUsd.value : null,
		durationMs: changeAggregate.metrics.durationMs.value,
	};
}
