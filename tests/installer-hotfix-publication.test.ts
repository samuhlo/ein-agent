import { afterEach, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workflow = readFileSync(join(import.meta.dir, "../.github/workflows/installer-release.yml"), "utf8");
const branch = "maintenance/0.99.0-alpha.15";
const baseTag = "installer-v0.99.0-alpha.15";
const hotfixTag = "installer-v0.99.0-alpha.15.1";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function step(name: string): string {
	const start = workflow.indexOf(`      - name: ${name}\n`);
	if (start < 0) throw new Error(`Missing workflow step: ${name}`);
	const end = workflow.indexOf("\n      - ", start + 1);
	const block = workflow.slice(start, end < 0 ? workflow.length : end);
	const run = block.indexOf("\n        run: |\n");
	if (run < 0) throw new Error(`Missing run script: ${name}`);
	return block.slice(run + "\n        run: |\n".length).split("\n").map(line => line.startsWith("          ") ? line.slice(10) : line).join("\n");
}

function fixture(withFix = true) {
	const root = mkdtempSync(join(tmpdir(), "ein-hotfix-release-")); roots.push(root);
	const repo = join(root, "repo"), remote = join(root, "remote.git"), bin = join(root, "bin");
	mkdirSync(repo); mkdirSync(bin);
	execFileSync("git", ["init", "--bare", "-q", remote]);
	const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
	git("init", "-q", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
	writeFileSync(join(repo, "feature.ts"), "export const value = 1;\n");
	git("add", "feature.ts"); git("commit", "-qm", "base"); git("tag", "-a", baseTag, "-m", baseTag);
	git("remote", "add", "origin", remote); git("push", "-q", "origin", "main", baseTag);
	git("switch", "-q", "-c", branch);
	if (withFix) writeFileSync(join(repo, "feature.ts"), "export const value = 2;\n");
	writeFileSync(join(repo, "CHANGELOG.md"), "## [0.99.0-alpha.15.1]\n");
	git("add", "feature.ts", "CHANGELOG.md"); git("commit", "-qm", "hotfix PR"); git("push", "-q", "origin", branch);
	const candidate = git("rev-parse", "HEAD");
	const gh = join(bin, "gh");
	writeFileSync(gh, '#!/bin/sh\ncase "$1 $2" in\n  "release view") printf "%s\\n" "$GH_BASE_PUBLISHED" ;;\n  "pr list") if [ "$GH_MERGED_COMMIT" = "$GH_EXPECTED_CANDIDATE" ]; then printf "42\\n"; fi ;;\n  "pr checks") if [ "$GH_PR_CHECKS_PASS" = "true" ]; then printf "[{\\"name\\":\\"test (macos-latest)\\",\\"state\\":\\"SUCCESS\\"},{\\"name\\":\\"test (ubuntu-latest)\\",\\"state\\":\\"SUCCESS\\"},{\\"name\\":\\"docs-site\\",\\"state\\":\\"SUCCESS\\"}]\\n"; else exit 1; fi ;;\n  *) exit 1 ;;\nesac\n');
	chmodSync(gh, 0o755);
	const run = (name: string, overrides: Record<string, string> = {}) => spawnSync("bash", ["-e", "-u", "-o", "pipefail", "-c", step(name)], {
		cwd: repo, encoding: "utf8", env: {
			...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, GH_MERGED_COMMIT: candidate, GH_EXPECTED_CANDIDATE: candidate,
			GH_BASE_PUBLISHED: "true", GH_PR_CHECKS_PASS: "true",
			HOTFIX: "true", RELEASE_TAG: hotfixTag, MAINTENANCE_BRANCH: branch, BASE_TAG: baseTag,
			GH_TOKEN: "fixture", ...overrides,
		},
	});
	return { git, repo, remote, candidate, run };
}

test("a merged maintenance fix passes source validation and receives one annotated tag", () => {
	const box = fixture();
	expect(box.run("Verify release source").status).toBe(0);
	expect(box.run("Tag verified hotfix").status).toBe(0);
	const remoteTag = execFileSync("git", ["rev-parse", `${hotfixTag}^{commit}`], { cwd: box.remote, encoding: "utf8" }).trim();
	expect(remoteTag).toBe(box.candidate);
	expect(box.run("Verify release source").status).toBe(0);
	expect(box.run("Tag verified hotfix").status).toBe(0);
});

test("source validation rejects missing review, an empty fix, or a non-main normal tag", () => {
	const box = fixture();
	expect(box.run("Verify release source", { GH_MERGED_COMMIT: "0".repeat(40) }).status).not.toBe(0);
	expect(box.run("Verify release source", { GH_PR_CHECKS_PASS: "false" }).status).not.toBe(0);
	expect(box.run("Verify release source", { GH_BASE_PUBLISHED: "false" }).status).not.toBe(0);
	expect(box.run("Verify release source", { HOTFIX: "false" }).status).not.toBe(0);
	const empty = fixture(false);
	expect(empty.run("Verify release source").status).not.toBe(0);
});

test("an existing hotfix tag at another commit stops before a new build", () => {
	const box = fixture();
	box.git("tag", "-a", hotfixTag, "-m", hotfixTag, `${baseTag}^{commit}`);
	box.git("push", "-q", "origin", hotfixTag);
	expect(box.run("Verify release source").status).not.toBe(0);
});

test("maintenance cannot absorb development commits made after the base alpha", () => {
	const box = fixture();
	box.git("switch", "-q", "main");
	writeFileSync(join(box.repo, "later.ts"), "export const later = true;\n");
	box.git("add", "later.ts"); box.git("commit", "-qm", "later main work"); box.git("push", "-q", "origin", "main");
	box.git("switch", "-q", branch); box.git("merge", "-q", "main", "-m", "accidental main merge");
	box.git("push", "-q", "origin", branch);
	expect(box.run("Verify release source", { GH_MERGED_COMMIT: box.git("rev-parse", "HEAD") }).status).not.toBe(0);
});

test("a moved maintenance branch cannot be tagged after the build", () => {
	const box = fixture();
	expect(box.run("Verify release source").status).toBe(0);
	box.git("commit", "--allow-empty", "-qm", "branch moved");
	box.git("push", "-q", "origin", branch);
	box.git("checkout", "-q", box.candidate);
	expect(box.run("Tag verified hotfix").status).not.toBe(0);
});

test("the workflow tags only after build, smoke, E2E and checksums", () => {
	const names = ["Build all targets (bundles template + cross-compiles)", "Compiled BunFS payload smoke (Linux x64)", "Pre-publication installer E2E (Ubuntu)", "Checksums", "Tag verified hotfix", "Publish release"];
	const positions = names.map(name => workflow.indexOf(`- name: ${name}`));
	expect(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1]!))).toBe(true);
	expect(workflow).toContain("if: steps.resolve_release_tag.outputs.hotfix == 'true'");
});
