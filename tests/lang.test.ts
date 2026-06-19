// =============================================================================
// TESTS: lib/lang + integracion con persona
// Ejes de idioma: chat (locale via snapshot globalThis[rpiv-i18n]) y artefactos
// (config .pi/ein/lang.json por proyecto). Tambien valida que buildEinPrompt
// inyecta la directiva de idioma y que la persona no fija variante regional.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_AGENT_HOME = join(tmpdir(), "ein-agent-tests", "agent");
process.env.EIN_PI_AGENT_HOME = TEST_AGENT_HOME;

const {
	readChatLang,
	readArtifactLang,
	readArtifactOverride,
	writeArtifactLang,
	responseLanguageDirective,
	artifactLanguageDirective,
	pick,
	pickFor,
} = await import("../ein-pi/agent/lib/lang");
const { buildEinPrompt, responseVoiceDirective } = await import(
	"../ein-pi/agent/lib/persona"
);

const I18N_KEY = Symbol.for("rpiv-i18n");

function setLocale(locale: string | undefined): void {
	(globalThis as Record<symbol, unknown>)[I18N_KEY] =
		locale === undefined ? undefined : { locale, namespaces: {} };
}

describe("readChatLang", () => {
	const original = (globalThis as Record<symbol, unknown>)[I18N_KEY];
	afterEach(() => {
		(globalThis as Record<symbol, unknown>)[I18N_KEY] = original;
	});

	test("por defecto es 'es' sin snapshot de rpiv-i18n", () => {
		setLocale(undefined);
		expect(readChatLang()).toBe("es");
	});

	test("mapea el locale activo a es/en/gl", () => {
		setLocale("en");
		expect(readChatLang()).toBe("en");
		setLocale("es");
		expect(readChatLang()).toBe("es");
		setLocale("gl");
		expect(readChatLang()).toBe("gl");
	});

	test("normaliza variantes regionales y cae a 'es' si es desconocido", () => {
		setLocale("en_US.UTF-8");
		expect(readChatLang()).toBe("en");
		setLocale("fr");
		expect(readChatLang()).toBe("es");
	});
});

describe("eje artefactos (.pi/ein/lang.json)", () => {
	let cwd: string;
	const original = (globalThis as Record<symbol, unknown>)[I18N_KEY];

	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-lang-"));
		setLocale("es");
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
		(globalThis as Record<symbol, unknown>)[I18N_KEY] = original;
	});

	test("sin override: hereda el idioma de chat", () => {
		expect(readArtifactOverride(cwd)).toBeUndefined();
		setLocale("en");
		expect(readArtifactLang(cwd)).toBe("en");
	});

	test("con override: gana sobre el chat", () => {
		writeArtifactLang(cwd, "en");
		expect(readArtifactOverride(cwd)).toBe("en");
		setLocale("es");
		expect(readArtifactLang(cwd)).toBe("en");
	});

	test("null borra el override y vuelve a heredar", () => {
		writeArtifactLang(cwd, "en");
		writeArtifactLang(cwd, null);
		expect(readArtifactOverride(cwd)).toBeUndefined();
		setLocale("es");
		expect(readArtifactLang(cwd)).toBe("es");
	});
});

describe("pick / pickFor", () => {
	const original = (globalThis as Record<symbol, unknown>)[I18N_KEY];
	afterEach(() => {
		(globalThis as Record<symbol, unknown>)[I18N_KEY] = original;
	});

	test("pick sigue el idioma de chat (default es)", () => {
		setLocale(undefined);
		expect(pick("hola", "hi")).toBe("hola");
		setLocale("en");
		expect(pick("hola", "hi")).toBe("hi");
	});

	test("pickFor usa el idioma explicito, ignorando el de chat", () => {
		setLocale("es");
		expect(pickFor("en", "hola", "hi")).toBe("hi");
		expect(pickFor("es", "hola", "hi")).toBe("hola");
		expect(pickFor("gl", "hola", "hi")).toBe("hola");
	});
});

describe("directivas de prompt", () => {
	test("responseLanguageDirective nombra el idioma destino", () => {
		expect(responseLanguageDirective("en")).toContain("English");
		expect(responseLanguageDirective("es")).toContain("Spanish");
	});

	test("artifactLanguageDirective trae cabeceras en el idioma correcto", () => {
		expect(artifactLanguageDirective("en")).toContain("WHAT CHANGES");
		expect(artifactLanguageDirective("en")).toContain("ACCEPTANCE CRITERIA");
		expect(artifactLanguageDirective("es")).toContain("QUÉ CAMBIA");
		expect(artifactLanguageDirective("es")).toContain("CRITERIOS DE ACEPTACIÓN");
	});
});

describe("buildEinPrompt", () => {
	test("inyecta la directiva de idioma segun el parametro", () => {
		expect(buildEinPrompt("samuhlo", "en")).toContain(
			"Always respond to the user in English",
		);
		expect(buildEinPrompt("samuhlo", "es")).toContain(
			"Always respond to the user in Spanish",
		);
	});

	test("la persona deja el idioma a la directiva (espanol peninsular)", () => {
		const prompt = buildEinPrompt("samuhlo", "es");
		// El idioma lo fija la directiva autoritativa, no la persona; debe ser
		// espanol peninsular y la persona no debe fijar una variante regional.
		expect(prompt).toContain("Spanish (peninsular Spanish, from Spain)");
		expect(prompt.toLowerCase()).not.toContain("podés");
		expect(prompt.toLowerCase()).not.toContain("tenés");
	});

	test("inyecta la directiva de voz/formato autoritativa en ambas personas", () => {
		// Regresion tras traducir los prompts a ingles: el registro se aplanaba a
		// informe neutro. La directiva fuerza el formato // 00N y el estilo Samu
		// independientemente del idioma del prompt, en ambas personas.
		for (const persona of ["samuhlo", "neutral"] as const) {
			expect(buildEinPrompt(persona, "es")).toContain(
				"Output voice and format (authoritative",
			);
		}
	});

	test("la directiva de voz es language-neutral (no hardcodea titulos en espanol)", () => {
		// El formato // 00N es el contrato fijo; los titulos los localiza la
		// directiva de idioma, no la de voz. La de voz no debe fijar espanol.
		const voice = responseVoiceDirective();
		expect(voice).toContain("HOW IT WORKS UNDER THE HOOD");
		expect(voice).toContain("comment-style");
		expect(voice).toContain("bare status report for an important change is forbidden");
		expect(voice).not.toContain("CÓMO FUNCIONA POR DENTRO");
		expect(voice).not.toContain("// 002. ");
	});

	test("la directiva de idioma localiza los titulos del formato // 00N", () => {
		expect(responseLanguageDirective("en")).toContain(
			"render the section TITLES in English",
		);
		expect(responseLanguageDirective("es")).toContain(
			"render the section TITLES in Spanish",
		);
	});
});
