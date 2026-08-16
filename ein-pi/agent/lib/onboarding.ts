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
	readPersonaMode,
	writePersonaMode,
} from "./persona.ts";
import {
	ACTIVE_LANGS,
	LANG_LABEL,
	type Lang,
	langConfigPath,
	readArtifactLang,
	readChatLang,
	writeArtifactLang,
} from "./lang.ts";
import {
	TDD_LABEL,
	TDD_OPTIONS,
	readTddMode,
	tddConfigPath,
	writeTddMode,
} from "./tdd.ts";
import {
	HYPA_OPTIONS,
	hypaConfigPath,
	readHypaMode,
	writeHypaMode,
} from "./hypa.ts";
import { einMdPath, writeEinMd } from "./project-context.ts";
import {
	agentControlsConfigPath,
	type AgentActivationProfile,
	readAgentActivationProfile,
	writeAgentActivationProfile,
} from "./agent-controls.ts";

export type Essential = "persona" | "lang" | "tdd" | "hypa" | "agents" | "einmd";

const ALL_ESSENTIALS: Essential[] = ["persona", "lang", "tdd", "hypa", "agents", "einmd"];

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
		case "agents":
			writeAgentActivationProfile(cwd, "balanced");
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
		["agents", agentControlsConfigPath(cwd)],
		["einmd", einMdPath(cwd)],
	];
	return checks.filter(([, path]) => !existsSync(path)).map(([item]) => item);
}

// Rama "Personalizar": repasa los esenciales dados (todos, mostrando el valor
// actual) reusando las listas de cada feature. Devuelve lo aplicado.
async function customize(
	ctx: ExtensionContext,
	items: Essential[],
): Promise<string[]> {
	const applied: string[] = [];
	for (const item of items) {
		if (item === "agents") {
			const current = readAgentActivationProfile(ctx.cwd);
			const options: Array<{ label: string; value: AgentActivationProfile }> = [
				{ label: "Balanced (recommended) — Cleaner on, Architect off", value: "balanced" },
				{ label: "Thorough — Cleaner on, Architect on", value: "thorough" },
				{ label: "Manual — Cleaner off, Architect off", value: "manual" },
			];
			const currentLabel = current === "custom"
				? "custom (Cleaner off, Architect on)"
				: current === "invalid" ? "not configured or invalid" : current;
			const uiItems = options.map((option) => option.value === current ? `${option.label}  ← actual` : option.label);
			const picked = await ctx.ui.select(`Automatic SDD agent profile (current: ${currentLabel})`, uiItems);
			if (picked === undefined) continue;
			const selected = options[uiItems.indexOf(picked)];
			if (!selected) continue;
			writeAgentActivationProfile(ctx.cwd, selected.value);
			applied.push(`agents: ${selected.value}`);
			continue;
		}
		if (item === "einmd") {
			// Ya existe → no re-preguntar; refrescarlo es cosa de /ein:init.
			if (existsSync(einMdPath(ctx.cwd))) continue;
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
		const [label, options, write, read] = FEATURE[item];
		const current = read(ctx.cwd);
		// Marca el valor activo para que repasar sea informado, no a ciegas.
		const uiItems = options.map((o) =>
			o.value === current ? `${o.label}  ← actual` : o.label,
		);
		const picked = await ctx.ui.select(label, uiItems);
		if (picked === undefined) continue;
		const opt = options[uiItems.indexOf(picked)];
		if (!opt) continue;
		write(ctx.cwd, opt.value);
		applied.push(`${item}: ${opt.value}`);
	}
	return applied;
}

// Tabla feature → (pregunta, opciones, writer, lector del valor actual). Tipada
// laxa a propósito para mapear cuatro features con enums distintos sin acoplar.
type FeatureSpec = [
	label: string,
	options: Array<{ label: string; value: string }>,
	write: (cwd: string, value: string) => void,
	read: (cwd: string) => string,
];

const FEATURE: Record<Exclude<Essential, "einmd" | "agents">, FeatureSpec> = {
	persona: [
		"Persona (tono y estética de las respuestas)",
		PERSONA_OPTIONS.map((p) => ({ label: p, value: p })),
		(cwd, v) => writePersonaMode(cwd, v as PersonaMode),
		(cwd) => readPersonaMode(cwd),
	],
	lang: [
		"Idioma de artefactos (PR/commit/issues)",
		ACTIVE_LANGS.map((l) => ({ label: `${l} — ${LANG_LABEL[l]}`, value: l })),
		(cwd, v) => writeArtifactLang(cwd, v as Lang),
		(cwd) => readArtifactLang(cwd),
	],
	tdd: [
		"TDD estricto en SDD",
		TDD_OPTIONS.map((t) => ({ label: `${t} — ${TDD_LABEL[t]}`, value: t })),
		(cwd, v) => writeTddMode(cwd, v as (typeof TDD_OPTIONS)[number]),
		(cwd) => readTddMode(cwd),
	],
	hypa: [
		"Compresión de salida de comandos (Hypa)",
		HYPA_OPTIONS.map((h) => ({ label: HYPA_ONBOARD_LABEL[h] ?? h, value: h })),
		(cwd, v) => writeHypaMode(cwd, v as (typeof HYPA_OPTIONS)[number]),
		(cwd) => readHypaMode(cwd),
	],
};

// Wizard de onboarding. No-op sin UI o sin pendientes. Con `all`, reconfigura
// todo (lo usa /ein:onboard) en vez de solo lo ausente.
export async function runOnboarding(
	ctx: ExtensionContext,
	opts: { all?: boolean } = {},
): Promise<void> {
	if (!ctx.hasUI) return;
	const pending = pendingEssentials(ctx.cwd);
	// Se dispara si falta algo (arranque de proyecto) o si se fuerza (/ein:onboard).
	if (pending.length === 0 && !opts.all) return;

	const ctxLine = pending.length
		? `faltan: ${pending.join(", ")}`
		: "todo configurado";
	const choice = await ctx.ui.select(
		`Configurar Ein en este proyecto (${ctxLine}).`,
		[
			"Usar recomendados (rellena solo lo que falta)",
			"Personalizar (repasar los 6, con el valor actual)",
			"Ahora no",
		],
	);
	if (choice === undefined || choice.startsWith("Ahora no")) return;

	let applied: string[];
	if (choice.startsWith("Personalizar")) {
		// Repasa SIEMPRE los 6 esenciales, no solo los ausentes: predecible y
		// completo. Los ya configurados muestran su valor actual.
		applied = await customize(ctx, ALL_ESSENTIALS);
	} else {
		// Recomendados: solo lo pendiente → nunca pisa una elección previa.
		for (const item of pending) applyDefault(ctx.cwd, item);
		applied = pending.map((i) => (i === "einmd" ? "EIN.md: generado" : `${i}: default`));
	}

	if (applied.length === 0) {
		if (opts.all) ctx.ui.notify("Sin cambios.", "info");
		return;
	}
	ctx.ui.notify(
		[
			"Ein configurado en este proyecto:",
			...applied.map((a) => `  · ${a}`),
			"Perfil automático SDD: /ein:onboard. Overrides de sesión: /ein:cleaner on|off y /ein:architect on|off.",
			"Otros ajustes: /ein:persona · :lang · :tdd · :hypa.",
		].join("\n"),
		"info",
	);
}

export async function handleOnboardCommand(ctx: ExtensionContext): Promise<void> {
	await runOnboarding(ctx, { all: true });
}
