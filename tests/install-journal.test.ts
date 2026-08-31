import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiInstallHandlers, runInstall } from "../installer/src/cli/install.ts";
import { snapshot, BackupFailure } from "../installer/src/core/backup.ts";
import { executeInstallPlanJournaled, inspectInstallJournal, installJournalMatchesPlan, installJournalPath, installPlanDigest, InstallJournalError, validateInstallJournal, type InstallExecutionJournalV1, type InstallJournalFs } from "../installer/src/core/install-journal.ts";
import { inspectStoredInstallJournal } from "../installer/src/core/install-journal-store.ts";
import { executeInstallPlan, type InstallPlanExecutionHandlers } from "../installer/src/core/install-executor.ts";
import { createInstallPlan, type InstallPlanInput, type InstallPlanV1 } from "../installer/src/core/install-plan.ts";
import { finalizeRuntimeSurfaceRetirement, retireOwnedLegacyRuntimeArtifacts, rollbackRuntimeSurfaceRetirement } from "../installer/src/core/runtime-surface-transaction.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const home = (): string => { const value = mkdtempSync(join(realpathSync(tmpdir()), "ein-install-journal-")); roots.push(value); return value; };
function plan(target: InstallPlanInput["target"] = "both", root = home(), piOwnership: InstallPlanInput["piOwnership"] = { status: "absent" }): InstallPlanV1 { return createInstallPlan({ target, home: root, piAgentDir: join(root, ".pi-ein", "agent"), piAgentDirExists: false, piOwnership, claudeConfigHome: join(root, ".claude-ein"), platform: { os: "darwin", arch: "arm64" }, dependencies: { bun: false, pi: false, engram: false, gh: false, hypa: false, codegraph: false }, flags: { yes: true, noEngram: false, noSecrets: true, noHypa: false, noCodegraph: false, skipLinear: true } }); }
const handlers = (value: InstallPlanV1, call: (id: string) => { ok: boolean; detail?: string } = () => ({ ok: true })): InstallPlanExecutionHandlers => Object.fromEntries(value.inventory.map(({ id }) => [id, () => call(id)])) as InstallPlanExecutionHandlers;
const fsOps = (): InstallJournalFs => ({ read: (path) => readFileSync(path), mkdir: (path, mode) => mkdirSync(path, { mode }), open: (path, flags, mode) => openSync(path, flags, mode), write: (fd, data, offset) => writeSync(fd, data, offset, data.length - offset), fsync: fsyncSync, close: closeSync, rename: renameSync, unlink: unlinkSync, inspect: (path) => { try { const item = lstatSync(path); return { kind: item.isSymbolicLink() ? "symlink" : item.isFile() ? "file" : item.isDirectory() ? "directory" : "other", mode: item.mode & 0o777, size: item.size }; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing", mode: 0, size: 0 }; throw error; } } });
function recovery(target: InstallPlanInput["target"], patterns: Partial<Record<"shared" | "pi" | "claude", string>>): InstallExecutionJournalV1 { const value = plan(target), indexes = { shared: 0, pi: 0, claude: 0 }, states = { c: "completed", f: "failed", p: "pending", n: "not-run" } as const; const entries = value.inventory.filter(({ state }) => state === "selected" || state === "conditional").map(({ id, runtime }) => ({ id, runtime, status: states[(patterns[runtime]?.[indexes[runtime]++] ?? "n") as keyof typeof states] })); const terminal = entries.find(({ status }) => status === "pending") ?? entries.find(({ status }) => status === "failed"); return { schemaVersion: 1, transactionId: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee", planDigest: installPlanDigest(value), target, platform: value.platform, state: "recovery-required", entries, pendingEntryId: terminal!.id, recoveryCode: entries.some(({ status }) => status === "failed") ? "handler-failed" : "interrupted" }; }
function preMutationRecovery(value: InstallPlanV1, detail?: string): InstallExecutionJournalV1 { return { schemaVersion: 1, transactionId: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee", planDigest: installPlanDigest(value), target: value.target, platform: value.platform, state: "recovery-required", entries: value.inventory.filter(({ state }) => state === "selected" || state === "conditional").map(({ id, runtime }) => ({ id, runtime, status: id === "pi.backup-current" ? "failed" : runtime === "claude" || id.includes("dependency.") ? "completed" : "not-run", ...(id === "pi.backup-current" && detail ? { detail } : {}) })), pendingEntryId: "pi.backup-current", recoveryCode: "handler-failed" }; }

describe("install execution journal", () => {
  test("is closed, bounded, deterministic, and rejects malformed or private identity", async () => {
    const value = plan("claude"), tx = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    await executeInstallPlanJournaled(value, handlers(value, () => ({ ok: false })), { transactionId: () => tx });
    const status = inspectInstallJournal(value.home); expect(status.status).toBe("valid");
    const journal = status.status === "valid" ? status.journal : undefined; expect(journal?.transactionId).toBe(tx); expect(journal?.planDigest).toMatch(/^[0-9a-f]{64}$/); expect(installJournalMatchesPlan(journal!, value)).toBe(true); expect(installJournalMatchesPlan(journal!, plan("pi"))).toBe(false); expect(JSON.stringify(journal)).not.toMatch(/PRIVATE|stdout|stderr|environment|\.ein|\.atl/i);
    const revoked = Proxy.revocable({ ...journal }, {}); revoked.revoke(); const accessor = { ...journal }, entryAccessor = [...journal!.entries]; Object.defineProperty(accessor, "state", { enumerable: true, get: () => "prepared" }); Object.defineProperty(entryAccessor, "0", { enumerable: true, get: () => journal!.entries[0] }); const malformed: unknown[] = [{ ...journal, extra: true }, { ...journal, transactionId: "PRIVATE" }, { ...journal, planDigest: "PRIVATE" }, { ...journal, state: "prepared" }, { ...journal, state: "complete" }, { ...journal, entries: entryAccessor }, { ...journal, entries: [{ id: "private.entry", status: "pending" }], pendingEntryId: "private.entry" }, Object.assign(Object.create({ inherited: true }), journal), new Proxy({ ...journal }, {}), revoked.proxy, accessor];
    for (const candidate of malformed) expect(() => validateInstallJournal(candidate)).toThrow(InstallJournalError); const reordered = { inventory: value.inventory, blockers: value.blockers, status: value.status, platform: { arch: value.platform.arch, os: value.platform.os }, claudeConfigHome: value.claudeConfigHome, home: value.home, target: value.target, schemaVersion: 1 } as InstallPlanV1; expect(installPlanDigest(reordered)).toBe(installPlanDigest(value)); const path = installJournalPath(value.home), canonical = readFileSync(path, "utf8"); for (const noncanonical of [canonical.replace("{", '{"schemaVersion":1,'), ` ${canonical}`]) { writeFileSync(path, noncanonical, { mode: 0o600 }); expect(inspectInstallJournal(value.home)).toEqual({ status: "invalid" }); }
  });

  test("publishes prepared, pending, completion and honest Both failure snapshots", async () => {
    const value = plan(), snapshots: InstallExecutionJournalV1[] = [], base = fsOps();
    const traced: InstallJournalFs = { ...base, rename(from, to) { base.rename(from, to); snapshots.push(JSON.parse(new TextDecoder().decode(base.read(to))) as InstallExecutionJournalV1); } };
    const calls: string[] = []; const failed = "pi.dependency.pi";
    const result = await executeInstallPlanJournaled(value, handlers(value, (id) => { calls.push(id); return { ok: id !== failed }; }), { fs: traced, transactionId: () => "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" });
    expect(result.ok).toBe(false); expect(calls).toContain("claude.deploy-runtime");
    expect(snapshots[0]?.state).toBe("prepared"); expect(snapshots[1]).toMatchObject({ state: "executing", pendingEntryId: "shared.dependency.bun" });
    const final = snapshots.at(-1)!; expect(final).toMatchObject({ state: "recovery-required", recoveryCode: "handler-failed", pendingEntryId: failed });
    expect(final.entries.find(({ id }) => id === failed)?.status).toBe("failed"); expect(final.entries.find(({ id }) => id === "claude.deploy-runtime")?.status).toBe("completed");
  });

  test("admits only reachable recovery states within and across runtime segments", () => {
    const valid = [recovery("pi", { shared: "c", pi: "p" }), recovery("pi", { shared: "c", pi: "ccp" }), recovery("claude", { shared: "c", claude: "p" }), recovery("both", { shared: "f" }), recovery("both", { shared: "c", pi: "f", claude: "cc" }), recovery("both", { shared: "c", pi: "ccf", claude: "f" }), recovery("both", { shared: "c", pi: "cccccccccccccccc", claude: "p" })];
    const invalid = [recovery("both", { shared: "c", pi: "cnc", claude: "f" }), recovery("both", { shared: "c", pi: "cfnc" }), recovery("both", { shared: "f", pi: "c" }), recovery("both", { shared: "c", pi: "n", claude: "p" }), recovery("both", { shared: "c", pi: "p", claude: "p" }), recovery("both", { shared: "c", pi: "ff" }), recovery("claude", { shared: "n", claude: "p" })];
    for (const journal of valid) expect(() => validateInstallJournal(journal)).not.toThrow(); for (const journal of invalid) expect(() => validateInstallJournal(journal)).toThrow(InstallJournalError); const absent = recovery("pi", { shared: "c", pi: "f" }); expect(() => validateInstallJournal({ ...absent, entries: [...absent.entries, { id: "claude.deploy-runtime", runtime: "claude", status: "not-run" }] })).toThrow(InstallJournalError);
  });

  test("persists bounded recovery for returned and thrown failures without raw detail", async () => {
    for (const throws of [false, true]) { const value = plan("pi"); await executeInstallPlanJournaled(value, handlers(value, (id) => { if (id !== "pi.dependency.pi") return { ok: true }; if (throws) throw new Error("PRIVATE raw path stdout"); return { ok: false, detail: "PRIVATE raw path stdout" } as { ok: boolean }; }), { transactionId: () => throws ? "cccccccc-cccc-4ccc-cccc-cccccccccccc" : "dddddddd-dddd-4ddd-dddd-dddddddddddd" }); const status = inspectInstallJournal(value.home); expect(status.status).toBe("valid"); expect(JSON.stringify(status)).toContain("handler-failed"); expect(JSON.stringify(status)).not.toContain("PRIVATE"); }
  });

  test("backup failure cause and detail remain actionable and bounded", async () => {
    const value = plan("pi"), agentDir = join(value.home, "agent"), backupDir = join(value.home, "backups");
    mkdirSync(agentDir, { recursive: true, mode: 0o700 }); writeFileSync(join(agentDir, "settings.json"), "{}", { mode: 0o600 });
    let failure: unknown;
    try {
      await snapshot("pre-install", { agentDir, backupDir, fault: (point) => {
        if (point === "snapshot:copy:write:settings.json") throw new Error(`EACCES: permission denied ${agentDir}/private\nstdout=secret stderr=secret stack=secret environment=secret\n${"界".repeat(400)}\u0000`);
      } });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(BackupFailure);
    const detail = failure instanceof Error ? failure.message : "";
    expect(detail).toContain("snapshot:copy"); expect(detail).toContain("settings.json"); expect(detail).toContain("permission denied");
    expect(detail).not.toContain(agentDir); expect(detail).not.toMatch(/stdout|stderr|stack|environment/i); expect(detail).not.toContain("\u0000"); expect(new TextEncoder().encode(detail).byteLength).toBeLessThanOrEqual(512);
    failure = undefined;
    try {
      await snapshot("pre-install", { agentDir, backupDir, fault: (point) => { if (point === "snapshot:metadata-write") throw new Error("metadata rejected"); } });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(BackupFailure); expect((failure as BackupFailure).operation).toBe("snapshot:metadata-write"); expect((failure as BackupFailure).relativeEntry).toBeUndefined();
  });

  test("pi backup caller preserves bounded detail through the journal", async () => {
    const value = plan("pi"), agentDir = join(value.home, "agent"), backupDir = join(value.home, "backups");
    mkdirSync(agentDir, { recursive: true, mode: 0o700 });
    const failure = new BackupFailure("snapshot:copy", "settings.json", new Error(`permission denied ${agentDir}/private\nstdout=secret\n${"界".repeat(400)}`), [agentDir]);
    const pi = createPiInstallHandlers({
      platform: { os: "darwin", arch: "arm64", distro: "unknown", packageManager: "brew", shell: "unknown", shellRc: join(value.home, ".profile"), home: value.home },
      flags: { yes: true, noEngram: false, noSecrets: true, noLinear: true, noHypa: false, noCodegraph: false, dryRun: false, runtime: "pi" },
      skipLinear: true,
      deps: [],
      agentDir,
      effects: {
        exists: () => true,
        resolveContext: () => ({ agentDir, backupDir } as never),
        backup: async () => { throw failure; },
      },
    });
    const result = await executeInstallPlanJournaled(value, { ...handlers(value), "pi.backup-current": pi.handlers["pi.backup-current"] });
    expect(result.ok).toBe(false);
    const status = inspectInstallJournal(value.home);
    expect(status.status).toBe("valid");
    if (status.status === "valid") expect(status.journal.entries.find(({ id }) => id === "pi.backup-current")?.detail).toBe(failure.message);
  });

  test("executor preserves backup detail and falls back generically", async () => {
    const value = plan("pi"), cause = "Backup failed during snapshot:copy at settings.json: permission denied";
    const detailed = await executeInstallPlan(value, handlers(value, (id) => id === "pi.backup-current" ? { ok: false, detail: cause } : { ok: true }));
    expect(detailed.failures.pi).toBe(cause);
    const generic = await executeInstallPlan(value, handlers(value, (id) => id === "pi.backup-current" ? { ok: false } : { ok: true }));
    expect(generic.failures.pi).toBe("Pi installation failed at pi.backup-current");
    const thrown = await executeInstallPlan(value, handlers(value, (id) => { if (id === "pi.backup-current") throw new Error("raw native failure"); return { ok: true }; }));
    expect(thrown.failures.pi).toBe("Pi installation failed at pi.backup-current");
  });

  test("backup failure leaves pi.backup-current failed and later Pi work non-complete", async () => {
    const value = plan(), calls: string[] = [];
    const result = await executeInstallPlanJournaled(value, handlers(value, (id) => {
      calls.push(id); return id === "pi.backup-current" ? { ok: false, detail: "Backup failed during snapshot:copy at settings.json: permission denied" } : { ok: true };
    }));
    expect(result.ok).toBe(false); expect(calls).not.toContain("pi.deploy-template");
    const status = inspectInstallJournal(value.home); expect(status.status).toBe("valid");
    if (status.status === "valid") {
      expect(status.journal.state).toBe("recovery-required");
      expect(status.journal.entries.find(({ id }) => id === "pi.backup-current")?.status).toBe("failed");
      expect(status.journal.entries.find(({ id }) => id === "pi.deploy-template")?.status).toBe("not-run");
      expect(status.journal.entries.find(({ id }) => id === "claude.deploy-runtime")?.status).toBe("completed");
    }
  });

  test("validates optional bounded recovery failure detail", () => {
    const value = plan(), valid = preMutationRecovery(value, "Backup failed during snapshot:copy at settings.json: permission denied");
    expect(() => validateInstallJournal(valid)).not.toThrow();
    const oversized = { ...valid, entries: valid.entries.map((entry) => entry.id === "pi.backup-current" ? { ...entry, detail: "界".repeat(300) } : entry) };
    expect(() => validateInstallJournal(oversized)).toThrow(InstallJournalError);
    const misplaced = { ...valid, entries: valid.entries.map((entry) => entry.id === "pi.dependency.pi" ? { ...entry, detail: "unexpected" } : entry) };
    expect(() => validateInstallJournal(misplaced)).toThrow(InstallJournalError);
    const control = { ...valid, entries: valid.entries.map((entry) => entry.id === "pi.backup-current" ? { ...entry, detail: "bad\u0000detail" } : entry) };
    expect(() => validateInstallJournal(control)).toThrow(InstallJournalError);
  });

  test("retries exact both pre-mutation recovery and preserves completed Claude", async () => {
    const value = plan();
    await executeInstallPlanJournaled(value, handlers(value, (id) => id === "pi.backup-current" ? { ok: false } : { ok: true }));
    const calls: string[] = [], result = await executeInstallPlanJournaled(value, handlers(value, (id) => { calls.push(id); return { ok: true }; }));
    expect(result.ok).toBe(true); expect(calls).toContain("pi.backup-current"); expect(calls).toContain("pi.deploy-template"); expect(calls).not.toContain("claude.deploy-runtime"); expect(calls).not.toContain("claude.deploy-launcher");
    const status = inspectInstallJournal(value.home); expect(status.status).toBe("valid"); if (status.status === "valid") { expect(status.journal.state).toBe("complete"); expect(status.journal.entries.every(({ status: entryStatus }) => entryStatus === "completed")).toBe(true); }
  });

  test("failed recovery retry preserves completed Claude and later Pi non-completion", async () => {
    const value = plan();
    await executeInstallPlanJournaled(value, handlers(value, (id) => id === "pi.backup-current" ? { ok: false, detail: "first backup failure" } : { ok: true }));
    const calls: string[] = [], result = await executeInstallPlanJournaled(value, handlers(value, (id) => { calls.push(id); return id === "pi.backup-current" ? { ok: false, detail: "retry backup failure" } : { ok: true }; }));
    expect(result.ok).toBe(false); expect(calls).toEqual(["pi.backup-current"]);
    const status = inspectInstallJournal(value.home); expect(status.status).toBe("valid"); if (status.status === "valid") { expect(status.journal.state).toBe("recovery-required"); expect(status.journal.entries.find(({ id }) => id === "pi.backup-current")?.status).toBe("failed"); expect(status.journal.entries.find(({ id }) => id === "pi.deploy-template")?.status).toBe("not-run"); expect(status.journal.entries.find(({ id }) => id === "claude.deploy-runtime")?.status).toBe("completed"); expect((status.journal.entries.find(({ id }) => id === "pi.backup-current") as { detail?: string }).detail).toBe("retry backup failure"); }
  });

  test("rejects interrupted, migrated, mutated, unsupported, and plan-mismatched recovery", async () => {
    const value = plan(), detail = "backup failure", exact = preMutationRecovery(value, detail), path = installJournalPath(value.home);
    await executeInstallPlanJournaled(value, handlers(value, (id) => id === "pi.backup-current" ? { ok: false, detail } : { ok: true }));
    const reject = async (journal: InstallExecutionJournalV1, candidate = value): Promise<void> => { writeFileSync(installJournalPath(candidate.home), `${JSON.stringify(journal)}\n`, { mode: 0o600 }); await expect(executeInstallPlanJournaled(candidate, handlers(candidate, () => { throw new Error("must not run"); }))).rejects.toMatchObject({ code: "recovery-required" }); };
    await reject({ ...exact, recoveryCode: "interrupted" });
    const legacy = plan("both", home(), { status: "managed", layout: "legacy" }); await executeInstallPlanJournaled(legacy, handlers(legacy, (id) => id === "pi.backup-current" ? { ok: false } : { ok: true })); const legacyStatus = inspectInstallJournal(legacy.home); expect(legacyStatus.status).toBe("valid"); if (legacyStatus.status === "valid") await reject(legacyStatus.journal, legacy);
    const mutated = plan(), mutatedPath = installJournalPath(mutated.home); await executeInstallPlanJournaled(mutated, handlers(mutated, (id) => id === "pi.deploy-template" ? { ok: false } : { ok: true })); const mutatedStatus = inspectInstallJournal(mutated.home); expect(mutatedStatus.status).toBe("valid"); if (mutatedStatus.status === "valid") { writeFileSync(mutatedPath, `${JSON.stringify(mutatedStatus.journal)}\n`, { mode: 0o600 }); await expect(executeInstallPlanJournaled(mutated, handlers(mutated, () => { throw new Error("must not run"); }))).rejects.toMatchObject({ code: "recovery-required" }); }
    const unsupported = plan("pi"), unsupportedPath = installJournalPath(unsupported.home); await executeInstallPlanJournaled(unsupported, handlers(unsupported, (id) => id === "pi.backup-current" ? { ok: false } : { ok: true })); const unsupportedStatus = inspectInstallJournal(unsupported.home); expect(unsupportedStatus.status).toBe("valid"); if (unsupportedStatus.status === "valid") { writeFileSync(unsupportedPath, `${JSON.stringify(unsupportedStatus.journal)}\n`, { mode: 0o600 }); await expect(executeInstallPlanJournaled(unsupported, handlers(unsupported, () => { throw new Error("must not run"); }))).rejects.toMatchObject({ code: "recovery-required" }); }
    const mismatch = plan("pi", value.home); await expect(executeInstallPlanJournaled(mismatch, handlers(mismatch, () => { throw new Error("must not run"); }))).rejects.toMatchObject({ code: "recovery-required" }); expect(path).toBe(installJournalPath(value.home));
  });

  test("admits only the supported pre-mutation recovery at install startup", async () => {
    const value = plan(), root = value.home;
    const observations = { home: root, piAgentDir: join(root, ".pi-ein", "agent"), piAgentDirExists: false, piOwnership: { status: "absent" } as const, claudeConfigHome: join(root, ".claude-ein"), dependencies: { bun: false, pi: false, engram: false, gh: false, hypa: false, codegraph: false }, platform: { os: "darwin" as const, arch: "arm64" as const, distro: "unknown" as const, packageManager: "brew" as const, shell: "unknown" as const, shellRc: join(root, ".profile"), home: root } };
    await executeInstallPlanJournaled(value, handlers(value, (id) => id === "pi.backup-current" ? { ok: false, detail: "backup failed before Pi mutation" } : { ok: true }));
    const calls: string[] = [], banners: number[] = [];
    const code = await runInstall(["--yes", "--no-secrets", "--runtime", "both"], undefined, { observations, playBanner: async () => { banners.push(1); }, handlers: handlers(value, (id) => { calls.push(id); return { ok: true }; }) });
    expect(code).toBe(0);
    expect(banners).toHaveLength(1);
    expect(calls).toContain("pi.backup-current");
    expect(calls).toContain("pi.deploy-template");
    expect(calls).not.toContain("shared.dependency.bun");
    expect(calls).not.toContain("claude.deploy-runtime");
    expect(calls).not.toContain("claude.deploy-launcher");
  });

  test("blocks every other valid non-complete journal before banner or handlers", async () => {
    const blocked = async (value: InstallPlanV1, journal: InstallExecutionJournalV1): Promise<void> => {
      mkdirSync(join(value.home, ".ein-installer"), { recursive: true, mode: 0o700 });
      writeFileSync(installJournalPath(value.home), `${JSON.stringify(journal)}\n`, { mode: 0o600 });
      const observations = { home: value.home, piAgentDir: join(value.home, ".pi-ein", "agent"), piAgentDirExists: false, piOwnership: { status: "absent" } as const, claudeConfigHome: join(value.home, ".claude-ein"), dependencies: { bun: false, pi: false, engram: false, gh: false, hypa: false, codegraph: false }, platform: { os: "darwin" as const, arch: "arm64" as const, distro: "unknown" as const, packageManager: "brew" as const, shell: "unknown" as const, shellRc: join(value.home, ".profile"), home: value.home } };
      let banners = 0, calls = 0;
      expect(await runInstall(["--yes", "--no-secrets", "--runtime", value.target], undefined, { observations, playBanner: async () => { banners += 1; }, handlers: handlers(value, () => { calls += 1; return { ok: true }; }) })).toBe(1);
      expect(banners).toBe(0);
      expect(calls).toBe(0);
    };

    const interrupted = plan();
    const exact = preMutationRecovery(interrupted);
    await blocked(interrupted, { ...exact, recoveryCode: "interrupted" });

    const postMutation = plan();
    await executeInstallPlanJournaled(postMutation, handlers(postMutation, (id) => id === "pi.deploy-template" ? { ok: false } : { ok: true }));
    const postMutationStatus = inspectInstallJournal(postMutation.home);
    expect(postMutationStatus.status).toBe("valid");
    if (postMutationStatus.status === "valid") await blocked(postMutation, postMutationStatus.journal);

    const piOnly = plan("pi");
    await executeInstallPlanJournaled(piOnly, handlers(piOnly, (id) => id === "pi.backup-current" ? { ok: false } : { ok: true }));
    const piOnlyStatus = inspectInstallJournal(piOnly.home);
    expect(piOnlyStatus.status).toBe("valid");
    if (piOnlyStatus.status === "valid") await blocked(piOnly, piOnlyStatus.journal);
  });

  test("retains verified completion and reports every publication fault", async () => {
    const operations = ["inspect", "mkdir", "open", "write", "fsync", "close", "rename", "read"] as const;
    for (const operation of operations) { const value = plan("claude"), base = fsOps(); let calls = 0; const fault = { ...base, [operation]: (...args: unknown[]) => { calls += 1; if (calls === 1) throw new Error("fault"); return (base[operation] as (...inner: unknown[]) => unknown)(...args); } } as InstallJournalFs; await expect(executeInstallPlanJournaled(value, handlers(value), { fs: fault })).rejects.toBeInstanceOf(InstallJournalError); expect(calls).toBeGreaterThan(0); }
    const value = plan("claude"), base = fsOps(); let unlinks = 0; await executeInstallPlanJournaled(value, handlers(value), { fs: { ...base, unlink(path) { unlinks += 1; base.unlink(path); } } }); const receipt = inspectInstallJournal(value.home); expect(receipt.status).toBe("valid"); if (receipt.status === "valid") expect(receipt.journal.state).toBe("complete"); expect(unlinks).toBe(0);
    const zero = plan("claude"); await expect(executeInstallPlanJournaled(zero, handlers(zero), { fs: { ...fsOps(), write: () => 0 } })).rejects.toMatchObject({ code: "journal-write-failed" });
  });

	test("binds final legacy retirement to journal rollback and global completion", async () => {
		const committed = plan("claude");
		expect(committed.inventory.at(-1)?.id).toBe("shared.retire-legacy");
		const committedLifecycle: string[] = [];
		const committedHandlers = Object.fromEntries(committed.inventory.map(({ id }) => [id, (context?: { transactionId: string }) => {
			committedLifecycle.push(`${id}:${context?.transactionId ?? "missing"}`);
			return { ok: true };
		}])) as InstallPlanExecutionHandlers;
		await executeInstallPlanJournaled(committed, committedHandlers, {
			transactionId: () => "abababab-abab-4bab-abab-abababababab",
			lifecycle: {
				rollback: ({ transactionId }) => committedLifecycle.push(`rollback:${transactionId}`),
				finalize: ({ transactionId }) => committedLifecycle.push(`finalize:${transactionId}`),
			},
		});
		expect(committedLifecycle.at(-2)).toBe("shared.retire-legacy:abababab-abab-4bab-abab-abababababab");
		expect(committedLifecycle.at(-1)).toBe("finalize:abababab-abab-4bab-abab-abababababab");

		const rolledBack = plan("claude");
		const legacySdd = join(rolledBack.home, ".claude-ein", "bin", "cc-ein-sdd");
		mkdirSync(join(rolledBack.home, ".claude-ein", "bin"), { recursive: true });
		writeFileSync(legacySdd, "legacy-sdd-bytes\n");
		chmodSync(legacySdd, 0o741);
		const base = fsOps();
		const rolledBackLifecycle: string[] = [];
		const failGlobalCommit: InstallJournalFs = {
			...base,
			rename(from, to) {
				if (new TextDecoder().decode(base.read(from)).includes('"state":"complete"')) throw new Error("global-commit-write-failed");
				base.rename(from, to);
			},
		};
		const rollbackHandlers = {
			...handlers(rolledBack, (id) => {
				rolledBackLifecycle.push(id);
				return { ok: true };
			}),
			"shared.retire-legacy": (context?: { transactionId: string }) => {
				rolledBackLifecycle.push("shared.retire-legacy");
				retireOwnedLegacyRuntimeArtifacts({ home: rolledBack.home, target: "claude", validatedCurrentArtifacts: true, claudeMarkerVersion: "0.91.0-alpha.2", transactionId: context!.transactionId });
				return { ok: true };
			},
		} as InstallPlanExecutionHandlers;
		await expect(executeInstallPlanJournaled(rolledBack, rollbackHandlers, {
			fs: failGlobalCommit,
			transactionId: () => "cdcdcdcd-cdcd-4dcd-cdcd-cdcdcdcdcdcd",
			lifecycle: {
				rollback: ({ transactionId }) => { rolledBackLifecycle.push(`rollback:${transactionId}`); rollbackRuntimeSurfaceRetirement({ home: rolledBack.home, target: "claude", transactionId }); },
				finalize: ({ transactionId }) => { rolledBackLifecycle.push(`finalize:${transactionId}`); finalizeRuntimeSurfaceRetirement({ home: rolledBack.home, target: "claude", transactionId, globalCommit: true }); },
			},
		})).rejects.toBeInstanceOf(InstallJournalError);
		expect(rolledBackLifecycle.at(-2)).toBe("shared.retire-legacy");
		expect(rolledBackLifecycle.at(-1)).toBe("rollback:cdcdcdcd-cdcd-4dcd-cdcd-cdcdcdcdcdcd");
		expect(rolledBackLifecycle).not.toContain("finalize:cdcdcdcd-cdcd-4dcd-cdcd-cdcdcdcdcdcd");
		expect(readFileSync(legacySdd, "utf8")).toBe("legacy-sdd-bytes\n");
		expect(statSync(legacySdd).mode & 0o777).toBe(0o741);
	});

  test("rejects symlinked/private stores and keeps target-specific provider-neutral paths", () => {
    const root = home(), path = installJournalPath(root); mkdirSync(join(root, ".ein-installer"), { mode: 0o700 }); symlinkSync(join(root, "missing"), path);
    expect(inspectInstallJournal(root)).toEqual({ status: "invalid" }); expect(path).toBe(join(root, ".ein-installer", "install-execution-v1.json")); expect(path).not.toMatch(/\.pi|\.claude|\.ein\/|\.atl/);
    unlinkSync(path); writeFileSync(path, "{}", { mode: 0o644 }); expect(inspectInstallJournal(root)).toEqual({ status: "invalid" }); writeFileSync(path, "x".repeat(65537), { mode: 0o600 }); expect(inspectInstallJournal(root)).toEqual({ status: "invalid" }); const linked = `${root}-link`; roots.push(linked); symlinkSync(root, linked); expect(inspectInstallJournal(linked)).toEqual({ status: "invalid" }); rmSync(join(root, ".ein-installer"), { recursive: true }); symlinkSync(root, join(root, ".ein-installer")); expect(inspectInstallJournal(root)).toEqual({ status: "invalid" });
  });

  test("bounds stored bytes even when filesystem metadata understates their size", () => {
    const root = home(), path = installJournalPath(root), base = fsOps();
    mkdirSync(join(root, ".ein-installer"), { mode: 0o700 });
    writeFileSync(path, "x", { mode: 0o600 });
    const dishonest: InstallJournalFs = {
      ...base,
      inspect(candidate) {
        const info = base.inspect(candidate);
        return candidate === path ? { ...info, size: 1 } : info;
      },
      read: (candidate) => candidate === path ? new Uint8Array(64 * 1024 + 1) : base.read(candidate),
    };
    expect(inspectStoredInstallJournal(root, dishonest)).toEqual({ status: "invalid" });
  });

  test("blocks startup before banner/handlers, reinstalls over a complete journal, and leaves dry-run untouched", async () => {
    const value = plan("claude"), root = value.home; await executeInstallPlanJournaled(value, handlers(value, () => ({ ok: false })));
    let effects = 0; const observations = { home: root, piAgentDir: join(root, ".pi-ein", "agent"), piAgentDirExists: false, piOwnership: { status: "absent" } as const, claudeConfigHome: join(root, ".claude-ein"), dependencies: { bun: false, pi: false, engram: false, gh: false, hypa: false, codegraph: false }, platform: { os: "darwin" as const, arch: "arm64" as const, distro: "unknown" as const, packageManager: "brew" as const, shell: "unknown" as const, shellRc: join(root, ".profile"), home: root } };
    expect(await runInstall(["--runtime", "claude"], undefined, { observations, playBanner: async () => { effects += 1; }, handlers: handlers(value, () => { effects += 1; return { ok: true }; }) })).toBe(1); expect(effects).toBe(0);
    const impossible = recovery("claude", { shared: "n", claude: "p" }), errors: string[] = [], originalError = console.error; writeFileSync(installJournalPath(root), `${JSON.stringify(impossible)}\n`, { mode: 0o600 }); console.error = (...parts: unknown[]) => { errors.push(parts.join(" ")); }; try { expect(await runInstall(["--runtime", "claude"], undefined, { observations, playBanner: async () => { effects += 1; }, handlers: handlers(value, () => { effects += 1; return { ok: true }; }) })).toBe(1); } finally { console.error = originalError; } expect(effects).toBe(0); expect(errors).toEqual(["Install recovery status: recovery-required"]); expect(inspectInstallJournal(root)).toEqual({ status: "invalid" });
    unlinkSync(installJournalPath(root)); expect(await runInstall(["--dry-run", "--runtime", "claude"], undefined, { observations, playBanner: async () => {}, writePlan: () => {} })).toBe(0); expect(inspectInstallJournal(root)).toEqual({ status: "missing" });
    const complete = plan("claude"); await executeInstallPlanJournaled(complete, handlers(complete)); const completeObservations = { ...observations, home: complete.home, claudeConfigHome: join(complete.home, ".claude-ein"), piAgentDir: join(complete.home, ".pi-ein", "agent"), platform: { ...observations.platform, home: complete.home, shellRc: join(complete.home, ".profile") } }; effects = 0; expect(await runInstall(["--yes", "--no-secrets", "--runtime", "claude"], undefined, { observations: completeObservations, playBanner: async () => { effects += 1; }, handlers: handlers(complete, () => { effects += 1; return { ok: true }; }) })).toBe(0); expect(effects).toBeGreaterThan(0); expect(inspectInstallJournal(complete.home).status).toBe("valid"); const failed = plan("pi"), base = fsOps(); let recoveryWrites = 0; const fault: InstallJournalFs = { ...base, rename(from, to) { if (new TextDecoder().decode(base.read(from)).includes('"recovery-required"')) { recoveryWrites += 1; throw new Error("fault"); } base.rename(from, to); } }; await expect(executeInstallPlanJournaled(failed, handlers(failed, (id) => ({ ok: id !== "pi.dependency.pi" })), { fs: fault })).rejects.toMatchObject({ code: "recovery-write-failed" }); expect(recoveryWrites).toBe(1); const pending = inspectInstallJournal(failed.home); expect(pending.status).toBe("valid"); if (pending.status === "valid") expect(pending.journal.state).toBe("executing"); const signaled = plan("claude"), callbacks = new Set<() => void>(), signalFs = fsOps(); let signalWrites = 0; const tracedSignals: InstallJournalFs = { ...signalFs, rename(from, to) { if (new TextDecoder().decode(signalFs.read(from)).includes('"recovery-required"')) signalWrites += 1; signalFs.rename(from, to); } }; const signals = { on(_name: string, callback: () => void) { callbacks.add(callback); return this; }, off(_name: string, callback: () => void) { callbacks.delete(callback); return this; } }; let calls = 0; await expect(executeInstallPlanJournaled(signaled, handlers(signaled, () => { calls += 1; for (const callback of callbacks) { callback(); callback(); } return { ok: true }; }), { fs: tracedSignals, signals: signals as never })).rejects.toMatchObject({ code: "recovery-required" }); expect(calls).toBe(1); expect(signalWrites).toBe(1); const signalStatus = inspectInstallJournal(signaled.home); expect(signalStatus.status).toBe("valid"); if (signalStatus.status === "valid") expect(signalStatus.journal.recoveryCode).toBe("interrupted");
  });
});
