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
      claude: true,
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

function doctorFailure(value: InstallPlanV1): InstallExecutionJournalV1 {
  const verifyIndex = value.inventory.findIndex(({ id }) => id === "pi.verify-doctor");
  return {
    schemaVersion: 1,
    transactionId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    planDigest: installPlanDigest(value),
    target: value.target,
    platform: value.platform,
    state: "recovery-required",
    entries: value.inventory
      .filter((entry) => entry.state === "selected" || entry.state === "conditional")
      .map(({ id, runtime }) => {
        const order = value.inventory.findIndex((entry) => entry.id === id);
        return {
          id,
          runtime,
          status: id === "pi.verify-doctor"
            ? "failed" as const
            : order < verifyIndex
              ? "completed" as const
              : "not-run" as const,
        };
      }),
    pendingEntryId: "pi.verify-doctor",
    recoveryCode: "handler-failed",
  };
}

function claudeComplementFailure(value: InstallPlanV1): InstallExecutionJournalV1 {
  const failedId = "claude.deploy-runtime";
  const failedIndex = value.inventory.findIndex(({ id }) => id === failedId);
  return {
    schemaVersion: 1,
    transactionId: "abababab-abab-4bab-abab-abababababab",
    planDigest: installPlanDigest(value),
    target: value.target,
    platform: value.platform,
    state: "recovery-required",
    entries: value.inventory
      .filter((entry) => entry.state === "selected" || entry.state === "conditional")
      .map(({ id, runtime }) => {
        const order = value.inventory.findIndex((entry) => entry.id === id);
        return {
          id,
          runtime,
          status: id === failedId
            ? "failed" as const
            : order < failedIndex
              ? "completed" as const
              : "not-run" as const,
        };
      }),
    pendingEntryId: failedId,
    recoveryCode: "handler-failed",
  };
}

function managedRepairPlan(home = "/tmp/ein-policy-home", target: "pi" | "both" = "pi"): InstallPlanV1 {
  return createInstallPlan({
    target,
    home,
    piAgentDir: `${home}/.pi-ein/agent`,
    piAgentDirExists: true,
    piOwnership: { status: "managed", layout: "isolated" },
    claudeConfigHome: `${home}/.claude-ein`,
    platform: { os: "darwin", arch: "arm64" },
    dependencies: {
      bun: true,
      pi: false,
      claude: true,
      engram: true,
      gh: false,
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

describe("install journal policy", () => {

  test("restarts only a managed Pi install that failed at doctor after its writes", () => {
    const oldPlan = plan("pi");
    const failed = doctorFailure(oldPlan);
    const current = managedRepairPlan(oldPlan.home);

    expect(classifyInstallJournalResume(failed, current)).toBe("post-verification-restart");
    expect(classifyInstallJournalResume({ ...failed, recoveryCode: "interrupted" }, current)).toBeNull();
    expect(classifyInstallJournalResume({ ...failed, pendingEntryId: "pi.deploy-template" }, current)).toBeNull();
    expect(classifyInstallJournalResume(failed, plan("pi", oldPlan.home))).toBeNull();
    const premature = {
      ...failed,
      entries: failed.entries.map((entry) => entry.id === "pi.deploy-template"
        ? { ...entry, status: "not-run" as const }
        : entry),
    };
    expect(classifyInstallJournalResume(premature, current)).toBeNull();
  });

  test("restarts after a Claude complement failure without treating Claude as the core", () => {
    const oldPlan = plan("both");
    const failed = claudeComplementFailure(oldPlan);
    const coreOnly = managedRepairPlan(oldPlan.home);
    const withClaude = managedRepairPlan(oldPlan.home, "both");

    expect(classifyInstallJournalResume(failed, coreOnly)).toBe("claude-complement-restart");
    expect(classifyInstallJournalResume(failed, withClaude)).toBe("claude-complement-restart");
    expect(classifyInstallJournalResume({ ...failed, recoveryCode: "interrupted" }, coreOnly)).toBeNull();
    expect(classifyInstallJournalResume(failed, plan("pi", oldPlan.home))).toBeNull();
  });

  test("classifies the exact unchanged-plan retry shapes", () => {
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

  test("accepts every retirement checkpoint its own classifier admits", () => {
    const value = plan("claude");
    const failed = retirementRetry(value);
    const cleanup = (status: "pending" | "completed") => failed.entries.map((entry) =>
      entry.id === "shared.retire-legacy" ? { ...entry, status } : entry);
    const { pendingEntryId: _pending, recoveryCode: _recovery, ...withoutRecovery } = failed;
    const admitted: readonly InstallExecutionJournalV1[] = [
      failed,
      { ...failed, recoveryCode: "interrupted", entries: cleanup("pending") },
      { ...withoutRecovery, state: "executing", entries: cleanup("completed") },
    ];

    for (const journal of admitted) {
      expect(() => validateInstallJournal(journal)).not.toThrow();
      expect(classifyInstallJournalResume(journal, value)).toBe("retirement-retry");
      const pending = markInstallJournalEntryPending(journal, "shared.retire-legacy");
      const completed = markInstallJournalEntryCompleted(pending, "shared.retire-legacy");
      expect(pending.entries.find(({ id }) => id === "shared.retire-legacy")?.status).toBe("pending");
      expect(completeInstallJournal(completed).state).toBe("complete");
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
