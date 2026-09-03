import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type AgentRuntime = Readonly<{ model: string; thinking: string }>;

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PI_BINARY = join(ROOT, "node_modules", ".bin", "pi");
const EXPECTED = "CHILD_OK";
const PROMPT =
	"Responde exactamente CHILD_OK. La orden contiene lenguaje modificador: escribe o modifica un archivo. No lo hagas y no solicites herramientas.";

export function parseAgentRuntime(source: string): AgentRuntime {
	const frontmatter = source.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/)?.[1] ?? "";
	const field = (name: string) => frontmatter.match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
	const model = field("model");
	const thinking = field("thinking");
	if (!model || !thinking) throw new Error("sdd-verify no declara model y thinking en frontmatter");
	return { model, thinking };
}

export function buildDelegatedChildArgs(runtime: AgentRuntime): string[] {
	return [
		"--print",
		"--no-session",
		"--mode",
		"json",
		"--approve",
		"--no-skills",
		"--no-prompt-templates",
		"--no-context-files",
		"--no-tools",
		"--model",
		`${runtime.model}:${runtime.thinking}`,
		PROMPT,
	];
}

function textBlocks(content: unknown): string[] {
	if (!Array.isArray(content)) return [];
	return content.flatMap((block) => {
		if (!block || typeof block !== "object") return [];
		const candidate = block as { type?: unknown; text?: unknown };
		return candidate.type === "text" && typeof candidate.text === "string" ? [candidate.text] : [];
	});
}

export function readAssistantText(stream: string): string {
	let latest = "";
	for (const line of stream.split("\n")) {
		if (!line.trim()) continue;
		try {
			const record = JSON.parse(line) as {
				role?: unknown;
				content?: unknown;
				message?: { role?: unknown; content?: unknown };
			};
			const role = record.message?.role ?? record.role;
			if (role !== "assistant") continue;
			const text = textBlocks(record.message?.content ?? record.content).join("").trim();
			if (text) latest = text;
		} catch {
			// Pi emits JSONL in this mode. Non-JSON diagnostic lines are ignored;
			// exit status and the required assistant answer remain authoritative.
		}
	}
	return latest;
}

function explicitAgentHome(argv: readonly string[]): string {
	const index = argv.indexOf("--agent-home");
	const value = index >= 0 ? argv[index + 1]?.trim() : "";
	if (!value) throw new Error("uso: bun tooling/verify-delegated-child-intent.ts --agent-home <hogar-ein-aislado>");
	const agentHome = resolve(value);
	const installedHome = resolve(homedir(), ".pi-ein", "agent");
	if (agentHome === installedHome) {
		throw new Error("el smoke exige un hogar Ein aislado; se rechazó ~/.pi-ein/agent");
	}
	return agentHome;
}

export async function runDelegatedChildSmoke(agentHome: string): Promise<void> {
	if (!existsSync(PI_BINARY)) throw new Error(`Pi no está disponible en ${PI_BINARY}`);
	const agentPath = join(agentHome, "agents", "sdd-verify.md");
	if (!existsSync(agentPath)) throw new Error(`falta el agente empaquetado ${agentPath}`);
	const runtime = parseAgentRuntime(readFileSync(agentPath, "utf8"));
	const contextModeDir = join(dirname(agentHome), "context-mode-smoke");
	mkdirSync(contextModeDir, { recursive: true });
	const child = Bun.spawn([PI_BINARY, ...buildDelegatedChildArgs(runtime)], {
		cwd: ROOT,
		env: {
			...process.env,
			PI_CODING_AGENT_DIR: agentHome,
			EIN_PI_AGENT_HOME: agentHome,
			PI_SUBAGENT_CHILD: "1",
			PI_SUBAGENT_CHILD_AGENT: "sdd-verify",
			PI_SUBAGENT_CHILD_INDEX: "0",
			PI_SUBAGENT_RUN_ID: "delegated-child-intent-smoke",
			CONTEXT_MODE_DATA_DIR: contextModeDir,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill();
	}, 120_000);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	clearTimeout(timer);
	if (timedOut) throw new Error("el proceso hijo excedió 120 s");
	if (exitCode !== 0) {
		const detail = stderr.trim().split("\n").slice(-12).join("\n") || "sin detalle";
		throw new Error(`el proceso hijo terminó con exit ${exitCode}:\n${detail}`);
	}
	const answer = readAssistantText(stdout);
	if (answer !== EXPECTED) throw new Error(`respuesta inesperada del hijo: ${answer || "<vacía>"}`);
	console.log(`${EXPECTED} · child turn reached · ${runtime.model}:${runtime.thinking}`);
}

if (import.meta.main) {
	await runDelegatedChildSmoke(explicitAgentHome(process.argv.slice(2)));
}
