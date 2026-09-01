import { describe, expect, test } from "bun:test";
import { join, relative } from "node:path";

import { collectSourceClosure } from "../installer/scripts/bundle-ein-cc.ts";
import { EIN_CC_PAYLOAD_SOURCE_ENTRIES } from "../installer/src/core/cc-payload-inventory.ts";

const ROOT = join(import.meta.dir, "..");
const RETIRED_INTENT_COLLATERAL = [
	"ein-pi/agent/extensions/ein-paths.ts",
	"ein-pi/agent/lib/engram-cli.ts",
	"ein-pi/agent/lib/memory-contract.ts",
	"ein-pi/agent/lib/memory-lifecycle.ts",
	"ein-pi/agent/lib/review-forecast.ts",
	"ein-pi/agent/lib/sdd-assets.ts",
	"ein-pi/agent/lib/sdd-intent-preflight.ts",
	"ein-pi/agent/lib/sdd-preflight.ts",
	"ein-pi/agent/lib/sdd-session-memory.ts",
	"shared/contracts/memory-contract.ts",
] as const;
const RETIRED_ROUTING_COLLATERAL = ["ein-pi/agent/lib/sdd-router.ts"] as const;

function runtimeClosure(entries: readonly string[]): string[] {
	return collectSourceClosure(ROOT, entries)
		.map((path) => relative(ROOT, path))
		.sort();
}

describe("Claude SDD runtime closure", () => {
	test("keeps Pi-only intent collaborators outside the shared cut", () => {
		const closure = runtimeClosure(["ein-cc/sdd-cli/cli.ts"]);

		expect(closure).toContain("shared/sdd/sdd-intent-preflight.ts");
		expect(closure).toContain("shared/sdd/sdd-intent-resolution.ts");
		expect(closure).toContain("shared/sdd/sdd-routing-core.ts");
		for (const path of RETIRED_INTENT_COLLATERAL) expect(closure).not.toContain(path);
	});

	test("keeps the historical Pi router outside the complete Claude payload", () => {
		const closure = runtimeClosure(EIN_CC_PAYLOAD_SOURCE_ENTRIES);

		expect(closure).toContain("shared/sdd/sdd-routing-core.ts");
		for (const path of RETIRED_ROUTING_COLLATERAL) expect(closure).not.toContain(path);
	});
});

// RETIRADA -> Este centinela deja de ser necesario cuando la persistencia de
// intención ya no cruza Pi y el inventario general de puentes posee el corte.
