import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
const EXTERNAL_CONSUMER_ROOTS = ["ein-cc", "installer/src", "installer/scripts"] as const;
const CONTRACT_ROOT = "shared/contracts";
const PORT_ROOT = "shared/ports";

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
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/sdd-preflight.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/sdd-remedies.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/sdd-router.ts",
	"shared/ports/sdd.ts::../../ein-pi/agent/lib/sdd-summary-write.ts",
] as const;

const SHARED_CONTRACTS = [
	"ein-tv.ts",
	"memory-contract.ts",
	"runtime-compat.ts",
	"shared-config-update-advisor.ts",
	"style-contract.ts",
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

	test("todo puente temporal hacia Pi está centralizado y declarado", () => {
		expect(stringLiteralsContaining([PORT_ROOT], "ein-pi/agent")).toEqual([...ALLOWED_PI_BRIDGES].sort());
	});

	test("el template despliega las implementaciones compartidas, no los entrypoints de compatibilidad", () => {
		const bundle = readFileSync(join(ROOT, "installer/scripts/bundle-template.ts"), "utf8");
		for (const contract of SHARED_CONTRACTS) {
			expect(existsSync(join(ROOT, CONTRACT_ROOT, contract))).toBeTrue();
			const compatibilityEntrypoint = readFileSync(join(ROOT, "ein-pi/agent/lib", contract), "utf8");
			expect(compatibilityEntrypoint).toContain("Compatibility entrypoint");
			expect(compatibilityEntrypoint).toContain(`export * from "../../../shared/contracts/${contract}";`);
			expect(bundle).toContain(`  "${contract}",`);
		}
		expect(bundle).toContain('copyInto(SHARED_CONTRACT_SOURCE, join(staging, "lib"), SHARED_CONTRACT_FILES, [])');
	});
});
