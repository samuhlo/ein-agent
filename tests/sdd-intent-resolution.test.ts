import { describe, expect, test } from "bun:test";

import {
	createSddIntentPreflightCoordinator,
	type SddIntentPreflightInput,
	type SddIntentRecord,
	type SddIntentResolutionDependencies,
} from "../shared/sdd/sdd-intent-resolution.ts";

const MATERIAL = {
	objective: "Share one intent coordinator",
	boundaries: { in: ["intent"], out: ["routing"] },
	completionCriteria: ["both adapters use the shared core"],
} as const;

const SMALL_EVIDENCE: SddIntentPreflightInput["evidence"] = {
	activation: "modifying",
	declaredLane: null,
	bounded: true,
	mechanical: true,
	documentationOrTextOnly: false,
	introducesBehavior: false,
	securityRisk: false,
	persistentDataRisk: false,
	destructiveActionRisk: false,
	bypassRequested: false,
};

function input(overrides: Partial<SddIntentPreflightInput> = {}): SddIntentPreflightInput {
	return {
		change: "shared-intent",
		evidence: SMALL_EVIDENCE,
		summary: "Share one intent coordinator.",
		material: MATERIAL,
		materialEvidence: "sufficient",
		...overrides,
	};
}

function harness(options: {
	intent?: SddIntentRecord;
	declaredLane?: "micro" | "standard" | null;
	persisted?: "persisted" | "unpersisted";
} = {}) {
	const calls = { reads: 0, persists: 0, notices: [] as string[] };
	const dependencies: SddIntentResolutionDependencies = {
		readState: () => {
			calls.reads += 1;
			return {
				...(options.intent ? { intent: options.intent } : {}),
				declaredLane: options.declaredLane ?? null,
			};
		},
		persistResolution: () => {
			calls.persists += 1;
			return { kind: options.persisted ?? "persisted" };
		},
		now: () => "2026-09-01T10:00:00.000Z",
	};
	const coordinator = createSddIntentPreflightCoordinator(dependencies);
	const context = {
		cwd: "/project",
		sessionKey: "session",
		notify: (message: string) => calls.notices.push(message),
	};
	return { calls, coordinator, context };
}

describe("shared SDD intent coordinator", () => {
	test("resolves a small intent through injected state, persistence and clock", async () => {
		const box = harness();
		const result = await box.coordinator.resolve(box.context, input());

		expect(result).toMatchObject({
			kind: "resolved",
			route: "small",
			resolution: "automatic-small",
			persisted: true,
			intent: { resolvedAt: "2026-09-01T10:00:00.000Z", laneOrigin: "classified" },
		});
		expect(box.calls).toEqual({ reads: 1, persists: 1, notices: ["Share one intent coordinator."] });
	});

	test("a declared lane stays authoritative before classification", async () => {
		const box = harness({ declaredLane: "standard" });
		const result = await box.coordinator.resolve(box.context, input({ confirmed: false }));

		expect(result.kind).toBe("pending");
		expect(result.kind === "pending" && result.reason).toBe("confirmation-required");
		expect(box.calls.persists).toBe(0);
	});

	test("read-only and uncertain material never call persistence", async () => {
		const box = harness();
		const readOnly = await box.coordinator.resolve(
			{ ...box.context, sessionKey: "read-only" },
			input({ evidence: { ...SMALL_EVIDENCE, activation: "read-only" } }),
		);
		const uncertain = await box.coordinator.resolve(
			{ ...box.context, sessionKey: "uncertain" },
			input({ materialEvidence: "uncertain" }),
		);

		expect(readOnly.kind).toBe("read-only");
		expect(uncertain.kind).toBe("pending");
		expect(box.calls.persists).toBe(0);
	});

	test("concurrent calls share one resolution and one notification", async () => {
		const box = harness();
		const [first, second] = await Promise.all([
			box.coordinator.resolve(box.context, input()),
			box.coordinator.resolve(box.context, input()),
		]);

		expect(first).toBe(second);
		expect(box.calls).toEqual({ reads: 1, persists: 1, notices: ["Share one intent coordinator."] });
	});
});
