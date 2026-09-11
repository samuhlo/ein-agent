import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import applyProgress from "../../ein-pi/agent/extensions/internal/ein-apply-progress-child.ts";
import { receiptFor } from "../../ein-pi/agent/lib/tool-receipts.ts";

test("apply checks active capability and writes start/complete through one owner", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "ein-apply-capability-"));
  try {
    const dir = join(cwd, "openspec/changes/demo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "tasks.md"), "status: ready\nblocked_by: none\n## Group\n- [ ] 1.1 Implement\n- [ ] 1.2 Check\n");
    const handlers = new Map<string, Function>();
    let tool: any;
    let active: string[] = [];
    applyProgress({ on: (name: string, handler: Function) => handlers.set(name, handler), getActiveTools: () => active, registerTool: (value: unknown) => { tool = value; } } as any);
    expect(handlers.get("tool_call")!({}).block).toBe(true);
    expect(handlers.get("before_agent_start")!({ systemPrompt: "base" }).systemPrompt).toContain("not active");
    active = ["read", "write", "ein_sdd_task_progress"];
    expect(handlers.get("tool_call")!({})).toBeUndefined();
    const prompt = handlers.get("before_agent_start")!({ systemPrompt: "base" }).systemPrompt;
    expect(prompt).toContain("is active in this child");
    const ctx = { cwd, sessionManager: { getSessionFile: () => undefined } };
    await tool.execute("start", { change: "demo", task: "1.1", action: "start" }, undefined, undefined, ctx);
    const result = await tool.execute("done", { change: "demo", task: "1.1", action: "complete" }, undefined, undefined, ctx);
    const source = readFileSync(join(dir, "tasks.md"), "utf8");
    expect(source).toContain("- [x] 1.1");
    expect(source).toContain("- [ ] 1.2");
    expect(receiptFor("ein_sdd_task_progress", result.details).line).toBe("Tarea 1.1 completada · 1/2");
    const again = await tool.execute("repeat", { change: "demo", task: "1.1", action: "complete" }, undefined, undefined, ctx);
    expect(again.details.counts.done).toBe(1);
    expect(readFileSync(join(dir, "tasks.md"), "utf8")).toBe(source);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
