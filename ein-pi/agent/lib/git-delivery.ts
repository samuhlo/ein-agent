// =============================================================================
// GIT DELIVERY MODE
// Política de confirmación de entrega (push/PR) de Ein, persistente por proyecto
// en .pi/ein/git.json. Espejo de tdd.ts. Decide si el gate determinista pide
// confirmación interactiva antes de una entrega delegada a ein-git:
//   - auto → si TU mensaje pidió la entrega (commit/push/PR), no pregunta;
//            entrega por iniciativa del agente (no la pediste) → confirma.
//   - ask  → siempre confirma (comportamiento conservador).
//   - off  → nunca confirma, ni la iniciativa del agente (confianza total).
// El force-push sigue DENEGADO en seco en cualquier modo (ver guardrails.ts).
// Módulo puro (solo builtins de Node + tipos) para testear sin acoplar.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type GitDeliveryMode = "auto" | "ask" | "off";

export const GIT_DELIVERY_OPTIONS: readonly GitDeliveryMode[] = [
	"auto",
	"ask",
	"off",
];

export const GIT_DELIVERY_LABEL: Record<GitDeliveryMode, string> = {
	auto: "auto (si lo pides, no pregunta)",
	ask: "preguntar siempre",
	off: "nunca preguntar",
};

const DEFAULT_GIT_DELIVERY: GitDeliveryMode = "auto";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeGitDelivery(value: unknown): GitDeliveryMode | undefined {
	if (typeof value !== "string") return undefined;
	const token = value.trim().toLowerCase();
	return (GIT_DELIVERY_OPTIONS as readonly string[]).includes(token)
		? (token as GitDeliveryMode)
		: undefined;
}

export function gitDeliveryConfigPath(cwd: string): string {
	return join(cwd, ".pi", "ein", "git.json");
}

export function readGitDeliveryMode(cwd: string): GitDeliveryMode {
	const path = gitDeliveryConfigPath(cwd);
	if (!existsSync(path)) return DEFAULT_GIT_DELIVERY;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (isRecord(parsed))
			return normalizeGitDelivery(parsed.mode) ?? DEFAULT_GIT_DELIVERY;
	} catch {
		// fichero ausente o roto → default
	}
	return DEFAULT_GIT_DELIVERY;
}

export function writeGitDeliveryMode(cwd: string, mode: GitDeliveryMode): void {
	const path = gitDeliveryConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ mode }, null, 2)}\n`);
}

// Frases negativas que CANCELAN la intención de entrega ("no hagas push",
// "sin commit", "don't push"): el usuario no autoriza, todo lo contrario.
const DELIVERY_NEGATION_PATTERNS: RegExp[] = [
	/\b(?:no|don't|do\s+not|never)\b[^.\n]*\b(?:commit|push|pr|pull\s+request|merge)\b/i,
	/\bsin\s+(?:hacer\s+)?(?:commit|push|pr|merge)\b/i,
];

// Verbos de entrega en imperativo/petición (ES/EN). Detectan que el mensaje del
// usuario PIDE la entrega — base del modo `auto`. No incluyen "git status" ni
// lecturas: solo acciones que mutan el remoto/historial.
const DELIVERY_INTENT_PATTERNS: RegExp[] = [
	/\bcommit(?:ea|éa|ealo|éalo|ear)?\b/i,
	/\bhaz\s+(?:el\s+|un\s+)?commit\b/i,
	/\bpush(?:ea|éa|ealo|éalo|ear)?\b/i,
	/\bsube\s+(?:la\s+|el\s+|los\s+)?(?:rama|c[oó]digo|cambios?|commits?)\b/i,
	/\bsube\s+(?:lo|los)?\s+a\s+(?:github|remoto|origin)\b/i,
	/\bpublica(?:lo|los)?\b/i,
	/\bpull\s+request\b/i,
	/\bPRs?\b/, // "PR"/"PRs" en mayúsculas: la sigla, no una palabra común
	/\b(?:abre|haz|crea|saca|monta)\s+(?:un\s+|el\s+)?pr\b/i,
	/\bmerge(?:a|ar|ealo|éalo)?\b/i,
	/\bmergea(?:lo|los)?\b/i,
];

// ¿El mensaje del usuario pide explícitamente una entrega (commit/push/PR/merge)?
// Una PREGUNTA ("¿hago push?") o una negación ("no hagas push") NO autoriza.
// Usado por el modo `auto` para saltarse la confirmación que el usuario ya dio.
export function messageRequestsDelivery(text: string): boolean {
	if (typeof text !== "string") return false;
	const trimmed = text.trim();
	if (!trimmed) return false;
	if (/[?？]\s*$/.test(trimmed)) return false;
	if (DELIVERY_NEGATION_PATTERNS.some((p) => p.test(trimmed))) return false;
	return DELIVERY_INTENT_PATTERNS.some((p) => p.test(trimmed));
}

export async function handleGitCommand(ctx: ExtensionContext): Promise<void> {
	const current = readGitDeliveryMode(ctx.cwd);
	const items = GIT_DELIVERY_OPTIONS.map((m) => `${m} — ${GIT_DELIVERY_LABEL[m]}`);
	const picked = await ctx.ui.select(
		`Confirmación de entrega git (actual: ${current})`,
		items,
	);
	const mode = GIT_DELIVERY_OPTIONS[items.indexOf(picked)];
	if (!mode) return;
	writeGitDeliveryMode(ctx.cwd, mode);
	ctx.ui.notify(
		[
			`Entrega git: ${mode} (${GIT_DELIVERY_LABEL[mode]})`,
			mode === "auto"
				? "Si pides commit/push/PR en tu mensaje, no se confirma; la entrega por iniciativa del agente sí."
				: mode === "off"
					? "Nunca se confirma la entrega delegada (force-push sigue bloqueado en seco)."
					: "Siempre se confirma antes de un push/PR delegado.",
			`Config: ${gitDeliveryConfigPath(ctx.cwd)}`,
			"Reinicia Pi o abre una sesión nueva para que tome efecto.",
		].join("\n"),
		"info",
	);
}
