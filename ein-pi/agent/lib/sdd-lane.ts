// =============================================================================
// [CORE] CARRIL DEL CAMBIO
// Un cambio declara con cuántas fases se conduce. Dos carriles, y los elige el
// humano al abrirlo.
//
// POR QUÉ EXISTE -> medido sobre los 44 cambios archivados: 42 usaron las siete
// fases. La ceremonia se paga siempre, también para un cambio de una línea, y el
// manifiesto (§ 008) lo declara no-objetivo explícito.
//
// POR QUÉ LO ELIGE EL HUMANO -> no existe señal determinista ANTES de planificar.
// Lo que mide tamaño (`reviewForecast`) mira el diff ya hecho, y el presupuesto
// declarado solo existe cuando ya hay `tasks.md`: los dos llegan después del
// punto donde hay que decidir. Inventar una heurística ahí ascendería un
// determinismo débil a conclusión, que es lo que § 002 prohíbe.
//
// POR QUÉ `micro` SON CINCO FASES Y NO TRES -> `scope.md` guarda la declaración
// de delta de spec, y sin ella el cierre se bloquea (`spec-delta-unresolved`).
// Cerrar sigue siendo puerta dura. Lo que se ahorra —`map` y `tasks`— son
// justamente las dos fases que LEEN CÓDIGO, las más lentas después de apply.
//
// FAIL CLOSED -> un fichero ausente, ilegible o con un valor desconocido cae a
// `standard`. El error se paga en ceremonia de más, nunca en comprobación de
// menos.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { SddPhase } from "./sdd-router.ts";

export type SddLane = "micro" | "standard";

export const SDD_LANES: readonly SddLane[] = ["micro", "standard"];

/** El carril por defecto. Nunca se degrada a `micro` por accidente. */
export const DEFAULT_LANE: SddLane = "standard";

/**
 * Las fases que cada carril espera, en orden. `micro` no relaja `verify` ni
 * `close`: solo se salta el centro caro.
 */
export const LANE_PHASES: Readonly<Record<SddLane, readonly SddPhase[]>> = Object.freeze({
	standard: Object.freeze(["scope", "map", "design", "tasks", "apply", "verify", "close"] as const),
	micro: Object.freeze(["scope", "design", "apply", "verify", "close"] as const),
});

export const LANE_LABEL: Readonly<Record<SddLane, string>> = Object.freeze({
	micro: "micro (sin map ni tasks)",
	standard: "standard (siete fases)",
});

export function laneConfigPath(changeDir: string): string {
	return join(changeDir, "lane.json");
}

export function normalizeLane(value: unknown): SddLane | undefined {
	if (typeof value !== "string") return undefined;
	const token = value.trim().toLowerCase();
	return (SDD_LANES as readonly string[]).includes(token) ? (token as SddLane) : undefined;
}

/** Lee el carril declarado. Todo lo que no sea una declaración válida es `standard`. */
export function readChangeLane(changeDir: string): SddLane {
	const path = laneConfigPath(changeDir);
	if (!existsSync(path)) return DEFAULT_LANE;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return normalizeLane((parsed as Record<string, unknown>).lane) ?? DEFAULT_LANE;
		}
	} catch {
		// Fichero roto → ceremonia completa, que es el lado seguro del error.
	}
	return DEFAULT_LANE;
}

export function writeChangeLane(changeDir: string, lane: SddLane): void {
	const path = laneConfigPath(changeDir);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ lane }, null, 2)}\n`);
}

/** ¿Esta fase se ejecuta en este carril? */
export function laneIncludes(lane: SddLane, phase: SddPhase): boolean {
	return LANE_PHASES[lane].includes(phase);
}

/** Las fases que este carril NO ejecuta. Vacío en `standard`. */
export function laneSkips(lane: SddLane): readonly SddPhase[] {
	return LANE_PHASES.standard.filter((phase) => !laneIncludes(lane, phase));
}
