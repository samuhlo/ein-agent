// =============================================================================
// EIN SDD READ SURFACE
// Registers SDD inspection, audit, and navigation without owning workflow
// mutations. Filesystem writers and close remain on a separate surface.
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { t, tf } from "../../lib/i18n/strings.ts";
import {
	getSddPreflightPreferences,
} from "../../lib/sdd-preflight.ts";
import {
	lintChange,
	lintPhaseArtifact,
} from "../../lib/sdd-guardrails.ts";
import {
	formatSddPlanPreview,
	isSafeChangeName,
	listActiveChanges,
	resolveSddNext,
	resolveSddPlanPreview,
	resolveSddStatus,
	sddNextHandoff,
} from "../../lib/sdd-router.ts";
import {
	DEFAULT_REVIEW_BUDGET_BYTES,
	DEFAULT_REVIEW_DENSITY_NOTICE_BYTES_PER_LINE,
	evaluateReviewForecast,
	formatReviewForecast,
	reviewForecast,
} from "../../lib/review-forecast.ts";
import {
	SDD_SESSION_BINDING_EVENT_CHANNEL,
	type SessionBindingEventV1,
} from "../../lib/sdd-session-binding.ts";
import {
	changeDirExists,
	commandArgsText,
	formatChangeLint,
	formatSddNext,
	formatSddNextHelp,
	formatSddStatus,
	parseSddNextArgs,
	PHASE_BY_FILE,
} from "./ein-sdd-presentation.ts";
import type { EinToolRegistrar } from "./ein-tool-registration.ts";

function publishSessionBinding(
	pi: ExtensionAPI,
	event: SessionBindingEventV1,
): void {
	pi.events.emit(SDD_SESSION_BINDING_EVENT_CHANNEL, event);
}

async function handleSddAudit(
	args: string | string[],
	ctx: ExtensionContext,
): Promise<void> {
	const arg = commandArgsText(args).trim();
	if (!arg) {
		const status = resolveSddStatus(ctx.cwd);
		if (!status.change) {
			ctx.ui.notify(
				"No hay cambio activo. Uso: /ein:sdd-audit <change>  |  /ein:sdd-audit <path-to-design.md>",
				"warning",
			);
			return;
		}
		const report = lintChange(ctx.cwd, status.change);
		ctx.ui.notify(formatChangeLint(report), report.errors ? "warning" : "info");
		return;
	}

	const candidatePath = arg.startsWith("/") ? arg : join(ctx.cwd, arg);
	if (existsSync(candidatePath)) {
		const fileName = candidatePath.split("/").pop() ?? "design.md";
		const phase = PHASE_BY_FILE[fileName] ?? "design";
		const report = lintPhaseArtifact(phase, readFileSync(candidatePath, "utf8"));
		const relative = candidatePath.startsWith(ctx.cwd)
			? candidatePath.slice(ctx.cwd.length + 1)
			: candidatePath;
		const outcome = report.errors
			? "FAIL"
			: report.warnings
				? "OK_WITH_WARNINGS"
				: "OK";
		const lines = [
			`// 000. sdd ${phase.toUpperCase()} CHECK`,
			"",
			`${phase}: ${relative}`,
			`resultado: ${outcome}  |  errores: ${report.errors}  |  warnings: ${report.warnings}  |  lineas: ${report.lineCount}`,
		];
		if (report.issues.length) {
			lines.push("");
			for (const issue of report.issues) {
				lines.push(`- ${issue.level.toUpperCase()} [${issue.code}]: ${issue.message}`);
			}
		} else {
			lines.push("", `- ${phase} limpio: señales obligatorias presentes, sin placeholders criticos.`);
		}
		ctx.ui.notify(lines.join("\n"), report.errors ? "warning" : "info");
		return;
	}

	if (changeDirExists(ctx.cwd, arg)) {
		const report = lintChange(ctx.cwd, arg);
		ctx.ui.notify(formatChangeLint(report), report.errors ? "warning" : "info");
		return;
	}

	ctx.ui.notify(
		`No encontre '${arg}' como path ni como cambio en openspec/changes/. Uso: /ein:sdd-audit <change>  |  /ein:sdd-audit <path-to-design.md>`,
		"warning",
	);
}

/** Register SDD inspection, audit, and navigation surfaces. */
export function registerSddReadSurface(
	pi: ExtensionAPI,
	registerEinTool: EinToolRegistrar,
): void {
	pi.registerCommand("ein:sdd-audit", {
		description: t("cmd.sdd-audit.description", "Validate a change (all phases) or lint a design.md path"),
		handler: async (args, ctx) => handleSddAudit(args, ctx),
	});

	pi.registerCommand("ein:sdd-check", {
		description: t("cmd.sdd-check.description", "[legacy] Use /ein:sdd-audit"),
		handler: async (args, ctx) => handleSddAudit(args, ctx),
	});

	registerEinTool({
		name: "ein_sdd_status",
		label: "Ein SDD Status",
		description: "Deterministic SDD state for the active change (or a named one): which phase artifacts exist, verify outcome, and the nextRecommended phase. Returns a compact human-readable summary — route the SDD flow by the `next:` line, never by guessing. Reads only the filesystem.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
			},
		} as const,
		async execute(_id, params: { change?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const status = resolveSddStatus(ctx.cwd, params?.change);
			const active = listActiveChanges(ctx.cwd);
			const preferences = getSddPreflightPreferences(ctx);
			let text = formatSddStatus(status, active, preferences);
			const plan = status.nextRecommended === "apply" && status.change
				? resolveSddPlanPreview(ctx.cwd, status.change)
				: undefined;
			if (plan) {
				const block = formatSddPlanPreview(plan);
				if (block) text += `\n\n${block}`;
			}
			return {
				content: [{ type: "text", text }],
				details: { status, activeChanges: active, plan },
			};
		},
	});

	registerEinTool({
		name: "ein_review_forecast",
		label: "Ein Review Forecast",
		description: [
			"Deterministic PR-size forecast for the Review Workload Guard.",
			"Uses a fixed production pathspec and returns changed production lines,",
			"non-whitespace UTF-8 bytes, touched files and per-file volume; test lines stay separate.",
			"The result exceeds the review budget when either production lines or bytes exceed their limit.",
			"File density is a localized notice and never blocks by itself.",
			"With `base` it measures `base..HEAD`; without it, the working tree.",
			"Call this before delegating a PR. Reads git only.",
		].join(" "),
		parameters: {
			type: "object",
			properties: {
				base: { type: "string", description: "PR base ref (e.g. `main`, `dev`). Omit to measure the working tree (staged + unstaged)." },
			},
		} as const,
		async execute(_id, params: { base?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const budget = {
				lines: getSddPreflightPreferences(ctx)?.reviewBudgetLines ?? 400,
				bytes: DEFAULT_REVIEW_BUDGET_BYTES,
				densityBytesPerLine: DEFAULT_REVIEW_DENSITY_NOTICE_BYTES_PER_LINE,
			};
			const forecast = reviewForecast(ctx.cwd, params?.base);
			const evaluation = evaluateReviewForecast(forecast, budget);
			return {
				content: [{ type: "text", text: formatReviewForecast(forecast, budget, evaluation) }],
				details: {
					...forecast,
					budget: budget.lines,
					lineBudget: budget.lines,
					byteBudget: budget.bytes,
					densityNoticeThreshold: budget.densityBytesPerLine,
					...evaluation,
				},
			};
		},
	});

	pi.registerCommand("ein:sdd-status", {
		description: t("cmd.sdd-status.description", "Estado SDD determinista del cambio activo o nombrado (fase, tareas, budget)"),
		handler: async (args, ctx) => {
			const change = commandArgsText(args).trim() || undefined;
			const status = resolveSddStatus(ctx.cwd, change);
			const active = listActiveChanges(ctx.cwd);
			ctx.ui.notify(
				formatSddStatus(status, active),
				status.blocked.length ? "warning" : "info",
			);
		},
	});

	pi.registerCommand("ein:focus", {
		description: t("cmd.focus.description", "Focus the session TODO on a named active change"),
		handler: async (args, ctx) => {
			const parts = commandArgsText(args).trim().split(/\s+/).filter(Boolean);
			if (parts.length !== 1) {
				ctx.ui.notify(t("focus.usage", "Usage: /ein:focus <change>"), "info");
				return;
			}
			const change = parts[0]!;
			const active = listActiveChanges(ctx.cwd);
			if (!isSafeChangeName(change) || !active.includes(change)) {
				const available = active.length > 0 ? active.join(", ") : t("focus.none", "none");
				ctx.ui.notify(tf("focus.invalid", "Cannot focus '{0}'. Active changes: {1}", change, available), "warning");
				return;
			}
			publishSessionBinding(pi, { version: 1, action: "bind", change });
			ctx.ui.notify(tf("focus.success", "TODO focused on {0}.", change), "info");
		},
	});

	pi.registerCommand("ein:sdd-next", {
		description: t("cmd.sdd-next.description", "Show the next recommended SDD step for a named change and hand it to the orchestrator"),
		handler: async (args, ctx) => {
			const parsed = parseSddNextArgs(args);
			if (!parsed.change) {
				ctx.ui.notify(formatSddNextHelp(), "info");
				return;
			}
			const report = resolveSddNext(ctx.cwd, parsed.change);
			ctx.ui.notify(
				formatSddNext(report),
				report.exists && report.blocked.length === 0 ? "info" : "warning",
			);
			if (report.exists && report.change === parsed.change) {
				publishSessionBinding(pi, { version: 1, action: "bind", change: parsed.change });
			}
			const handoff = sddNextHandoff(report);
			if (handoff) pi.sendUserMessage(handoff);
		},
	});
}
