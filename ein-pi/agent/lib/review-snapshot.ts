import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

export type ReviewRequest = { mode: "working-tree" | "committed"; base?: string; head?: string; paths?: readonly string[] };
export type ReviewSnapshotResult = {
	ok: true; mode: ReviewRequest["mode"]; baseOid: string; headOid: string;
	snapshotRef: string; patch: string; numstatZ: string; paths: string[];
} | { ok: false; code: string; reason: string };
type Entry = { mode: string; content: Buffer } | null;
const MAX_BYTES = 16 * 1024 * 1024;

function git(cwd: string, args: string[]): Buffer {
	return execFileSync("git", args, { cwd, timeout: 10_000, maxBuffer: MAX_BYTES, stdio: ["ignore", "pipe", "pipe"] });
}
function ref(cwd: string, name: string): string {
	if (!/^[\w./-]+$/.test(name) || name.startsWith("-")) throw new Error("invalid Git ref");
	return git(cwd, ["rev-parse", "--verify", `${name}^{commit}`]).toString().trim();
}
function safePath(path: string): boolean {
	return Boolean(path) && !isAbsolute(path) && !path.includes("\0") && !path.includes("\\")
		&& !path.split("/").some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")
		&& !/[?*\[\]]/.test(path);
}
function treeEntry(root: string, oid: string, path: string): Entry {
	const raw = git(root, ["--literal-pathspecs", "ls-tree", "-z", oid, "--", path]).toString();
	if (!raw) return null;
	const match = /^(\d+) (blob|commit|tree) ([a-f0-9]+)\t([^\0]*)\0$/.exec(raw);
	if (!match || match[4] !== path || match[2] !== "blob") throw new Error(`unsupported Git entry: ${path}`);
	return { mode: match[1]!, content: git(root, ["cat-file", "blob", match[3]!]) };
}
function workingEntry(root: string, path: string): Entry {
	const parts = path.split("/");
	try {
		for (let i = 1; i < parts.length; i++) {
			const parent = lstatSync(join(root, ...parts.slice(0, i)));
			if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error(`unsafe parent: ${path}`);
		}
		const full = join(root, path), stat = lstatSync(full);
		if (stat.isSymbolicLink()) return { mode: "120000", content: Buffer.from(readlinkSync(full)) };
		if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error(`unsupported or oversized entry: ${path}`);
		return { mode: stat.mode & 0o111 ? "100755" : "100644", content: readFileSync(full) };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}
function identity(entry: Entry): unknown {
	return entry ? [entry.mode, createHash("sha256").update(entry.content).digest("hex")] : null;
}
function materialize(root: string, path: string, entry: Entry): void {
	if (!entry) return;
	const dest = join(root, path);
	mkdirSync(dirname(dest), { recursive: true });
	if (entry.mode === "120000") symlinkSync(entry.content.toString(), dest);
	else { writeFileSync(dest, entry.content); chmodSync(dest, entry.mode === "100755" ? 0o755 : 0o644); }
}
function diff(cwd: string, options: string[]): string {
	const result = spawnSync("git", ["-c", "core.quotePath=true", "diff", "--no-index", "--find-renames", "--no-ext-diff", "--no-textconv", ...options, "--", "before", "after"],
		{ cwd, encoding: "utf8", timeout: 10_000, maxBuffer: MAX_BYTES });
	if (result.error || (result.status !== 0 && result.status !== 1)) throw new Error("Git snapshot diff unavailable");
	return result.stdout;
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

export function readReviewSnapshot(cwd: string, request: ReviewRequest): ReviewSnapshotResult {
	let scratch: string | undefined;
	try {
		if (!request || !["working-tree", "committed"].includes(request.mode)) throw new Error("invalid review mode");
		if (request.paths !== undefined && (!Array.isArray(request.paths) || request.paths.some((p) => typeof p !== "string" || !safePath(p)))) throw new Error("invalid literal review paths");
		if (request.mode === "working-tree" && request.head !== undefined) throw new Error("working-tree does not accept head");
		const root = git(cwd, ["rev-parse", "--show-toplevel"]).toString().trim();
		const headName = request.head ?? "HEAD", headOid = ref(root, headName);
		const requestedBase = request.base ? ref(root, request.base) : headOid;
		const baseOid = request.base ? git(root, ["merge-base", requestedBase, headOid]).toString().trim() : headOid;
		const pathsAt = () => {
			const range = request.mode === "committed" ? [baseOid, headOid] : [baseOid];
			const changed = git(root, ["diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-only", "-z", ...range, "--"]).toString().split("\0").filter(Boolean);
			if (request.mode === "working-tree") changed.push(...git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).toString().split("\0").filter(Boolean));
			return [...new Set(changed)].filter((p) => !request.paths || request.paths.includes(p)).sort();
		};
		const paths = pathsAt();
		if (paths.some((p) => !safePath(p))) throw new Error("unsupported repository path");
		scratch = mkdtempSync(join(tmpdir(), "ein-review-"));
		mkdirSync(join(scratch, "before")); mkdirSync(join(scratch, "after"));
		const facts: unknown[] = [], afterFacts: string[] = [];
		for (const path of paths) {
			const before = treeEntry(root, baseOid, path);
			const after = request.mode === "committed" ? treeEntry(root, headOid, path) : workingEntry(root, path);
			facts.push([path, identity(before), identity(after)]); afterFacts.push(JSON.stringify(identity(after)));
			materialize(join(scratch, "before"), path, before); materialize(join(scratch, "after"), path, after);
		}
		const numstatZ = normalizeNumstat(diff(scratch, ["--numstat", "-z"]));
		const patch = diff(scratch, ["--no-color", "--unified=0"]);
		if (ref(root, headName) !== headOid || (request.base && ref(root, request.base) !== requestedBase)) throw new Error("source-changed");
		if (request.mode === "working-tree" && (JSON.stringify(pathsAt()) !== JSON.stringify(paths)
			|| paths.some((path, i) => JSON.stringify(identity(workingEntry(root, path))) !== afterFacts[i]))) throw new Error("source-changed");
		const snapshotRef = `sha256:${createHash("sha256").update(JSON.stringify([request.mode, baseOid, headOid, facts])).digest("hex")}`;
		return { ok: true, mode: request.mode, baseOid, headOid, snapshotRef, patch, numstatZ, paths };
	} catch (error) {
		return { ok: false, code: "review-unavailable", reason: error instanceof Error ? error.message.split("\n")[0]! : "review unavailable" };
	} finally { if (scratch) rmSync(scratch, { recursive: true, force: true }); }
}
