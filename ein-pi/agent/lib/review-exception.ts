import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_REVIEW_BUDGET, evaluateReviewForecast, reviewForecast, type ReviewForecast } from "./review-forecast.ts";

type ReviewException = {
	version: 1;
	cwd: string;
	base: string;
	baseOid: string;
	headOid: string;
	snapshotRef: string;
	production: number;
	productionBytes: number;
	sessionFile: string;
	forecastMessageId: string;
	approvalMessageId: string;
};

type Result = { ok: true; receipt: ReviewException } | { ok: false; reason: string };
const MAX_SESSION_BYTES = 32 * 1024 * 1024;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SNAPSHOT = /^sha256:[a-f0-9]{64}$/;

export function reviewExceptionPath(cwd: string): string {
	return join(realpathSync(cwd), ".pi", "ein", "review-exception.json");
}

function approvedSinglePrChoice(answer: unknown, question: unknown): boolean {
	if (typeof answer !== "string" || typeof question !== "string" || !/\bPR\b|pull request/i.test(question)) return false;
	const selected = answer.replace(/\s*\(Recommended\)\s*$/i, "").trim();
	if (!/^(?:(?:s[ií]|yes|autorizo|apruebo|confirmo)\s*,?\s*)?(?:una\s+(?:sola\s+)?PR|PR\s+[uú]nica|single\s+(?:PR|pull request))\b/i.test(selected)) return false;
	return /excepci[oó]n|excepcional|exception/i.test(`${selected} ${question}`);
}

function explicitMessageApproval(text: unknown, headOid: string): boolean {
	return typeof text === "string"
		&& /^(?:autorizo|apruebo|confirmo|i authorize|i approve)\b/i.test(text.trim())
		&& /\b(?:una\s+(?:sola\s+)?PR|PR\s+[uú]nica|single\s+(?:PR|pull request))\b/i.test(text)
		&& /excepci[oó]n|excepcional|exception/i.test(text)
		&& text.toLowerCase().includes(headOid.slice(0, 7));
}

function sameForecast(details: any, forecast: ReviewForecast): boolean {
	return details?.mode === "committed" && details?.decision === "over"
		&& details.baseOid === forecast.baseOid && details.headOid === forecast.headOid
		&& details.snapshotRef === forecast.snapshotRef
		&& details.production === forecast.production && details.productionBytes === forecast.productionBytes;
}

function approvalInSession(sessionFile: string, forecast: ReviewForecast): { forecastMessageId: string; approvalMessageId: string } | null {
	if (statSync(sessionFile).size > MAX_SESSION_BYTES) return null;
	let matchingForecast = "";
	let approval: { forecastMessageId: string; approvalMessageId: string } | null = null;
	for (const line of readFileSync(sessionFile, "utf8").split("\n")) {
		if (!line) continue;
		const entry = JSON.parse(line) as any;
		if (entry?.type !== "message" || typeof entry.id !== "string") continue;
		const message = entry.message;
		if (message?.role === "user" && matchingForecast && Array.isArray(message.content)
			&& message.content.some((part: any) => part?.type === "text" && explicitMessageApproval(part.text, forecast.headOid!))) {
			approval = { forecastMessageId: matchingForecast, approvalMessageId: entry.id };
		}
		if (message?.role !== "toolResult") continue;
		if (message.toolName === "ein_review_forecast") matchingForecast = sameForecast(message.details, forecast) ? entry.id : "";
		if (message.toolName !== "ask_user_question" || !matchingForecast || message.details?.cancelled !== false) continue;
		if (Array.isArray(message.details.answers) && message.details.answers.some((answer: any) =>
			approvedSinglePrChoice(answer?.answer, answer?.question))) {
			approval = { forecastMessageId: matchingForecast, approvalMessageId: entry.id };
		}
	}
	return approval;
}

export function resolveReviewTarget(parentCwd: string, requested?: string): string {
	const target = realpathSync(requested ?? parentCwd);
	const git = (cwd: string, args: string[]) => execFileSync("git", ["rev-parse", ...args], { cwd, encoding: "utf8", timeout: 10_000 }).trim();
	const top = realpathSync(git(target, ["--show-toplevel"]));
	const common = (cwd: string) => realpathSync(resolve(cwd, git(cwd, ["--git-common-dir"])));
	if (target !== top || common(parentCwd) !== common(target)) throw new Error("delivery worktree must be the root of this repository");
	return target;
}

function matchingReceipt(value: unknown, cwd: string, base: string, forecast: ReviewForecast): value is ReviewException {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const receipt = value as Partial<ReviewException>;
	return receipt.version === 1 && receipt.cwd === realpathSync(cwd) && receipt.base === base
		&& typeof receipt.baseOid === "string" && OID.test(receipt.baseOid) && receipt.baseOid === forecast.baseOid
		&& typeof receipt.headOid === "string" && OID.test(receipt.headOid) && receipt.headOid === forecast.headOid
		&& typeof receipt.snapshotRef === "string" && SNAPSHOT.test(receipt.snapshotRef) && receipt.snapshotRef === forecast.snapshotRef
		&& receipt.production === forecast.production && receipt.productionBytes === forecast.productionBytes
		&& typeof receipt.sessionFile === "string" && typeof receipt.forecastMessageId === "string"
		&& typeof receipt.approvalMessageId === "string";
}

export function recordReviewException(cwd: string, base: string, sessionFile: string): Result {
	try {
		if (!base || !/^[\w./-]+$/.test(base) || base.startsWith("-") || !OID.test(base) && !/^origin\/[\w./-]+$/.test(base)) return { ok: false, reason: "use the exact origin/<PR-base> ref" };
		const forecast = reviewForecast(cwd, { mode: "committed", base });
		if (!forecast.ok || evaluateReviewForecast(forecast, DEFAULT_REVIEW_BUDGET).decision !== "over") return { ok: false, reason: "no current over-budget committed change" };
		if (!forecast.baseOid || !forecast.headOid || !forecast.snapshotRef) return { ok: false, reason: "publication identity unavailable" };
		const source = realpathSync(sessionFile);
		const approval = approvalInSession(source, forecast);
		if (!approval) return { ok: false, reason: "matching human single-PR decision unavailable" };
		const receipt: ReviewException = { version: 1, cwd: realpathSync(cwd), base, baseOid: forecast.baseOid,
			headOid: forecast.headOid, snapshotRef: forecast.snapshotRef, production: forecast.production,
			productionBytes: forecast.productionBytes, sessionFile: source, ...approval };
		const path = reviewExceptionPath(cwd);
		mkdirSync(dirname(path), { recursive: true });
		const temporary = `${path}.${randomUUID()}.tmp`;
		try { writeFileSync(temporary, `${JSON.stringify(receipt)}\n`, { flag: "wx", mode: 0o600 }); renameSync(temporary, path); }
		catch (error) { try { unlinkSync(temporary); } catch {} throw error; }
		return { ok: true, receipt };
	} catch { return { ok: false, reason: "review exception evidence unavailable" }; }
}

export function readReviewException(cwd: string, base: string, forecast: ReviewForecast): Result {
	try {
		const value: unknown = JSON.parse(readFileSync(reviewExceptionPath(cwd), "utf8"));
		if (!matchingReceipt(value, cwd, base, forecast)) return { ok: false, reason: "review exception does not match this commit" };
		const receipt = value as ReviewException;
		const approval = approvalInSession(receipt.sessionFile, forecast);
		if (!approval || approval.forecastMessageId !== receipt.forecastMessageId || approval.approvalMessageId !== receipt.approvalMessageId) {
			return { ok: false, reason: "review exception approval is unavailable" };
		}
		return { ok: true, receipt };
	} catch { return { ok: false, reason: "review exception unavailable" }; }
}
