import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { guardChildCommand } from "../ein-pi/agent/extensions/internal/ein-command-guard-child.ts";
import scopeChild from "../ein-pi/agent/extensions/internal/ein-scope-child.ts";
import { registerCommandEvidence } from "../ein-pi/agent/extensions/internal/ein-command-evidence-child.ts";
import { inspectArtifactIntentKey } from "../shared/sdd/intent-agreement.ts";
import { resolveSddPlanPreview } from "../ein-pi/agent/lib/sdd-router.ts";
import { taskRequestsGuardedDelivery } from "../ein-pi/agent/lib/guardrails.ts";

const dirs: string[] = [];
const directory = () => { const path = mkdtempSync(join(tmpdir(), "ein-handoff-")); dirs.push(path); return path; };
afterEach(() => { for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

test("scope's explicit child provider writes a real validated delta without exposing sync", async () => {
	const tools: any[] = [];
	scopeChild({ registerTool: (tool: unknown) => tools.push(tool) } as never);
	expect(tools.map((tool) => tool.name)).toEqual(["ein_openspec_delta_write"]);
	const cwd = directory();
	mkdirSync(join(cwd, "openspec/changes/example"), { recursive: true });
	const result = await tools[0].execute("delta", { change: "example", domain: "sample", operations: [{ kind: "ADDED", scenario: {
		id: "sample-result", title: "Result", requirement: "The system MUST preserve numeric IDs", given: "an input ID", when: "exported", then: "the ID stays numeric",
	} }] }, undefined, undefined, { cwd });
	expect(result.details.ok).toBe(true);
	expect(readFileSync(join(cwd, "openspec/changes/example/specs/sample/spec.md"), "utf8")).toContain("preserve numeric IDs");
});

test("metadata headings never become apply groups", () => {
	const cwd = directory(); const dir = join(cwd, "openspec/changes/example"); mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "tasks.md"), "## Agreement\nintent_key: abc\n## Actual work\n- [ ] 1.1 Fix\n  - edit: `src/a.ts` | modify | Fix\n## Verification notes\nAll checks stay independent\n");
	expect(resolveSddPlanPreview(cwd, "example").groups.map((group) => group.title)).toEqual(["Actual work"]);
});

test("intent diagnostics distinguish presentation defects from an old decision", () => {
	const key = `sha256:${"a".repeat(64)}`;
	expect(inspectArtifactIntentKey(`intent_key: ${key}\r\n`, key)).toBe("current");
	expect(inspectArtifactIntentKey(`intent_key: ${key}\nintent_key: ${key}`, key)).toBe("duplicate");
	expect(inspectArtifactIntentKey("intent_key: typo", key)).toBe("malformed");
	expect(inspectArtifactIntentKey("# No declaration", key)).toBe("missing");
	expect(inspectArtifactIntentKey(`intent_key: sha256:${"b".repeat(64)}`, key)).toBe("stale");
});

test("the observed Spanish prohibition does not ask for delivery; affirmative delivery still does", () => {
	expect(taskRequestsGuardedDelivery("No cambies dependencias, otros archivos de implementación, modelos ni hagas commits/push/PR.")).toBe(false);
	expect(taskRequestsGuardedDelivery("Ni hagas push de la rama.")).toBe(false);
	expect(taskRequestsGuardedDelivery("No cambies dependencias ni tests; haz push de la rama.")).toBe(true);
	expect(taskRequestsGuardedDelivery("Abre PR pero ni hagas merge.")).toBe(true);
});

function evidenceHarness() {
	const cwd = directory(); const session = join(cwd, "session.jsonl"); writeFileSync(session, "");
	let handler: any;
	const describe = registerCommandEvidence({ on: (_name: string, callback: unknown) => { handler = callback; } } as never);
	const ctx = { cwd, sessionManager: { getSessionFile: () => session } } as any;
	const index = describe(ctx).match(/^Command evidence: (.+?)\. Link/)![1]!;
	const event = (id: string, output = "ok", extra = {}) => ({ toolName: "bash", toolCallId: id, input: { command: "bun run test" }, content: [{ type: "text", text: output }], isError: false, ...extra });
	return { cwd, ctx, index, describe, event, run: (e: unknown) => handler(e, ctx) };
}

test("real result references retain command, failures, order and full native output without changing transport", () => {
	const h = evidenceHarness();
	const spool = join(h.cwd, "native.log"); const full = "record\n".repeat(10000); writeFileSync(spool, full);
	const event = h.event("one", "tail", { details: { fullOutputPath: spool, truncation: { truncated: true } } });
	const before = JSON.stringify(event);
	expect(h.run(event)).toBeUndefined(); expect(JSON.stringify(event)).toBe(before);
	h.run(h.event("two", "error", { isError: true }));
	const rows = readFileSync(h.index, "utf8").trim().split("\n").map((line) => JSON.parse(line));
	expect(rows.map((row) => row.toolCallId)).toEqual(["one", "two"]);
	expect(rows[0]).toMatchObject({ cwd: h.cwd, command: "bun run test", outputComplete: true });
	expect(readFileSync(rows[0].output, "utf8")).toBe(full);
	expect(rows[0].outputSha256).toBe(createHash("sha256").update(full).digest("hex"));
	expect(rows[1].toolSucceeded).toBe(false);
	expect(statSync(h.index).mode & 0o777).toBe(0o600);
});

test("truncated views are partial and inaccessible storage never suppresses a tool result", () => {
	const h = evidenceHarness(); h.run(h.event("tail", "tail", { details: { truncation: true } }));
	expect(JSON.parse(readFileSync(h.index, "utf8")).outputComplete).toBe(false);
	const other = join(h.cwd, "outside"); writeFileSync(other, "preserve"); rmSync(h.index); symlinkSync(other, h.index);
	expect(h.run(h.event("unsafe"))).toBeUndefined();
	expect(h.describe(h.ctx)).toContain("incomplete"); expect(readFileSync(other, "utf8")).toBe("preserve");
	expect(dirname(h.index)).not.toBe(h.cwd);
});


test("ambient and child guards evaluate unchanged calls once and recheck a changed command", async () => {
  let confirmations = 0;
  const ctx = { cwd: directory(), hasUI: true, ui: { confirm: async () => { confirmations++; return true; } } } as any;
  const event = { toolName: "bash", toolCallId: "same", input: { command: "git push origin main" } } as any;
  expect(await guardChildCommand(event, ctx)).toBeUndefined();
  expect(await guardChildCommand(event, ctx)).toBeUndefined();
  expect(confirmations).toBe(1);
  event.input.command = "git push --force origin main";
  expect(await guardChildCommand(event, ctx)).toMatchObject({ block: true });
});
