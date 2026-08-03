#!/usr/bin/env bun
// =============================================================================
// cc-ein-sdd — CLI determinista del flujo SDD para Claude Code
// -----------------------------------------------------------------------------
// Reusa el MISMO core determinista que Pi (`ein-pi/agent/lib`, TS puro sin API
// de Pi): resolveSddStatus/Next, lintChange, closeChange. Los agentes de cc-ein
// lo llaman por Bash en vez de las tools `ein_sdd_*` de Pi. Solo lee/mueve el
// filesystem — cero IA, cero adivinación.
//
//   cc-ein-sdd status [change]     estado + nextRecommended (rutea por `next:`)
//   cc-ein-sdd check  [change]     gatekeeper: linta cada artefacto presente
//   cc-ein-sdd close  <change> [--force]   archiva un cambio verificado
// =============================================================================

import {
	resolveSddStatus,
	resolveSddPlanPreview,
	formatSddPlanPreview,
	sddStatusBlockers,
	formatBudget,
	listActiveChanges,
	type SddChangeStatus,
} from "../../ein-pi/agent/lib/sdd-router.ts";
import { lintChange, type ChangeLintReport } from "../../ein-pi/agent/lib/sdd-guardrails.ts";
import { closeChange } from "../../ein-pi/agent/lib/sdd-close.ts";

const cwd = process.cwd();

// ── Formatters (reimplementados sin i18n; strings inglesas, mismos campos) ──

function formatStatus(status: SddChangeStatus, active: string[]): string {
	const lines = ["/// 000. SDD STATUS", ""];
	if (!status.change) {
		lines.push("- No active SDD changes in openspec/changes/.");
		lines.push("- OpenSpec is the canonical full record.");
		return lines.join("\n");
	}
	const present = status.artifacts.present.map((a) => `${a.phase}(${a.file})`).join(", ") || "none";
	const missing = status.artifacts.missing.map((a) => `${a.phase}(${a.file})`).join(", ") || "none";
	lines.push(`change: ${status.change}`);
	if (active.length > 1) lines.push(`active: ${active.join(", ")}`);
	lines.push(`current phase: ${status.currentPhase}`);
	lines.push(`next: ${status.nextRecommended}`);
	lines.push(`artifacts present: ${present}`);
	lines.push(`artifacts missing: ${missing}`);
	lines.push(`apply: ${status.apply}`);
	lines.push(`verify: ${status.verify}`);
	lines.push(
		`tasks: status=${status.tasks.status ?? "absent"} · ready=${status.tasks.counts.ready} · blocked=${status.tasks.counts.blocked} · pending=${status.tasks.counts.pending} · done=${status.tasks.counts.done}`,
	);
	if (status.tasks.nextPending) lines.push(`next pending: ${status.tasks.nextPending.id} ${status.tasks.nextPending.title}`);
	if (status.tasks.blockedBy) lines.push(`blocked_by: ${status.tasks.blockedBy}`);
	lines.push(`budget: ${formatBudget(status.budget)}`);

	const blockers = sddStatusBlockers({
		blocked: status.blocked,
		taskProblems: status.tasks.problems,
		budgetProblems: status.budget.problems,
	});
	if (blockers.length) {
		lines.push("", "■ blockers:");
		for (const b of blockers) lines.push(`- ${b}`);
	}
	return lines.join("\n");
}

function formatCheck(report: ChangeLintReport): string {
	const { change, errors, warnings, phases } = report;
	const present = phases.filter((p) => p.present).length;
	const lines = [
		`/// 000. SDD CHECK — ${change}`,
		"",
		`phases: ${present}/${phases.length} present  |  errors: ${errors}  |  warnings: ${warnings}`,
	];
	if (report.issues.length > 0) {
		lines.push("", "■ consistency:");
		for (const i of report.issues) lines.push(`  - ${i.level.toUpperCase()} [${i.code}]: ${i.message}`);
	}
	for (const { phase, present: isPresent, report: pr } of phases) {
		if (!isPresent) {
			lines.push(`■ ${phase} — MISSING`);
			continue;
		}
		const ok = pr!.errors === 0;
		const detail = pr!.lineCount > 0 ? `, ${pr!.lineCount} lines` : "";
		lines.push(`■ ${phase} — ${ok ? "OK" : "ERRORS"} (present${detail})`);
		for (const i of pr!.issues) lines.push(`  - ${i.level.toUpperCase()} [${i.code}]: ${i.message}`);
	}
	return lines.join("\n");
}

// ── Dispatch ────────────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);
const force = rest.includes("--force");
const change = rest.find((a) => !a.startsWith("--"));

function statusCmd() {
	const status = resolveSddStatus(cwd, change);
	const active = listActiveChanges(cwd);
	let text = formatStatus(status, active);
	if (status.nextRecommended === "apply" && status.change) {
		const block = formatSddPlanPreview(resolveSddPlanPreview(cwd, status.change));
		if (block) text += `\n\n${block}`;
	}
	console.log(text);
}

function checkCmd() {
	const target = change ?? resolveSddStatus(cwd).change;
	if (!target) {
		console.log("/// SDD CHECK — no active change in openspec/changes/.");
		process.exit(1);
	}
	const report = lintChange(cwd, target);
	console.log(formatCheck(report));
	if (report.errors > 0) process.exit(1);
}

function closeCmd() {
	const target = change ?? resolveSddStatus(cwd).change;
	if (!target) {
		console.log("/// SDD CLOSE — no active change to close.");
		process.exit(1);
	}
	const result = closeChange(cwd, target, { force });
	if (result.ok) {
		console.log(`/// SDD CLOSE — ${target} archived → ${result.to}`);
		return;
	}
	const lines = [`/// SDD CLOSE — ${target} NOT archived`, ""];
	for (const b of result.blockers ?? []) lines.push(`- [${b.code}] ${b.message}`);
	if (!result.blockers?.length && result.reason) lines.push(`- ${result.reason}`);
	console.log(lines.join("\n"));
	process.exit(1);
}

switch (cmd) {
	case "status": statusCmd(); break;
	case "check": checkCmd(); break;
	case "close": closeCmd(); break;
	default:
		console.log("cc-ein-sdd <status|check|close> [change] [--force]");
		process.exit(1);
}
