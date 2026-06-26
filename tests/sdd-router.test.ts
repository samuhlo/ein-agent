// =============================================================================
// TESTS: sdd-router (estado SDD determinista)
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listActiveChanges, resolveSddStatus } from "../ein-pi/agent/lib/sdd-router";

let DIR: string;
function change(name: string): string {
	const p = join(DIR, "openspec", "changes", name);
	mkdirSync(p, { recursive: true });
	return p;
}
function put(changePath: string, file: string, body = "x"): void {
	writeFileSync(join(changePath, file), body);
}

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "sdd-router-"));
});
afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
});

describe("resolveSddStatus", () => {
	test("sin openspec → done, change null", () => {
		const s = resolveSddStatus(DIR);
		expect(s.change).toBeNull();
		expect(s.nextRecommended).toBe("done");
	});

	test("solo init.md → siguiente explore", () => {
		const c = change("feat-x");
		put(c, "init.md");
		const s = resolveSddStatus(DIR);
		expect(s.change).toBe("feat-x");
		expect(s.nextRecommended).toBe("explore");
	});

	test("hasta design → siguiente apply", () => {
		const c = change("feat-x");
		for (const f of ["init.md", "exploration.md", "design.md"]) put(c, f);
		expect(resolveSddStatus(DIR).nextRecommended).toBe("apply");
	});

	test("verify pass → siguiente archive", () => {
		const c = change("feat-x");
		for (const f of ["init.md", "exploration.md", "design.md", "apply-progress.md"]) put(c, f);
		put(c, "verify-report.md", "# Verify\nstatus: pass\n");
		const s = resolveSddStatus(DIR);
		expect(s.verify).toBe("pass");
		expect(s.nextRecommended).toBe("archive");
	});

	test("verify fail → vuelve a verify + blocked", () => {
		const c = change("feat-x");
		for (const f of ["init.md", "exploration.md", "design.md", "apply-progress.md"]) put(c, f);
		put(c, "verify-report.md", "# Verify\nstatus: fail\nCRITICAL: algo roto\n");
		const s = resolveSddStatus(DIR);
		expect(s.verify).toBe("fail");
		expect(s.nextRecommended).toBe("verify");
		expect(s.blocked.length).toBeGreaterThan(0);
	});

	test("listActiveChanges excluye archive/", () => {
		change("feat-x");
		change("feat-y");
		mkdirSync(join(DIR, "openspec", "changes", "archive", "viejo"), { recursive: true });
		expect(listActiveChanges(DIR).sort()).toEqual(["feat-x", "feat-y"]);
	});
});
