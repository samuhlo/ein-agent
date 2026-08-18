import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";

import {
	CONTINUITY_CHECKPOINT_LIMITS,
	deriveContinuityCheckpoint,
	withSddParticipants,
	type ContinuityCheckpointFacts,
} from "./continuity-checkpoint.ts";
import { continuitySddFacts } from "./continuity-sdd-facts.ts";
import { resolveSddStatus, type SddChangeStatus } from "./sdd-router.ts";
import {
	clearContinuityCheckpoint,
	readContinuityCheckpoint,
	writeContinuityCheckpoint,
	type ContinuityCheckpointExpectation,
	type ContinuityCheckpointLocation,
	type ContinuityCheckpointRead,
} from "./continuity-checkpoint-store.ts";
import { auditContinuityReadiness, type ContinuityReadinessResult } from "./continuity-readiness.ts";
import { buildContinuityResumeBrief, type ContinuityResumeBriefSuccess } from "./continuity-resume-brief.ts";
import { projectProjectState, type ProjectRuntimeProvider, type ProjectStateV1 } from "./project-state.ts";

export type ContinuityRefreshCode = "refreshed" | "mutation-uncertain" | "refresh-conflict" | "refresh-failed" | "busy" | "disposed";
export type ContinuityClearCode = "cleared" | "checkpoint-absent" | "clear-conflict" | "clear-failed" | "busy" | "disposed";
export type ContinuityProcessObservation = "none" | "active" | "unknown";
export type ContinuityStatus = Readonly<{
	operation: "complete" | "busy" | "disposed";
	checkpoint: "present" | "absent" | "unavailable";
	freshness: "current" | "stale" | "unknown";
	pi: ContinuityReadinessResult;
	claude: ContinuityReadinessResult;
}>;
export type ContinuityPrepareResult = Readonly<{ ok: true; brief: ContinuityResumeBriefSuccess }> | Readonly<{
	ok: false;
	reason: "mutation-uncertain" | "refresh-failed" | "handoff-blocked" | "busy" | "disposed";
	blockers: readonly string[];
}>;

type Ports = Readonly<{
	now: () => string;
	runtimeAvailable: (provider: ProjectRuntimeProvider) => boolean;
	processObservation?: () => ContinuityProcessObservation;
	projectState?: (cwd: string, runtime: ProjectStateV1["runtimes"]) => ProjectStateV1;
	read?: typeof readContinuityCheckpoint;
	write?: typeof writeContinuityCheckpoint;
	clear?: typeof clearContinuityCheckpoint;
	sddStatus?: (cwd: string, change: string) => SddChangeStatus;
	operationGate?: () => Promise<void>;
}>;
export type ContinuityHandoffLifecycle = Readonly<{
	captureInput: (value: unknown) => void;
	refresh: (explicit?: boolean) => Promise<ContinuityRefreshCode>;
	mutationResult: (successful: boolean) => Promise<ContinuityRefreshCode>;
	status: () => Promise<ContinuityStatus>;
	prepare: (target: unknown) => Promise<ContinuityPrepareResult>;
	clear: () => Promise<ContinuityClearCode>;
	markPreparedReplacement: () => void;
	restoreCancelledReplacement: () => void;
	shutdown: () => Promise<ContinuityRefreshCode>;
}>;

const GENERIC: Omit<ContinuityCheckpointFacts, "capturedAt"> = Object.freeze({
	objective: "Continue the current project task safely.",
	completed: Object.freeze([]),
	nextAction: "Inspect current project state and continue from a verified boundary.",
	unresolvedDecisions: Object.freeze([]),
});
const encoder = new TextEncoder();
const CLOSED_BLOCKERS = Object.freeze(["audit-failed"] as const), CLOSED_WARNINGS = Object.freeze([] as const);
const BUSY_READINESS: ContinuityReadinessResult = Object.freeze({ status: "blocked", blockers: CLOSED_BLOCKERS, warnings: CLOSED_WARNINGS });
const BUSY_STATUS: ContinuityStatus = Object.freeze({ operation: "busy", checkpoint: "unavailable", freshness: "unknown", pi: BUSY_READINESS, claude: BUSY_READINESS });
const DISPOSED_STATUS: ContinuityStatus = Object.freeze({ ...BUSY_STATUS, operation: "disposed" });
const DISPOSED_PREPARE: ContinuityPrepareResult = Object.freeze({ ok: false, reason: "disposed", blockers: Object.freeze([]) });

function runtimeMetadata(provider: ProjectRuntimeProvider, available: boolean): ProjectStateV1["runtimes"][ProjectRuntimeProvider] {
	return { provider, availability: available ? "available" : "unavailable", quality: "current", reason: "read-success", capabilities: [], references: [], errors: [] };
}
function locationFor(state: ProjectStateV1, facts: ContinuityCheckpointFacts): ContinuityCheckpointLocation | null {
	const derived = deriveContinuityCheckpoint(state, facts);
	if (!derived.ok) return null;
	return derived.checkpoint.mode === "sdd" ? { mode: "sdd", change: derived.checkpoint.change! } : { mode: "adhoc" };
}
function expectation(read: ContinuityCheckpointRead): ContinuityCheckpointExpectation | null {
	return read.status === "absent" ? { kind: "absent" } : read.status === "valid" ? { kind: "revision", revision: read.checkpoint.revision } : null;
}
function checkpointPresence(read: ContinuityCheckpointRead): ContinuityStatus["checkpoint"] {
	return read.status === "valid" ? "present" : read.status === "absent" ? "absent" : "unavailable";
}
function applicable(read: ContinuityCheckpointRead, location: ContinuityCheckpointLocation): read is Extract<ContinuityCheckpointRead, { status: "valid" }> {
	return read.status === "valid" && read.checkpoint.mode === location.mode && (location.mode === "adhoc" ? read.checkpoint.change === null : read.checkpoint.change === location.change);
}
function freshness(read: ContinuityCheckpointRead, readiness: ContinuityReadinessResult): ContinuityStatus["freshness"] {
	if (read.status !== "valid") return "unknown";
	return readiness.blockers.some((code) => code.startsWith("checkpoint-")) ? "stale" : "current";
}

export function localExecutableAvailable(name: string, pathValue = process.env.PATH): boolean {
	if (!/^[A-Za-z0-9_-]+$/.test(name) || typeof pathValue !== "string") return false;
	return pathValue.split(delimiter).some((directory) => {
		if (!directory) return false;
		try { const path = join(directory, name); accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; }
	});
}

export function createContinuityHandoffLifecycle(cwd: string, ports: Ports): ContinuityHandoffLifecycle {
	const read = ports.read ?? readContinuityCheckpoint, write = ports.write ?? writeContinuityCheckpoint, clearStore = ports.clear ?? clearContinuityCheckpoint;
	let facts: Omit<ContinuityCheckpointFacts, "capturedAt"> = GENERIC, capturedInput: string | null = null;
	let uncertain = false, suppressShutdown = false, disposed = false;
	let active: Promise<unknown> | null = null, pendingAutomatic: Promise<ContinuityRefreshCode> | null = null, shutdownPromise: Promise<ContinuityRefreshCode> | null = null;
	const runtimes = (): ProjectStateV1["runtimes"] => ({ pi: runtimeMetadata("pi", ports.runtimeAvailable("pi")), claude: runtimeMetadata("claude", ports.runtimeAvailable("claude")) });
	const state = (): ProjectStateV1 => ports.projectState?.(cwd, runtimes()) ?? projectProjectState({ cwd, runtime: runtimes() });
	const processObservation = (): ContinuityProcessObservation => ports.processObservation?.() ?? "unknown";
	/**
	 * En un cambio SDD activo el progreso ya está en disco: `tasks.md` dice qué se
	 * completó y cuál es el siguiente pendiente. Sin cambio resuelto o si la
	 * lectura falla se devuelve nada, y los genéricos siguen siendo la verdad.
	 */
	const sddFacts = (observed: ProjectStateV1): Partial<ContinuityCheckpointFacts> => {
		const location = locationFor(observed, { ...facts, capturedAt: ports.now() });
		if (location?.mode !== "sdd") return {};
		try {
			const derived = continuitySddFacts((ports.sddStatus ?? resolveSddStatus)(cwd, location.change), GENERIC.nextAction);
			return derived ?? {};
		} catch { return {}; }
	};
	const start = <T>(operation: () => T): Promise<T> => {
		const running = Promise.resolve().then(async () => { await ports.operationGate?.(); return operation(); }); active = running;
		const release = (): void => { if (active === running) active = null; };
		void running.then(release, release); return running;
	};
	const automatic = (): Promise<ContinuityRefreshCode> => {
		if (disposed) return Promise.resolve("disposed");
		if (!active) return start(() => doRefresh(false));
		if (pendingAutomatic) return pendingAutomatic;
		const running = active;
		pendingAutomatic = running.then(() => disposed ? "disposed" : start(() => doRefresh(false)), () => disposed ? "disposed" : start(() => doRefresh(false)))
			.finally(() => { pendingAutomatic = null; });
		return pendingAutomatic;
	};
	const command = <T>(operation: () => T, busy: T): Promise<T> => {
		return active || pendingAutomatic ? Promise.resolve(busy) : start(operation);
	};
	const current = (): { state: ProjectStateV1; location: ContinuityCheckpointLocation; read: ContinuityCheckpointRead } | null => {
		const observed = state(), location = locationFor(observed, { ...facts, capturedAt: ports.now() });
		return location ? { state: observed, location, read: read(cwd, location) } : null;
	};
		const refreshOnce = (): ContinuityRefreshCode => {
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const observed = state();
			let candidate = { ...facts, ...sddFacts(observed), ...(capturedInput === null ? {} : { objective: capturedInput }), capturedAt: ports.now() };
			let derived = deriveContinuityCheckpoint(observed, candidate);
			if (!derived.ok) { candidate = { ...GENERIC, capturedAt: ports.now() }; derived = deriveContinuityCheckpoint(observed, candidate); }
			if (!derived.ok) return "refresh-failed";
				const location: ContinuityCheckpointLocation = derived.checkpoint.mode === "sdd" ? { mode: "sdd", change: derived.checkpoint.change! } : { mode: "adhoc" };
				const before = read(cwd, location), expected = expectation(before);
				if (!expected) return "refresh-failed";
				if (before.status === "valid" && before.checkpoint.sddParticipants) {
					if (!derived.checkpoint.stateRef) return "refresh-failed";
					const carried = withSddParticipants(derived.checkpoint, before.checkpoint.sddParticipants);
					if (!carried.ok) return "refresh-failed";
					derived = carried;
				}
			const result = write(cwd, location, derived.checkpoint, expected);
			if (result.ok) { facts = { objective: candidate.objective, completed: candidate.completed, nextAction: candidate.nextAction, unresolvedDecisions: candidate.unresolvedDecisions }; capturedInput = null; return "refreshed"; }
			if (result.reason !== "conflict") return "refresh-failed";
		}
		return "refresh-conflict";
	};
	const doRefresh = (explicit: boolean): ContinuityRefreshCode => {
		if (disposed) return "disposed";
		if (uncertain && !explicit) return "mutation-uncertain";
		const result = refreshOnce(); if (explicit && result === "refreshed") uncertain = false; return result;
	};

	try {
		const initialState = state(), initialLocation = locationFor(initialState, { ...GENERIC, capturedAt: ports.now() });
		if (initialLocation) {
			const initial = read(cwd, initialLocation);
			const readiness = auditContinuityReadiness({ state: initialState, checkpoint: initial, target: "pi", mutation: "settled", process: processObservation() });
			if (applicable(initial, initialLocation) && readiness.status !== "blocked") facts = { objective: initial.checkpoint.objective, completed: [...initial.checkpoint.completed], nextAction: initial.checkpoint.nextAction, unresolvedDecisions: [...initial.checkpoint.unresolvedDecisions] };
		}
	} catch { facts = GENERIC; }

	return Object.freeze({
		captureInput(value: unknown): void {
			if (disposed) return;
			capturedInput = typeof value === "string" && value.length > 0 && !/[\u0000-\u001f\u007f]/.test(value)
				&& encoder.encode(value).byteLength <= CONTINUITY_CHECKPOINT_LIMITS.maxObjectiveBytes ? value : null;
		},
		refresh(explicit = false): Promise<ContinuityRefreshCode> { return disposed ? Promise.resolve("disposed") : explicit === true ? command(() => doRefresh(true), "busy") : automatic(); },
		mutationResult(successful: boolean): Promise<ContinuityRefreshCode> {
			if (disposed) return Promise.resolve("disposed");
			if (!successful) { uncertain = true; return Promise.resolve("mutation-uncertain"); }
			return automatic();
		},
		status(): Promise<ContinuityStatus> {
			if (disposed) return Promise.resolve(DISPOSED_STATUS);
			return command(() => {
				const snapshot = current();
				if (!snapshot) {
					const input = { state: state(), checkpoint: { status: "failure", reason: "read-failure" } as const, mutation: uncertain ? "uncertain" as const : "settled" as const, process: processObservation() };
					return Object.freeze({ operation: "complete" as const, checkpoint: "unavailable" as const, freshness: "unknown" as const, pi: auditContinuityReadiness({ ...input, target: "pi" }), claude: auditContinuityReadiness({ ...input, target: "claude" }) });
				}
				const input = { state: snapshot.state, checkpoint: snapshot.read, mutation: uncertain ? "uncertain" as const : "settled" as const, process: processObservation() };
				const pi = auditContinuityReadiness({ ...input, target: "pi" }), claude = auditContinuityReadiness({ ...input, target: "claude" });
				return Object.freeze({ operation: "complete" as const, checkpoint: checkpointPresence(snapshot.read), freshness: freshness(snapshot.read, pi), pi, claude });
			}, BUSY_STATUS);
		},
		prepare(target: unknown): Promise<ContinuityPrepareResult> {
			if (disposed) return Promise.resolve(DISPOSED_PREPARE);
			return command<ContinuityPrepareResult>(() => {
				if (target !== "pi" && target !== "claude") return { ok: false, reason: "handoff-blocked", blockers: ["invalid-input"] };
				const provider: ProjectRuntimeProvider = target;
				if (uncertain) return { ok: false, reason: "mutation-uncertain", blockers: ["mutation-uncertain"] };
				if (doRefresh(false) !== "refreshed") return { ok: false, reason: "refresh-failed", blockers: [] };
				const snapshot = current(); if (!snapshot) return { ok: false, reason: "refresh-failed", blockers: [] };
				const input = { state: snapshot.state, checkpoint: snapshot.read, target: provider, mutation: "settled" as const, process: processObservation() };
				const readiness = auditContinuityReadiness(input); if (readiness.status === "blocked") return Object.freeze({ ok: false, reason: "handoff-blocked", blockers: Object.freeze([...readiness.blockers]) });
				const brief = buildContinuityResumeBrief(input); return brief.ok ? Object.freeze({ ok: true, brief }) : { ok: false, reason: "handoff-blocked", blockers: [] };
			}, { ok: false, reason: "busy", blockers: [] });
		},
		clear(): Promise<ContinuityClearCode> {
			if (disposed) return Promise.resolve("disposed");
			return command(() => {
				const snapshot = current(); if (!snapshot || snapshot.read.status === "failure") return "clear-failed";
				if (snapshot.read.status === "absent") return "checkpoint-absent";
				if (!applicable(snapshot.read, snapshot.location)) return "clear-failed";
				const result = clearStore(cwd, snapshot.location, { kind: "revision", revision: snapshot.read.checkpoint.revision });
				return result.ok ? "cleared" : result.reason === "conflict" ? "clear-conflict" : "clear-failed";
			}, "busy");
		},
		markPreparedReplacement(): void { suppressShutdown = true; },
		restoreCancelledReplacement(): void { suppressShutdown = false; },
		shutdown(): Promise<ContinuityRefreshCode> {
			if (shutdownPromise) return shutdownPromise;
			disposed = true; capturedInput = null; pendingAutomatic = null;
			const running = active;
			if (!running && !suppressShutdown && !uncertain) { let result: ContinuityRefreshCode; try { result = refreshOnce(); } catch { result = "refresh-failed"; } shutdownPromise = Promise.resolve(result); return shutdownPromise; }
			shutdownPromise = running ? running.then(() => "disposed", () => "disposed") : Promise.resolve("disposed");
			return shutdownPromise;
		},
	});
}
