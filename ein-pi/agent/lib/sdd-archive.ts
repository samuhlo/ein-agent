// =============================================================================
// SDD ARCHIVE (deterministic move)
// Cierra un cambio terminado: mueve openspec/changes/<change>/ a
// openspec/changes/archive/<change>/ para que `openspec/changes/` solo contenga
// cambios VIVOS y el estado quede revisable y ordenado. El resumen condensado
// (summary.md) lo escribe el agente sdd-archive ANTES de llamar a esto; aquí
// solo se hace el movimiento, que es determinista y debe ser fiable.
// Módulo puro (builtins de Node).
// =============================================================================

import { existsSync, mkdirSync, renameSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";

export type ArchiveResult = {
	ok: boolean;
	from: string;
	to: string;
	reason?: string;
};

function changesDir(cwd: string): string {
	return join(cwd, "openspec", "changes");
}

export function archivedChangePath(cwd: string, change: string): string {
	return join(changesDir(cwd), "archive", change);
}

// Mueve el directorio del cambio a archive/. Idempotente-ish: si el destino ya
// existe, no pisa (devuelve ok:false con razón). Usa rename y cae a copy+rm si
// cruza dispositivos.
export function archiveChange(cwd: string, change: string): ArchiveResult {
	const from = join(changesDir(cwd), change);
	const to = archivedChangePath(cwd, change);

	if (change === "archive" || change.includes("/") || change.includes("..")) {
		return { ok: false, from, to, reason: "nombre de cambio inválido" };
	}
	if (!existsSync(from)) {
		return { ok: false, from, to, reason: "el cambio no existe en openspec/changes/" };
	}
	if (existsSync(to)) {
		return { ok: false, from, to, reason: "ya existe en archive/; no se pisa" };
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
