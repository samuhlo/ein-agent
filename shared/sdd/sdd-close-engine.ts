// =============================================================================
// SDD CLOSE ENGINE — SHARED COMPOSITION
// Decide el modo de cierre y coordina la transacción; routing, readiness, Git
// y reloj llegan como capacidades explícitas del runtime.
// =============================================================================

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
	compactToArchive,
	closedChangePath,
	normalizeLegacyReason,
	recoverPendingCompaction,
	recoveredResult,
	type CloseBlocker,
	type CloseCompactionTestSeam,
	type CloseCompletion,
	type CloseOptions,
	type CloseResult,
} from "./sdd-close-compaction.ts";
import type { AssessCloseReadiness } from "./sdd-close-readiness.ts";
import { readSpecDeltaDeclaration } from "./sdd-change-validation.ts";
import { summaryContractErrors } from "./sdd-summary-contract.ts";
import {
	OUT_OF_FLOW_EVIDENCE_PATH,
	validateOutOfFlowReconciliation,
	type RepositoryStateIdentity,
	type ScopeOnlyRecordFacts,
	type ValidatedOutOfFlowReconciliation,
} from "./sdd-reconciliation.ts";
import {
	isSafeChangeName,
	resolveChangesDir,
	type SddChangeStatus,
} from "./sdd-routing-core.ts";

export { closedChangePath } from "./sdd-close-compaction.ts";
export type {
	CloseBlocker,
	CloseCompactionTestSeam,
	CloseOptions,
	CloseResult,
} from "./sdd-close-compaction.ts";

export type CloseChange = (
	cwd: string,
	change: string,
	options?: CloseOptions,
	seam?: CloseCompactionTestSeam,
) => CloseResult;
export type CloseEngineDependencies = Readonly<{
	assessCloseReadiness: AssessCloseReadiness;
	resolveSddStatus: (cwd: string, change: string) => SddChangeStatus;
	readRepositoryStateIdentity: (cwd: string, capturedAt: unknown) => RepositoryStateIdentity | null;
	now?: () => string;
}>;

function canonicalEvidencePath(cwd: string, change: string): string {
	return relative(cwd, join(resolveChangesDir(cwd), change, OUT_OF_FLOW_EVIDENCE_PATH)).replaceAll("\\", "/");
}

function readJson(path: string): unknown {
	try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function reconciliationRecord(
	dependencies: CloseEngineDependencies,
	cwd: string,
	change: string,
	from: string,
): ScopeOnlyRecordFacts {
	let artifacts: string[] = [];
	let readable = true;
	try { artifacts = readdirSync(from); } catch { readable = false; }
	const declaration = readSpecDeltaDeclaration(cwd, change);
	const scope = (() => { try { return readFileSync(join(from, "scope.md"), "utf8").replaceAll("\r\n", "\n"); } catch { return ""; } })();
	const blocks = [...scope.matchAll(/^## Spec delta declaration\nspec_delta: none\nspec_delta_reason: ([^\n]*)$/gm)];
	const status = dependencies.resolveSddStatus(cwd, change).specState;
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

function assessDurableSummary(from: string, change: string): CloseBlocker | null {
	let text = "";
	try { text = readFileSync(join(from, "summary.md"), "utf8").replaceAll("\r\n", "\n"); }
	catch { return null; } // assessCloseReadiness owns the missing/unreadable case.

	const missing = summaryContractErrors(text, change);
	return missing.length === 0
		? null
		: {
			code: "summary-contract-invalid",
			message: `summary.md: falta o no coincide ${missing.join(", ")}.`,
		};
}

function assessReconciliationClose(
	dependencies: CloseEngineDependencies,
	cwd: string,
	change: string,
	from: string,
	to: string,
	options: CloseOptions,
): { blockers: CloseBlocker[]; reconciliation?: ValidatedOutOfFlowReconciliation } {
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
	const readiness = dependencies.assessCloseReadiness(cwd, change, { reconciliationProfile: options.reconciliationProfile });
	for (const blocker of readiness.reconciliationBlockers) add(blocker);
	const validation = validateOutOfFlowReconciliation({
		profile: options.reconciliationProfile,
		change,
		auditReason: options.legacyReason,
		now: (dependencies.now ?? (() => new Date().toISOString()))(),
		record: reconciliationRecord(dependencies, cwd, change, from),
		summary: {
			path: "summary.md",
			sha256: createHash("sha256").update(summaryText).digest("hex"),
			bytes: Buffer.byteLength(summaryText, "utf8"),
			text: summaryText,
			fresh: summaryFresh,
		},
		currentRepositoryState: dependencies.readRepositoryStateIdentity(cwd, evidenceState?.capturedAt),
		evidence,
	});
	if (!validation.ok) for (const blocker of validation.blockers) add(blocker);
	return blockers.length === 0 && validation.ok ? { blockers, reconciliation: validation.reconciliation } : { blockers };
}

// `archive/` conserva el registro duradero; los artefactos intermedios existen
// únicamente mientras el cambio está activo.
export function createCloseChange(dependencies: CloseEngineDependencies): CloseChange {
	return (
		cwd: string,
		change: string,
		options: CloseOptions = {},
		seam: CloseCompactionTestSeam = {},
	): CloseResult => {
	const from = join(resolveChangesDir(cwd), change);
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
		const assessment = assessReconciliationClose(dependencies, cwd, change, from, to, options);
		if (assessment.blockers.length > 0 || assessment.reconciliation === undefined) {
			return {
				ok: false,
				from,
				to,
				reason: `reconciliation denied: ${assessment.blockers.map((blocker) => blocker.message).join(" ")}`,
				blockers: assessment.blockers,
			};
		}
		mkdirSync(join(resolveChangesDir(cwd), "archive"), { recursive: true });
		const moveError = compactToArchive(from, to, change, { kind: "reconciliation", receipt: assessment.reconciliation }, seam);
		return moveError === null
			? { ok: true, from, to, reconciliation: assessment.reconciliation }
			: { ok: false, from, to, reason: moveError };
	}
	if (existsSync(to)) {
		return { ok: false, from, to, reason: "ya existe en archive/; no se pisa" };
	}
	const readiness = dependencies.assessCloseReadiness(cwd, change);
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

	mkdirSync(join(resolveChangesDir(cwd), "archive"), { recursive: true });
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
	};
}
