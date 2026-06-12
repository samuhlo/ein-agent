// =============================================================================
// TESTS: lib/model-config
// Roundtrip de models.json (normalización incluida), tolerancia a JSON roto
// y persistencia del modelo del orquestador en settings.json global.
// Usa EIN_PI_CONFIG_HOME y EIN_PI_AGENT_HOME temporales.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_AGENT_HOME = join(tmpdir(), "ein-agent-tests", "agent");
const TEST_CONFIG_HOME = join(tmpdir(), "ein-agent-tests", "ein");
process.env.EIN_PI_AGENT_HOME = TEST_AGENT_HOME;
process.env.EIN_PI_CONFIG_HOME = TEST_CONFIG_HOME;

const {
	readModelConfig,
	writeModelConfig,
	readOrchestratorModel,
	updateGlobalDefaultModel,
	modelConfigPath,
} = await import("../ein-pi/agent/lib/model-config");

const CWD = "/tmp/proyecto-irrelevante";

describe("models.json roundtrip", () => {
	beforeAll(() => {
		rmSync(TEST_CONFIG_HOME, { recursive: true, force: true });
		mkdirSync(TEST_CONFIG_HOME, { recursive: true });
	});

	afterAll(() => {
		rmSync(TEST_CONFIG_HOME, { recursive: true, force: true });
	});

	test("escribe y lee la config con normalización", () => {
		writeModelConfig(CWD, {
			"sdd-design": { model: "minimax/MiniMax-M3", thinking: "high" },
			"sdd-apply": { model: "minimax/MiniMax-M2.7" },
		});
		const config = readModelConfig(CWD);
		expect(config["sdd-design"]).toEqual({
			model: "minimax/MiniMax-M3",
			thinking: "high",
		});
		expect(config["sdd-apply"]?.model).toBe("minimax/MiniMax-M2.7");
	});

	test("acepta el shorthand string y descarta entradas vacías", () => {
		writeFileSync(
			modelConfigPath(CWD),
			JSON.stringify({
				"sdd-verify": "minimax/MiniMax-M2.7",
				"sdd-explore": "",
				"sdd-init": { thinking: "nivel-inventado" },
			}),
		);
		const config = readModelConfig(CWD);
		expect(config["sdd-verify"]).toEqual({ model: "minimax/MiniMax-M2.7" });
		expect(config["sdd-explore"]).toBeUndefined();
		expect(config["sdd-init"]).toBeUndefined();
	});

	test("JSON roto no revienta: devuelve config vacía", () => {
		writeFileSync(modelConfigPath(CWD), "{esto no es json");
		expect(readModelConfig(CWD)).toEqual({});
	});
});

describe("modelo del orquestador (settings.json global)", () => {
	beforeAll(() => {
		rmSync(join(TEST_AGENT_HOME, "settings.json"), { force: true });
		mkdirSync(TEST_AGENT_HOME, { recursive: true });
	});

	test("sin settings.json devuelve undefined", () => {
		expect(readOrchestratorModel()).toBeUndefined();
	});

	test("update + read roundtrip preserva el resto del settings", () => {
		writeFileSync(
			join(TEST_AGENT_HOME, "settings.json"),
			JSON.stringify({ theme: "dark", packages: ["npm:pi-subagents"] }),
		);
		updateGlobalDefaultModel("minimax", "MiniMax-M3");
		expect(readOrchestratorModel()).toBe("minimax/MiniMax-M3");
		const settings = JSON.parse(
			readFileSync(join(TEST_AGENT_HOME, "settings.json"), "utf8"),
		) as Record<string, unknown>;
		expect(settings.theme).toBe("dark");
		expect(settings.packages).toEqual(["npm:pi-subagents"]);
	});

	test("añade el modelo a enabledModels si la lista existe y no lo contiene", () => {
		writeFileSync(
			join(TEST_AGENT_HOME, "settings.json"),
			JSON.stringify({ enabledModels: ["minimax/MiniMax-M2.7"] }),
		);
		updateGlobalDefaultModel("minimax", "MiniMax-M3");
		const settings = JSON.parse(
			readFileSync(join(TEST_AGENT_HOME, "settings.json"), "utf8"),
		) as Record<string, unknown>;
		expect(settings.enabledModels).toEqual([
			"minimax/MiniMax-M2.7",
			"minimax/MiniMax-M3",
		]);
	});

	test("no duplica en enabledModels ni crea la lista si no existe", () => {
		writeFileSync(
			join(TEST_AGENT_HOME, "settings.json"),
			JSON.stringify({ enabledModels: ["minimax/MiniMax-M3"] }),
		);
		updateGlobalDefaultModel("minimax", "MiniMax-M3");
		let settings = JSON.parse(
			readFileSync(join(TEST_AGENT_HOME, "settings.json"), "utf8"),
		) as Record<string, unknown>;
		expect(settings.enabledModels).toEqual(["minimax/MiniMax-M3"]);

		writeFileSync(join(TEST_AGENT_HOME, "settings.json"), JSON.stringify({}));
		updateGlobalDefaultModel("minimax", "MiniMax-M3");
		settings = JSON.parse(
			readFileSync(join(TEST_AGENT_HOME, "settings.json"), "utf8"),
		) as Record<string, unknown>;
		expect(settings.enabledModels).toBeUndefined();
	});
});
