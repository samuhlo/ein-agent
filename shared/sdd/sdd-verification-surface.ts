import { createHash } from "node:crypto";
import { closeSync, lstatSync, openSync, readlinkSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type VerificationGitEntry = Readonly<{ path: string; kind: "file" | "gitlink" }>;
export type VerificationGitEnumeration =
	| Readonly<{ ok: true; root: string; entries: readonly VerificationGitEntry[] }>
	| Readonly<{ ok: false; code: string; reason: string }>;

export type VerificationSurfaceEntry = Readonly<{
	path: string;
	kind: "file" | "symlink" | "gitlink";
	executable: boolean;
	sha256: string | "missing";
}>;

export type VerificationSurfaceCapture =
	| Readonly<{ ok: true; root: string; surfaceRef: string; decisionRef: string; entries: readonly VerificationSurfaceEntry[] }>
	| Readonly<{ ok: false; code: string; reason: string }>;

export type VerificationSurfacePorts = Readonly<{
	enumerateGit: (cwd: string) => VerificationGitEnumeration;
	previousEntries?: readonly VerificationSurfaceEntry[];
	limits?: Readonly<{ maxEntries?: number; isCancelled?: () => boolean }>;
}>;

const PROCESS_FILES = new Set([
	"intent.md", "scope.md", "map.md", "design.md", "tasks.md", "apply-progress.md",
	"verify-report.md", "summary.md", "preflight.json", "continuity.json",
	"verification-session.json", "verification-receipt.json",
]);
const DECISION_FILES = ["intent.md", "scope.md", "design.md", "tasks.md", "preflight.json"] as const;
const SHA256_PREFIX = "sha256:";

function normalizedRelative(path: string): string | null {
	if (!path || path.includes("\0") || isAbsolute(path)) return null;
	const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
	if (!normalized || normalized.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
	return normalized;
}

function changeCoordinates(root: string, changePath: string): { base: "openspec" | ".sdd"; change: string } | null {
	const rel = normalizedRelative(relative(root, changePath));
	if (!rel) return null;
	const parts = rel.split("/");
	if (parts.length !== 3 || (parts[0] !== "openspec" && parts[0] !== ".sdd") || parts[1] !== "changes") return null;
	return { base: parts[0], change: parts[2] };
}

function isExcludedProcessPath(path: string, coordinates: { base: "openspec" | ".sdd"; change: string }): boolean {
	const draftLock = /^\.ein\/intent-drafts\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json\.lock$/.exec(path);
	if (draftLock && draftLock[1] !== "archive" && draftLock[1].length <= 128) return true;
	const roots = [
		`${coordinates.base}/changes/${coordinates.change}/`,
		`${coordinates.base}/changes/archive/${coordinates.change}/`,
	];
	for (const prefix of roots) {
		if (!path.startsWith(prefix)) continue;
		const tail = path.slice(prefix.length);
		if (tail.startsWith(".phase-runs/")) return true;
		if (!tail.includes("/") && (PROCESS_FILES.has(tail) || tail.startsWith(".ein-verification-"))) return true;
	}
	return false;
}

function digestFile(path: string): string {
	const hash = createHash("sha256");
	const buffer = Buffer.allocUnsafe(64 * 1024);
	const descriptor = openSync(path, "r");
	try {
		for (;;) {
			const bytes = readSync(descriptor, buffer, 0, buffer.length, null);
			if (bytes === 0) break;
			hash.update(buffer.subarray(0, bytes));
		}
	} finally {
		closeSync(descriptor);
	}
	return hash.digest("hex");
}

function refFor(label: string, values: readonly unknown[]): string {
	const hash = createHash("sha256");
	hash.update(`${label}\n`);
	for (const value of values) hash.update(`${JSON.stringify(value)}\n`);
	return `${SHA256_PREFIX}${hash.digest("hex")}`;
}

function inside(root: string, target: string): boolean {
	const rel = relative(root, target);
	return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function failure(code: string, reason: string): VerificationSurfaceCapture {
	return { ok: false, code, reason };
}

export function captureVerificationSurface(cwd: string, changePath: string, ports: VerificationSurfacePorts): VerificationSurfaceCapture {
	let enumerated: VerificationGitEnumeration;
	try { enumerated = ports.enumerateGit(cwd); }
	catch (error) { return failure("git-unavailable", error instanceof Error ? error.message : String(error)); }
	if (!enumerated.ok) return failure(enumerated.code, enumerated.reason);

	let root: string;
	let canonicalChange: string;
	try {
		root = realpathSync(enumerated.root);
		canonicalChange = realpathSync(changePath);
		const stat = lstatSync(changePath);
		if (stat.isSymbolicLink() || !stat.isDirectory()) return failure("unsafe-change", "change path must be a regular canonical directory");
	} catch {
		return failure("unsafe-change", "change path is absent or unreadable");
	}
	if (!inside(root, canonicalChange)) return failure("unsafe-change", "change path escapes repository root");
	const coordinates = changeCoordinates(root, canonicalChange);
	if (!coordinates) return failure("unsafe-change", "change path is not a direct canonical or legacy change directory");

	const declaredKinds = new Map<string, VerificationGitEntry["kind"]>();
	for (const raw of enumerated.entries) {
		const path = normalizedRelative(raw.path);
		if (!path) return failure("invalid-git-entry", "Git returned an unsafe path");
		if (raw.kind !== "file" && raw.kind !== "gitlink") return failure("invalid-git-entry", "Git returned an unsupported entry kind");
		declaredKinds.set(path, raw.kind);
	}
	for (const previous of ports.previousEntries ?? []) {
		const path = normalizedRelative(previous.path);
		if (!path) return failure("invalid-previous-entry", "previous receipt contains an unsafe path");
		if (!declaredKinds.has(path)) declaredKinds.set(path, previous.kind === "gitlink" ? "gitlink" : "file");
	}
	const paths = [...declaredKinds.keys()].filter((path) => !isExcludedProcessPath(path, coordinates)).sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
	if (ports.limits?.maxEntries !== undefined && paths.length > ports.limits.maxEntries) return failure("limit-exceeded", "verification surface entry limit exceeded");
	const enumeratedPaths = new Set([...declaredKinds.keys()]);
	const entries: VerificationSurfaceEntry[] = [];
	for (const path of paths) {
		if (ports.limits?.isCancelled?.()) return failure("cancelled", "verification surface capture cancelled");
		const declaredKind = declaredKinds.get(path)!;
		if (declaredKind === "gitlink") return failure("unsupported-surface", `gitlink is not verifiable: ${path}`);
		const absolute = resolve(root, path);
		if (!inside(root, absolute)) return failure("invalid-git-entry", `path escapes repository root: ${path}`);
		try {
			const stat = lstatSync(absolute);
			if (stat.isSymbolicLink()) {
				const linkText = readlinkSync(absolute, "utf8");
				let target: string;
				try { target = realpathSync(absolute); } catch { return failure("symlink-unavailable", `symlink target is absent: ${path}`); }
				if (!inside(root, target)) return failure("symlink-unavailable", `symlink target escapes repository root: ${path}`);
				const targetPath = normalizedRelative(relative(root, target));
				if (!targetPath || !enumeratedPaths.has(targetPath)) return failure("symlink-unavailable", `symlink target is not part of the Git surface: ${path}`);
				entries.push({ path, kind: "symlink", executable: false, sha256: createHash("sha256").update(linkText).digest("hex") });
			} else if (stat.isFile()) {
				entries.push({ path, kind: "file", executable: (stat.mode & 0o111) !== 0, sha256: digestFile(absolute) });
			} else {
				return failure("unsupported-surface", `non-regular entry is not verifiable: ${path}`);
			}
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "ENOENT") entries.push({ path, kind: "file", executable: false, sha256: "missing" });
			else return failure("read-unavailable", `cannot read verification entry ${path}: ${code ?? "unknown"}`);
		}
	}

	const decisions = DECISION_FILES.map((name) => {
		const path = resolve(canonicalChange, name);
		try {
			const stat = lstatSync(path);
			if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("not-regular");
			return [name, digestFile(path)] as const;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [name, "missing"] as const;
			return [name, "unavailable"] as const;
		}
	});
	if (decisions.some((entry) => entry[1] === "unavailable")) return failure("decision-unavailable", "a verification decision artifact is unreadable");
	return {
		ok: true,
		root,
		surfaceRef: refFor("ein-verification-surface-v1", entries),
		decisionRef: refFor("ein-verification-decisions-v1", decisions),
		entries,
	};
}
