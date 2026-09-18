import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { enumerateVerificationGit } from "../ein-pi/agent/lib/verification-surface-git.ts";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function repository(): string {
	const root = mkdtempSync(join(tmpdir(), "ein-verification-git-"));
	roots.push(root);
	execFileSync("git", ["init", "-q"], { cwd: root });
	writeFileSync(join(root, "tracked.txt"), "tracked\n");
	execFileSync("git", ["add", "tracked.txt"], { cwd: root });
	return root;
}

describe("enumerateVerificationGit", () => {
	test("enumera tracked aunque falte y untracked no ignorado, pero no ignored", () => {
		const root = repository();
		rmSync(join(root, "tracked.txt"));
		writeFileSync(join(root, "untracked"), "new\n");
		writeFileSync(join(root, ".gitignore"), "ignored\n");
		writeFileSync(join(root, "ignored"), "ignored\n");
		mkdirSync(join(root, "nested"));
		const result = enumerateVerificationGit(join(root, "nested"));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.entries).toContainEqual({ path: "tracked.txt", kind: "file" });
		expect(result.entries).toContainEqual({ path: "untracked", kind: "file" });
		expect(result.entries.map((entry) => entry.path)).not.toContain("ignored");
	});

	test("reconoce gitlinks por el modo de stage", () => {
		const root = repository();
		const child = mkdtempSync(join(tmpdir(), "ein-verification-submodule-"));
		roots.push(child);
		execFileSync("git", ["init", "-q"], { cwd: child });
		writeFileSync(join(child, "file"), "x\n");
		execFileSync("git", ["add", "."], { cwd: child });
		execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base"], { cwd: child });
		mkdirSync(join(root, "vendor"));
		execFileSync("git", ["-c", "protocol.file.allow=always", "submodule", "add", "-q", child, "vendor/sub"], { cwd: root });
		const result = enumerateVerificationGit(root);
		expect(result.ok && result.entries).toContainEqual({ path: "vendor/sub", kind: "gitlink" });
	});

	test("fuera de Git falla explícitamente", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-verification-no-git-"));
		roots.push(root);
		expect(enumerateVerificationGit(root)).toMatchObject({ ok: false, code: "git-unavailable" });
	});
});
