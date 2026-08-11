// =============================================================================
// TESTS: lib/model-config — roundtrip de models.json + modelo global
// =============================================================================
// Tolera JSON roto, normaliza claves legacy (ein-github → ein-git, rename de
// fases SDD) y persiste el modelo del orquestador en settings.json. Usa
// EIN_PI_CONFIG_HOME y EIN_PI_AGENT_HOME temporales.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRuntimeTestOwner } from "./fixtures/runtime-test-fixture";

const owner = getRuntimeTestOwner();
const TEST_AGENT_HOME = owner.agentHome;
const TEST_CONFIG_HOME = mkdtempSync(join(tmpdir(), "ein-model-config-"));
const ORIGINAL_CONFIG_HOME = process.env.EIN_PI_CONFIG_HOME;
process.env.EIN_PI_CONFIG_HOME = TEST_CONFIG_HOME;

const {
	applyModelConfigAsync,
	listDiscoverableAgents,
	readModelConfig,
	inspectModelConfig,
	writeModelConfig,
	readOrchestratorModel,
	updateGlobalDefaultModel,
	modelConfigPath,
	AGENT_RECOMMENDATIONS,
} = await import("../ein-pi/agent/lib/model-config");

const CWD = "/tmp/proyecto-irrelevante";

describe("models.json roundtrip", () => {
	beforeAll(() => {
		rmSync(TEST_CONFIG_HOME, { recursive: true, force: true });
		mkdirSync(TEST_CONFIG_HOME, { recursive: true });
	});

	afterAll(() => {
		rmSync(TEST_CONFIG_HOME, { recursive: true, force: true });
		if (ORIGINAL_CONFIG_HOME === undefined) delete process.env.EIN_PI_CONFIG_HOME;
		else process.env.EIN_PI_CONFIG_HOME = ORIGINAL_CONFIG_HOME;
	});

	test("escribe y lee la config con normalización", () => {
		writeModelConfig(CWD, {
			"sdd-design": { model: "minimax/MiniMax-M3", thinking: "high" },
			"sdd-tasks": { model: "minimax/MiniMax-M2.7" },
			"sdd-apply": { model: "minimax/MiniMax-M2.7" },
		});
		const config = readModelConfig(CWD);
		expect(config["sdd-design"]).toEqual({
			model: "minimax/MiniMax-M3",
			thinking: "high",
		});
		expect(config["sdd-apply"]?.model).toBe("minimax/MiniMax-M2.7");
		expect(config["sdd-tasks"]?.model).toBe("minimax/MiniMax-M2.7");
	});

	test("acepta el shorthand string y descarta entradas vacías", () => {
		writeFileSync(
			modelConfigPath(CWD),
			JSON.stringify({
				"sdd-verify": "minimax/MiniMax-M2.7",
				"sdd-map": "",
				"sdd-scope": { thinking: "nivel-inventado" },
			}),
		);
		const config = readModelConfig(CWD);
		expect(config["sdd-verify"]).toEqual({ model: "minimax/MiniMax-M2.7" });
		expect(config["sdd-map"]).toBeUndefined();
		expect(config["sdd-scope"]).toBeUndefined();
	});

	test("JSON roto no revienta: devuelve config vacía", () => {
		writeFileSync(modelConfigPath(CWD), "{esto no es json");
		expect(readModelConfig(CWD)).toEqual({});
	});

	test("inspectModelConfig preserves malformed explicit values without changing the legacy reader", () => {
		writeFileSync(modelConfigPath(CWD), JSON.stringify({ "sdd-apply": { thinking: "invented" } }));
		expect(inspectModelConfig(CWD)).toMatchObject({ status: "invalid", source: "global", reason: "invalid-evidence" });
		expect(readModelConfig(CWD)).toEqual({});
	});

	test("migra la clave legacy ein-github → ein-git al leer", () => {
		writeFileSync(
			modelConfigPath(CWD),
			JSON.stringify({ "ein-github": "minimax/MiniMax-M2.7" }),
		);
		const config = readModelConfig(CWD);
		expect(config["ein-git"]).toEqual({ model: "minimax/MiniMax-M2.7" });
		expect(config["ein-github"]).toBeUndefined();
	});

	test("ein-git explícito tiene precedencia sobre el alias", () => {
		writeFileSync(
			modelConfigPath(CWD),
			JSON.stringify({
				"ein-git": "minimax/MiniMax-M3",
				"ein-github": "minimax/MiniMax-M2.7",
			}),
		);
		expect(readModelConfig(CWD)["ein-git"]).toEqual({ model: "minimax/MiniMax-M3" });
	});

	test("migra claves SDD previas al rename", () => {
		writeFileSync(
			modelConfigPath(CWD),
			JSON.stringify({
				[`sdd-${"init"}`]: "minimax/MiniMax-M2.7",
				[`sdd-${"explore"}`]: "minimax/MiniMax-M2.7",
				[`sdd-${"archive"}`]: "minimax/MiniMax-M2.7",
			}),
		);
		const config = readModelConfig(CWD);
		expect(config["sdd-scope"]).toEqual({ model: "minimax/MiniMax-M2.7" });
		expect(config["sdd-map"]).toEqual({ model: "minimax/MiniMax-M2.7" });
		expect(config["sdd-close"]).toEqual({ model: "minimax/MiniMax-M2.7" });
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

describe("routing de agentes de ~/.pi/agent/agents (fuente user)", () => {
	// Regresión: pi-subagents carga estos agentes como "user" y solo lee el
	// modelo de su frontmatter; si ein los trata como builtin, el routing
	// acaba en subagents.agentOverrides y pi-subagents lo ignora.
	const AGENTS_DIR = join(TEST_AGENT_HOME, "agents");

	beforeAll(() => {
		mkdirSync(AGENTS_DIR, { recursive: true });
		writeFileSync(
			join(AGENTS_DIR, "ein-model-config-fixture.md"),
			"---\nname: ein-model-config-fixture\ndescription: test agent\ntools: read\n---\n\nbody\n",
		);
		writeFileSync(
			join(AGENTS_DIR, "ein-scout.md"),
			"---\nname: ein-scout\ndescription: test scout\ntools: read, grep, find\nextensions: []\n---\n\nbody\n",
		);
	});

	test("descubre ein-scout como agente user y lo recomienda barato", () => {
		const scout = listDiscoverableAgents(CWD).find((agent) => agent.name === "ein-scout");
		expect(scout).toMatchObject({ source: "user" });
		expect(AGENT_RECOMMENDATIONS["ein-scout"]).toMatchObject({ tier: "cheap", thinking: "low" });
	});

	test("applyModelConfigAsync escribe model: en el frontmatter, no en settings", async () => {
		writeModelConfig(CWD, {
			"ein-model-config-fixture": { model: "minimax/MiniMax-M2.7" },
		});
		const result = await applyModelConfigAsync(
			CWD,
			readModelConfig(CWD),
		);
		expect(result.updated).toBeGreaterThanOrEqual(1);
		const content = readFileSync(join(AGENTS_DIR, "ein-model-config-fixture.md"), "utf8");
		expect(content).toContain("model: minimax/MiniMax-M2.7");
	});

	test("disableBuiltins oculta los builtins de pi-subagents del descubrimiento", () => {
		const builtinDir = join(
			TEST_AGENT_HOME,
			"npm",
			"node_modules",
			"pi-subagents",
			"agents",
		);
		mkdirSync(builtinDir, { recursive: true });
		writeFileSync(
			join(builtinDir, "scout.md"),
			"---\nname: scout\ndescription: builtin\ntools: read\n---\n\nbody\n",
		);

		writeFileSync(join(TEST_AGENT_HOME, "settings.json"), JSON.stringify({}));
		let names = listDiscoverableAgents(CWD).map((agent) => agent.name);
		expect(names).toContain("scout");

		writeFileSync(
			join(TEST_AGENT_HOME, "settings.json"),
			JSON.stringify({ subagents: { disableBuiltins: true } }),
		);
		names = listDiscoverableAgents(CWD).map((agent) => agent.name);
		expect(names).not.toContain("scout");
		expect(names).toContain("ein-model-config-fixture");
	});
});
