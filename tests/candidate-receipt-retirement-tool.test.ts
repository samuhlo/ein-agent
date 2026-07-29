import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Smoke only: verifica registro, imports y call-sites estáticos; no ejecuta la tool pública.
test("smoke-only: la tool pública de retiro conserva registro e import/call-sites estáticos", () => {
	const source = readFileSync(join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"), "utf8");
	expect(source).toContain('name: "ein_candidate_receipt_retire"');
	expect(source).toContain("resolveExplicitPushRemoteRepository");
	expect(source).toContain("observeMergedPullRequest");
	expect(source).toContain("readVerifiedDeliveryAttempt");
	expect(source).toContain("reportRetirementCleanup");
	expect(source).toContain("cleanupPending");
});
