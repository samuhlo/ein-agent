// =============================================================================
// TESTS: contrato de tools de los agentes — la allowlist debe EXISTIR
// =============================================================================
// BLINDAJE -> `tools:` en el frontmatter de un agente es una allowlist ESTRICTA
// que pi-subagents pasa al hijo como `--tools`. Si declara un nombre que Pi no
// registra, el hijo escribe un diagnóstico y el padre lo convierte en
// `closeError` AL CERRAR: el run sale ✗ aunque el artefacto esté escrito y
// `ein_sdd_check` lo dé por bueno. Peor: pi-subagents antepone al system prompt
// del hijo "Do not claim tool-dependent work succeeded; report this
// configuration error to the parent", así que el hijo se pelea consigo mismo y
// reintenta. Un typo en esta línea no falla rápido: falla caro y en silencio.
//
// Caso real (jul 2026): los siete agentes SDD declaraban `glob`, que NO es un
// builtin de Pi — el equivalente se llama `find`. scope/map/design salieron ✗
// con los artefactos correctos y ~120k tokens quemados en reintentos.
// =============================================================================

import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import einAiExtension from "../ein-pi/agent/extensions/ein-ai.ts";
import { clearAgentControlSession, routeAgentControl } from "../ein-pi/agent/lib/agent-controls.ts";
import { clearSddParticipantSession, planSddParticipants } from "../ein-pi/agent/lib/sdd-participants.ts";
import { ensureEinGitignore } from "../ein-pi/agent/lib/gitignore.ts";
import { PI_BUILTIN_TOOLS as PI_CONTRACT_BUILTINS } from "../ein-pi/agent/lib/pi-contract";

const CORE_AGENTS = join(import.meta.dir, "../ein-pi/core/agents");
const EXTENSIONS = join(import.meta.dir, "../ein-pi/agent/extensions");
const orchestrator = readFileSync(
	join(import.meta.dir, "../ein-pi/agent/assets/orchestrator.md"),
	"utf8",
);
const einAiSource = readFileSync(join(EXTENSIONS, "ein-ai.ts"), "utf8");

// Builtins de Pi: FUENTE ÚNICA en lib/pi-contract.ts, que además se contrasta
// contra la instalación real (tests/pi-contract.test.ts y `ein doctor`). Antes
// este set estaba replicado aquí y en el doctor: tres copias de la misma verdad
// es la duplicación que ya abrió un agujero en la validación de OpenSpec.
const PI_BUILTIN_TOOLS = new Set(PI_CONTRACT_BUILTINS);

// Un entry con `/` o extensión .ts/.js no es un nombre de tool: es la ruta del
// proveedor (pi-args la mueve a `--extension`). Se acepta sin validar el nombre.
function isProviderPath(entry: string): boolean {
	return entry.includes("/") || entry.endsWith(".ts") || entry.endsWith(".js");
}

function agentFiles(): string[] {
	return readdirSync(CORE_AGENTS)
		.filter((f) => f.endsWith(".md"))
		.sort();
}

// Lee la línea `tools:` del frontmatter y la parte en nombres.
function declaredTools(agentFile: string): string[] {
	const raw = readFileSync(join(CORE_AGENTS, agentFile), "utf8");
	const match = raw.match(/^tools:\s*(.+)$/m);
	if (!match?.[1]) return [];
	return match[1]
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);
}

// Nombres que registran las extensiones de Ein (`pi.registerTool({ name: … })`).
// El hijo hereda las extensiones globales, así que estos nombres SÍ existen en
// su runtime aunque no sean builtins.
function registeredExtensionTools(): Set<string> {
	const names = new Set<string>();
	for (const file of readdirSync(EXTENSIONS).filter((f) => f.endsWith(".ts"))) {
		const src = readFileSync(join(EXTENSIONS, file), "utf8");
		for (const m of src.matchAll(
			/registerTool\(\s*\{[\s\S]{0,200}?name:\s*"([a-z0-9_]+)"/g,
		)) {
			if (m[1]) names.add(m[1]);
		}
	}
	return names;
}

describe("contrato de tools de los agentes", () => {
	test("`glob` no es un builtin de Pi (ancla de regresión)", () => {
		// El bug original en una línea: si esto se cae, alguien volvió a creer
		// que Pi tiene `glob`. No lo tiene. Es `find`.
		expect(PI_BUILTIN_TOOLS.has("glob")).toBe(false);
		expect(PI_BUILTIN_TOOLS.has("find")).toBe(true);
	});

	test("hay agentes que auditar", () => {
		expect(agentFiles().length).toBeGreaterThanOrEqual(7);
	});

	test("toda tool declarada existe (builtin, extensión o ruta de proveedor)", () => {
		const extensionTools = registeredExtensionTools();
		const unknown: string[] = [];
		for (const file of agentFiles()) {
			for (const tool of declaredTools(file)) {
				if (isProviderPath(tool)) continue;
				if (PI_BUILTIN_TOOLS.has(tool)) continue;
				if (extensionTools.has(tool)) continue;
				unknown.push(`${file}: ${tool}`);
			}
		}
		// Mensaje explícito: el fallo tiene que decir QUÉ tool y en qué agente,
		// porque el síntoma en producción (un ✗ con el artefacto correcto) no lo dice.
		expect(unknown).toEqual([]);
	});

	test("ningún agente declara `glob`", () => {
		const offenders = agentFiles().filter((f) =>
			declaredTools(f).includes("glob"),
		);
		expect(offenders).toEqual([]);
	});

	test("Cleaner registra superficies compactas pasiva y activa", () => {
		const registered = registeredExtensionTools();
		expect(registered.has("ein_cleaner_evidence")).toBe(true);
		expect(registered.has("ein_cleaner_active_evidence")).toBe(true);
		expect(declaredTools("ein-cleaner.md")).toContain("ein_cleaner_evidence");
		expect(declaredTools("ein-cleaner.md")).toContain("ein_cleaner_active_evidence");
	});

	test("ein_sdd_close expone reconciliación explícita y conserva force/reason", () => {
		const closeTool = einAiSource.match(/name: "ein_sdd_close"[\s\S]*?(?=\n\t\/\/ Sin este tool)/)?.[0] ?? "";
		expect(closeTool).toContain('reconciliationProfile: { type: "string", enum: ["scope-only-out-of-flow"]');
		expect(closeTool).toContain('reconciliationEvidencePath: { type: "string"');
		expect(closeTool).toContain('reason: { type: "string"');
		expect(closeTool).toContain('force: { type: "boolean"');
		expect(closeTool).toContain("reconciliationProfile: params?.reconciliationProfile");
		expect(closeTool).toContain("reconciliationEvidencePath: params?.reconciliationEvidencePath");
	});

	test("check/audit siguen siendo lectura y no reciben opciones de reconciliación", () => {
		const checkTool = einAiSource.match(/name: "ein_sdd_check"[\s\S]*?(?=\n\tpi\.registerCommand\("ein:sdd-status")/)?.[0] ?? "";
		const auditFlow = einAiSource.match(/async function handleSddAudit[\s\S]*?(?=\n\tpi\.registerCommand\("ein:sdd-audit")/)?.[0] ?? "";
		expect(checkTool).not.toContain("reconciliationProfile");
		expect(checkTool).not.toContain("reconciliationEvidencePath");
		expect(auditFlow).not.toContain("closeChange(");
	});

	test("sdd-scope permite el escritor determinista de deltas registrado", () => {
		const scopeTools = declaredTools("sdd-scope.md");
		expect(registeredExtensionTools().has("ein_openspec_delta_write")).toBe(true);
		expect(scopeTools).toEqual([
			"read",
			"grep",
			"find",
			"write",
			"bash",
			"ein_openspec_delta_write",
		]);
	});

	test("ein-scout es una allowlist portátil de investigación sin capacidades de mutación", () => {
		const scout = readFileSync(join(CORE_AGENTS, "ein-scout.md"), "utf8");
		expect(declaredTools("ein-scout.md")).toEqual(["read", "grep", "find"]);
		// `extensions:` con valor VACÍO (no `[]`): pi-subagents parsea este campo
		// con parseFrontmatterList (split por comas/saltos), no como JSON. El
		// literal `[]` se convertía en el token `["[]"]` → `--extension []` →
		// crash de arranque. Vacío define el campo (dispara `--no-extensions`) y
		// parsea a lista vacía. Ver tests/agent-frontmatter-json.test.ts.
		expect(scout).toMatch(/^extensions:\s*$/m);
		expect(scout).not.toMatch(/^tools:.*(?:MCP|provider)/m);
		expect(scout).toMatch(/^defaultContext:\s*fresh$/m);
		expect(scout).toMatch(/^inheritProjectContext:\s*false$/m);
		expect(scout).toMatch(/^inheritSkills:\s*false$/m);
		expect(scout).toMatch(/^timeoutMs:\s*120000$/m);
		// pi-subagents hace JSON.parse de estos campos (agents.ts:1378/1401), así
		// que DEBEN ser JSON válido: claves con comillas. El formato con claves sin
		// comillas tumbaba el arranque de todo subagente (regresión v0.24.0).
		expect(scout).toMatch(/^turnBudget:\s*\{ "maxTurns": 12, "graceTurns": 2 \}$/m);
		expect(scout).toMatch(/^toolBudget:\s*\{ "hard": 30, "soft": 24, "block": "\*" \}$/m);
		expect(() => JSON.parse(scout.match(/^turnBudget:\s*(.+)$/m)![1])).not.toThrow();
		expect(() => JSON.parse(scout.match(/^toolBudget:\s*(.+)$/m)![1])).not.toThrow();
		for (const forbidden of ["bash", "write", "edit", "subagent", "delivery", "MCP", "provider"]) {
			expect(declaredTools("ein-scout.md")).not.toContain(forbidden);
		}
		expect(scout).toMatch(/no authority to design architecture, choose a solution, implement work/i);
		expect(scout).toMatch(/references/i);
		expect(scout).toMatch(/uncertainties/i);
	});

	test("la tabla del orchestrator coincide con el frontmatter real", () => {
		// La tabla es lo que el modelo LEE. Si enseña `glob` mientras el agente
		// declara `find`, el orquestador redacta tasks pidiendo una tool que no
		// existe. Las dos fuentes se validan la una contra la otra.
		const mismatches: string[] = [];
		for (const file of agentFiles()) {
			const agent = file.replace(/\.md$/, "");
			const row = orchestrator.match(
				new RegExp(`^\\|\\s*\`${agent}\`\\s*\\|([^|]+)\\|`, "m"),
			);
			if (!row?.[1]) continue; // no todos los agentes salen en la tabla
			// Una celda con `*` o paréntesis resume a propósito (ein-linear lista
			// 13 tools como `linear_* (issues, …)`). Se exime del match literal:
			// lo que importa es que no documente una tool inexistente.
			if (/[*(]/.test(row[1])) continue;
			const documented = row[1]
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean);
			const actual = declaredTools(file);
			if (documented.join(",") !== actual.join(",")) {
				mismatches.push(
					`${agent}: tabla=[${documented.join(", ")}] frontmatter=[${actual.join(", ")}]`,
				);
			}
		}
		expect(mismatches).toEqual([]);
	});
});

// Pi-edge harness: exercise the extension hook without exposing a provider-neutral
// result API. The coordinator remains the owner of sequencing and outcomes.
type Hook = (...args: unknown[]) => unknown;
const participantRoots: string[] = [];
const participantSessions: string[] = [];

function participantFixture(session: string): { cwd: string; task: string; context: Record<string, unknown> } {
	const cwd = mkdtempSync(join(tmpdir(), "ein-agent-tools-participant-"));
	participantRoots.push(cwd);
	participantSessions.push(session);
	mkdirSync(join(cwd, "src"), { recursive: true });
	writeFileSync(join(cwd, "src/a.ts"), "export const a = 1;\n");
	ensureEinGitignore(cwd);
	execFileSync("git", ["init", "-q"], { cwd });
	execFileSync("git", ["add", "src/a.ts"], { cwd });
	execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base"], { cwd });
	const change = join(cwd, "openspec/changes/change");
	mkdirSync(change, { recursive: true });
	writeFileSync(join(change, "scope.md"), "scope\n");
	writeFileSync(join(change, "map.md"), "map\n");
	writeFileSync(join(change, "design.md"), "design\n");
	writeFileSync(join(change, "tasks.md"), "status: ready\nblocked_by: none\n- [x] 1. done\n");
	writeFileSync(join(change, "apply-progress.md"), "status: complete\n\n## Files changed\n\n- `src/a.ts`\n");
	routeAgentControl(cwd, session, "cleaner", "on");
	routeAgentControl(cwd, session, "architect", "off");
	const plan = planSddParticipants(cwd, session, "change");
	if (!plan.next) throw new Error("participant fixture did not produce a Cleaner task");
	const context = {
		cwd,
		hasUI: false,
		ui: { notify() {}, async confirm() { return false; } },
		sessionManager: { getSessionId: () => session },
	};
	return { cwd, task: plan.next.task, context };
}

function participantHooks(): Map<string, Hook> {
	const hooks = new Map<string, Hook>();
	const pi = {
		on(name: string, handler: Hook) { hooks.set(name, handler); },
		registerCommand() {},
		registerTool() {},
		sendUserMessage() {},
	};
	einAiExtension(pi as never);
	return hooks;
}

async function deliverParticipantResult(
	details: unknown | ((task: string) => unknown),
	options: { toolName?: string; isError?: boolean; content?: unknown; workflow?: boolean } = {},
): Promise<{ cwd: string; session: string; result: unknown }> {
	const session = `pi-edge-${participantSessions.length}`;
	const fixture = participantFixture(session);
	const hooks = participantHooks();
	const toolCall = hooks.get("tool_call");
	const toolResult = hooks.get("tool_result");
	if (!toolCall || !toolResult) throw new Error("participant hooks were not registered");
	const workflowTask = JSON.stringify(fixture.task).replace(/\\n/g, "\n");
	const input: Record<string, unknown> = options.workflow
		? { workflowScript: `runs.run("audit", { agent: "ein-cleaner", task: ${workflowTask} })`, async: true, foregroundOnly: false }
		: { agent: "ein-cleaner", task: fixture.task, async: true, foregroundOnly: false };
	const callOutcome = await toolCall({ toolName: "subagent", toolCallId: "participant-call", input }, fixture.context);
	expect(callOutcome).toBeUndefined();
	expect(input.async).toBe(false);
	expect(input.foregroundOnly).toBe(true);
	const result = toolResult({
		toolName: options.toolName ?? "subagent",
		toolCallId: "participant-call",
		isError: options.isError ?? false,
		content: options.content ?? [],
		details: typeof details === "function" ? details(fixture.task) : details,
	}, fixture.context);
	return { cwd: fixture.cwd, session, result };
}

afterEach(() => {
	for (const session of participantSessions.splice(0)) {
		clearSddParticipantSession(session);
		clearAgentControlSession(session);
	}
	for (const root of participantRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Pi participant terminal edge", () => {
	test("accepts one foreground direct terminal result", async () => {
		const { cwd, session } = await deliverParticipantResult((task: string) => ({
			mode: "single",
			results: [{ index: 0, agent: "ein-cleaner", task, finalOutput: "status: complete\n" }],
		}));
		expect(planSddParticipants(cwd, session, "change").status).toBe("complete");
	});

	test("accepts one foreground one-child workflow terminal result", async () => {
		const { cwd, session } = await deliverParticipantResult((task: string) => ({
			mode: "workflow",
			results: [{ index: 0, agent: "ein-cleaner", task, exitCode: 0, finalOutput: "status: complete\n" }],
		}), { workflow: true });
		expect(planSddParticipants(cwd, session, "change").status).toBe("complete");
	});

	test("rejects multiple automatic participant children before foreground normalization", async () => {
		const session = `pi-edge-${participantSessions.length}`;
		const fixture = participantFixture(session);
		const hooks = participantHooks();
		const toolCall = hooks.get("tool_call");
		if (!toolCall) throw new Error("participant tool_call hook was not registered");
		const task = JSON.stringify(fixture.task);
		const input: Record<string, unknown> = {
			workflowScript: `runs.run("audit-one", { agent: "ein-cleaner", task: ${task} }); runs.run("audit-two", { agent: "ein-cleaner", task: ${task} })`,
			async: true,
			foregroundOnly: false,
		};

		expect(await toolCall({ toolName: "subagent", toolCallId: "participant-call", input }, fixture.context)).toMatchObject({ block: true });
		expect(input.async).toBe(true);
		expect(input.foregroundOnly).toBe(false);
	});

	test.each([
		["multiple children", (task: string) => ({ mode: "workflow", results: [
			{ index: 0, agent: "ein-cleaner", task, finalOutput: "status: complete\n" },
			{ index: 1, agent: "ein-cleaner", task, finalOutput: "status: complete\n" },
		] })],
		["missing output", (task: string) => ({ mode: "single", results: [{ index: 0, agent: "ein-cleaner", task }] })],
		["ambiguous output", (task: string) => ({ mode: "single", results: [{ index: 0, agent: "ein-cleaner", task, finalOutput: "status: complete\nstatus: blocked\n" }] })],
		["unsupported delivery", (_task: string) => ({ mode: "management", results: [] })],
	] as const)("returns unavailable for %s", async (_label, details) => {
		const { cwd, session } = await deliverParticipantResult(details, { content: [{ type: "text", text: "status: complete\n" }] });
		expect(planSddParticipants(cwd, session, "change").status).toBe("unavailable");
	});

	test("returns unavailable for background subagent_wait delivery", async () => {
		const { cwd, session } = await deliverParticipantResult({ mode: "management", results: [] }, { toolName: "subagent_wait", content: [{ type: "text", text: "status: complete\n" }] });
		expect(planSddParticipants(cwd, session, "change").status).toBe("unavailable");
	});

	test("returns unavailable for an unsupported result tool", async () => {
		const { cwd, session } = await deliverParticipantResult({ mode: "single", results: [] }, { toolName: "other_tool" });
		expect(planSddParticipants(cwd, session, "change").status).toBe("unavailable");
	});

	test("forwards an explicit blocked audit result and transport errors honestly", async () => {
		const blocked = await deliverParticipantResult((task: string) => ({
			mode: "single",
			results: [{ index: 0, agent: "ein-cleaner", task, finalOutput: "status: blocked\nreason: explicit audit finding\n" }],
		}));
		expect(planSddParticipants(blocked.cwd, blocked.session, "change")).toMatchObject({ status: "blocked", blocker: expect.stringContaining("explicit audit finding") });
		const failed = await deliverParticipantResult((task: string) => ({
			mode: "single",
			results: [{ index: 0, agent: "ein-cleaner", task, finalOutput: "status: complete\n" }],
		}), { isError: true });
		expect(planSddParticipants(failed.cwd, failed.session, "change").status).toBe("unavailable");
	});

	test("keeps explicit Cleaner and Architect tools independent", () => {
		const registered = registeredExtensionTools();
		expect(registered.has("ein_cleaner_audit")).toBe(true);
		expect(registered.has("ein_architect_evidence")).toBe(true);
		expect(einAiSource).toContain('name: "ein_cleaner_audit"');
		expect(einAiSource).toContain('name: "ein_architect_evidence"');
	});
});
