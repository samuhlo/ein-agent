import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readlinkSync, readSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

export type ReviewRequest = { mode: "working-tree" | "committed"; base?: string; head?: string; paths?: readonly string[] };
export type ReviewSnapshotResult = {
	ok: true; mode: ReviewRequest["mode"]; baseOid: string; headOid: string;
	snapshotRef: string; patch: string; numstatZ: string; paths: string[];
} | { ok: false; code: string; reason: string };
type Entry = { mode: string; content: Buffer } | null;
type Blob = { mode: string; oid: string; size: number };
export const REVIEW_CAPTURE_LIMITS = Object.freeze({ entryBytes: 16 * 1024 * 1024, outputBytes: 16 * 1024 * 1024, totalBytes: 64 * 1024 * 1024, durationMs: 15_000, paths: 10_000 });
export type ReviewCaptureTestSeam = { now?: () => number; beforeRecheck?: () => void; onGitCall?: () => void };
const decode = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

class Capture {
	private bytes = 0;
	private readonly now: () => number;
	private readonly started: number;
	constructor(private readonly seam: ReviewCaptureTestSeam) { this.now = seam.now ?? (() => performance.now()); this.started = this.now(); }
	check(): number {
		const elapsed = this.now() - this.started;
		if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= REVIEW_CAPTURE_LIMITS.durationMs) throw new Error("capture deadline exceeded");
		return Math.max(1, Math.min(10_000, Math.ceil(REVIEW_CAPTURE_LIMITS.durationMs - elapsed)));
	}
	take(bytes: number): void {
		this.check(); this.bytes += bytes;
		if (this.bytes > REVIEW_CAPTURE_LIMITS.totalBytes) throw new Error("aggregate capture byte limit exceeded");
	}
	git(cwd: string, args: string[], input?: Buffer, isDiff = false): Buffer {
		const timeout = this.check(); this.seam.onGitCall?.();
		const result = spawnSync("git", ["--no-replace-objects", "-c", "core.fsmonitor=false", ...args], {
			cwd, input, timeout, maxBuffer: REVIEW_CAPTURE_LIMITS.outputBytes,
			env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1" },
		});
		this.check();
		if (result.error || (result.status !== 0 && !(isDiff && result.status === 1))) throw new Error("Git snapshot command unavailable");
		this.take(result.stdout.length + result.stderr.length);
		return result.stdout;
	}
}
function ref(cwd: string, name: string, capture: Capture): string {
	if (!/^[\w./-]+$/.test(name) || name.startsWith("-")) throw new Error("invalid Git ref");
	return decode(capture.git(cwd, ["rev-parse", "--verify", `${name}^{commit}`])).trim();
}
function safePath(path: string): boolean {
	return Boolean(path) && !isAbsolute(path) && !path.includes("\0") && !path.includes("\\")
		&& !path.split("/").some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git");
}
function treeEntries(root: string, oid: string, paths: Set<string>, capture: Capture): Map<string, Blob> {
	const entries = new Map<string, Blob>();
	if (!paths.size) return entries;
	const raw = decode(capture.git(root, ["ls-tree", "-rlz", "--full-tree", oid]));
	for (const line of raw.split("\0")) {
		capture.check(); if (!line) continue;
		const match = /^([0-7]{6}) (blob|commit) ([a-f0-9]{40}|[a-f0-9]{64}) +(\d+|-)\t([\s\S]+)$/.exec(line);
		if (!match) throw new Error("invalid Git tree entry");
		if (!paths.has(match[5]!)) continue;
		const size = Number(match[4]);
		if (match[2] !== "blob" || !["100644", "100755", "120000"].includes(match[1]!) || !Number.isSafeInteger(size) || size < 0 || size > REVIEW_CAPTURE_LIMITS.entryBytes) throw new Error("unsupported or oversized Git entry");
		entries.set(match[5]!, { mode: match[1]!, oid: match[3]!, size });
	}
	return entries;
}

function readBlobs(root: string, trees: Map<string, Blob>[], capture: Capture): Map<string, Buffer> {
	const descriptors = new Map(trees.flatMap((tree) => [...tree.values()].map((entry) => [entry.oid, entry] as const)));
	const contents = new Map<string, Buffer>(); let batch: Blob[] = [], bytes = 0;
	const flush = () => {
		if (!batch.length) return;
		const output = capture.git(root, ["cat-file", "--batch"], Buffer.from(batch.map((entry) => entry.oid).join("\n") + "\n"));
		let offset = 0;
		for (const entry of batch) {
			capture.check(); const end = output.indexOf(10, offset);
			if (end < 0 || decode(output.subarray(offset, end)) !== `${entry.oid} blob ${entry.size}` || output[end + entry.size + 1] !== 10) throw new Error("invalid Git blob batch");
			contents.set(entry.oid, output.subarray(end + 1, end + 1 + entry.size)); offset = end + entry.size + 2;
		}
		if (offset !== output.length) throw new Error("unexpected Git blob batch output");
		batch = []; bytes = 0;
	};
	for (const entry of descriptors.values()) {
		capture.check(); const framedBytes = entry.size + entry.oid.length + 32;
		if (bytes + framedBytes > REVIEW_CAPTURE_LIMITS.outputBytes) flush();
		// A maximum-size blob fits the content limit but not a framed batch response.
		if (framedBytes > REVIEW_CAPTURE_LIMITS.outputBytes) {
			const content = capture.git(root, ["cat-file", "blob", entry.oid]);
			if (content.length !== entry.size) throw new Error("Git blob size changed");
			contents.set(entry.oid, content);
		} else { batch.push(entry); bytes += framedBytes; }
	}
	flush(); return contents;
}

function workingEntry(root: string, path: string, capture: Capture): Entry {
	const parts = path.split("/");
	try {
		capture.check();
		for (let i = 1; i < parts.length; i++) {
			const parent = lstatSync(join(root, ...parts.slice(0, i)));
			if (parent.isFile() || parent.isSymbolicLink()) return null;
			if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error(`unsafe parent: ${path}`);
		}
		const full = join(root, path), stat = lstatSync(full);
		if (stat.isDirectory()) return null;
		if (stat.isSymbolicLink()) { const content = readlinkSync(full, { encoding: "buffer" }); capture.take(content.length); return { mode: "120000", content }; }
		if (!stat.isFile() || stat.size > REVIEW_CAPTURE_LIMITS.entryBytes) throw new Error(`unsupported or oversized entry: ${path}`);
		const fd = openSync(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
		try {
			const opened = fstatSync(fd);
			if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size) throw new Error("source-changed");
			const buffer = Buffer.alloc(stat.size + 1); let offset = 0;
			while (offset < buffer.length) {
				capture.check(); const count = readSync(fd, buffer, offset, Math.min(64 * 1024, buffer.length - offset), null);
				if (!count) break; capture.take(count); offset += count;
			}
			const after = fstatSync(fd);
			if (offset !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.mode !== stat.mode) throw new Error("source-changed");
			return { mode: stat.mode & 0o111 ? "100755" : "100644", content: buffer.subarray(0, offset) };
		} finally { closeSync(fd); }
	} catch (error) {
		if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return null;
		throw error;
	}
}
function identity(entry: Entry): unknown {
	return entry ? [entry.mode, createHash("sha256").update(entry.content).digest("hex")] : null;
}
function materialize(root: string, path: string, entry: Entry, capture: Capture, directories: Map<string, string>): void {
	if (!entry) return;
	capture.take(entry.content.length);
	const directory = (path: string, create = false) => {
		capture.check();
		let created = false;
		if (create) {
			try { mkdirSync(path, { mode: 0o700 }); created = true; }
			catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
		}
		const stat = lstatSync(path), key = `${stat.dev}:${stat.ino}`;
		if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unsafe scratch ancestor");
		// Case or Unicode aliases must not merge distinct Git directory names.
		if (directories.has(key) ? directories.get(key) !== path : create && !created) throw new Error("scratch path collision");
		directories.set(key, path);
	};
	let parent = root; directory(parent);
	const parts = path.split("/");
	for (const part of parts.slice(0, -1)) { parent = join(parent, part); directory(parent, true); }
	const dest = join(parent, parts.at(-1)!);
	try {
		if (entry.mode === "120000") symlinkSync(entry.content, dest);
		else {
			const mode = entry.mode === "100755" ? 0o755 : 0o644;
			const fd = openSync(dest, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), mode);
			try { writeFileSync(fd, entry.content); fchmodSync(fd, mode); } finally { closeSync(fd); }
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("scratch path collision");
		throw error;
	}
}
function diff(cwd: string, options: string[], capture: Capture): string {
	return decode(capture.git(cwd, ["-c", "core.quotePath=true", "diff", "--no-index", "--find-renames", "--no-ext-diff", "--no-textconv", ...options, "--", "before", "after"], undefined, true));
}
function normalizeNumstat(raw: string): string {
	const fields = raw.split("\0");
	for (let i = 0; i < fields.length; i++) {
		if (!fields[i]) continue;
		const line = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(fields[i]!);
		if (!line) throw new Error("invalid Git numstat");
		const strip = (p: string) => p.replace(/^(?:before|after)\//, "");
		if (line[3]) fields[i] = `${line[1]}\t${line[2]}\t${strip(line[3])}`;
		else {
			if (!fields[i + 1] || !fields[i + 2]) throw new Error("invalid Git rename");
			fields[i + 1] = strip(fields[i + 1]!); fields[i + 2] = strip(fields[i + 2]!); i += 2;
		}
	}
	return fields.join("\0");
}

export function readReviewSnapshot(cwd: string, request: ReviewRequest, seam: ReviewCaptureTestSeam = {}): ReviewSnapshotResult {
	let scratch: string | undefined;
	try {
		const capture = new Capture(seam);
		if (!request || typeof request !== "object" || Array.isArray(request) || !["working-tree", "committed"].includes(request.mode)
			|| Object.keys(request).some((key) => !["mode", "base", "head", "paths"].includes(key))) throw new Error("invalid review request");
		for (const value of [request.base, request.head]) if (value !== undefined && (typeof value !== "string" || value.length === 0)) throw new Error("invalid review ref type");
		if (request.paths !== undefined && (!Array.isArray(request.paths) || request.paths.some((p) => typeof p !== "string" || !safePath(p) || /[?*]/.test(p)))) throw new Error("invalid literal review paths");
		if (request.mode === "working-tree" && request.head !== undefined) throw new Error("working-tree does not accept head");
		const root = decode(capture.git(cwd, ["rev-parse", "--show-toplevel"])).replace(/\n$/, "");
		const headName = request.head ?? "HEAD", headOid = ref(root, headName, capture);
		const requestedBase = request.base ? ref(root, request.base, capture) : headOid;
		const baseOid = request.base ? decode(capture.git(root, ["merge-base", requestedBase, headOid])).trim() : headOid;
		const selected = request.paths ? new Set(request.paths) : undefined;
		const pathsAt = () => {
			const range = request.mode === "committed" ? [baseOid, headOid] : [baseOid];
			// Index/blob comparisons and ls-files metadata never run worktree clean filters.
			const changed = decode(capture.git(root, ["diff", ...(request.mode === "working-tree" ? ["--cached"] : []), "--no-ext-diff", "--no-textconv", "--no-renames", "--name-only", "-z", ...range, "--"])).split("\0").filter(Boolean);
			let eligible: Set<string> | undefined;
			if (request.mode === "working-tree") {
				const untracked = decode(capture.git(root, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean);
				changed.push(...decode(capture.git(root, ["ls-files", "--modified", "--deleted", "-z"])).split("\0").filter(Boolean), ...untracked);
				eligible = new Set([...decode(capture.git(root, ["ls-files", "--cached", "-z"])).split("\0").filter(Boolean), ...untracked]);
			}
			const paths = [...new Set(changed)].filter((path) => !selected || selected.has(path)).sort();
			if (paths.length > REVIEW_CAPTURE_LIMITS.paths) throw new Error("capture path limit exceeded");
			capture.check(); return { paths, eligible };
		};
		const { paths, eligible } = pathsAt();
		if (paths.some((p) => !safePath(p))) throw new Error("unsupported repository path");
		const beforeTree = treeEntries(root, baseOid, new Set(paths), capture);
		const afterTree = request.mode === "committed" ? treeEntries(root, headOid, new Set(paths), capture) : new Map<string, Blob>();
		const blobs = readBlobs(root, [beforeTree, afterTree], capture);
		const fromTree = (tree: Map<string, Blob>, path: string): Entry => {
			const blob = tree.get(path); if (!blob) return null;
			const content = blobs.get(blob.oid); if (!content) throw new Error("missing captured Git blob");
			return { mode: blob.mode, content };
		};
		scratch = mkdtempSync(join(tmpdir(), "ein-review-"));
		mkdirSync(join(scratch, "before")); mkdirSync(join(scratch, "after"));
		const facts: unknown[] = [], afterFacts: string[] = [];
		const beforeDirectories = new Map<string, string>(), afterDirectories = new Map<string, string>();
		for (const path of paths) {
			capture.check();
			const before = fromTree(beforeTree, path);
			const after = request.mode === "committed" ? fromTree(afterTree, path) : eligible?.has(path) ? workingEntry(root, path, capture) : null;
			facts.push([path, identity(before), identity(after)]); afterFacts.push(JSON.stringify(identity(after)));
			materialize(join(scratch, "before"), path, before, capture, beforeDirectories); materialize(join(scratch, "after"), path, after, capture, afterDirectories);
		}
		const numstatZ = normalizeNumstat(diff(scratch, ["--numstat", "-z"], capture));
		const patch = diff(scratch, ["--no-color", "--unified=0"], capture);
		seam.beforeRecheck?.();
		if (ref(root, headName, capture) !== headOid || (request.base && ref(root, request.base, capture) !== requestedBase)) throw new Error("source-changed");
		if (request.mode === "working-tree") {
			const current = pathsAt();
			if (JSON.stringify(current.paths) !== JSON.stringify(paths)
				|| paths.some((path, i) => JSON.stringify(identity(current.eligible?.has(path) ? workingEntry(root, path, capture) : null)) !== afterFacts[i])) throw new Error("source-changed");
		}
		const snapshotRef = `sha256:${createHash("sha256").update(JSON.stringify([request.mode, baseOid, headOid, facts])).digest("hex")}`;
		capture.check();
		return { ok: true, mode: request.mode, baseOid, headOid, snapshotRef, patch, numstatZ, paths };
	} catch (error) {
		return { ok: false, code: "review-unavailable", reason: error instanceof Error ? error.message.split("\n")[0]! : "review unavailable" };
	} finally { if (scratch) rmSync(scratch, { recursive: true, force: true }); }
}
