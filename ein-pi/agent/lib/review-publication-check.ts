import { execFileSync } from "node:child_process";
import { DEFAULT_REVIEW_BUDGET, evaluateReviewForecast, reviewForecast } from "./review-forecast.ts";
import type { ReviewRequest } from "./review-snapshot.ts";

type PublicationRequest = { baseOid: string; headOid: string; snapshotRef: string };
type Check = { ok: true } | { ok: false; reason: string };
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

export function checkReviewedPublication(cwd: string, request: PublicationRequest): Check {
	if (!request || typeof request !== "object" || Array.isArray(request)
		|| Object.keys(request).sort().join(",") !== "baseOid,headOid,snapshotRef"
		|| [request.baseOid, request.headOid, request.snapshotRef].some((value) => typeof value !== "string")
		|| !OID.test(request.baseOid) || !OID.test(request.headOid) || !/^sha256:[a-f0-9]{64}$/.test(request.snapshotRef)) {
		return { ok: false, reason: "invalid publication measurement" };
	}
	try {
		const head = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
		if (head() !== request.headOid) return { ok: false, reason: "HEAD changed; measure the committed change again" };
		const forecast = reviewForecast(cwd, { mode: "committed", base: request.baseOid, head: request.headOid });
		if (!forecast.ok || evaluateReviewForecast(forecast, DEFAULT_REVIEW_BUDGET).decision !== "within") return { ok: false, reason: "committed change is unavailable or over budget" };
		if (forecast.snapshotRef !== request.snapshotRef || head() !== request.headOid) return { ok: false, reason: "measurement no longer matches the publication" };
		return { ok: true };
	} catch { return { ok: false, reason: "Git publication identity unavailable" }; }
}

export function checkCurrentPublication(cwd: string, base: string): { ok: true; headOid: string } | { ok: false; reason: string } {
	if (!base || !/^[\w./-]+$/.test(base) || base.startsWith("-")) return { ok: false, reason: "invalid PR base" };
	const forecast = reviewForecast(cwd, { mode: "committed", base });
	if (!forecast.ok || !forecast.headOid) return { ok: false, reason: forecast.reason ?? "committed change unavailable" };
	const evaluation = evaluateReviewForecast(forecast, DEFAULT_REVIEW_BUDGET);
	if (evaluation.decision !== "within") return { ok: false, reason: `PR exceeds review budget: ${forecast.production}/${DEFAULT_REVIEW_BUDGET.lines} production lines, ${forecast.productionBytes}/${DEFAULT_REVIEW_BUDGET.bytes} bytes` };
	try {
		const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
		if (head !== forecast.headOid) return { ok: false, reason: "HEAD changed during publication check" };
		return { ok: true, headOid: head };
	} catch { return { ok: false, reason: "Git publication identity unavailable" }; }
}

export function runCurrentPublicationCommand(cwd: string, args: readonly string[]): { text: string; exitCode: number } {
	if (args.length !== 1) return { text: "Expected one PR base ref", exitCode: 1 };
	const result = checkCurrentPublication(cwd, args[0]!);
	return result.ok ? { text: result.headOid, exitCode: 0 } : { text: result.reason, exitCode: 1 };
}

export function runReviewCommand(cwd: string, command: "review-forecast" | "review-publication-check", input: string): { text: string; exitCode: number } {
	try {
		const request: unknown = JSON.parse(input);
		if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("expected a JSON object");
		if (command === "review-forecast") {
			const forecast = reviewForecast(cwd, request as ReviewRequest);
			return { text: JSON.stringify({ ...forecast, ...evaluateReviewForecast(forecast, DEFAULT_REVIEW_BUDGET), lineBudget: DEFAULT_REVIEW_BUDGET.lines, byteBudget: DEFAULT_REVIEW_BUDGET.bytes }), exitCode: forecast.ok ? 0 : 1 };
		}
		const result = checkReviewedPublication(cwd, request as PublicationRequest);
		return { text: JSON.stringify(result), exitCode: result.ok ? 0 : 1 };
	} catch { return { text: JSON.stringify({ ok: false, reason: "invalid review request JSON" }), exitCode: 1 }; }
}

if (import.meta.main) {
	const command = process.argv[2];
	if (command === "review-current") {
		const result = runCurrentPublicationCommand(process.cwd(), process.argv.slice(3));
		(result.exitCode ? console.error : console.log)(result.text); process.exitCode = result.exitCode;
	}
	else if (process.argv.length > 3 || command !== undefined && command !== "review-publication-check" && command !== "review-forecast") process.exitCode = 1;
	else {
		const result = runReviewCommand(process.cwd(), command ?? "review-publication-check", await Bun.stdin.text());
		console.log(result.text); process.exitCode = result.exitCode;
	}
}
