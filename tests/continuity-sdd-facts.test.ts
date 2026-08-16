import { describe, expect, test } from "bun:test";
import { CONTINUITY_CHECKPOINT_LIMITS } from "../ein-pi/agent/lib/continuity-checkpoint.ts";
import { continuitySddFacts } from "../ein-pi/agent/lib/continuity-sdd-facts.ts";
import type { SddChangeStatus, SddTaskItem } from "../ein-pi/agent/lib/sdd-router.ts";

const FALLBACK = "Inspect current project state and continue from a verified boundary.";
const task = (id: string, title: string, done: boolean): SddTaskItem => ({ id, title, done });

function status(patch: Partial<SddChangeStatus> = {}, tasks: Partial<SddChangeStatus["tasks"]> = {}): SddChangeStatus {
	return {
		change: "add-continuity-facts",
		nextRecommended: "apply",
		blocked: [],
		tasks: {
			present: true, status: "ready", blockedBy: null, items: [], nextPending: null,
			counts: { pending: 0, ready: 0, blocked: 0, done: 0 }, problems: [],
			...tasks,
		},
		...patch,
	} as SddChangeStatus;
}

describe("continuity SDD facts", () => {
	test("reports completed tasks and the pending one as the next action", () => {
		const items = [task("1.1", "Derive checkpoint facts", true), task("1.2", "Wire the lifecycle port", false)];
		const facts = continuitySddFacts(status({}, { items, nextPending: items[1] }), FALLBACK);
		expect(facts?.completed).toEqual(["Derive checkpoint facts"]);
		expect(facts?.nextAction).toBe("Resume SDD change add-continuity-facts at pending task 1.2: Wire the lifecycle port");
	});

	test("falls back to the recommended phase when no task is pending", () => {
		const items = [task("1.1", "Derive checkpoint facts", true)];
		expect(continuitySddFacts(status({ nextRecommended: "verify" }, { items }), FALLBACK)?.nextAction)
			.toBe("Run the verify phase of SDD change add-continuity-facts.");
		expect(continuitySddFacts(status({ nextRecommended: "done" }, { items }), FALLBACK)?.nextAction)
			.toBe("SDD change add-continuity-facts is complete; archive it before starting new work.");
	});

	test("surfaces deterministic blockers as unresolved decisions, without duplicates", () => {
		const facts = continuitySddFacts(status({ blocked: ["verify-stale", "verify-stale"] }, { items: [task("1.1", "x", true)], blockedBy: "waiting-on-decision" }), FALLBACK);
		expect(facts?.unresolvedDecisions).toEqual(["waiting-on-decision", "verify-stale"]);
	});

	// Los títulos los escribe un modelo: un item indebido se descarta solo, nunca
	// degrada el paquete entero a los valores genéricos.
	test("drops unsafe or oversized items instead of the whole set", () => {
		const items = [
			task("1.1", "Safe title", true),
			task("1.2", "Leaked /Users/someone/secret.txt", true),
			task("1.3", "x".repeat(CONTINUITY_CHECKPOINT_LIMITS.maxItemBytes + 1), true),
		];
		expect(continuitySddFacts(status({}, { items }), FALLBACK)?.completed).toEqual(["Safe title"]);
	});

	test("declares nothing when there is no resolved change or no tasks artifact", () => {
		expect(continuitySddFacts(status({ change: null }), FALLBACK)).toBeNull();
		expect(continuitySddFacts(status({}, { present: false }), FALLBACK)).toBeNull();
	});

	test("caps the list at the checkpoint limit", () => {
		const items = Array.from({ length: CONTINUITY_CHECKPOINT_LIMITS.maxListItems + 5 }, (_, index) => task(`1.${index}`, `Task ${index}`, true));
		expect(continuitySddFacts(status({}, { items }), FALLBACK)?.completed).toHaveLength(CONTINUITY_CHECKPOINT_LIMITS.maxListItems);
	});
});
