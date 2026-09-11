import { expect, test } from "bun:test";
import { mergeMcpConfig } from "../installer/src/core/deploy.ts";
import { createInstallPlan } from "../installer/src/core/install-plan.ts";
import { createPreparedInstallJournal, classifyInstallJournalResume } from "../installer/src/core/install-journal-policy.ts";
import { encodeInstallJournal, parseInstallJournal } from "../installer/src/core/install-journal-codec.ts";
import type { InstallExecutionJournalV1 } from "../installer/src/core/install-journal-contract.ts";

const home = "/tmp/ein-retired-service";
const plan = createInstallPlan({ target: "pi", home, piAgentDir: `${home}/.pi-ein/agent`, piAgentDirExists: false, piOwnership: { status: "absent" }, claudeConfigHome: `${home}/.claude-ein`, platform: { os: "darwin", arch: "arm64" }, dependencies: { bun: true, pi: true, claude: false, gh: false, hypa: false, codegraph: false }, flags: { yes: true, noSecrets: true, noHypa: true, noCodegraph: true, skipLinear: true } });
const legacyService = { command: "/opt/homebrew/bin/engram", args: ["mcp", "--tools=agent"], environment: { ENGRAM_DATA_DIR: `${home}/.engram-ein` }, directTools: false, lifecycle: "lazy" };

test("deploy retires only Ein's old MCP entry and preserves foreign configuration", () => {
  const previous = { setting: 42, mcpServers: { engram: legacyService, custom: { command: "my-mcp" }, context7: { command: "custom-context7" } } };
  const result = mergeMcpConfig({ mcpServers: { context7: { command: "bunx" } } }, previous, home);
  expect(result).toEqual({ setting: 42, mcpServers: { custom: { command: "my-mcp" }, context7: { command: "custom-context7" } } });
  expect(previous.mcpServers.engram).toBe(legacyService);
  for (const customized of [
    { ...legacyService, command: "custom-service" },
    { ...legacyService, environment: { ENGRAM_DATA_DIR: "/other/database" } },
    { ...legacyService, extra: true },
  ]) {
    expect(mergeMcpConfig({}, { mcpServers: { engram: customized } }, home).mcpServers?.engram).toEqual(customized);
  }
});

function oldJournal(state: "prepared" | "complete"): InstallExecutionJournalV1 {
  const fresh = createPreparedInstallJournal(plan, "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa");
  return { ...fresh, planDigest: "f".repeat(64), state, entries: [fresh.entries[0]!, { id: "pi.dependency.engram", runtime: "pi", status: "not-run" } as const, ...fresh.entries.slice(1)].map((entry) => ({ ...entry, status: state === "complete" ? "completed" : "not-run" })) };
}

test("new plans omit Engram while old completed journals remain readable", () => {
  expect(JSON.stringify(plan)).not.toContain("engram");
  expect(JSON.stringify(plan)).not.toContain("hypa");
  const old = oldJournal("complete");
  expect(parseInstallJournal(encodeInstallJournal(old))).toEqual(old);
});

test("old dependency checkpoints can restart with a fresh plan before runtime mutation", () => {
  const old = oldJournal("prepared");
  expect(classifyInstallJournalResume(old, plan)).toBe("retired-dependency-restart");
  const failed: InstallExecutionJournalV1 = { ...old, state: "recovery-required", recoveryCode: "handler-failed", pendingEntryId: "pi.dependency.engram", entries: old.entries.map((entry, index) => ({ ...entry, status: index === 0 ? "completed" : index === 1 ? "failed" : "not-run" })) };
  expect(classifyInstallJournalResume(failed, plan)).toBe("retired-dependency-restart");
  expect(classifyInstallJournalResume(failed, { ...plan, platform: { os: "linux", arch: "arm64" } })).toBeNull();
});


test("the retired Hypa step remains readable alongside Engram in completed V1 journals", () => {
  const old = oldJournal("complete");
  const next = old.entries.findIndex(({ id }) => id === "pi.backup-current");
  const legacy: InstallExecutionJournalV1 = { ...old, entries: [
    ...old.entries.slice(0, next),
    { id: "pi.dependency.hypa", runtime: "pi", status: "completed" },
    ...old.entries.slice(next),
  ] };
  expect(parseInstallJournal(encodeInstallJournal(legacy))).toEqual(legacy);
});
