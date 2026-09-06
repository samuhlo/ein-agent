// =============================================================================
// SDD CLOSE COMPACTION — RECOVERABLE FILESYSTEM TRANSACTION
// Promueve un cambio al archivo, conserva una marca de recuperación y poda los
// artefactos intermedios sin adoptar destinos ajenos.
// =============================================================================

import { createHash } from "node:crypto";
import { existsSync, lstatSync, renameSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
	OUT_OF_FLOW_EVIDENCE_PATH,
	OUT_OF_FLOW_PROFILE,
	type ValidatedOutOfFlowReconciliation,
} from "./sdd-reconciliation.ts";
import { resolveChangesDir } from "./sdd-routing-core.ts";

export type CloseBlocker = { code: string; message: string };

export type CloseResult = {
	ok: boolean;
	from: string;
	to: string;
	reason?: string;
	blockers?: CloseBlocker[];
	legacyEscape?: {
		used: true;
		priorSpecState: "unresolved";
		eligibility: "declarationless-record";
		reason: string;
	};
	reconciliation?: ValidatedOutOfFlowReconciliation;
};

export type CloseOptions = {
	force?: boolean;
	legacyReason?: string;
	reconciliationProfile?: string;
	reconciliationEvidencePath?: string;
};

/** Permite interrumpir la poda en tests sin depender de permisos del sistema. */
export type CloseCompactionTestSeam = Readonly<{
	removeEntry?: (path: string) => void;
}>;

const INVALID_LEGACY_REASONS = new Set(["none", "n/a", "na", "tbd", "unknown", "-"]);
const CLOSE_PENDING_FILE = ".ein-close-pending.json";
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY_ID = /^[a-f0-9]{40,64}$/;

export type CloseCompletion =
	| { kind: "normal" }
	| { kind: "legacy"; reason: string }
	| { kind: "reconciliation"; receipt: ValidatedOutOfFlowReconciliation };

type PendingCloseRecord = {
	version: 1;
	change: string;
	summarySha256: string;
	completion: CloseCompletion;
};

type PendingCloseInspection =
	| { kind: "absent" }
	| { kind: "invalid" }
	| { kind: "valid"; record: PendingCloseRecord };

export type CloseRecovery =
	| { handled: false }
	| { handled: true; error: string }
	| { handled: true; completion: CloseCompletion };

export function normalizeLegacyReason(reason: string | undefined): string | null {
	const normalized = reason?.trim();
	if (!normalized || normalized.length > 200 || INVALID_LEGACY_REASONS.has(normalized.toLowerCase())) return null;
	return normalized;
}

// Misma resolución dual que el router: openspec/changes/ o .sdd/changes/.
function changesDir(cwd: string): string {
	return resolveChangesDir(cwd);
}

export function closedChangePath(cwd: string, change: string): string {
	return join(changesDir(cwd), "archive", change);
}

function canonicalEvidencePath(cwd: string, change: string): string {
	return relative(cwd, join(changesDir(cwd), change, OUT_OF_FLOW_EVIDENCE_PATH)).replaceAll("\\", "/");
}

function readJson(path: string): unknown {
	try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarySha256(path: string): string {
	if (!lstatSync(path).isFile()) throw new Error("summary.md debe ser un fichero regular");
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseReconciliationReceipt(value: unknown, change: string): ValidatedOutOfFlowReconciliation | null {
	if (!isObject(value) || value.profile !== OUT_OF_FLOW_PROFILE || value.change !== change || value.evidencePath !== OUT_OF_FLOW_EVIDENCE_PATH) return null;
	const summary = value.summary;
	const repositoryState = value.repositoryState;
	const checkIds = value.checkIds;
	if (!isObject(summary) || summary.path !== "summary.md" || !SHA256.test(String(summary.sha256 ?? ""))
		|| !Number.isInteger(summary.bytes) || Number(summary.bytes) < 0) return null;
	if (!isObject(repositoryState) || !REPOSITORY_ID.test(String(repositoryState.head ?? ""))
		|| !REPOSITORY_ID.test(String(repositoryState.tree ?? ""))
		|| typeof repositoryState.capturedAt !== "string" || Number.isNaN(Date.parse(repositoryState.capturedAt))) return null;
	if (!Array.isArray(checkIds) || checkIds.length === 0 || !checkIds.every((id) => typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) return null;
	const reason = normalizeLegacyReason(typeof value.reason === "string" ? value.reason : undefined);
	return reason ? {
		profile: OUT_OF_FLOW_PROFILE,
		change,
		reason,
		evidencePath: OUT_OF_FLOW_EVIDENCE_PATH,
		summary: { path: "summary.md", sha256: String(summary.sha256), bytes: Number(summary.bytes) },
		repositoryState: {
			head: String(repositoryState.head),
			tree: String(repositoryState.tree),
			capturedAt: repositoryState.capturedAt,
		},
		checkIds: [...checkIds],
	} : null;
}

function parseCompletion(value: unknown, change: string): CloseCompletion | null {
	if (!isObject(value)) return null;
	if (value.kind === "normal") return { kind: "normal" };
	if (value.kind === "legacy") {
		const reason = normalizeLegacyReason(typeof value.reason === "string" ? value.reason : undefined);
		return reason ? { kind: "legacy", reason } : null;
	}
	if (value.kind === "reconciliation") {
		const receipt = parseReconciliationReceipt(value.receipt, change);
		return receipt ? { kind: "reconciliation", receipt } : null;
	}
	return null;
}

function inspectPendingClose(dir: string, change: string): PendingCloseInspection {
	const path = join(dir, CLOSE_PENDING_FILE);
	const dirStats = lstatSync(dir, { throwIfNoEntry: false });
	if (!dirStats) return { kind: "absent" };
	if (!dirStats.isDirectory()) return { kind: "invalid" };
	const markerStats = lstatSync(path, { throwIfNoEntry: false });
	if (!markerStats) return { kind: "absent" };
	if (!markerStats.isFile()) return { kind: "invalid" };
	const value = readJson(path);
	if (!isObject(value) || value.version !== 1 || value.change !== change || !SHA256.test(String(value.summarySha256 ?? ""))) return { kind: "invalid" };
	const completion = parseCompletion(value.completion, change);
	return completion
		? { kind: "valid", record: { version: 1, change, summarySha256: String(value.summarySha256), completion } }
		: { kind: "invalid" };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function prunePromotedChange(to: string, record: PendingCloseRecord, seam: CloseCompactionTestSeam): string | null {
	try {
		if (summarySha256(join(to, "summary.md")) !== record.summarySha256) throw new Error("el resumen archivado no coincide con la marca de recuperación");
		const removeEntry = seam.removeEntry ?? ((path: string) => rmSync(path, { recursive: true, force: true }));
		for (const entry of readdirSync(to).sort()) {
			if (entry !== "summary.md" && entry !== CLOSE_PENDING_FILE) removeEntry(join(to, entry));
		}
		const durableEntries = readdirSync(to).filter((entry) => entry !== CLOSE_PENDING_FILE);
		if (durableEntries.length !== 1 || durableEntries[0] !== "summary.md") throw new Error("el archivo no pudo reducirse a summary.md");
		removeEntry(join(to, CLOSE_PENDING_FILE));
		return null;
	} catch (error) {
		return errorMessage(error);
	}
}

// RECUPERACIÓN -> la marca se retira al final, así que cualquier interrupción
// conserva suficiente procedencia para continuar sin adoptar una colisión ajena.
export function recoverPendingCompaction(from: string, to: string, change: string, seam: CloseCompactionTestSeam): CloseRecovery {
	const archived = inspectPendingClose(to, change);
	if (archived.kind !== "absent") {
		if (archived.kind === "invalid") return { handled: true, error: "archive/ contiene una marca de cierre inválida" };
		if (existsSync(from)) return { handled: true, error: "el cierre pendiente conserva origen y destino; se requiere revisión manual" };
		const error = prunePromotedChange(to, archived.record, seam);
		return error === null ? { handled: true, completion: archived.record.completion } : { handled: true, error };
	}

	const active = inspectPendingClose(from, change);
	if (active.kind === "absent") return { handled: false };
	if (active.kind === "invalid") return { handled: true, error: "el cambio activo contiene una marca de cierre inválida" };
	if (existsSync(to)) return { handled: true, error: "ya existe en archive/; no se pisa" };
	try {
		renameSync(from, to);
	} catch (error) {
		return { handled: true, error: errorMessage(error) };
	}
	const error = prunePromotedChange(to, active.record, seam);
	return error === null ? { handled: true, completion: active.record.completion } : { handled: true, error };
}

export function recoveredResult(from: string, to: string, completion: CloseCompletion): CloseResult {
	if (completion.kind === "legacy") {
		return {
			ok: true,
			from,
			to,
			legacyEscape: {
				used: true,
				priorSpecState: "unresolved",
				eligibility: "declarationless-record",
				reason: completion.reason,
			},
		};
	}
	return completion.kind === "reconciliation"
		? { ok: true, from, to, reconciliation: completion.receipt }
		: { ok: true, from, to };
}

function retainTerminalEvidence(from: string): void {
	const summaryPath = join(from, "summary.md");
	summarySha256(summaryPath);
	const marker = "\n<!-- ein:terminal-evidence -->\n";
	let summary = readFileSync(summaryPath, "utf8").split(marker)[0]!;
	const sections: string[] = [];
	for (const name of ["apply-progress.md", "verify-report.md", "sync-report.md"]) {
		const path = join(from, name);
		if (!existsSync(path)) continue;
		if (!lstatSync(path).isFile()) throw new Error(`${name} debe ser un fichero regular para conservar su evidencia`);
		const content = readFileSync(path, "utf8");
		const anchor = `ein-evidence-${name.replace(".md", "")}`;
		summary = summary.replaceAll(`](${name})`, `](#${anchor})`);
		// A longer fence preserves reports containing their own fenced commands.
		const longest = Math.max(2, ...[...content.matchAll(/`+/g)].map((match) => match[0].length));
		const fence = "`".repeat(longest + 1);
		sections.push(`<a id="${anchor}"></a>\n\n### ${name}\n\n${fence}text\n${content.trimEnd()}\n${fence}`);
	}
	if (sections.length) writeFileSync(summaryPath, `${summary.trimEnd()}${marker}\n## Evidencia conservada\n\nLos informes citados se conservan íntegros a continuación; los archivos intermedios se compactan al cerrar.\n\n${sections.join("\n\n")}\n`);
}

export function compactToArchive(
	from: string,
	to: string,
	change: string,
	completion: CloseCompletion,
	seam: CloseCompactionTestSeam,
): string | null {
	try {
		// Reconciliation already binds a reviewed summary hash and has no SDD
		// phase reports. Normal closure keeps evidence before deleting originals.
		if (completion.kind !== "reconciliation") retainTerminalEvidence(from);
		const record: PendingCloseRecord = {
			version: 1,
			change,
			summarySha256: summarySha256(join(from, "summary.md")),
			completion,
		};
		writeFileSync(join(from, CLOSE_PENDING_FILE), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
		renameSync(from, to);
		return prunePromotedChange(to, record, seam);
	} catch (error) {
		return errorMessage(error);
	}
}
