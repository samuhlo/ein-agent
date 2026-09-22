import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateReviewForecast, reviewForecast } from "../ein-pi/agent/lib/review-forecast.ts";
import { readReviewSnapshot } from "../ein-pi/agent/lib/review-snapshot.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(root: string, ...args: string[]) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }); }
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "review-snapshot-")); roots.push(root);
	git(root, "init", "-q", "-b", "main"); git(root, "config", "user.name", "Test"); git(root, "config", "user.email", "test@example.test");
	writeFileSync(join(root, "base.ts"), "base\n"); git(root, "add", "base.ts"); git(root, "commit", "-qm", "base");
	return root;
}
test("working-tree counts untracked and final staged/unstaged once without mutations", () => {
	const root = fixture(), base = git(root, "rev-parse", "HEAD").trim();
	writeFileSync(join(root, "new.ts"), "line\n".repeat(600));
	writeFileSync(join(root, "base.ts"), "staged\n"); git(root, "add", "base.ts"); writeFileSync(join(root, "base.ts"), "final\n");
	const index = readFileSync(join(root, ".git/index")), status = git(root, "status", "--porcelain");
	const result = reviewForecast(root, { mode: "working-tree", base });
	expect(result).toMatchObject({ ok: true, production: 602 });
	expect(evaluateReviewForecast(result, 400).decision).toBe("over");
	expect(reviewForecast(root, { mode: "committed", base }).production).toBe(0);
	expect(readFileSync(join(root, ".git/index"))).toEqual(index); expect(git(root, "status", "--porcelain")).toBe(status);
	expect(git(root, "rev-parse", "HEAD").trim()).toBe(base); expect(readFileSync(join(root, "base.ts"), "utf8")).toBe("final\n");
});
test("test directory classification is identical in root and nested packages", () => {
	const root = fixture();
	for (const path of ["tests/a.ts", "pkg/tests/a.ts", "__tests__/a.ts", "pkg/e2e/a.ts", "x.spec.ts"]) {
		mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), "test\n");
	}
	writeFileSync(join(root, "latest.ts"), "production\n");
	expect(reviewForecast(root)).toMatchObject({ ok: true, production: 1, tests: 5 });
});
test("uses merge-base without counting unrelated base-branch additions as deletions", () => {
	const root = fixture(); git(root, "checkout", "-qb", "feature");
	writeFileSync(join(root, "feature.ts"), "feature\n"); git(root, "add", "feature.ts"); git(root, "commit", "-qm", "feature");
	git(root, "checkout", "-q", "main"); writeFileSync(join(root, "unrelated.ts"), "base only\n".repeat(700));
	git(root, "add", "unrelated.ts"); git(root, "commit", "-qm", "base advanced"); git(root, "checkout", "-q", "feature");
	expect(reviewForecast(root, { mode: "committed", base: "main" })).toMatchObject({ ok: true, production: 1 });
});
test("renames, binary, executable bit, literal paths and symlinks remain observable", () => {
	const root = fixture(); renameSync(join(root, "base.ts"), join(root, "renamed file.ts"));
	writeFileSync(join(root, "binary.dat"), Buffer.from([0, 1, 2])); symlinkSync("renamed file.ts", join(root, "link"));
	chmodSync(join(root, "renamed file.ts"), 0o755);
	const snapshot = readReviewSnapshot(root, { mode: "working-tree" }); expect(snapshot.ok).toBe(true);
	const result = reviewForecast(root); expect(result.productionFiles).toBe(3);
	expect(reviewForecast(root, { mode: "working-tree", paths: ["binary.dat"] })).toMatchObject({ ok: true, production: 0, productionFiles: 1 });
	for (const paths of [["../escape"], ["*.ts"], [".git/config"]]) expect(reviewForecast(root, { mode: "working-tree", paths }).ok).toBe(false);
});
test("unmeasurable inputs never become a within-budget decision", () => {
	const root = fixture();
	for (const request of [{ mode: "committed" as const, base: "missing" }, { mode: "working-tree" as const, head: "HEAD" }]) {
		const result = reviewForecast(root, request);
		expect(evaluateReviewForecast(result, 400)).toMatchObject({ decision: "unknown", overBudget: null });
	}
});
