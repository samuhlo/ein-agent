import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateReviewForecast, reviewForecast } from "../ein-pi/agent/lib/review-forecast.ts";
import { readReviewSnapshot, REVIEW_CAPTURE_LIMITS } from "../ein-pi/agent/lib/review-snapshot.ts";
import { runReviewCommand } from "../ein-pi/agent/lib/review-publication-check.ts";

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

test("file-directory replacements count both removed and added files", () => {
	const root = fixture(); rmSync(join(root, "base.ts")); mkdirSync(join(root, "base.ts"));
	writeFileSync(join(root, "base.ts/child.ts"), "new child\n");
	expect(reviewForecast(root)).toMatchObject({ ok: true, production: 2, productionFiles: 2 });
	git(root, "add", "base.ts"); git(root, "commit", "-qm", "directory");
	rmSync(join(root, "base.ts"), { recursive: true }); writeFileSync(join(root, "base.ts"), "file again\n");
	expect(reviewForecast(root)).toMatchObject({ ok: true, production: 2, productionFiles: 2 });
});

test("Nuxt bracket routes are literal files, not glob patterns", () => {
	const root = fixture(); mkdirSync(join(root, "app/pages"), { recursive: true });
	writeFileSync(join(root, "app/pages/[id].vue"), "line\n".repeat(600));
	expect(reviewForecast(root)).toMatchObject({ ok: true, production: 600 });
	expect(reviewForecast(root, { mode: "working-tree", paths: ["app/pages/[id].vue"] })).toMatchObject({ ok: true, production: 600 });
});
test("wrong ref types cannot silently measure HEAD against itself", () => {
	const root = fixture();
	for (const base of [0, false, null, "", [], {}]) {
		const result = runReviewCommand(root, "review-forecast", JSON.stringify({ mode: "committed", base }));
		expect(result.exitCode).toBe(1); expect(JSON.parse(result.text).decision).toBe("unknown");
	}
});
test("non-UTF8 Git paths fail closed even when the filesystem cannot materialize them", () => {
	const root = fixture(), base = git(root, "rev-parse", "HEAD").trim();
	const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: root, input: "x\n".repeat(600), encoding: "utf8" }).trim();
	const input = Buffer.concat([Buffer.from(`100644 blob ${blob}\t`), Buffer.from([255]), Buffer.from(".ts\0")]);
	const tree = execFileSync("git", ["mktree", "-z"], { cwd: root, input, encoding: "utf8" }).trim();
	const head = execFileSync("git", ["commit-tree", tree, "-p", base, "-m", "invalid path"], { cwd: root, encoding: "utf8" }).trim();
	const result = reviewForecast(root, { mode: "committed", base, head });
	expect(result.ok).toBe(false); expect(evaluateReviewForecast(result, 400).decision).toBe("unknown");
});

test("batches 300 committed files with a bounded number of Git commands", () => {
	const root = fixture(), base = git(root, "rev-parse", "HEAD").trim();
	for (let i = 0; i < 300; i++) writeFileSync(join(root, `file-${i}.ts`), `export const value = ${i};\n`);
	git(root, "add", "--all"); git(root, "commit", "-qm", "300 files");
	let commands = 0;
	const result = readReviewSnapshot(root, { mode: "committed", base }, { onGitCall: () => { commands++; } });
	expect(result.ok).toBeTrue(); expect(commands).toBeLessThanOrEqual(14);
	expect(reviewForecast(root, { mode: "committed", base })).toMatchObject({ ok: true, production: 300, productionFiles: 300 });
});

test("the monotonic deadline bounds the whole capture rather than each command independently", () => {
	const root = fixture(); let elapsed = 0, commands = 0;
	const result = readReviewSnapshot(root, { mode: "working-tree" }, {
		now: () => elapsed, onGitCall: () => { commands++; elapsed += REVIEW_CAPTURE_LIMITS.durationMs / 3; },
	});
	expect(commands).toBe(3); expect(result).toMatchObject({ ok: false, reason: "capture deadline exceeded" });
});

test("the aggregate byte limit includes materialized duplicates, not only unique blobs", () => {
	const root = fixture(), base = git(root, "rev-parse", "HEAD").trim();
	const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: root, input: Buffer.alloc(REVIEW_CAPTURE_LIMITS.entryBytes / 2), encoding: "utf8" }).trim();
	const baseBlob = git(root, "rev-parse", `${base}:base.ts`).trim();
	const entries = [`100644 blob ${baseBlob}\tbase.ts\0`, ...Array.from({ length: 8 }, (_, i) => `100644 blob ${blob}\tdata-${i}.bin\0`)];
	const tree = execFileSync("git", ["mktree", "-z"], { cwd: root, input: entries.join(""), encoding: "utf8" }).trim();
	const head = git(root, "commit-tree", tree, "-p", base, "-m", "bounded binary images").trim();
	const result = reviewForecast(root, { mode: "committed", base, head });
	expect(result).toMatchObject({ ok: false, reason: "aggregate capture byte limit exceeded" });
	expect(evaluateReviewForecast(result, 400)).toMatchObject({ decision: "unknown", overBudget: null });
});

test("newline and tab filenames survive both Git metadata and patch accounting", () => {
	const root = fixture(), base = git(root, "rev-parse", "HEAD").trim(), path = "line\nbreak\tname.ts";
	writeFileSync(join(root, path), "export {};\n");
	expect(reviewForecast(root)).toMatchObject({ ok: true, production: 1, fileVolumes: [{ path, changedLines: 1 }] });
	git(root, "add", "--", path); git(root, "commit", "-qm", "literal filename");
	expect(reviewForecast(root, { mode: "committed", base })).toMatchObject({ ok: true, production: 1, fileVolumes: [{ path, changedLines: 1 }] });
});

test("rechecks refs and working postimages before returning a measurement", () => {
	const root = fixture(); writeFileSync(join(root, "new.ts"), "first\n");
	expect(readReviewSnapshot(root, { mode: "working-tree" }, { beforeRecheck: () => writeFileSync(join(root, "new.ts"), "later\n") })).toMatchObject({ ok: false, reason: "source-changed" });
	expect(readReviewSnapshot(root, { mode: "working-tree" }, { beforeRecheck: () => { git(root, "commit", "--allow-empty", "-qm", "new head"); } })).toMatchObject({ ok: false, reason: "source-changed" });
});

test("directory-to-symlink replacement never follows the link target", () => {
	const root = fixture(); mkdirSync(join(root, "dir")); writeFileSync(join(root, "dir/child.ts"), "old\n");
	git(root, "add", "dir/child.ts"); git(root, "commit", "-qm", "directory");
	rmSync(join(root, "dir"), { recursive: true }); symlinkSync("../absent-external-target", join(root, "dir"));
	expect(reviewForecast(root)).toMatchObject({ ok: true, production: 2, productionFiles: 2 });
});

test("working-tree discovery does not execute configured clean filters or fsmonitor hooks", () => {
	const root = fixture(); writeFileSync(join(root, ".gitattributes"), "*.ts filter=review-canary\n");
	git(root, "add", ".gitattributes"); git(root, "commit", "-qm", "attributes");
	git(root, "config", "filter.review-canary.clean", "touch filter-ran; cat");
	const hook = join(root, ".git/hooks/review-fsmonitor"); writeFileSync(hook, "#!/bin/sh\ntouch fsmonitor-ran\nexit 1\n"); chmodSync(hook, 0o755);
	git(root, "config", "core.fsmonitor", hook);
	writeFileSync(join(root, "base.ts"), "modified\n");
	const index = readFileSync(join(root, ".git/index"));
	const result = reviewForecast(root);
	expect(result).toMatchObject({ ok: true, production: 2 });
	expect(() => readFileSync(join(root, "filter-ran"))).toThrow();
	expect(() => readFileSync(join(root, "fsmonitor-ran"))).toThrow(); expect(readFileSync(join(root, ".git/index"))).toEqual(index);
});

test("a staged deletion stays deleted when an ignored physical copy remains", () => {
	const root = fixture(); git(root, "rm", "--cached", "base.ts");
	writeFileSync(join(root, ".git/info/exclude"), "base.ts\n");
	expect(reviewForecast(root)).toMatchObject({ ok: true, production: 1, productionFiles: 1 });
	expect(readFileSync(join(root, "base.ts"), "utf8")).toBe("base\n");
});

test("scratch case aliases cannot follow a Git symlink outside the snapshot", () => {
	const root = fixture(), base = git(root, "rev-parse", "HEAD").trim();
	const outside = join(root, "guard"); mkdirSync(outside); writeFileSync(join(outside, "child"), "KEEP\n");
	const foldsCase = existsSync(join(root, "GUARD"));
	const blob = (content: string) => execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: root, input: content, encoding: "utf8" }).trim();
	const tree = (content: string) => execFileSync("git", ["mktree", "-z"], { cwd: root, input: content, encoding: "utf8" }).trim();
	const target = blob(outside), replacement = blob("REPLACED\n");
	const child = tree(`100644 blob ${replacement}\tchild\0`);
	const top = tree(`120000 blob ${target}\tLink\0` + `040000 tree ${child}\tlink\0`);
	const head = git(root, "commit-tree", top, "-p", base, "-m", "link alias without checkout").trim();
	const result = reviewForecast(root, { mode: "committed", base, head });
	expect(readFileSync(join(outside, "child"), "utf8")).toBe("KEEP\n");
	if (foldsCase) expect(evaluateReviewForecast(result, 400)).toMatchObject({ decision: "unknown", overBudget: null });
	else expect(result.ok).toBeTrue();
});

test("scratch rejects leaf and directory collisions instead of overwriting or merging Git entries", () => {
	const root = fixture(), base = git(root, "rev-parse", "HEAD").trim();
	writeFileSync(join(root, "case-probe"), "probe"); const foldsCase = existsSync(join(root, "CASE-PROBE"));
	const blob = (content: string) => execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: root, input: content, encoding: "utf8" }).trim();
	const tree = (content: string) => execFileSync("git", ["mktree", "-z"], { cwd: root, input: content, encoding: "utf8" }).trim();
	const large = blob("large\n".repeat(600)), small = blob("small\n");
	const left = tree(`100644 blob ${large}\tleft.ts\0`), right = tree(`100644 blob ${small}\tright.ts\0`);
	for (const top of [tree(`100644 blob ${large}\tFile.ts\0` + `100644 blob ${small}\tfile.ts\0`), tree(`040000 tree ${left}\tDir\0` + `040000 tree ${right}\tdir\0`)]) {
		const head = git(root, "commit-tree", top, "-p", base, "-m", "case aliases without checkout").trim();
		const result = reviewForecast(root, { mode: "committed", base, head });
		if (foldsCase) expect(result).toMatchObject({ ok: false, reason: "scratch path collision" });
		else expect(result).toMatchObject({ ok: true, production: 602 });
	}
});
