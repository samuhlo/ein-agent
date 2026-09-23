import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { readAgreement } from "./intent-agreement.ts";
import { lintPhaseArtifact, type SddPhase } from "./sdd-artifact-validation.ts";
import { isSafeChangeName, PHASE_ARTIFACT, readSddCompletionEvidence, resolveChangesDir } from "./sdd-routing-core.ts";
import type { VerificationFreshness } from "./sdd-verification-receipt.ts";

export type PhaseRunStatus = "complete" | "partial" | "blocked";
export type PhaseRunReference = Readonly<{ version: 1; toolCallId: string; change: string; phase: SddPhase; nonce: string }>;
export type PhaseLaunch = PhaseRunReference & Readonly<{
	root: string; artifact: string; intentKey: string | null; startedAt: string; initialArtifactSha256: string | null;
}>;
export type PhaseCompletion = PhaseRunReference & Readonly<{
	artifactSha256: string; intentKey: string | null; status: PhaseRunStatus; finishedAt: string;
	reason?: string; verificationReceiptSha256?: string;
}>;

type Result<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; code: string; reason: string }>;
type BeginInput = Readonly<{ cwd: string; change: string; phase: SddPhase; toolCallId: string }>;
type FinishInput = Readonly<{ cwd: string; toolCallId: string; nonce: string; status: PhaseRunStatus; reason?: string }>;
type ReadInput = Readonly<{ cwd: string; toolCallId: string }>;
export type PhaseRecovery = Readonly<{
	state: "complete" | "partial" | "blocked" | "unconfirmed" | "invalid";
	reason: string; launch?: PhaseLaunch; completion?: PhaseCompletion;
}>;

export type PhaseReceiptServiceDependencies = Readonly<{
	now: () => string;
	newToken: () => string;
	readVerification: (cwd: string, changePath: string) => VerificationFreshness;
}>;

const PHASES = new Set<SddPhase>(["scope", "map", "design", "tasks", "apply", "verify", "close"]);
const HASH = /^[a-f0-9]{64}$/;
const RUNS = ".phase-runs";

function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function fail<T>(code: string, reason: string): Result<T> { return { ok: false, code, reason }; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function readJson(path: string): unknown { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } }
function intentKey(_root: string, changePath: string, _work: string): string | null {
	const intent = readAgreement(changePath);
	return intent.kind === "valid" && intent.agreement.status === "confirmed" ? intent.agreement.materialKey : null;
}
function fileSha(path: string): string | null {
	try { return lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink() ? sha256(readFileSync(path)) : null; }
	catch { return null; }
}
function parseLaunch(value: unknown): PhaseLaunch | null {
	if (!record(value) || value.version !== 1 || typeof value.toolCallId !== "string" || typeof value.nonce !== "string" ||
		typeof value.root !== "string" || typeof value.change !== "string" || !PHASES.has(value.phase as SddPhase) ||
		typeof value.artifact !== "string" || (value.intentKey !== null && typeof value.intentKey !== "string") ||
		typeof value.startedAt !== "string" || (value.initialArtifactSha256 !== null && !HASH.test(String(value.initialArtifactSha256)))) return null;
	return value as unknown as PhaseLaunch;
}
function parseCompletion(value: unknown): PhaseCompletion | null {
	if (!record(value) || value.version !== 1 || typeof value.toolCallId !== "string" || typeof value.nonce !== "string" ||
		typeof value.change !== "string" || !PHASES.has(value.phase as SddPhase) || !HASH.test(String(value.artifactSha256)) ||
		(value.intentKey !== null && typeof value.intentKey !== "string") || !["complete", "partial", "blocked"].includes(String(value.status)) ||
		typeof value.finishedAt !== "string" || (value.reason !== undefined && typeof value.reason !== "string") ||
		(value.verificationReceiptSha256 !== undefined && !HASH.test(String(value.verificationReceiptSha256)))) return null;
	return value as unknown as PhaseCompletion;
}
function atomicJson(path: string, value: unknown, token: string): void {
	const temporary = join(dirname(path), `.ein-phase-${sha256(token).slice(0, 16)}.tmp`);
	try { writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }); renameSync(temporary, path); }
	finally { rmSync(temporary, { force: true }); }
}
function safeRoot(cwd: string): Result<string> {
	try { return { ok: true, value: realpathSync(cwd) }; }
	catch { return fail("invalid-root", "project root is unavailable"); }
}
function runPaths(cwd: string, toolCallId: string) {
	const directory = join(cwd, RUNS, sha256(toolCallId));
	return { directory, launch: join(directory, "launch.json"), completion: join(directory, "completion.json") };
}
function findRuns(changesRoot: string, toolCallId: string): PhaseLaunch[] {
	let active: string[];
	try { active = readdirSync(changesRoot); } catch { return []; }
	return active.flatMap((change) => {
		if (!isSafeChangeName(change)) return [];
		const launch = parseLaunch(readJson(runPaths(join(changesRoot, change), toolCallId).launch));
		return launch ? [launch] : [];
	});
}
function safeRunDirectory(changePath: string, directory: string): boolean {
	const runsRoot = join(changePath, RUNS);
	try {
		if (existsSync(runsRoot) && (!lstatSync(runsRoot).isDirectory() || lstatSync(runsRoot).isSymbolicLink())) return false;
		if (existsSync(directory) && (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())) return false;
		mkdirSync(directory, { recursive: true });
		return realpathSync(directory).startsWith(`${realpathSync(changePath)}/`);
	} catch { return false; }
}

export function createPhaseReceiptService(dependencies: PhaseReceiptServiceDependencies) {
	function beginPhaseRun(input: BeginInput): Result<PhaseLaunch> {
		const root = safeRoot(input.cwd);
		if (!root.ok) return root;
		if (!input.toolCallId || !isSafeChangeName(input.change) || !PHASES.has(input.phase)) return fail("invalid-identity", "safe change, phase and toolCallId are required");
		const changesRoot = resolveChangesDir(root.value);
		const changePath = join(changesRoot, input.change);
		if (!existsSync(changePath)) {
			if (input.phase !== "scope") return fail("change-missing", "change directory does not exist");
			mkdirSync(changePath, { recursive: true });
		}
		try {
			if (!lstatSync(changePath).isDirectory() || lstatSync(changePath).isSymbolicLink() || !realpathSync(changePath).startsWith(`${root.value}/`)) return fail("unsafe-change", "change directory is unsafe");
		} catch { return fail("unsafe-change", "change directory is unsafe"); }
		const artifact = join(changePath, PHASE_ARTIFACT[input.phase]);
		const currentIntent = intentKey(root.value, changePath, input.change);
		const paths = runPaths(changePath, input.toolCallId);
		const matches = findRuns(changesRoot, input.toolCallId);
		if (matches.length > 0) {
			const existing = matches.length === 1 ? matches[0]! : null;
			return existing && existing.toolCallId === input.toolCallId && existing.root === root.value && existing.change === input.change && existing.phase === input.phase && existing.artifact === artifact && existing.intentKey === currentIntent
				? { ok: true, value: existing }
				: fail("run-conflict", "toolCallId already belongs to another phase run");
		}
		if (!safeRunDirectory(changePath, paths.directory)) return fail("unsafe-run-path", "phase run directory is unsafe");
		const launch: PhaseLaunch = {
			version: 1, toolCallId: input.toolCallId, nonce: dependencies.newToken(), root: root.value,
			change: input.change, phase: input.phase, artifact, intentKey: currentIntent,
			startedAt: dependencies.now(), initialArtifactSha256: fileSha(artifact),
		};
		try { writeFileSync(paths.launch, `${JSON.stringify(launch, null, 2)}\n`, { flag: "wx" }); }
		catch (error) { return fail("write-failed", error instanceof Error ? error.message : String(error)); }
		return { ok: true, value: launch };
	}

	function readPhaseRun(input: ReadInput): Result<{ launch: PhaseLaunch; completion: PhaseCompletion | null }> {
		const root = safeRoot(input.cwd);
		if (!root.ok) return root;
		const changes = resolveChangesDir(root.value);
		if (!existsSync(changes)) return fail("run-missing", "phase run is absent");
		const matches = findRuns(changes, input.toolCallId);
		if (matches.length > 1) return fail("run-conflict", "toolCallId resolves to multiple phase runs");
		if (matches.length === 1) {
			const launch = matches[0]!;
			const expectedChangePath = join(changes, launch.change);
			if (launch.toolCallId !== input.toolCallId || launch.root !== root.value || launch.artifact !== join(expectedChangePath, PHASE_ARTIFACT[launch.phase])) return fail("run-invalid", "phase launch identity or paths do not match the current project");
			const paths = runPaths(dirname(launch.artifact), input.toolCallId);
			return { ok: true, value: { launch, completion: parseCompletion(readJson(paths.completion)) } };
		}
		return fail("run-missing", "phase run is absent");
	}

	function finishPhaseRun(input: FinishInput): Result<PhaseCompletion> {
		const read = readPhaseRun(input);
		if (!read.ok) return read;
		const { launch } = read.value;
		if (launch.nonce !== input.nonce) return fail("nonce-mismatch", "phase nonce does not match the launch");
		const currentIntent = intentKey(launch.root, dirname(launch.artifact), launch.change);
		if (currentIntent !== launch.intentKey) return fail("intent-stale", "phase intent changed after launch");
		const digest = fileSha(launch.artifact);
		if (!digest) return fail("artifact-unavailable", "phase artifact is missing, unreadable or unsafe");
		let content: string;
		try { content = readFileSync(launch.artifact, "utf8"); } catch { return fail("artifact-unavailable", "phase artifact is unreadable"); }
		const lint = lintPhaseArtifact(launch.phase, content, { change: launch.change });
		if (lint.errors > 0) return fail("artifact-invalid", `phase artifact has ${lint.errors} lint error(s)`);
		const evidence = readSddCompletionEvidence(launch.root, launch.change, dependencies.readVerification);
		if (input.status === "complete" && launch.phase === "apply" && (evidence.apply !== "complete" || evidence.tasks.counts.pending > 0)) return fail("phase-incomplete", "apply still has partial work or pending tasks");
		if (input.status === "complete" && launch.phase === "verify" && (evidence.verify !== "pass" || evidence.verification.state !== "current")) return fail("verification-not-current", "verify requires a current passing verification receipt");
		if (input.status === "complete" && launch.phase === "close" && (evidence.apply !== "complete" || evidence.verify !== "pass" || evidence.verification.state !== "current" || evidence.tasks.counts.pending > 0)) return fail("close-not-ready", "close prerequisites are not complete");
		const verificationReceiptSha256 = launch.phase === "verify" ? fileSha(join(dirname(launch.artifact), "verification-receipt.json")) ?? undefined : undefined;
		const completion: PhaseCompletion = {
			version: 1, toolCallId: launch.toolCallId, nonce: launch.nonce, change: launch.change, phase: launch.phase,
			artifactSha256: digest, intentKey: currentIntent, status: input.status, finishedAt: dependencies.now(),
			...(input.reason ? { reason: input.reason } : {}), ...(verificationReceiptSha256 ? { verificationReceiptSha256 } : {}),
		};
		const paths = runPaths(dirname(launch.artifact), launch.toolCallId);
		if (!safeRunDirectory(dirname(launch.artifact), paths.directory)) return fail("unsafe-run-path", "phase run directory is unsafe");
		if (read.value.completion) {
			const existing = read.value.completion;
			const same = existing.artifactSha256 === completion.artifactSha256 && existing.intentKey === completion.intentKey &&
				existing.status === completion.status && existing.reason === completion.reason &&
				existing.verificationReceiptSha256 === completion.verificationReceiptSha256;
			return same ? { ok: true, value: existing } : fail("already-finished", "phase run already has a different completion");
		}
		try { atomicJson(paths.completion, completion, launch.nonce); }
		catch (error) { return fail("write-failed", error instanceof Error ? error.message : String(error)); }
		return { ok: true, value: completion };
	}

	function assessPhaseRecovery(input: ReadInput & Partial<PhaseRunReference>): PhaseRecovery {
		const read = readPhaseRun(input);
		if (!read.ok) return { state: "invalid", reason: read.reason };
		const { launch, completion } = read.value;
		if ((input.nonce && input.nonce !== launch.nonce) || (input.change && input.change !== launch.change) || (input.phase && input.phase !== launch.phase)) return { state: "invalid", reason: "phase run identity does not match", launch };
		if (!completion) return { state: "unconfirmed", reason: "artifact may be partial; finalization receipt is absent", launch };
		if (completion.toolCallId !== launch.toolCallId || completion.nonce !== launch.nonce || completion.change !== launch.change || completion.phase !== launch.phase || completion.artifactSha256 !== fileSha(launch.artifact) || completion.intentKey !== launch.intentKey || completion.intentKey !== intentKey(launch.root, dirname(launch.artifact), launch.change)) return { state: "invalid", reason: "phase receipt is stale or belongs to another run", launch, completion };
		if (completion.status === "complete" && (launch.phase === "apply" || launch.phase === "close")) {
			const evidence = readSddCompletionEvidence(launch.root, launch.change, dependencies.readVerification);
			if (evidence.apply !== "complete" || evidence.tasks.counts.pending > 0 || (launch.phase === "close" && (evidence.verify !== "pass" || evidence.verification.state !== "current"))) return { state: "invalid", reason: "phase completion prerequisites changed after finalization", launch, completion };
		}
		if (launch.phase === "verify") {
			const current = fileSha(join(dirname(launch.artifact), "verification-receipt.json"));
			if (!current || current !== completion.verificationReceiptSha256 || dependencies.readVerification(launch.root, dirname(launch.artifact)).state !== "current") return { state: "invalid", reason: "verification receipt is stale or unbound", launch, completion };
		}
		return { state: completion.status, reason: completion.reason ?? (completion.status === "complete" ? "artifact finalized for this phase run" : "phase preserved incomplete evidence"), launch, completion };
	}

	return Object.freeze({ beginPhaseRun, finishPhaseRun, readPhaseRun, assessPhaseRecovery });
}
