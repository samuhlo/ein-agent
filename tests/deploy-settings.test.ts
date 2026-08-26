// =============================================================================
// TESTS: installer deploy — preservación de settings del usuario
// Protege el bug histórico: `ein update` machacaba defaultProvider/defaultModel
// (y demás campos del usuario) al extraer el tarball encima de settings.json.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	mergeUserSettings,
	readUserSettings,
} from "../installer/src/core/settings";

const DIR = join(tmpdir(), "ein-agent-tests", "deploy");
const SETTINGS = join(DIR, "settings.json");

describe("readUserSettings + mergeUserSettings", () => {
	beforeAll(() => {
		rmSync(DIR, { recursive: true, force: true });
		mkdirSync(DIR, { recursive: true });
	});

	afterAll(() => {
		rmSync(DIR, { recursive: true, force: true });
	});

	test("filtra solo las claves del usuario", () => {
		writeFileSync(
			SETTINGS,
			JSON.stringify({
				defaultProvider: "minimax",
				defaultModel: "MiniMax-M3",
				defaultThinkingLevel: "xhigh",
				theme: "dark",
				extensions: ["/ruta/del/template"],
				quietStartup: true,
			}),
		);
		const saved = readUserSettings(DIR);
		expect(saved).toEqual({
			defaultProvider: "minimax",
			defaultModel: "MiniMax-M3",
			defaultThinkingLevel: "xhigh",
		});
	});

	test("merge restaura lo del usuario sin perder lo nuevo del template", () => {
		const saved = readUserSettings(DIR);
		// Simula la extracción del tarball: settings.json de fábrica sin las
		// elecciones del usuario, con un campo nuevo del template.
		writeFileSync(
			SETTINGS,
			JSON.stringify({
				theme: "ein",
				quietStartup: true,
				campoNuevoDelTemplate: 42,
			}),
		);
		mergeUserSettings(DIR, saved);
		const merged = JSON.parse(readFileSync(SETTINGS, "utf8")) as Record<
			string,
			unknown
		>;
		expect(merged.defaultProvider).toBe("minimax");
		expect(merged.defaultModel).toBe("MiniMax-M3");
		expect(merged.defaultThinkingLevel).toBe("xhigh");
		expect(merged.theme).toBe("ein"); // el tema de Ein gana
		expect(merged.quietStartup).toBe(true);
		expect(merged.campoNuevoDelTemplate).toBe(42);
	});

	test("settings ausente o roto: no revienta, devuelve vacío", () => {
		expect(readUserSettings(join(DIR, "no-existe"))).toEqual({});
		writeFileSync(SETTINGS, "{roto");
		expect(readUserSettings(DIR)).toEqual({});
		// merge sobre fichero roto no lanza
		mergeUserSettings(DIR, { defaultModel: "MiniMax-M3" });
	});
});
