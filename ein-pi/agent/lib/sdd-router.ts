// =============================================================================
// PI SDD ROUTER FACADE
// Shared state and routing live in sdd-routing-core. This historical entrypoint
// keeps Pi consumers stable and owns only the Pi-specific handoff wording.
// =============================================================================

import type { SddNextReport } from "./sdd-routing-core.ts";

export * from "./sdd-routing-core.ts";
export * from "./sdd-close-readiness.ts";
export { assessCloseReadiness } from "./sdd-close-readiness-runtime.ts";
export {
	listActiveChangeSummaries,
	resolveSddNext,
	resolveSddStatus,
} from "./sdd-routing-runtime.ts";

// The public command prints this report to the user, while the orchestrator is
// the component that acts. This Pi-only translation turns the deterministic
// route into a bounded handoff without asking the model to derive the phase.
export function sddNextHandoff(report: SddNextReport): string | null {
	if (!report.exists || report.change === null || report.nextRecommended === "done") return null;
	const phase = report.nextRecommended;
	const run = phase === "close"
		? 'Run `subagent({ agent: "sdd-close", task: "…" })` to condense `summary.md`, then archive with the `ein_sdd_close` tool.'
		: `Run \`subagent({ agent: "sdd-${phase}", task: "…" })\` with the bounded task for this change.`;
	const lines = [
		`Continue the SDD change '${report.change}'.`,
		`Deterministic route, already computed — do NOT re-derive it and do NOT skip phases: current phase \`${report.currentPhase}\`, next phase to run \`${phase}\`.`,
		run,
		"Honor the change's recorded lane and TDD stance, and keep every normal scope, write, and safety requirement.",
	];
	if (report.blocked.length > 0) {
		lines.push("Resolve these router-reported blockers first; never advance past one silently:");
		for (const item of report.blocked) lines.push(`- ${item}`);
	}
	return lines.join("\n");
}
