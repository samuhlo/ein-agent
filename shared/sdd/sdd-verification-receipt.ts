import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { captureVerificationSurface, type VerificationSurfaceEntry, type VerificationSurfacePorts } from "./sdd-verification-surface.ts";
import { parseVerificationReport, type VerificationOutcome } from "./sdd-verification-outcome.ts";

export type VerificationFreshness = Readonly<{
	state: "current" | "stale" | "unbound" | "unavailable" | "invalid";
	reason: string;
	observedSurfaceRef?: string;
	currentSurfaceRef?: string;
}>;

export type VerificationSession = Readonly<{
	version: 1; token: string; root: string; change: string; startedAt: string; intentKey?: string;
	surfaceRef: string; decisionRef: string; entries: readonly VerificationSurfaceEntry[];
}>;
export type VerificationReceipt = Readonly<{
	version: 1; token: string; root: string; change: string; startedAt: string; finishedAt: string; intentKey?: string;
	surfaceRef: string; decisionRef: string; reportSha256: string; outcome: "pass" | "fail";
	entries: readonly VerificationSurfaceEntry[];
}>;

type VerificationRequest = Readonly<{ cwd: string; changePath: string }>;
type VerificationFinishRequest = VerificationRequest & Readonly<{ token: string; content: string }>;
type ServiceResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; code: string; reason: string }>;

export type VerificationService = Readonly<{
	beginVerification: (request: VerificationRequest) => ServiceResult<VerificationSession>;
	finishVerification: (request: VerificationFinishRequest) => ServiceResult<VerificationReceipt>;
	readVerificationFreshness: (request: VerificationRequest) => VerificationFreshness;
}>;

export type VerificationServiceDependencies = Readonly<{
	enumerateGit: VerificationSurfacePorts["enumerateGit"];
	now: () => string;
	newToken: () => string;
	limits?: VerificationSurfacePorts["limits"];
}>;

const SESSION = "verification-session.json";
const RECEIPT = "verification-receipt.json";
const REPORT = "verify-report.md";
const HASH = /^[a-f0-9]{64}$/;
const REF = /^sha256:[a-f0-9]{64}$/;

function sha256(content: string | Buffer): string { return createHash("sha256").update(content).digest("hex"); }
function fail<T>(code: string, reason: string): ServiceResult<T> { return { ok: false, code, reason }; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function readJson(path: string): unknown { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } }
function iso(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function validEntries(value: unknown): value is VerificationSurfaceEntry[] {
	return Array.isArray(value) && value.every((entry) => record(entry) && typeof entry.path === "string" &&
		["file", "symlink", "gitlink"].includes(String(entry.kind)) && typeof entry.executable === "boolean" &&
		(entry.sha256 === "missing" || (typeof entry.sha256 === "string" && HASH.test(entry.sha256))));
}
function parseSession(value: unknown): VerificationSession | null {
	if (!record(value) || value.version !== 1 || typeof value.token !== "string" || !value.token || typeof value.root !== "string" ||
		typeof value.change !== "string" || !iso(value.startedAt) || !REF.test(String(value.surfaceRef)) ||
		!REF.test(String(value.decisionRef)) || !validEntries(value.entries) || (value.intentKey !== undefined && typeof value.intentKey !== "string")) return null;
	return value as unknown as VerificationSession;
}
function parseReceipt(value: unknown): VerificationReceipt | null {
	if (!record(value) || value.version !== 1 || typeof value.token !== "string" || !value.token || typeof value.root !== "string" ||
		typeof value.change !== "string" || !iso(value.startedAt) || !iso(value.finishedAt) || !REF.test(String(value.surfaceRef)) ||
		!REF.test(String(value.decisionRef)) || !HASH.test(String(value.reportSha256)) ||
		(value.outcome !== "pass" && value.outcome !== "fail") || !validEntries(value.entries) ||
		(value.intentKey !== undefined && typeof value.intentKey !== "string")) return null;
	return value as unknown as VerificationReceipt;
}
function intentKey(changePath: string): string | undefined {
	const value = readJson(join(changePath, "preflight.json"));
	if (!record(value) || !record(value.intent)) return undefined;
	return typeof value.intent.materialKey === "string" ? value.intent.materialKey : undefined;
}
function canonicalContent(content: string, key: string | undefined): string {
	let normalized = content.replace(/\r\n?/g, "\n").replace(/^[ \t]*(?:[-*][ \t]+)?intent_key:[^\r\n]*(?:\r?\n|$)/gm, "");
	if (key) {
		const title = normalized.match(/^( {0,3}#{1,6}(?:\s+|$)[^\n]*\n)/);
		normalized = title
			? `${title[1]}intent_key: ${key}\n${normalized.slice(title[1].length)}`
			: `intent_key: ${key}\n${normalized}`;
	}
	return normalized;
}
function atomicJson(path: string, value: unknown, token: string): void {
	const temp = join(path.slice(0, -basename(path).length), `.ein-verification-${token}`);
	try { writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }); renameSync(temp, path); }
	finally { rmSync(temp, { force: true }); }
}
function validChangeDir(changePath: string): boolean {
	try { const stat = lstatSync(changePath); return stat.isDirectory() && !stat.isSymbolicLink(); } catch { return false; }
}

export function createVerificationService(dependencies: VerificationServiceDependencies): VerificationService {
	const capture = (request: VerificationRequest, previousEntries?: readonly VerificationSurfaceEntry[]) =>
		captureVerificationSurface(request.cwd, request.changePath, { enumerateGit: dependencies.enumerateGit, previousEntries, limits: dependencies.limits });

	function beginVerification(request: VerificationRequest): ServiceResult<VerificationSession> {
		if (!validChangeDir(request.changePath)) return fail("invalid-change", "change directory is unavailable or unsafe");
		const surface = capture(request);
		if (!surface.ok) return fail(surface.code, surface.reason);
		const key = intentKey(request.changePath);
		const session: VerificationSession = {
			version: 1, token: dependencies.newToken(), root: surface.root, change: basename(request.changePath),
			startedAt: dependencies.now(), ...(key ? { intentKey: key } : {}),
			surfaceRef: surface.surfaceRef, decisionRef: surface.decisionRef, entries: surface.entries,
		};
		try { atomicJson(join(request.changePath, SESSION), session, session.token); }
		catch (error) { return fail("write-failed", error instanceof Error ? error.message : String(error)); }
		return { ok: true, value: session };
	}

	function finishVerification(request: VerificationFinishRequest): ServiceResult<VerificationReceipt> {
		const session = parseSession(readJson(join(request.changePath, SESSION)));
		if (!session) return fail("session-invalid", "verification session is absent or malformed");
		if (session.token !== request.token) return fail("token-stale", "verification token is not the active session");
		const surface = capture(request, session.entries);
		if (!surface.ok) return fail(surface.code, surface.reason);
		if (surface.root !== session.root || basename(request.changePath) !== session.change) return fail("session-mismatch", "verification root or change changed");
		if (surface.surfaceRef !== session.surfaceRef || surface.decisionRef !== session.decisionRef) return fail("verification-stale", "verification surface changed during verification");
		const key = intentKey(request.changePath);
		if (key !== session.intentKey) return fail("intent-stale", "verification intent agreement changed");
		const content = canonicalContent(request.content, key);
		const parsed = parseVerificationReport(content);
		const reportPath = join(request.changePath, REPORT);
		try { writeFileSync(reportPath, content); }
		catch (error) { return fail("write-failed", error instanceof Error ? error.message : String(error)); }
		if (parsed.outcome === "unknown") return fail("outcome-unknown", "verification report has no publishable global outcome");
		const existing = parseReceipt(readJson(join(request.changePath, RECEIPT)));
		if (existing && existing.token === request.token && existing.reportSha256 === sha256(content) && existing.surfaceRef === surface.surfaceRef && existing.decisionRef === surface.decisionRef && existing.outcome === parsed.outcome) return { ok: true, value: existing };
		const receipt: VerificationReceipt = {
			version: 1, token: session.token, root: session.root, change: session.change, startedAt: session.startedAt,
			finishedAt: dependencies.now(), ...(key ? { intentKey: key } : {}), surfaceRef: surface.surfaceRef,
			decisionRef: surface.decisionRef, reportSha256: sha256(content), outcome: parsed.outcome, entries: surface.entries,
		};
		try { atomicJson(join(request.changePath, RECEIPT), receipt, session.token); }
		catch (error) { return fail("write-failed", error instanceof Error ? error.message : String(error)); }
		return { ok: true, value: receipt };
	}

	function readVerificationFreshness(request: VerificationRequest): VerificationFreshness {
		const receiptPath = join(request.changePath, RECEIPT);
		if (!existsSync(receiptPath)) return { state: "unbound", reason: "verification receipt is absent" };
		const receipt = parseReceipt(readJson(receiptPath));
		if (!receipt) return { state: "invalid", reason: "verification receipt is malformed" };
		let report: string;
		try { report = readFileSync(join(request.changePath, REPORT), "utf8"); }
		catch { return { state: "unavailable", reason: "verification report is unreadable", observedSurfaceRef: receipt.surfaceRef }; }
		if (sha256(report) !== receipt.reportSha256 || parseVerificationReport(report).outcome !== receipt.outcome) {
			return { state: "stale", reason: "verification report no longer matches its receipt", observedSurfaceRef: receipt.surfaceRef };
		}
		const surface = capture(request, receipt.entries);
		if (!surface.ok) return { state: "unavailable", reason: surface.reason, observedSurfaceRef: receipt.surfaceRef };
		if (surface.root !== receipt.root || basename(request.changePath) !== receipt.change) return { state: "invalid", reason: "verification receipt belongs to another root or change", observedSurfaceRef: receipt.surfaceRef, currentSurfaceRef: surface.surfaceRef };
		if (surface.surfaceRef !== receipt.surfaceRef || surface.decisionRef !== receipt.decisionRef || intentKey(request.changePath) !== receipt.intentKey) {
			return { state: "stale", reason: "verified surface or decisions changed", observedSurfaceRef: receipt.surfaceRef, currentSurfaceRef: surface.surfaceRef };
		}
		return { state: "current", reason: "verification receipt matches current surface", observedSurfaceRef: receipt.surfaceRef, currentSurfaceRef: surface.surfaceRef };
	}

	return Object.freeze({ beginVerification, finishVerification, readVerificationFreshness });
}
