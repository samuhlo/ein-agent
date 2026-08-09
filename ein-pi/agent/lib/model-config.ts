// =============================================================================
// MODEL CONFIG
// Enrutado de modelos por agente: lee/escribe ~/.pi/ein/models.json, aplica
// la config al frontmatter de agentes descubiertos (o a agentOverrides para
// builtins) y gestiona el modelo del orquestador en settings.json global.
//
// SIN presets de modelos a propósito: hardcodear nombres (gpt-X, MiniMax-Y) se
// pudre en semanas —salen modelos y cambian precios— y da falsa confianza. Lo
// que NO caduca vive aquí: el thinking por agente (un NIVEL, no un nombre) y las
// recomendaciones por ROL (barato/capaz). El modelo concreto lo eliges tú.
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
	"sdd-scope",
	"sdd-map",
	"sdd-design",
	"sdd-tasks",
	"sdd-apply",
	"sdd-verify",
	"sdd-close",
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

export type ModelConfigEvidenceStatus = "missing" | "valid" | "invalid" | "unreadable";
export type ModelConfigEvidenceSource = "global" | "legacy-project";
export type ModelConfigInspection = Readonly<{
	status: ModelConfigEvidenceStatus;
	source: ModelConfigEvidenceSource;
	config?: AgentModelConfig;
	reason: "missing" | "read-success" | "invalid-evidence" | "unreadable";
	provenance: Readonly<{ source: ModelConfigEvidenceSource; reason: ModelConfigInspection["reason"] }>;
	observed: readonly Readonly<{ source: ModelConfigEvidenceSource; status: ModelConfigEvidenceStatus; reason: ModelConfigInspection["reason"] }>[];
}>;

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

function agentHome(): string {
	return process.env.EIN_PI_AGENT_HOME ?? AGENT_DIR;
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

// Alias de migración de nombres de agente en configs guardadas. ein-github pasó
// a ein-git (también hace git local). Se remapea al leer models.json para no
// orfanar la config previa del usuario.
const AGENT_KEY_ALIASES: Record<string, string> = {
	"ein-github": "ein-git",
	[`sdd-${"init"}`]: "sdd-scope",
	[`sdd-${"explore"}`]: "sdd-map",
	[`sdd-${"archive"}`]: "sdd-close",
};

function aliasAgentKey(name: string): string {
	return AGENT_KEY_ALIASES[name] ?? name;
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
			const key = aliasAgentKey(name);
			if (entry && config[key] === undefined) config[key] = entry;
		}
		return { status: "valid", config };
	} catch {
		return { status: "invalid", path };
	}
}

function inspectModelConfigFile(
	path: string,
	source: ModelConfigEvidenceSource,
): ModelConfigInspection {
	if (!existsSync(path)) return { status: "missing", source, reason: "missing", provenance: { source, reason: "missing" }, observed: [{ source, status: "missing", reason: "missing" }] };
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(parsed)) return { status: "invalid", source, reason: "invalid-evidence", provenance: { source, reason: "invalid-evidence" }, observed: [{ source, status: "invalid", reason: "invalid-evidence" }] };
		const config: AgentModelConfig = {};
		for (const [name, value] of Object.entries(parsed)) {
			const entry = normalizeRoutingEntry(value);
			if (!entry) return { status: "invalid", source, reason: "invalid-evidence", provenance: { source, reason: "invalid-evidence" }, observed: [{ source, status: "invalid", reason: "invalid-evidence" }] };
			const key = aliasAgentKey(name);
			if (config[key] === undefined) config[key] = entry;
		}
		return { status: "valid", source, config, reason: "read-success", provenance: { source, reason: "read-success" }, observed: [{ source, status: "valid", reason: "read-success" }] };
	} catch {
		return { status: "unreadable", source, reason: "unreadable", provenance: { source, reason: "unreadable" }, observed: [{ source, status: "unreadable", reason: "unreadable" }] };
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
			const key = aliasAgentKey(name);
			if (entry && config[key] === undefined) config[key] = entry;
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

/** Lector aditivo de modelos; los lectores legacy conservan su semántica compatible. */
export function inspectModelConfig(cwd: string): ModelConfigInspection {
	const global = inspectModelConfigFile(modelConfigPath(cwd), "global");
	if (global.status !== "missing") return global;
	const legacy = inspectModelConfigFile(legacyProjectModelConfigPath(cwd), "legacy-project");
	if (legacy.status !== "missing") return { ...legacy, observed: [...global.observed, ...legacy.observed] };
	return { ...global, observed: [...global.observed, ...legacy.observed] };
}

export const readModelConfigDetailed = inspectModelConfig;
export const readModelConfigEvidence = inspectModelConfig;

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

// Thinking por defecto por fase. Sin fijarlo, cada agente hereda el thinking
// alto del modelo y da vueltas quemando tokens (apply llegó a 47 turnos; map a
// 222k). Solo RAZONAN de verdad orchestrator y sdd-design (compuertas de
// decisión) → se dejan sin fijar (heredan el default del modelo capaz). Las
// fases que LEEN/EJECUTAN corren más bajo. El usuario/preset puede overridear.
const DEFAULT_THINKING: Record<string, ThinkingLevel> = {
	"sdd-apply": "low", // ejecuta el plan masticado (E0)
	"sdd-map": "medium", // lee y resume impacto vía codegraph, no diseña (G)
	"sdd-verify": "medium", // corre tests + razona cobertura (G)
};

// Recomendación por agente para el panel /ein:models: nivel de modelo (barato/
// capaz) + thinking + por qué. Ayuda a elegir sin memorizar la arquitectura.
export type AgentTier = "cheap" | "capable";
export type AgentRecommendation = { tier: AgentTier; thinking: ThinkingLevel; reason: string };
export const AGENT_RECOMMENDATIONS: Record<string, AgentRecommendation> = {
	orchestrator: { tier: "capable", thinking: "high", reason: "decide el mapa; el cerebro del flujo" },
	"sdd-design": { tier: "capable", thinking: "high", reason: "última compuerta de razonamiento antes de ejecutar" },
	"sdd-scope": { tier: "cheap", thinking: "low", reason: "extracción estructurada del alcance" },
	"sdd-map": { tier: "cheap", thinking: "medium", reason: "lee y resume impacto (codegraph), no diseña" },
	"sdd-tasks": { tier: "cheap", thinking: "low", reason: "descompone el diseño en checklist" },
	// El coste lo controla el THINKING (low), no abaratar el modelo: un modelo
	// barato no "ahorra", da 135 turnos de prueba y error en un TDD estricto.
	"sdd-apply": { tier: "capable", thinking: "low", reason: "ejecuta a thinking bajo; el modelo capaz evita el thrashing (barato = 135 turnos)" },
	"sdd-verify": { tier: "cheap", thinking: "medium", reason: "corre tests + razona cobertura" },
	"sdd-close": { tier: "cheap", thinking: "low", reason: "condensa el resumen" },
	"ein-git": { tier: "cheap", thinking: "low", reason: "entrega mecánica (commit/push/PR)" },
	"ein-linear": { tier: "cheap", thinking: "low", reason: "operaciones de board acotadas" },
	"ein-scout": { tier: "cheap", thinking: "low", reason: "investigación read-only acotada y citada" },
};

// Aplica el thinking por defecto del agente cuando ni models.json ni el preset
// lo fijan. Un thinking explícito (usuario/preset) siempre gana.
export function withDefaultThinking(
	name: string,
	entry: AgentRoutingEntry | undefined,
): AgentRoutingEntry | undefined {
	const fallback = DEFAULT_THINKING[name];
	if (!fallback || entry?.thinking) return entry;
	return { ...(entry ?? {}), thinking: fallback };
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

// Solo los agentes del paquete pi-subagents son "builtin": para ellos el
// routing va por subagents.agentOverrides en settings.json, que es lo único
// que pi-subagents honra para builtins. Los agentes de ~/.pi/agent/agents
// los carga pi-subagents como agentes de usuario y SOLO leen el modelo de
// su frontmatter, así que deben clasificarse como "user" o el routing de
// /ein:models se pierde en silencio.
// Si los builtins de pi-subagents están deshabilitados (settings global o
// del proyecto), no se descubren: mostrarlos en /ein:models o escribirles
// overrides sería ruido sobre agentes que nunca van a ejecutarse.
function builtinsDisabled(cwd: string): boolean {
	for (const path of [globalSettingsPath(), projectSettingsPath(cwd)]) {
		if (!existsSync(path)) continue;
		try {
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
			if (
				isRecord(parsed) &&
				isRecord(parsed.subagents) &&
				parsed.subagents.disableBuiltins === true
			) {
				return true;
			}
		} catch {
			// settings ilegible: no decide nada
		}
	}
	return false;
}

function builtinAgentDirs(cwd: string): string[] {
	if (builtinsDisabled(cwd)) return [];
	return [
		join(PACKAGE_ROOT, "..", "pi-subagents", "agents"),
		join(agentHome(), "npm", "node_modules", "pi-subagents", "agents"),
		join(cwd, ".pi", "npm", "node_modules", "pi-subagents", "agents"),
		join(homedir(), ".local", "lib", "node_modules", "pi-subagents", "agents"),
	];
}

export function listDiscoverableAgents(cwd: string): AgentEntry[] {
	const agents = [
		...builtinAgentDirs(cwd).flatMap((dir) => listAgentsFromDir(dir, "builtin")),
		...listAgentsFromDir(join(agentHome(), "agents"), "user"),
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
		[join(agentHome(), "agents"), "user"],
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
	return join(agentHome(), "settings.json");
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
	// Si enabledModels existe, el picker (ctrl+p) solo ofrece esa lista; un
	// modelo de orquestador fuera de ella quedaría inseleccionable.
	const modelId = `${provider}/${model}`;
	if (
		Array.isArray(settings.enabledModels) &&
		!settings.enabledModels.includes(modelId)
	) {
		settings.enabledModels = [...settings.enabledModels, modelId];
	}
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
		const entry = withDefaultThinking(agent.name, config[agent.name]);
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
		const entry = withDefaultThinking(agent.name, config[agent.name]);
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
