import { describe, expect, test } from "bun:test";
import {
	buildDelegatedChildArgs,
	parseAgentRuntime,
	readAssistantText,
} from "../tooling/verify-delegated-child-intent";

describe("smoke reproducible de intención delegada", () => {
	test("deriva modelo y thinking del agente instalado", () => {
		expect(parseAgentRuntime(`---\nname: sdd-verify\nmodel: openai-codex/gpt-latest\nthinking: xhigh\n---\n`)).toEqual({
			model: "openai-codex/gpt-latest",
			thinking: "xhigh",
		});
	});

	test("construye una ejecución sin sesión, skills, contexto ni tools", () => {
		const args = buildDelegatedChildArgs({ model: "provider/model", thinking: "high" });
		expect(args).toContain("--no-session");
		expect(args).toContain("--no-skills");
		expect(args).toContain("--no-prompt-templates");
		expect(args).toContain("--no-context-files");
		expect(args).toContain("--no-tools");
		expect(args).toContain("provider/model:high");
		expect(args.at(-1)).toContain("CHILD_OK");
	});

	test("extrae la respuesta del asistente del stream JSONL", () => {
		const stream = [
			JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "CHILD_OK" }] } }),
			JSON.stringify({ type: "agent_settled" }),
		].join("\n");
		expect(readAssistantText(stream)).toBe("CHILD_OK");
	});
});
