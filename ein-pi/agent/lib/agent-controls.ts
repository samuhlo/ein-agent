import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type EinInternalAgent = "cleaner" | "architect";
export type AgentControlSource = "project config" | "session override";
export type AgentControlStatus = Readonly<{
	agent: EinInternalAgent;
	enabled: boolean;
	source: AgentControlSource;
}>;

export type AgentControlResult =
	| Readonly<{ kind: "status"; status: AgentControlStatus }>
	| Readonly<{ kind: "request"; prompt: string }>
	| Readonly<{ kind: "usage"; message: string }>;

type AgentStates = Record<EinInternalAgent, boolean>;

export type AgentActivationProfile = "balanced" | "thorough" | "manual";
export type AgentActivationProfileState = AgentActivationProfile | "custom" | "invalid";

const PROFILE_STATES: Record<AgentActivationProfile, AgentStates> = {
	balanced: { cleaner: true, architect: false },
	thorough: { cleaner: true, architect: true },
	manual: { cleaner: false, architect: false },
};

const DEFAULT_STATES: AgentStates = { cleaner: false, architect: false };
const sessionOverrides = new Map<string, Partial<AgentStates>>();
const projectStatesBySession = new Map<string, AgentStates>();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
	const keys = Object.keys(value).sort();
	return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

export function agentControlsConfigPath(cwd: string): string {
	return join(cwd, ".pi", "ein", "agents.json");
}

function parseProjectStates(value: unknown): AgentStates | undefined {
	if (!isRecord(value) || !exactKeys(value, ["agents"]) || !isRecord(value.agents)
		|| !exactKeys(value.agents, ["cleaner", "architect"])) return undefined;
	const states = {} as AgentStates;
	for (const agent of ["cleaner", "architect"] as const) {
		const entry = value.agents[agent];
		if (!isRecord(entry) || !exactKeys(entry, ["enabled"]) || typeof entry.enabled !== "boolean") return undefined;
		states[agent] = entry.enabled;
	}
	return states;
}

function readProjectStates(cwd: string): AgentStates {
	const path = agentControlsConfigPath(cwd);
	if (!existsSync(path)) return { ...DEFAULT_STATES };
	try {
		return parseProjectStates(JSON.parse(readFileSync(path, "utf8"))) ?? { ...DEFAULT_STATES };
	} catch {
		return { ...DEFAULT_STATES };
	}
}

export function readAgentActivationProfile(cwd: string): AgentActivationProfileState {
	const path = agentControlsConfigPath(cwd);
	if (!existsSync(path)) return "invalid";
	let states: AgentStates | undefined;
	try { states = parseProjectStates(JSON.parse(readFileSync(path, "utf8"))); } catch { return "invalid"; }
	if (!states) return "invalid";
	for (const profile of ["balanced", "thorough", "manual"] as const) {
		if (states.cleaner === PROFILE_STATES[profile].cleaner && states.architect === PROFILE_STATES[profile].architect) return profile;
	}
	return "custom";
}

export function writeAgentActivationProfile(cwd: string, profile: AgentActivationProfile): void {
	const path = agentControlsConfigPath(cwd);
	const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
	const states = PROFILE_STATES[profile];
	mkdirSync(dirname(path), { recursive: true });
	try {
		writeFileSync(temporary, `${JSON.stringify({ agents: {
			cleaner: { enabled: states.cleaner },
			architect: { enabled: states.architect },
		} }, null, 2)}\n`, "utf8");
		renameSync(temporary, path);
		if (readAgentActivationProfile(cwd) !== profile) throw new Error("Agent activation profile readback failed");
	} finally {
		rmSync(temporary, { force: true });
	}
}

export function readProjectAgentControlStatus(
	cwd: string,
	agent: EinInternalAgent,
): AgentControlStatus {
	return {
		agent,
		enabled: readProjectStates(cwd)[agent],
		source: "project config",
	};
}

export function agentAutomaticParticipationLabel(enabled: boolean): string {
	return `auto:${enabled ? "on" : "off"}`;
}

export function readAgentControlStatus(
	cwd: string,
	sessionKey: string,
	agent: EinInternalAgent,
): AgentControlStatus {
	const override = sessionOverrides.get(sessionKey)?.[agent];
	let projectStates = projectStatesBySession.get(sessionKey);
	if (!projectStates) {
		projectStates = {
			cleaner: readProjectAgentControlStatus(cwd, "cleaner").enabled,
			architect: readProjectAgentControlStatus(cwd, "architect").enabled,
		};
		projectStatesBySession.set(sessionKey, projectStates);
	}
	return {
		agent,
		enabled: override ?? projectStates[agent],
		source: override === undefined ? "project config" : "session override",
	};
}

export function clearAgentControlSession(sessionKey: string): void {
	sessionOverrides.delete(sessionKey);
	projectStatesBySession.delete(sessionKey);
}

function setSessionOverride(sessionKey: string, agent: EinInternalAgent, enabled: boolean): void {
	sessionOverrides.set(sessionKey, { ...sessionOverrides.get(sessionKey), [agent]: enabled });
}

export function routeAgentControl(
	cwd: string,
	sessionKey: string,
	agent: EinInternalAgent,
	args: string,
): AgentControlResult {
	const request = args.trim();
	if (!request) return { kind: "usage", message: `Usage: /ein:${agent} <request>|on|off|status` };
	const control = request.toLowerCase();
	if (control === "on" || control === "off") {
		setSessionOverride(sessionKey, agent, control === "on");
		return { kind: "status", status: readAgentControlStatus(cwd, sessionKey, agent) };
	}
	if (control === "status") {
		return { kind: "status", status: readAgentControlStatus(cwd, sessionKey, agent) };
	}
	const status = readAgentControlStatus(cwd, sessionKey, agent);
	return {
		kind: "request",
		prompt: [
			`Explicitly route this request through subagent({ agent: "ein-${agent}", task: ${JSON.stringify(request)} }).`,
			`Automatic SDD participation is ${status.enabled ? "on" : "off"} (${status.source}); that state does not block this explicit request.`,
			"Keep all normal scope, write, and safety requirements. Report unsupported workflow capabilities honestly.",
		].join("\n"),
	};
}

// Directiva inyectable del perfil de participación automática. Existe para que
// un runtime pueda DECLARAR qué hace con el perfil del proyecto en vez de
// aplicarlo en silencio: Cleaner y Architect solo existen en Pi, y un cambio que
// pasa por Claude sin ellos cambia de estándar sin avisar a nadie.
export function participationDirective(profile: AgentActivationProfileState): string {
	const head = "Automatic SDD participation (project profile, after apply)";
	switch (profile) {
		case "balanced":
			return `${head}: Cleaner runs, Architect does not.`;
		case "thorough":
			return `${head}: Cleaner runs, then Architect.`;
		case "manual":
			return `${head}: neither runs automatically. Both remain available on an explicit request.`;
		case "custom":
			return `${head}: a combination outside the supported profiles. Report it as \`custom\`; do not normalize it silently.`;
		default:
			// Fichero ausente o ilegible. No se inventa un perfil: la onboarding lo
			// pide, y hasta entonces el estado honesto es "sin configurar".
			return `${head}: not configured. Do not assume a default; ask before enabling either.`;
	}
}

export function internalAgentRoutingDirective(): string {
	return `## EIN internal agent routing

Named internal Pi subagents are discoverable as \`ein-cleaner\` and \`ein-architect\`. Route explicit natural-language requests such as "ask Cleaner..." or "have Architect..." through the \`subagent\` tool even when automatic participation is off. The activation state controls future automatic SDD participation only; it never blocks an explicit request. Cleaner supports bounded audit/improve and Architect supports bounded read-only audit/plan/validate; SDD participation remains unavailable.`;
}
