import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { readAgentControlStatus } from "./agent-controls.ts";
import { withSddParticipants, type SddParticipantsCheckpoint } from "./continuity-checkpoint.ts";
import { readContinuityCheckpoint, writeContinuityCheckpoint } from "./continuity-checkpoint-store.ts";
import { projectProjectState } from "./project-state.ts";
import { resolveChangesDir, resolveSddStatus } from "./sdd-router.ts";

export type SddParticipant = "ein-cleaner" | "ein-architect";
type Passage = { id: string; change: string; scope: string[]; order: SddParticipant[]; stateRef: string; participants: SddParticipantsCheckpoint };
export type SddParticipantPlan = Readonly<{ status: "ready" | "complete" | "blocked"; passageId: string; order: readonly SddParticipant[]; next?: Readonly<{ agent: SddParticipant; task: string }>; blocker?: string }>;

const passages = new Map<string, Passage>();
const callPassages = new Map<string, { key: string; agent: SddParticipant; sessionKey: string }>();
const running = new Set<string>();
const marker = /\[ein-sdd-participant\/v1 passage=([a-f0-9]{64}) state=([^\]\s]+)\]/;
const restricted = new Set([".atl", ".git", ".pi", "build", "coverage", "dist", "generated", "node_modules", "runtime", "vendor"]);

function changedScope(cwd: string, change: string): { applyId: string; paths: string[]; seal: string } {
	const root = projectProjectState({ cwd }).git.root;
	if (!root || !isAbsolute(cwd) || !isAbsolute(root) || resolve(root) !== root) throw new Error("SDD participants blocked: repository root authority is unavailable.");
	try { const cwdEntry = lstatSync(cwd); if (cwdEntry.isSymbolicLink() || !cwdEntry.isDirectory()) throw new Error(); } catch { throw new Error("SDD participants blocked: repository root authority is unavailable."); }
	const path = join(resolveChangesDir(root), change, "apply-progress.md");
	let content: string, bytes: Buffer;
	try { bytes = readFileSync(path); content = bytes.toString("utf8"); } catch { throw new Error("SDD participants blocked: apply-progress.md is unavailable."); }
	const heading = /^(?:#{1,6}\s+)?(?:files changed|changed files|archivos (?:modificados|cambiados))\s*:?[ \t]*$/im.exec(content);
	if (!heading) throw new Error("SDD participants blocked: apply-progress.md has no bounded files-changed section.");
	const section = content.slice(heading.index + heading[0].length).split(/^#{1,6}\s+/m, 1)[0] ?? "";
	const paths = [...section.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
	if (!paths.length) throw new Error("SDD participants blocked: apply produced no changed-file entries.");
	const seen = new Set<string>(), proof: { path: string; dev: number; ino: number; mode: number }[] = [];
	const sealed: { path: string; dev: number; ino: number; mode: number; digest: string }[] = [];
	let authority: ReturnType<typeof lstatSync>; try { authority = lstatSync(root); if (authority.isSymbolicLink() || !authority.isDirectory()) throw new Error(); } catch { throw new Error("SDD participants blocked: repository root authority is unavailable."); }
	proof.push({ path: root, dev: Number(authority.dev), ino: Number(authority.ino), mode: authority.mode });
	const inspect = (declared: string, finalFile: boolean): void => {
		let current = root;
		const parts = declared.split(/[\\/]/).filter(Boolean); for (const [index, part] of parts.entries()) {
			current = join(current, part); let entry: ReturnType<typeof lstatSync>; try { entry = lstatSync(current); } catch { throw new Error(`SDD participants blocked: changed-file path is missing: ${declared}`); }
			if (entry.isSymbolicLink()) throw new Error(`SDD participants blocked: changed-file path has a symlink component: ${declared}`);
			const final = index === parts.length - 1; if (finalFile && final ? !entry.isFile() : !entry.isDirectory()) throw new Error(`SDD participants blocked: changed-file ${final ? "path is not a regular file" : "parent is not a real directory"}: ${declared}`); proof.push({ path: current, dev: Number(entry.dev), ino: Number(entry.ino), mode: entry.mode });
			if (finalFile && final) {
				let fileBytes: Buffer; try { fileBytes = readFileSync(current); } catch { throw new Error(`SDD participants blocked: changed-file path is missing: ${declared}`); }
				sealed.push({ path: declared, dev: Number(entry.dev), ino: Number(entry.ino), mode: entry.mode, digest: createHash("sha256").update(fileBytes).digest("hex") });
			}
		}
	};
	for (const path of paths) {
		if (path === "." || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`SDD participants blocked: changed-file path is noncanonical: ${path}`);
		if (path.split("/").some((part) => restricted.has(part.toLowerCase()))) throw new Error(`SDD participants blocked: changed-file path is restricted: ${path}`);
		if (seen.has(path)) throw new Error(`SDD participants blocked: duplicate changed-file path: ${path}`);
		seen.add(path);
		inspect(path, true);
	}
	for (const expected of proof) { let entry: ReturnType<typeof lstatSync>; try { entry = lstatSync(expected.path); } catch { throw new Error("SDD participants blocked: changed-file path changed during admission."); } if (Number(entry.dev) !== expected.dev || Number(entry.ino) !== expected.ino || entry.mode !== expected.mode) throw new Error("SDD participants blocked: changed-file path changed during admission."); }
	sealed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	const seal = `sdd-scope-v1:sha256:${createHash("sha256").update(JSON.stringify(["sdd-scope-v1", Number(authority.dev), Number(authority.ino), ...sealed.map((entry) => [entry.path, entry.dev, entry.ino, entry.mode, entry.digest])])).digest("hex")}`;
	return { applyId: createHash("sha256").update(bytes).digest("hex"), paths: [...paths].sort(), seal };
}

// `order` is intentionally OUT of the identity hash (`// 003 B-2`): a passage
// identifies WHICH bytes are audited, not WHO audits them. That is what lets
// disabling a participant mid-passage release it without moving the
// `passageId` and orphaning `running`/`callPassages` for a call in flight.
function participantId(value: SddParticipantsCheckpoint): string {
	return createHash("sha256").update(JSON.stringify({ change: value.change, applyId: value.applyId, scopeId: value.scopeId, beforeStateRef: value.beforeStateRef })).digest("hex");
}

// The order effective for planning/admission is filtered at READ time; the
// durable `order` is NEVER narrowed on write, so the checkpoint invariant
// "evidence subset order" (`continuity-checkpoint.ts:250`) stays intact by
// construction (`// 003 B-2` regla 2).
// Only an EXPLICIT session override (an operator's own `/ein:cleaner off` in
// the session that owns this passage) can shrink the effective order; a bare
// project-config default (e.g. a brand-new session after a crash, or a
// different session that never touched this passage) must not silently drop
// pending work it never opted out of. `readAgentControlStatus` already tells
// the two apart via `source`.
function disabledByThisSession(cwd: string, sessionKey: string, agent: "cleaner" | "architect"): boolean {
	const status = readAgentControlStatus(cwd, sessionKey, agent);
	return status.source === "session override" && !status.enabled;
}

function effectiveOrder(cwd: string, sessionKey: string, durable: SddParticipantsCheckpoint): SddParticipant[] {
	return durable.order.filter((agent) => {
		const has = agent === "ein-cleaner" ? durable.cleaner !== null : durable.architect !== null;
		if (has) return true;
		const short = agent === "ein-cleaner" ? "cleaner" : "architect";
		return !disabledByThisSession(cwd, sessionKey, short);
	});
}

function passage(cwd: string, sessionKey: string, change: string): Passage {
	if (resolveSddStatus(cwd, change).apply !== "complete") throw new Error("SDD participants blocked: apply is not complete.");
	const scoped = changedScope(cwd, change);
	const currentState = scoped.seal;
	const scopeId = createHash("sha256").update(JSON.stringify(scoped.paths)).digest("hex");
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const read = readContinuityCheckpoint(cwd, { mode: "sdd", change });
		if (read.status !== "valid" || read.checkpoint.mode !== "sdd" || read.checkpoint.change !== change) throw new Error("SDD participants blocked: no valid current SDD continuity checkpoint.");
		let durable = read.checkpoint.sddParticipants;
		const expectedState = durable?.architect?.observedStateRef ?? durable?.cleaner?.afterStateRef ?? durable?.beforeStateRef;
		if (!durable || durable.change !== change || durable.applyId !== scoped.applyId || durable.scopeId !== scopeId || expectedState !== currentState) {
			const order = (["cleaner", "architect"] as const).filter((agent) => readAgentControlStatus(cwd, sessionKey, agent).enabled).map((agent) => `ein-${agent}` as SddParticipant);
			durable = { change, applyId: scoped.applyId, scopeId, beforeStateRef: currentState, order, cleaner: null, architect: null };
			const desired = withSddParticipants(read.checkpoint, durable);
			if (!desired.ok) throw new Error("SDD participants blocked: participant checkpoint is invalid.");
			const written = writeContinuityCheckpoint(cwd, { mode: "sdd", change }, desired.checkpoint, { kind: "revision", revision: read.checkpoint.revision });
			const verified = readContinuityCheckpoint(cwd, { mode: "sdd", change });
			if (!written.ok && !(written.outcome === "published-unverified" && verified.status === "valid" && verified.checkpoint.revision === desired.checkpoint.revision)) {
				if (written.reason === "conflict") continue;
				throw new Error("SDD participants blocked: participant checkpoint publication is unverified.");
			}
		}
		const id = participantId(durable), key = `${sessionKey}:${change}:${id}`;
		const created = { id, change, scope: scoped.paths, order: effectiveOrder(cwd, sessionKey, durable), stateRef: durable.cleaner?.afterStateRef ?? durable.beforeStateRef, participants: durable };
		passages.set(key, created);
		return created;
	}
	throw new Error("SDD participants blocked: participant checkpoint changed concurrently.");
}

function task(value: Passage, agent: SddParticipant): string {
	const scope = value.scope.map((path) => ({ kind: "file", path }));
	const action = agent === "ein-cleaner"
		? "Run operational Audit on this exact scope. Improve only if the current Audit yields one eligible finding and only through the existing admit/apply/complete contract; otherwise finish the Audit without mutation."
		: "Run read-only architecture Audit on this exact post-Cleaner scope. Validate a bound Architect plan only when one is actually supplied; never write or execute a migration.";
	return `[ein-sdd-participant/v1 passage=${value.id} state=${value.stateRef}]\nSDD change: ${value.change}\nExact selectors: ${JSON.stringify(scope)}\n${action}\nReturn exactly one terminal status: status: complete or status: blocked, with the concrete reason.`;
}

export function planSddParticipants(cwd: string, sessionKey: string, change: string): SddParticipantPlan {
	const value = passage(cwd, sessionKey, change);
	const result = (agent: SddParticipant) => agent === "ein-cleaner" ? value.participants.cleaner : value.participants.architect;
	const blocked = value.order.find((agent) => result(agent)?.status === "blocked");
	if (blocked) return { status: "blocked", passageId: value.id, order: value.order, blocker: `${blocked} did not complete; sdd-verify is blocked.` };
	const next = value.order.find((agent) => result(agent)?.status !== "complete");
	if (!next) return { status: "complete", passageId: value.id, order: value.order };
	if (running.has(`${value.id}:${next}`)) return { status: "blocked", passageId: value.id, order: value.order, blocker: `${next} is already running for this apply passage.` };
	return { status: "ready", passageId: value.id, order: value.order, next: { agent: next, task: task(value, next) } };
}

export function admitSddParticipantCall(cwd: string, sessionKey: string, toolCallId: string, agent: SddParticipant, taskText: string): string | null {
	const match = marker.exec(taskText);
	if (!match) return null;
	const active = [...passages.entries()].find(([key, value]) => key.startsWith(`${sessionKey}:`) && value.id === match[1]);
	if (!active) return "SDD participant blocked: unknown or expired apply passage.";
	const [key, value] = active;
	const planned = planSddParticipants(cwd, sessionKey, value.change);
	if (planned.status !== "ready" || planned.next?.agent !== agent) return planned.blocker ?? `SDD participant blocked: expected ${planned.next?.agent ?? "no participant"}.`;
	let recomputed: string; try { recomputed = changedScope(cwd, value.change).seal; } catch { return "SDD participant blocked: source state is stale; request a fresh participant plan."; }
	if (match[2] !== value.stateRef || recomputed !== value.stateRef) return "SDD participant blocked: source state is stale; request a fresh participant plan.";
	running.add(`${value.id}:${agent}`);
	callPassages.set(toolCallId, { key, agent, sessionKey });
	return null;
}

// Terminalidad por FORMA, no por texto (`// 002 A-2`): un handle de
// lanzamiento en background trae `details.results: []` con `runId`/`asyncId`
// (`async-execution.ts:1288`); un resultado terminal trae un `SingleResult`
// real en `details.results[]` (`agent`, `task`, `finalOutput`). Se busca por
// forma, no se adivina por el texto.
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

type TerminalResult = { agent?: unknown; task?: unknown; finalOutput?: unknown };

function terminalResultsOf(details: unknown): TerminalResult[] | null {
	if (!isRecord(details) || !Array.isArray(details.results)) return null;
	const results = details.results.filter((entry): entry is TerminalResult => isRecord(entry) && typeof entry.finalOutput === "string");
	return results.length ? results : null;
}

// Predicado puro (A-3): espejo del canario de admisión. `hasTrackedCalls`
// distingue "no reconozco esta forma" de "no había nada rastreado que perder".
export function participantResultIsUnrecognized(input: { toolName?: unknown; details?: unknown; hasTrackedCalls?: unknown }): boolean {
	if (!input || !input.hasTrackedCalls) return false;
	if (input.toolName === "subagent_wait") return true;
	if (input.toolName !== "subagent") return false;
	return terminalResultsOf(input.details) === null;
}

export function completeSddParticipantCall(cwd: string, toolCallId: string, failed: boolean, output: string, details?: unknown): void {
	const tracked = callPassages.get(toolCallId);
	if (!tracked) return;
	// Un handle de lanzamiento (sin payload terminal reconocible) NO consume el
	// rastreo: dejarlo intacto es lo que convierte un reintento en `blocked`
	// ("already running") en vez de un bucle silencioso (`// 002 A-2`).
	const results = terminalResultsOf(details);
	if (!results && !failed) return;
	callPassages.delete(toolCallId);
	const value = passages.get(tracked.key);
	if (!value) return;
	running.delete(`${value.id}:${tracked.agent}`);
	// B-4: un resultado tardío de un participante que se acaba de desactivar y
	// que no tenía evidencia previa se DESCARTA sin escribir nada. Escribir un
	// `blocked` tardío volvería a bloquear el pasaje que el operador acaba de
	// liberar. Si el participante llegó a mutar el árbol, el sello dejará de
	// casar y `passage()` reacuñará por su cuenta (`// 003 B-4`).
	const short = tracked.agent === "ein-cleaner" ? "cleaner" : "architect";
	const hadEvidence = tracked.agent === "ein-cleaner" ? value.participants.cleaner !== null : value.participants.architect !== null;
	if (!hadEvidence && disabledByThisSession(cwd, tracked.sessionKey, short)) return;
	// Precedencia: un único `finalOutput` manda (misma que aplica
	// `pi-subagents` a sus propios hijos); si no, el texto de `content`.
	const effectiveOutput = results && results.length === 1 && typeof results[0]!.finalOutput === "string" ? (results[0]!.finalOutput as string) : output;
	const statuses = [...effectiveOutput.matchAll(/\bstatus:\s*(complete|blocked|incomplete)\b/ig)].map((match) => match[1]!.toLowerCase());
	if (failed || statuses.length !== 1 || statuses[0] === "incomplete") return;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const read = readContinuityCheckpoint(cwd, { mode: "sdd", change: value.change });
		const durable = read.status === "valid" ? read.checkpoint.sddParticipants : null;
		if (read.status !== "valid" || !durable || participantId(durable) !== value.id) return;
		if (tracked.agent === "ein-cleaner" ? durable.cleaner !== null : durable.architect !== null) return;
		let observed: string; try { observed = changedScope(cwd, value.change).seal; } catch { return; }
		if (tracked.agent === "ein-architect" && observed !== value.stateRef || statuses[0] === "blocked" && observed !== value.stateRef) return;
		const evidence = { status: statuses[0] as "complete" | "blocked", observedStateRef: value.stateRef };
		const next = tracked.agent === "ein-cleaner" ? { ...durable, cleaner: { ...evidence, afterStateRef: observed } } : { ...durable, architect: evidence };
		const desired = withSddParticipants(read.checkpoint, next); if (!desired.ok) return;
		const written = writeContinuityCheckpoint(cwd, { mode: "sdd", change: value.change }, desired.checkpoint, { kind: "revision", revision: read.checkpoint.revision });
		const verified = readContinuityCheckpoint(cwd, { mode: "sdd", change: value.change });
		if (written.ok || written.outcome === "published-unverified" && verified.status === "valid" && verified.checkpoint.revision === desired.checkpoint.revision) return;
		if (written.reason !== "conflict") return;
	}
}

export function guardSddVerify(cwd: string, sessionKey: string, change: string): string | null {
	const plan = planSddParticipants(cwd, sessionKey, change);
	return plan.status === "complete" ? null : plan.blocker ?? `SDD participants pending in order: ${plan.order.join(" -> ")}. Call ein_sdd_participants and run the returned next participant before sdd-verify.`;
}

// A-3: distingue "no reconozco esta forma" de "no había nada rastreado que
// perder" para el canario de recogida.
export function sddParticipantCallsAreTracked(): boolean {
	return callPassages.size > 0;
}

export function clearSddParticipantSession(sessionKey: string): void {
	for (const [callId, tracked] of callPassages) if (tracked.key.startsWith(`${sessionKey}:`)) { running.delete(`${passages.get(tracked.key)?.id ?? ""}:${tracked.agent}`); callPassages.delete(callId); }
	for (const key of passages.keys()) if (key.startsWith(`${sessionKey}:`)) passages.delete(key);
}
