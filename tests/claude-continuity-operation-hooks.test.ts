import { expect, test } from "bun:test";
import { handleClaudeHook } from "../ein-cc/continuity-runner.ts";
import { buildClaudeHooks } from "../ein-cc/sync.ts";

test("Claude keeps only the command guard before Bash and never gates shell on continuity", async () => {
  const hooks = buildClaudeHooks("/bin/ein-cc-sdd", "/bin/ein-continuity");
  expect(hooks.PreToolUse).toEqual([{
    matcher: "Bash",
    hooks: [{ type: "command", command: '"/bin/ein-cc-sdd" guard', timeout: 10 }],
  }]);

  const payload = {
    hook_event_name: "PreToolUse",
    session_id: "native-session",
    tool_use_id: "call-1",
    tool_name: "Bash",
    tool_input: { command: "git log --oneline -3" },
  };
  expect(await handleClaudeHook(payload, async () => { throw new Error("supervisor unavailable"); }))
    .toEqual({ exitCode: 0, stdout: "" });
});

test("Claude reports completed tool results without a continuity admission gate", async () => {
  const events: unknown[] = [];
  const payload = { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "git log --oneline -3" } };
  const result = await handleClaudeHook(payload, async (event) => { events.push(event); throw new Error("supervisor unavailable"); });
  expect(result).toEqual({ exitCode: 0, stdout: "" });
  expect(events).toEqual([{ kind: "mutation", tool: "Bash", success: true }]);
});
