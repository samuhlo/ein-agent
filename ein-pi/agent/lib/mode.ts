// =============================================================================
// WORK MODE
// Modo de trabajo de Ein, persistente por proyecto en .pi/ein/mode.json, con un
// default global en ~/.pi/agent/ein-mode.json (lo escribe el installer). Decide
// si Linear forma parte del flujo:
//   - solo → SIN Linear. El board es local: openspec/changes/ + git + EIN.md.
//            Nunca se ejecuta Linear preflight.
//   - team → Linear es la board. Preflight Linear antes de SDD serio.
// Default: solo. Módulo puro (solo builtins de Node) para testear sin acoplar.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { pick } from "./lang.ts";

export type EinMode = "solo" | "team";

export const MODE_OPTIONS = ["solo", "team"] as const;

const DEFAULT_MODE: EinMode = "solo";

export type ModeEvidenceStatus = "missing" | "valid" | "invalid" | "unreadable";
export type ModeEvidenceSource = "project" | "global" | "default";
export type ModeInspection = Readonly<{
	status: ModeEvidenceStatus;
	source: ModeEvidenceSource;
	value?: EinMode;
	reason: "missing" | "read-success" | "invalid-evidence" | "unreadable" | "defaulted";
	provenance: Readonly<{ source: ModeEvidenceSource; reason: ModeInspection["reason"] }>;
	observed: readonly Readonly<{ source: Exclude<ModeEvidenceSource, "default">; status: ModeEvidenceStatus; reason: ModeInspection["reason"] }>[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMode(value: unknown): EinMode | undefined {
	return value === "solo" || value === "team" ? value : undefined;
}

export function modeConfigPath(cwd: string): string {
	return join(cwd, ".pi", "ein", "mode.json");
}

// Default global que escribe el installer según --linear/--no-linear.
export function globalModeConfigPath(): string {
	return join(homedir(), ".pi", "agent", "ein-mode.json");
}

function readModeFile(path: string): EinMode | undefined {
	if (!existsSync(path)) return undefined;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (isRecord(parsed)) return normalizeMode(parsed.mode);
	} catch {
		// fichero roto → ignorar
	}
	return undefined;
}

function inspectModeFile(path: string, source: Exclude<ModeEvidenceSource, "default">): ModeInspection {
	if (!existsSync(path)) {
		return { status: "missing", source, reason: "missing", provenance: { source, reason: "missing" }, observed: [{ source, status: "missing", reason: "missing" }] };
	}
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		const value = isRecord(parsed) ? normalizeMode(parsed.mode) : undefined;
		if (value) return { status: "valid", source, value, reason: "read-success", provenance: { source, reason: "read-success" }, observed: [{ source, status: "valid", reason: "read-success" }] };
		return { status: "invalid", source, reason: "invalid-evidence", provenance: { source, reason: "invalid-evidence" }, observed: [{ source, status: "invalid", reason: "invalid-evidence" }] };
	} catch {
		return { status: "unreadable", source, reason: "unreadable", provenance: { source, reason: "unreadable" }, observed: [{ source, status: "unreadable", reason: "unreadable" }] };
	}
}

/** Lector aditivo con estado; readMode conserva su contrato compatible y los datos perdidos. */
export function inspectMode(cwd: string): ModeInspection {
	const project = inspectModeFile(modeConfigPath(cwd), "project");
	if (project.status !== "missing") return project;
	const global = inspectModeFile(globalModeConfigPath(), "global");
	if (global.status !== "missing") return { ...global, observed: [...project.observed, ...global.observed] };
	return {
		status: "valid",
		source: "default",
		value: DEFAULT_MODE,
		reason: "defaulted",
		provenance: { source: "default", reason: "defaulted" },
		observed: [...project.observed, ...global.observed],
	};
}

export const readModeDetailed = inspectMode;
export const readModeEvidence = inspectMode;

// Resolución: override del proyecto → default global → "solo".
export function readMode(cwd: string): EinMode {
	return (
		readModeFile(modeConfigPath(cwd)) ??
		readModeFile(globalModeConfigPath()) ??
		DEFAULT_MODE
	);
}

export function writeMode(cwd: string, mode: EinMode): void {
	const path = modeConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ mode }, null, 2)}\n`);
}

// Directiva inyectada en el prompt de Ein (igual que persona/lang). Condicional
// al modo: en Solo, Ein nunca dice que Linear es la board ni corre preflight.
export function modeDirective(mode: EinMode): string {
	if (mode === "team") {
		return `Work mode: TEAM. Linear is the primary board. Before serious SDD work, run Linear preflight (search/reuse, then propose creation) via \`ein-linear\`, unless the user says "no linear". Issues define scope; GitHub PRs are delivery.`;
	}
	return `Work mode: SOLO (default). There is NO Linear board. The board is local: \`openspec/changes/\` (SDD artifacts) + git + EIN.md. Do NOT run Linear preflight, and do NOT tell the user Linear is the board. \`ein-linear\` exists and may be used ONLY if the user explicitly asks (e.g. "usa linear", "crea una issue") — never automatically.`;
}

export async function handleModeCommand(ctx: ExtensionContext): Promise<void> {
	const current = readMode(ctx.cwd);
	const selected = await ctx.ui.select(
		pick(
			`Modo de trabajo de Ein (actual: ${current})`,
			`Ein work mode (current: ${current})`,
		),
		[...MODE_OPTIONS],
	);
	const mode = normalizeMode(selected);
	if (!mode) return;
	writeMode(ctx.cwd, mode);
	ctx.ui.notify(
		[
			pick(`Modo actualizado: ${mode}`, `Mode updated: ${mode}`),
			`Config: ${modeConfigPath(ctx.cwd)}`,
			mode === "solo"
				? pick(
						"Solo: OpenSpec local + git, sin Linear.",
						"Solo: local OpenSpec + git, no Linear.",
					)
				: pick(
						"Team: Linear como board + preflight.",
						"Team: Linear board + preflight.",
					),
			pick(
				"Reinicia Pi o abre una sesion nueva para que tome efecto.",
				"Restart Pi or open a new session for the change to take effect.",
			),
		].join("\n"),
		"info",
	);
}
