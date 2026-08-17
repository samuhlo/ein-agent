// =============================================================================
// [CORE] REMEDIOS DE ESTADO SDD
// Traduce un estado bloqueante ya calculado en la acción concreta que lo
// desbloquea.
//
// Existe porque esos remedios vivían como prosa en el prompt del orquestador
// —pagada en cada turno de cada sesión— explicando lo que el router YA calcula:
// qué significa cada `specState`, y qué hacer cuando `verifyStale`. El dato
// estaba; solo faltaba que la herramienta lo dijera.
//
// Es el patrón `fix` del envelope de diagnóstico: un bloqueo que no dice cómo
// salir obliga a interpretar, y un ejecutor barato interpreta mal. Un bloqueo
// con su remedio se resuelve sin leer un manual.
//
// Módulo puro: recibe el estado como parámetro y devuelve texto. No lee, no
// escribe, no ejecuta.
// =============================================================================

import type { OpenSpecState } from "./openspec-spec-sync.ts";

/**
 * El remedio tiene que nombrar el comando REAL, y ese difiere por runtime: un
 * "ejecuta la sincronización" genérico es menos accionable que la prosa que
 * sustituye, que al menos nombraba la herramienta de Pi.
 */
export type RemedyRuntime = "pi" | "claude";

const SYNC_COMMAND: Readonly<Record<RemedyRuntime, string>> = Object.freeze({
	pi: "`ein_openspec_sync`",
	claude: "`cc-ein-sdd sync <change>`",
});

export type SddRemedy = Readonly<{
	/** Qué está bloqueado, en una etiqueta estable. */
	code: "spec-state" | "verify-stale" | "summary-stale";
	/** Qué pasa. */
	message: string;
	/** Qué hacer para salir. La frase accionable. */
	fix: string;
}>;

/**
 * Remedio para el estado de sincronización de specs. `synchronized` no es un
 * bloqueo, así que no produce remedio.
 */
export function specStateRemedy(
	state: OpenSpecState | "legacy",
	runtime: RemedyRuntime = "pi",
): SddRemedy | null {
	switch (state) {
		case "pending":
			return {
				code: "spec-state",
				message: "el cambio tiene deltas de comportamiento cuyo sync-report falta o está obsoleto",
				fix: `ejecuta ${SYNC_COMMAND[runtime]} y cierra cuando reporte \`synchronized\``,
			};
		case "unresolved":
			return {
				code: "spec-state",
				message: "`scope.md` no declara su delta de spec",
				fix: "añade el bloque `## Spec delta declaration` con un motivo real, o crea el delta; forzar el cierre solo es honesto si heredaste un artefacto antiguo y el trabajo está terminado",
			};
		case "conflict":
			return {
				code: "spec-state",
				message: "los deltas se contradicen entre sí",
				fix: "resuélvelos a mano; forzar NO archiva sobre un conflicto",
			};
		default:
			return null;
	}
}

/**
 * Una corrección aplicada DESPUÉS de escribir `verify-report.md` invalida la
 * verificación: el cierre no puede apoyarse en evidencia obsoleta.
 */
export function verifyStaleRemedy(verifyStale: boolean): SddRemedy | null {
	if (!verifyStale) return null;
	return {
		code: "verify-stale",
		message: "`verify-report.md` es anterior al último apply: una corrección posterior invalidó la verificación",
		fix: "delega `sdd-verify` de nuevo y regenera `summary.md` antes de cerrar",
	};
}

export function summaryStaleRemedy(summaryStale: boolean): SddRemedy | null {
	if (!summaryStale) return null;
	return {
		code: "summary-stale",
		message: "`summary.md` es anterior a apply/verify: no refleja el estado real",
		fix: "regenera el resumen con la fase de cierre antes de archivar",
	};
}

/** Todos los remedios que aplican a un estado, en orden estable. */
export function collectSddRemedies(
	status: {
		specState: OpenSpecState | "legacy";
		verifyStale: boolean;
		summaryStale: boolean;
	},
	runtime: RemedyRuntime = "pi",
): readonly SddRemedy[] {
	return Object.freeze(
		[
			specStateRemedy(status.specState, runtime),
			verifyStaleRemedy(status.verifyStale),
			summaryStaleRemedy(status.summaryStale),
		].filter((remedy): remedy is SddRemedy => remedy !== null),
	);
}

/** Render compacto para la salida de `status`. Vacío si no hay nada que desbloquear. */
export function formatSddRemedies(remedies: readonly SddRemedy[]): string {
	if (remedies.length === 0) return "";
	return [
		"■ cómo desbloquear:",
		...remedies.map((remedy) => `- [${remedy.code}] ${remedy.message} → ${remedy.fix}`),
	].join("\n");
}
