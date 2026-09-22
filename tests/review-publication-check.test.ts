import { afterEach, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkReviewedPublication } from "../ein-pi/agent/lib/review-publication-check.ts";
import { reviewForecast } from "../ein-pi/agent/lib/review-forecast.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(lines = 1) {
	const root = mkdtempSync(join(tmpdir(), "review-publication spaces-")); roots.push(root);
	const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
	git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.test");
	writeFileSync(join(root, "base.ts"), "base\n"); git("add", "base.ts"); git("commit", "-qm", "base"); const base = git("rev-parse", "HEAD");
	writeFileSync(join(root, "feature.ts"), "x\n".repeat(lines)); git("add", "feature.ts"); git("commit", "-qm", "feature");
	const forecast = reviewForecast(root, { mode: "committed", base });
	if (!forecast.ok) throw new Error(forecast.reason);
	return { root, git, request: { baseOid: forecast.baseOid!, headOid: forecast.headOid!, snapshotRef: forecast.snapshotRef! } };
}
const pi = resolve(import.meta.dir, "../ein-pi/agent/lib/review-publication-check.ts");
const claude = resolve(import.meta.dir, "../ein-cc/sdd-cli/cli.ts");
function cli(root: string, entry: string, request: unknown) {
	return spawnSync(process.execPath, [entry, "review-publication-check"], { cwd: root, input: JSON.stringify(request), encoding: "utf8" });
}
test("Pi entry and Claude CLI check the same immutable measurement", () => {
	const { root, request } = fixture();
	expect(checkReviewedPublication(root, request)).toEqual({ ok: true });
	for (const entry of [pi, claude]) { const result = cli(root, entry, request); expect(result.status).toBe(0); expect(JSON.parse(result.stdout)).toEqual({ ok: true }); }
});
test("invalid, partial, over-budget or old-HEAD measurements prevent the fake publisher", () => {
	const box = fixture();
	const publish = (request: unknown) => spawnSync("sh", ["-c", '"$1" "$2" review-publication-check && touch published', "check", process.execPath, pi], { cwd: box.root, input: JSON.stringify(request), encoding: "utf8" });
	for (const request of [{ ...box.request, snapshotRef: `sha256:${"0".repeat(64)}` }, { ...box.request, baseOid: "bad" }]) {
		expect(publish(request).status).not.toBe(0); expect(existsSync(join(box.root, "published"))).toBe(false);
	}
	box.git("commit", "--allow-empty", "-qm", "new head"); expect(publish(box.request).status).not.toBe(0); expect(existsSync(join(box.root, "published"))).toBe(false);
	const large = fixture(600); expect(checkReviewedPublication(large.root, large.request).ok).toBe(false);
	const partial = reviewForecast(large.root, { mode: "committed", base: large.request.baseOid, paths: [] });
	expect(checkReviewedPublication(large.root, { ...large.request, snapshotRef: partial.snapshotRef! }).ok).toBe(false);
	const fresh = reviewForecast(box.root, { mode: "committed", base: box.request.baseOid });
	expect(publish({ baseOid: fresh.baseOid, headOid: fresh.headOid, snapshotRef: fresh.snapshotRef }).status).toBe(0);
	expect(existsSync(join(box.root, "published"))).toBe(true);
});
