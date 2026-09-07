// =============================================================================
// EIN SDD LIFECYCLE TOOLS
// Owns artifact gate receipts and deterministic close for the Pi surface.
// Close invalidates session focus and refreshes an existing EIN.md index.
// =============================================================================

import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { t } from "../../lib/i18n/strings.ts";
import { closeChange, type CloseOptions } from "../../lib/sdd-close.ts";
import { parseSddCloseArgs } from "../../lib/sdd-close-args.ts";
import { lintChange } from "../../lib/sdd-guardrails.ts";
import {
	MEMORY_CANDIDATE_SCHEMA,
	appendMemoryReceipt,
	safeMemoryReceipt,
	type SafeMemoryReceipt,
} from "../../lib/sdd-memory-save.ts";
import {
	changeUnavailableMessage,
	resolveChangesDir,
	resolveSddStatus,
} from "../../lib/sdd-router.ts";
import { SDD_SESSION_BINDING_EVENT_CHANNEL } from "../../lib/sdd-session-binding.ts";
import { formatChangeLint } from "./ein-sdd-presentation.ts";
import {
	saveArchivedCloseMemory,
	saveCheckedPhaseMemory,
	skippedMemoryReceipt,
} from "./ein-sdd-memory.ts";
import type { EinToolRegistrar } from "./ein-tool-registration.ts";

async function performSddClose(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	change: string,
	options: CloseOptions,
) {
	const result = closeChange(ctx.cwd, change, options);
	let memory: SafeMemoryReceipt | undefined;
	if (result.ok) {
		pi.events.emit(SDD_SESSION_BINDING_EVENT_CHANNEL, {
			version: 1,
			action: "invalidate",
			change,
		});
		memory = await saveArchivedCloseMemory(ctx, change, result.to);
	}
	return { result, memory };
}

/** Register artifact checking and deterministic SDD close. */
export function registerSddLifecycleTools(
	pi: ExtensionAPI,
	registerEinTool: EinToolRegistrar,
): void {
	registerEinTool({
		name: "ein_sdd_check",
		label: "Ein SDD Check",
		description: "Deterministic gatekeeper: lint every present SDD artifact of a change (sections, required signals like verify's status line, placeholders, size). Run it AFTER each phase before advancing. Returns a compact per-phase summary (OK/ERRORS + issues). Reads only the filesystem.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				phase: { type: "string", enum: ["scope", "map", "design", "tasks", "apply", "verify"] },
				memoryCandidate: MEMORY_CANDIDATE_SCHEMA,
			},
		} as const,
		async execute(_id, params: { change?: string; phase?: string; memoryCandidate?: unknown }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change;
			if (!change) {
				return { content: [{ type: "text", text: (changeUnavailableMessage(ctx.cwd, "check", params?.change) ?? "// sdd check — no active change in openspec/changes/.") }], details: { ok: false, reason: "no active change" } };
			}
			const report = lintChange(ctx.cwd, change);
			const phaseReport = params?.phase
				? report.phases.find((entry) => entry.phase === params.phase)
				: undefined;
			const candidateHasCleanArtifact = Boolean(
				phaseReport?.present && phaseReport.report?.errors === 0,
			);
			if (report.errors > 0 || (params?.memoryCandidate !== undefined && !candidateHasCleanArtifact)) {
				const memory = safeMemoryReceipt(
					skippedMemoryReceipt("artifact_gate_failed"),
					`sdd:${change}:gate`,
				);
				appendMemoryReceipt(join(resolveChangesDir(ctx.cwd), change), memory);
				Object.assign(report, { memory });
				return { content: [{ type: "text", text: formatChangeLint(report) }], details: report };
			}
			const memory = await saveCheckedPhaseMemory(
				ctx,
				change,
				params?.phase,
				params?.memoryCandidate,
			);
			appendMemoryReceipt(join(resolveChangesDir(ctx.cwd), change), memory);
			Object.assign(report, { memory });
			return { content: [{ type: "text", text: formatChangeLint(report) }], details: report };
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
		const { result, memory } = await performSddClose(pi, ctx, change, {
			force: parsed.force,
			legacyReason: parsed.reason,
			reconciliationProfile: parsed.reconciliationProfile,
			reconciliationEvidencePath: parsed.reconciliationEvidencePath,
		});
		const memoryMessage = memory
			? memory.status === "saved" && memory.reason === "acknowledged"
				? " Memoria: guardada."
				: ` Memoria: ${memory.status}/${memory.reason}.`
			: "";
		const success = result.legacyEscape
			? `Closed through legacy escape (spec state remained unresolved): ${result.legacyEscape.reason}${memoryMessage}`
			: result.reconciliation
				? `Reconciled out-of-flow change '${change}' closed with profile ${result.reconciliation.profile}.${memoryMessage}`
				: `Verified change '${change}' closed. openspec/changes/ is clean.${memoryMessage}`;
		ctx.ui.notify(
			result.ok ? success : `No se cerró '${change}': ${result.reason}`,
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
			const { result, memory } = await performSddClose(pi, ctx, change, {
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
			return { content: [{ type: "text", text }], details: { ...result, memory } };
		},
	});
}
