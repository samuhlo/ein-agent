import { afterEach, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkCurrentPublication } from "../ein-pi/agent/lib/review-publication-check.ts";
import { registerReviewExceptionTool } from "../ein-pi/agent/extensions/internal/ein-review-exception-tool.ts";
import { readReviewException, recordReviewException, reviewExceptionPath } from "../ein-pi/agent/lib/review-exception.ts";
import { DEFAULT_REVIEW_BUDGET, evaluateReviewForecast, reviewForecast } from "../ein-pi/agent/lib/review-forecast.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "ein-review-exception-")); roots.push(root);
	const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
	git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
	writeFileSync(join(root, "base.ts"), "export const base = 1;\n"); git("add", "base.ts"); git("commit", "-qm", "base");
	const base = git("rev-parse", "HEAD");
	writeFileSync(join(root, "feature.ts"), "export const item = 1;\n".repeat(600)); git("add", "feature.ts"); git("commit", "-qm", "feature");
	const forecast = reviewForecast(root, { mode: "committed", base });
	if (!forecast.ok) throw new Error(forecast.reason);
	const session = join(root, "session.jsonl");
	const rows = (answer = "Una PR, excepción (Recommended)", cancelled = false) => [
		{ type: "message", id: "forecast", message: { role: "toolResult", toolName: "ein_review_forecast", details: { ...forecast, ...evaluateReviewForecast(forecast, DEFAULT_REVIEW_BUDGET) } } },
		{ type: "message", id: "choice", message: { role: "toolResult", toolName: "ask_user_question", details: { cancelled, answers: [{ questionIndex: 0, question: "¿Una PR o varias PR?", kind: "option", answer }] } } },
	];
	const writeSession = (answer?: string, cancelled?: boolean) => writeFileSync(session, rows(answer, cancelled).map(row => JSON.stringify(row)).join("\n") + "\n");
	writeSession();
	return { root, git, base, forecast, session, writeSession };
}

test("the recorded human choice permits both publication checks for the exact oversized commit", () => {
	const box = fixture();
	expect(checkCurrentPublication(box.root, box.base).ok).toBe(false);
	const recorded = recordReviewException(box.root, box.base, box.session);
	expect(recorded.ok).toBe(true);
	expect(JSON.parse(readFileSync(reviewExceptionPath(box.root), "utf8"))).toMatchObject({ base: box.base, forecastMessageId: "forecast", approvalMessageId: "choice" });
	for (let step = 0; step < 2; step++) expect(checkCurrentPublication(box.root, box.base)).toMatchObject({ ok: true, headOid: box.forecast.headOid, exception: { production: 600 } });
	const cli = spawnSync(process.execPath, [resolve(import.meta.dir, "../ein-pi/agent/lib/review-publication-check.ts"), "review-current", box.base], { cwd: box.root, encoding: "utf8" });
	expect(cli.status).toBe(0);
	expect(cli.stdout.trim()).toBe(box.forecast.headOid!);
	expect(cli.stderr).toContain("Review exception");
});

test("changed content, base, or recorded decision invalidates the exception", () => {
	const box = fixture();
	expect(recordReviewException(box.root, box.base, box.session).ok).toBe(true);
	expect(readReviewException(box.root, "HEAD", box.forecast).ok).toBe(false);
	box.writeSession("Dividir en varias PR");
	expect(checkCurrentPublication(box.root, box.base).ok).toBe(false);
	box.writeSession();
	box.git("commit", "--allow-empty", "-qm", "moved head");
	expect(checkCurrentPublication(box.root, box.base).ok).toBe(false);
});

test("an absent, cancelled, or unrelated answer cannot create an exception", () => {
	const box = fixture();
	box.writeSession("Dividir en varias PR");
	expect(recordReviewException(box.root, box.base, box.session).ok).toBe(false);
	box.writeSession(undefined, true);
	expect(recordReviewException(box.root, box.base, box.session).ok).toBe(false);
	box.writeSession();
	const other = join(box.root, "other-session.jsonl");
	writeFileSync(other, JSON.stringify({ type: "message", id: "choice", message: { role: "toolResult", toolName: "ask_user_question", details: { cancelled: false, answers: [{ question: "¿Una PR?", answer: "Una PR, excepción" }] } } }) + "\n");
	expect(recordReviewException(box.root, box.base, other).ok).toBe(false);
});

test("the parent tool binds the saved answer without asking again", async () => {
	const box = fixture();
	let tool: any;
	registerReviewExceptionTool(((spec: any) => { tool = spec; }) as never);
	const result = await tool.execute("approval", { base: box.base }, undefined, undefined, {
		cwd: box.root, sessionManager: { getSessionFile: () => box.session }, hasUI: true,
	});
	expect(result.details).toMatchObject({ ok: true, headOid: box.forecast.headOid });
	expect(checkCurrentPublication(box.root, box.base).ok).toBe(true);
});
