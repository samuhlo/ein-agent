import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { beginVerification, finishVerification } from "../ein-pi/agent/lib/sdd-verification-runtime.ts";
import { resolveSddNext, sddNextHandoff } from "../ein-pi/agent/lib/sdd-router.ts";
import { formatSddCheck, formatSddStatus } from "../ein-cc/sdd-cli/presentation.ts";
import { runSyncCommand } from "../ein-cc/sdd-cli/sync-command.ts";

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "ein-cc", "sdd-cli", "cli.ts");
const PRESENTATION = join(ROOT, "ein-cc", "sdd-cli", "presentation.ts");
const SYNC_COMMAND = join(ROOT, "ein-cc", "sdd-cli", "sync-command.ts");

function cliStatus(cwd: string, change: string): string {
	return execFileSync("bun", [CLI, "status", change], {
		cwd,
		env: { ...process.env, CI: "1", EIN_CC_NO_GIT_INIT: "1" },
		encoding: "utf8",
	});
}

function completedChange(tasks: string): { cwd: string; change: string } {
	const cwd = mkdtempSync(join(tmpdir(), "claude-completed-tasks-"));
	const change = "completed";
	const path = join(cwd, "openspec", "changes", change);
	execFileSync("git", ["init", "-q"], { cwd });
	mkdirSync(path, { recursive: true });
	for (const file of ["scope.md", "map.md", "design.md"]) writeFileSync(join(path, file), "fixture\n");
	writeFileSync(join(path, "tasks.md"), tasks);
	writeFileSync(join(path, "apply-progress.md"), "status: complete\n");
	const begun = beginVerification({ cwd, changePath: path });
	if (!begun.ok) throw new Error(begun.reason);
	const finished = finishVerification({ cwd, changePath: path, token: begun.value.token, content: "status: pass\n" });
	if (!finished.ok) throw new Error(finished.reason);
	return { cwd, change };
}

function sourceFile(path: string): ts.SourceFile {
	return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function importedBindings(path: string, moduleName: string): string[] {
	return sourceFile(path).statements.flatMap((statement) => {
		if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.getText().slice(1, -1) !== moduleName) return [];
		return statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
			? statement.importClause.namedBindings.elements
				.filter((element) => !element.isTypeOnly)
				.map((element) => element.name.text)
				.sort()
			: [];
	});
}

function runtimeGlobals(path: string): string[] {
	const found = new Set<string>();
	const visit = (node: ts.Node): void => {
		if (ts.isIdentifier(node) && (node.text === "process" || node.text === "Bun")) found.add(node.text);
		ts.forEachChild(node, visit);
	};
	visit(sourceFile(path));
	return [...found].sort();
}

describe("fronteras internas de la CLI SDD de Claude", () => {
	test("la CLI consume las APIs propietarias y estas conservan su comportamiento", async () => {
		expect(existsSync(PRESENTATION)).toBeTrue();
		expect(existsSync(SYNC_COMMAND)).toBeTrue();
		expect(importedBindings(CLI, "./presentation.ts")).toEqual(["formatSddCheck", "formatSddStatus"]);
		expect(importedBindings(CLI, "./sync-command.ts")).toEqual(["runSyncCommand"]);
		expect(formatSddStatus({ change: null } as never, [])).toContain("No active SDD changes");
		expect(formatSddCheck({ change: "demo", errors: 0, warnings: 0, phases: [], issues: [] } as never))
			.toContain("sdd check — demo");
		expect(await runSyncCommand(ROOT, [])).toMatchObject({
			exitCode: 64,
			response: { outcome: "usage", code: "USAGE" },
		});
	});

	test("los módulos extraídos son puros respecto al proceso", () => {
		if (!existsSync(PRESENTATION) || !existsSync(SYNC_COMMAND)) return;
		expect(runtimeGlobals(PRESENTATION)).toEqual([]);
		expect(runtimeGlobals(SYNC_COMMAND)).toEqual([]);
	});

	test("status comparte con Pi la política de tareas terminadas y los bloqueos explícitos", () => {
		const completed = completedChange("## Completed work\n- [x] 1 Implemented\n- verify: bun test\n");
		const blocked = completedChange("status: blocked\nblocked_by: decisión pendiente\n- [X] 1 Implemented\n- verify: bun test\n");
		try {
			const completedOutput = cliStatus(completed.cwd, completed.change);
			expect(completedOutput).toContain("next: close");
			expect(completedOutput).not.toContain("tasks.md sin status ready|blocked.");
			expect(completedOutput).not.toContain("tasks.md sin blocked_by.");

			const blockedOutput = cliStatus(blocked.cwd, blocked.change);
			const piHandoff = sddNextHandoff(resolveSddNext(blocked.cwd, blocked.change));
			expect(blockedOutput).toContain("tasks.md bloqueado por: decisión pendiente");
			expect(piHandoff).toContain("tasks.md bloqueado por: decisión pendiente");
		} finally {
			rmSync(completed.cwd, { recursive: true, force: true });
			rmSync(blocked.cwd, { recursive: true, force: true });
		}
	});
});
