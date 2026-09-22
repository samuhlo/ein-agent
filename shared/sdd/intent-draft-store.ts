import { constants, openSync, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, readSync, readdirSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { createIntentDraft, INTENT_DRAFT_LIMITS, isSafeDraftWork, validateIntentDraft, type IntentDraftBody, type IntentDraftV1, type IntentRuntimePorts } from "./intent-draft.ts";

export type IntentDraftRead = { status: "valid"; draft: IntentDraftV1 } | { status: "absent" } | { status: "invalid"; reason: string };
export type IntentDraftMutation = { ok: true; draft: IntentDraftV1 } | { ok: false; code: "busy" | "conflict" | "invalid" | "io" | "published-unverified"; reason: string };
export type DraftStoreSeam = { beforePublish?(): void; afterPublish?(): void };
const READ = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
export class IntentDraftError extends Error { constructor(public code: string, message: string) { super(message); } }
type Proof = { path: string; ino: number; dev: number }[];

export function intentDraftPath(root: string, work: string): string {
  if (!isSafeDraftWork(work)) throw new IntentDraftError("invalid", "Invalid intent work name");
  return join(resolve(root), ".ein", "intent-drafts", `${work}.json`);
}
function prepare(root: string, create: boolean): Proof | null {
  const paths = [resolve(root), join(resolve(root), ".ein"), join(resolve(root), ".ein", "intent-drafts")];
  const proof: Proof = [];
  for (const path of paths) {
    let stat;
    try { stat = lstatSync(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (!create) return null;
      mkdirSync(path, { mode: 0o700 }); stat = lstatSync(path);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new IntentDraftError("invalid", "Unsafe intent draft directory");
    proof.push({ path, ino: Number(stat.ino), dev: Number(stat.dev) });
  }
  return proof;
}
function unchanged(proof: Proof): boolean {
  return proof.every(({ path, ino, dev }) => {
    try { const stat = lstatSync(path); return stat.isDirectory() && !stat.isSymbolicLink() && Number(stat.ino) === ino && Number(stat.dev) === dev; } catch { return false; }
  });
}
function readFile(path: string): IntentDraftRead {
  let fd: number | undefined;
  try {
    fd = openSync(path, READ); const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > INTENT_DRAFT_LIMITS.bytes) throw new Error("Unsafe or oversized intent draft");
    const buffer = Buffer.alloc(INTENT_DRAFT_LIMITS.bytes + 1); let offset = 0;
    while (offset < buffer.length) { const count = readSync(fd, buffer, offset, buffer.length - offset, null); if (!count) break; offset += count; }
    if (offset > INTENT_DRAFT_LIMITS.bytes) throw new Error("Intent draft exceeds 256 KiB");
    return { status: "valid", draft: validateIntentDraft(JSON.parse(buffer.subarray(0, offset).toString("utf8"))) };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? { status: "absent" } : { status: "invalid", reason: error instanceof Error ? error.message : String(error) };
  } finally { if (fd !== undefined) closeSync(fd); }
}
export function readIntentDraft(root: string, work: string): IntentDraftRead {
  try {
    const path = intentDraftPath(root, work); const proof = prepare(root, false);
    if (!proof) return { status: "absent" };
    const result = readFile(path);
    return unchanged(proof) ? result : { status: "invalid", reason: "Intent draft directory changed during read" };
  } catch (error) { return { status: "invalid", reason: error instanceof Error ? error.message : String(error) }; }
}
export function listIntentDrafts(root: string): { status: "ok"; drafts: IntentDraftV1[] } | { status: "invalid"; reason: string } {
  try {
    const proof = prepare(root, false); if (!proof) return { status: "ok", drafts: [] };
    const names = readdirSync(proof.at(-1)!.path).filter((name) => name.endsWith(".json")).sort();
    if (names.length > INTENT_DRAFT_LIMITS.listed) throw new Error("More than 32 intent drafts; select work explicitly");
    const drafts = names.map((name) => {
      const result = readIntentDraft(root, name.slice(0, -5));
      if (result.status !== "valid") throw new Error(`Unreadable intent draft ${name}`);
      return result.draft;
    });
    if (!unchanged(proof)) throw new Error("Intent directory changed during listing");
    return { status: "ok", drafts };
  } catch (error) { return { status: "invalid", reason: error instanceof Error ? error.message : String(error) }; }
}
function admit(root: string, ports: IntentRuntimePorts): void {
  if (!ports?.admission?.check) throw new IntentDraftError("invalid", "Intent mutation requires runtime admission");
  const result = ports.admission.check(resolve(root));
  if (result.status === "rejected" || resolve(result.root) !== resolve(root)) throw new IntentDraftError("invalid", result.reason ?? "Intent draft storage is not isolated");
}
export function withIntentAdmissionLock<T>(root: string, work: string, callback: () => T, ports: IntentRuntimePorts): T {
  const path = intentDraftPath(root, work); admit(root, ports);
  const proof = prepare(root, true)!; const lock = `${path}.lock`;
  let fd: number;
  try { fd = openSync(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
  catch (error) { throw new IntentDraftError((error as NodeJS.ErrnoException).code === "EEXIST" ? "busy" : "io", "Intent draft is locked; do not expire or break its lock automatically"); }
  const owned = fstatSync(fd);
  try {
    fsyncSync(fd); admit(root, ports);
    if (!unchanged(proof)) throw new IntentDraftError("invalid", "Intent directory changed before transaction");
    return callback();
  } finally {
    closeSync(fd);
    if (unchanged(proof)) {
      try { const stat = lstatSync(lock); if (stat.ino === owned.ino && stat.dev === owned.dev && !stat.isSymbolicLink()) unlinkSync(lock); } catch { /* Ownership loss leaves recovery to the caller. */ }
    }
  }
}
export function transactIntentDraft(root: string, work: string, expectedRevision: string,
  transition: (previous: IntentDraftV1 | null) => IntentDraftBody, ports: IntentRuntimePorts, seam: DraftStoreSeam = {}): IntentDraftMutation {
  let published = false;
  try {
    return withIntentAdmissionLock(root, work, () => {
      const path = intentDraftPath(root, work); const current = readIntentDraft(root, work);
      if (current.status === "invalid") throw new IntentDraftError("invalid", current.reason);
      if ((current.status === "absent" ? "absent" : current.draft.revision) !== expectedRevision) throw new IntentDraftError("conflict", "Intent draft revision changed; reload without discarding the observed response");
      const draft = createIntentDraft(transition(current.status === "valid" ? current.draft : null));
      if (draft.work !== work) throw new IntentDraftError("invalid", "Intent transaction changed its work identity");
      const proof = prepare(root, false)!;
      const token = ports.newId(); if (!/^[a-zA-Z0-9-]+$/.test(token)) throw new Error("Unsafe temporary identity");
      const temp = `${path}.${token}.tmp`; let fd: number | undefined; let owned: { ino: number; dev: number } | undefined;
      try {
        fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        const stat = fstatSync(fd); owned = { ino: Number(stat.ino), dev: Number(stat.dev) };
        const bytes = Buffer.from(JSON.stringify(draft)); let offset = 0;
        while (offset < bytes.length) offset += writeSync(fd, bytes, offset);
        fsyncSync(fd); closeSync(fd); fd = undefined;
        seam.beforePublish?.(); admit(root, ports);
        const reread = readIntentDraft(root, work);
        if (!unchanged(proof) || (reread.status === "absent" ? "absent" : reread.status === "valid" ? reread.draft.revision : "invalid") !== expectedRevision) throw new IntentDraftError("conflict", "Intent draft changed during publication");
        renameSync(temp, path); published = true;
        const directory = openSync(proof.at(-1)!.path, READ);
        try { fsyncSync(directory); } catch (error) { if (!["EINVAL", "ENOTSUP", "EISDIR", "EBADF"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; } finally { closeSync(directory); }
        seam.afterPublish?.();
        const verified = readIntentDraft(root, work);
        if (!unchanged(proof) || verified.status !== "valid" || verified.draft.revision !== draft.revision) throw new Error("Intent draft publication could not be verified");
        return { ok: true as const, draft };
      } finally {
        if (fd !== undefined) closeSync(fd);
        try { if (owned && unchanged(proof)) { const stat = lstatSync(temp); if (Number(stat.ino) === owned.ino && Number(stat.dev) === owned.dev) unlinkSync(temp); } }
        catch { /* Successful rename already removed the temporary. */ }
      }
    }, ports);
  } catch (error) {
    const code = error instanceof IntentDraftError && ["busy", "conflict", "invalid"].includes(error.code) ? error.code as "busy" | "conflict" | "invalid" : "io";
    return { ok: false, code: published ? "published-unverified" : code, reason: error instanceof Error ? error.message : String(error) };
  }
}
