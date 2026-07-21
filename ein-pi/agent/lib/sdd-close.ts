// =============================================================================
// SDD CLOSE (deterministic move)
// Cierra un cambio terminado: mueve openspec/changes/<change>/ a
// openspec/changes/archive/<change>/ para que `openspec/changes/` solo contenga
// cambios VIVOS y el estado quede revisable y ordenado. El resumen condensado
// (summary.md) lo escribe el agente sdd-close ANTES de llamar a esto; aquí
// solo se hace el movimiento, que es determinista y debe ser fiable.
// Módulo puro (builtins de Node).
// =============================================================================

import { existsSync, mkdirSync, renameSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { assessCloseReadiness, resolveChangesDir } from "./sdd-router.ts";

export type CloseResult = {
	ok: boolean;
	from: string;
	to: string;
	reason?: string;
};

export type CloseOptions = { force?: boolean };

// Misma resolución dual que el router: openspec/changes/ o .sdd/changes/.
function changesDir(cwd: string): string {
	return resolveChangesDir(cwd);
}

export function closedChangePath(cwd: string, change: string): string {
	return join(changesDir(cwd), "archive", change);
}

// Storage interno heredado: `archive/` conserva historial sin migración destructiva.
export function closeChange(cwd: string, change: string, options: CloseOptions = {}): CloseResult {
	const from = join(changesDir(cwd), change);
	const to = closedChangePath(cwd, change);

	if (change === "archive" || change.includes("/") || change.includes("..")) {
		return { ok: false, from, to, reason: "nombre de cambio inválido" };
	}
	if (!existsSync(from)) {
		return { ok: false, from, to, reason: "el cambio no existe en el directorio de cambios" };
	}
	if (existsSync(to)) {
		return { ok: false, from, to, reason: "ya existe en archive/; no se pisa" };
	}
	const readiness = assessCloseReadiness(cwd, change);
	// Solo `conflict` es INMUNE a --force: dos deltas que se contradicen son una
	// incoherencia real de contenido, y archivar encima la congelaría.
	//
	// `unresolved`/`pending` NO son inmunes. Fueron absolutos en su primera
	// versión y eso dejó el cierre MUERTO: un cambio sin bloque de declaración
	// —que es todo cambio anterior a esta feature, y todo cambio cuyo ejecutor
	// de scope no lo escriba— no podía archivarse por ninguna vía. Un gate sin
	// salida convierte un problema de metadatos en un callejón. `--force` exige
	// una acción humana explícita y el motivo va en el mensaje: eso es
	// consentimiento informado, no un bypass silencioso.
	const specConflict = readiness.reasons.find((reason) =>
		reason.startsWith("estado de specs OpenSpec: conflict"),
	);
	if (specConflict) {
		return {
			ok: false,
			from,
			to,
			reason: `cambio no listo para cierre: ${specConflict} Resuelve el conflicto de deltas: --force NO archiva sobre specs contradictorias.`,
		};
	}
	if (!options.force && !readiness.ready) {
		return { ok: false, from, to, reason: `cambio no listo para cierre: ${readiness.reasons.join(" ")} (usa --force para forzar)` };
	}

	mkdirSync(join(changesDir(cwd), "archive"), { recursive: true });
	try {
		renameSync(from, to);
	} catch {
		// Fallback cross-device: copia recursiva + borra el origen.
		try {
			cpSync(from, to, { recursive: true });
			rmSync(from, { recursive: true, force: true });
		} catch (error) {
			return {
				ok: false,
				from,
				to,
				reason: error instanceof Error ? error.message : String(error),
			};
		}
	}
	return { ok: true, from, to };
}
