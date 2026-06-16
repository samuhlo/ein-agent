// =============================================================================
// LANG
// Sistema de idioma de Ein. Dos ejes independientes:
//   - chat/UI  → el locale compartido de @juicesharp/rpiv-i18n (global, en
//                ~/.config/rpiv-i18n/locale.json, con auto-deteccion por LANG).
//   - artefactos (PR/commits/Linear) → config nativa por proyecto en
//                .pi/ein/lang.json; si falta, hereda el idioma de chat.
//
// Este modulo NUNCA importa @juicesharp/rpiv-i18n: los paquetes declarados de
// Pi viven en ~/.pi/agent/npm/node_modules y NO estan en la cadena de
// resolucion de Node desde aqui (un `import` falla en runtime). En su lugar:
//   - LEE el locale por el snapshot publico globalThis[Symbol.for("rpiv-i18n")]
//     que rpiv-i18n publica al cargarse como extension; con fallback al fichero
//     ~/.config/rpiv-i18n/locale.json y a LANG/LC_ALL.
//   - ESCRIBE el locale en ese mismo fichero (lo que rpiv lee al arrancar).
// Asi el dial de idioma sigue siendo el compartido, sin acoplarnos al paquete.
// =============================================================================

import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type Lang = "es" | "en" | "gl";

// Idiomas ofrecidos hoy en el selector. "gl" esta contemplado en el tipo y en
// las directivas pero todavia no se ofrece hasta tener su traduccion de UI.
export const ACTIVE_LANGS: readonly Lang[] = ["es", "en"];

export const LANG_LABEL: Record<Lang, string> = {
	es: "Español",
	en: "English",
	gl: "Galego",
};

// Nombre del idioma tal cual se le pasa al modelo en las directivas de prompt.
const LANG_PROMPT_NAME: Record<Lang, string> = {
	es: "Spanish (peninsular Spanish, from Spain)",
	en: "English",
	gl: "Galician (galego)",
};

const DEFAULT_LANG: Lang = "es";
const I18N_STATE_KEY = Symbol.for("rpiv-i18n");

function normalizeLang(value: string | undefined | null): Lang | undefined {
	if (!value) return undefined;
	const token = value.trim().toLowerCase();
	if (token.startsWith("gl")) return "gl";
	if (token.startsWith("es")) return "es";
	if (token.startsWith("en")) return "en";
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ─── Eje chat/UI (locale compartido de rpiv-i18n, leido sin importar) ─────────

// Snapshot publicado por rpiv-i18n al cargarse como extension.
function activeLocaleRaw(): string | undefined {
	const snapshot = (globalThis as Record<symbol, unknown>)[I18N_STATE_KEY];
	if (isRecord(snapshot) && typeof snapshot.locale === "string") {
		return snapshot.locale;
	}
	return undefined;
}

function localeConfigPath(): string {
	const xdg = process.env.XDG_CONFIG_HOME?.trim();
	const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
	return join(base, "rpiv-i18n", "locale.json");
}

// Fallback cuando el snapshot aun no esta (rpiv no cargado todavia / ausente).
function localeFromConfigFile(): string | undefined {
	try {
		const parsed: unknown = JSON.parse(readFileSync(localeConfigPath(), "utf8"));
		if (isRecord(parsed) && typeof parsed.locale === "string") return parsed.locale;
	} catch {
		// sin fichero o invalido
	}
	return undefined;
}

function localeFromEnv(): string | undefined {
	for (const value of [process.env.LANG, process.env.LC_ALL]) {
		const lang = value?.split("_")[0]?.split(".")[0];
		if (lang && lang !== "C" && lang !== "POSIX") return lang;
	}
	return undefined;
}

export function readChatLang(): Lang {
	return (
		normalizeLang(activeLocaleRaw()) ??
		normalizeLang(localeFromConfigFile()) ??
		normalizeLang(localeFromEnv()) ??
		DEFAULT_LANG
	);
}

/**
 * Selector de string por idioma de chat, test-safe (sin importar rpiv-i18n).
 * Para los modulos que cargan los tests (persona, model-config, guardrails)
 * que no pueden importar lib/i18n/strings.ts. `gl` cae a `es` por ahora.
 */
export function pick(es: string, en: string): string {
	return readChatLang() === "en" ? en : es;
}

/**
 * Selector de string con idioma explicito, para contenido cuyo idioma no es el
 * de chat sino el de artefactos (p.ej. plantillas de issues de Linear que se
 * crean en el board). `gl` cae a `es` por ahora.
 */
export function pickFor(lang: Lang, es: string, en: string): string {
	return lang === "en" ? en : es;
}

/**
 * Persiste el idioma de chat escribiendo el mismo fichero que rpiv-i18n lee al
 * arrancar (~/.config/rpiv-i18n/locale.json). No importa el paquete. Toma
 * efecto al reiniciar Pi (cuando rpiv re-lee el fichero). Devuelve `false` si
 * la escritura a disco falla (el caller avisa al usuario).
 */
export function applyChatLang(lang: Lang): boolean {
	try {
		const path = localeConfigPath();
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify({ locale: lang }, null, 2)}\n`);
		try {
			chmodSync(path, 0o600);
		} catch {
			// chmod best-effort
		}
		return true;
	} catch {
		return false;
	}
}

// ─── Eje artefactos (config por proyecto) ────────────────────────────────────

export function langConfigPath(cwd: string): string {
	return join(cwd, ".pi", "ein", "lang.json");
}

/** Override explicito de artefactos, o `undefined` si hereda el de chat. */
export function readArtifactOverride(cwd: string): Lang | undefined {
	const path = langConfigPath(cwd);
	if (!existsSync(path)) return undefined;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(parsed)) return undefined;
		return normalizeLang(
			typeof parsed.artifacts === "string" ? parsed.artifacts : undefined,
		);
	} catch {
		return undefined;
	}
}

/** Idioma efectivo de artefactos: override del proyecto o, si falta, el de chat. */
export function readArtifactLang(cwd: string): Lang {
	return readArtifactOverride(cwd) ?? readChatLang();
}

/** Escribe el override de artefactos; `null` borra el override (vuelve a heredar). */
export function writeArtifactLang(cwd: string, lang: Lang | null): void {
	const path = langConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	const config = lang ? { artifacts: lang } : {};
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

// ─── Directivas de prompt ────────────────────────────────────────────────────

/** Directiva autoritativa de idioma de respuesta (la inyecta buildEinPrompt). */
export function responseLanguageDirective(lang: Lang): string {
	return `Language (authoritative — overrides any persona language preference):
- Always respond to the user in ${LANG_PROMPT_NAME[lang]}, regardless of persona, unless the user explicitly requests another language in their current message.
- Apply it to all prose, headings, and explanations.`;
}

// Cabeceras de seccion traducidas para los artefactos brutalistas.
const ARTIFACT_LABELS: Record<Lang, {
	intent: string;
	pr: [string, string, string, string];
	issue: [string, string, string, string];
}> = {
	es: {
		intent: "Intención corta",
		pr: ["QUÉ CAMBIA", "CÓMO FUNCIONA POR DENTRO", "CÓMO PROBARLO", "RIESGOS"],
		issue: ["CONTEXTO", "ALCANCE", "CRITERIOS DE ACEPTACIÓN", "RIESGOS"],
	},
	en: {
		intent: "Short intent",
		pr: ["WHAT CHANGES", "HOW IT WORKS UNDER THE HOOD", "HOW TO TEST IT", "RISKS"],
		issue: ["CONTEXT", "SCOPE", "ACCEPTANCE CRITERIA", "RISKS"],
	},
	gl: {
		intent: "Intención curta",
		pr: ["QUE CAMBIA", "COMO FUNCIONA POR DENTRO", "COMO PROBALO", "RISCOS"],
		issue: ["CONTEXTO", "ALCANCE", "CRITERIOS DE ACEPTACIÓN", "RISCOS"],
	},
};

/**
 * Directiva de idioma de artefactos: la inyecta el padre en la tarea de los
 * subagentes ein-github / ein-linear. Manda sobre el idioma por defecto que
 * traen sus especificaciones.
 */
export function artifactLanguageDirective(lang: Lang): string {
	const name = LANG_PROMPT_NAME[lang];
	const labels = ARTIFACT_LABELS[lang];
	return [
		"## Artifact language (authoritative)",
		`Generate ALL delivered artifacts — PR titles and bodies, commit messages, Linear issues and comments — in ${name}, regardless of the conversation language.`,
		"Keep the brutalist `// NNN.` structure and the `[[TAG]]` title tags, but translate every section label and all prose to this language. Do not emit labels in any other language.",
		"",
		"Section labels to use verbatim:",
		`- Intent line: \`> ${labels.intent}:\``,
		`- PR body: // 001. ${labels.pr[0]} · // 002. ${labels.pr[1]} · // 003. ${labels.pr[2]} · // 004. ${labels.pr[3]}`,
		`- Linear issue: // 001. ${labels.issue[0]} · // 002. ${labels.issue[1]} · // 003. ${labels.issue[2]} · // 004. ${labels.issue[3]}`,
		`- Commit messages: imperative summary written in ${name}.`,
	].join("\n");
}

// ─── Comando /ein:lang ───────────────────────────────────────────────────────

const INHERIT_OPTION = "Igual que conversación";

export async function handleLangCommand(ctx: ExtensionContext): Promise<void> {
	const currentChat = readChatLang();

	const chatItems = ACTIVE_LANGS.map((l) => `${LANG_LABEL[l]} (${l})`);
	const chatPick = await ctx.ui.select(
		`Idioma de conversación y UI (actual: ${LANG_LABEL[currentChat]})`,
		chatItems,
	);
	const chatLang = ACTIVE_LANGS[chatItems.indexOf(chatPick)];
	if (!chatLang) return;
	const persisted = applyChatLang(chatLang);

	const currentOverride = readArtifactOverride(ctx.cwd);
	const artItems = [INHERIT_OPTION, ...ACTIVE_LANGS.map((l) => `${LANG_LABEL[l]} (${l})`)];
	const currentArtLabel = currentOverride
		? LANG_LABEL[currentOverride]
		: `heredado (${LANG_LABEL[chatLang]})`;
	const artPick = await ctx.ui.select(
		`Idioma de artefactos PR/commits/Linear (actual: ${currentArtLabel})`,
		artItems,
	);

	let artifactChoice: Lang | null | undefined;
	if (artPick === INHERIT_OPTION) {
		artifactChoice = null;
	} else {
		const idx = artItems.indexOf(artPick) - 1;
		artifactChoice = idx >= 0 ? ACTIVE_LANGS[idx] : undefined;
	}
	if (artifactChoice !== undefined) writeArtifactLang(ctx.cwd, artifactChoice);

	const effectiveArtifact = readArtifactLang(ctx.cwd);
	const inherited = readArtifactOverride(ctx.cwd) === undefined;
	ctx.ui.notify(
		[
			"Idioma actualizado.",
			`Conversación/UI: ${LANG_LABEL[chatLang]}${persisted ? "" : " (no se pudo persistir el locale global)"}`,
			`Artefactos: ${LANG_LABEL[effectiveArtifact]}${inherited ? " (heredado)" : ""}`,
			`Config de artefactos: ${langConfigPath(ctx.cwd)}`,
			"Reinicia Pi o abre una sesión nueva para que la UI y las respuestas tomen el cambio.",
		].join("\n"),
		"info",
	);
}
