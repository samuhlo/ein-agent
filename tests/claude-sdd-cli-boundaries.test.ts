import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { formatSddCheck, formatSddStatus } from "../ein-cc/sdd-cli/presentation.ts";
import { runSyncCommand } from "../ein-cc/sdd-cli/sync-command.ts";

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "ein-cc", "sdd-cli", "cli.ts");
const PRESENTATION = join(ROOT, "ein-cc", "sdd-cli", "presentation.ts");
const SYNC_COMMAND = join(ROOT, "ein-cc", "sdd-cli", "sync-command.ts");

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
});
