import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { readAgentControlStatus } from "./agent-controls.ts";
import { CLEANER_AUDIT_LIMITS, CleanerAuditScopeError, collectCleanerAuditEvidence } from "./cleaner-audit-evidence.ts";
import { projectProjectState } from "./project-state.ts";
import { resolveChangesDir, resolveSddStatus } from "./sdd-router.ts";

export type SddParticipant = "ein-cleaner" | "ein-architect";

export type SddCleanerSlice = Readonly<{
	id: string;
	ordinal: number;
	start: number;
	end: number;
	paths: readonly string[];
	fileCount: number;
	sourceBytes: number;
}>;

export type SddPlanningBlocker = Readonly<{
	code: "oversized-file" | "non-utf8-source" | "cleaner-scope-rejected" | "scope-unavailable";
	paths: readonly string[];
	reason: string;
}>;

type ChangedFile = Readonly<{ path: string; bytes: number; digest: string; utf8: boolean }>;
type ChangedScope = Readonly<{
	applyId: string;
	files: readonly ChangedFile[];
	paths: readonly string[];
	seal: string;
	plannerId: string;
	slices: readonly SddCleanerSlice[];
	blockers: readonly SddPlanningBlocker[];
}>;

type Outcome = "complete" | "blocked" | "unavailable";

type InFlight = Readonly<{
	toolCallId: string;
	agent: SddParticipant;
	task: string;
	sliceId: string;
	expectedStateRef: string;
}>;

type EphemeralRun = {
	key: string;
	sessionKey: string;
	change: string;
	passageId: string;
	applyId: string;
	scope: readonly string[];
	order: readonly SddParticipant[];
	plannerId: string;
	slices: readonly SddCleanerSlice[];
	planningBlockers: readonly SddPlanningBlocker[];
	sourceSeal: string;
	nextCleaner: number;
	inFlight?: InFlight;
	outcome?: Outcome;
	reason?: string;
};

export type SddParticipantPlan = Readonly<{
	status: "ready" | "complete" | "blocked" | "unavailable";
	passageId: string;
	plannerId: string;
	slices: readonly SddCleanerSlice[];
	planningBlockers: readonly SddPlanningBlocker[];
	order: readonly SddParticipant[];
	sourceSeal?: string;
	next?: Readonly<{ agent: SddParticipant; task: string }>;
	inFlight?: Readonly<{ toolCallId: string; agent: SddParticipant }>;
	blocker?: string;
}>;

export type SddParticipantTerminal = Readonly<{
	status?: "complete" | "blocked" | "unavailable";
	reason?: string;
}>;

export type SddParticipantCall = Readonly<{
	toolCallId: string;
	sessionKey: string;
	change: string;
	passageId: string;
	unit: SddParticipant;
	task: string;
	sliceId: string;
	expectedStateRef: string;
}>;

type TrackedCall = Readonly<{ runKey: string; call: SddParticipantCall }>;

const runs = new Map<string, EphemeralRun>();
const calls = new Map<string, TrackedCall>();
const marker = /\[ein-sdd-participant\/v1 passage=([^\]\s]+) unit=(ein-cleaner|ein-architect) slice=([^\]\s]+) range=(\d+-\d+) state=([^\]\s]+)\]/;
const markerPrefix = "[ein-sdd-participant/v1 ";
const restricted = new Set([".atl", ".git", ".pi", "build", "coverage", "dist", "generated", "node_modules", "runtime", "vendor"]);

function hashIdentity(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compareCanonicalPaths(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function planningBlocker(code: SddPlanningBlocker["code"], paths: readonly string[], reason: string): SddPlanningBlocker {
	return Object.freeze({ code, paths: Object.freeze([...paths]), reason });
}

function isMissingPathError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function planCleanerSlices(files: readonly ChangedFile[], extraBlockers: readonly SddPlanningBlocker[] = []): {
	plannerId: string;
	slices: readonly SddCleanerSlice[];
	blockers: readonly SddPlanningBlocker[];
} {
	const blockers = [
		...files.filter((file) => file.bytes > CLEANER_AUDIT_LIMITS.maxSourceBytes).map((file) => planningBlocker("oversized-file", [file.path], `source bytes ${file.bytes} exceed ${CLEANER_AUDIT_LIMITS.maxSourceBytes}`)),
		...files.filter((file) => !file.utf8).map((file) => planningBlocker("non-utf8-source", [file.path], "source is not valid UTF-8")),
		...extraBlockers,
	];
	const feasible = files.filter((file) => file.bytes <= CLEANER_AUDIT_LIMITS.maxSourceBytes && file.utf8);
	const boundaries: { start: number; end: number; sourceBytes: number }[] = [];
	let start = 0;
	let sourceBytes = 0;
	for (const [index, file] of feasible.entries()) {
		if (index > start && (index - start >= CLEANER_AUDIT_LIMITS.maxFiles || sourceBytes + file.bytes > CLEANER_AUDIT_LIMITS.maxSourceBytes)) {
			boundaries.push({ start, end: index, sourceBytes });
			start = index;
			sourceBytes = 0;
		}
		sourceBytes += file.bytes;
	}
	if (start < feasible.length) boundaries.push({ start, end: feasible.length, sourceBytes });
	const plannerId = hashIdentity([
		"sdd-cleaner-slice-planner-v2",
		CLEANER_AUDIT_LIMITS,
		files.map((file) => [file.path, file.bytes, file.digest, file.utf8]),
		boundaries,
		blockers,
	]);
	const slices = boundaries.map((boundary, ordinal) => {
		const paths = Object.freeze(feasible.slice(boundary.start, boundary.end).map((file) => file.path));
		return Object.freeze({
			id: hashIdentity(["sdd-cleaner-slice-v2", plannerId, ordinal, boundary.start, boundary.end]),
			ordinal,
			start: boundary.start,
			end: boundary.end,
			paths,
			fileCount: boundary.end - boundary.start,
			sourceBytes: boundary.sourceBytes,
		});
	});
	return { plannerId, slices: Object.freeze(slices), blockers: Object.freeze(blockers) };
}

function cleanerContractBlockers(cwd: string, slices: readonly SddCleanerSlice[]): readonly SddPlanningBlocker[] {
	const blockers: SddPlanningBlocker[] = [];
	for (const slice of slices) {
		try {
			const evidence = collectCleanerAuditEvidence(cwd, { kind: "selectors", selectors: slice.paths.map((path) => ({ kind: "file" as const, path })) });
			const accepted = new Set(evidence.files.map((file) => file.path));
			const rejected = slice.paths.filter((path) => !accepted.has(path));
			if (rejected.length) blockers.push(planningBlocker("cleaner-scope-rejected", rejected, "authoritative Cleaner scope contract did not admit every declared selector"));
		} catch (error) {
			const reason = error instanceof CleanerAuditScopeError ? error.code : "authoritative Cleaner scope contract unavailable";
			blockers.push(planningBlocker("cleaner-scope-rejected", slice.paths, reason));
		}
	}
	return Object.freeze(blockers);
}

function changedScope(cwd: string, change: string): ChangedScope {
	const root = projectProjectState({ cwd }).git.root;
	if (!root || !isAbsolute(cwd) || !isAbsolute(root) || resolve(root) !== root) throw new Error("repository root authority is unavailable");
	try {
		const cwdEntry = lstatSync(cwd);
		if (cwdEntry.isSymbolicLink() || !cwdEntry.isDirectory()) throw new Error();
	} catch {
		throw new Error("repository root authority is unavailable");
	}
	if (resolveSddStatus(cwd, change).apply !== "complete") throw new Error("apply is not complete");
	const progressPath = join(resolveChangesDir(root), change, "apply-progress.md");
	let content: string;
	try {
		content = readFileSync(progressPath, "utf8");
	} catch {
		throw new Error("apply-progress.md is unavailable");
	}
	const heading = /^(?:#{1,6}\s+)?(?:files changed|changed files|archivos (?:modificados|cambiados))\s*:?[ \t]*$/im.exec(content);
	if (!heading) throw new Error("apply-progress.md has no bounded files-changed section");
	const sectionStart = heading.index + heading[0].length;
	const remainder = content.slice(sectionStart);
	const nextHeading = remainder.search(/^#{1,6}\s+/m);
	const section = nextHeading < 0 ? remainder : remainder.slice(0, nextHeading);
	const sectionEnd = nextHeading < 0 ? content.length : sectionStart + nextHeading;
	const paths = [...section.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
	if (!paths.length) throw new Error("apply produced no changed-file entries");
	const seen = new Set<string>();
	const missingBlockers: SddPlanningBlocker[] = [];
	const proof: { path: string; dev: number; ino: number; mode: number }[] = [];
	const sealed: { path: string; dev: number; ino: number; mode: number; bytes: number; digest: string; utf8: boolean }[] = [];
	const markMissing = (declared: string): void => {
		missingBlockers.push(planningBlocker("scope-unavailable", [declared], `changed-file path is missing: ${declared}`));
	};
	let authority: ReturnType<typeof lstatSync>;
	try {
		authority = lstatSync(root);
		if (authority.isSymbolicLink() || !authority.isDirectory()) throw new Error();
	} catch {
		throw new Error("repository root authority is unavailable");
	}
	proof.push({ path: root, dev: Number(authority.dev), ino: Number(authority.ino), mode: authority.mode });
	const inspect = (declared: string): void => {
		let current = root;
		const parts = declared.split(/[\\/]/).filter(Boolean);
		for (const [index, part] of parts.entries()) {
			current = join(current, part);
			let entry: ReturnType<typeof lstatSync>;
			try {
				entry = lstatSync(current);
			} catch (error) {
				if (isMissingPathError(error)) {
					markMissing(declared);
					return;
				}
				throw new Error(`changed-file path is unavailable: ${declared}`);
			}
			if (entry.isSymbolicLink()) throw new Error(`changed-file path has a symlink component: ${declared}`);
			const final = index === parts.length - 1;
			if (final ? !entry.isFile() : !entry.isDirectory()) throw new Error(`changed-file ${final ? "path is not a regular file" : "parent is not a real directory"}: ${declared}`);
			if (final) {
				let fileBytes: Buffer;
				try {
					fileBytes = readFileSync(current);
				} catch (error) {
					if (isMissingPathError(error)) {
						markMissing(declared);
						return;
					}
					throw new Error(`changed-file path is unavailable: ${declared}`);
				}
				let utf8 = true;
				try {
					new TextDecoder("utf-8", { fatal: true }).decode(fileBytes);
				} catch {
					utf8 = false;
				}
				proof.push({ path: current, dev: Number(entry.dev), ino: Number(entry.ino), mode: entry.mode });
				sealed.push({ path: declared, dev: Number(entry.dev), ino: Number(entry.ino), mode: entry.mode, bytes: fileBytes.byteLength, digest: createHash("sha256").update(fileBytes).digest("hex"), utf8 });
			} else {
				proof.push({ path: current, dev: Number(entry.dev), ino: Number(entry.ino), mode: entry.mode });
			}
		}
	};
	for (const path of paths) {
		if (path === "." || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`changed-file path is noncanonical: ${path}`);
		if (path.split("/").some((part) => restricted.has(part.toLowerCase()))) throw new Error(`changed-file path is restricted: ${path}`);
		if (seen.has(path)) throw new Error(`duplicate changed-file path: ${path}`);
		seen.add(path);
		inspect(path);
	}
	for (const expected of proof) {
		let entry: ReturnType<typeof lstatSync>;
		try {
			entry = lstatSync(expected.path);
		} catch {
			throw new Error("changed-file path changed during admission");
		}
		if (Number(entry.dev) !== expected.dev || Number(entry.ino) !== expected.ino || entry.mode !== expected.mode) throw new Error("changed-file path changed during admission");
	}
	sealed.sort((a, b) => compareCanonicalPaths(a.path, b.path));
	const files = Object.freeze(sealed.map(({ path, bytes, digest, utf8 }) => Object.freeze({ path, bytes, digest, utf8 })));
	const pathsSorted = Object.freeze([...seen].sort(compareCanonicalPaths));
	const missing = missingBlockers.sort((left, right) => compareCanonicalPaths(left.paths[0]!, right.paths[0]!));
	let planned = planCleanerSlices(files, missing);
	const contractBlockers = cleanerContractBlockers(cwd, planned.slices);
	if (contractBlockers.length) planned = planCleanerSlices(files, [...missing, ...contractBlockers]);
	const seal = `sdd-scope-v1:sha256:${hashIdentity(["sdd-scope-v1", Number(authority.dev), Number(authority.ino), ...sealed.map((entry) => [entry.path, entry.dev, entry.ino, entry.mode, entry.bytes, entry.digest, entry.utf8])])}`;
	const applyId = hashIdentity(["sdd-apply-v1", content.slice(0, sectionStart), pathsSorted, content.slice(sectionEnd)]);
	return { applyId, files, paths: pathsSorted, seal, plannerId: planned.plannerId, slices: planned.slices, blockers: planned.blockers };
}

function runKey(sessionKey: string, change: string): string {
	return `${sessionKey}:${change}`;
}

function passageId(sessionKey: string, change: string, scope: ChangedScope): string {
	return hashIdentity(["sdd-ephemeral-participants-v1", sessionKey, change, scope.applyId, scope.paths]);
}

function configuredOrder(cwd: string, sessionKey: string): readonly SddParticipant[] {
	return Object.freeze(([
		["cleaner", "ein-cleaner"],
		["architect", "ein-architect"],
	] as const).filter(([agent]) => readAgentControlStatus(cwd, sessionKey, agent).enabled).map(([, participant]) => participant));
}

function task(run: EphemeralRun, agent: SddParticipant): string {
	const slice = agent === "ein-cleaner" ? run.slices[run.nextCleaner] : undefined;
	const sliceId = slice?.id ?? "none";
	const start = slice?.start ?? 0;
	const end = slice?.end ?? run.scope.length;
	const selectors = (slice?.paths ?? run.scope).map((path) => ({ kind: "file", path }));
	const action = agent === "ein-cleaner"
		? "Run operational Audit on this exact scope. Improve only through the existing admit/apply/complete contract; otherwise finish the Audit without mutation."
		: "Run read-only architecture Audit on this exact post-Cleaner scope. Never write or execute a write operation.";
	const sliceLine = slice ? `Cleaner planner: ${run.plannerId}\nCleaner slice: ${JSON.stringify(slice)}\n` : "";
	return `[ein-sdd-participant/v1 passage=${run.passageId} unit=${agent} slice=${sliceId} range=${start}-${end} state=${run.sourceSeal}]\nSDD change: ${run.change}\nExact selectors: ${JSON.stringify(selectors)}\n${sliceLine}Cleaner limits: ${JSON.stringify(CLEANER_AUDIT_LIMITS)}\nExecution: foreground-only, one in-flight participant identity.\n${action}\nReturn exactly one terminal status: status: complete or status: blocked, with the concrete reason.`;
}

function planResult(run: EphemeralRun, status: SddParticipantPlan["status"], blocker?: string): SddParticipantPlan {
	const nextAgent = run.outcome
		? undefined
		: run.inFlight?.agent
			?? (run.nextCleaner < run.slices.length && run.order.includes("ein-cleaner")
				? "ein-cleaner"
				: run.order.includes("ein-architect") && run.nextCleaner >= run.slices.length
					? "ein-architect"
					: undefined);
	const next = nextAgent ? { agent: nextAgent, task: run.inFlight?.task ?? task(run, nextAgent) } : undefined;
	return {
		status,
		passageId: run.passageId,
		plannerId: run.plannerId,
		slices: run.slices,
		planningBlockers: run.planningBlockers,
		order: run.order,
		sourceSeal: run.sourceSeal,
		...(next ? { next } : {}),
		...(run.inFlight ? { inFlight: { toolCallId: run.inFlight.toolCallId, agent: run.inFlight.agent } } : {}),
		...(blocker ? { blocker } : {}),
	};
}

function unavailablePlan(sessionKey: string, change: string, reason: string, blockerPaths: readonly string[] = []): SddParticipantPlan {
	const id = hashIdentity(["sdd-ephemeral-unavailable-v1", sessionKey, change, reason, blockerPaths]);
	return {
		status: "unavailable",
		passageId: id,
		plannerId: id,
		slices: [],
		planningBlockers: [planningBlocker("scope-unavailable", blockerPaths, reason)],
		order: [],
		blocker: reason,
	};
}

function sameScope(run: EphemeralRun, scope: ChangedScope): boolean {
	return run.applyId === scope.applyId && run.scope.length === scope.paths.length && run.scope.every((path, index) => path === scope.paths[index]);
}

function observe(run: EphemeralRun, cwd: string): boolean {
	let scope: ChangedScope;
	try {
		scope = changedScope(cwd, run.change);
	} catch (error) {
		run.outcome = "unavailable";
		run.reason = error instanceof Error ? error.message : "current changed scope is unavailable";
		return false;
	}
	if (!sameScope(run, scope) || scope.seal !== run.sourceSeal) {
		run.outcome = "unavailable";
		run.reason = !sameScope(run, scope) ? "changed scope identity drifted outside an accepted Cleaner completion" : "source seal drifted outside an accepted Cleaner completion";
		return false;
	}
	return true;
}

function createRun(cwd: string, sessionKey: string, change: string, scope: ChangedScope): EphemeralRun {
	const order = configuredOrder(cwd, sessionKey);
	const run: EphemeralRun = {
		key: runKey(sessionKey, change),
		sessionKey,
		change,
		passageId: passageId(sessionKey, change, scope),
		applyId: scope.applyId,
		scope: scope.paths,
		order,
		plannerId: scope.plannerId,
		slices: scope.slices,
		planningBlockers: scope.blockers,
		sourceSeal: scope.seal,
		nextCleaner: 0,
	};
	if (scope.blockers.length) {
		run.outcome = "unavailable";
		run.reason = `Cleaner planning is unavailable: ${scope.blockers.map((item) => `${item.paths.join(", ")} (${item.reason})`).join("; ")}`;
	} else if (!order.length || !order.includes("ein-cleaner") && !order.includes("ein-architect")) {
		run.outcome = "complete";
	} else if (!order.includes("ein-cleaner")) {
		run.nextCleaner = scope.slices.length;
	}
	return run;
}

export function planSddParticipants(cwd: string, sessionKey: string, change: string): SddParticipantPlan {
	const key = runKey(sessionKey, change);
	let run = runs.get(key);
	if (!run) {
		let scope: ChangedScope;
		try {
			scope = changedScope(cwd, change);
		} catch (error) {
			return unavailablePlan(sessionKey, change, error instanceof Error ? error.message : "changed scope is unavailable");
		}
		run = createRun(cwd, sessionKey, change, scope);
		runs.set(key, run);
	} else if (!run.outcome && !observe(run, cwd)) {
		return planResult(run, "unavailable", run.reason);
	}
	if (run.outcome) return planResult(run, run.outcome, run.reason);
	if (run.inFlight) return planResult(run, "ready");
	if (run.nextCleaner < run.slices.length && run.order.includes("ein-cleaner")) return planResult(run, "ready");
	if (run.order.includes("ein-architect")) return planResult(run, "ready");
	run.outcome = "complete";
	return planResult(run, "complete");
}

export function admitSddParticipantCall(cwd: string, sessionKey: string, toolCallId: string, agent: SddParticipant, taskText: string): string | null {
	if (!taskText.includes(markerPrefix)) return null;
	const match = marker.exec(taskText);
	if (!match) return "SDD participant unavailable: malformed task identity.";
	const [, passage, unit, sliceId, range, expectedStateRef] = match;
	const run = [...runs.values()].find((candidate) => candidate.sessionKey === sessionKey && candidate.passageId === passage);
	if (!run) return "SDD participant unavailable: unknown or stale task identity.";
	const planned = planSddParticipants(cwd, sessionKey, run.change);
	if (planned.status !== "ready" || planned.next?.agent !== agent) return planned.blocker ?? `SDD participant unavailable: expected ${planned.next?.agent ?? "no participant"}.`;
	if (run.inFlight) return "SDD participant unavailable: a participant is already in flight.";
	const expectedTask = task(run, agent);
	const nextSlice = agent === "ein-cleaner" ? run.slices[run.nextCleaner] : undefined;
	const expectedRange = `${nextSlice?.start ?? 0}-${nextSlice?.end ?? run.scope.length}`;
	if (unit !== agent || sliceId !== (nextSlice?.id ?? "none") || range !== expectedRange || expectedStateRef !== run.sourceSeal) return "SDD participant unavailable: stale or late task identity.";
	// Preserve the entire generated contract; allow the parent to append context
	// and restrictions without misreporting a fresh identity as expired.
	if (taskText !== expectedTask && !taskText.startsWith(`${expectedTask}\n\n`)) return "SDD participant unavailable: generated task contract was altered; request the current plan and preserve it before appending parent constraints.";
	if (!observe(run, cwd)) return `SDD participant unavailable: ${run.reason ?? "source seal is stale"}.`;
	const call: SddParticipantCall = { toolCallId, sessionKey, change: run.change, passageId: run.passageId, unit: agent, task: taskText, sliceId: sliceId!, expectedStateRef: expectedStateRef! };
	run.inFlight = { toolCallId, agent, task: taskText, sliceId: sliceId!, expectedStateRef: expectedStateRef! };
	calls.set(`${run.key}:${toolCallId}`, { runKey: run.key, call });
	return null;
}

export type SddParticipantCompletion = Readonly<{ ok: true; status: Outcome; reason?: string } | { ok: false; reason: string }>;

export function completeSddParticipantCall(cwd: string, sessionKey: string, toolCallId: string, terminal: SddParticipantTerminal): SddParticipantCompletion {
	const entry = [...calls.entries()].find(([, candidate]) => candidate.call.sessionKey === sessionKey && candidate.call.toolCallId === toolCallId);
	const tracked = entry?.[1];
	const run = tracked && runs.get(tracked.runKey);
	if (!tracked || !run || !run.inFlight || run.inFlight.toolCallId !== toolCallId) return { ok: false, reason: "SDD participant unavailable: call identity is not in flight." };
	calls.delete(entry![0]);
	run.inFlight = undefined;
	const status = terminal && terminal.status;
	if (status !== "complete" && status !== "blocked" && status !== "unavailable") {
		run.outcome = "unavailable";
		run.reason = "terminal participant evidence is missing or ambiguous";
		return { ok: true, status: "unavailable", reason: run.reason };
	}
	if (status === "blocked") {
		run.outcome = "blocked";
		run.reason = terminal.reason ?? "participant reported blocked";
		return { ok: true, status, reason: run.reason };
	}
	if (status === "unavailable") {
		run.outcome = "unavailable";
		run.reason = terminal.reason ?? "participant terminal evidence is unavailable";
		return { ok: true, status, reason: run.reason };
	}
	let scope: ChangedScope;
	try {
		scope = changedScope(cwd, run.change);
	} catch (error) {
		run.outcome = "unavailable";
		run.reason = error instanceof Error ? error.message : "changed scope is unavailable";
		return { ok: true, status: "unavailable", reason: run.reason };
	}
	if (!sameScope(run, scope)) {
		run.outcome = "unavailable";
		run.reason = "changed scope identity drifted while the participant was in flight";
		return { ok: true, status: "unavailable", reason: run.reason };
	}
	if (tracked.call.unit === "ein-architect") {
		if (scope.seal !== tracked.call.expectedStateRef) {
			run.outcome = "unavailable";
			run.reason = "Architect source seal changed before terminal completion";
			return { ok: true, status: "unavailable", reason: run.reason };
		}
		run.sourceSeal = scope.seal;
		run.outcome = "complete";
		return { ok: true, status: "complete" };
	}
	run.sourceSeal = scope.seal;
	run.nextCleaner += 1;
	if (scope.blockers.length) {
		run.outcome = "unavailable";
		run.reason = `Cleaner source became unavailable: ${scope.blockers.map((item) => `${item.paths.join(", ")} (${item.reason})`).join("; ")}`;
		return { ok: true, status: "unavailable", reason: run.reason };
	}
	if (run.nextCleaner >= run.slices.length && !run.order.includes("ein-architect")) run.outcome = "complete";
	return { ok: true, status: "complete" };
}

export function getSddParticipantCall(toolCallId: string): SddParticipantCall | null {
	for (const tracked of calls.values()) if (tracked.call.toolCallId === toolCallId) return tracked.call;
	return null;
}

export function sddParticipantCallsAreTracked(): boolean {
	return calls.size > 0;
}

export function consumeSddParticipantCall(toolCallId: string): boolean {
	for (const [key, tracked] of calls) {
		if (tracked.call.toolCallId !== toolCallId) continue;
		calls.delete(key);
		const run = runs.get(tracked.runKey);
		if (run?.inFlight?.toolCallId === toolCallId) run.inFlight = undefined;
		return true;
	}
	return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function terminalResultsOf(details: unknown): Record<string, unknown>[] | null {
	if (!isRecord(details) || !Array.isArray(details.results)) return null;
	const results = details.results.filter((entry): entry is Record<string, unknown> => isRecord(entry) && typeof entry.finalOutput === "string");
	return results.length ? results : null;
}

export function participantResultIsUnrecognized(input: { toolName?: unknown; details?: unknown; hasTrackedCalls?: unknown }): boolean {
	if (!input || !input.hasTrackedCalls) return false;
	if (input.toolName === "subagent_wait") return true;
	if (input.toolName !== "subagent") return false;
	return terminalResultsOf(input.details) === null;
}

export function clearSddParticipantSession(sessionKey: string): void {
	for (const [key, tracked] of calls) if (tracked.call.sessionKey === sessionKey) calls.delete(key);
	for (const [key, run] of runs) if (run.sessionKey === sessionKey) runs.delete(key);
}
