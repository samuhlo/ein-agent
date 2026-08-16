import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join, parse, resolve, sep } from "node:path";
import { isProxy } from "node:util/types";
import { executeInstallPlan, type InstallPlanExecution, type InstallPlanExecutionHandlers } from "./install-executor.ts";
import { INSTALL_PLAN_ENTRY_CONTRACTS, INSTALL_PLAN_ENTRY_IDS, validateInstallPlan, type InstallPlanEntryId, type InstallPlanRuntime, type InstallPlanV1 } from "./install-plan.ts";

export type InstallJournalState = "prepared" | "executing" | "recovery-required" | "complete";
export type InstallJournalEntryState = "not-run" | "pending" | "completed" | "failed";
export type InstallExecutionJournalV1 = Readonly<{
  schemaVersion: 1; transactionId: string; planDigest: string;
  target: InstallPlanV1["target"]; platform: InstallPlanV1["platform"];
  state: InstallJournalState;
  entries: readonly Readonly<{ id: InstallPlanEntryId; runtime: InstallPlanRuntime; status: InstallJournalEntryState }>[];
  pendingEntryId?: InstallPlanEntryId; recoveryCode?: "handler-failed" | "interrupted";
}>;

export type InstallJournalFs = {
  read(path: string): Uint8Array; mkdir(path: string, mode: number): void;
  open(path: string, flags: number, mode?: number): number; write(fd: number, data: Uint8Array, offset: number): number;
  fsync(fd: number): void; close(fd: number): void; rename(from: string, to: string): void; unlink(path: string): void;
  inspect(path: string): { kind: "missing" | "file" | "directory" | "symlink" | "other"; mode: number; size: number };
};

const noFollow = (constants as unknown as Record<string, number | undefined>).O_NOFOLLOW ?? 0;
const productionFs: InstallJournalFs = {
  read: (path) => readFileSync(path), mkdir: (path, mode) => mkdirSync(path, { mode }),
  open: (path, flags, mode) => openSync(path, flags, mode), write: (fd, data, offset) => writeSync(fd, data, offset, data.length - offset),
  fsync: fsyncSync, close: closeSync, rename: renameSync, unlink: unlinkSync,
  inspect: (path) => { try { const value = lstatSync(path); return { kind: value.isSymbolicLink() ? "symlink" : value.isFile() ? "file" : value.isDirectory() ? "directory" : "other", mode: value.mode & 0o777, size: value.size }; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing", mode: 0, size: 0 }; throw error; } },
};

export class InstallJournalError extends Error {
  constructor(readonly code: "recovery-required" | "journal-write-failed" | "recovery-write-failed") { super(`Install recovery status: ${code}`); this.name = "InstallJournalError"; }
}

const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => { try { if (!value || typeof value !== "object" || Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return false; const descriptors = Object.getOwnPropertyDescriptors(value); return Reflect.ownKeys(descriptors).length === keys.length && keys.every((key) => { const item = descriptors[key]; return item?.enumerable && "value" in item; }); } catch { return false; } };
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}` : JSON.stringify(value); export const installPlanDigest = (plan: InstallPlanV1): string => { validateInstallPlan(plan); return createHash("sha256").update(canonical(plan)).digest("hex"); };
export const installJournalPath = (home: string): string => join(home, ".ein-installer", "install-execution-v1.json");
export const installJournalMatchesPlan = (journal: InstallExecutionJournalV1, plan: InstallPlanV1): boolean => journal.planDigest === installPlanDigest(plan) && journal.target === plan.target && journal.platform.os === plan.platform.os && journal.platform.arch === plan.platform.arch && journal.entries.map(({ id }) => id).join() === plan.inventory.filter((entry) => entry.state === "selected" || entry.state === "conditional").map(({ id }) => id).join();

export function validateInstallJournal(value: unknown): asserts value is InstallExecutionJournalV1 {
  if (!value || typeof value !== "object" || isProxy(value)) throw new InstallJournalError("recovery-required"); const own = Object.getOwnPropertyDescriptors(value), optional = own.pendingEntryId ? ["pendingEntryId"] : [], recovery = own.recoveryCode ? ["recoveryCode"] : [];
  if (!exact(value, ["schemaVersion", "transactionId", "planDigest", "target", "platform", "state", "entries", ...optional, ...recovery]) || value.schemaVersion !== 1 || typeof value.transactionId !== "string" || !/^[0-9a-f-]{16,64}$/.test(value.transactionId) || typeof value.planDigest !== "string" || !/^[0-9a-f]{64}$/.test(value.planDigest) || !["pi", "claude", "both"].includes(value.target as string) || !["prepared", "executing", "recovery-required", "complete"].includes(value.state as string) || !exact(value.platform, ["os", "arch"]) || !["darwin", "linux"].includes(value.platform.os as string) || !["arm64", "x64"].includes(value.platform.arch as string) || !Array.isArray(value.entries) || value.entries.length === 0 || isProxy(value.entries) || Object.getPrototypeOf(value.entries) !== Array.prototype || Object.keys(value.entries).length !== value.entries.length || !Object.entries(Object.getOwnPropertyDescriptors(value.entries)).every(([key, item]) => key === "length" || item.enumerable && "value" in item)) throw new InstallJournalError("recovery-required");
  const ids = new Set<string>(); let pending = 0;
  let previous = -1;
  for (const entry of value.entries) { const order = typeof entry?.id === "string" ? INSTALL_PLAN_ENTRY_IDS.indexOf(entry.id as InstallPlanEntryId) : -1, runtime = order >= 0 ? INSTALL_PLAN_ENTRY_CONTRACTS[entry.id as InstallPlanEntryId][0] : undefined; if (!exact(entry, ["id", "runtime", "status"]) || order <= previous || ids.has(entry.id as string) || entry.runtime !== runtime || !["shared", ...(value.target === "claude" ? [] : ["pi"]), ...(value.target === "pi" ? [] : ["claude"])].includes(entry.runtime as string) || !["not-run", "pending", "completed", "failed"].includes(entry.status as string)) throw new InstallJournalError("recovery-required"); previous = order; ids.add(entry.id as string); if (entry.status === "pending") pending += 1; }
  const completed = value.entries.filter(({ status }) => status === "completed").length, failed = value.entries.filter(({ status }) => status === "failed"), points = value.pendingEntryId !== undefined && value.entries.some((entry) => entry.id === value.pendingEntryId && (entry.status === "pending" || entry.status === "failed"));
  const segment = (runtime: InstallPlanRuntime) => (value.entries as InstallExecutionJournalV1["entries"]).filter((entry) => entry.runtime === runtime), reachable = (["shared", "pi", "claude"] as const).every((runtime) => /^(completed,)*((failed|pending),)?(not-run,)*$/.test(`${segment(runtime).map(({ status }) => status).join(",")}${segment(runtime).length ? "," : ""}`));
  const shared = segment("shared"), pi = segment("pi"), claude = segment("claude"), sharedTerminal = shared.some(({ status }) => status === "failed" || status === "pending"), claudeStarted = claude.some(({ status }) => status !== "not-run"), recoveryReachable = reachable && pending <= 1 && failed.length + pending > 0 && (!sharedTerminal || [...pi, ...claude].every(({ status }) => status === "not-run")) && (!claudeStarted || shared.every(({ status }) => status === "completed") && (pi.length === 0 || pi.every(({ status }) => status === "completed") || pi.some(({ status }) => status === "failed")) && !pi.some(({ status }) => status === "pending"));
  const coherent = value.state === "prepared" ? completed === 0 && pending === 0 && failed.length === 0 && !own.pendingEntryId && !own.recoveryCode : value.state === "complete" ? completed === value.entries.length && pending === 0 && failed.length === 0 && !own.pendingEntryId && !own.recoveryCode : value.state === "executing" ? failed.length === 0 && pending <= 1 && !own.recoveryCode && (pending === 0 ? !own.pendingEntryId : points) && /^(completed,)*(pending,)?(not-run,)*$/.test(`${value.entries.map(({ status }) => status).join(",")},`) : recoveryReachable && ["handler-failed", "interrupted"].includes(value.recoveryCode as string) && (value.recoveryCode === "handler-failed" ? failed.length > 0 : pending > 0) && points;
  if (!coherent) throw new InstallJournalError("recovery-required");
}

function safeParent(home: string, fs: InstallJournalFs): string {
  if (resolve(home) !== home) throw new InstallJournalError("recovery-required");
  let cursor = parse(home).root;
  for (const part of home.slice(cursor.length).split(sep).filter(Boolean)) { cursor = join(cursor, part); if (fs.inspect(cursor).kind !== "directory") throw new InstallJournalError("recovery-required"); }
  const parent = dirname(installJournalPath(home)), info = fs.inspect(parent);
  if (info.kind === "missing") fs.mkdir(parent, 0o700);
  else if (info.kind !== "directory" || (info.mode & 0o077) !== 0) throw new InstallJournalError("recovery-required");
  return parent;
}

const MAX_JOURNAL_BYTES = 64 * 1024; const encodeJournal = (value: InstallExecutionJournalV1): Uint8Array => new TextEncoder().encode(`${JSON.stringify(value)}\n`); function parseJournal(bytes: Uint8Array): InstallExecutionJournalV1 { try { if (bytes.length > MAX_JOURNAL_BYTES) throw 0; const text = new TextDecoder().decode(bytes), value: unknown = JSON.parse(text); validateInstallJournal(value); if (text !== new TextDecoder().decode(encodeJournal(value))) throw 0; return value; } catch { throw new InstallJournalError("recovery-required"); } }

export function inspectInstallJournal(home: string, fs: InstallJournalFs = productionFs): { status: "missing" } | { status: "valid"; journal: InstallExecutionJournalV1 } | { status: "invalid" } {
  try { if (resolve(home) !== home) return { status: "invalid" }; let cursor = parse(home).root; for (const part of home.slice(cursor.length).split(sep).filter(Boolean)) { cursor = join(cursor, part); if (fs.inspect(cursor).kind !== "directory") return { status: "invalid" }; } const path = installJournalPath(home), parentInfo = fs.inspect(dirname(path)); if (parentInfo.kind === "missing") return { status: "missing" }; if (parentInfo.kind !== "directory" || (parentInfo.mode & 0o077) !== 0) return { status: "invalid" }; const info = fs.inspect(path); if (info.kind === "missing") return { status: "missing" }; if (info.kind !== "file" || (info.mode & 0o077) !== 0 || info.size > MAX_JOURNAL_BYTES) return { status: "invalid" }; return { status: "valid", journal: parseJournal(fs.read(path)) }; } catch { return { status: "invalid" }; }
}

function publish(home: string, journal: InstallExecutionJournalV1, fs: InstallJournalFs): void {
  validateInstallJournal(journal); const path = installJournalPath(home), temp = `${path}.${journal.transactionId}.tmp`; let fd: number | undefined;
  try { const parent = safeParent(home, fs), target = fs.inspect(path); if (target.kind !== "missing" && (target.kind !== "file" || (target.mode & 0o077) !== 0) || fs.inspect(temp).kind !== "missing") throw 0; fd = fs.open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow, 0o600); const bytes = encodeJournal(journal); let offset = 0; while (offset < bytes.length) { const written = fs.write(fd, bytes, offset); if (!Number.isInteger(written) || written <= 0 || written > bytes.length - offset) throw 0; offset += written; } fs.fsync(fd); fs.close(fd); fd = undefined; fs.rename(temp, path); const dir = fs.open(parent, constants.O_RDONLY); try { fs.fsync(dir); } finally { fs.close(dir); } if (new TextDecoder().decode(fs.read(path)) !== new TextDecoder().decode(bytes)) throw 0; }
  catch { if (fd !== undefined) try { fs.close(fd); } catch {} try { fs.unlink(temp); } catch {} throw new InstallJournalError("journal-write-failed"); }
}

export async function executeInstallPlanJournaled(plan: InstallPlanV1, handlers: InstallPlanExecutionHandlers, options: { fs?: InstallJournalFs; transactionId?: () => string; signals?: Pick<NodeJS.Process, "on" | "off"> } = {}): Promise<InstallPlanExecution> {
  validateInstallPlan(plan); const fs = options.fs ?? productionFs, home = plan.home;
  // BLINDAJE -> Solo una transacción sin terminar bloquea una nueva. Un diario
  // COMPLETO es la lápida de una instalación anterior, no un estado a recuperar:
  // tratarlo como bloqueo lo convertía en permanente y dejaba el instalador
  // inservible para siempre después de la primera instalación correcta.
  const existing = inspectInstallJournal(home, fs);
  if (existing.status === "invalid" || existing.status === "valid" && existing.journal.state !== "complete") throw new InstallJournalError("recovery-required");
  let journal: InstallExecutionJournalV1 = { schemaVersion: 1, transactionId: (options.transactionId ?? randomUUID)(), planDigest: installPlanDigest(plan), target: plan.target, platform: plan.platform, state: "prepared", entries: plan.inventory.filter((entry) => entry.state === "selected" || entry.state === "conditional").map(({ id, runtime }) => ({ id, runtime, status: "not-run" })) };
  let writing = false, interruptedOnce = false, journalFailure: InstallJournalError | undefined; const persist = (): void => { writing = true; try { publish(home, journal, fs); } finally { writing = false; } };
  persist(); const wrapped = Object.fromEntries(plan.inventory.map((entry) => [entry.id, async () => { if (journalFailure) return { ok: false }; const index = journal.entries.findIndex(({ id }) => id === entry.id); if (index < 0) return handlers[entry.id](); const update = (status: InstallJournalEntryState): void => { const entries = journal.entries.map((item, at) => at === index ? { ...item, status } : item), failed = entries.find((item) => item.status === "failed")?.id; const { pendingEntryId: _, ...base } = journal; journal = { ...base, entries, state: journal.state === "recovery-required" ? journal.state : "executing", ...(status === "pending" ? { pendingEntryId: entry.id } : failed ? { pendingEntryId: failed } : {}) }; persist(); }; const fail = (): void => { journal = { ...journal, state: "recovery-required", pendingEntryId: entry.id, recoveryCode: "handler-failed", entries: journal.entries.map((item, at) => at === index ? { ...item, status: "failed" } : item) }; try { persist(); } catch { journalFailure = new InstallJournalError("recovery-write-failed"); } }; try { update("pending"); } catch { journalFailure = new InstallJournalError("journal-write-failed"); return { ok: false }; } let result; try { result = await handlers[entry.id](); } catch { fail(); return { ok: false }; } if (journalFailure) return { ok: false }; if (!result.ok) fail(); else try { update("completed"); } catch { journalFailure = new InstallJournalError("journal-write-failed"); return { ok: false }; } return result; }])) as InstallPlanExecutionHandlers;
  const interrupted = (): void => { if (interruptedOnce || journal.state === "complete") return; interruptedOnce = true; if (writing) { journalFailure = new InstallJournalError("recovery-write-failed"); return; } journal = { ...journal, state: "recovery-required", recoveryCode: "interrupted" }; try { persist(); journalFailure = new InstallJournalError("recovery-required"); } catch { journalFailure = new InstallJournalError("recovery-write-failed"); } };
  const signals = options.signals ?? process; signals.on("SIGINT", interrupted); signals.on("SIGTERM", interrupted);
  try { const result = await executeInstallPlan(plan, wrapped); if (journalFailure) throw journalFailure; if (!result.ok) return result; journal = { ...journal, state: "complete" }; persist(); return result; } finally { signals.off("SIGINT", interrupted); signals.off("SIGTERM", interrupted); }
}
