import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { readContinuityOperations } from "../../ein-pi/agent/lib/continuity-operation-store.ts";
import { operationInputDigest } from "../../ein-pi/agent/lib/continuity-operations.ts";

test("real SDK guards in either order leave denied calls unstarted and normalized children bound", async () => {
  const prior = process.env.EIN_OPERATION_GUARD_FIRST;
  try { for (const first of ["0", "1"]) {
    process.env.EIN_OPERATION_GUARD_FIRST = first;
    const cwd = mkdtempSync(join(tmpdir(), "ein-sdk-operations-"));
    execFileSync("git", ["init", "-q"], { cwd });
    const projectAgents = join(cwd, ".pi", "agents"); mkdirSync(projectAgents, { recursive: true });
    writeFileSync(join(projectAgents, "ein-scout.md"), "---\nname: ein-scout\ntools: read, grep, find\n---\nRead only.\n");
    const agentDir = join(cwd, "private-agent"); mkdirSync(agentDir);
    const settingsManager = SettingsManager.inMemory({});
    const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true, noSkills: true, noContextFiles: true, noPromptTemplates: true,
      additionalExtensionPaths: [join(import.meta.dir, "continuity-operation-extension.ts")] });
    await loader.reload(); expect(loader.getExtensions().errors).toEqual([]);
    const manager = SessionManager.inMemory(cwd);
    const { session } = await createAgentSession({ cwd, agentDir, settingsManager, sessionManager: manager, resourceLoader: loader });
    try {
      await session.bindExtensions({ mode: "print" });
      const scoutArgs = { agent: "ein-scout", task: "inspect scope" };
      const scoutCall = { type: "toolCall" as const, name: "subagent", id: `scout-${first}`, arguments: scoutArgs };
      manager.appendMessage({ role: "assistant", content: [{ ...scoutCall, arguments: { ...scoutArgs } }] } as any);
      expect((await session.agent.beforeToolCall!({ toolCall: scoutCall, args: scoutArgs } as never) as any)?.block).not.toBe(true);
      expect(readContinuityOperations(cwd).status).toBe("absent"); expect(existsSync(join(cwd, ".gitignore"))).toBe(false);
      let executions = 0;
      const args = { path: join(cwd, "never.txt"), content: "deny" };
      const toolCall = { type: "toolCall" as const, name: "write", id: `deny-${first}`, arguments: args };
      manager.appendMessage({ role: "assistant", content: [JSON.parse(JSON.stringify(toolCall))] } as any);
      const denied = await session.agent.beforeToolCall!({ toolCall, args } as never);
      if (!(denied as any)?.block) executions++;
      expect(executions).toBe(0);
      const journal = readContinuityOperations(cwd); expect(journal.status).toBe("valid");
      if (journal.status === "valid") expect(journal.journal.operations).toMatchObject([{ status: "settled", outcome: "not-started" }]);
      const original = { agent: "sdd-apply", task: "apply exact patch" }, normalized = { ...original };
      const childCall = { type: "toolCall" as const, name: "subagent", id: `child-${first}`, arguments: normalized };
      manager.appendMessage({ role: "assistant", content: [{ ...childCall, arguments: { ...original } }] } as any);
      expect((await session.agent.beforeToolCall!({ toolCall: childCall, args: normalized } as never) as any)?.block).not.toBe(true);
      expect(normalized.task).toContain("phase budget");
      const tool = session.agent.state.tools.find((item) => item.name === "subagent")!;
      const result = await tool.execute(childCall.id, normalized);
      await session.agent.afterToolCall!({ toolCall: childCall, args: normalized, result, isError: false } as never);
      const final = readContinuityOperations(cwd); if (final.status !== "valid") throw new Error(final.status);
      const child = final.journal.operations.find((item) => item.nativeCallRef.toolCallId === childCall.id)!;
      expect(child).toMatchObject({ status: "settled", outcome: "succeeded", inputDigest: operationInputDigest(original) });
      writeFileSync(join(projectAgents, "ein-scout.md"), "---\nname: ein-scout\ntools: read, write\n---\nMutating override.\n");
      const overridden = { agent: "ein-scout", task: "inspect scope" }, overriddenCall = { type: "toolCall" as const, name: "subagent", id: `override-${first}`, arguments: overridden };
      manager.appendMessage({ role: "assistant", content: [{ ...overriddenCall, arguments: { ...overridden } }] } as any);
      await session.agent.beforeToolCall!({ toolCall: overriddenCall, args: overridden } as never);
      const pending = readContinuityOperations(cwd); if (pending.status !== "valid") throw new Error(pending.status);
      expect(pending.journal.operations.find((op) => op.nativeCallRef.toolCallId === overriddenCall.id)?.status).toBe("running");
    } finally { session.dispose(); rmSync(cwd, { recursive: true, force: true }); }
  } } finally { if (prior === undefined) delete process.env.EIN_OPERATION_GUARD_FIRST; else process.env.EIN_OPERATION_GUARD_FIRST = prior; }
});
