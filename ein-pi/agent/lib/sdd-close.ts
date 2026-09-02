// =============================================================================
// SDD CLOSE — PI ENGINE
// Decide el cierre y delega la promoción recuperable al núcleo compartido.
// Git permanece aquí hasta que el motor reciba esa capacidad por inyección.
// =============================================================================

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
} from "../../../shared/sdd/sdd-close-compaction.ts";
import { readSpecDeltaDeclaration } from "./sdd-guardrails.ts";
import {
	OUT_OF_FLOW_EVIDENCE_PATH,
	validateOutOfFlowReconciliation,
	type RepositoryStateIdentity,
	type ScopeOnlyRecordFacts,
	type ValidatedOutOfFlowReconciliation,
} from "./sdd-reconciliation.ts";
import { assessCloseReadiness } from "./sdd-close-readiness.ts";
import { isSafeChangeName, resolveChangesDir } from "./sdd-routing-core.ts";
import { resolveSddStatus } from "./sdd-routing-runtime.ts";

export { closedChangePath } from "../../../shared/sdd/sdd-close-compaction.ts";
export type {
	CloseBlocker,
	CloseCompactionTestSeam,
	CloseOptions,
	CloseResult,
} from "../../../shared/sdd/sdd-close-compaction.ts";

function canonicalEvidencePath(cwd: string, change: string): string {
	return relative(cwd, join(resolveChangesDir(cwd), change, OUT_OF_FLOW_EVIDENCE_PATH)).replaceAll("\\", "/");
}

function readJson(path: string): unknown {
	try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
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
		mkdirSync(join(resolveChangesDir(cwd), "archive"), { recursive: true });
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
}
