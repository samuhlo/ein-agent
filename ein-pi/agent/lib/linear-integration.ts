// =============================================================================
// LINEAR INTEGRATION
// Solo + OpenSpec/git es el contrato normal de Ein. Linear es una integración
// opcional que se enciende a propósito, nunca una fuente paralela de estado.
//
// Antes esto era un "modo de trabajo" de dos valores (solo/team) cuyo único
// efecto real era este interruptor. Un ajuste con dos valores donde uno es la
// respuesta en todas las sesiones reales cuesta una elección visible, una rama
// en el prompt, una puerta en el registro de skills y un comando.
//
// Persistencia: `.pi/ein/mode.json` por proyecto, con default global en
// `~/.pi/agent/ein-mode.json` (lo escribe el installer). El fichero conserva su
// nombre a propósito: es estado en la máquina del usuario, y renombrarlo va con
// la unidad de migración de estado, no con esta. Se lee la clave nueva
// (`linear`) y la heredada (`mode`), y leer nunca reescribe.
//
// Módulo puro (solo builtins de Node) para testear sin acoplar.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { pick } from "./lang.ts";

export type LinearIntegration = "off" | "on";

export const LINEAR_INTEGRATION_OPTIONS = ["off", "on"] as const;

const DEFAULT_INTEGRATION: LinearIntegration = "off";

export type LinearEvidenceStatus = "missing" | "valid" | "invalid" | "unreadable";
export type LinearEvidenceSource = "project" | "global" | "default";
export type LinearIntegrationInspection = Readonly<{
	status: LinearEvidenceStatus;
	source: LinearEvidenceSource;
	value?: LinearIntegration;
	reason: "missing" | "read-success" | "invalid-evidence" | "unreadable" | "defaulted";
	provenance: Readonly<{ source: LinearEvidenceSource; reason: LinearIntegrationInspection["reason"] }>;
	observed: readonly Readonly<{ source: Exclude<LinearEvidenceSource, "default">; status: LinearEvidenceStatus; reason: LinearIntegrationInspection["reason"] }>[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeIntegration(value: unknown): LinearIntegration | undefined {
	return value === "off" || value === "on" ? value : undefined;
}

// La clave heredada `mode` traducida: team significaba "Linear es la board".
function normalizeLegacyMode(value: unknown): LinearIntegration | undefined {
	if (value === "team") return "on";
	if (value === "solo") return "off";
	return undefined;
}

// `linear` gana sobre `mode`: es el vocabulario actual, y si perdiera, una
// escritura deliberada quedaría sin efecto sin que nada lo dijera.
function valueFrom(parsed: unknown): LinearIntegration | undefined {
	if (!isRecord(parsed)) return undefined;
	if (Object.hasOwn(parsed, "linear")) return normalizeIntegration(parsed.linear);
	return normalizeLegacyMode(parsed.mode);
}

export function linearIntegrationConfigPath(cwd: string): string {
	return join(cwd, ".pi", "ein", "mode.json");
}

// Autoridad global del agente activo. El installer pasa su agentDir efectivo;
// el runtime respeta primero el hogar aislado de Ein y después el de Pi.
export function globalLinearIntegrationConfigPath(agentDir?: string): string {
	const activeAgentDir = agentDir
		?? process.env.EIN_PI_AGENT_HOME
		?? process.env.PI_CODING_AGENT_DIR
		?? join(homedir(), ".pi", "agent");
	return join(activeAgentDir, "ein-mode.json");
}

function readIntegrationFile(path: string): LinearIntegration | undefined {
	if (!existsSync(path)) return undefined;
	try {
		return valueFrom(JSON.parse(readFileSync(path, "utf8")) as unknown);
	} catch {
		// fichero roto → ignorar
	}
	return undefined;
}

function inspectIntegrationFile(path: string, source: Exclude<LinearEvidenceSource, "default">): LinearIntegrationInspection {
	if (!existsSync(path)) {
		return { status: "missing", source, reason: "missing", provenance: { source, reason: "missing" }, observed: [{ source, status: "missing", reason: "missing" }] };
	}
	let contents: string;
	try {
		contents = readFileSync(path, "utf8");
	} catch {
		return { status: "unreadable", source, reason: "unreadable", provenance: { source, reason: "unreadable" }, observed: [{ source, status: "unreadable", reason: "unreadable" }] };
	}
	try {
		const value = valueFrom(JSON.parse(contents) as unknown);
		if (value) return { status: "valid", source, value, reason: "read-success", provenance: { source, reason: "read-success" }, observed: [{ source, status: "valid", reason: "read-success" }] };
	} catch {
		// Sintaxis JSON rota es evidencia legible pero inválida.
	}
	return { status: "invalid", source, reason: "invalid-evidence", provenance: { source, reason: "invalid-evidence" }, observed: [{ source, status: "invalid", reason: "invalid-evidence" }] };
}

/** Lector aditivo con estado; el resolutor conserva su contrato y los datos perdidos. */
export function inspectLinearIntegration(cwd: string, agentDir?: string): LinearIntegrationInspection {
	const project = inspectIntegrationFile(linearIntegrationConfigPath(cwd), "project");
	if (project.status !== "missing") return project;
	const global = inspectIntegrationFile(globalLinearIntegrationConfigPath(agentDir), "global");
	if (global.status !== "missing") return { ...global, observed: [...project.observed, ...global.observed] };
	return {
		status: "valid",
		source: "default",
		value: DEFAULT_INTEGRATION,
		reason: "defaulted",
		provenance: { source: "default", reason: "defaulted" },
		observed: [...project.observed, ...global.observed],
	};
}

// Resolución: override del proyecto → default global → apagado.
export function readLinearIntegration(cwd: string, agentDir?: string): LinearIntegration {
	return (
		readIntegrationFile(linearIntegrationConfigPath(cwd)) ??
		readIntegrationFile(globalLinearIntegrationConfigPath(agentDir)) ??
		DEFAULT_INTEGRATION
	);
}

export function writeLinearIntegration(cwd: string, linear: LinearIntegration): void {
	const path = linearIntegrationConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ linear }, null, 2)}\n`);
}

// Directiva inyectada en el prompt de Ein (igual que persona/lang). Es portante:
// es lo que impide que Ein afirme que Linear es la board cuando no lo es.
export function linearDirective(linear: LinearIntegration): string {
	if (linear === "on") {
		return `Linear integration: ON. Linear is the primary board. Before serious SDD work, run Linear preflight (search/reuse, then propose creation) via \`ein-linear\`, unless the user says "no linear". Issues define scope; GitHub PRs are delivery.`;
	}
	return `Linear integration: OFF (default). There is NO Linear board. The board is local: \`openspec/changes/\` (SDD artifacts) + git + EIN.md. Do NOT run Linear preflight, and do NOT tell the user Linear is the board. \`ein-linear\` exists and may be used ONLY if the user explicitly asks (e.g. "usa linear", "crea una issue") — never automatically.`;
}

export async function handleLinearIntegrationCommand(ctx: ExtensionContext): Promise<void> {
	const current = readLinearIntegration(ctx.cwd);
	const selected = await ctx.ui.select(
		pick(
			`Integración con Linear (actual: ${current})`,
			`Linear integration (current: ${current})`,
		),
		[...LINEAR_INTEGRATION_OPTIONS],
	);
	const linear = normalizeIntegration(selected);
	if (!linear) return;
	writeLinearIntegration(ctx.cwd, linear);
	ctx.ui.notify(
		[
			pick(`Integración actualizada: ${linear}`, `Integration updated: ${linear}`),
			`Config: ${linearIntegrationConfigPath(ctx.cwd)}`,
			linear === "off"
				? pick(
						"Apagada: OpenSpec local + git, sin Linear.",
						"Off: local OpenSpec + git, no Linear.",
					)
				: pick(
						"Encendida: Linear como board + preflight.",
						"On: Linear board + preflight.",
					),
			pick(
				"Reinicia Pi o abre una sesion nueva para que tome efecto.",
				"Restart Pi or open a new session for the change to take effect.",
			),
		].join("\n"),
		"info",
	);
}
