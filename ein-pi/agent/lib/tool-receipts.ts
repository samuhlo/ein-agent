// =============================================================================
// [CORE] RECIBOS DE HERRAMIENTA
// Una línea por llamada, en vez de un volcado.
//
// POR QUÉ -> `ein_sdd_status` y `ein_sdd_check` son las dos tools que más se
// llaman: una por decisión de ruta y otra tras cada fase. Cada una escupía unas
// veinte líneas densas al chat. El problema no era el contenido, era que ese
// texto tiene DOS PÚBLICOS confundidos en uno: el modelo, que necesita los
// hechos para enrutar, y el humano, que solo necesita saber dónde está.
//
// Pi permite separarlos sin perder nada: el `content` de la tool sigue yendo
// ÍNTEGRO al modelo, y `renderResult` decide qué se pinta. Así el humano ve un
// recibo y el modelo mantiene sus datos — y el estado legible sigue estando en
// el overlay, que es su sitio (STYLE.md // 002, regla 10).
//
// Módulo PURO: entra el `details` de la tool, sale una frase. Sin Pi, sin UI.
// =============================================================================

import { GLYPH } from "./chrome.ts";
import type { SddChangeStatus } from "./sdd-router.ts";

/** Une con el punto medio, sin pintar: el color lo pone quien renderiza. */
function meta(parts: readonly string[]): string {
	return parts.filter((part) => part.length > 0).join(` ${GLYPH.sep} `);
}

/**
 * Recibo de `ein_sdd_status`. Dice lo único que el humano necesita de un
 * vistazo: dónde está el cambio y si algo lo bloquea.
 */
export function statusReceipt(status: SddChangeStatus | undefined | null): string {
	if (!status?.change) return "sin cambio activo";

	const parts = [String(status.nextRecommended)];
	const total = status.tasks?.items?.length ?? 0;
	if (total > 0) parts.push(`${status.tasks.counts.done}/${total}`);

	const blockers = status.blocked?.length ?? 0;
	if (blockers > 0) {
		parts.push(blockers === 1 ? "1 bloqueo" : `${blockers} bloqueos`);
		return meta(parts);
	}
	// Un verify rancio no es un verify: se nombra, porque es la diferencia entre
	// poder cerrar y no poder (§ 002, fail-closed).
	if (status.verifyStale) parts.push("verify rancio");
	else if (status.verify === "fail") parts.push("verify falla");
	else if (status.verify === "unknown") parts.push("verify desconocido");
	return meta(parts);
}

export type ChangeLintSummary = Readonly<{
	change?: string;
	errors?: number;
	warnings?: number;
	phases?: readonly { phase: string; present?: boolean; report?: { errors: number } | null }[];
}>;

/**
 * Recibo de `ein_sdd_check`. El gatekeeper solo importa por su veredicto: si
 * bloquea, cuántos errores; si no, cuántas fases limpias lleva.
 */
export function checkReceipt(report: ChangeLintSummary | undefined | null): string {
	if (!report) return "sin cambio activo";
	const errors = report.errors ?? 0;
	const warnings = report.warnings ?? 0;

	if (errors > 0) {
		const parts = [errors === 1 ? "1 error" : `${errors} errores`];
		if (warnings > 0) parts.push(warnings === 1 ? "1 aviso" : `${warnings} avisos`);
		return meta(parts);
	}

	const present = (report.phases ?? []).filter((entry) => entry.present).length;
	const parts = [`${present} ${present === 1 ? "fase" : "fases"} ${GLYPH.done}`];
	if (warnings > 0) parts.push(warnings === 1 ? "1 aviso" : `${warnings} avisos`);
	return meta(parts);
}

/** true cuando el recibo debe pintarse como problema y no como trámite. */
export function checkFailed(report: ChangeLintSummary | undefined | null): boolean {
	return (report?.errors ?? 0) > 0;
}

export function statusBlocked(status: SddChangeStatus | undefined | null): boolean {
	return (status?.blocked?.length ?? 0) > 0 || status?.verifyStale === true || status?.verify === "fail";
}
