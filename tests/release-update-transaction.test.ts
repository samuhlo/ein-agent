import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTransaction, installSignalHandlers, recoverPendingTransaction } from "../installer/src/core/transaction.ts";
import { defaultUpdateCaps, type UpdateCaps } from "../installer/src/core/update-caps.ts";

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "ein-release-transaction-"));
  roots.push(value);
  return value;
}

async function runToValidation(tx: ReturnType<typeof createTransaction>): Promise<void> {
  for (const state of ["binary-replaced", "child-reexecuted", "template-deployed", "marker-committed", "validated"] as const) {
    const result = await tx.transition(state, () => undefined, () => undefined);
    expect(result.ok).toBe(true);
  }
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("release update transaction", () => {
  test("persists intent before each boundary and rolls committed steps back in reverse order", async () => {
    const dir = root();
    const journalPath = join(dir, "backups", ".ein-update-journal.json");
    const tx = createTransaction({ caps: defaultUpdateCaps(), target: "installer-v0.20.0", owner: { type: "standalone" }, txId: "tx", journalPath });
    expect(tx.prepare({ binary: join(dir, "ein.backup"), template: join(dir, "template") }).ok).toBe(true);
    const order: string[] = [];
    for (const state of ["binary-replaced", "child-reexecuted", "template-deployed"] as const) {
      expect((await tx.transition(state, () => { order.push(state); }, () => { order.push(`undo:${state}`); })).ok).toBe(true);
    }
    expect(JSON.parse(readFileSync(journalPath, "utf8"))).toMatchObject({ state: "template-deployed" });
    expect((await tx.rollback()).ok).toBe(true);
    expect(order).toEqual(["binary-replaced", "child-reexecuted", "template-deployed", "undo:template-deployed", "undo:child-reexecuted", "undo:binary-replaced"]);
    expect(existsSync(journalPath)).toBe(false);
  });

  test("retains the journal when rollback fails and refuses a second ambiguous update", async () => {
    const dir = root();
    const journalPath = join(dir, "journal.json");
    const tx = createTransaction({ caps: defaultUpdateCaps(), target: "installer-v0.20.0", owner: { type: "standalone" }, journalPath });
    expect(tx.prepare({ binary: join(dir, "ein.backup") }).ok).toBe(true);
    await tx.transition("binary-replaced", () => undefined, () => { throw new Error("disk full"); });
    expect((await tx.rollback())).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "rollback-failed" }) }));
    expect(existsSync(journalPath)).toBe(true);
    expect(await recoverPendingTransaction({ caps: defaultUpdateCaps(), journalPath })).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "recovery-required" }) }));
  });

  test("scoped signal handlers clean a prepared transaction before mutation", async () => {
    const callbacks: Array<() => void> = [];
    const base = defaultUpdateCaps();
    const caps: UpdateCaps = { ...base, signals: { on: (_signal, callback) => { callbacks.push(callback); return () => callbacks.splice(callbacks.indexOf(callback), 1); } } };
    const journalPath = join(root(), "journal.json");
    const tx = createTransaction({ caps, target: "installer-v0.20.0", owner: { type: "standalone" }, journalPath });
    tx.prepare({});
    const remove = installSignalHandlers(tx, caps);
    callbacks[0]!();
    await Bun.sleep(0);
    expect(existsSync(journalPath)).toBe(false);
    remove();
  });

  test("scoped signal handlers roll back after mutation and are removed on cleanup", async () => {
    const callbacks: Array<() => void> = [];
    const base = defaultUpdateCaps();
    const caps: UpdateCaps = { ...base, signals: { on: (_signal, callback) => { callbacks.push(callback); return () => callbacks.splice(callbacks.indexOf(callback), 1); } } };
    const tx = createTransaction({ caps, target: "installer-v0.20.0", owner: { type: "standalone" }, journalPath: join(root(), "journal.json") });
    tx.prepare({});
    const calls: string[] = [];
    await tx.transition("binary-replaced", () => undefined, () => { calls.push("restored"); });
    const remove = installSignalHandlers(tx, caps);
    callbacks[0]!();
    await Bun.sleep(0);
    expect(calls).toEqual(["restored"]);
    remove();
    expect(callbacks).toEqual([]);
  });

  test("cleans a committed journal and only completes after validation", async () => {
    const dir = root();
    const journalPath = join(dir, "journal.json");
    const tx = createTransaction({ caps: defaultUpdateCaps(), target: "installer-v0.20.0", owner: { type: "standalone" }, journalPath });
    tx.prepare({});
    await runToValidation(tx);
    expect(tx.complete().ok).toBe(true);
    expect(existsSync(journalPath)).toBe(false);
  });
});
