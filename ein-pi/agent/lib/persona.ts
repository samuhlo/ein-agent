// =============================================================================
// PERSONA
// Identidad y voz de Ein: prompts de persona (samuhlo | neutral), prompt del
// orquestador (runtime/assets in the checkout, assets/ when deployed) and
// project-scoped persona persistence
// en .pi/ein/persona.json.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type Lang, pick, responseLanguageDirective } from "./lang.ts";
import { type LinearIntegration, linearDirective } from "./linear-integration.ts";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ASSETS_DIR = join(PACKAGE_ROOT, "assets");
const REPOSITORY_ASSETS_DIR = join(PACKAGE_ROOT, "..", "..", "runtime", "assets");

export type PersonaMode = "samuhlo" | "neutral";

export const PERSONA_OPTIONS = ["samuhlo", "neutral"] as const;

const SAMUHLO_PERSONA_PROMPT = `Persona: senior architect and teacher. Direct, concise, no corporate filler. Correct errors and explain the mechanism in proportion to the change. Treat AI as a tool directed by the human.`;

const NEUTRAL_PERSONA_PROMPT = `Persona: senior architect and teacher. Direct, concise, warm and professional; no slang or regional expressions. Correct errors and explain the mechanism in proportion to the change. Treat AI as a tool directed by the human.`;

// La directiva conserva la voz ante instrucciones en inglés; el formato y sus
// ejemplos tienen un único dueño en orchestrator.md.
export function responseVoiceDirective(): string {
	return `Output voice and format (authoritative — overrides the neutral register of these English instructions):
- Lead with the answer, then explain why in plain language. No emojis or filler.
- Follow the orchestrator's Identity & voice and Samu Output Format. Important changes explain HOW IT WORKS UNDER THE HOOD; a bare status report for an important change is forbidden. Match depth to the change: a localized fix with tests can use a few paragraphs. Use the full structure only when complexity benefits from it, with section titles in the response language.
- Follow comment-style when editing code; the executor receives the applicable conventions.`;
}

let orchestratorPromptCache: string | null = null;

// Los tramos se derivan del contrato canónico para que editarlo no deje offsets
// obsoletos en el núcleo. El contenido se carga con la herramienta read de Pi.
export function renderOrchestratorCore(core: string, contract: string, contractPath: string): string {
	const lines = contract.split("\n");
	const spans = {
		RESEARCH_READ: ["## Subagent Inventory", "## SDD Flow"],
		SDD_READ: ["## SDD Flow", "## Delivery & board"],
		DELIVERY_READ: ["## Delivery & board", "## Identity & voice"],
		VOICE_READ: ["## Identity & voice", "## Language Boundary"],
	} as const;
	let result = core;
	for (const [key, [start, end]] of Object.entries(spans)) {
		const marker = `{{${key}}}`;
		if (!result.includes(marker) || result.indexOf(marker) !== result.lastIndexOf(marker)) throw new Error(`Invalid orchestrator core reference: ${key}`);
		const offset = lines.indexOf(start);
		const finish = lines.indexOf(end);
		if (offset < 0 || finish <= offset) throw new Error(`Missing orchestrator section: ${start}`);
		result = result.replace(marker, JSON.stringify({ path: contractPath, offset: offset + 1, limit: finish - offset }));
	}
	return result.trim();
}

export function loadOrchestratorCore(assetsDir: string): string {
	const contractPath = join(assetsDir, "orchestrator.md");
	const contract = readFileSync(contractPath, "utf8");
	try {
		return renderOrchestratorCore(readFileSync(join(assetsDir, "orchestrator-core.md"), "utf8"), contract, contractPath);
	} catch {
		// Una instalación parcial pierde el ahorro, nunca el contrato de Ein.
		return contract.trim();
	}
}

export function getOrchestratorPrompt(): string {
	if (orchestratorPromptCache === null) {
		const assetsDir = existsSync(REPOSITORY_ASSETS_DIR) ? REPOSITORY_ASSETS_DIR : ASSETS_DIR;
		orchestratorPromptCache = loadOrchestratorCore(assetsDir);
	}
	return orchestratorPromptCache;
}

export function buildEinPrompt(
	persona: PersonaMode,
	lang: Lang = "es",
	linear: LinearIntegration = "off",
): string {
	const personaPrompt =
		persona === "neutral" ? NEUTRAL_PERSONA_PROMPT : SAMUHLO_PERSONA_PROMPT;
	return `## Ein Identity and Harness
You are Ein, a Pi-specific coding-agent harness. When asked who or what you are, explicitly name Pi, SDD/OpenSpec and subagents; never present yourself as a generic assistant. Mention memory only when a memory tool is active.

${personaPrompt}

${responseLanguageDirective(lang)}

${responseVoiceDirective()}

${linearDirective(linear)}

${getOrchestratorPrompt()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function personaConfigPath(cwd: string): string {
	return join(cwd, ".pi", "ein", "persona.json");
}

export function readPersonaMode(cwd: string): PersonaMode {
	const path = personaConfigPath(cwd);
	if (!existsSync(path)) return "samuhlo";
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(parsed)) return "samuhlo";
		return parsed.mode === "neutral" ? "neutral" : "samuhlo";
	} catch {
		return "samuhlo";
	}
}

export function writePersonaMode(cwd: string, mode: PersonaMode): void {
	const path = personaConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ mode }, null, 2)}\n`);
}

export async function handlePersonaCommand(ctx: ExtensionContext): Promise<void> {
	const current = readPersonaMode(ctx.cwd);
	const selected = await ctx.ui.select(
		pick(`Persona de Ein (actual: ${current})`, `Ein persona (current: ${current})`),
		[...PERSONA_OPTIONS],
	);
	if (selected !== "samuhlo" && selected !== "neutral") return;
	writePersonaMode(ctx.cwd, selected);
	ctx.ui.notify(
		[
			pick(`Persona actualizada: ${selected}`, `Persona updated: ${selected}`),
			`Config: ${personaConfigPath(ctx.cwd)}`,
			pick(
				"Reinicia Pi o abre una sesion nueva para que el cambio tome efecto.",
				"Restart Pi or open a new session for the change to take effect.",
			),
		].join("\n"),
		"info",
	);
}
