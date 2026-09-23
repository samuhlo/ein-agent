import { describe, expect, test } from "bun:test";

import { formatReconciliation, phaseForAgent, resolveDelegationPhase } from "../ein-pi/agent/lib/sdd-reconcile.ts";

describe("phase reconciliation routing", () => {
	test("reconoce solo una fase canónica", () => {
		expect(phaseForAgent("sdd-map")).toBe("map");
		expect(phaseForAgent("ein-scout")).toBeNull();
		expect(resolveDelegationPhase({ agent: "sdd-verify", task: "verify" })).toBe("verify");
		expect(resolveDelegationPhase({ workflowScript: `return runs.all([{key:"a",agent:"sdd-map",task:"a"},{key:"b",agent:"sdd-design",task:"b"}])` })).toBeNull();
	});

	test("solo complete se presenta como recuperado y siempre conserva el error", () => {
		const launch = { version: 1 as const, toolCallId: "call", nonce: "nonce", root: "/repo", change: "change", phase: "map" as const, artifact: "/repo/openspec/changes/change/map.md", intentKey: null, startedAt: new Date(0).toISOString(), initialArtifactSha256: null };
		const complete = formatReconciliation({ state: "complete", reason: "done", launch }, "transport failed");
		expect(complete).toContain("finalizado y recuperado");
		expect(complete).toContain("transport failed");
		const partial = formatReconciliation({ state: "unconfirmed", reason: "receipt absent", launch }, "transport failed");
		expect(partial).toContain("Artefacto parcial disponible");
		expect(partial).not.toContain("finalizado y recuperado");
	});
});
