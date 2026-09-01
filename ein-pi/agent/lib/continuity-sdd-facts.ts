// =============================================================================
// [CORE] HECHOS SDD PARA EL CHECKPOINT
// Traduce el estado determinista de un cambio SDD a los tres campos que el
// checkpoint transportaba vacíos. No lee, no escribe: recibe el estado ya
// resuelto y devuelve hechos.
// =============================================================================

import { CONTINUITY_CHECKPOINT_LIMITS, isSafeCheckpointText } from "./continuity-checkpoint.ts";
import type { SddChangeStatus } from "./sdd-routing-core.ts";

/** Los tres campos que el ciclo de vida no sabía rellenar. */
export type ContinuitySddFacts = Readonly<{
	completed: readonly string[];
	nextAction: string;
	unresolvedDecisions: readonly string[];
}>;

const { maxItemBytes, maxListItems, maxNextActionBytes } = CONTINUITY_CHECKPOINT_LIMITS;

/**
 * Un título de tarea es texto que escribió un modelo: puede traer una ruta
 * absoluta o un secreto. Se descarta el item, nunca el paquete.
 */
function admitted(values: readonly unknown[]): readonly string[] {
	const out: string[] = [];
	for (const value of values) {
		if (out.length === maxListItems) break;
		if (isSafeCheckpointText(value, maxItemBytes) && !out.includes(value)) out.push(value);
	}
	return Object.freeze(out);
}

function nextActionFor(status: SddChangeStatus, fallback: string): string {
	const change = status.change;
	if (!change) return fallback;
	const pending = status.tasks.nextPending;
	const candidates = [
		pending ? `Resume SDD change ${change} at pending task ${pending.id}: ${pending.title}` : null,
		status.nextRecommended === "done"
			? `SDD change ${change} is complete; archive it before starting new work.`
			: `Run the ${status.nextRecommended} phase of SDD change ${change}.`,
	];
	for (const candidate of candidates) {
		if (isSafeCheckpointText(candidate, maxNextActionBytes)) return candidate;
	}
	return fallback;
}

/**
 * Devuelve `null` cuando no hay nada honesto que declarar: sin cambio resuelto o
 * sin `tasks.md`, el genérico dice la verdad y un hecho inventado no.
 */
export function continuitySddFacts(status: SddChangeStatus, fallbackNextAction: string): ContinuitySddFacts | null {
	if (!status || typeof status !== "object" || !status.change) return null;
	if (!status.tasks?.present) return null;
	const items = Array.isArray(status.tasks.items) ? status.tasks.items : [];
	// Los bloqueos deterministas del router son lo más cercano a una decisión sin
	// resolver que el repo declara hoy; la gramática no tiene sección propia.
	const blockers = [
		...(typeof status.tasks.blockedBy === "string" ? [status.tasks.blockedBy] : []),
		...(Array.isArray(status.blocked) ? status.blocked : []),
	];
	return Object.freeze({
		completed: admitted(items.filter((item) => item?.done).map((item) => item.title)),
		nextAction: nextActionFor(status, fallbackNextAction),
		unresolvedDecisions: admitted(blockers),
	});
}
