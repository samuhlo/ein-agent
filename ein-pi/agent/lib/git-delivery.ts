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

// Verbos de entrega que una negación puede cancelar (formas ES/EN).
const NEGATABLE_DELIVERY_VERBS =
	"commit(?:s|ea|ees)?|push(?:es|ing|ea|ees)?|prs?|pull\\s+requests?|merge(?:s|ar|ees)?|mergea(?:r|lo|los)?";

// Negación POR CLÁUSULA: el negador debe estar cerca (≤16 chars) del verbo que
// niega y en la misma cláusula (sin cruzar `, ; .` ni salto de línea).
// "no hagas push" niega push; "no toques los tests y haz push" NO lo niega —
// ese "no" negaba otra cosa. Antes una negación cualquiera cancelaba TODO el
// texto y bloqueaba entregas legítimas ("abre PR pero no hagas merge").
const DELIVERY_NEGATION_SOURCE = `\\b(?:no|don'?t|do\\s+not|never|nunca|without|sin(?:\\s+hacer)?)\\b[^.,;\\n]{0,16}?\\b(?:${NEGATABLE_DELIVERY_VERBS})\\b`;
const DELIVERY_NEGATION_TEST = new RegExp(DELIVERY_NEGATION_SOURCE, "i");
const DELIVERY_NEGATION_STRIP = new RegExp(DELIVERY_NEGATION_SOURCE, "gi");

// ¿El texto niega explícitamente algún verbo de entrega en su cláusula?
export function textNegatesDelivery(text: string): boolean {
	return DELIVERY_NEGATION_TEST.test(text);
}

// Elimina del texto los verbos de entrega NEGADOS, dejando los afirmados.
// "abre PR pero no hagas merge" → "abre PR pero " (el PR sobrevive).
export function stripNegatedDelivery(text: string): string {
	return text.replace(DELIVERY_NEGATION_STRIP, " ");
}

// Verbos de entrega en imperativo/petición (ES/EN). Detectan que el mensaje del
// usuario PIDE la entrega — base del modo `auto`. No incluyen "git status" ni
// lecturas: solo acciones que mutan el remoto/historial. "push" a secas solo
// cuenta con contexto de entrega o como mensaje completo: "push notifications"
// o "pushState" no son una orden de push.
const DELIVERY_INTENT_PATTERNS: RegExp[] = [
	/\bcommit(?:ea|éa|ealo|éalo|ear)?\b/i,
	/\bhaz\s+(?:el\s+|un\s+)?commit\b/i,
	/\bpush(?:ea|éa|ealo|éalo|ear)\b/i,
	/\bgit\s+push\b/i,
	/\bhaz\s+(?:el\s+|un\s+)?push\b/i,
	/\bpush\s+(?:the\s+|this\s+|los?\s+|las?\s+|mis?\s+)?(?:branch|rama|commits?|changes?|cambios|tags?|it|todo|everything)\b/i,
	/\bpush\s+(?:to|a|hacia)\s+(?:origin|remote|remoto|github|upstream|main|master)\b/i,
	/^\s*(?:git\s+)?push\s*[!.]*\s*$/i,
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
// Una PREGUNTA ("¿hago push?") NO autoriza. Cualquier negación de entrega en el
// mensaje ("commit pero sin push") tampoco: un mensaje mixto no es una
// autorización general — mejor una confirmación de más que un push de menos.
// Usado por el modo `auto` para saltarse la confirmación que el usuario ya dio.
export function messageRequestsDelivery(text: string): boolean {
	if (typeof text !== "string") return false;
	const trimmed = text.trim();
	if (!trimmed) return false;
	if (/[?？]\s*$/.test(trimmed)) return false;
	if (textNegatesDelivery(trimmed)) return false;
	return DELIVERY_INTENT_PATTERNS.some((p) => p.test(trimmed));
}

// ─── Intención de entrega PEGAJOSA ───────────────────────────────────────────
// Antes la intención se recalculaba en CADA mensaje y se pisaba: pedías "haz
// commit, push y PR", pegabas un log de CI a mitad del trabajo y esa autorización
// se evaporaba — las delegaciones siguientes del MISMO encargo se bloqueaban.
// Ahora sobrevive a mensajes neutros (logs, datos, "sigue") y solo cae con una
// negación explícita o al expirar. Con TTL para que un "haz push" de hace una
// hora no autorice una entrega por iniciativa del agente.
export const DELIVERY_INTENT_TTL_MS = 30 * 60 * 1000;

export type DeliveryIntent = { requested: boolean; at: number };

// Estado siguiente de la intención ante un mensaje del usuario. Puro: el
// almacén (Map por sesión) vive en la extensión.
export function nextDeliveryIntent(
	previous: DeliveryIntent | undefined,
	text: string,
	now: number = Date.now(),
): DeliveryIntent {
	// Pedirla explícitamente la renueva (y refresca el TTL).
	if (messageRequestsDelivery(text)) return { requested: true, at: now };
	// Negarla explícitamente la cancela: "no hagas push" manda sobre lo anterior.
	if (typeof text === "string" && textNegatesDelivery(text))
		return { requested: false, at: now };
	// Mensaje neutro: se conserva mientras siga viva.
	if (previous?.requested && now - previous.at <= DELIVERY_INTENT_TTL_MS)
		return previous;
	return { requested: false, at: now };
}

export function deliveryIntentActive(
	intent: DeliveryIntent | undefined,
	now: number = Date.now(),
): boolean {
	if (!intent?.requested) return false;
	return now - intent.at <= DELIVERY_INTENT_TTL_MS;
}

export async function handleGitCommand(ctx: ExtensionContext): Promise<void> {
	const current = readGitDeliveryMode(ctx.cwd);
	const items = GIT_DELIVERY_OPTIONS.map((m) => `${m} — ${GIT_DELIVERY_LABEL[m]}`);
	const picked = await ctx.ui.select(
		`Confirmación de entrega git (actual: ${current})`,
		items,
	);
	// A cancelled picker returns undefined; treating it as a miss relied on
	// indexOf(-1) instead of saying so.
	if (picked === undefined) return;
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
