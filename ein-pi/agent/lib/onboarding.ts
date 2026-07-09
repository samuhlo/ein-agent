// =============================================================================
// [FLOW] ONBOARDING FIRST-RUN
// Primer contacto de Ein con un proyecto: si algún esencial no está configurado
// (persona, idioma de artefactos, TDD, Hypa) o falta EIN.md, un wizard único en
// session_start lo resuelve. Agnóstico a la edad del proyecto: no mira "¿es
// nuevo?", mira "¿está configurado?" → un repo ya empezado se autoconfigura la
// primera vez que abres pi con UI.
//
// FRICTION CUT -> "Usar recomendados" escribe defaults sensatos de un toque.
// Los pendientes = ficheros ausentes; una vez escritos, no vuelve a preguntar.
// Sin UI (subagentes) es no-op: cada feature ya defaultea por su cuenta.
// =============================================================================

import { existsSync } from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	PERSONA_OPTIONS,
	type PersonaMode,
	personaConfigPath,
	writePersonaMode,
} from "./persona.ts";
import {
	ACTIVE_LANGS,
	LANG_LABEL,
	type Lang,
	langConfigPath,
	readChatLang,
	writeArtifactLang,
} from "./lang.ts";
import { TDD_LABEL, TDD_OPTIONS, tddConfigPath, writeTddMode } from "./tdd.ts";
import { HYPA_OPTIONS, hypaConfigPath, writeHypaMode } from "./hypa.ts";
import { einMdPath, writeEinMd } from "./project-context.ts";

export type Essential = "persona" | "lang" | "tdd" | "hypa" | "einmd";

const HYPA_ONBOARD_LABEL: Record<string, string> = {
	auto: "auto — detecta el stack (recomendado)",
	on: "on — siempre",
	off: "off — nunca",
};

// Defaults recomendados: los mismos que aplicaría cada feature por su cuenta,
// pero escritos explícitamente para que el proyecto quede "configurado".
export function applyDefault(cwd: string, item: Essential): void {
	switch (item) {
		case "persona":
			writePersonaMode(cwd, "samuhlo");
			break;
		case "lang":
			// El idioma de CHAT es global; aquí se fija el de artefactos (PR/commit)
			// del proyecto → por defecto, el mismo que el chat.
			writeArtifactLang(cwd, readChatLang());
			break;
		case "tdd":
			writeTddMode(cwd, "auto");
			break;
		case "hypa":
			writeHypaMode(cwd, "auto");
			break;
		case "einmd":
			writeEinMd(cwd);
			break;
	}
}

// Esenciales sin configurar = fichero ausente. EIN.md vive en la raíz; el resto
// en .pi/ein/*.json.
export function pendingEssentials(cwd: string): Essential[] {
	const checks: Array<[Essential, string]> = [
		["persona", personaConfigPath(cwd)],
		["lang", langConfigPath(cwd)],
		["tdd", tddConfigPath(cwd)],
		["hypa", hypaConfigPath(cwd)],
		["einmd", einMdPath(cwd)],
	];
	return checks.filter(([, path]) => !existsSync(path)).map(([item]) => item);
}

// Rama "Personalizar": pregunta cada pendiente reusando las listas de cada
// feature. Devuelve un resumen de lo aplicado.
async function customize(
	ctx: ExtensionContext,
	pending: Essential[],
): Promise<string[]> {
	const applied: string[] = [];
	for (const item of pending) {
		if (item === "einmd") {
			const yes = await ctx.ui.confirm(
				"¿Generar EIN.md (índice del proyecto)?",
				"Contexto versionado: stack, comandos, estructura, docs.",
			);
			if (yes) {
				writeEinMd(ctx.cwd);
				applied.push("EIN.md: generado");
			}
			continue;
		}
		const [label, options, write] = FEATURE[item];
		const items = options.map((o) => o.label);
		const picked = await ctx.ui.select(label, items);
		if (picked === undefined) continue;
		const opt = options[items.indexOf(picked)];
		if (!opt) continue;
		write(ctx.cwd, opt.value);
		applied.push(`${item}: ${opt.value}`);
	}
	return applied;
}

// Tabla feature → (pregunta, opciones, writer). Tipada laxa a propósito para
// mapear cuatro features con enums distintos sin acoplar.
type FeatureSpec = [
	label: string,
	options: Array<{ label: string; value: string }>,
	write: (cwd: string, value: string) => void,
];

const FEATURE: Record<Exclude<Essential, "einmd">, FeatureSpec> = {
	persona: [
		"Persona (tono y estética de las respuestas)",
		PERSONA_OPTIONS.map((p) => ({ label: p, value: p })),
		(cwd, v) => writePersonaMode(cwd, v as PersonaMode),
	],
	lang: [
		"Idioma de artefactos (PR/commit/issues)",
		ACTIVE_LANGS.map((l) => ({ label: `${l} — ${LANG_LABEL[l]}`, value: l })),
		(cwd, v) => writeArtifactLang(cwd, v as Lang),
	],
	tdd: [
		"TDD estricto en SDD",
		TDD_OPTIONS.map((t) => ({ label: `${t} — ${TDD_LABEL[t]}`, value: t })),
		(cwd, v) => writeTddMode(cwd, v as (typeof TDD_OPTIONS)[number]),
	],
	hypa: [
		"Compresión de salida de comandos (Hypa)",
		HYPA_OPTIONS.map((h) => ({ label: HYPA_ONBOARD_LABEL[h] ?? h, value: h })),
		(cwd, v) => writeHypaMode(cwd, v as (typeof HYPA_OPTIONS)[number]),
	],
};

// Wizard de onboarding. No-op sin UI o sin pendientes. Con `all`, reconfigura
// todo (lo usa /ein:onboard) en vez de solo lo ausente.
export async function runOnboarding(
	ctx: ExtensionContext,
	opts: { all?: boolean } = {},
): Promise<void> {
	if (!ctx.hasUI) return;
	const pending = opts.all
		? (["persona", "lang", "tdd", "hypa", "einmd"] as Essential[])
		: pendingEssentials(ctx.cwd);
	if (pending.length === 0) {
		if (opts.all) ctx.ui.notify("Todo ya configurado.", "info");
		return;
	}

	const choice = await ctx.ui.select(
		"Primera vez de Ein en este proyecto. ¿Cómo lo configuro?",
		[
			"Usar recomendados (persona samuhlo, TDD auto, Hypa auto, EIN.md)",
			"Personalizar",
			"Ahora no",
		],
	);
	if (choice === undefined || choice.startsWith("Ahora no")) return;

	let applied: string[];
	if (choice.startsWith("Personalizar")) {
		applied = await customize(ctx, pending);
	} else {
		for (const item of pending) applyDefault(ctx.cwd, item);
		applied = pending.map((i) => (i === "einmd" ? "EIN.md: generado" : `${i}: default`));
	}

	if (applied.length === 0) return;
	ctx.ui.notify(
		[
			"Ein configurado en este proyecto:",
			...applied.map((a) => `  · ${a}`),
			"Cámbialo cuando quieras con /ein:persona · :lang · :tdd · :hypa, o /ein:onboard.",
		].join("\n"),
		"info",
	);
}

export async function handleOnboardCommand(ctx: ExtensionContext): Promise<void> {
	await runOnboarding(ctx, { all: true });
}
