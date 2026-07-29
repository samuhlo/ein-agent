import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("la tool pública de retiro permanece registrada y usa el adaptador fail-closed", () => {
	const source = readFileSync(join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"), "utf8");
	expect(source).toContain('name: "ein_candidate_receipt_retire"');
	expect(source).toContain("resolveExplicitPushRemoteRepository");
	expect(source).toContain("observeMergedPullRequest");
	expect(source).toContain("readVerifiedDeliveryAttempt");
	expect(source).toContain("reportRetirementCleanup");
	expect(source).toContain("cleanupPending");
});
