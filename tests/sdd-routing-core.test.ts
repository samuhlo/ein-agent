import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	createSddRoutingCore,
	isSafeChangeName,
	listActiveChanges,
	resolveActiveSelection,
	selectedChange,
} from "../shared/sdd/sdd-routing-core.ts";

let cwd: string;

function change(name: string, files: Readonly<Record<string, string>> = {}): string {
	const root = join(cwd, "openspec", "changes", name);
	mkdirSync(root, { recursive: true });
	for (const [file, content] of Object.entries(files)) writeFileSync(join(root, file), content);
	return root;
}

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "ein-shared-routing-"));
	mkdirSync(join(cwd, "openspec", "changes", "archive"), { recursive: true });
});

afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

describe("shared SDD routing core", () => {
	test("selection distinguishes none, only, explicit and sorted ambiguity", () => {
		expect(resolveActiveSelection(cwd)).toEqual({ kind: "none" });
		change("zeta");
		expect(resolveActiveSelection(cwd)).toEqual({ kind: "only", change: "zeta" });
		change("alpha");
		expect(resolveActiveSelection(cwd)).toEqual({ kind: "ambiguous", candidates: ["alpha", "zeta"] });
		expect(resolveActiveSelection(cwd, "zeta")).toEqual({ kind: "explicit", change: "zeta" });
		expect(selectedChange(resolveActiveSelection(cwd))).toBeNull();
		expect(listActiveChanges(cwd)).toEqual(["alpha", "zeta"]);
		expect(isSafeChangeName("alpha-zeta")).toBe(true);
		expect(isSafeChangeName("../alpha")).toBe(false);
	});

	test("injected lane and spec evidence drive one fail-closed route", () => {
		change("probe", { "scope.md": "# Scope\n" });
		const synchronized = createSddRoutingCore({
			readLane: () => "standard",
			readSpecState: () => "synchronized",
		});
		expect(synchronized.resolveSddStatus(cwd, "probe")).toMatchObject({
			change: "probe",
			selection: { kind: "explicit", change: "probe" },
			currentPhase: "map",
			nextRecommended: "map",
			specState: "synchronized",
			blocked: [],
		});

		const unresolved = createSddRoutingCore({
			readLane: () => "standard",
			readSpecState: () => "unresolved",
		});
		const blocked = unresolved.resolveSddStatus(cwd, "probe");
		expect(blocked.nextRecommended).toBe("scope");
		expect(blocked.blocked.join(" ")).toContain("procedencia");
	});

	test("micro lane skips map and tasks without weakening apply", () => {
		change("micro", { "scope.md": "# Scope\n", "design.md": "# Design\n" });
		const routing = createSddRoutingCore({
			readLane: () => "micro",
			readSpecState: () => "synchronized",
		});
		const status = routing.resolveSddStatus(cwd, "micro");
		expect(status.nextRecommended).toBe("apply");
		expect(status.artifacts.missing.map((artifact) => artifact.phase)).toEqual(["apply", "verify", "close"]);
	});
});
