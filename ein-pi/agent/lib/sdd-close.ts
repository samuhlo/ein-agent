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
	// Guard determinista: no archivar sobre evidencia incompleta u obsoleta (una
	// corrección posterior a verify deja el summary/verify viejos). `--force` lo
	// sortea a conciencia.
	if (!options.force) {
		const readiness = assessCloseReadiness(cwd, change);
		if (!readiness.ready) {
			return { ok: false, from, to, reason: `cambio no listo para cierre: ${readiness.reasons.join(" ")} (usa --force para forzar)` };
		}
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
