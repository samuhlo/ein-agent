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
import { assessCloseReadiness, isSafeChangeName, resolveChangesDir } from "./sdd-router.ts";

export type CloseBlocker = { code: string; message: string };

export type CloseResult = {
	ok: boolean;
	from: string;
	to: string;
	reason?: string;
	blockers?: CloseBlocker[];
	legacyEscape?: {
		used: true;
		priorSpecState: "unresolved";
		eligibility: "declarationless-record";
		reason: string;
	};
};

export type CloseOptions = { force?: boolean; legacyReason?: string };

const INVALID_LEGACY_REASONS = new Set(["none", "n/a", "na", "tbd", "unknown", "-"]);

function normalizeLegacyReason(reason: string | undefined): string | null {
	const normalized = reason?.trim();
	if (!normalized || normalized.length > 200 || INVALID_LEGACY_REASONS.has(normalized.toLowerCase())) return null;
	return normalized;
}

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

	if (!isSafeChangeName(change)) {
		return { ok: false, from, to, reason: "nombre de cambio inválido" };
	}
	if (!existsSync(from)) {
		return { ok: false, from, to, reason: "el cambio no existe en el directorio de cambios" };
	}
	if (existsSync(to)) {
		return { ok: false, from, to, reason: "ya existe en archive/; no se pisa" };
	}
	const readiness = assessCloseReadiness(cwd, change);
	const escapeEligible = readiness.legacyEligibility === "declarationless-record";
	const nonEscapeBlockers = readiness.blockers.filter((blocker) => blocker.code !== "spec-unresolved");
	const legacyReason = normalizeLegacyReason(options.legacyReason);
	const usesLegacyEscape = options.force && escapeEligible && nonEscapeBlockers.length === 0 && legacyReason !== null;

	if (!readiness.ready && !usesLegacyEscape) {
		const blockers: CloseBlocker[] = [...readiness.blockers];
		if (options.force && escapeEligible && nonEscapeBlockers.length === 0 && legacyReason === null) {
			blockers.push({ code: "legacy-reason-invalid", message: "--force para un registro legacy requiere una razón de auditoría válida." });
		}
		return {
			ok: false,
			from,
			to,
			reason: `cambio no listo para cierre: ${blockers.map((blocker) => blocker.message).join(" ")}`,
			blockers,
		};
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
	return usesLegacyEscape
		? {
			ok: true,
			from,
			to,
			legacyEscape: {
				used: true,
				priorSpecState: "unresolved",
				eligibility: "declarationless-record",
				reason: legacyReason!,
			},
		}
		: { ok: true, from, to };
}
