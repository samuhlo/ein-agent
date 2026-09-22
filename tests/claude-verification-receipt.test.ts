import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runVerificationCommand } from "../ein-cc/sdd-cli/verification-command.ts";
import { compileClaudeSurface } from "../ein-cc/sync.ts";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "ein-claude-verification-"));
	roots.push(root);
	execFileSync("git", ["init", "-q"], { cwd: root });
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src/a.ts"), "export const a = 'spaces and newlines';\n");
	execFileSync("git", ["add", "src/a.ts"], { cwd: root });
	mkdirSync(join(root, "openspec/changes/change with spaces"), { recursive: true });
	writeFileSync(join(root, "openspec/changes/change with spaces/tasks.md"), "status: ready\n- [x] done\n");
	return root;
}

describe("Claude verification receipt", () => {
	test("begin/finish reales conservan espacios y nuevas líneas sin shell", () => {
		const root = fixture();
		const begun = runVerificationCommand(root, ["change with spaces", "begin"], "");
		expect(begun.exitCode).toBe(0);
		const token = JSON.parse(begun.text).token as string;
		const report = "status: pass\nbehavior_coverage: verified\n\n## Note\nspaces; $(never-executed)\n";
		const finished = runVerificationCommand(root, ["change with spaces", "finish", "--token", token], report);
		expect(finished.exitCode).toBe(0);
		expect(readFileSync(join(root, "openspec/changes/change with spaces/verify-report.md"), "utf8")).toBe(report);
	});

	test("errores devuelven código no cero y Claude traduce la tool al comando real", () => {
		const root = fixture();
		expect(runVerificationCommand(root, ["change with spaces", "finish"], "report").exitCode).toBe(1);
		const agent = compileClaudeSurface().agents["sdd-verify.md"] ?? "";
		expect(agent).toContain("ein-cc-sdd verification");
		expect(agent).not.toContain("ein_sdd_verification");
		expect(agent).toMatch(/^tools: Read, Grep, Glob, Bash$/m);
	});
});
