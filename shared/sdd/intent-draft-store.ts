import { constants, existsSync, openSync, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, readFileSync, writeFileSync, readSync, readdirSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { createIntentDraft, INTENT_DRAFT_LIMITS, isSafeDraftWork, validateIntentDraft, type IntentDraftBody, type IntentDraftV1, type IntentRuntimePorts } from "./intent-draft.ts";
import { readAgreement, renderAgreement, writeAgreement } from "./intent-agreement.ts";

export type IntentDraftRead = { status: "valid"; draft: IntentDraftV1 } | { status: "absent" } | { status: "invalid"; reason: string };
export type IntentDraftMutation = { ok: true; draft: IntentDraftV1 } | { ok: false; code: "busy" | "conflict" | "invalid" | "io" | "published-unverified"; reason: string };
export type DraftStoreSeam = { beforePublish?(): void; afterPublish?(): void };
export type LockedIntentDraftWriter = (expectedRevision: string, transition: (previous: IntentDraftV1 | null) => IntentDraftBody, seam?: DraftStoreSeam) => IntentDraftMutation;
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
function admit(root: string, ports: IntentRuntimePorts, publication = false, mode: "inspect" | "initialize" = "initialize"): void {
  if (!ports?.admission?.check) throw new IntentDraftError("invalid", "Intent mutation requires runtime admission");
  const result = ports.admission.check(resolve(root), mode);
  if (result.status === "rejected" || publication && result.status === "lock-only" || resolve(result.root) !== resolve(root)) throw new IntentDraftError("invalid", result.reason ?? "Intent draft storage is not isolated");
}
export function withIntentAdmissionLock<T>(root: string, work: string, callback: (publish: LockedIntentDraftWriter) => T, ports: IntentRuntimePorts): T {
  const path = intentDraftPath(root, work); admit(root, ports, false, "inspect");
  const proof = prepare(root, true)!; const lock = `${path}.lock`;
  let fd: number;
  try { fd = openSync(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
  catch (error) { throw new IntentDraftError((error as NodeJS.ErrnoException).code === "EEXIST" ? "busy" : "io", "Intent draft is locked; do not expire or break its lock automatically"); }
  const owned = fstatSync(fd);
  try {
    fsyncSync(fd); admit(root, ports);
    if (!unchanged(proof)) throw new IntentDraftError("invalid", "Intent directory changed before transaction");
    return callback((expected, transition, seam) => {
      const currentLock = lstatSync(lock);
      if (!unchanged(proof) || currentLock.ino !== owned.ino || currentLock.dev !== owned.dev || currentLock.isSymbolicLink()) throw new IntentDraftError("busy", "Intent lock identity changed");
      return publishLocked(root, work, expected, transition, ports, seam);
    });
  } finally {
    closeSync(fd);
    if (unchanged(proof)) {
      try { const stat = lstatSync(lock); if (stat.ino === owned.ino && stat.dev === owned.dev && !stat.isSymbolicLink()) unlinkSync(lock); } catch { /* Ownership loss leaves recovery to the caller. */ }
    }
  }
}
function publishLocked(root: string, work: string, expectedRevision: string,
  transition: (previous: IntentDraftV1 | null) => IntentDraftBody, ports: IntentRuntimePorts, seam: DraftStoreSeam = {}): IntentDraftMutation {
  let published = false;
  try {
    return (() => {
      admit(root, ports, true);
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
        seam.beforePublish?.(); admit(root, ports, true);
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
    })();
  } catch (error) {
    const code = error instanceof IntentDraftError && ["busy", "conflict", "invalid"].includes(error.code) ? error.code as "busy" | "conflict" | "invalid" : "io";
    return { ok: false, code: published ? "published-unverified" : code, reason: error instanceof Error ? error.message : String(error) };
  }
}

export function transactIntentDraft(root: string, work: string, expectedRevision: string,
  transition: (previous: IntentDraftV1 | null) => IntentDraftBody, ports: IntentRuntimePorts, seam: DraftStoreSeam = {}): IntentDraftMutation {
  try { return withIntentAdmissionLock(root, work, (publish) => publish(expectedRevision, transition, seam), ports); }
  catch (error) { return { ok: false, code: error instanceof IntentDraftError && error.code === "busy" ? "busy" : "invalid", reason: String(error) }; }
}

export function intentCanonicalDirectory(root: string, work: string, create = false): string {
  if (!isSafeDraftWork(work)) throw new IntentDraftError("invalid", "Invalid intent work name");
  const base = resolve(root);
  const layout = !existsSync(join(base, "openspec/changes")) && existsSync(join(base, ".sdd/changes")) ? ".sdd" : "openspec";
  let path = base;
  for (const part of [layout, "changes", work]) {
    path = join(path, part);
    try {
      const stat = lstatSync(path);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new IntentDraftError("invalid", "Unsafe canonical intent directory");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (create) mkdirSync(path, { mode: 0o700 });
    }
  }
  return path;
}

export function recoverIntentDraft(root: string, work: string, expectedRevision: string, ports: IntentRuntimePorts,
  seam: { afterCanonical?(): void } = {}, adoption?: { expectedDigest: string; reason: string }): IntentDraftMutation {
  return transactIntentDraft(root, work, expectedRevision, (draft) => {
    if (!draft) throw new IntentDraftError("conflict", "Intent draft disappeared before recovery");
    const publication = draft.publication;
    if (publication.state === "none") return draft;
    if (!("expectedCanonicalRevision" in publication)) return recoverArchivePublication(root, draft);
    const directory = intentCanonicalDirectory(root, work);
    const canonical = readAgreement(directory);
    if (canonical.kind === "valid" && JSON.stringify(canonical.agreement) === JSON.stringify(publication.agreement)) return { ...draft, publication: { ...publication, state: "published" } };
    if (publication.state === "published") throw new IntentDraftError("conflict", "Published intent no longer matches the canonical agreement");
    if (canonical.kind === "invalid") {
      if (!adoption?.reason.trim() || publication.expectedCanonicalRevision !== `unmanaged:${adoption.expectedDigest}`) throw new IntentDraftError("conflict", "Automatic recovery cannot adopt unmanaged intent content");
      const raw = unmanagedIntent(directory);
      if (raw.digest !== adoption.expectedDigest) throw new IntentDraftError("conflict", "Unmanaged intent changed after review");
      const backup = join(directory, `intent-before-draft-${raw.digest.slice(7)}.md`);
      if (existsSync(backup)) {
        if (lstatSync(backup).isSymbolicLink() || readFileSync(backup, "utf8") !== raw.content) throw new IntentDraftError("conflict", "Intent backup conflicts");
      } else writeFileSync(backup, raw.content, { flag: "wx", mode: 0o600 });
    } else if ((canonical.kind === "absent" ? "absent" : canonical.agreement.revision) !== publication.expectedCanonicalRevision
      || (canonical.kind === "valid" ? canonical.agreement.materialKey : null) !== publication.expectedCanonicalMaterialKey) throw new IntentDraftError("conflict", "Canonical intent changed; recovery cannot overwrite it");
    writeAgreement(intentCanonicalDirectory(root, work, true), publication.agreement);
    seam.afterCanonical?.();
    const verified = readAgreement(directory);
    if (verified.kind !== "valid" || JSON.stringify(verified.agreement) !== JSON.stringify(publication.agreement)) throw new Error("Canonical intent publication was not verified");
    return { ...draft, publication: { ...publication, state: "published" } };
  }, ports);
}

function unmanagedIntent(directory: string): { content: string; digest: string } {
  const path = join(directory, "intent.md");
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new IntentDraftError("invalid", "Unmanaged intent is unreadable or unsafe");
  const content = readFileSync(path, "utf8");
  return { content, digest: `sha256:${createHash("sha256").update(content).digest("hex")}` };
}

export function publishIntentDraft(root: string, body: IntentDraftBody, expectedRevision: string, ports: IntentRuntimePorts,
  seam: { afterJournal?(): void; afterCanonical?(): void } = {}, explicitAdoption?: { expectedDigest: string; reason: string }): IntentDraftMutation {
  let adoption = explicitAdoption;
  const journal = transactIntentDraft(root, body.work, expectedRevision, (previous) => {
    if (previous && ["promoting", "invalidating", "archiving"].includes(previous.publication.state)) throw new IntentDraftError("conflict", "Recover the interrupted intent publication first");
    if (previous?.publication.state === "archived" && (body.agreement.status !== "pending" || body.agreement.revision === previous.agreement.revision || !body.agreement.reopenReason?.trim())) throw new IntentDraftError("conflict", "Archived work requires an explicit new intent revision");
    if (!body.agreement.change) return { ...body, publication: { state: "none" } };
    const canonical = readAgreement(intentCanonicalDirectory(root, body.work));
    if ((body.agreement.status === "confirmed" || canonical.kind === "valid") && Buffer.byteLength(renderAgreement(body.agreement)) > 64 * 1024) throw new IntentDraftError("invalid", "Canonical intent exceeds 64 KiB; existing draft responses remain unchanged");
    if (canonical.kind === "invalid") {
      const raw = unmanagedIntent(intentCanonicalDirectory(root, body.work));
      const legacyDigest = previous?.publication.state === "none" ? previous.publication.legacyDigest : undefined;
      if (legacyDigest && legacyDigest !== raw.digest) throw new IntentDraftError("conflict", "Legacy intent changed during its adoption review");
      if (body.agreement.status !== "confirmed") return { ...body, publication: { state: "none", legacyDigest: raw.digest } };
      if (!adoption && legacyDigest && previous?.agreement.stage === "review" && previous.response?.id === body.agreement.response?.id) adoption = { expectedDigest: legacyDigest, reason: "Observed final review of unmanaged agreement" };
      if (!adoption?.reason.trim() || adoption.expectedDigest !== raw.digest) throw new IntentDraftError("conflict", "Canonical intent requires explicit reviewed adoption");
      return { ...body, publication: { state: "promoting", expectedCanonicalRevision: `unmanaged:${raw.digest}`, expectedCanonicalMaterialKey: null, agreement: body.agreement } };
    }
    if (body.agreement.status !== "confirmed" && canonical.kind === "absent") return { ...body, publication: { state: "none" } };
    return { ...body, publication: {
      state: body.agreement.status === "confirmed" ? "promoting" : "invalidating",
      expectedCanonicalRevision: canonical.kind === "valid" ? canonical.agreement.revision : "absent",
      expectedCanonicalMaterialKey: canonical.kind === "valid" ? canonical.agreement.materialKey : null,
      agreement: body.agreement,
    } };
  }, ports);
  if (!journal.ok || journal.draft.publication.state === "none") return journal;
  try { seam.afterJournal?.(); }
  catch (error) { return { ok: false, code: "published-unverified", reason: error instanceof Error ? error.message : String(error) }; }
  return recoverIntentDraft(root, body.work, journal.draft.revision, ports, seam, adoption);
}

export function recoverArchivePublication(root: string, draft: IntentDraftV1): IntentDraftBody {
  const publication = draft.publication;
  if (publication.state !== "archiving" && publication.state !== "archived") throw new IntentDraftError("invalid", "No archive publication to recover");
  const active = intentCanonicalDirectory(root, draft.work);
  const archiveParent = join(active, "..", "archive"); const archived = join(archiveParent, draft.work);
  const hasArchive = existsSync(archived);
  const directory = hasArchive ? archived : active;
  for (const path of hasArchive ? [archiveParent, archived] : [active]) {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new IntentDraftError("conflict", "Unsafe intent archive destination");
  }
  const digest = (name: string) => {
    const path = join(directory, name); const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new IntentDraftError("conflict", "Unsafe archived evidence");
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  };
  if (digest("summary.md") !== publication.summarySha256 || publication.verificationReceiptSha256 && digest("verification-receipt.json") !== publication.verificationReceiptSha256) throw new IntentDraftError("conflict", "Archive evidence belongs to another revision");
  if (hasArchive) {
    if (existsSync(active)) throw new IntentDraftError("conflict", "Both active and archived work exist");
    return { ...draft, publication: { ...publication, state: "archived" } };
  }
  const canonical = readAgreement(active);
  if (publication.state === "archived" || canonical.kind !== "valid" || JSON.stringify(canonical.agreement) !== JSON.stringify(draft.agreement)) throw new IntentDraftError("conflict", "Unpublished archive no longer matches the agreed intent");
  return { ...draft, publication: { state: "published", expectedCanonicalRevision: draft.agreement.revision, expectedCanonicalMaterialKey: draft.agreement.materialKey, agreement: draft.agreement } };
}
