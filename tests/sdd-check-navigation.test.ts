import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerSddLifecycleTools } from "../ein-pi/agent/extensions/internal/ein-sdd-lifecycle-tools.ts";
import { registerSddReadSurface } from "../ein-pi/agent/extensions/internal/ein-sdd-read-surface.ts";
import { resolveSddNext, resolveSddPlanPreview } from "../ein-pi/agent/lib/sdd-router.ts";
import { lintChange } from "../ein-pi/agent/lib/sdd-guardrails.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
	const cwd = mkdtempSync(join(tmpdir(), "ein-check-navigation-")); roots.push(cwd);
	const dir = join(cwd, "openspec/changes/change"); mkdirSync(dir, { recursive: true });
	const put = (name: string, body: string) => writeFileSync(join(dir, name), body);
	writeFileSync(join(cwd, "openspec/config.yaml"), "schema: spec-driven\n");
	put("scope.md", "# Scope\nA bounded change.\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: routing fixture only\n");
	put("map.md", "# Map\nscope_status: ok\n");
	put("design.md", "# Design\nOne observable change.\n");
	put("preflight.json", JSON.stringify({ tdd: "off", decidedBy: "pi", decidedAt: new Date().toISOString() }));
	const specs = new Map<string, any>();
	const pi = { registerCommand() {}, events: { emit() {} } };
	const registrar = (spec: any) => specs.set(spec.name, spec);
	registerSddLifecycleTools(pi as any, registrar as any);
	registerSddReadSurface(pi as any, registrar as any);
	const call = (name: string, params: any) => specs.get(name).execute("call", params, undefined, undefined, { cwd });
	const check = (phase?: string) => call("ein_sdd_check", { change: "change", phase });
	return { cwd, dir, put, call, check };
}

test("a checked phase returns the existing router's route without another status call", async () => {
	const { cwd, check } = fixture();
	const result = await check("design");
	expect(result.details.errors, result.content[0].text).toBe(0);
	expect(result.details).toMatchObject(lintChange(cwd, "change"));
	expect(result.details.navigation).toMatchObject(resolveSddNext(cwd, "change"));
	expect(result.details.navigation.nextRecommended).toBe("tasks");
	expect(result.details.navigation.stance.tdd).toBe("off");
	expect(result.content[0].text).toContain("siguiente recomendado: tasks");
});

test("tasks navigation includes the same exact apply preview as the status surface", async () => {
	const { cwd, put, check, call } = fixture();
	put("tasks.md", "status: ready\nblocked_by: none\n## // 001. One behavior\n- outcome: Bounded result.\n- [ ] 1.1 Change the behavior\n  - edit: `src/change.ts` | modify | implement\n  - verify: `bun test tests/change.test.ts`\n");
	const result = await check("tasks");
	expect(result.details.errors, result.content[0].text).toBe(0);
	expect(result.details.navigation.nextRecommended).toBe("apply");
	expect(result.details.navigation.plan).toEqual(resolveSddPlanPreview(cwd, "change"));
	const status = await call("ein_sdd_status", { change: "change" });
	expect(status.details.plan).toEqual(result.details.navigation.plan);
	expect(status.details.stance.tdd).toBe("off");
});

test("missing or invalid requested artifacts never emit a route", async () => {
	const { put, check } = fixture();
	expect((await check("apply")).details.navigation).toBeNull();
	put("apply-progress.md", "# Missing mandatory status\n");
	const bad = await check("apply");
	expect(bad.details.errors).toBeGreaterThan(0);
	expect(bad.details.navigation).toBeNull();
	expect(bad.content[0].text).not.toContain("siguiente recomendado:");
});

test("a valid fail report and stale pass retain router blockers; no result is cached", async () => {
	const { dir, put, check } = fixture();
	put("tasks.md", "status: ready\n- [x] 1.1 Done\n  - verify: `bun test`\n");
	put("apply-progress.md", "status: complete\n## Files changed\n`src/change.ts`\n");
	put("verify-report.md", "status: fail\nbehavior_coverage: none\n");
	const fail = await check("verify");
	expect(fail.details.navigation.nextRecommended).toBe("verify");
	expect(fail.details.navigation.blocked.length).toBeGreaterThan(0);
	put("verify-report.md", "status: pass\nbehavior_coverage: verified\n");
	expect((await check("verify")).details.navigation.nextRecommended).toBe("close");
	utimesSync(join(dir, "apply-progress.md"), new Date(Date.now() + 5000), new Date(Date.now() + 5000));
	expect((await check("verify")).details.navigation.nextRecommended).toBe("verify");
});

test("ambiguous entry creates no chosen change or inferred TDD stance", async () => {
	const { cwd, call } = fixture();
	mkdirSync(join(cwd, "openspec/changes/other"));
	const result = await call("ein_sdd_check", {});
	expect(result.details.ok).toBe(false);
	const status = await call("ein_sdd_status", {});
	expect(status.details.status.selection.kind).toBe("ambiguous");
	expect(status.details.stance).toBeUndefined();
});
