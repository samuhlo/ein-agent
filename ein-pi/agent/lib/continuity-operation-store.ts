import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildOperationJournal, OPERATION_LIMITS, parseOperationJournal, type ContinuityOperation, type ContinuityOperationJournal } from "./continuity-operations.ts";
import { ensureEinGitignore } from "./gitignore.ts";

export type OperationRead = { status: "absent" } | { status: "valid"; journal: ContinuityOperationJournal } | { status: "failure"; reason: string };
export type OperationWrite = { ok: true; journal: ContinuityOperationJournal } | { ok: false; reason: string; outcome: "not-published" | "published-unverified" };
type Identity = { dev: number; ino: number };
type Proof = { path: string; identity: Identity }[];
const FILE = "continuity-operations.json";
const SAFE = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
function identity(stat: { dev: number | bigint; ino: number | bigint }): Identity { return { dev: Number(stat.dev), ino: Number(stat.ino) }; }
function same(path: string, id: Identity): boolean {
	try { const stat = lstatSync(path); return !stat.isSymbolicLink() && Number(stat.dev) === id.dev && Number(stat.ino) === id.ino; } catch { return false; }
}
function parents(root: string, create: boolean): Proof | "absent" {
	const base = resolve(root), parent = join(base, ".ein"), proof: Proof = [];
	for (const path of [base, parent]) {
		let stat;
		try { stat = lstatSync(path); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT" || path === base) throw error;
			if (!create) return "absent";
			mkdirSync(path, { mode: 0o700 }); stat = lstatSync(path);
		}
		if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unsafe-store-path");
		proof.push({ path, identity: identity(stat) });
	}
	return proof;
}
function validProof(proof: Proof): boolean { return proof.every((p) => same(p.path, p.identity)); }
function readFile(path: string): OperationRead {
	let fd: number | undefined;
	try {
		fd = openSync(path, SAFE); const stat = fstatSync(fd);
		if (!stat.isFile() || stat.size > OPERATION_LIMITS.bytes) return { status: "failure", reason: "invalid-journal" };
		const buffer = Buffer.alloc(OPERATION_LIMITS.bytes + 1); let offset = 0;
		while (offset < buffer.length) { const n = readSync(fd, buffer, offset, buffer.length - offset, null); if (!n) break; offset += n; }
		if (offset > OPERATION_LIMITS.bytes) return { status: "failure", reason: "invalid-journal" };
		const journal = parseOperationJournal(JSON.parse(buffer.subarray(0, offset).toString()));
		return journal ? { status: "valid", journal } : { status: "failure", reason: "invalid-journal" };
	} catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? { status: "absent" } : { status: "failure", reason: "unreadable-journal" }; }
	finally { if (fd !== undefined) closeSync(fd); }
}
export function readContinuityOperations(root: string): OperationRead {
	try {
		const proof = parents(root, false); if (proof === "absent") return { status: "absent" };
		const result = readFile(join(resolve(root), ".ein", FILE));
		return validProof(proof) ? result : { status: "failure", reason: "store-path-changed" };
	} catch { return { status: "failure", reason: "unsafe-store-path" }; }
}
export function ensureOperationIsolation(root: string): { ok: true } | { ok: false; reason: string } {
	try {
		parents(root, false);
		const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 10_000, maxBuffer: 65536, stdio: ["ignore", "pipe", "pipe"] });
		try { git(["rev-parse", "--show-toplevel"]); } catch {
			// A directory outside Git has no identity to seal; the journal still persists.
			let dir = resolve(root);
			for (;;) { try { lstatSync(join(dir, ".git")); return { ok: false, reason: "state-store-not-isolated" }; } catch {}
				const parent = resolve(dir, ".."); if (parent === dir) break; dir = parent; }
			return { ok: true };
		}
		if (git(["ls-files", "--cached", "-z", "--", `.ein/${FILE}`, `.ein/${FILE}.lock`, `.ein/${FILE}.lock.release-*`, `.ein/${FILE}.tmp-*`]).length) return { ok: false, reason: "state-store-not-isolated" };
		try { if (lstatSync(join(root, ".gitignore")).isSymbolicLink()) return { ok: false, reason: "state-store-not-isolated" }; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
		ensureEinGitignore(root);
		for (const path of [`.ein/${FILE}`, `.ein/${FILE}.lock`, `.ein/${FILE}.tmp-probe`]) git(["check-ignore", "--no-index", "-q", "--", path]);
		return { ok: true };
	} catch { return { ok: false, reason: "state-store-not-isolated" }; }
}
function release(path: string, id: Identity | undefined, proof: Proof): void {
	if (!id || !validProof(proof) || !same(path, id)) return;
	const quarantine = `${path}.release-${randomUUID()}`;
	try { renameSync(path, quarantine); if (validProof(proof) && same(quarantine, id)) unlinkSync(quarantine); } catch { /* Preserve any uncertain inode. */ }
}
export function transactContinuityOperations(root: string, expected: string, transition: (operations: readonly ContinuityOperation[]) => readonly ContinuityOperation[], seam: { beforePublish?: () => void; afterPublish?: () => void; grantActiveSlot?: true } = {}): OperationWrite {
	let proof: Proof = [], lockFd: number | undefined, tempFd: number | undefined, lockId: Identity | undefined, tempId: Identity | undefined, published = false;
	const path = join(resolve(root), ".ein", FILE), lock = `${path}.lock`, temp = `${path}.tmp-${randomUUID()}`;
	const fail = (reason: string): OperationWrite => ({ ok: false, reason, outcome: published ? "published-unverified" : "not-published" });
	try {
		const isolation = ensureOperationIsolation(root); if (!isolation.ok) return fail(isolation.reason);
		const prepared = parents(root, true); if (prepared === "absent") return fail("unsafe-store-path"); proof = prepared;
		try { lockFd = openSync(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
		catch (e) { return fail((e as NodeJS.ErrnoException).code === "EEXIST" ? "busy" : "io"); }
		lockId = identity(fstatSync(lockFd)); fsyncSync(lockFd);
		const before = readFile(path); if (before.status === "failure") return fail(before.reason);
		const revision = before.status === "absent" ? "absent" : before.journal.revision;
		if (expected !== revision) return fail("conflict");
		const extraActiveSlots = (before.status === "valid" ? before.journal.extraActiveSlots ?? 0 : 0) + (seam.grantActiveSlot ? 1 : 0);
		const journal = buildOperationJournal(transition(before.status === "valid" ? before.journal.operations : []), extraActiveSlots);
		const buffer = Buffer.from(JSON.stringify(journal));
		tempFd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); tempId = identity(fstatSync(tempFd));
		let offset = 0; while (offset < buffer.length) { const count = writeSync(tempFd, buffer, offset); if (!count) throw new Error("write-failed"); offset += count; } fsyncSync(tempFd);
		seam.beforePublish?.();
		const latest = readFile(path);
		if (latest.status === "failure" || (latest.status === "absent" ? "absent" : latest.journal.revision) !== revision) return fail("conflict");
		if (!validProof(proof) || !same(lock, lockId) || !same(temp, tempId)) return fail("store-path-changed");
		const staged = readFile(temp); if (staged.status !== "valid" || staged.journal.revision !== journal.revision) return fail("invalid-staging");
		renameSync(temp, path); published = true; seam.afterPublish?.();
		if (!validProof(proof)) return fail("store-path-changed");
		const dirFd = openSync(join(resolve(root), ".ein"), SAFE); try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
		const observed = readFile(path);
		return observed.status === "valid" && observed.journal.revision === journal.revision ? { ok: true, journal } : fail("readback-failed");
	} catch (e) { return fail(e instanceof Error ? e.message : "io"); }
	finally {
		release(temp, tempId, proof); release(lock, lockId, proof);
		if (tempFd !== undefined) closeSync(tempFd); if (lockFd !== undefined) closeSync(lockFd);
	}
}
