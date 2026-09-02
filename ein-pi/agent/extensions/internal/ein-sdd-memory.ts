// =============================================================================
// EIN SDD MEMORY
// Owns optional Engram lifecycle instances and the two artifact-gated saves.
// OpenSpec remains canonical; memory failures always degrade to receipts.
// =============================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	approveCandidate,
	type MemoryCandidate,
	type MemoryReceipt,
} from "../../lib/memory-contract.ts";
import { lintPhaseArtifact } from "../../lib/sdd-guardrails.ts";
import {
	buildCloseMemoryCandidate,
	safeMemoryReceipt,
	saveAfterArtifactGate,
	type SafeMemoryReceipt,
} from "../../lib/sdd-memory-save.ts";
import {
	createSddMemoryLifecycle,
	getSddPreflightPreferences,
	sddPreflightSessionKey,
	type MemoryPreparationLifecycle,
} from "../../lib/sdd-preflight.ts";

type MemorySaveLifecycle = {
	save(candidate: MemoryCandidate): Promise<{ receipt: MemoryReceipt }>;
};

const memoryLifecycleBySession = new Map<
	string,
	MemoryPreparationLifecycle & MemorySaveLifecycle
>();

function readMemoryLifecycle(
	ctx: ExtensionContext,
): MemoryPreparationLifecycle | undefined {
	const candidate = (ctx as unknown as { memoryLifecycle?: unknown }).memoryLifecycle;
	return typeof candidate === "object" && candidate !== null &&
		"prepare" in candidate &&
		typeof (candidate as { prepare?: unknown }).prepare === "function"
		? candidate as MemoryPreparationLifecycle
		: undefined;
}

export function memoryLifecycleForSession(
	ctx: ExtensionContext,
): MemoryPreparationLifecycle {
	const injected = readMemoryLifecycle(ctx);
	if (injected) return injected;
	const key = sddPreflightSessionKey(ctx);
	const existing = memoryLifecycleBySession.get(key);
	if (existing) return existing;
	const created = createSddMemoryLifecycle(ctx.cwd) as
		MemoryPreparationLifecycle & MemorySaveLifecycle;
	memoryLifecycleBySession.set(key, created);
	return created;
}

function readMemorySaveLifecycle(
	ctx: ExtensionContext,
): MemorySaveLifecycle | undefined {
	const candidate = (ctx as unknown as { memoryLifecycle?: unknown }).memoryLifecycle;
	return typeof candidate === "object" && candidate !== null &&
		"save" in candidate &&
		typeof (candidate as { save?: unknown }).save === "function"
		? candidate as MemorySaveLifecycle
		: undefined;
}

function memorySaveLifecycleForSession(
	ctx: ExtensionContext,
): MemorySaveLifecycle {
	const injected = readMemorySaveLifecycle(ctx);
	if (injected) return injected;
	return memoryLifecycleForSession(ctx) as
		MemoryPreparationLifecycle & MemorySaveLifecycle;
}

function memorySaveEnabled(ctx: ExtensionContext): boolean {
	const preferences = getSddPreflightPreferences(ctx);
	return Boolean(
		preferences &&
		preferences.engramAvailable &&
		preferences.memoryMode === "engram",
	);
}

export function skippedMemoryReceipt(
	reason: MemoryReceipt["reason"],
): MemoryReceipt {
	return {
		operation: "save",
		status: "skipped",
		reason,
		durationMs: 0,
		timestamp: new Date().toISOString(),
	};
}

export async function saveCheckedPhaseMemory(
	ctx: ExtensionContext,
	change: string,
	phase: unknown,
	candidateInput: unknown,
): Promise<SafeMemoryReceipt> {
	return saveAfterArtifactGate({
		artifactClean: true,
		change,
		phase,
		candidate: candidateInput,
		enabled: memorySaveEnabled(ctx),
		save: (candidate) => memorySaveLifecycleForSession(ctx).save(candidate),
	});
}

export async function saveArchivedCloseMemory(
	ctx: ExtensionContext,
	change: string,
	archiveDir: string,
): Promise<SafeMemoryReceipt> {
	let summary = "";
	try {
		summary = readFileSync(join(archiveDir, "summary.md"), "utf8");
	} catch {
		return safeMemoryReceipt(
			skippedMemoryReceipt("artifact_gate_failed"),
			`sdd:${change}:close`,
		);
	}
	if (lintPhaseArtifact("close", summary).errors > 0) {
		return safeMemoryReceipt(
			skippedMemoryReceipt("artifact_gate_failed"),
			`sdd:${change}:close`,
		);
	}
	const candidate = buildCloseMemoryCandidate(change);
	if (!approveCandidate(candidate).approved) {
		return safeMemoryReceipt(
			skippedMemoryReceipt("invalid_candidate"),
			`sdd:${change}:close`,
		);
	}
	if (!memorySaveEnabled(ctx)) {
		return safeMemoryReceipt(
			skippedMemoryReceipt("memory_disabled"),
			`sdd:${change}:close`,
		);
	}
	try {
		const result = await memorySaveLifecycleForSession(ctx).save(candidate);
		return safeMemoryReceipt(result.receipt, `sdd:${change}:close`);
	} catch {
		return safeMemoryReceipt({
			...skippedMemoryReceipt("spawn_error"),
			status: "failed",
		}, `sdd:${change}:close`);
	}
}
