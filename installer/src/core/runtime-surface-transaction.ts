import { randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { InstallTarget } from "./install-plan.ts";
import {
	classifyLegacyRuntimeArtifact,
	legacyRuntimeArtifactInventory,
	observeLegacyRuntimeArtifact,
	type LegacyRuntimeArtifact,
} from "./legacy-runtime-artifacts.ts";

type RuntimeArtifactId = LegacyRuntimeArtifact["id"];
type EntryStatus = "pending" | "moving" | "moved" | "restoring" | "restored";
type ManifestState = "preparing" | "quarantined" | "rolling-back" | "rolled-back" | "committed";

type RuntimeSurfaceManifestEntry = {
	id: RuntimeArtifactId;
	runtime: LegacyRuntimeArtifact["runtime"];
	originalPath: string;
	recoveryPath: string;
	sha256: string;
	mode: number;
	status: EntryStatus;
};

type RuntimeSurfaceManifest = {
	schemaVersion: 2;
	transactionId: string;
	home: string;
	target: InstallTarget;
	state: ManifestState;
	entries: RuntimeSurfaceManifestEntry[];
	collisions: RuntimeArtifactId[];
	absent: RuntimeArtifactId[];
};

export type RuntimeSurfaceRetirementResult = Readonly<{
	retired: readonly RuntimeArtifactId[];
	collisions: readonly RuntimeArtifactId[];
	absent: readonly RuntimeArtifactId[];
	transactionId?: string;
	recoveryDirectory?: string;
}>;

export type RuntimeSurfaceRetirementOptions = Readonly<{
	home: string;
	target: InstallTarget;
	validatedCurrentArtifacts: true;
	claudeMarkerVersion?: string | null;
	transactionId?: string;
	fault?: (point: string) => void;
}>;

export type RuntimeSurfaceRetirementActionOptions = Readonly<{
	home: string;
	target: InstallTarget;
	transactionId: string;
	fault?: (point: string) => void;
}>;

export type RuntimeSurfaceRetirementCommitOptions = RuntimeSurfaceRetirementActionOptions & Readonly<{
	globalCommit: true;
}>;

const TRANSACTION_ID = /^[a-zA-Z0-9-]{8,64}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function selectedRuntime(target: InstallTarget, runtime: LegacyRuntimeArtifact["runtime"]): boolean {
	return target === "both" || target === runtime;
}

function assertTransactionId(transactionId: string): void {
	if (!TRANSACTION_ID.test(transactionId)) throw new Error("invalid-runtime-surface-transaction-id");
}

function recoveryRoot(home: string, transactionId: string): string {
	return join(home, ".ein-installer", "runtime-surface-recovery", transactionId);
}

function assertExactDescendant(base: string, candidate: string): void {
	const lexicalBase = resolve(base);
	const lexicalCandidate = resolve(candidate);
	const suffix = relative(lexicalBase, lexicalCandidate);
	if (suffix === "" || suffix === ".." || suffix.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
		throw new Error("runtime-surface-path-outside-private-root");
	}
	const canonicalBase = realpathSync(lexicalBase);
	const canonicalCandidate = realpathSync(lexicalCandidate);
	if (canonicalCandidate !== resolve(canonicalBase, suffix)) {
		throw new Error("runtime-surface-path-symlink-escape");
	}
}

function assertRecoveryRoot(home: string, root: string): void {
	assertExactDescendant(home, root);
}

function syncPath(path: string): void {
	const descriptor = openSync(path, "r");
	try {
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}

function manifestPath(root: string): string {
	return join(root, "manifest.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function selectedInventory(home: string, target: InstallTarget): readonly LegacyRuntimeArtifact[] {
	return legacyRuntimeArtifactInventory(home).filter((artifact) => selectedRuntime(target, artifact.runtime));
}

function validateManifest(
	value: unknown,
	options: RuntimeSurfaceRetirementActionOptions,
	root: string,
): RuntimeSurfaceManifest {
	if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "transactionId", "home", "target", "state", "entries", "collisions", "absent"])) {
		throw new Error("invalid-runtime-surface-manifest");
	}
	if (
		value.schemaVersion !== 2
		|| value.transactionId !== options.transactionId
		|| value.home !== resolve(options.home)
		|| value.target !== options.target
		|| !["preparing", "quarantined", "rolling-back", "rolled-back", "committed"].includes(value.state as string)
		|| !Array.isArray(value.entries)
		|| !Array.isArray(value.collisions)
		|| !Array.isArray(value.absent)
	) {
		throw new Error("invalid-runtime-surface-manifest");
	}

	const inventory = selectedInventory(options.home, options.target);
	const expectedById = new Map(inventory.map((artifact) => [artifact.id, artifact]));
	const seen = new Set<RuntimeArtifactId>();
	for (const rawEntry of value.entries) {
		if (!isRecord(rawEntry) || !exactKeys(rawEntry, ["id", "runtime", "originalPath", "recoveryPath", "sha256", "mode", "status"])) {
			throw new Error("invalid-runtime-surface-manifest");
		}
		const artifact = expectedById.get(rawEntry.id as RuntimeArtifactId);
		if (
			!artifact
			|| seen.has(artifact.id)
			|| rawEntry.runtime !== artifact.runtime
			|| rawEntry.originalPath !== resolve(artifact.path)
			|| rawEntry.recoveryPath !== join(root, "files", artifact.id)
			|| typeof rawEntry.sha256 !== "string"
			|| !SHA256.test(rawEntry.sha256)
			|| !Number.isInteger(rawEntry.mode)
			|| (rawEntry.mode as number) < 0
			|| (rawEntry.mode as number) > 0o777
			|| !["pending", "moving", "moved", "restoring", "restored"].includes(rawEntry.status as string)
		) {
			throw new Error("invalid-runtime-surface-manifest");
		}
		seen.add(artifact.id);
	}

	for (const list of [value.collisions, value.absent]) {
		for (const id of list) {
			if (typeof id !== "string" || !expectedById.has(id as RuntimeArtifactId) || seen.has(id as RuntimeArtifactId)) {
				throw new Error("invalid-runtime-surface-manifest");
			}
			seen.add(id as RuntimeArtifactId);
		}
	}
	if (seen.size !== inventory.length) throw new Error("invalid-runtime-surface-manifest");
	return value as RuntimeSurfaceManifest;
}

function readManifest(options: RuntimeSurfaceRetirementActionOptions, root: string): RuntimeSurfaceManifest {
	assertRecoveryRoot(options.home, root);
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(manifestPath(root), "utf8"));
	} catch {
		throw new Error("invalid-runtime-surface-manifest");
	}
	return validateManifest(value, options, root);
}

function publishManifest(
	manifest: RuntimeSurfaceManifest,
	options: RuntimeSurfaceRetirementActionOptions,
	root: string,
): RuntimeSurfaceManifest {
	validateManifest(manifest, options, root);
	const temporary = join(root, `.manifest-${process.pid}-${randomUUID()}.tmp`);
	writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
	syncPath(temporary);
	renameSync(temporary, manifestPath(root));
	syncPath(root);
	return readManifest(options, root);
}

function fileState(path: string): "missing" | "file" | "other" {
	try {
		return lstatSync(path).isFile() ? "file" : "other";
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
		throw error;
	}
}

function verifyEntryFile(entry: RuntimeSurfaceManifestEntry, location: "original" | "recovery", root: string, home: string): void {
	const path = location === "original" ? entry.originalPath : entry.recoveryPath;
	assertExactDescendant(location === "original" ? home : root, path);
	const stats = lstatSync(path);
	if (!stats.isFile() || (stats.mode & 0o777) !== entry.mode) throw new Error(`runtime-surface-${location}-metadata-mismatch:${entry.id}`);
	const sha256 = new Bun.CryptoHasher("sha256").update(readFileSync(path)).digest("hex");
	if (sha256 !== entry.sha256) throw new Error(`runtime-surface-${location}-content-mismatch:${entry.id}`);
}

function resultFromManifest(manifest: RuntimeSurfaceManifest, root: string): RuntimeSurfaceRetirementResult {
	return {
		retired: manifest.entries.map((entry) => entry.id),
		collisions: [...manifest.collisions],
		absent: [...manifest.absent],
		transactionId: manifest.transactionId,
		recoveryDirectory: root,
	};
}

function reconcilePreparingEntry(
	manifest: RuntimeSurfaceManifest,
	entry: RuntimeSurfaceManifestEntry,
	options: RuntimeSurfaceRetirementActionOptions,
	root: string,
): void {
	const original = fileState(entry.originalPath);
	const recovery = fileState(entry.recoveryPath);
	if (original === "other" || recovery === "other") throw new Error(`runtime-surface-reentry-collision:${entry.id}`);
	if (original === "file" && recovery === "missing") {
		verifyEntryFile(entry, "original", root, options.home);
		if (entry.status !== "pending") {
			entry.status = "pending";
			publishManifest(manifest, options, root);
		}
		return;
	}
	if (original === "missing" && recovery === "file") {
		verifyEntryFile(entry, "recovery", root, options.home);
		if (entry.status !== "moved") {
			entry.status = "moved";
			publishManifest(manifest, options, root);
		}
		return;
	}
	throw new Error(`runtime-surface-reentry-ambiguous:${entry.id}`);
}

function continuePreparation(
	manifest: RuntimeSurfaceManifest,
	options: RuntimeSurfaceRetirementActionOptions,
	root: string,
): RuntimeSurfaceRetirementResult {
	if (manifest.state === "quarantined" || manifest.state === "committed") return resultFromManifest(manifest, root);
	if (manifest.state !== "preparing") throw new Error(`runtime-surface-transaction-not-preparable:${manifest.state}`);
	for (const entry of manifest.entries) {
		reconcilePreparingEntry(manifest, entry, options, root);
		if (entry.status === "moved") continue;
		entry.status = "moving";
		publishManifest(manifest, options, root);
		options.fault?.(`before-move:${entry.id}`);
		mkdirSync(dirname(entry.recoveryPath), { recursive: true, mode: 0o700 });
		assertExactDescendant(root, dirname(entry.recoveryPath));
		renameSync(entry.originalPath, entry.recoveryPath);
		options.fault?.(`after-rename-before-publish:${entry.id}`);
		entry.status = "moved";
		publishManifest(manifest, options, root);
		options.fault?.(`after-move:${entry.id}`);
	}
	manifest.state = "quarantined";
	publishManifest(manifest, options, root);
	return resultFromManifest(manifest, root);
}

function removeRecoveryRoot(home: string, root: string): void {
	assertRecoveryRoot(home, root);
	rmSync(root, { recursive: true, force: true });
}

export function rollbackRuntimeSurfaceRetirement(options: RuntimeSurfaceRetirementActionOptions): void {
	assertTransactionId(options.transactionId);
	const root = recoveryRoot(options.home, options.transactionId);
	if (!existsSync(root)) return;
	const manifest = readManifest(options, root);
	if (manifest.state === "committed") throw new Error("runtime-surface-retirement-already-committed");
	if (manifest.state === "rolled-back") {
		removeRecoveryRoot(options.home, root);
		return;
	}
	manifest.state = "rolling-back";
	publishManifest(manifest, options, root);
	for (const entry of [...manifest.entries].reverse()) {
		const original = fileState(entry.originalPath);
		const recovery = fileState(entry.recoveryPath);
		if (original === "other" || recovery === "other") throw new Error(`runtime-surface-rollback-collision:${entry.id}`);
		if (original === "file" && recovery === "missing") {
			verifyEntryFile(entry, "original", root, options.home);
			entry.status = "restored";
			publishManifest(manifest, options, root);
			continue;
		}
		if (original !== "missing" || recovery !== "file") throw new Error(`runtime-surface-rollback-ambiguous:${entry.id}`);
		verifyEntryFile(entry, "recovery", root, options.home);
		assertExactDescendant(options.home, dirname(entry.originalPath));
		entry.status = "restoring";
		publishManifest(manifest, options, root);
		options.fault?.(`before-restore:${entry.id}`);
		renameSync(entry.recoveryPath, entry.originalPath);
		options.fault?.(`after-rename-before-restore-publish:${entry.id}`);
		entry.status = "restored";
		publishManifest(manifest, options, root);
		options.fault?.(`after-restore:${entry.id}`);
	}
	manifest.state = "rolled-back";
	publishManifest(manifest, options, root);
	removeRecoveryRoot(options.home, root);
}

export function finalizeRuntimeSurfaceRetirement(options: RuntimeSurfaceRetirementCommitOptions): void {
	if (options.globalCommit !== true) throw new Error("runtime-surface-global-commit-required");
	assertTransactionId(options.transactionId);
	const root = recoveryRoot(options.home, options.transactionId);
	if (!existsSync(root)) return;
	const manifest = readManifest(options, root);
	if (manifest.state !== "quarantined" && manifest.state !== "committed") {
		throw new Error(`runtime-surface-transaction-not-committable:${manifest.state}`);
	}
	if (manifest.state !== "committed") {
		manifest.state = "committed";
		publishManifest(manifest, options, root);
		options.fault?.("after-global-commit-publish");
	}
	removeRecoveryRoot(options.home, root);
}

export function runtimeSurfaceRetirementTarget(options: { home: string; transactionId: string }): InstallTarget | null {
	assertTransactionId(options.transactionId);
	const root = recoveryRoot(options.home, options.transactionId);
	if (!existsSync(root)) return null;
	assertRecoveryRoot(options.home, root);
	let candidate: unknown;
	try {
		candidate = (JSON.parse(readFileSync(manifestPath(root), "utf8")) as { target?: unknown }).target;
	} catch {
		throw new Error("invalid-runtime-surface-manifest");
	}
	if (candidate !== "pi" && candidate !== "claude" && candidate !== "both") throw new Error("invalid-runtime-surface-manifest");
	return readManifest({ ...options, target: candidate }, root).target;
}

export function rollbackRuntimeSurfaceRetirementByTransaction(options: { home: string; transactionId: string }): void {
	const target = runtimeSurfaceRetirementTarget(options);
	if (target) rollbackRuntimeSurfaceRetirement({ ...options, target });
}

export function finalizeRuntimeSurfaceRetirementByTransaction(options: { home: string; transactionId: string; globalCommit: true }): void {
	if (options.globalCommit !== true) throw new Error("runtime-surface-global-commit-required");
	const target = runtimeSurfaceRetirementTarget(options);
	if (target) finalizeRuntimeSurfaceRetirement({ ...options, target });
}

export function retireOwnedLegacyRuntimeArtifacts(
	options: RuntimeSurfaceRetirementOptions,
): RuntimeSurfaceRetirementResult {
	if (options.validatedCurrentArtifacts !== true) throw new Error("current-surfaces-not-validated");
	const transactionId = options.transactionId ?? randomUUID();
	assertTransactionId(transactionId);
	const actionOptions = { home: options.home, target: options.target, transactionId, fault: options.fault };
	const root = recoveryRoot(options.home, transactionId);
	if (existsSync(root)) {
		if (!existsSync(manifestPath(root))) throw new Error("runtime-surface-recovery-manifest-missing");
		const manifest = readManifest(actionOptions, root);
		try {
			return continuePreparation(manifest, actionOptions, root);
		} catch (error) {
			try {
				rollbackRuntimeSurfaceRetirement(actionOptions);
			} catch (rollbackError) {
				throw new AggregateError([error, rollbackError], "runtime-surface-reentry-and-rollback-failed");
			}
			throw error;
		}
	}

	const entries: RuntimeSurfaceManifestEntry[] = [];
	const collisions: RuntimeArtifactId[] = [];
	const absent: RuntimeArtifactId[] = [];
	for (const artifact of selectedInventory(options.home, options.target)) {
		const markerVersion = artifact.runtime === "claude" ? options.claudeMarkerVersion ?? null : null;
		const observation = observeLegacyRuntimeArtifact(artifact, markerVersion);
		const classification = classifyLegacyRuntimeArtifact(artifact, observation);
		if (classification.status === "collision") {
			collisions.push(artifact.id);
			continue;
		}
		if (classification.status === "absent") {
			absent.push(artifact.id);
			continue;
		}
		if (!observation.sha256) throw new Error(`runtime-surface-owned-hash-missing:${artifact.id}`);
		entries.push({
			id: artifact.id,
			runtime: artifact.runtime,
			originalPath: resolve(artifact.path),
			recoveryPath: join(root, "files", artifact.id),
			sha256: observation.sha256,
			mode: lstatSync(artifact.path).mode & 0o777,
			status: "pending",
		});
	}
	if (entries.length === 0) return { retired: [], collisions, absent };

	mkdirSync(join(root, "files"), { recursive: true, mode: 0o700 });
	assertRecoveryRoot(options.home, root);
	const manifest: RuntimeSurfaceManifest = {
		schemaVersion: 2,
		transactionId,
		home: resolve(options.home),
		target: options.target,
		state: "preparing",
		entries,
		collisions,
		absent,
	};
	try {
		publishManifest(manifest, actionOptions, root);
	} catch (error) {
		removeRecoveryRoot(options.home, root);
		throw error;
	}
	try {
		return continuePreparation(manifest, actionOptions, root);
	} catch (error) {
		try {
			rollbackRuntimeSurfaceRetirement(actionOptions);
		} catch (rollbackError) {
			throw new AggregateError([error, rollbackError], "runtime-surface-prepare-and-rollback-failed");
		}
		throw error;
	}
}
