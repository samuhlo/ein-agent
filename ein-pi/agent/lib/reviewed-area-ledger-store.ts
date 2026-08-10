import { randomUUID } from "node:crypto";
import {
	closeSync,
	fstatSync,
	fsyncSync,
	lstatSync,
	openSync,
	readFileSync,
	realpathSync,
	renameSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { basename, join, parse, relative, resolve, sep } from "node:path";
import {
	MAX_LEDGER_BYTES,
	parseLedger,
	serializeLedger,
	ledgerDigest,
	evaluateReviewedArea,
	type CurrentGitState,
	type EvidenceResolution,
	type GitTransition,
	type LedgerEvaluation,
	type LedgerParseResult,
	type LedgerSnapshot,
} from "./reviewed-area-ledger.ts";

export const REVIEWED_AREA_LEDGER_FILE = "reviewed-area-ledger.json";

export type WorkspaceLedgerRead =
	| Readonly<{ status: "absent"; ledger: LedgerSnapshot }>
	| Readonly<{ status: "valid"; ledger: LedgerSnapshot; digest: string }>
	| Readonly<{ status: "invalid"; reason: "malformed-ledger" }>
	| Readonly<{ status: "unavailable"; reason: "oversized" | "unsupported-version" | "unreadable" }>;

export type LedgerExclusionProof = Readonly<{
	path: string;
	excluded: true;
	owner: "B";
}>;

export type WorkspaceLedgerWriteOptions = Readonly<{
	expectedDigest: string | null;
	exclusionProof: LedgerExclusionProof;
}>;

export type WorkspaceLedgerWriteResult = Readonly<{
	status: "written";
	digest: string;
}>;

export type WorkspaceLedgerWriteSeam = Readonly<{
	temporaryName?: string;
	beforeFinalCheck?: (temporaryPath: string) => void;
}>;

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const EMPTY_LEDGER: LedgerSnapshot = Object.freeze({ schemaVersion: 1, records: Object.freeze([]) });

export function workspaceLedgerPath(cwd: string): string {
	return join(resolve(cwd), "openspec", REVIEWED_AREA_LEDGER_FILE);
}

type WorkspacePaths = Readonly<{ workspace: string; openspec: string; ledger: string }>;

function hasSymlinkAncestor(path: string): boolean {
	const absolute = resolve(path);
	const root = parse(absolute).root;
	const segments = relative(root, absolute).split(sep).filter(Boolean);
	let current = root;
	for (const segment of segments) {
		current = join(current, segment);
		let stat;
		try { stat = lstatSync(current); } catch (error) {
			// FAIL CLOSED -> Do not resolve a missing suffix through an external link.
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw error;
		}
		if (stat.isSymbolicLink()) return true;
	}
	return false;
}

function workspaceParents(cwd: string): WorkspacePaths | null {
	const workspace = resolve(cwd);
	const openspec = join(workspace, "openspec");
	const ledger = join(openspec, REVIEWED_AREA_LEDGER_FILE);
	let workspaceStat;
	try { workspaceStat = lstatSync(workspace); } catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			if (hasSymlinkAncestor(workspace)) throw new Error("workspace-boundary");
			return null;
		}
		throw error;
	}
	if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()) throw new Error("workspace-boundary");
	const realWorkspace = resolve(realpathSync(workspace));
	if (realWorkspace !== workspace) throw new Error("workspace-boundary");
	let openspecStat;
	try { openspecStat = lstatSync(openspec); } catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
	if (!openspecStat.isDirectory() || openspecStat.isSymbolicLink()) throw new Error("workspace-boundary");
	const realOpenspec = resolve(realpathSync(openspec));
	if (relative(realWorkspace, realOpenspec) !== "openspec") throw new Error("workspace-boundary");
	return { workspace, openspec, ledger };
}

function existingLedgerBytes(path: string): Buffer | null {
	let file;
	try { file = lstatSync(path); } catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
	if (!file.isFile() || file.isSymbolicLink()) throw new Error("ledger-unreadable");
	if (file.size > MAX_LEDGER_BYTES) throw new Error("ledger-oversized");
	const bytes = readFileSync(path);
	if (bytes.byteLength > MAX_LEDGER_BYTES) throw new Error("ledger-oversized");
	return bytes;
}

// `digest` is required: a valid WorkspaceLedgerRead carries one by contract, and
// the only caller always computes it from the bytes it just read.
function mapParse(result: LedgerParseResult, digest: string): WorkspaceLedgerRead {
	if (result.status === "valid") return { status: "valid", ledger: result.ledger, digest };
	return result.status === "invalid"
		? { status: "invalid", reason: result.reason }
		: { status: "unavailable", reason: result.reason };
}

export function readWorkspaceLedger(cwd: string): WorkspaceLedgerRead {
	let paths: WorkspacePaths | null;
	try { paths = workspaceParents(cwd); } catch { return { status: "unavailable", reason: "unreadable" }; }
	if (!paths) return { status: "absent", ledger: EMPTY_LEDGER };
	let bytes: Buffer | null;
	try { bytes = existingLedgerBytes(paths.ledger); } catch (error) {
		const code = (error as Error).message;
		if (code === "ledger-oversized") return { status: "unavailable", reason: "oversized" };
		return { status: "unavailable", reason: "unreadable" };
	}
	if (!bytes) return { status: "absent", ledger: EMPTY_LEDGER };
	return mapParse(parseLedger(bytes), ledgerDigest(bytes));
}

export const readReviewedAreaLedger = readWorkspaceLedger;

/**
 * [FLOW] READ-ONLY LEDGER EVALUATION
 * ---------------------------------------------------------
 * Store failures stay fail-closed; no caller receives a writer through this seam.
 */
export function evaluateWorkspaceLedger(
	cwd: string,
	areaId: string,
	current: CurrentGitState,
	transition?: GitTransition,
	evidence?: EvidenceResolution,
): LedgerEvaluation {
	const source = readWorkspaceLedger(cwd);
	if (source.status === "absent" || source.status === "valid") {
		return evaluateReviewedArea(source.ledger, areaId, current, transition, evidence);
	}
	if (source.status === "invalid") return Object.freeze({ outcome: "invalid", freshness: "invalid", reason: "malformed-ledger" });
	return Object.freeze({
		outcome: "unavailable",
		freshness: "unavailable",
		reason: source.reason === "unsupported-version" ? "unsupported-version" : source.reason === "oversized" ? "ledger-oversized" : "ledger-unreadable",
	});
}

export const evaluateReviewedWorkspaceLedger = evaluateWorkspaceLedger;

function requireProof(path: string, options: WorkspaceLedgerWriteOptions): void {
	const proof = options?.exclusionProof;
	const expectedDigest = options?.expectedDigest;
	const validExpected = typeof expectedDigest === "string" || expectedDigest === null;
	const validProof = Boolean(
		proof &&
		Object.keys(proof).every((key) => ["path", "excluded", "owner"].includes(key)) &&
		proof.path === path &&
		proof.excluded === true &&
		proof.owner === "B",
	);
	if (!validExpected || !validProof) throw new Error("missing-exclusion-proof");
	if (expectedDigest !== null && !DIGEST.test(expectedDigest)) throw new Error("invalid-precondition");
}

function syncParent(path: string): void {
	try {
		const fd = openSync(path, "r");
		try { fsyncSync(fd); } finally { closeSync(fd); }
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EISDIR" && code !== "EBADF") throw error;
	}
}

type FileIdentity = Readonly<{ dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }>;

function sameFile(path: string, expected: FileIdentity): boolean {
	try {
		const current = lstatSync(path);
		return current.isFile() && !current.isSymbolicLink() && current.dev === expected.dev && current.ino === expected.ino && current.size === expected.size && current.mtimeMs === expected.mtimeMs && current.ctimeMs === expected.ctimeMs;
	} catch {
		return false;
	}
}

function assertOwnedTemp(path: string, identity: FileIdentity, bytes: Buffer): void {
	if (!sameFile(path, identity)) throw new Error("temporary-changed");
	let current: Buffer;
	try { current = readFileSync(path); } catch { throw new Error("temporary-changed"); }
	if (ledgerDigest(current) !== ledgerDigest(bytes)) throw new Error("temporary-changed");
}

export function replaceWorkspaceLedger(
	cwd: string,
	snapshot: LedgerSnapshot,
	options: WorkspaceLedgerWriteOptions,
	seam: WorkspaceLedgerWriteSeam = {},
): WorkspaceLedgerWriteResult {
	const paths = workspaceParents(cwd);
	if (!paths) throw new Error("workspace-unavailable");
	const path = paths.ledger;
	requireProof(path, options);
	const bytes = Buffer.from(serializeLedger(snapshot), "utf8");
	const previous = existingLedgerBytes(path);
	const previousDigest = previous ? ledgerDigest(previous) : null;
	if (previousDigest !== options.expectedDigest) throw new Error("precondition-failed");
	if (previous) {
		const existing = parseLedger(previous);
		if (existing.status !== "valid") throw new Error(existing.reason);
	}

	const token = seam.temporaryName ?? randomUUID();
	if (typeof token !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(token)) throw new Error("invalid-temporary-name");
	const parent = paths.openspec;
	const temp = join(parent, `.${basename(path)}.${process.pid}.${token}.tmp`);
	let fd: number | undefined;
	let owned = false;
	let identity: FileIdentity | undefined;
	try {
		fd = openSync(temp, "wx", 0o600);
		owned = true;
		let offset = 0;
		while (offset < bytes.byteLength) offset += writeSync(fd, bytes, offset);
		fsyncSync(fd);
		const tempStat = fstatSync(fd);
		identity = { dev: tempStat.dev, ino: tempStat.ino, size: tempStat.size, mtimeMs: tempStat.mtimeMs, ctimeMs: tempStat.ctimeMs };
		closeSync(fd);
		fd = undefined;

		seam.beforeFinalCheck?.(temp);
		assertOwnedTemp(temp, identity, bytes);
		const currentPaths = workspaceParents(cwd);
		if (!currentPaths || currentPaths.ledger !== path) throw new Error("workspace-boundary");
		const current = existingLedgerBytes(path);
		if ((current ? ledgerDigest(current) : null) !== previousDigest) throw new Error("precondition-failed");
		assertOwnedTemp(temp, identity, bytes);
		renameSync(temp, path);
		syncParent(parent);
		return { status: "written", digest: ledgerDigest(bytes) };
	} finally {
		if (fd !== undefined) {
			try { closeSync(fd); } catch { /* cleanup only */ }
		}
		if (owned && identity && sameFile(temp, identity)) {
			try { unlinkSync(temp); } catch { /* cleanup only our inode */ }
		}
	}
}

export const replaceReviewedAreaLedger = replaceWorkspaceLedger;
