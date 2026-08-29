import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
const PRODUCTION_ROOTS = ["ein-cc", "installer/src", "installer/scripts"] as const;

const KNOWN_PI_RUNTIME_REACH_INS = [
	"ein-cc/continuity-runner.ts::../ein-pi/agent/lib/continuity-checkpoint.ts",
	"ein-cc/continuity-runner.ts::../ein-pi/agent/lib/continuity-handoff-lifecycle.ts",
	"ein-cc/continuity-runner.ts::../ein-pi/agent/lib/memory-contract.ts",
	"ein-cc/continuity-runner.ts::../ein-pi/agent/lib/terminal-continue-transport.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/git-baseline.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/guardrails.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/openspec-delta-write.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/openspec-spec-sync-fs.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/project-directives.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/sdd-close.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/sdd-guardrails.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/sdd-lane.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/sdd-preflight-record.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/sdd-preflight.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/sdd-remedies.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/sdd-router.ts",
	"ein-cc/sdd-cli/cli.ts::../../ein-pi/agent/lib/sdd-summary-write.ts",
	"ein-cc/sync.ts::../ein-pi/agent/lib/memory-contract.ts",
	"ein-cc/sync.ts::../ein-pi/agent/lib/style-contract.ts",
	"installer/src/cli/doctor.ts::../../../ein-pi/agent/lib/shared-config-update-advisor.ts",
	"installer/src/cli/install.ts::../../../ein-pi/agent/lib/linear-integration.ts",
	"installer/src/cli/install.ts::../../../ein-pi/agent/lib/runtime-compat.ts",
	"installer/src/core/cc-payload-inventory.ts::ein-pi/agent/assets/orchestrator.md",
	"installer/src/core/cc-payload-inventory.ts::ein-pi/agent/lib/style-contract.ts",
	"installer/src/core/cc-payload-inventory.ts::ein-pi/agent/surfaces/surface-runner.ts",
	"installer/src/core/deploy.ts::../../../ein-pi/agent/lib/linear-integration.ts",
	"installer/src/core/deps.ts::../../../ein-pi/agent/lib/runtime-compat.ts",
	"installer/src/core/paths.ts::../../../ein-pi/agent/lib/memory-contract.ts",
	"installer/src/core/settings.ts::../../../ein-pi/agent/lib/runtime-compat.ts",
	"installer/src/core/verify.ts::../../../ein-pi/agent/lib/doctor-core.ts",
	"installer/src/core/verify.ts::../../../ein-pi/agent/lib/runtime-compat.ts",
	"installer/src/tui/banner.ts::../../../ein-pi/agent/lib/ein-tv.ts",
] as const;

function productionTypescriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return productionTypescriptFiles(path);
		return entry.isFile() && path.endsWith(".ts") ? [path] : [];
	});
}

function piRuntimeReachIns(): string[] {
	const found = new Set<string>();
	for (const productionRoot of PRODUCTION_ROOTS) {
		for (const file of productionTypescriptFiles(join(ROOT, productionRoot))) {
			const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
			const visit = (node: ts.Node): void => {
				if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text.includes("ein-pi/agent")) {
					found.add(`${relative(ROOT, file)}::${node.text}`);
				}
				ts.forEachChild(node, visit);
			};
			visit(source);
		}
	}
	return [...found].sort();
}

describe("límites arquitectónicos previos a la reestructuración", () => {
	test("installer y ein-cc no aumentan sus accesos directos al runtime de Pi", () => {
		expect(piRuntimeReachIns()).toEqual([...KNOWN_PI_RUNTIME_REACH_INS].sort());
	});
});
