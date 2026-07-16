// =============================================================================
// TDD MODE
// Política de TDD estricto de Ein, persistente por proyecto en
// .pi/ein/tdd.json. Decide si las fases SDD aplican el ciclo RED/GREEN:
//   - auto   → respeta openspec/config.yaml (strict_tdd).
//   - strict → fuerza TDD estricto siempre.
//   - off    → nunca TDD (cambios triviales/visuales, sin quemar tokens).
//   - ask    → pregunta al usuario antes de cada apply.
// Calcado del patrón de persona.ts / lang.ts. Módulo puro (sin imports
// externos de valor) para no acoplar a paquetes en tests.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type TddMode = "auto" | "strict" | "off" | "ask";

export const TDD_OPTIONS: readonly TddMode[] = ["auto", "strict", "off", "ask"];

export const TDD_LABEL: Record<TddMode, string> = {
	auto: "auto (config)",
	strict: "estricto",
	off: "off",
	ask: "preguntar",
};

// Default OFF: la mayoría del trabajo (frontend/simple) no necesita el ciclo
// RED/GREEN y no debe quemar tokens. strict es opt-in (preflight o /ein:tdd).
const DEFAULT_TDD: TddMode = "off";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTdd(value: unknown): TddMode | undefined {
	if (typeof value !== "string") return undefined;
	const token = value.trim().toLowerCase();
	return (TDD_OPTIONS as readonly string[]).includes(token)
		? (token as TddMode)
		: undefined;
}

export function tddConfigPath(cwd: string): string {
	return join(cwd, ".pi", "ein", "tdd.json");
}

export function readTddMode(cwd: string): TddMode {
	const path = tddConfigPath(cwd);
	if (!existsSync(path)) return DEFAULT_TDD;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (isRecord(parsed)) return normalizeTdd(parsed.mode) ?? DEFAULT_TDD;
	} catch {
		// fichero ausente o roto → default
	}
	return DEFAULT_TDD;
}

export function writeTddMode(cwd: string, mode: TddMode): void {
	const path = tddConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ mode }, null, 2)}\n`);
}

export async function handleTddCommand(ctx: ExtensionContext): Promise<void> {
	const current = readTddMode(ctx.cwd);
	const items = TDD_OPTIONS.map((m) => `${m} — ${TDD_LABEL[m]}`);
	const picked = await ctx.ui.select(
		`Modo de TDD estricto (actual: ${current})`,
		items,
	);
	const mode = TDD_OPTIONS[items.indexOf(picked)];
	if (!mode) return;
	writeTddMode(ctx.cwd, mode);
	ctx.ui.notify(
		[
			`TDD estricto: ${mode} (${TDD_LABEL[mode]})`,
			mode === "off"
				? "sdd-apply implementará directo, sin ciclo RED/GREEN."
				: mode === "strict"
					? "sdd-apply forzará RED→GREEN→TRIANGULATE→REFACTOR siempre."
					: mode === "ask"
						? "Ein preguntará antes de cada apply si usar TDD estricto."
						: "Se respeta openspec/config.yaml (strict_tdd).",
			`Config: ${tddConfigPath(ctx.cwd)}`,
			"Reinicia Pi o abre una sesión nueva para que el cambio tome efecto en el preflight.",
		].join("\n"),
		"info",
	);
}
