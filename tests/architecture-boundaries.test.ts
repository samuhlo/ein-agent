import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
const EXTERNAL_CONSUMER_ROOTS = ["ein-cc", "installer/src", "installer/scripts"] as const;
const CONTRACT_ROOT = "shared/contracts";
const PORT_ROOT = "shared/ports";
const SDD_CORE_ROOT = "shared/sdd";

const ALLOWED_PI_BRIDGES = [
	"shared/ports/continuity.ts::../../ein-pi/agent/lib/continuity-checkpoint.ts",
	"shared/ports/continuity.ts::../../ein-pi/agent/lib/continuity-handoff-lifecycle.ts",
	"shared/ports/continuity.ts::../../ein-pi/agent/lib/terminal-continue-transport.ts",
	"shared/ports/doctor.ts::../../ein-pi/agent/lib/doctor-core.ts",
	"shared/ports/linear.ts::../../ein-pi/agent/lib/linear-integration.ts",
	"shared/ports/runtime-payload.ts::ein-pi/agent/surfaces/surface-runner.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/git-baseline.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/guardrails.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/openspec-delta-write.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/openspec-spec-sync-fs.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/project-directives.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/sdd-close.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/sdd-guardrails.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/sdd-lane.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/sdd-preflight-record.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/sdd-summary-write.ts",
] as const;

function typescriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return typescriptFiles(path);
		return entry.isFile() && path.endsWith(".ts") ? [path] : [];
	});
}

function stringLiteralsContaining(roots: readonly string[], needle: string): string[] {
	const found = new Set<string>();
	for (const root of roots) {
		for (const file of typescriptFiles(join(ROOT, root))) {
			const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
			const visit = (node: ts.Node): void => {
				if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text.includes(needle)) {
					found.add(`${relative(ROOT, file)}::${node.text}`);
				}
				ts.forEachChild(node, visit);
			};
			visit(source);
		}
	}
	return [...found].sort();
}

function functionCalls(file: string, functionName: string, calleeName: string): ts.CallExpression[] {
	const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
	const calls: ts.CallExpression[] = [];
	const visitFunction = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === calleeName) {
			calls.push(node);
		}
		ts.forEachChild(node, visitFunction);
	};
	for (const statement of source.statements) {
		if (ts.isFunctionDeclaration(statement) && statement.name?.text === functionName) {
			ts.forEachChild(statement, visitFunction);
		}
	}
	return calls;
}

function importedModules(file: string): string[] {
	const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
	return source.statements.flatMap((statement) =>
		ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
			? [statement.moduleSpecifier.text]
			: [],
	);
}

describe("fronteras arquitectónicas del repositorio", () => {
	test("Claude e installer no acceden directamente a interiores de Pi", () => {
		expect(stringLiteralsContaining(EXTERNAL_CONSUMER_ROOTS, "ein-pi/agent")).toEqual([]);
	});

	test("los contratos compartidos no dependen de ningún adaptador", () => {
		const adapterReferences = ["ein-pi/", "ein-cc/", "installer/"].flatMap((needle) =>
			stringLiteralsContaining([CONTRACT_ROOT], needle),
		);
		expect(adapterReferences).toEqual([]);
	});

	test("el núcleo SDD compartido no depende de Pi, Claude ni installer", () => {
		const adapterReferences = ["ein-pi/", "ein-cc/", "installer/"].flatMap((needle) =>
			stringLiteralsContaining([SDD_CORE_ROOT], needle),
		);
		expect(adapterReferences).toEqual([]);
	});

	test("el código compartido no lanza procesos", () => {
		expect(stringLiteralsContaining([CONTRACT_ROOT, SDD_CORE_ROOT], "node:child_process")).toEqual([]);
	});

	test("todo puente temporal hacia Pi está centralizado y declarado", () => {
		expect(stringLiteralsContaining([PORT_ROOT], "ein-pi/agent")).toEqual([...ALLOWED_PI_BRIDGES].sort());
	});

	test("Claude adapta la intención con el contexto mínimo, sin fabricar un contexto de Pi", () => {
		const calls = functionCalls(
			join(ROOT, "ein-cc", "sdd-cli", "cli.ts"),
			"runClaudeIntentPreflight",
			"resolveSddIntentPreflight",
		);
		expect(calls).toHaveLength(1);
		const context = calls[0]?.arguments[0];
		expect(context && ts.isObjectLiteralExpression(context)).toBe(true);
		if (!context || !ts.isObjectLiteralExpression(context)) return;
		expect(context.properties.map((property) => property.name?.getText()).sort()).toEqual(["cwd", "sessionKey"]);
	});

	test("el template despliega las implementaciones compartidas, no los entrypoints de compatibilidad", () => {
		const bundle = readFileSync(join(ROOT, "installer/scripts/bundle-template.ts"), "utf8");
		expect(bundle).toContain("sharedTypeScriptFiles(SHARED_CONTRACT_SOURCE)");
		expect(bundle).toContain('copyRequiredFiles(SHARED_CONTRACT_SOURCE, join(staging, "lib"), SHARED_CONTRACT_FILES)');
		expect(bundle).toContain("sharedTypeScriptFiles(SHARED_SDD_SOURCE)");
		expect(bundle).toContain('copyRequiredFiles(SHARED_SDD_SOURCE, join(staging, "lib"), SHARED_SDD_FILES)');
	});

	test("el diario deja una fachada fina y mantiene puras sus decisiones", () => {
		const core = join(ROOT, "installer", "src", "core");
		const facade = readFileSync(join(core, "install-journal.ts"), "utf8");
		const executionPath = join(core, "install-journal-execution.ts");

		expect(existsSync(executionPath)).toBeTrue();
		expect(facade).not.toMatch(/\bfunction\b|randomUUID|executeInstallPlan\(/);
		expect(facade).toContain('export { executeInstallPlanJournaled } from "./install-journal-execution.ts";');

		for (const name of ["install-journal-codec.ts", "install-journal-policy.ts"]) {
			const source = readFileSync(join(core, name), "utf8");
			expect(source).not.toMatch(/node:fs|install-executor|install-journal-persistence|install-journal-store/);
		}
	});

	test("el dominio de ajustes posee su modelo y la interfaz depende de él", () => {
		const lib = join(ROOT, "ein-pi", "agent", "lib");
		expect(importedModules(join(lib, "project-settings.ts"))).not.toContain("./terminal-app.ts");
		expect(importedModules(join(lib, "terminal-app.ts"))).toContain("./project-settings.ts");
	});
});
