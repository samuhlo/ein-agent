// =============================================================================
// MODEL CONFIG
// Enrutado de modelos por agente: lee/escribe ~/.pi/ein/models.json, aplica
// la config al frontmatter de agentes descubiertos (o a agentOverrides para
// builtins), gestiona el modelo del orquestador en settings.json global y
// define los presets full/lite.
// =============================================================================

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
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { AGENT_DIR } from "../extensions/ein-paths";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const SDD_AGENT_NAMES = [
	"sdd-init",
	"sdd-explore",
	"sdd-design",
	"sdd-apply",
	"sdd-verify",
] as const;
export const SDD_AGENT_NAME_SET = new Set<string>(SDD_AGENT_NAMES);
export type SddAgentName = (typeof SDD_AGENT_NAMES)[number];

export type ThinkingLevel =
	| "off"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";
export interface AgentRoutingEntry {
	model?: string;
	thinking?: ThinkingLevel;
}
export type AgentModelConfig = Record<string, AgentRoutingEntry>;
export type ModelConfigFileResult =
	| { status: "missing" }
	| { status: "invalid"; path: string }
	| { status: "valid"; config: AgentModelConfig };
export type AgentSource = "project" | "user" | "builtin";

export interface AgentEntry {
	name: string;
	source: AgentSource;
	filePath?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function einConfigHome(): string {
	return process.env.EIN_PI_CONFIG_HOME ?? join(homedir(), ".pi", "ein");
}

export function modelConfigPath(_cwd: string): string {
	return join(einConfigHome(), "models.json");
}

function legacyProjectModelConfigPath(cwd: string): string {
	return join(cwd, ".pi", "ein", "models.json");
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

export async function readSavedModelConfigAsync(
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

export function writeModelConfig(cwd: string, config: AgentModelConfig): void {
	const path = modelConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	const cleaned: AgentModelConfig = {};
	for (const [name, value] of Object.entries(config)) {
		const entry = normalizeRoutingEntry(value);
		if (entry) cleaned[name] = entry;
	}
	writeFileSync(path, `${JSON.stringify(cleaned, null, 2)}\n`);
}

export function cloneModelConfig(config: AgentModelConfig): AgentModelConfig {
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

function sortDiscovered(discovered: AgentEntry[]): AgentEntry[] {
	const sddFirst = SDD_AGENT_NAMES.map((name) =>
		discovered.find((agent) => agent.name === name),
	).filter((agent): agent is AgentEntry => agent !== undefined);
	const rest = discovered
		.filter((agent) => !SDD_AGENT_NAMES.includes(agent.name as SddAgentName))
		.sort((left, right) => left.name.localeCompare(right.name));
	return [...sddFirst, ...rest];
}

function builtinAgentDirs(cwd: string): string[] {
	return [
		join(AGENT_DIR, "agents"),
		join(PACKAGE_ROOT, "..", "pi-subagents", "agents"),
		join(cwd, ".pi", "npm", "node_modules", "pi-subagents", "agents"),
		join(homedir(), ".local", "lib", "node_modules", "pi-subagents", "agents"),
	];
}

export function listDiscoverableAgents(cwd: string): AgentEntry[] {
	const agents = [
		...builtinAgentDirs(cwd).flatMap((dir) => listAgentsFromDir(dir, "builtin")),
		...listAgentsFromDir(join(homedir(), ".agents"), "user"),
		...listAgentsFromDir(join(cwd, ".agents"), "project"),
		...listAgentsFromDir(join(cwd, ".pi", "agents"), "project"),
	];
	const byName = new Map<string, AgentEntry>();
	for (const agent of agents) byName.set(agent.name, agent);
	return sortDiscovered(Array.from(byName.values()));
}

export async function listDiscoverableAgentsAsync(
	cwd: string,
): Promise<AgentEntry[]> {
	const agents: AgentEntry[] = [];
	for (const dir of builtinAgentDirs(cwd)) {
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
	return sortDiscovered(Array.from(byName.values()));
}

function projectSettingsPath(cwd: string): string {
	return join(cwd, ".pi", "settings.json");
}

function globalSettingsPath(): string {
	return join(AGENT_DIR, "settings.json");
}

export function updateGlobalDefaultModel(provider: string, model: string): void {
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

export function readOrchestratorModel(): string | undefined {
	const path = globalSettingsPath();
	if (!existsSync(path)) return undefined;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(parsed)) return undefined;
		const prov =
			typeof parsed.defaultProvider === "string" ? parsed.defaultProvider : "";
		const model =
			typeof parsed.defaultModel === "string" ? parsed.defaultModel : undefined;
		if (!model) return undefined;
		return prov ? `${prov}/${model}` : model;
	} catch {
		return undefined;
	}
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
	"sdd-design": { model: "minimax/MiniMax-M3" },
	"sdd-init": { model: "minimax/MiniMax-M2.7" },
	"sdd-explore": { model: "minimax/MiniMax-M2.7" },
	"sdd-apply": { model: "minimax/MiniMax-M2.7" },
	"sdd-verify": { model: "minimax/MiniMax-M2.7" },
	"ein-linear": { model: "minimax/MiniMax-M2.7" },
	"ein-github": { model: "minimax/MiniMax-M2.7" },
};
const MODEL_LITE_ORCH = { provider: "minimax", model: "MiniMax-M3" } as const;

export function applyPreset(cwd: string, preset: "full" | "lite"): string {
	const config = preset === "full" ? MODEL_FULL : MODEL_LITE;
	const orch = preset === "full" ? MODEL_FULL_ORCH : MODEL_LITE_ORCH;
	writeModelConfig(cwd, config);
	updateGlobalDefaultModel(orch.provider, orch.model);
	return preset === "full"
		? `Modo full activo.\n- Orquestador → gpt-5.5\n- sdd-design → gpt-5.5\n- Resto → MiniMax-M2.7\nReinicia Pi para que el cambio de orquestador tome efecto.`
		: `Modo lite activo.\n- Orquestador → MiniMax-M3\n- sdd-design → MiniMax-M3\n- Resto → MiniMax-M2.7\nReinicia Pi para que el cambio de orquestador tome efecto.`;
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

export function describeModelConfig(
	cwd: string,
	config: AgentModelConfig,
): string[] {
	return listDiscoverableAgents(cwd).map((agent) => {
		const entry = config[agent.name];
		const model = entry?.model ?? "inherit";
		const thinking = entry?.thinking ?? "inherit";
		return `${agent.name}: model=${model}, effort=${thinking}`;
	});
}
