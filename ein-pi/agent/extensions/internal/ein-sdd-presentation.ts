// =============================================================================
// EIN SDD PRESENTATION
// Formats human SDD status, audit, and next-step output, and parses command
// arguments without owning workflow decisions.
// =============================================================================

import { statSync } from "node:fs";
import { join } from "node:path";
import { t } from "../../lib/i18n/strings.ts";
import type {
	ChangeLintReport,
	SddPhase,
} from "../../lib/sdd-guardrails.ts";
import { collectSddRemedies, formatSddRemedies } from "../../lib/sdd-remedies.ts";
import {
	formatBudget,
	resolveChangesDir,
	sddStatusBlockers,
	type SddChangeStatus,
	type SddNextReport,
} from "../../lib/sdd-router.ts";
import type { SddPreflightPreferences } from "../../lib/sdd-preflight.ts";

/** True when a named change directory exists in the configured change root. */
export function changeDirExists(cwd: string, name: string): boolean {
	const base = join(resolveChangesDir(cwd), name);
	try {
		return statSync(base).isDirectory();
	} catch {
		return false;
	}
}

export const PHASE_BY_FILE: Record<string, SddPhase> = {
	"scope.md": "scope",
	"map.md": "map",
	"design.md": "design",
	"tasks.md": "tasks",
	"apply-progress.md": "apply",
	"verify-report.md": "verify",
	"summary.md": "close",
};

export function formatChangeLint(report: ChangeLintReport): string {
	const { change, errors, warnings, phases } = report;
	const presentCount = phases.filter((phase) => phase.present).length;
	const lines: string[] = [
		`// 000. sdd check — ${change}`,
		"",
		`fases: ${presentCount}/${phases.length} presentes  |  errores: ${errors}  |  warnings: ${warnings}`,
	];

	if (report.issues.length > 0) {
		lines.push("", "▏ consistencia:");
		for (const issue of report.issues) {
			lines.push(`  - ${issue.level.toUpperCase()} [${issue.code}]: ${issue.message}`);
		}
	}

	for (const { phase, present, report: phaseReport } of phases) {
		if (!present) {
			lines.push(`▏ ${phase} — MISSING`);
			continue;
		}
		const icon = phaseReport!.errors === 0 ? "OK" : "ERRORS";
		const detail = phaseReport!.lineCount > 0
			? `, ${phaseReport!.lineCount} lineas`
			: "";
		lines.push(`▏ ${phase} — ${icon} (presente${detail})`);
		for (const issue of phaseReport!.issues) {
			lines.push(`  - ${issue.level.toUpperCase()} [${issue.code}]: ${issue.message}`);
		}
	}

	return lines.join("\n");
}

export function formatSddStatus(
	status: SddChangeStatus,
	active: string[],
	prefs?: SddPreflightPreferences,
): string {
	const notebook = `optional project notebook: Engram ${prefs?.memoryMode ?? "off"}${prefs?.engramAvailable ? " (configured; no retrieval or save is implied)" : " (unavailable or not configured)"}; OpenSpec is the canonical full record.`;
	const lines = ["// 000. sdd status", ""];
	if (!status.change) {
		if (status.selection.kind === "ambiguous") {
			lines.push(`- ${status.selection.candidates.length} cambios activos y ninguno elegido.`);
			lines.push(`- ${t("sdd-status.active", "active")}: ${status.selection.candidates.join(", ")}`);
			lines.push("- Indica cuál con su nombre antes de continuar.");
		} else {
			lines.push("- " + t(
				"sdd-status.none",
				"No active SDD changes in openspec/changes/.",
			));
		}
		lines.push(`- ${notebook}`);
		return lines.join("\n");
	}

	const present = status.artifacts.present
		.map((artifact) => `${artifact.phase}(${artifact.file})`)
		.join(", ") || t("sdd-status.no-active", "none");
	const missing = status.artifacts.missing
		.map((artifact) => `${artifact.phase}(${artifact.file})`)
		.join(", ") || t("sdd-status.no-active", "none");
	lines.push(`${t("sdd-status.change", "change")}: ${status.change}`);
	if (active.length > 1) {
		lines.push(`${t("sdd-status.active", "active")}: ${active.join(", ")}`);
	}
	lines.push(`${t("sdd-status.lane", "lane")}: ${status.lane}`);
	lines.push(`${t("sdd-status.current", "current phase")}: ${status.currentPhase}`);
	lines.push(`${t("sdd-status.next", "next")}: ${status.nextRecommended}`);
	lines.push(`${t("sdd-status.artifacts.present", "artifacts present")}: ${present}`);
	lines.push(`${t("sdd-status.artifacts.missing", "artifacts missing")}: ${missing}`);
	lines.push(`${t("sdd-status.apply", "apply")}: ${status.apply}`);
	lines.push(`${t("sdd-status.verify", "verify")}: ${status.verify}`);
	lines.push(`${t("sdd-status.tasks", "tasks")}: status=${status.tasks.status ?? "absent"} · ready=${status.tasks.counts.ready} · blocked=${status.tasks.counts.blocked} · pending=${status.tasks.counts.pending} · done=${status.tasks.counts.done}`);
	if (status.tasks.nextPending) {
		lines.push(`${t("sdd-status.next-pending", "next pending")}: ${status.tasks.nextPending.id} ${status.tasks.nextPending.title}`);
	}
	if (status.tasks.blockedBy) {
		lines.push(`${t("sdd-status.blocked-by", "blocked_by")}: ${status.tasks.blockedBy}`);
	}
	lines.push(`${t("sdd-status.budget", "budget")}: ${formatBudget(status.budget)}`);
	lines.push(notebook);

	const blockers = sddStatusBlockers({
		blocked: status.blocked,
		taskProblems: status.tasks.problems,
		budgetProblems: status.budget.problems,
	});
	if (blockers.length) {
		lines.push("", `▏ ${t("sdd-status.blocked", "blockers")}:`);
		for (const blocker of blockers) lines.push(`- ${blocker}`);
	}
	const remedies = formatSddRemedies(collectSddRemedies(status));
	if (remedies) lines.push("", remedies);
	return lines.join("\n");
}

export function commandArgsText(args: unknown): string {
	if (typeof args === "string") return args;
	return Array.isArray(args) ? args.join(" ") : "";
}

export function parseSddNextArgs(
	args: string | string[],
): { change: string | null } {
	const parts = commandArgsText(args).trim().split(/\s+/).filter(Boolean);
	const change = parts.filter((part) => !part.startsWith("--"))[0] ?? null;
	return { change };
}

export function formatSddNextHelp(): string {
	return [
		"// 000. sdd next",
		"",
		"Uso: /ein:sdd-next <change>",
		"",
		"- Muestra el siguiente paso recomendado para un cambio concreto.",
		"- No elige un cambio activo implicitamente.",
		"- Entrega ese paso al orquestador para que lo ejecute; la ruta la sigue decidiendo el router.",
	].join("\n");
}

export function formatSddNext(report: SddNextReport): string {
	const lines = [
		"// 000. sdd next",
		"",
		`cambio: ${report.change ?? "ninguno"}`,
		`fase actual: ${report.currentPhase}`,
		`siguiente recomendado: ${report.nextRecommended}`,
		`razon: ${report.reason}`,
		`accion sugerida: ${report.suggestedAction}`,
	];
	if (report.blocked.length > 0) {
		lines.push("", "▏ revisar antes de avanzar:");
		for (const item of report.blocked) lines.push(`- ${item}`);
	}
	return lines.join("\n");
}
