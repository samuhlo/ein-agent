import {
	collectSddRemedies,
	formatBudget,
	formatSddRemedies,
	sddStatusBlockers,
	type ChangeLintReport,
	type SddChangeStatus,
} from "../../shared/ports/sdd.ts";

export function formatSddStatus(status: SddChangeStatus, active: readonly string[]): string {
	const lines = ["// 000. sdd status", ""];
	if (!status.change) {
		lines.push("- No active SDD changes in openspec/changes/.");
		lines.push("- OpenSpec is the canonical full record.");
		return lines.join("\n");
	}
	const present = status.artifacts.present.map((artifact) => `${artifact.phase}(${artifact.file})`).join(", ") || "none";
	const missing = status.artifacts.missing.map((artifact) => `${artifact.phase}(${artifact.file})`).join(", ") || "none";
	lines.push(`change: ${status.change}`);
	if (active.length > 1) lines.push(`active: ${active.join(", ")}`);
	lines.push(`lane: ${status.lane}`);
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
		lines.push("", "▏ blockers:");
		for (const blocker of blockers) lines.push(`- ${blocker}`);
	}
	const remedies = formatSddRemedies(
		collectSddRemedies({ ...status, nextPhase: status.nextRecommended }, "claude"),
	);
	if (remedies) lines.push("", remedies);
	return lines.join("\n");
}

export function formatSddCheck(report: ChangeLintReport): string {
	const { change, errors, warnings, phases } = report;
	const present = phases.filter((phase) => phase.present).length;
	const lines = [
		`// 000. sdd check — ${change}`,
		"",
		`phases: ${present}/${phases.length} present  |  errors: ${errors}  |  warnings: ${warnings}`,
	];
	if (report.issues.length > 0) {
		lines.push("", "▏ consistency:");
		for (const issue of report.issues) lines.push(`  - ${issue.level.toUpperCase()} [${issue.code}]: ${issue.message}`);
	}
	for (const { phase, present: isPresent, report: phaseReport } of phases) {
		if (!isPresent) {
			lines.push(`▏ ${phase} — MISSING`);
			continue;
		}
		const ok = phaseReport!.errors === 0;
		const detail = phaseReport!.lineCount > 0 ? `, ${phaseReport!.lineCount} lines` : "";
		lines.push(`▏ ${phase} — ${ok ? "OK" : "ERRORS"} (present${detail})`);
		for (const issue of phaseReport!.issues) lines.push(`  - ${issue.level.toUpperCase()} [${issue.code}]: ${issue.message}`);
	}
	return lines.join("\n");
}
