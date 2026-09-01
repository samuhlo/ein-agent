import { describe, expect, test } from "bun:test";
import {
  encodeInstallJournal,
  parseInstallJournal,
  validateInstallJournal,
} from "../installer/src/core/install-journal-codec.ts";
import {
  installPlanDigest,
  InstallJournalError,
  type InstallExecutionJournalV1,
} from "../installer/src/core/install-journal-contract.ts";
import { createInstallPlan, type InstallPlanV1 } from "../installer/src/core/install-plan.ts";

function plan(): InstallPlanV1 {
  return createInstallPlan({
    target: "claude",
    home: "/tmp/ein-codec-home",
    piAgentDir: "/tmp/ein-codec-home/.pi-ein/agent",
    piAgentDirExists: false,
    piOwnership: { status: "absent" },
    claudeConfigHome: "/tmp/ein-codec-home/.claude-ein",
    platform: { os: "darwin", arch: "arm64" },
    dependencies: {
      bun: true,
      pi: false,
      engram: false,
      gh: false,
      hypa: false,
      codegraph: false,
    },
    flags: {
      yes: true,
      noEngram: false,
      noSecrets: true,
      noHypa: false,
      noCodegraph: false,
      skipLinear: true,
    },
  });
}

function preparedJournal(value = plan()): InstallExecutionJournalV1 {
  return {
    schemaVersion: 1,
    transactionId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    planDigest: installPlanDigest(value),
    target: value.target,
    platform: value.platform,
    state: "prepared",
    entries: value.inventory
      .filter((entry) => entry.state === "selected" || entry.state === "conditional")
      .map(({ id, runtime }) => ({ id, runtime, status: "not-run" })),
  };
}

describe("install journal codec", () => {
  test("round-trips the one canonical UTF-8 representation", () => {
    const journal = preparedJournal();
    const bytes = encodeInstallJournal(journal);

    expect(new TextDecoder().decode(bytes)).toBe(`${JSON.stringify(journal)}\n`);
    expect(parseInstallJournal(bytes)).toEqual(journal);
    expect(() => validateInstallJournal(journal)).not.toThrow();
  });

  test("rejects malformed, non-canonical, structurally invalid and unreachable bytes", () => {
    const journal = preparedJournal();
    const canonical = new TextDecoder().decode(encodeInstallJournal(journal));
    const invalid = [
      new TextEncoder().encode("not-json"),
      new TextEncoder().encode(` ${canonical}`),
      new TextEncoder().encode(`${JSON.stringify({ ...journal, extra: true })}\n`),
      new TextEncoder().encode(`${JSON.stringify({ ...journal, state: "complete" })}\n`),
    ];

    for (const bytes of invalid) {
      expect(() => parseInstallJournal(bytes)).toThrow(InstallJournalError);
      try {
        parseInstallJournal(bytes);
      } catch (error) {
        expect(error).toMatchObject({ code: "recovery-required" });
      }
    }
  });

  test("does not mutate the journal while encoding or validating", () => {
    const journal = preparedJournal();
    const before = JSON.stringify(journal);

    validateInstallJournal(journal);
    encodeInstallJournal(journal);

    expect(JSON.stringify(journal)).toBe(before);
  });
});
