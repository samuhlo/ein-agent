import { randomUUID } from "node:crypto";
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { CONTINUITY_CHECKPOINT_LIMITS, parseContinuityCheckpoint, type ContinuityCheckpointV1 } from "./continuity-checkpoint.ts";

export type ContinuityCheckpointLocation = Readonly<{ mode: "adhoc" }> | Readonly<{ mode: "sdd"; change: string }>;
export type ContinuityCheckpointExpectation = Readonly<{ kind: "absent" }> | Readonly<{ kind: "revision"; revision: string }>;
export type ContinuityCheckpointRead =
	| Readonly<{ status: "valid"; checkpoint: ContinuityCheckpointV1 }>
	| Readonly<{ status: "absent" }>
	| Readonly<{ status: "failure"; reason: "invalid-content" | "read-failure" | "unsafe-request" }>;
export type ContinuityCheckpointMutation =
	| Readonly<{ ok: true; outcome: "published-verified"; revision: string | null }>
	| Readonly<{ ok: false; outcome: "not-published" | "published-unverified"; reason: "conflict" | "busy" | "invalid" | "io" | "absent" }>;
export type ContinuityCheckpointStoreTestSeam = Readonly<{ beforePublish?: () => void; afterPublish?: () => void }>;

const REVISION = /^sha256:[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const SAFE_READ = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0);
type Identity = Readonly<{ dev: number; ino: number }>;
type Entry = Readonly<{ path: string; identity: Identity }>;
type TargetRead = ContinuityCheckpointRead & Readonly<{ identity?: Identity }>;
type NormalLocation = Readonly<{ mode: "adhoc" } | { mode: "sdd"; change: string }>;
type Request = Readonly<{ root: string; location: NormalLocation; target: string }>;
type Callbacks = Readonly<{ beforePublish?: () => void; afterPublish?: () => void }>;

function dataProperties(value: unknown): Record<string, PropertyDescriptor> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	const descriptors = Object.getOwnPropertyDescriptors(value);
	return Object.values(descriptors).every((descriptor) => Object.hasOwn(descriptor, "value") && descriptor.enumerable) ? descriptors : null;
}
function exact(descriptors: Record<string, PropertyDescriptor>, keys: readonly string[]): boolean {
	const actual = Object.keys(descriptors).sort(); return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}
function safeChange(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && new TextEncoder().encode(value).byteLength <= 128
		&& value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\") && !CONTROL.test(value);
}
function requestFor(root: unknown, location: unknown): Request | null {
	if (typeof root !== "string" || root.length === 0 || CONTROL.test(root)) return null;
	const descriptors = dataProperties(location); if (!descriptors) return null;
	const mode = descriptors.mode?.value;
	let normalized: NormalLocation;
	if (mode === "adhoc" && exact(descriptors, ["mode"])) normalized = { mode };
	else if (mode === "sdd" && exact(descriptors, ["change", "mode"]) && safeChange(descriptors.change?.value)) normalized = { mode, change: descriptors.change.value as string };
	else return null;
	const base = resolve(root);
	const target = normalized.mode === "adhoc" ? join(base, ".ein", "continuity.json") : join(base, "openspec", "changes", normalized.change, "continuity.json");
	const rel = relative(base, target);
	return rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) ? { root: base, location: normalized, target } : null;
}
function expectationFor(value: unknown): ContinuityCheckpointExpectation | null {
	const descriptors = dataProperties(value); if (!descriptors) return null;
	if (exact(descriptors, ["kind"]) && descriptors.kind?.value === "absent") return { kind: "absent" };
	if (exact(descriptors, ["kind", "revision"]) && descriptors.kind?.value === "revision" && typeof descriptors.revision?.value === "string" && REVISION.test(descriptors.revision.value)) return { kind: "revision", revision: descriptors.revision.value };
	return null;
}
function callbacksFor(value: unknown): Callbacks | null {
	if (value === undefined) return {};
	const descriptors = dataProperties(value); if (!descriptors || Object.keys(descriptors).some((key) => key !== "beforePublish" && key !== "afterPublish")) return null;
	const before = descriptors.beforePublish?.value, after = descriptors.afterPublish?.value;
	if (before !== undefined && typeof before !== "function" || after !== undefined && typeof after !== "function") return null;
	return { ...(before ? { beforePublish: before as () => void } : {}), ...(after ? { afterPublish: after as () => void } : {}) };
}

export function continuityCheckpointPath(root: string, location: ContinuityCheckpointLocation): string | null {
	try { return requestFor(root, location)?.target ?? null; } catch { return null; }
}
function identity(stat: ReturnType<typeof fstatSync>): Identity { return { dev: Number(stat.dev), ino: Number(stat.ino) }; }
function entry(path: string): Entry | "absent" | null {
	try { const stat = lstatSync(path); return stat.isDirectory() && !stat.isSymbolicLink() ? { path, identity: { dev: Number(stat.dev), ino: Number(stat.ino) } } : null; }
	catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? "absent" : null; }
}
function same(path: string, expected: Identity, kind: "file" | "directory" = "file"): boolean {
	try { const stat = lstatSync(path); return !stat.isSymbolicLink() && (kind === "file" ? stat.isFile() : stat.isDirectory()) && Number(stat.dev) === expected.dev && Number(stat.ino) === expected.ino; }
	catch { return false; }
}
function prepare(request: Request, create: boolean): Readonly<{ state: "present"; proof: readonly Entry[] }> | Readonly<{ state: "absent" | "unsafe" }> {
	const root = entry(request.root); if (root === "absent" || root === null) return { state: "unsafe" };
	const proof: Entry[] = [root], segments = request.location.mode === "adhoc" ? [".ein"] : ["openspec", "changes", request.location.change];
	let current = request.root;
	for (const segment of segments) {
		current = join(current, segment); let observed = entry(current);
		if (observed === "absent" && create && request.location.mode === "adhoc") {
			try { mkdirSync(current, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") return { state: "unsafe" }; }
			observed = entry(current);
		}
		if (observed === "absent") return { state: "absent" };
		if (observed === null) return { state: "unsafe" };
		proof.push(observed);
	}
	return { state: "present", proof };
}
function validProof(proof: readonly Entry[]): boolean { return proof.every(({ path, identity: expected }) => same(path, expected, "directory")); }
function boundedBytes(path: string): Readonly<{ bytes: Buffer; identity: Identity }> {
	const fd = openSync(path, SAFE_READ);
	try {
		const stat = fstatSync(fd); if (!stat.isFile() || stat.size > CONTINUITY_CHECKPOINT_LIMITS.maxSerializedBytes) throw new Error("invalid");
		const output = Buffer.alloc(CONTINUITY_CHECKPOINT_LIMITS.maxSerializedBytes + 1); let offset = 0;
		while (offset < output.length) { const count = readSync(fd, output, offset, output.length - offset, null); if (count === 0) break; offset += count; }
		if (offset > CONTINUITY_CHECKPOINT_LIMITS.maxSerializedBytes) throw new Error("invalid");
		return { bytes: output.subarray(0, offset), identity: identity(stat) };
	} finally { closeSync(fd); }
}
function readTarget(path: string): TargetRead {
	try { const file = boundedBytes(path), parsed = parseContinuityCheckpoint(file.bytes.toString("utf8")); return parsed.ok ? { status: "valid", checkpoint: parsed.checkpoint, identity: file.identity } : { status: "failure", reason: "invalid-content", identity: file.identity }; }
	catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "absent" }; return { status: "failure", reason: (error as Error).message === "invalid" ? "invalid-content" : "read-failure" }; }
}
function publicRead(request: Request): ContinuityCheckpointRead {
	const parent = prepare(request, false); if (parent.state !== "present") return parent.state === "absent" ? { status: "absent" } : { status: "failure", reason: "read-failure" };
	const result = readTarget(request.target); if (!validProof(parent.proof)) return { status: "failure", reason: "read-failure" };
	const { identity: ignored, ...read } = result; void ignored; return read;
}
export function readContinuityCheckpoint(root: string, location: ContinuityCheckpointLocation): ContinuityCheckpointRead {
	try { const request = requestFor(root, location); return request ? publicRead(request) : { status: "failure", reason: "unsafe-request" }; }
	catch { return { status: "failure", reason: "unsafe-request" }; }
}

function matches(current: TargetRead, expectation: ContinuityCheckpointExpectation): boolean {
	return expectation.kind === "absent" ? current.status === "absent" : current.status === "valid" && current.checkpoint.revision === expectation.revision;
}
function unchanged(previous: TargetRead, current: TargetRead): boolean {
	if (previous.status === "absent") return current.status === "absent";
	return previous.status === "valid" && current.status === "valid" && previous.identity !== undefined && current.identity !== undefined
		&& previous.identity.dev === current.identity.dev && previous.identity.ino === current.identity.ino && previous.checkpoint.revision === current.checkpoint.revision;
}
function syncDirectory(path: string): void {
	const fd = openSync(path, SAFE_READ); try { fsyncSync(fd); } catch (error) { if (!["EINVAL", "ENOTSUP", "EISDIR", "EBADF"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; } finally { closeSync(fd); }
}
function releaseOwned(path: string, owned: Identity | undefined, proof: readonly Entry[], quarantine: string): void {
	if (!owned || !validProof(proof)) return;
	try { lstatSync(quarantine); return; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return; }
	try { renameSync(path, quarantine); } catch { return; }
	if (!validProof(proof)) return;
	let fd: number | undefined;
	try { fd = openSync(quarantine, SAFE_READ); const observed = identity(fstatSync(fd)); if (observed.dev === owned.dev && observed.ino === owned.ino) unlinkSync(quarantine); }
	catch { /* Uncertain identity: preserve the quarantined inode. */ } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* cleanup only */ } }
}

function mutate(request: Request, expectation: ContinuityCheckpointExpectation, checkpoint: ContinuityCheckpointV1 | null, callbacks: Callbacks): ContinuityCheckpointMutation {
	let canonical: ContinuityCheckpointV1 | null = null;
	if (checkpoint) { const parsed = parseContinuityCheckpoint(checkpoint); if (!parsed.ok || parsed.checkpoint.mode !== request.location.mode || (request.location.mode === "adhoc" ? parsed.checkpoint.change !== null : parsed.checkpoint.change !== request.location.change)) return { ok: false, outcome: "not-published", reason: "invalid" }; canonical = parsed.checkpoint; }
	const parent = prepare(request, checkpoint !== null); if (parent.state !== "present") return { ok: false, outcome: "not-published", reason: "invalid" };
	const path = request.target, lock = `${path}.lock`, temp = `${path}.tmp`, token = randomUUID();
	let lockFd: number | undefined, tempFd: number | undefined, lockId: Identity | undefined, tempId: Identity | undefined, published = false;
	try {
		try { lockFd = openSync(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600); }
		catch (error) { return { ok: false, outcome: "not-published", reason: (error as NodeJS.ErrnoException).code === "EEXIST" ? "busy" : "io" }; }
		lockId = identity(fstatSync(lockFd)); fsyncSync(lockFd);
		const current = readTarget(path); if (current.status === "failure") return { ok: false, outcome: "not-published", reason: current.reason === "invalid-content" ? "invalid" : "io" };
		if (checkpoint === null && current.status === "absent") return { ok: false, outcome: "not-published", reason: "absent" };
		if (!matches(current, expectation)) return { ok: false, outcome: "not-published", reason: "conflict" };
		let bytes: Buffer | undefined;
		if (canonical) {
			bytes = Buffer.from(`${JSON.stringify(canonical)}\n`, "utf8"); if (bytes.length > CONTINUITY_CHECKPOINT_LIMITS.maxSerializedBytes) return { ok: false, outcome: "not-published", reason: "invalid" };
			tempFd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600); tempId = identity(fstatSync(tempFd));
			let offset = 0; while (offset < bytes.length) { const count = writeSync(tempFd, bytes, offset); if (count < 1) throw new Error("write"); offset += count; } fsyncSync(tempFd);
		}
		callbacks.beforePublish?.();
		if (!validProof(parent.proof) || !same(lock, lockId)) return { ok: false, outcome: "not-published", reason: "busy" };
		const latest = readTarget(path); if (!unchanged(current, latest) || !matches(latest, expectation)) return { ok: false, outcome: "not-published", reason: "conflict" };
		if (canonical && bytes && tempId) {
			const staged = boundedBytes(temp), finalCurrent = readTarget(path); if (!unchanged(latest, finalCurrent) || !matches(finalCurrent, expectation)) return { ok: false, outcome: "not-published", reason: "conflict" };
			if (!same(lock, lockId) || staged.identity.dev !== tempId.dev || staged.identity.ino !== tempId.ino || !staged.bytes.equals(bytes) || !same(temp, tempId) || !validProof(parent.proof)) return { ok: false, outcome: "not-published", reason: "busy" };
			renameSync(temp, path); published = true;
		} else {
			const finalCurrent = readTarget(path); if (!unchanged(latest, finalCurrent) || !matches(finalCurrent, expectation) || !finalCurrent.identity || !same(path, finalCurrent.identity)) return { ok: false, outcome: "not-published", reason: "conflict" };
			if (!same(lock, lockId) || !validProof(parent.proof)) return { ok: false, outcome: "not-published", reason: "busy" };
			unlinkSync(path); published = true;
		}
		callbacks.afterPublish?.(); if (!validProof(parent.proof)) return { ok: false, outcome: "published-unverified", reason: "io" };
		syncDirectory(dirname(path)); const readback = readTarget(path);
		if (canonical) return readback.status === "valid" && readback.checkpoint.revision === canonical.revision ? { ok: true, outcome: "published-verified", revision: canonical.revision } : { ok: false, outcome: "published-unverified", reason: readback.status === "failure" && readback.reason === "invalid-content" ? "invalid" : "io" };
		return readback.status === "absent" ? { ok: true, outcome: "published-verified", revision: null } : { ok: false, outcome: "published-unverified", reason: "io" };
	} catch { return { ok: false, outcome: published ? "published-unverified" : "not-published", reason: "io" }; }
	finally {
		releaseOwned(temp, tempId, parent.proof, `${temp}.release-${token}`); releaseOwned(lock, lockId, parent.proof, `${lock}.release-${token}`);
		if (tempFd !== undefined) try { closeSync(tempFd); } catch { /* cleanup only */ } if (lockFd !== undefined) try { closeSync(lockFd); } catch { /* cleanup only */ }
	}
}

function invalid(): ContinuityCheckpointMutation { return { ok: false, outcome: "not-published", reason: "invalid" }; }
export function writeContinuityCheckpoint(root: string, location: ContinuityCheckpointLocation, checkpoint: ContinuityCheckpointV1, expectation: ContinuityCheckpointExpectation, seam?: ContinuityCheckpointStoreTestSeam): ContinuityCheckpointMutation {
	try { const request = requestFor(root, location), expected = expectationFor(expectation), callbacks = callbacksFor(seam); return request && expected && callbacks ? mutate(request, expected, checkpoint, callbacks) : invalid(); } catch { return invalid(); }
}
export function clearContinuityCheckpoint(root: string, location: ContinuityCheckpointLocation, expectation: ContinuityCheckpointExpectation, seam?: ContinuityCheckpointStoreTestSeam): ContinuityCheckpointMutation {
	try { const request = requestFor(root, location), expected = expectationFor(expectation), callbacks = callbacksFor(seam); return request && expected && callbacks ? mutate(request, expected, null, callbacks) : invalid(); } catch { return invalid(); }
}
