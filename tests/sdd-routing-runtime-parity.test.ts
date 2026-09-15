import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveSddStatus as resolvePiStatus } from "../ein-pi/agent/lib/sdd-routing-runtime.ts";
import { resolveSddStatus as resolveClaudeStatus } from "../shared/ports/sdd.ts";
import { writeAgreement } from "../shared/sdd/intent-agreement.ts";
import { createIntentMaterialKey } from "../shared/sdd/sdd-intent-preflight.ts";

let cwd: string;

function seedChange(name: string, files: Readonly<Record<string, string>>): void {
	const root = join(cwd, "openspec", "changes", name);
	mkdirSync(root, { recursive: true });
	for (const [file, content] of Object.entries(files)) writeFileSync(join(root, file), content);
}

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "ein-routing-parity-"));
	mkdirSync(join(cwd, "openspec", "changes", "archive"), { recursive: true });
});
afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

describe("SDD routing composition parity", () => {
	test("Pi and Claude preserve none and ambiguity", () => {
		expect(resolveClaudeStatus(cwd)).toEqual(resolvePiStatus(cwd));
		seedChange("zeta", {});
		seedChange("alpha", {});
		expect(resolveClaudeStatus(cwd)).toEqual(resolvePiStatus(cwd));
		expect(resolveClaudeStatus(cwd).selection).toEqual({
			kind: "ambiguous",
			candidates: ["alpha", "zeta"],
		});
	});

	test("Pi and Claude preserve explicit routed state and lane", () => {
		seedChange("probe", {
			"scope.md": "# Scope\n\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: Internal ownership refactor with unchanged lifecycle behavior.\n",
			"design.md": "# Design\n",
			"lane.json": `${JSON.stringify({ lane: "micro" }, null, 2)}\n`,
		});
		const pi = resolvePiStatus(cwd, "probe");
		const claude = resolveClaudeStatus(cwd, "probe");
		expect(claude).toEqual(pi);
		expect(claude).toMatchObject({ lane: "micro", nextRecommended: "apply", specState: "synchronized" });
	});

	test("Pi and Claude keep pending apply ahead of stale verify intent", () => {
		const material = {
			objective: "Complete pending work",
			boundaries: { in: ["Backend"], out: ["Frontend"] },
			completionCriteria: ["All tasks complete"],
		};
		const key = createIntentMaterialKey(material);
		seedChange("probe", {
			"scope.md": `scope\nintent_key: ${key}\n`,
			"map.md": `scope_status: ok\nintent_key: ${key}\n`,
			"design.md": `design\nintent_key: ${key}\n`,
			"tasks.md": `status: ready\nblocked_by: none\n- [x] 10.1 Contract\n- [ ] 11.1 Create\nintent_key: ${key}\n`,
			"apply-progress.md": `status: partial\nintent_key: ${key}\n`,
			"verify-report.md": `status: pass\nintent_key: sha256:${"a".repeat(64)}\n`,
		});
		const dir = join(cwd, "openspec", "changes", "probe");
		writeAgreement(dir, {
			version: 1,
			work: "probe",
			change: "probe",
			status: "confirmed",
			material,
			materialKey: key,
			questions: ["Proceed?"],
			response: { id: "response-1", text: "Confirmed", source: "interactive" },
			revision: "revision-1",
		});

		const pi = resolvePiStatus(cwd, "probe");
		const claude = resolveClaudeStatus(cwd, "probe");
		expect(claude).toEqual(pi);
		expect(pi.nextRecommended).toBe("apply");
		expect(pi.tasks.nextPending?.id).toBe("11.1");
	});
});
