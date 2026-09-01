// =============================================================================
// SDD CLOSE READINESS
// Close-specific policy stays in Pi until the later close/OpenSpec extraction.
// It consumes shared status but owns legacy and reconciliation exceptions.
// =============================================================================

import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";

import { resolveChangesDir, type SddChangeStatus } from "./sdd-routing-core.ts";
import { resolveSddStatus } from "./sdd-routing-runtime.ts";
import { readSpecDeltaDeclaration } from "./sdd-guardrails.ts";
import { OUT_OF_FLOW_PROFILE, type ReconciliationBlocker } from "./sdd-reconciliation.ts";

export type CloseReadinessBlockerCode =
	| "apply-not-complete"
	| "verify-missing"
	| "verify-failed"
	| "verify-unclear"
	| "verify-stale"
	| "summary-missing"
	| "summary-stale"
	| "tasks-pending"
	| "spec-pending"
	| "spec-conflict"
	| "spec-unresolved";

export type CloseReadinessBlocker = { code: CloseReadinessBlockerCode; message: string };
export type CloseReadinessOptions = { reconciliationProfile?: string };
export type CloseReadiness = {
	ready: boolean;
	reasons: string[];
	blockers: CloseReadinessBlocker[];
	legacyEligibility: "declarationless-record" | null;
	reconciliationEligibility: typeof OUT_OF_FLOW_PROFILE | null;
	reconciliationBlockers: ReconciliationBlocker[];
};

function readText(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

function declarationlessLegacyEligible(cwd: string, change: string, status: SddChangeStatus): boolean {
	if (resolveChangesDir(cwd) !== join(cwd, "openspec", "changes") || status.specState !== "unresolved") return false;
	const changePath = join(cwd, "openspec", "changes", change);
	const scope = readText(join(changePath, "scope.md"));
	if (scope === null || /## Spec delta declaration|spec_delta:|spec_delta_reason:/.test(scope)) return false;
	if (existsSync(join(changePath, "sync-report.md"))) return false;

	const specs = join(changePath, "specs");
	if (existsSync(specs)) {
		let domains: string[];
		try {
			domains = readdirSync(specs);
		} catch {
			return false;
		}
		if (domains.some((domain) => existsSync(join(specs, domain, "spec.md")))) return false;
	}

	return status.apply === "complete" &&
		status.present.verify && status.verify === "pass" && !status.verifyStale &&
		status.present.close && !status.summaryStale &&
		status.tasks.counts.pending === 0;
}

function scopeOnlyOutOfFlowEligible(cwd: string, change: string, status: SddChangeStatus): boolean {
	if (resolveChangesDir(cwd) !== join(cwd, "openspec", "changes")) return false;
	const changePath = join(cwd, "openspec", "changes", change);
	const scope = readText(join(changePath, "scope.md"));
	if (scope === null) return false;

	let entries: Dirent[];
	try {
		entries = readdirSync(changePath, { withFileTypes: true });
	} catch {
		return false;
	}
	const allowed = new Set(["scope.md", "summary.md", "out-of-flow-reconciliation.json"]);
	if (!entries.some((entry) => entry.isFile() && entry.name === "scope.md") ||
		entries.some((entry) => !entry.isFile() || !allowed.has(entry.name))) return false;

	const declaration = readSpecDeltaDeclaration(cwd, change);
	const normalizedScope = scope.replaceAll("\r\n", "\n");
	const declarationBlocks = [...normalizedScope.matchAll(
		/^## Spec delta declaration\nspec_delta: none\nspec_delta_reason: ([^\n]*)$/gm,
	)];
	const declarationTokens = /## Spec delta declaration|spec_delta:|spec_delta_reason:/;
	const hasDeclarationTokens = declarationTokens.test(normalizedScope);
	const contentOutsideDeclaration = declarationBlocks.length === 1
		? normalizedScope.replace(declarationBlocks[0]![0], "")
		: normalizedScope;
	const declarationless = !hasDeclarationTokens && declaration.mode === "invalid" && status.specState === "unresolved";
	const declaredNone = declarationBlocks.length === 1 &&
		!declarationTokens.test(contentOutsideDeclaration) &&
		declaration.mode === "none" &&
		status.specState === "synchronized";
	return declarationless || declaredNone;
}

function assessReconciliationReadiness(
	cwd: string,
	change: string,
	status: SddChangeStatus,
	profile: string | undefined,
): Pick<CloseReadiness, "reconciliationEligibility" | "reconciliationBlockers"> {
	if (profile === undefined) return { reconciliationEligibility: null, reconciliationBlockers: [] };
	if (profile !== OUT_OF_FLOW_PROFILE) {
		return {
			reconciliationEligibility: null,
			reconciliationBlockers: [{
				code: "reconciliation-profile-unsupported",
				message: "The exact scope-only-out-of-flow profile is required.",
			}],
		};
	}
	if (!scopeOnlyOutOfFlowEligible(cwd, change, status)) {
		return {
			reconciliationEligibility: null,
			reconciliationBlockers: [{
				code: "reconciliation-record-ineligible",
				message: "The record is not an eligible scope-only shape and spec state.",
			}],
		};
	}
	return { reconciliationEligibility: OUT_OF_FLOW_PROFILE, reconciliationBlockers: [] };
}

export function assessCloseReadiness(
	cwd: string,
	change: string,
	options: CloseReadinessOptions = {},
): CloseReadiness {
	const status = resolveSddStatus(cwd, change);
	const blockers: CloseReadinessBlocker[] = [];
	const add = (code: CloseReadinessBlockerCode, message: string) => blockers.push({ code, message });
	if (status.apply !== "complete") add("apply-not-complete", "apply no está `status: complete`.");
	if (!status.present.verify) add("verify-missing", "falta verify-report.md.");
	else if (status.verify === "fail") add("verify-failed", "verify-report indica fallo.");
	else if (status.verify !== "pass") add("verify-unclear", "verify-report sin `status: pass` claro.");
	if (status.verifyStale) add("verify-stale", "verify-report es anterior al último apply (evidencia obsoleta): re-verifica.");
	if (!status.present.close) add("summary-missing", "falta summary.md.");
	else if (status.summaryStale) add("summary-stale", "summary.md es anterior a apply/verify: regenera el resumen.");
	if (status.tasks.counts.pending > 0) add("tasks-pending", `quedan ${status.tasks.counts.pending} tarea(s) sin completar.`);
	if (status.specState === "pending") add("spec-pending", "estado de specs OpenSpec: pending.");
	else if (status.specState === "conflict") add("spec-conflict", "estado de specs OpenSpec: conflict.");
	else if (status.specState === "unresolved") add("spec-unresolved", "estado de specs OpenSpec: unresolved.");

	const reconciliation = assessReconciliationReadiness(cwd, change, status, options.reconciliationProfile);
	return {
		ready: blockers.length === 0,
		reasons: blockers.map((blocker) => blocker.message),
		blockers,
		legacyEligibility: declarationlessLegacyEligible(cwd, change, status) ? "declarationless-record" : null,
		...reconciliation,
	};
}
