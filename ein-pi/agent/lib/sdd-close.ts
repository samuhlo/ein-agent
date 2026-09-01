// =============================================================================
// [FLOW] SDD CLOSE (deterministic compaction)
// Cierra un cambio terminado: valida todos sus artefactos y conserva únicamente
// summary.md en openspec/changes/archive/<change>/. Los artefactos de fase son
// material de trabajo: al cerrar desaparecen y el resumen pasa a ser el registro
// duradero, legible y compacto del cambio.
// =============================================================================

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, renameSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { readSpecDeltaDeclaration } from "./sdd-guardrails.ts";
import {
	OUT_OF_FLOW_EVIDENCE_PATH,
	OUT_OF_FLOW_PROFILE,
	validateOutOfFlowReconciliation,
	type RepositoryStateIdentity,
	type ScopeOnlyRecordFacts,
	type ValidatedOutOfFlowReconciliation,
} from "./sdd-reconciliation.ts";
import { assessCloseReadiness } from "./sdd-close-readiness.ts";
import { isSafeChangeName, resolveChangesDir } from "./sdd-routing-core.ts";
import { resolveSddStatus } from "./sdd-routing-runtime.ts";

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

type CloseCompletion =
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

type CloseRecovery =
	| { handled: false }
	| { handled: true; error: string }
	| { handled: true; completion: CloseCompletion };

function normalizeLegacyReason(reason: string | undefined): string | null {
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
function recoverPendingCompaction(from: string, to: string, change: string, seam: CloseCompactionTestSeam): CloseRecovery {
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

function recoveredResult(from: string, to: string, completion: CloseCompletion): CloseResult {
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

function reconciliationRecord(cwd: string, change: string, from: string): ScopeOnlyRecordFacts {
	let artifacts: string[] = [];
	let readable = true;
	try { artifacts = readdirSync(from); } catch { readable = false; }
	const declaration = readSpecDeltaDeclaration(cwd, change);
	const scope = (() => { try { return readFileSync(join(from, "scope.md"), "utf8").replaceAll("\r\n", "\n"); } catch { return ""; } })();
	const blocks = [...scope.matchAll(/^## Spec delta declaration\nspec_delta: none\nspec_delta_reason: ([^\n]*)$/gm)];
	const status = resolveSddStatus(cwd, change).specState;
	if (blocks.length === 1 && declaration.mode === "none") {
		return { readable, artifacts, localDelta: false, specState: "none", declaration: { kind: "none", reason: blocks[0]![1] ?? "", count: 1 } };
	}
	const localDelta = artifacts.includes("specs");
	return {
		readable,
		artifacts,
		localDelta,
		specState: declaration.mode === "invalid" && status === "unresolved"
			? "declarationless"
			: status === "conflict" ? "conflicting" : status,
		declaration: declaration.mode === "invalid" ? { kind: "absent" } : { kind: "other", count: blocks.length },
	};
}

function currentRepositoryState(cwd: string, capturedAt: unknown): RepositoryStateIdentity | null {
	if (typeof capturedAt !== "string") return null;
	try {
		const git = (...args: string[]) => execFileSync("git", ["-C", cwd, ...args], {
			encoding: "utf8",
			timeout: 2_000,
			maxBuffer: 16 * 1024,
			shell: false,
		}).trim().toLowerCase();
		const head = git("rev-parse", "HEAD");
		const tree = git("rev-parse", "HEAD^{tree}");
		return /^[a-f0-9]{40,64}$/.test(head) && /^[a-f0-9]{40,64}$/.test(tree) ? { head, tree, capturedAt } : null;
	} catch { return null; }
}

function compactToArchive(
	from: string,
	to: string,
	change: string,
	completion: CloseCompletion,
	seam: CloseCompactionTestSeam,
): string | null {
	try {
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

const DURABLE_SUMMARY_SECTIONS = ["000", "001", "002", "003", "004", "005"] as const;

function assessDurableSummary(from: string, change: string): CloseBlocker | null {
	let text = "";
	try { text = readFileSync(join(from, "summary.md"), "utf8").replaceAll("\r\n", "\n"); }
	catch { return null; } // assessCloseReadiness owns the missing/unreadable case.

	// CORTE -> los metadatos solo se leen de la cabecera (lo anterior a la primera
	// sección). El cuerpo cita el verify-report, y `status: pass` dentro de
	// `// 004` sobrescribía el `status: complete` declarado arriba: un resumen
	// correcto bloqueaba su propio cierre.
	const header = text.split(/^## /m)[0] ?? "";
	const fields = new Map(
		header.split("\n").flatMap((line) => {
			const match = /^([a-z_]+):\s*(.*?)\s*$/.exec(line);
			return match ? [[match[1]!, match[2]!] as const] : [];
		}),
	);
	const groups = Number(fields.get("work_groups"));
	const missingSections = DURABLE_SUMMARY_SECTIONS.filter((section) => !new RegExp(`^## // ${section}\\.`, "m").test(text));
	const valid = fields.get("status") === "complete"
		&& fields.get("change") === change
		&& Number.isInteger(groups)
		&& groups > 0
		&& fields.get("verification_status") === "pass"
		&& /^\s*-\s*verify\s*:\s*`[^`]+`\s*$/im.test(text)
		&& missingSections.length === 0;
	return valid
		? null
		: {
			code: "summary-contract-invalid",
			message: "summary.md debe declarar status/change/work_groups/verification_status, las secciones // 000..005 y al menos un comando `- verify:` exacto.",
		};
}

function assessReconciliationClose(cwd: string, change: string, from: string, to: string, options: CloseOptions): { blockers: CloseBlocker[]; reconciliation?: ValidatedOutOfFlowReconciliation } {
	const blockers: CloseBlocker[] = [];
	const add = (blocker: CloseBlocker): void => { if (!blockers.some((item) => item.code === blocker.code)) blockers.push(blocker); };
	if (options.force) add({ code: "reconciliation-mixed-mode", message: "force and reconciliation cannot be combined." });
	if (existsSync(to)) add({ code: "archive-collision", message: "The archive destination already exists." });

	const expectedPath = canonicalEvidencePath(cwd, change);
	const pathIsCanonical = options.reconciliationEvidencePath === expectedPath;
	if (!pathIsCanonical) add({ code: "reconciliation-evidence-path-invalid", message: "Only the canonical reconciliation evidence path is accepted." });
	const evidencePath = join(from, OUT_OF_FLOW_EVIDENCE_PATH);
	const evidence = pathIsCanonical ? readJson(evidencePath) : null;
	const summaryPath = join(from, "summary.md");
	let summaryText = "";
	let summaryFresh = false;
	try {
		summaryText = readFileSync(summaryPath, "utf8");
		summaryFresh = statSync(summaryPath).mtimeMs >= statSync(join(from, "scope.md")).mtimeMs;
	} catch { /* validator reports the summary blocker */ }
	const evidenceState = evidence && typeof evidence === "object" && "repositoryState" in evidence
		? (evidence as { repositoryState?: { capturedAt?: unknown } }).repositoryState
		: undefined;
	const readiness = assessCloseReadiness(cwd, change, { reconciliationProfile: options.reconciliationProfile });
	for (const blocker of readiness.reconciliationBlockers) add(blocker);
	const validation = validateOutOfFlowReconciliation({
		profile: options.reconciliationProfile,
		change,
		auditReason: options.legacyReason,
		now: new Date().toISOString(),
		record: reconciliationRecord(cwd, change, from),
		summary: {
			path: "summary.md",
			sha256: createHash("sha256").update(summaryText).digest("hex"),
			bytes: Buffer.byteLength(summaryText, "utf8"),
			text: summaryText,
			fresh: summaryFresh,
		},
		currentRepositoryState: currentRepositoryState(cwd, evidenceState?.capturedAt),
		evidence,
	});
	if (!validation.ok) for (const blocker of validation.blockers) add(blocker);
	return blockers.length === 0 && validation.ok ? { blockers, reconciliation: validation.reconciliation } : { blockers };
}

// `archive/` conserva el registro duradero; los artefactos intermedios existen
// únicamente mientras el cambio está activo.
export function closeChange(
	cwd: string,
	change: string,
	options: CloseOptions = {},
	seam: CloseCompactionTestSeam = {},
): CloseResult {
	const from = join(changesDir(cwd), change);
	const to = closedChangePath(cwd, change);

	if (!isSafeChangeName(change)) {
		return { ok: false, from, to, reason: "nombre de cambio inválido" };
	}
	const recovery = recoverPendingCompaction(from, to, change, seam);
	if (recovery.handled) {
		return "error" in recovery
			? { ok: false, from, to, reason: recovery.error }
			: recoveredResult(from, to, recovery.completion);
	}
	if (!existsSync(from)) {
		return { ok: false, from, to, reason: "el cambio no existe en el directorio de cambios" };
	}
	const reconciliationRequested = options.reconciliationProfile !== undefined || options.reconciliationEvidencePath !== undefined;
	if (reconciliationRequested) {
		const assessment = assessReconciliationClose(cwd, change, from, to, options);
		if (assessment.blockers.length > 0 || assessment.reconciliation === undefined) {
			return {
				ok: false,
				from,
				to,
				reason: `reconciliation denied: ${assessment.blockers.map((blocker) => blocker.message).join(" ")}`,
				blockers: assessment.blockers,
			};
		}
		mkdirSync(join(changesDir(cwd), "archive"), { recursive: true });
		const moveError = compactToArchive(from, to, change, { kind: "reconciliation", receipt: assessment.reconciliation }, seam);
		return moveError === null
			? { ok: true, from, to, reconciliation: assessment.reconciliation }
			: { ok: false, from, to, reason: moveError };
	}
	if (existsSync(to)) {
		return { ok: false, from, to, reason: "ya existe en archive/; no se pisa" };
	}
	const readiness = assessCloseReadiness(cwd, change);
	const summaryContractBlocker = assessDurableSummary(from, change);
	const escapeEligible = readiness.legacyEligibility === "declarationless-record";
	const readinessBlockers = summaryContractBlocker ? [...readiness.blockers, summaryContractBlocker] : [...readiness.blockers];
	const nonEscapeBlockers = readinessBlockers.filter((blocker) => blocker.code !== "spec-unresolved");
	const legacyReason = normalizeLegacyReason(options.legacyReason);
	const usesLegacyEscape = options.force && escapeEligible && nonEscapeBlockers.length === 0 && legacyReason !== null;

	if ((!readiness.ready || summaryContractBlocker !== null) && !usesLegacyEscape) {
		const blockers: CloseBlocker[] = [...readinessBlockers];
		if (options.force && escapeEligible && nonEscapeBlockers.length === 0 && legacyReason === null) {
			blockers.push({ code: "legacy-reason-invalid", message: "--force para un registro legacy requiere una razón de auditoría válida." });
		}
		return {
			ok: false,
			from,
			to,
			reason: `cambio no listo para cierre: ${blockers.map((blocker) => blocker.message).join(" ")}`,
			blockers,
		};
	}

	mkdirSync(join(changesDir(cwd), "archive"), { recursive: true });
	const completion: CloseCompletion = usesLegacyEscape
		? { kind: "legacy", reason: legacyReason! }
		: { kind: "normal" };
	const moveError = compactToArchive(from, to, change, completion, seam);
	if (moveError !== null) return { ok: false, from, to, reason: moveError };
	return usesLegacyEscape
		? {
			ok: true,
			from,
			to,
			legacyEscape: {
				used: true,
				priorSpecState: "unresolved",
				eligibility: "declarationless-record",
				reason: legacyReason!,
			},
		}
		: { ok: true, from, to };
}
