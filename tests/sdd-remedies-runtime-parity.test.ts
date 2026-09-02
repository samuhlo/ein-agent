import { describe, expect, test } from "bun:test";

import * as piRemedies from "../ein-pi/agent/lib/sdd-remedies.ts";
import * as sharedRemedies from "../shared/sdd/sdd-remedies.ts";

const STATUSES = [
	{ specState: "pending", verifyStale: false, summaryStale: false },
	{ specState: "unresolved", verifyStale: true, summaryStale: false },
	{ specState: "conflict", verifyStale: false, summaryStale: true },
	{ specState: "synchronized", verifyStale: true, summaryStale: true, nextPhase: "close" },
	{ specState: "legacy", verifyStale: false, summaryStale: false, nextPhase: "close" },
] as const;

describe("SDD remedies runtime parity", () => {
	test("Pi and the shared core preserve ordered remedies for every state family", () => {
		for (const runtime of ["pi", "claude"] as const) {
			for (const status of STATUSES) {
				expect(sharedRemedies.collectSddRemedies(status, runtime)).toEqual(
					piRemedies.collectSddRemedies(status, runtime),
				);
			}
		}
	});

	test("Pi and the shared core preserve formatted bytes", () => {
		for (const runtime of ["pi", "claude"] as const) {
			for (const status of STATUSES) {
				const shared = sharedRemedies.collectSddRemedies(status, runtime);
				const pi = piRemedies.collectSddRemedies(status, runtime);
				expect(sharedRemedies.formatSddRemedies(shared)).toBe(piRemedies.formatSddRemedies(pi));
			}
		}
	});
});
