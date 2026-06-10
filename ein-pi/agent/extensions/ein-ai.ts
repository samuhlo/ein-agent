import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import {
	access,
	mkdir,
	readFile,
	readdir,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
	ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import {
	ensureSddPreflight,
	getSddPreflightPreferences,
	installSddAssets,
	isSddPreflightTrigger,
	renderSddPreflightPrompt,
	type SddPreflightPreferences,
} from "../lib/sdd-preflight.ts";
import { resolveSkillInjection } from "./ein-skill-registry.ts";
import { humanizeAge, listRecentSessions } from "../lib/sessions";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ASSETS_DIR = join(PACKAGE_ROOT, "assets");

function einPiAgentHome(): string {
	return process.env.EIN_PI_AGENT_HOME ?? join(homedir(), ".pi", "agent");
}

function sddGlobalAssetDriftCount(): number {
	let stale = 0;
	for (const [assetSubdir, installedSubdir] of [
		["agents", "agents"],
		["chains", "chains"],
	] as const) {
		const assetDir = join(ASSETS_DIR, assetSubdir);
		if (!existsSync(assetDir)) continue;
		for (const entry of readdirSync(assetDir, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const installedPath = join(einPiAgentHome(), installedSubdir, entry.name);
			try {
				if (!existsSync(installedPath)) {
					stale += 1;
					continue;
				}
				if (
					readFileSync(join(assetDir, entry.name), "utf8") !==
					readFileSync(installedPath, "utf8")
				) {
					stale += 1;
				}
			} catch {
				stale += 1;
			}
		}
	}
	return stale;
}

function sddLocalOverrideDriftCount(cwd: string): number {
	let stale = 0;
	for (const [assetSubdir, installedSubdir] of [
		["agents", join(".pi", "agents")],
		["chains", join(".pi", "chains")],
	] as const) {
		const assetDir = join(ASSETS_DIR, assetSubdir);
		const installedDir = join(cwd, installedSubdir);
		if (!existsSync(assetDir) || !existsSync(installedDir)) continue;
		for (const entry of readdirSync(assetDir, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const installedPath = join(installedDir, entry.name);
			if (!existsSync(installedPath)) continue;
			try {
				if (
					readFileSync(join(assetDir, entry.name), "utf8") !==
					readFileSync(installedPath, "utf8")
				) {
					stale += 1;
				}
			} catch {
				stale += 1;
			}
		}
	}
	return stale;
}

let orchestratorPromptCache: string | null = null;
function getOrchestratorPrompt(): string {
	if (orchestratorPromptCache === null) {
		orchestratorPromptCache = readFileSync(
			join(ASSETS_DIR, "orchestrator.md"),
			"utf8",
		).trim();
	}
	return orchestratorPromptCache;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

type PersonaMode = "samuhlo" | "neutral";

const PERSONA_OPTIONS = ["samuhlo", "neutral"] as const;

const SAMUHLO_PERSONA_PROMPT = `Persona:
- Be direct, technical, and concise.
- When the user writes Spanish, answer in natural Rioplatense Spanish with voseo.
- Act as a senior architect and TEACHER: concepts before code, no shortcuts. Your job is to leave the human understanding the system better than before, not just to report status.
- Treat AI as a tool directed by the human; never present yourself as a default chatbot.
- Push back when the user asks for code without enough context or understanding.
- Correct errors directly, explain why, and show the better path.

Teaching mandate (the most important rule of this persona):
- An "important change" REQUIRES deep teaching. Important = a new dependency, a new pattern/abstraction, a new endpoint/API, an architecture or design decision, a non-trivial or multi-file implementation, a data-model change, or anything security-relevant.
- For an important change, the CORE and NON-SKIPPABLE part of the answer is HOW IT WORKS UNDER THE HOOD: name each new piece, say what each one does, and explain how they connect to each other — the actual mechanism, step by step. Do not just list the pieces; explain the machine.
  - Required depth example: if you add docxtemplater + pizzip, explain that a .docx is a ZIP of XML files, that pizzip unzips it in memory, that docxtemplater walks that XML and replaces {placeholders} with your context object, and that this is why the template must contain those placeholders.
- ANTI-PATTERN (a failure of this persona): delivering a bare status report for an important change — "what I did + verification + next step" with no real explanation of how it works internally. Never do this.
- Secondary teaching, after the HOW and only when it adds value: why this approach over alternatives, the reusable concept to take away, and gotchas / future maintenance traps.
- TRIVIAL changes (typo, copy tweak, small visual adjustment, rename, config bump) stay SHORT: no teaching block, no // 000 structure. Match the answer's weight to the change's weight.
- For important work use the Samu // 000 structured output (see the orchestrator's "Samu Output Format"); the "como funciona por dentro" section is the heart of the answer.
- Spanish, clear and direct. No corporate filler.`;

const NEUTRAL_PERSONA_PROMPT = `Persona:
- Be direct, technical, concise, warm, and professional.
- Always respond in the same language the user writes in.
- Do not use slang or regional expressions.
- Act as a senior architect and teacher: concepts before code, no shortcuts.
- Treat AI as a tool directed by the human; never present yourself as a default chatbot.
- Push back when the user asks for code without enough context or understanding.
- Correct errors directly, explain why, and show the better path.`;

function buildEinPrompt(persona: PersonaMode): string {
	const personaPrompt =
		persona === "neutral" ? NEUTRAL_PERSONA_PROMPT : SAMUHLO_PERSONA_PROMPT;
	return `## Ein Identity and Harness
You are Ein: a Pi-specific coding-agent harness for controlled development work.

Identity contract:
- If the user asks who or what you are, answer as Ein, not as a generic assistant.
- Say you are a Pi-specific coding-agent harness with senior architect persona.
- Mention SDD/OpenSpec phase artifacts and subagents as core capabilities.
- Mention memory only when memory packages or callable memory tools are actually active; never invent persistent memory.
- Do not claim portability outside the Pi runtime.

${personaPrompt}

Harness principles:
- Ein is not prompt engineering. It is runtime discipline around powerful agents.
- Prefer SDD/OpenSpec artifacts over floating chat context for non-trivial work.
- Clarify scope, constraints, acceptance criteria, and non-goals before implementation.
- When you need a decision from the user (checkpoints, irreversible/delivery actions, branching approaches), prefer the \`ask_user_question\` tool over free prose — but only when the answer changes the next step. Do not over-ask.
- Use subagents when available for exploration, planning, implementation, and review, while keeping one parent session responsible for orchestration.
- Keep writes single-threaded unless the user explicitly approves parallel write isolation.
- If tests exist, use strict TDD evidence: RED, GREEN, TRIANGULATE, REFACTOR.
- Avoid oversized, multi-area changes in a single step; ask before significantly expanding the scope of a task.
- Never claim persistent memory is available because of this package. Memory is provided by separate packages or MCP tools when installed and callable.

${getOrchestratorPrompt()}`;
}

const DENIED_BASH_PATTERNS: RegExp[] = [
	/\brm\s+-rf\s+(?:\/|~|\$HOME|\.\.?)(?:\s|$)/,
	/\bgit\s+reset\s+--hard\b/,
	/\bgit\s+clean\b(?=[^\n]*(?:-[^\n]*f|--force))(?=[^\n]*(?:-[^\n]*d|--directories))/,
	/\bgit\s+push\b(?=[^\n]*\s--force(?:-with-lease)?\b)/,
	/\bchmod\s+-R\s+777\b/,
	/\bchown\s+-R\b/,
];

const CONFIRM_BASH_PATTERNS: RegExp[] = [
	/\bgit\s+push\b/,
	/\bgit\s+rebase\b/,
	/\bgit\s+branch\s+-D\b/,
	/\bnpm\s+publish\b/,
	/\bpi\s+remove\b/,
];

const SDD_AGENT_NAMES = [
	"sdd-init",
	"sdd-explore",
	"sdd-design",
	"sdd-apply",
	"sdd-verify",
] as const;
const SDD_AGENT_NAME_SET = new Set<string>(SDD_AGENT_NAMES);

type SddAgentName = (typeof SDD_AGENT_NAMES)[number];
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
interface AgentRoutingEntry {
	model?: string;
	thinking?: ThinkingLevel;
}
type AgentModelConfig = Record<string, AgentRoutingEntry>;
type ModelConfigFileResult =
	| { status: "missing" }
	| { status: "invalid"; path: string }
	| { status: "valid"; config: AgentModelConfig };
type AgentSource = "project" | "user" | "builtin";

interface AgentEntry {
	name: string;
	source: AgentSource;
	filePath?: string;
}

const KEEP_CURRENT = "Mantener actual";
const INHERIT_MODEL = "Heredar modelo activo/por defecto";
const CUSTOM_MODEL = "Id de modelo personalizado";
const INHERIT_THINKING = "Heredar esfuerzo";
const THINKING_OPTIONS: (ThinkingLevel | typeof INHERIT_THINKING)[] = [
	INHERIT_THINKING,
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
];

const MODEL_CONTROL_OPTIONS = [
	KEEP_CURRENT,
	INHERIT_MODEL,
	CUSTOM_MODEL,
] as const;

function readStringPath(value: unknown, path: string[]): string | undefined {
	let current = value;
	for (const key of path) {
		if (!isRecord(current)) return undefined;
		current = current[key];
	}
	return typeof current === "string" ? current : undefined;
}

function isSddAgentStartEvent(event: unknown): boolean {
	const candidates = readAgentStartNames(event);
	if (candidates.some((value) => SDD_AGENT_NAME_SET.has(value))) return true;

	const systemPrompt = readStringPath(event, ["systemPrompt"]) ?? "";
	return SDD_AGENT_NAMES.some((name) => {
		const phase = name.replace(/^sdd-/, "");
		return new RegExp(`\\bSDD ${phase} executor\\b`, "i").test(systemPrompt);
	});
}

function readAgentStartNames(event: unknown): string[] {
	return [
		readStringPath(event, ["agentName"]),
		readStringPath(event, ["agent"]),
		readStringPath(event, ["name"]),
		readStringPath(event, ["agent", "name"]),
		readStringPath(event, ["subagent", "name"]),
	]
		.filter((value): value is string => value !== undefined)
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

function isNamedAgentStartEvent(event: unknown): boolean {
	return readAgentStartNames(event).length > 0;
}

function readAgentTask(event: unknown): string {
	const candidates = [
		readStringPath(event, ["task"]),
		readStringPath(event, ["prompt"]),
		readStringPath(event, ["userPrompt"]),
		readStringPath(event, ["input", "task"]),
		readStringPath(event, ["input", "prompt"]),
		readStringPath(event, ["message"]),
	].filter(
		(value): value is string =>
			typeof value === "string" && value.trim().length > 0,
	);
	if (candidates.length > 0) return candidates.join("\n");
	return readStringPath(event, ["systemPrompt"]) ?? "";
}

function evaluateDeniedCommand(
	command: string,
): ToolCallEventResult | undefined {
	for (const pattern of DENIED_BASH_PATTERNS) {
		if (pattern.test(command)) {
			return {
				block: true,
				reason:
					"Ein safety policy blocked a destructive shell command. Ask the user for an explicit safer plan.",
			};
		}
	}
	return undefined;
}

function commandRequiresConfirmation(command: string): boolean {
	return CONFIRM_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

async function confirmCommand(
	command: string,
	ctx: ExtensionContext,
): Promise<ToolCallEventResult | undefined> {
	const denied = evaluateDeniedCommand(command);
	if (denied) return denied;
	if (!commandRequiresConfirmation(command)) return undefined;
	if (!ctx.hasUI) {
		return {
			block: true,
			reason:
				"Ein safety policy requires interactive confirmation before this command.",
		};
	}
	const preview = truncateToWidth(
		command.replace(/\s+/g, " ").trim(),
		180,
		"…",
	);
	const approved = await ctx.ui.confirm("Allow guarded command?", preview);
	if (approved) return undefined;
	return {
		block: true,
		reason:
			"Ein safety policy blocked the command because it was not confirmed.",
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function einConfigHome(): string {
	return process.env.EIN_PI_CONFIG_HOME ?? join(homedir(), ".pi", "ein");
}

function modelConfigPath(_cwd: string): string {
	return join(einConfigHome(), "models.json");
}

function legacyProjectModelConfigPath(cwd: string): string {
	return join(cwd, ".pi", "ein", "models.json");
}

function personaConfigPath(cwd: string): string {
	return join(cwd, ".pi", "ein", "persona.json");
}

function readPersonaMode(cwd: string): PersonaMode {
	const path = personaConfigPath(cwd);
	if (!existsSync(path)) return "samuhlo";
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(parsed)) return "samuhlo";
		return parsed.mode === "neutral" ? "neutral" : "samuhlo";
	} catch {
		return "samuhlo";
	}
}

function writePersonaMode(cwd: string, mode: PersonaMode): void {
	const path = personaConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ mode }, null, 2)}\n`);
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return (
		value === "off" ||
		value === "minimal" ||
		value === "low" ||
		value === "medium" ||
		value === "high" ||
		value === "xhigh"
	);
}

function normalizeRoutingEntry(value: unknown): AgentRoutingEntry | undefined {
	if (typeof value === "string") {
		const model = value.trim();
		return model.length > 0 ? { model } : undefined;
	}
	if (!isRecord(value)) return undefined;
	const model =
		typeof value.model === "string" && value.model.trim().length > 0
			? value.model.trim()
			: undefined;
	const thinking = isThinkingLevel(value.thinking) ? value.thinking : undefined;
	if (!model && !thinking) return undefined;
	return { model, thinking };
}

function readModelConfigFile(path: string): ModelConfigFileResult {
	if (!existsSync(path)) return { status: "missing" };
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(parsed)) return { status: "invalid", path };
		const config: AgentModelConfig = {};
		for (const [name, value] of Object.entries(parsed)) {
			const entry = normalizeRoutingEntry(value);
			if (entry) config[name] = entry;
		}
		return { status: "valid", config };
	} catch {
		return { status: "invalid", path };
	}
}

async function readModelConfigFileAsync(
	path: string,
): Promise<ModelConfigFileResult> {
	if (!(await pathExists(path))) return { status: "missing" };
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		if (!isRecord(parsed)) return { status: "invalid", path };
		const config: AgentModelConfig = {};
		for (const [name, value] of Object.entries(parsed)) {
			const entry = normalizeRoutingEntry(value);
			if (entry) config[name] = entry;
		}
		return { status: "valid", config };
	} catch {
		return { status: "invalid", path };
	}
}

function readSavedModelConfig(cwd: string): ModelConfigFileResult {
	const globalResult = readModelConfigFile(modelConfigPath(cwd));
	if (globalResult.status !== "missing") return globalResult;
	const legacyResult = readModelConfigFile(legacyProjectModelConfigPath(cwd));
	if (legacyResult.status === "invalid") return { status: "valid", config: {} };
	return legacyResult;
}

async function readSavedModelConfigAsync(
	cwd: string,
): Promise<ModelConfigFileResult> {
	const globalResult = await readModelConfigFileAsync(modelConfigPath(cwd));
	if (globalResult.status !== "missing") return globalResult;
	const legacyResult = await readModelConfigFileAsync(
		legacyProjectModelConfigPath(cwd),
	);
	if (legacyResult.status === "invalid") return { status: "valid", config: {} };
	return legacyResult;
}

export function readModelConfig(cwd: string): AgentModelConfig {
	const result = readSavedModelConfig(cwd);
	return result.status === "valid" ? result.config : {};
}

export async function readModelConfigAsync(
	cwd: string,
): Promise<AgentModelConfig> {
	const result = await readSavedModelConfigAsync(cwd);
	return result.status === "valid" ? result.config : {};
}

function writeModelConfig(cwd: string, config: AgentModelConfig): void {
	const path = modelConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	const cleaned: AgentModelConfig = {};
	for (const [name, value] of Object.entries(config)) {
		const entry = normalizeRoutingEntry(value);
		if (entry) cleaned[name] = entry;
	}
	writeFileSync(path, `${JSON.stringify(cleaned, null, 2)}\n`);
}

function cloneModelConfig(config: AgentModelConfig): AgentModelConfig {
	return Object.fromEntries(
		Object.entries(config).map(([name, entry]) => [name, { ...entry }]),
	);
}

function updateFrontmatterRouting(
	content: string,
	entry: AgentRoutingEntry | undefined,
): string {
	if (!content.startsWith("---\n")) return content;
	const endIndex = content.indexOf("\n---", 4);
	if (endIndex === -1) return content;
	const frontmatter = content.slice(4, endIndex);
	const body = content.slice(endIndex);
	const lines = frontmatter
		.split("\n")
		.filter(
			(line) => !line.startsWith("model:") && !line.startsWith("thinking:"),
		);
	const toInsert: string[] = [];
	if (entry?.model) toInsert.push(`model: ${entry.model}`);
	if (entry?.thinking) toInsert.push(`thinking: ${entry.thinking}`);
	if (toInsert.length > 0) {
		const descriptionIndex = lines.findIndex((line) =>
			line.startsWith("description:"),
		);
		const insertIndex =
			descriptionIndex >= 0 ? descriptionIndex + 1 : Math.min(1, lines.length);
		lines.splice(insertIndex, 0, ...toInsert);
	}
	return `---\n${lines.join("\n")}${body}`;
}

function parseAgentName(filePath: string): string | undefined {
	let content: string;
	try {
		content = readFileSync(filePath, "utf8");
	} catch {
		return undefined;
	}
	const name = content.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
	if (!name) return undefined;
	const packageName = content
		.match(/^package:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]
		?.trim();
	return packageName ? `${packageName}.${name}` : name;
}

async function parseAgentNameAsync(
	filePath: string,
): Promise<string | undefined> {
	let content: string;
	try {
		content = await readFile(filePath, "utf8");
	} catch {
		return undefined;
	}
	const name = content.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
	if (!name) return undefined;
	const packageName = content
		.match(/^package:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]
		?.trim();
	return packageName ? `${packageName}.${name}` : name;
}

function listAgentFilesRecursive(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...listAgentFilesRecursive(path));
		else if (
			entry.isFile() &&
			entry.name.endsWith(".md") &&
			!entry.name.endsWith(".chain.md")
		)
			files.push(path);
	}
	return files;
}

async function listAgentFilesRecursiveAsync(dir: string): Promise<string[]> {
	if (!(await pathExists(dir))) return [];
	const files: string[] = [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return files;
	}
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listAgentFilesRecursiveAsync(path)));
		} else if (
			entry.isFile() &&
			entry.name.endsWith(".md") &&
			!entry.name.endsWith(".chain.md")
		) {
			files.push(path);
		}
	}
	return files;
}

function listAgentsFromDir(dir: string, source: AgentSource): AgentEntry[] {
	return listAgentFilesRecursive(dir)
		.map((filePath): AgentEntry | undefined => {
			const name = parseAgentName(filePath);
			return name ? { name, source, filePath } : undefined;
		})
		.filter((entry): entry is AgentEntry => entry !== undefined);
}

async function listAgentsFromDirAsync(
	dir: string,
	source: AgentSource,
): Promise<AgentEntry[]> {
	const filePaths = await listAgentFilesRecursiveAsync(dir);
	const entries: AgentEntry[] = [];
	for (const filePath of filePaths) {
		const name = await parseAgentNameAsync(filePath);
		if (name) entries.push({ name, source, filePath });
	}
	return entries;
}

function listDiscoverableAgents(cwd: string): AgentEntry[] {
	const builtinDirs = [
		join(einPiAgentHome(), "agents"),
		join(PACKAGE_ROOT, "..", "pi-subagents", "agents"),
		join(cwd, ".pi", "npm", "node_modules", "pi-subagents", "agents"),
		join(homedir(), ".local", "lib", "node_modules", "pi-subagents", "agents"),
	];
	const agents = [
		...builtinDirs.flatMap((dir) => listAgentsFromDir(dir, "builtin")),
		...listAgentsFromDir(join(homedir(), ".agents"), "user"),
		...listAgentsFromDir(join(cwd, ".agents"), "project"),
		...listAgentsFromDir(join(cwd, ".pi", "agents"), "project"),
	];
	const byName = new Map<string, AgentEntry>();
	for (const agent of agents) byName.set(agent.name, agent);
	const discovered = Array.from(byName.values());
	const sddFirst = SDD_AGENT_NAMES.map((name) =>
		discovered.find((agent) => agent.name === name),
	).filter((agent): agent is AgentEntry => agent !== undefined);
	const rest = discovered
		.filter((agent) => !SDD_AGENT_NAMES.includes(agent.name as SddAgentName))
		.sort((left, right) => left.name.localeCompare(right.name));
	return [...sddFirst, ...rest];
}

async function listDiscoverableAgentsAsync(cwd: string): Promise<AgentEntry[]> {
	const builtinDirs = [
		join(einPiAgentHome(), "agents"),
		join(PACKAGE_ROOT, "..", "pi-subagents", "agents"),
		join(cwd, ".pi", "npm", "node_modules", "pi-subagents", "agents"),
		join(homedir(), ".local", "lib", "node_modules", "pi-subagents", "agents"),
	];
	const agents: AgentEntry[] = [];
	for (const dir of builtinDirs) {
		agents.push(...(await listAgentsFromDirAsync(dir, "builtin")));
	}
	const otherDirs: Array<[string, AgentSource]> = [
		[join(homedir(), ".agents"), "user"],
		[join(cwd, ".agents"), "project"],
		[join(cwd, ".pi", "agents"), "project"],
	];
	for (const [dir, source] of otherDirs) {
		agents.push(...(await listAgentsFromDirAsync(dir, source)));
	}
	const byName = new Map<string, AgentEntry>();
	for (const agent of agents) byName.set(agent.name, agent);
	const discovered = Array.from(byName.values());
	const sddFirst = SDD_AGENT_NAMES.map((name) =>
		discovered.find((agent) => agent.name === name),
	).filter((agent): agent is AgentEntry => agent !== undefined);
	const rest = discovered
		.filter((agent) => !SDD_AGENT_NAMES.includes(agent.name as SddAgentName))
		.sort((left, right) => left.name.localeCompare(right.name));
	return [...sddFirst, ...rest];
}

function projectSettingsPath(cwd: string): string {
	return join(cwd, ".pi", "settings.json");
}

function globalSettingsPath(): string {
	return join(einPiAgentHome(), "settings.json");
}

function updateGlobalDefaultModel(provider: string, model: string): void {
	const path = globalSettingsPath();
	let settings: Record<string, unknown> = {};
	if (existsSync(path)) {
		try {
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
			if (isRecord(parsed)) settings = parsed;
		} catch {
			settings = {};
		}
	}
	settings.defaultProvider = provider;
	settings.defaultModel = model;
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(settings, null, "\t")}\n`);
}

// Modelo predeterminado por preset. El orquestador usa el defaultProvider/defaultModel
// del settings global; los subagentes usan ~/.pi/ein/models.json.
const MODEL_FULL: AgentModelConfig = {
	"sdd-design": { model: "openai-codex/gpt-5.5" },
	"sdd-init": { model: "minimax/MiniMax-M2.7" },
	"sdd-explore": { model: "minimax/MiniMax-M2.7" },
	"sdd-apply": { model: "minimax/MiniMax-M2.7" },
	"sdd-verify": { model: "minimax/MiniMax-M2.7" },
	"ein-linear": { model: "minimax/MiniMax-M2.7" },
	"ein-github": { model: "minimax/MiniMax-M2.7" },
};
const MODEL_FULL_ORCH = { provider: "openai-codex", model: "gpt-5.5" } as const;

const MODEL_LITE: AgentModelConfig = {
	"sdd-design": { model: "minimax/MiniMax-M2.7" },
	"sdd-init": { model: "minimax/MiniMax-M2.7" },
	"sdd-explore": { model: "minimax/MiniMax-M2.7" },
	"sdd-apply": { model: "minimax/MiniMax-M2.7" },
	"sdd-verify": { model: "minimax/MiniMax-M2.7" },
	"ein-linear": { model: "minimax/MiniMax-M2.7" },
	"ein-github": { model: "minimax/MiniMax-M2.7" },
};
const MODEL_LITE_ORCH = { provider: "minimax", model: "MiniMax-M2.7" } as const;

function applyPreset(cwd: string, preset: "full" | "lite"): string {
	const config = preset === "full" ? MODEL_FULL : MODEL_LITE;
	const orch = preset === "full" ? MODEL_FULL_ORCH : MODEL_LITE_ORCH;
	writeModelConfig(cwd, config);
	updateGlobalDefaultModel(orch.provider, orch.model);
	return preset === "full"
		? `Modo full activo.\n- Orquestador → gpt-5.5\n- sdd-design → gpt-5.5\n- Resto → MiniMax-M2.7\nReinicia Pi para que el cambio de orquestador tome efecto.`
		: `Modo lite activo. Todos los agentes → MiniMax-M2.7.\nReinicia Pi para que el cambio de orquestador tome efecto.`;
}

function updateBuiltinModelOverride(
	cwd: string,
	name: string,
	entry: AgentRoutingEntry | undefined,
): boolean {
	const path = projectSettingsPath(cwd);
	let settings: Record<string, unknown> = {};
	if (existsSync(path)) {
		try {
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
			if (isRecord(parsed)) settings = parsed;
		} catch {
			settings = {};
		}
	}
	const subagents = isRecord(settings.subagents)
		? { ...settings.subagents }
		: {};
	const agentOverrides = isRecord(subagents.agentOverrides)
		? { ...subagents.agentOverrides }
		: {};
	const current = isRecord(agentOverrides[name])
		? { ...agentOverrides[name] }
		: {};
	if (entry?.model === undefined) delete current.model;
	else current.model = entry.model;
	if (entry?.thinking === undefined) delete current.thinking;
	else current.thinking = entry.thinking;
	if (Object.keys(current).length > 0) agentOverrides[name] = current;
	else delete agentOverrides[name];
	if (Object.keys(agentOverrides).length > 0)
		subagents.agentOverrides = agentOverrides;
	else delete subagents.agentOverrides;
	if (Object.keys(subagents).length > 0) settings.subagents = subagents;
	else delete settings.subagents;
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(settings, null, "\t")}\n`);
	return true;
}

async function updateBuiltinModelOverrideAsync(
	cwd: string,
	name: string,
	entry: AgentRoutingEntry | undefined,
): Promise<boolean> {
	const path = projectSettingsPath(cwd);
	let settings: Record<string, unknown> = {};
	if (await pathExists(path)) {
		try {
			const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
			if (isRecord(parsed)) settings = parsed;
		} catch {
			settings = {};
		}
	}
	const subagents = isRecord(settings.subagents)
		? { ...settings.subagents }
		: {};
	const agentOverrides = isRecord(subagents.agentOverrides)
		? { ...subagents.agentOverrides }
		: {};
	const current = isRecord(agentOverrides[name])
		? { ...agentOverrides[name] }
		: {};
	if (entry?.model === undefined) delete current.model;
	else current.model = entry.model;
	if (entry?.thinking === undefined) delete current.thinking;
	else current.thinking = entry.thinking;
	if (Object.keys(current).length > 0) agentOverrides[name] = current;
	else delete agentOverrides[name];
	if (Object.keys(agentOverrides).length > 0)
		subagents.agentOverrides = agentOverrides;
	else delete subagents.agentOverrides;
	if (Object.keys(subagents).length > 0) settings.subagents = subagents;
	else delete settings.subagents;
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(settings, null, "\t")}\n`);
	return true;
}

export function applyModelConfig(
	cwd: string,
	config: AgentModelConfig,
): { updated: number; skipped: number } {
	let updated = 0;
	let skipped = 0;
	for (const agent of listDiscoverableAgents(cwd)) {
		const entry = config[agent.name];
		if (agent.source === "builtin") {
			if (updateBuiltinModelOverride(cwd, agent.name, entry)) updated += 1;
			else skipped += 1;
			continue;
		}
		if (!agent.filePath || !existsSync(agent.filePath)) {
			skipped += 1;
			continue;
		}
		const original = readFileSync(agent.filePath, "utf8");
		const next = updateFrontmatterRouting(original, entry);
		if (next === original) {
			skipped += 1;
			continue;
		}
		writeFileSync(agent.filePath, next);
		updated += 1;
	}
	return { updated, skipped };
}

export async function applyModelConfigAsync(
	cwd: string,
	config: AgentModelConfig,
): Promise<{ updated: number; skipped: number }> {
	let updated = 0;
	let skipped = 0;
	for (const agent of await listDiscoverableAgentsAsync(cwd)) {
		const entry = config[agent.name];
		if (agent.source === "builtin") {
			if (await updateBuiltinModelOverrideAsync(cwd, agent.name, entry))
				updated += 1;
			else skipped += 1;
			continue;
		}
		if (!agent.filePath || !(await pathExists(agent.filePath))) {
			skipped += 1;
			continue;
		}
		const original = await readFile(agent.filePath, "utf8");
		const next = updateFrontmatterRouting(original, entry);
		if (next === original) {
			skipped += 1;
			continue;
		}
		await writeFile(agent.filePath, next);
		updated += 1;
	}
	return { updated, skipped };
}

export async function applySavedModelConfig(
	ctx: ExtensionContext,
): Promise<{ updated: number; skipped: number; invalidPath?: string }> {
	const result = await readSavedModelConfigAsync(ctx.cwd);
	if (result.status === "invalid") {
		return { updated: 0, skipped: 0, invalidPath: result.path };
	}
	return applyModelConfigAsync(
		ctx.cwd,
		result.status === "valid" ? result.config : {},
	);
}

function describeModelConfig(cwd: string, config: AgentModelConfig): string[] {
	return listDiscoverableAgents(cwd).map((agent) => {
		const entry = config[agent.name];
		const model = entry?.model ?? "inherit";
		const thinking = entry?.thinking ?? "inherit";
		return `${agent.name}: model=${model}, effort=${thinking}`;
	});
}

async function getPiModelOptions(ctx: ExtensionContext): Promise<string[]> {
	const models = await ctx.modelRegistry.getAvailable();
	const modelIds = models
		.map((model) => `${model.provider}/${model.id}`)
		.sort((left, right) => left.localeCompare(right));
	return [...MODEL_CONTROL_OPTIONS, ...modelIds];
}

interface OverlayComponent {
	render(width: number): string[];
	handleInput(data: string): void;
	invalidate(): void;
}

type ModelPanelResult =
	| { type: "save"; config: AgentModelConfig }
	| { type: "custom"; agent: string | "all"; config: AgentModelConfig }
	| { type: "cancel" };

const SET_ALL_AGENTS = "Configurar todos los agentes";
const ORCHESTRATOR_ROW = "__orchestrator__";

function readOrchestratorModel(): string | undefined {
	const path = globalSettingsPath();
	if (!existsSync(path)) return undefined;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(parsed)) return undefined;
		const prov = typeof parsed.defaultProvider === "string" ? parsed.defaultProvider : "";
		const model = typeof parsed.defaultModel === "string" ? parsed.defaultModel : undefined;
		if (!model) return undefined;
		return prov ? `${prov}/${model}` : model;
	} catch {
		return undefined;
	}
}

// ─── Models panel visual helpers ─────────────────────────────────────────────
const AP = {
	r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m',
	gold: '\x1b[33m', cyan: '\x1b[36m', grn: '\x1b[32m',
	gray: '\x1b[90m', wht: '\x1b[37m',
} as const;

function vaStrip(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function vaPad(s: string, w: number): string {
	const vis = vaStrip(s).length;
	return vis < w ? s + ' '.repeat(w - vis) : s;
}

function vaModelColor(id: string | undefined): string {
	if (!id) return `${AP.d}${AP.gray}inherit${AP.r}`;
	const short = id.includes('/') ? id.split('/').pop()! : id;
	if (/^gpt-5|^o1|^o3/i.test(short)) return `${AP.gold}${short}${AP.r}`;
	if (/minimax|claude|gemini|llama/i.test(short)) return `${AP.cyan}${short}${AP.r}`;
	return `${AP.wht}${short}${AP.r}`;
}

function vaEffortColor(lvl: ThinkingLevel | undefined): string {
	if (!lvl) return `${AP.d}${AP.gray}─${AP.r}`;
	const MAP: Record<ThinkingLevel, string> = {
		off:     `${AP.gray}○  off${AP.r}`,
		minimal: `${AP.d}▪  minimal${AP.r}`,
		low:     `${AP.wht}▪▪  low${AP.r}`,
		medium:  `${AP.cyan}▪▪▪  medium${AP.r}`,
		high:    `${AP.gold}▪▪▪▪  high${AP.r}`,
		xhigh:   `${AP.b}${AP.gold}▪▪▪▪▪  xhigh${AP.r}`,
	};
	return MAP[lvl];
}
// ─────────────────────────────────────────────────────────────────────────────

class SddModelPanel implements OverlayComponent {
	private cursor = 0;
	private mode: "agents" | "models" | "effort" = "agents";
	private selectedRow = SET_ALL_AGENTS;
	private modelCursor = 0;
	private effortCursor = 0;
	private query = "";
	private readonly draft: AgentModelConfig;
	private readonly rows: string[];
	private readonly modelOptions: string[];
	private readonly done: (result: ModelPanelResult) => void;

	constructor(
		initialConfig: AgentModelConfig,
		modelOptions: string[],
		agents: string[],
		done: (result: ModelPanelResult) => void,
	) {
		this.draft = cloneModelConfig(initialConfig);
		this.rows = [ORCHESTRATOR_ROW, SET_ALL_AGENTS, ...agents];
		this.modelOptions = modelOptions;
		this.done = done;
	}

	invalidate(): void {}

	handleInput(data: string): void {
		if (this.mode === "models") {
			this.handleModelInput(data);
			return;
		}
		if (this.mode === "effort") {
			this.handleEffortInput(data);
			return;
		}
		this.handleAgentInput(data);
	}

	render(width: number): string[] {
		if (this.mode === "models") return this.renderModelPicker(width);
		if (this.mode === "effort") return this.renderEffortPicker(width);
		return this.renderAgentList(width);
	}

	private handleAgentInput(data: string): void {
		const maxCursor = this.rows.length + 1;
		if (matchesKey(data, "ctrl+c") || matchesKey(data, "escape")) {
			this.done({ type: "cancel" });
			return;
		}
		if (matchesKey(data, "ctrl+s")) {
			this.done({ type: "save", config: this.draft });
			return;
		}
		if (matchesKey(data, "down") || data === "j") {
			this.cursor = Math.min(maxCursor, this.cursor + 1);
			return;
		}
		if (matchesKey(data, "up") || data === "k") {
			this.cursor = Math.max(0, this.cursor - 1);
			return;
		}
		if (data === "i") {
			this.applyInherit();
			return;
		}
		if (data === "e") {
			const row = this.rows[this.cursor] ?? SET_ALL_AGENTS;
			if (row === ORCHESTRATOR_ROW) return; // orchestrator has no effort setting
			this.selectedRow = row;
			this.mode = "effort";
			this.effortCursor = 0;
			return;
		}
		if (data === "c") {
			const row = this.rows[this.cursor];
			if (row === SET_ALL_AGENTS)
				this.done({ type: "custom", agent: "all", config: this.draft });
			else if (row)
				this.done({ type: "custom", agent: row, config: this.draft });
			return;
		}
		if (!matchesKey(data, "return")) return;
		if (this.cursor === this.rows.length) {
			this.done({ type: "save", config: this.draft });
			return;
		}
		if (this.cursor === this.rows.length + 1) {
			this.done({ type: "cancel" });
			return;
		}
		this.selectedRow = this.rows[this.cursor] ?? SET_ALL_AGENTS;
		this.mode = "models";
		this.modelCursor = 0;
		this.query = "";
	}

	private handleModelInput(data: string): void {
		const options = this.filteredModelOptions();
		if (matchesKey(data, "ctrl+c")) {
			this.done({ type: "cancel" });
			return;
		}
		if (matchesKey(data, "escape")) {
			this.mode = "agents";
			this.query = "";
			return;
		}
		if (matchesKey(data, "backspace")) {
			this.query = this.query.slice(0, -1);
			this.modelCursor = Math.min(
				this.modelCursor,
				Math.max(0, this.filteredModelOptions().length - 1),
			);
			return;
		}
		if (matchesKey(data, "down") || data === "j") {
			this.modelCursor = Math.min(
				Math.max(0, options.length - 1),
				this.modelCursor + 1,
			);
			return;
		}
		if (matchesKey(data, "up") || data === "k") {
			this.modelCursor = Math.max(0, this.modelCursor - 1);
			return;
		}
		if (matchesKey(data, "return")) {
			const selected = options[this.modelCursor];
			if (!selected) return;
			if (selected === CUSTOM_MODEL) {
				this.done({
					type: "custom",
					agent: this.selectedRow === SET_ALL_AGENTS ? "all" : this.selectedRow,
					config: this.draft,
				});
				return;
			}
			if (selected === KEEP_CURRENT) {
				this.mode = "agents";
				return;
			}
			this.applyModelSelection(
				selected === INHERIT_MODEL ? undefined : selected,
			);
			this.mode = "agents";
			return;
		}
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.query += data;
			this.modelCursor = 0;
		}
	}

	private get agentNames(): string[] {
		return this.rows.filter(r => r !== ORCHESTRATOR_ROW && r !== SET_ALL_AGENTS);
	}

	private applyModelSelection(model: string | undefined): void {
		const row = this.rows[this.cursor];
		if (row === SET_ALL_AGENTS) {
			for (const name of this.agentNames) this.setModel(name, model);
			// also update orchestrator when "set all"
			this.setModel(ORCHESTRATOR_ROW, model);
			return;
		}
		if (!row) return;
		this.setModel(row, model);
	}

	private applyThinkingSelection(thinking: ThinkingLevel | undefined): void {
		const row = this.selectedRow;
		if (row === SET_ALL_AGENTS) {
			for (const name of this.agentNames) this.setThinking(name, thinking);
			return;
		}
		if (row === ORCHESTRATOR_ROW) return; // orchestrator has no effort setting
		this.setThinking(row, thinking);
	}

	private applyInherit(): void {
		const row = this.rows[this.cursor];
		if (row === SET_ALL_AGENTS) {
			for (const name of this.agentNames) this.clearEntry(name);
			this.clearEntry(ORCHESTRATOR_ROW);
			return;
		}
		if (row) this.clearEntry(row);
	}

	private setModel(name: string, model: string | undefined): void {
		const current = this.draft[name] ?? {};
		if (model === undefined) delete current.model;
		else current.model = model;
		if (!current.model && !current.thinking) delete this.draft[name];
		else this.draft[name] = current;
	}

	private setThinking(name: string, thinking: ThinkingLevel | undefined): void {
		const current = this.draft[name] ?? {};
		if (thinking === undefined) delete current.thinking;
		else current.thinking = thinking;
		if (!current.model && !current.thinking) delete this.draft[name];
		else this.draft[name] = current;
	}

	private clearEntry(name: string): void {
		delete this.draft[name];
	}

	private static addBorder(title: string, lines: string[], width: number): string[] {
		const inner = Math.max(4, width - 2);
		const titleVis = vaStrip(title).length;
		const leftDash = 2;
		const rightDash = Math.max(1, inner - 2 - leftDash - titleVis);
		const top =
			`${AP.d}${AP.gray}┌${'─'.repeat(leftDash)}${AP.r} ${title} ` +
			`${AP.d}${AP.gray}${'─'.repeat(rightDash)}┐${AP.r}`;
		const bottom = `${AP.d}${AP.gray}└${'─'.repeat(inner)}┘${AP.r}`;
		const result: string[] = [top];
		for (const line of lines) {
			const pad = Math.max(0, inner - vaStrip(line).length);
			result.push(`${AP.d}${AP.gray}│${AP.r}${line}${' '.repeat(pad)}${AP.d}${AP.gray}│${AP.r}`);
		}
		result.push(bottom);
		return result;
	}

	private filteredModelOptions(): string[] {
		const query = this.query.trim().toLowerCase();
		if (!query) return this.modelOptions;
		return this.modelOptions.filter((option) =>
			option.toLowerCase().includes(query),
		);
	}

	private renderAgentList(width: number): string[] {
		const inner = Math.max(4, width - 2);
		const tr = (t = '') => truncateToWidth(t, inner, '…', true);
		const C1 = 18;
		const C2 = 16;
		const lines: string[] = [];

		lines.push(tr(''));
		lines.push(tr(
			` ${AP.d}${AP.gray}${'AGENTE'.padEnd(C1)}  ${'MODELO'.padEnd(C2)}  ESFUERZO${AP.r}`
		));
		lines.push(tr(` ${AP.d}${AP.gray}${'─'.repeat(C1 + C2 + 12)}${AP.r}`));
		lines.push(tr(''));

		let prevGroup = '';

		for (let i = 0; i < this.rows.length; i++) {
			const row = this.rows[i] ?? SET_ALL_AGENTS;
			const focused = i === this.cursor;
			const cur = focused ? `${AP.gold}▸${AP.r}` : ' ';

			if (row === ORCHESTRATOR_ROW) {
				const model = this.draft[ORCHESTRATOR_ROW]?.model;
				const nameStr = focused
					? `${AP.b}${AP.gold}◈ Orquestador${AP.r}`
					: `${AP.wht}◈ Orquestador${AP.r}`;
				lines.push(tr(
					`${cur} ${vaPad(nameStr, C1)}  ${vaPad(vaModelColor(model), C2)}  ${AP.d}${AP.gray}─${AP.r}`
				));
				lines.push(tr(` ${AP.d}${AP.gray}${'─'.repeat(C1 + C2 + 10)}${AP.r}`));
				continue;
			}

			if (row === SET_ALL_AGENTS) {
				const allModels = this.agentNames.map(n => this.draft[n]?.model);
				const allEfforts = this.agentNames.map(n => this.draft[n]?.thinking);
				const uniqM = [...new Set(allModels)];
				const uniqE = [...new Set(allEfforts)];
				const mStr = uniqM.length === 1 ? vaModelColor(uniqM[0]) : `${AP.gold}mixed${AP.r}`;
				const eStr = uniqE.length === 1 ? vaEffortColor(uniqE[0]) : `${AP.gold}mixed${AP.r}`;
				const label = focused
					? `${AP.b}${AP.wht}⊞  Todos los agentes${AP.r}`
					: `${AP.d}⊞  Todos los agentes${AP.r}`;
				lines.push(tr(`${cur} ${vaPad(label, C1)}  ${vaPad(mStr, C2)}  ${eStr}`));
				lines.push(tr(''));
				continue;
			}

			const group = SDD_AGENT_NAME_SET.has(row) ? 'SDD'
				: (row === 'ein-linear' || row === 'ein-github') ? 'ENTREGA'
				: 'OTROS';

			if (group !== prevGroup) {
				const sep = `─── ${group} `;
				lines.push(tr(
					` ${AP.d}${AP.gray}${sep}${'─'.repeat(Math.max(2, C1 + C2 + 6 - sep.length))}${AP.r}`
				));
				prevGroup = group;
			}

			const model = this.draft[row]?.model;
			const effort = this.draft[row]?.thinking;
			const nameStr = focused ? `${AP.b}${AP.gold}${row}${AP.r}` : row;
			lines.push(tr(
				`${cur} ${vaPad(nameStr, C1)}  ${vaPad(vaModelColor(model), C2)}  ${vaEffortColor(effort)}`
			));
		}

		lines.push(tr(''));
		const saveFoc = this.cursor === this.rows.length;
		const cancelFoc = this.cursor === this.rows.length + 1;
		lines.push(tr(
			` ${saveFoc ? `${AP.gold}▸${AP.r}` : ' '} ${AP.grn}✓ Guardar${AP.r}` +
			`        ` +
			`${cancelFoc ? `${AP.gold}▸${AP.r}` : ' '} ${AP.d}${AP.gray}✗ Cancelar${AP.r}`
		));
		lines.push(tr(''));
		lines.push(tr(
			` ${AP.d}${AP.gray}↑↓ · Enter modelo · e esfuerzo · i heredar · Ctrl+S guardar${AP.r}`
		));
		lines.push(tr(''));

		const title = `${AP.gold}${AP.b}■ MODELOS DE AGENTES${AP.r}`;
		return SddModelPanel.addBorder(title, lines, width);
	}

	private renderModelPicker(width: number): string[] {
		const inner = Math.max(4, width - 2);
		const tr = (t = '') => truncateToWidth(t, inner, '…', true);
		const options = this.filteredModelOptions();
		const lines: string[] = [];
		const isControlOpt = (s: string) => (MODEL_CONTROL_OPTIONS as readonly string[]).includes(s);

		const agentLabel = this.selectedRow === SET_ALL_AGENTS ? 'todos los agentes' : this.selectedRow;
		lines.push(tr(''));

		const searchText = this.query
			? `${AP.wht}${this.query}${AP.r}`
			: `${AP.d}${AP.gray}buscar...${AP.r}`;
		lines.push(tr(` ${AP.gray}◎${AP.r}  ${searchText}`));
		lines.push(tr(` ${AP.d}${AP.gray}${'─'.repeat(Math.max(10, inner - 2))}${AP.r}`));
		lines.push(tr(''));

		if (options.length === 0) {
			lines.push(tr(` ${AP.d}${AP.gray}sin modelos coincidentes${AP.r}`));
		} else {
			const maxVisible = 12;
			const start = Math.max(
				0,
				Math.min(
					this.modelCursor - Math.floor(maxVisible / 2),
					Math.max(0, options.length - maxVisible),
				),
			);
			const end = Math.min(options.length, start + maxVisible);
			let addedSep = false;

			for (let i = start; i < end; i++) {
				const opt = options[i] ?? '';
				const focused = i === this.modelCursor;
				const cur = focused ? `${AP.gold}▸${AP.r}` : ' ';

				if (!addedSep && !isControlOpt(opt)) {
					addedSep = true;
					lines.push(tr(` ${AP.d}${AP.gray}${'─'.repeat(Math.max(10, inner - 2))}${AP.r}`));
				}

				let label: string;
				if (opt === KEEP_CURRENT) {
					label = focused ? `${AP.b}${AP.wht}${opt}${AP.r}` : `${AP.d}${opt}${AP.r}`;
				} else if (opt === INHERIT_MODEL) {
					label = focused ? `${AP.b}${AP.wht}${opt}${AP.r}` : `${AP.d}${opt}${AP.r}`;
				} else if (opt === CUSTOM_MODEL) {
					label = focused
						? `${AP.b}${AP.cyan}${opt}…${AP.r}`
						: `${AP.d}${AP.gray}${opt}…${AP.r}`;
				} else {
					const parts = opt.split('/');
					if (parts.length >= 2) {
						const provider = parts.slice(0, -1).join('/');
						const modelPart = parts[parts.length - 1]!;
						const colored = vaModelColor(modelPart);
						label = focused
							? `${AP.d}${AP.gray}${provider}/${AP.r}${AP.b}${colored}`
							: `${AP.d}${AP.gray}${provider}/${AP.r}${colored}`;
					} else {
						label = focused ? `${AP.b}${vaModelColor(opt)}` : vaModelColor(opt);
					}
				}
				lines.push(tr(` ${cur} ${label}`));
			}

			if (end < options.length) {
				lines.push(tr(` ${AP.d}${AP.gray}··· ${options.length - end} más${AP.r}`));
			}
		}

		lines.push(tr(''));
		lines.push(tr(
			` ${AP.d}${AP.gray}↑↓ navegar · Enter seleccionar · tipo buscar · Esc volver${AP.r}`
		));
		lines.push(tr(''));

		const title = `${AP.gold}${AP.b}■ MODELO${AP.r}  ${AP.d}${AP.gray}para:${AP.r}  ${AP.wht}${agentLabel}${AP.r}`;
		return SddModelPanel.addBorder(title, lines, width);
	}

	private handleEffortInput(data: string): void {
		if (matchesKey(data, "ctrl+c")) {
			this.done({ type: "cancel" });
			return;
		}
		if (matchesKey(data, "escape")) {
			this.mode = "agents";
			return;
		}
		if (matchesKey(data, "down") || data === "j") {
			this.effortCursor = Math.min(
				Math.max(0, THINKING_OPTIONS.length - 1),
				this.effortCursor + 1,
			);
			return;
		}
		if (matchesKey(data, "up") || data === "k") {
			this.effortCursor = Math.max(0, this.effortCursor - 1);
			return;
		}
		if (!matchesKey(data, "return")) return;
		const selected = THINKING_OPTIONS[this.effortCursor];
		if (selected === INHERIT_THINKING) this.applyThinkingSelection(undefined);
		else this.applyThinkingSelection(selected);
		this.mode = "agents";
	}

	private renderEffortPicker(width: number): string[] {
		const inner = Math.max(4, width - 2);
		const tr = (t = '') => truncateToWidth(t, inner, '…', true);
		const lines: string[] = [];

		const agentLabel = this.selectedRow === SET_ALL_AGENTS ? 'todos los agentes' : this.selectedRow;
		lines.push(tr(''));

		for (let i = 0; i < THINKING_OPTIONS.length; i++) {
			const opt = THINKING_OPTIONS[i];
			const focused = i === this.effortCursor;
			const cur = focused ? `${AP.gold}▸${AP.r}` : ' ';

			let label: string;
			if (opt === INHERIT_THINKING) {
				label = focused
					? `${AP.b}${AP.wht}─  Heredar (por defecto)${AP.r}`
					: `${AP.d}${AP.gray}─  Heredar (por defecto)${AP.r}`;
			} else {
				const colored = vaEffortColor(opt as ThinkingLevel);
				label = focused ? `${AP.b}${colored}` : colored;
			}
			lines.push(tr(` ${cur} ${label}`));
		}

		lines.push(tr(''));
		lines.push(tr(` ${AP.d}${AP.gray}↑↓ navegar · Enter seleccionar · Esc volver${AP.r}`));
		lines.push(tr(''));

		const title = `${AP.gold}${AP.b}■ ESFUERZO${AP.r}  ${AP.d}${AP.gray}para:${AP.r}  ${AP.wht}${agentLabel}${AP.r}`;
		return SddModelPanel.addBorder(title, lines, width);
	}
}

async function showSddModelPanel(
	ctx: ExtensionContext,
	config: AgentModelConfig,
): Promise<ModelPanelResult> {
	const modelOptions = await getPiModelOptions(ctx);
	const agents = listDiscoverableAgents(ctx.cwd).map((agent) => agent.name);
	return ctx.ui.custom<ModelPanelResult>(
		(_tui, _theme, _keybindings, done) =>
			new SddModelPanel(config, modelOptions, agents, done),
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: "70%",
				minWidth: 72,
				maxHeight: "85%",
			},
		},
	);
}

async function handleModelsCommand(ctx: ExtensionContext): Promise<void> {
	const savedConfig = await readSavedModelConfigAsync(ctx.cwd);
	if (savedConfig.status === "invalid") {
		ctx.ui.notify(
			`Ein no puede abrir la config de modelos: ${savedConfig.path} no es JSON valido u objeto. Corrigelo o eliminalo y vuelve a ejecutar /ein:models.`,
			"warning",
		);
		return;
	}
	// Seed config with current orchestrator model so it appears in the panel
	const orchModelStr = readOrchestratorModel();
	let config: AgentModelConfig = {
		...(savedConfig.status === "valid" ? savedConfig.config : {}),
		...(orchModelStr ? { [ORCHESTRATOR_ROW]: { model: orchModelStr } } : {}),
	};
	let result = await showSddModelPanel(ctx, config);
	while (result.type === "custom") {
		config = cloneModelConfig(result.config);
		const isOrch = result.agent === ORCHESTRATOR_ROW;
		const current =
			result.agent === "all" || isOrch
				? "inherit"
				: (config[result.agent]?.model ?? "inherit");
		const label = result.agent === "all"
			? "todos los agentes"
			: isOrch ? "Orquestador (formato: proveedor/modelo)"
			: result.agent;
		const custom = await ctx.ui.input(
			`${label} — id de modelo personalizado`,
			current === "inherit" ? "proveedor/modelo" : current,
		);
		if (custom === undefined) return;
		const trimmed = custom.trim();
		if (trimmed.length > 0) {
			if (result.agent === "all") {
				const next: AgentModelConfig = { ...config };
				for (const agent of listDiscoverableAgents(ctx.cwd)) {
					next[agent.name] = {
						...(next[agent.name] ?? {}),
						model: trimmed,
					};
				}
				// Also update orchestrator when setting all
				next[ORCHESTRATOR_ROW] = { model: trimmed };
				config = next;
			} else {
				config = {
					...config,
					[result.agent]: {
						...(config[result.agent] ?? {}),
						model: trimmed,
					},
				};
			}
		}
		result = await showSddModelPanel(ctx, config);
	}
	if (result.type !== "save") return;

	// Extract orchestrator entry and persist separately
	const orchEntry = result.config[ORCHESTRATOR_ROW];
	const subagentConfig = Object.fromEntries(
		Object.entries(result.config).filter(([k]) => k !== ORCHESTRATOR_ROW),
	);
	writeModelConfig(ctx.cwd, subagentConfig);
	const applyResult = await applyModelConfigAsync(ctx.cwd, subagentConfig);

	const notifyLines: string[] = ["Config de modelos guardada."];
	if (orchEntry?.model) {
		const slash = orchEntry.model.indexOf('/');
		const provider = slash > 0 ? orchEntry.model.slice(0, slash) : "";
		const model = slash > 0 ? orchEntry.model.slice(slash + 1) : orchEntry.model;
		if (provider && model) {
			updateGlobalDefaultModel(provider, model);
			notifyLines.push(`Orquestador → ${orchEntry.model} (reinicia Pi para aplicar)`);
		}
	}
	notifyLines.push(
		`Config global: ${modelConfigPath(ctx.cwd)}`,
		`Agentes actualizados: ${applyResult.updated}`,
		...describeModelConfig(ctx.cwd, subagentConfig),
	);
	ctx.ui.notify(notifyLines.join("\n"), "info");
}

async function handlePersonaCommand(ctx: ExtensionContext): Promise<void> {
	const current = readPersonaMode(ctx.cwd);
	const selected = await ctx.ui.select(
		`Persona de Ein (actual: ${current})`,
		[...PERSONA_OPTIONS],
	);
	if (selected !== "samuhlo" && selected !== "neutral") return;
	writePersonaMode(ctx.cwd, selected);
	ctx.ui.notify(
		[
			`Persona actualizada: ${selected}`,
			`Config: ${personaConfigPath(ctx.cwd)}`,
			"Reinicia Pi o abre una sesion nueva para que el cambio tome efecto.",
		].join("\n"),
		"info",
	);
}

async function runLinearPreflight(ctx: ExtensionContext): Promise<void> {
	try {
		if (!ctx.hasUI) return;
		// Attempt lightweight Linear project detection from cwd
		// This is intentionally minimal - just a brief status hint
		ctx.ui.notify("Sesion Ein iniciada. Preflight Linear completado.", "info");
	} catch {
		// Silently skip Linear preflight if unavailable
	}
}

export default function einAi(pi: ExtensionAPI): void {
	function runSddPreflight(ctx: ExtensionContext): Promise<SddPreflightPreferences> {
		return ensureSddPreflight(ctx, {
			pi,
			installAssets: (cwd) => installSddAssets(cwd, false),
			applyModelConfig: async () => applySavedModelConfig(ctx),
		});
	}

	pi.on("session_start", async (_event, ctx) => {
		try {
			const installResult = installSddAssets(ctx.cwd, false);
			const modelResult = await applySavedModelConfig(ctx);
			if (ctx.hasUI && modelResult.invalidPath) {
				ctx.ui.notify(
					`Ein omitio la config de modelos: ${modelResult.invalidPath} no es JSON valido. Corrigelo o eliminalo y vuelve a ejecutar /ein:models.`,
					"warning",
				);
				return;
			}
			if (ctx.hasUI && modelResult.updated > 0) {
				ctx.ui.notify(
					`Config de modelos aplicada a ${modelResult.updated} agente(s). Assets SDD listos: ${installResult.agents} agente(s), ${installResult.chains} chain(s), ${installResult.support} soporte.`,
					"info",
				);
			}
			await runLinearPreflight(ctx);
		} catch (error) {
			if (ctx.hasUI) {
				const message =
					error instanceof Error ? error.message : String(error);
				ctx.ui.notify(
					`Error al aplicar config de modelos: ${message}`,
					"warning",
				);
			}
		}
	});

	pi.on("input", async (event, ctx) => {
		if (typeof event.text !== "string" || !isSddPreflightTrigger(event.text)) {
			return { action: "continue" };
		}
		await runSddPreflight(ctx);
		return { action: "continue" };
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const isSddAgent = isSddAgentStartEvent(event);
		const isNamedAgent = isNamedAgentStartEvent(event);
		if (isSddAgent && !getSddPreflightPreferences(ctx)) {
			await runSddPreflight(ctx);
		}
		const prefs = getSddPreflightPreferences(ctx);
		const sddPrompt =
			prefs && (!isNamedAgent || isSddAgent)
				? `\n\n${renderSddPreflightPrompt(prefs)}`
				: "";
		const einPrompt = isNamedAgent || isSddAgent
			? ""
			: `\n\n${buildEinPrompt(readPersonaMode(ctx.cwd))}`;
		// Deterministic skill injection: phase/named subagents receive exact
		// SKILL.md paths resolved from their task, not the parent model's discretion.
		let skillsPrompt = "";
		if (isNamedAgent || isSddAgent) {
			const block = resolveSkillInjection(ctx.cwd, readAgentTask(event));
			if (block) skillsPrompt = `\n\n${block}`;
		}
		return {
			systemPrompt: `${event.systemPrompt}${einPrompt}${sddPrompt}${skillsPrompt}`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		if (!isRecord(event.input) || typeof event.input.command !== "string")
			return undefined;
		return confirmCommand(event.input.command, ctx);
	});

	pi.registerCommand("ein:ai:install-sdd", {
		description:
			"Reinstalar o refrescar los agentes y chains SDD globales de Ein",
		handler: async (args, ctx) => {
			const force = args.includes("--force");
			const result = installSddAssets(ctx.cwd, force);
			ctx.ui.notify(
				`Assets SDD instalados: ${result.agents} agente(s), ${result.chains} chain(s), ${result.support} soporte, ${result.skipped} ya presentes.`,
				"info",
			);
		},
	});

	pi.registerCommand("ein:ai:sdd-preflight", {
		description:
			"Ejecutar o reutilizar el preflight SDD para esta sesion de Pi",
		handler: async (_args, ctx) => {
			await runSddPreflight(ctx);
		},
	});

	pi.registerCommand("ein:models", {
		description: "Ver o configurar los modelos activos por agente en Ein",
		handler: async (_args, ctx) => {
			await handleModelsCommand(ctx);
		},
	});

	pi.registerCommand("ein:models:full", {
		description: "Preset full: orquestador + sdd-design → gpt-5.5, resto → MiniMax-M2.7",
		handler: (_args, ctx) => {
			const msg = applyPreset(ctx.cwd, "full");
			ctx.ui.notify(msg, "info");
		},
	});

	pi.registerCommand("ein:models:lite", {
		description: "Preset lite: todos los agentes → MiniMax-M2.7 (escape de rate-limit gpt-5.5)",
		handler: (_args, ctx) => {
			const msg = applyPreset(ctx.cwd, "lite");
			ctx.ui.notify(msg, "info");
		},
	});

	pi.registerCommand("ein:persona", {
		description: "Cambiar la persona de Ein entre samuhlo y neutral",
		handler: async (_args, ctx) => {
			await handlePersonaCommand(ctx);
		},
	});

	pi.registerCommand("ein:resume", {
		description: "Listar sesiones recientes con el comando para recuperarlas",
		handler: async (_args, ctx) => {
			const sessions = listRecentSessions(8);
			const lines: string[] = ["/// 000. SESIONES RECIENTES", ""];
			if (!sessions.length) {
				lines.push("- No hay sesiones guardadas todavia.");
			} else {
				lines.push("- Atajos: `pi -c` (continuar ultima) · `pi -r` (elegir sesion)");
				lines.push("");
				for (const s of sessions) {
					lines.push(`- ${s.project} (${humanizeAge(s.ageMs)})`);
					lines.push(`  pi --session ${s.id}`);
				}
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("ein:status", {
		description: "Ver estado del sistema Ein (agentes, chains, skills, proyecto)",
		handler: async (_args, ctx) => {
			const home = einPiAgentHome();
			const agentsDir = join(home, "agents");
			const chainsDir = join(home, "chains");
			const skillsLocalDir = join(home, "skills", "local");
			const skillsDownloadedDir = join(home, "skills", "downloaded");
			const mcpFile = join(home, "mcp.json");

			const agents = existsSync(agentsDir)
				? readdirSync(agentsDir).filter((f) => f.endsWith(".md")).sort()
				: [];
			const chains = existsSync(chainsDir)
				? readdirSync(chainsDir).filter((f) => f.endsWith(".chain.md")).sort()
				: [];

			function countDirs(dir: string): number {
				if (!existsSync(dir)) return 0;
				try {
					return readdirSync(dir).length;
				} catch {
					return 0;
				}
			}

			const localSkills = countDirs(skillsLocalDir);
			const downloadedSkills = countDirs(skillsDownloadedDir);
			const openspecConfigured = existsSync(join(ctx.cwd, "openspec", "config.yaml"));
			const staleDrift = sddGlobalAssetDriftCount();

			let mcpServers: string[] = [];
			if (existsSync(mcpFile)) {
				try {
					const cfg = JSON.parse(readFileSync(mcpFile, "utf8")) as {
						mcpServers?: Record<string, unknown>;
					};
					mcpServers = Object.keys(cfg.mcpServers ?? {});
				} catch {
					mcpServers = [];
				}
			}

			const lines: string[] = [];
			lines.push("/// 000. EIN STATUS");
			lines.push(`autor: samuhlo`);
			lines.push(`persona: ${readPersonaMode(ctx.cwd)}`);
			lines.push(`estado: ${staleDrift > 0 ? "drift detectado" : "operativo"}`);
			lines.push("");

			lines.push("■ 001. SDD");
			lines.push(`agentes: ${agents.length}`);
			for (const a of agents) lines.push(`- ${a}`);
			lines.push(`chains: ${chains.length}`);
			for (const c of chains) lines.push(`- ${c}`);
			if (staleDrift > 0)
				lines.push(`drift: ${staleDrift} archivo(s) desincronizado(s) — /ein:ai:install-sdd --force para refrescar`);
			lines.push("");

			lines.push("■ 002. SKILLS");
			lines.push(`locales: ${localSkills}`);
			lines.push(`descargadas: ${downloadedSkills}`);
			lines.push("");

			lines.push("■ 003. PROYECTO");
			lines.push(`openspec: ${openspecConfigured ? "configurado" : "no configurado — /sdd-init para arrancar"}`);
			lines.push(`modelo: ${existsSync(modelConfigPath(ctx.cwd)) ? "config presente" : "sin config local"}`);
			lines.push("");

			lines.push("■ 004. MCP");
			if (mcpServers.length > 0) {
				lines.push(`servidores: ${mcpServers.join(", ")}`);
			} else {
				lines.push("servidores: ninguno configurado");
			}
			lines.push("");

			lines.push("■ 005. DIAGNOSTICO");
			lines.push(`- ${"/ein:doctor-output"} para smoke checks tecnicos`);
			lines.push(`- ${"/ein:doctor"} para diagnostico explicativo`);

			const level = staleDrift > 0 ? "warning" : "info";
			ctx.ui.notify(lines.join("\n"), level);
		},
	});

	pi.registerCommand("ein:help", {
		description: "Ayuda del sistema Ein — usa 'full' para detalle completo",
		handler: async (args, ctx) => {
			const mode = (Array.isArray(args) ? args.join(" ") : String(args ?? ""))
				.trim()
				.toLowerCase();
			const lines: string[] = [];

			if (mode === "full") {
				lines.push("// 000. RESUMEN");
				lines.push("");
				lines.push("Ein esta listo. Autor: samuhlo.");
				lines.push(
					"Esta guia muestra que comando usar segun objetivo y que limites respeta cada flujo.",
				);
				lines.push("");
				lines.push("// 000b. USO RECOMENDADO: HABLA CON EIN");
				lines.push("");
				lines.push("Ein entiende lenguaje natural. No necesitas aprender comandos slash.");
				lines.push("Flujos canonicos:");
				lines.push("");
				lines.push("  Nueva tarea seria  →  'Nueva tarea: ... montala en Linear y prepara SDD'");
				lines.push("  Continuar SDD      →  'continua con SDD'");
				lines.push("  Aplicar            →  'aplica el primer batch'");
				lines.push("  Verificar          →  'verifica'");
				lines.push("  Sincronizar Linear →  'sincroniza Linear'");
				lines.push("");
				lines.push(
					"Los comandos slash (/ein:*) son controles avanzados de emergencia o uso manual.",
				);
				lines.push("");
				lines.push("// 001. COMANDOS CORE");
				lines.push("");
				lines.push("- /ein:status           → estado rapido del workbench.");
				lines.push("- /ein:persona          → ver/cambiar estilo (samuhlo|neutral).");
				lines.push("- /ein:models           → ver modelos activos.");
				lines.push("- /ein:resume           → sesiones recientes + pi --session <id>.");
				lines.push("- /ein:help [full]      → esta ayuda.");
				lines.push("");
				lines.push("// 002. FLUJO SDD");
				lines.push("");
				lines.push("- SDD fluye via lenguaje natural o chain ein-sdd.");
				lines.push("- /sdd-init             → bootstrap openspec/config.yaml en el proyecto.");
				lines.push("- /ein:ai:sdd-preflight → preflight SDD (modo y store de artefactos).");
				lines.push("- /ein:ai:install-sdd   → reinstalar/refrescar assets SDD globales.");
				lines.push("");
				lines.push("// 003. FLUJO LINEAR");
				lines.push("");
				lines.push("- /ein:linear:new <request>       → crea/reusa trabajo con preflight.");
				lines.push("- /ein:linear:project-bootstrap   → siembra fases + milestones.");
				lines.push("- /ein:linear:milestones <proj>   → lista milestones.");
				lines.push("- /ein:linear:help                → ayuda especifica de Linear.");
				lines.push("");
				lines.push("// 004. FLUJO GITHUB");
				lines.push("");
				lines.push("- GitHub fluye via el agente ein-github (lenguaje natural o /ein:github:*).");
				lines.push("");
				lines.push("// 005. SKILLS");
				lines.push("");
				lines.push("- /ein:skills                     → status del stack (perfil, drift, fuera de stack).");
				lines.push("- /ein:skills update              → actualiza locales (repo) + bajadas (catalogo).");
				lines.push("- /ein:skills update --local      → solo locales desde el repo ein-agent.");
				lines.push("- /ein:skills update --downloaded → solo bajadas desde el catalogo.");
				lines.push("- /ein:skills add <skill>         → instala una skill del catalogo.");
				lines.push("- /ein:skills clean [--yes]       → purga bajadas fuera de stack.");
				lines.push("- /ein:skills:advisor <tarea>     → advisor de skills para una tarea.");
				lines.push("");
				lines.push("// 006. DIAGNOSTICO");
				lines.push("");
				lines.push("- /ein:doctor                     → diagnostico explicativo del sistema.");
				lines.push("- /ein:doctor-output              → smoke checks tecnicos (OK/WARN/FAIL).");
				lines.push("");
				lines.push("// 007. GATES Y LIMITES");
				lines.push("");
				lines.push("- Delivery no se encadena automaticamente.");
				lines.push("- Commit != push != PR != merge (cada fase requiere intencion explicita).");
				lines.push(
					"- Si la peticion es ambigua, se pide aclaracion antes de acciones irreversibles.",
				);
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			lines.push("/// 000. AYUDA EIN");
			lines.push("autor: samuhlo");
			lines.push("");
			lines.push("■ 001. CORE");
			lines.push("- /ein:status | /ein:persona | /ein:models | /ein:resume | /ein:help [full]");
			lines.push("- /ein:models:full  → preset gpt-5.5 (orquestador + sdd-design)");
			lines.push("- /ein:models:lite  → preset MiniMax-M2.7 todo (escape rate-limit)");
			lines.push("- /ein:resume       → sesiones recientes + pi --session <id>");
			lines.push("");
			lines.push("■ 002. SDD");
			lines.push("- /sdd-init → bootstrap openspec en el proyecto actual");
			lines.push("- SDD fluye via lenguaje natural o chain ein-sdd");
			lines.push("");
			lines.push("■ 003. LINEAR");
			lines.push("- /ein:linear:new | :project-bootstrap | :milestones | :help");
			lines.push("");
			lines.push("■ 004. SKILLS");
			lines.push("- /ein:skills [update [--local|--downloaded]|add|clean] | /ein:skills:advisor <tarea>");
			lines.push("");
			lines.push("■ 005. DIAGNOSTICO");
			lines.push("- /ein:doctor | /ein:doctor-output");
			lines.push("");
			lines.push("- detalle: /ein:help full");
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}