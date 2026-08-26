// =============================================================================
// /ein:models — esfuerzo real del orquestador
// =============================================================================
// Protege el fallo que originó este cambio: el panel podía editar el esfuerzo
// de todos menos del proceso principal. La prueba atraviesa el panel real,
// persiste settings.json y simula el clamp que Pi hace según las capacidades
// del modelo para comprobar que la UI no confunde solicitado con efectivo.
// =============================================================================

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const ROOT = mkdtempSync(join(tmpdir(), "ein-models-panel-orchestrator-"));
const AGENT_HOME = join(ROOT, "agent");
const CONFIG_HOME = join(ROOT, "ein");

const { handleModelsCommand } = await import(
	"../ein-pi/agent/extensions/internal/models-panel"
);

function stripAnsi(value: string): string {
	return value.replace(/\x1b\[[0-9;]*m/g, "");
}

function orchestratorLine(rendered: string): string {
	return rendered.split("\n").find((line) => line.includes("◈")) ?? "";
}

type HarnessOptions = {
	activeModel: string;
	effective: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
	input?: string;
	clamp?: boolean;
};

async function runPanel(options: HarnessOptions): Promise<{
	rendered: string;
	setThinkingCalls: string[];
	notifications: string[];
}> {
	const previousAgentHome = process.env.EIN_PI_AGENT_HOME;
	const previousConfigHome = process.env.EIN_PI_CONFIG_HOME;
	process.env.EIN_PI_AGENT_HOME = AGENT_HOME;
	process.env.EIN_PI_CONFIG_HOME = CONFIG_HOME;
	const slash = options.activeModel.indexOf("/");
	const provider = options.activeModel.slice(0, slash);
	const id = options.activeModel.slice(slash + 1);
	const setThinkingCalls: string[] = [];
	const notifications: string[] = [];
	let rendered = "";
	let effective = options.effective;

	const pi = {
		getThinkingLevel: () => effective,
		setThinkingLevel: (level: typeof effective) => {
			setThinkingCalls.push(level);
			effective = options.clamp ? options.effective : level;
		},
	} as unknown as ExtensionAPI;

	const ctx = {
		cwd: ROOT,
		model: { provider, id },
		modelRegistry: { getAvailable: async () => [] },
		ui: {
			notify: (message: string) => notifications.push(message),
			input: async () => undefined,
			custom: async (factory: Function) => {
				let callbackResult: unknown;
				const component = factory(
					undefined,
					undefined,
					undefined,
					(value: unknown) => {
						callbackResult = value;
					},
				);
				if (options.input) component.handleInput(options.input);
				rendered = component.render(100).map(stripAnsi).join("\n");
				// No depende de `matchesKey`: otros tests del repo mockean pi-tui de
				// forma global, mientras esta prueba valida estado/aplicación, no teclas.
				return callbackResult ?? component.saveResult();
			},
		},
	} as unknown as ExtensionContext;

	try {
		await handleModelsCommand(pi, ctx);
		return { rendered, setThinkingCalls, notifications };
	} finally {
		if (previousAgentHome === undefined) delete process.env.EIN_PI_AGENT_HOME;
		else process.env.EIN_PI_AGENT_HOME = previousAgentHome;
		if (previousConfigHome === undefined) delete process.env.EIN_PI_CONFIG_HOME;
		else process.env.EIN_PI_CONFIG_HOME = previousConfigHome;
	}
}

describe("esfuerzo del orquestador en /ein:models", () => {
	beforeAll(() => {
		mkdirSync(AGENT_HOME, { recursive: true });
		mkdirSync(CONFIG_HOME, { recursive: true });
	});

	afterAll(() => {
		rmSync(ROOT, { recursive: true, force: true });
	});

	test("permite pasar high → xhigh y muestra el clamp efectivo sin mentir", async () => {
		writeFileSync(
			join(AGENT_HOME, "settings.json"),
			JSON.stringify({
				defaultProvider: "openai-codex",
				defaultModel: "gpt-5.6-sol",
				defaultThinkingLevel: "high",
			}),
		);

		const result = await runPanel({
			activeModel: "openai-codex/gpt-5.6-sol",
			effective: "high",
			input: "e",
			clamp: true,
		});

		expect(result.rendered).toContain("xhigh");
		expect(result.rendered.toLowerCase()).toMatch(/pend|pending/);
		expect(result.rendered).toContain("high");
		expect(result.setThinkingCalls).toEqual(["xhigh"]);
		const settings = JSON.parse(
			readFileSync(join(AGENT_HOME, "settings.json"), "utf8"),
		) as Record<string, unknown>;
		expect(settings.defaultThinkingLevel).toBe("xhigh");
		const notification = result.notifications.join("\n").toLowerCase();
		expect(notification).toContain("xhigh");
		expect(notification).toContain("high");
		expect(notification).toMatch(/limit|clamp/);
	});

	test("confirma xhigh como efectivo cuando Pi acepta el cambio", async () => {
		writeFileSync(
			join(AGENT_HOME, "settings.json"),
			JSON.stringify({
				defaultProvider: "openai-codex",
				defaultModel: "gpt-5.6-sol",
				defaultThinkingLevel: "high",
			}),
		);
		const result = await runPanel({
			activeModel: "openai-codex/gpt-5.6-sol",
			effective: "high",
			input: "e",
		});
		expect(result.setThinkingCalls).toEqual(["xhigh"]);
		const notification = result.notifications.join("\n").toLowerCase();
		expect(notification).toContain("xhigh");
		expect(notification).toMatch(/efectiv|effective/);
		expect(notification).not.toMatch(/limit|clamp/);
	});

	test("heredado y explícito efectivo son estados visualmente distintos", async () => {
		writeFileSync(
			join(AGENT_HOME, "settings.json"),
			JSON.stringify({
				defaultProvider: "openai-codex",
				defaultModel: "gpt-5.6-sol",
			}),
		);
		const inherited = await runPanel({
			activeModel: "openai-codex/gpt-5.6-sol",
			effective: "high",
		});

		writeFileSync(
			join(AGENT_HOME, "settings.json"),
			JSON.stringify({
				defaultProvider: "openai-codex",
				defaultModel: "gpt-5.6-sol",
				defaultThinkingLevel: "high",
			}),
		);
		const explicit = await runPanel({
			activeModel: "openai-codex/gpt-5.6-sol",
			effective: "high",
		});

		const inheritedRow = orchestratorLine(inherited.rendered).toLowerCase();
		const explicitRow = orchestratorLine(explicit.rendered).toLowerCase();
		expect(inheritedRow).toMatch(/hered|inherit/);
		expect(explicitRow).toMatch(/efectiv|effective/);
		expect(explicitRow).not.toMatch(/hered|inherit/);
		expect(inheritedRow).not.toBe(explicitRow);
	});

	test("si el modelo solicitado no es el activo, difiere el esfuerzo al reinicio", async () => {
		writeFileSync(
			join(AGENT_HOME, "settings.json"),
			JSON.stringify({
				defaultProvider: "minimax",
				defaultModel: "MiniMax-M3",
				defaultThinkingLevel: "xhigh",
			}),
		);

		const result = await runPanel({
			activeModel: "openai-codex/gpt-5.6-sol",
			effective: "high",
		});

		expect(result.setThinkingCalls).toEqual([]);
		expect(result.notifications.join("\n").toLowerCase()).toMatch(
			/reinici|restart/,
		);
	});

	test("un valor persistido inválido se representa como desconocido", async () => {
		writeFileSync(
			join(AGENT_HOME, "settings.json"),
			JSON.stringify({ defaultThinkingLevel: "turbo" }),
		);
		const result = await runPanel({
			activeModel: "openai-codex/gpt-5.6-sol",
			effective: "high",
		});
		expect(result.rendered.toLowerCase()).toMatch(/desconoc|unknown/);
		expect(result.rendered).toContain("high");
	});

	test("settings.json roto aborta antes de aplicar cambios parciales", async () => {
		const settingsPath = join(AGENT_HOME, "settings.json");
		const modelConfig = join(CONFIG_HOME, "models.json");
		const broken = "{json roto\n";
		writeFileSync(settingsPath, broken);
		rmSync(modelConfig, { force: true });

		const result = await runPanel({
			activeModel: "openai-codex/gpt-5.6-sol",
			effective: "high",
			input: "e",
		});

		expect(readFileSync(settingsPath, "utf8")).toBe(broken);
		expect(existsSync(modelConfig)).toBe(false);
		expect(result.setThinkingCalls).toEqual([]);
		expect(result.notifications.join("\n").toLowerCase()).toMatch(
			/nothing was applied|no se ha aplicado nada/,
		);
	});
});
