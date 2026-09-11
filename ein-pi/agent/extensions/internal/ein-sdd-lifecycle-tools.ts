// =============================================================================
// EIN SDD LIFECYCLE TOOLS
// Owns artifact checks and deterministic close for the Pi surface.
// Close invalidates session focus and refreshes an existing EIN.md index.
// =============================================================================

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { t } from "../../lib/i18n/strings.ts";
import { closeChange, type CloseOptions } from "../../lib/sdd-close.ts";
import { parseSddCloseArgs } from "../../lib/sdd-close-args.ts";
import { lintChange } from "../../lib/sdd-guardrails.ts";
import {
	changeUnavailableMessage,
	resolveSddStatus,
	resolveSddNext,
	resolveSddPlanPreview,
	formatSddPlanPreview,
} from "../../lib/sdd-router.ts";
import { SDD_SESSION_BINDING_EVENT_CHANNEL } from "../../lib/sdd-session-binding.ts";
import { formatChangeLint, formatSddNext } from "./ein-sdd-presentation.ts";
import { readChangeStance, renderChangeStanceLine } from "../../lib/sdd-preflight-record.ts";
import type { EinToolRegistrar } from "./ein-tool-registration.ts";
import { readSddAdvisoryStatus } from "../../lib/sdd-participants.ts";
import { sddPreflightSessionKey } from "../../lib/sdd-preflight.ts";

async function performSddClose(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	change: string,
	options: CloseOptions,
) {
	const advisory = readSddAdvisoryStatus(ctx.cwd, sddPreflightSessionKey(ctx), change);
	const result = closeChange(ctx.cwd, change, options);
	if (result.ok) {
		pi.events.emit(SDD_SESSION_BINDING_EVENT_CHANNEL, {
			version: 1,
			action: "invalidate",
			change,
		});
	}
	return { result, advisory };
}

/** Register artifact checking and deterministic SDD close. */
export function registerSddLifecycleTools(
	pi: ExtensionAPI,
	registerEinTool: EinToolRegistrar,
): void {
	registerEinTool({
		name: "ein_sdd_check",
		label: "Ein SDD Check",
		description: "Validate SDD artifacts AFTER each phase. Returns gate issues plus the current deterministic next step, recorded stance and apply plan when relevant. Use that route directly: no extra ein_sdd_status/ein_sdd_next call on unchanged state. Gate errors block routing; a clean artifact does not replace fresh behavioral verification. Reads only the filesystem.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				phase: { type: "string", enum: ["scope", "map", "design", "tasks", "apply", "verify"] },
			},
		} as const,
		async execute(_id, params: { change?: string; phase?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change;
			if (!change) {
				return { content: [{ type: "text", text: (changeUnavailableMessage(ctx.cwd, "check", params?.change) ?? "// sdd check — no active change in openspec/changes/.") }], details: { ok: false, reason: "no active change" } };
			}
			const report = Object.assign(lintChange(ctx.cwd, change), { advisory: readSddAdvisoryStatus(ctx.cwd, sddPreflightSessionKey(ctx), change) });
			const phaseReport = params?.phase
				? report.phases.find((entry) => entry.phase === params.phase)
				: undefined;
			const requestedArtifactIsClean = Boolean(
				phaseReport?.present && phaseReport.report?.errors === 0,
			);
			const checkedResult = () => {
				// Derive navigation from the checked state; never cache it across calls.
				if (report.errors > 0 || (params?.phase && !requestedArtifactIsClean)) {
					return { content: [{ type: "text" as const, text: `${formatChangeLint(report)}\n\nRuta bloqueada: el artefacto solicitado falta o no supera el gate. No avanzar.` }], details: { ...report, navigation: null } };
				}
				const next = resolveSddNext(ctx.cwd, change);
				const stance = readChangeStance(ctx.cwd, change);
				const plan = next.nextRecommended === "apply" && next.blocked.length === 0
					? resolveSddPlanPreview(ctx.cwd, change) : undefined;
				const text = [formatChangeLint(report), formatSddNext(next), renderChangeStanceLine(stance), plan ? formatSddPlanPreview(plan) : ""].filter(Boolean).join("\n\n");
				return { content: [{ type: "text" as const, text }], details: { ...report, navigation: { ...next, stance, plan } } };
			};

			return checkedResult();
		},
	});

	async function handleSddClose(
		args: string | string[],
		ctx: ExtensionContext,
	): Promise<void> {
		const parsed = parseSddCloseArgs(args);
		const change = parsed.change ?? resolveSddStatus(ctx.cwd).change ?? "";
		if (!change) {
			const ambiguity = changeUnavailableMessage(ctx.cwd, "close", parsed.change);
			ctx.ui.notify(
				`${ambiguity ?? "Sin cambio que cerrar."} Uso: /ein:sdd-close <change> [--reconciliation-profile scope-only-out-of-flow --reconciliation-evidence <canonical-path>] --reason "<audit reason>". Legacy: --force --reason "<audit reason>"`,
				"warning",
			);
			return;
		}
		const { result, advisory } = await performSddClose(pi, ctx, change, {
			force: parsed.force,
			legacyReason: parsed.reason,
			reconciliationProfile: parsed.reconciliationProfile,
			reconciliationEvidencePath: parsed.reconciliationEvidencePath,
		});
		const success = result.legacyEscape
			? `Closed through legacy escape (spec state remained unresolved): ${result.legacyEscape.reason}`
			: result.reconciliation
				? `Reconciled out-of-flow change '${change}' closed with profile ${result.reconciliation.profile}.`
				: `Verified change '${change}' closed. openspec/changes/ is clean.`;
		ctx.ui.notify(
			(result.ok ? success : `No se cerró '${change}': ${result.reason}`) + (advisory ? ` Revisión asesora: ${advisory.status}${advisory.reason ? ` — ${advisory.reason}` : ""}.` : ""),
			result.ok ? "info" : "warning",
		);
	}

	pi.registerCommand("ein:sdd-close", {
		description: t("cmd.sdd-close.description", "Close a verified change"),
		handler: async (args, ctx) => handleSddClose(args, ctx),
	});

	registerEinTool({
		name: "ein_sdd_close",
		label: "Ein SDD Close",
		description: "Deterministically archive a VERIFIED change. For audited scope-only delivery outside SDD, explicitly provide reconciliationProfile `scope-only-out-of-flow`, the canonical reconciliationEvidencePath, and reason. `--force --reason \"<audit reason>\"` is only for an otherwise complete, freshly verified declarationless legacy record. It never bypasses tasks, apply, verify, summary, pending spec synchronization, or conflicts, and close never synchronizes specs. Moves the filesystem; never commits or pushes.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				force: { type: "boolean", description: "Use only with reason for the narrow declarationless legacy escape; eligibility remains enforced by the close library." },
				reason: { type: "string", description: "Audit reason required with force or reconciliation; validated by the shared close library." },
				reconciliationProfile: { type: "string", enum: ["scope-only-out-of-flow"], description: "Explicit audited reconciliation profile; never inferred from evidence." },
				reconciliationEvidencePath: { type: "string", description: "Canonical openspec/changes/<change>/out-of-flow-reconciliation.json path." },
			},
		} as const,
		async execute(_id, params: { change?: string; force?: boolean; reason?: string; reconciliationProfile?: string; reconciliationEvidencePath?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change ?? "";
			if (!change) {
				return { content: [{ type: "text", text: (changeUnavailableMessage(ctx.cwd, "close", params?.change) ?? "// sdd close — no active change to close.") }], details: { ok: false, reason: "no active change" } };
			}
			const reason = params?.reason;
			const { result, advisory } = await performSddClose(pi, ctx, change, {
				force: Boolean(params?.force),
				legacyReason: reason,
				reconciliationProfile: params?.reconciliationProfile,
				reconciliationEvidencePath: params?.reconciliationEvidencePath,
			});
			const text = result.ok
				? result.legacyEscape
					? `// sdd close — Closed through legacy escape (spec state remained unresolved): ${result.legacyEscape.reason}`
					: result.reconciliation
						? `// sdd close — Reconciled '${change}' with profile ${result.reconciliation.profile}; archived to ${result.to.replace(ctx.cwd, ".")}.`
						: `// sdd close — Verified change '${change}' closed; archived to ${result.to.replace(ctx.cwd, ".")}.`
				: `// sdd close — '${change}' NOT closed: ${result.reason}`;
			return { content: [{ type: "text", text: text + (advisory ? `\nRevisión asesora: ${advisory.status}${advisory.reason ? ` — ${advisory.reason}` : ""}.` : "") }], details: { ...result, advisory } };
		},
	});
}
