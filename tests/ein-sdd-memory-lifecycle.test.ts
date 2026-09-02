// =============================================================================
// TESTS: EIN SDD MEMORY LIFECYCLE
// Keeps optional Engram preparation and save policy outside the Pi facade.
// =============================================================================

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { skippedMemoryReceipt } from "../ein-pi/agent/extensions/internal/ein-sdd-memory.ts";

test("builds an honest skipped receipt", () => {
	const receipt = skippedMemoryReceipt("memory_disabled");

	expect(receipt.operation).toBe("save");
	expect(receipt.status).toBe("skipped");
	expect(receipt.reason).toBe("memory_disabled");
	expect(receipt.durationMs).toBe(0);
});

test("the main extension consumes the memory owner", () => {
	const source = readFileSync(
		join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"),
		"utf8",
	);
	const session = readFileSync(
		join(import.meta.dir, "../ein-pi/agent/extensions/internal/ein-session-lifecycle.ts"),
		"utf8",
	);
	const lifecycle = readFileSync(
		join(import.meta.dir, "../ein-pi/agent/extensions/internal/ein-sdd-lifecycle-tools.ts"),
		"utf8",
	);

	expect(source).toContain("registerSessionLifecycle");
	expect(session).toContain("memoryLifecycleForSession");
	expect(lifecycle).toContain("saveCheckedPhaseMemory");
	expect(lifecycle).toContain("saveArchivedCloseMemory");
	expect(session).not.toContain("function memoryLifecycleForSession");
	expect(source).not.toContain("function saveCheckedPhaseMemory");
});
