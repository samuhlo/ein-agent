// =============================================================================
// TESTS: installer deps — codegraph opcional
// Fija el contrato: codegraph aparece en checkDeps como dependencia NO
// obligatoria (nunca bloquea install/doctor), igual que engram/gh/hypa.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { checkDeps } from "../installer/src/core/deps";
import { detectPlatform } from "../installer/src/core/platform";

describe("checkDeps — codegraph", () => {
	const deps = checkDeps(detectPlatform());
	const cg = deps.find((d) => d.id === "codegraph");

	test("codegraph está en la lista de deps", () => {
		expect(cg).toBeDefined();
	});

	test("codegraph es opcional (nunca bloquea)", () => {
		expect(cg?.required).toBe(false);
	});

	test("hint menciona el grafo de código", () => {
		expect(cg?.hint).toContain("grafo de código");
	});
});
