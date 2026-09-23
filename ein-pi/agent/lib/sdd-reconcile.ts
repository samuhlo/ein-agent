// Phase reconciliation no longer infers completion from global filesystem
// snapshots. The producer and consumer share a receipt bound to one run.

import { collectDelegationAgents } from "./guardrails.ts";
import { PHASE_ARTIFACT, type SddPhase } from "./sdd-routing-core.ts";
import type { PhaseRecovery } from "./sdd-phase-receipt.ts";

const SDD_PHASES = new Set<string>(Object.keys(PHASE_ARTIFACT));

export function phaseForAgent(agent: unknown): SddPhase | null {
	if (typeof agent !== "string") return null;
	const name = agent.trim().toLowerCase();
	if (!name.startsWith("sdd-")) return null;
	const phase = name.slice(4);
	return SDD_PHASES.has(phase) ? (phase as SddPhase) : null;
}

export function resolveDelegationPhase(input: unknown): SddPhase | null {
	const phases = new Set(
		collectDelegationAgents(input)
			.map(phaseForAgent)
			.filter((phase): phase is SddPhase => phase !== null),
	);
	return phases.size === 1 ? [...phases][0]! : null;
}

export function formatReconciliation(result: PhaseRecovery, originalError: string): string {
	const phase = result.launch?.phase ?? "desconocida";
	const artifact = result.launch ? PHASE_ARTIFACT[result.launch.phase] : "artefacto de fase";
	const recovered = result.state === "complete";
	return [
		recovered ? `// sdd reconcile — fase '${phase}' recuperada` : `// sdd reconcile — fase '${phase}' no confirmada`,
		"",
		recovered
			? `El artefacto \`${artifact}\` fue finalizado y recuperado para esta ejecución exacta. Conserva el fallo de transporte; no repitas la fase.`
			: `Artefacto parcial disponible; no hay finalización completa para esta ejecución. ${result.reason}`,
		"",
		"fallo original del runner:",
		originalError.trim() ? indent(originalError.trim()) : "  (sin detalle)",
	].join("\n");
}

function indent(text: string): string {
	return text.split("\n").map((line) => `  ${line}`).join("\n");
}
