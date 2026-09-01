import { describe, expect, test } from "bun:test";
import { validateInstallJournal } from "../installer/src/core/install-journal-codec.ts";
import {
  classifyInstallJournalResume,
  completeInstallJournal,
  createPreparedInstallJournal,
  failInstallJournalEntry,
  interruptInstallJournal,
  markInstallJournalEntryCompleted,
  markInstallJournalEntryPending,
} from "../installer/src/core/install-journal-policy.ts";
import {
  installPlanDigest,
  type InstallExecutionJournalV1,
} from "../installer/src/core/install-journal-contract.ts";
import {
  createInstallPlan,
  type InstallPlanEntryId,
  type InstallPlanV1,
} from "../installer/src/core/install-plan.ts";

function plan(target: "pi" | "claude" | "both" = "both", home = "/tmp/ein-policy-home"): InstallPlanV1 {
  return createInstallPlan({
    target,
    home,
    piAgentDir: `${home}/.pi-ein/agent`,
    piAgentDirExists: false,
    piOwnership: { status: "absent" },
    claudeConfigHome: `${home}/.claude-ein`,
    platform: { os: "darwin", arch: "arm64" },
    dependencies: {
      bun: true,
      pi: true,
      engram: true,
      gh: true,
      hypa: true,
      codegraph: true,
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

function backupRetry(value: InstallPlanV1): InstallExecutionJournalV1 {
  return {
    schemaVersion: 1,
    transactionId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
    planDigest: installPlanDigest(value),
    target: value.target,
    platform: value.platform,
    state: "recovery-required",
    entries: value.inventory
      .filter((entry) => entry.state === "selected" || entry.state === "conditional")
      .map(({ id, runtime }) => ({
        id,
        runtime,
        status: id === "pi.backup-current"
          ? "failed"
          : runtime === "claude" || id.includes("dependency.")
            ? "completed"
            : "not-run",
      })),
    pendingEntryId: "pi.backup-current",
    recoveryCode: "handler-failed",
  };
}

function retirementRetry(value: InstallPlanV1): InstallExecutionJournalV1 {
  return {
    schemaVersion: 1,
    transactionId: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
    planDigest: installPlanDigest(value),
    target: value.target,
    platform: value.platform,
    state: "recovery-required",
    entries: value.inventory
      .filter((entry) => entry.state === "selected" || entry.state === "conditional")
      .map(({ id, runtime }) => ({
        id,
        runtime,
        status: id === "shared.retire-legacy" ? "failed" : "completed",
      })),
    pendingEntryId: "shared.retire-legacy",
    recoveryCode: "handler-failed",
  };
}

describe("install journal policy", () => {
  test("classifies only the two supported retry shapes", () => {
    const value = plan();
    const backup = backupRetry(value);
    const retirement = retirementRetry(value);

    expect(classifyInstallJournalResume(backup, value)).toBe("pre-mutation-retry");
    expect(classifyInstallJournalResume(retirement, value)).toBe("retirement-retry");
    expect(classifyInstallJournalResume({ ...backup, recoveryCode: "interrupted" }, value)).toBeNull();
    expect(classifyInstallJournalResume(backup, plan("both", "/tmp/another-plan"))).toBeNull();
    expect(classifyInstallJournalResume(backup, plan("pi"))).toBeNull();
  });

  test("creates and advances reachable journals without mutating their inputs", () => {
    const value = plan("claude");
    const prepared = createPreparedInstallJournal(
      value,
      "dddddddd-dddd-4ddd-dddd-dddddddddddd",
    );
    const first = prepared.entries[0]!.id;
    const pending = markInstallJournalEntryPending(prepared, first);
    const completed = markInstallJournalEntryCompleted(pending, first);

    expect(prepared.state).toBe("prepared");
    expect(prepared.entries[0]?.status).toBe("not-run");
    expect(pending).toMatchObject({ state: "executing", pendingEntryId: first });
    expect(completed.entries[0]?.status).toBe("completed");
    expect(completed.pendingEntryId).toBeUndefined();
    for (const journal of [prepared, pending, completed]) {
      expect(() => validateInstallJournal(journal)).not.toThrow();
    }
  });

  test("retains bounded backup detail and clears recovery after a successful retry", () => {
    const value = plan();
    let journal = createPreparedInstallJournal(
      value,
      "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee",
    );
    for (const entry of journal.entries) {
      journal = markInstallJournalEntryPending(journal, entry.id);
      if (entry.id === "pi.backup-current") break;
      journal = markInstallJournalEntryCompleted(journal, entry.id);
    }

    const failed = failInstallJournalEntry(journal, "pi.backup-current", "snapshot denied");
    const pending = markInstallJournalEntryPending(failed, "pi.backup-current");
    const completed = markInstallJournalEntryCompleted(pending, "pi.backup-current");

    expect(failed.entries.find(({ id }) => id === "pi.backup-current")?.detail).toBe("snapshot denied");
    expect(completed.state).toBe("executing");
    expect(completed.pendingEntryId).toBeUndefined();
    expect(completed.recoveryCode).toBeUndefined();
    expect(completed.entries.find(({ id }) => id === "pi.backup-current")?.detail).toBeUndefined();
    expect(() => validateInstallJournal(completed)).not.toThrow();
  });

  test("makes the declared retirement retry reachable through global completion", () => {
    const value = plan("claude");
    const failed = retirementRetry(value);
    const pending = markInstallJournalEntryPending(failed, "shared.retire-legacy");
    const completedEntry = markInstallJournalEntryCompleted(pending, "shared.retire-legacy");
    const complete = completeInstallJournal(completedEntry);

    expect(classifyInstallJournalResume(failed, value)).toBe("retirement-retry");
    expect(completedEntry.state).toBe("executing");
    expect(completedEntry.recoveryCode).toBeUndefined();
    expect(complete.state).toBe("complete");
    for (const journal of [failed, pending, completedEntry, complete]) {
      expect(() => validateInstallJournal(journal)).not.toThrow();
    }
  });

  test("turns the current pending entry into an interrupted recovery", () => {
    const value = plan("claude");
    const prepared = createPreparedInstallJournal(
      value,
      "ffffffff-ffff-4fff-ffff-ffffffffffff",
    );
    const first = prepared.entries[0]!.id as InstallPlanEntryId;
    const pending = markInstallJournalEntryPending(prepared, first);
    const interrupted = interruptInstallJournal(pending);

    expect(interrupted).toMatchObject({
      state: "recovery-required",
      pendingEntryId: first,
      recoveryCode: "interrupted",
    });
    expect(() => validateInstallJournal(interrupted)).not.toThrow();
  });
});
