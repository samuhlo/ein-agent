// =============================================================================
// intent-channel — nucleo puro compartido por Pi y Claude
// -----------------------------------------------------------------------------
// Nombres, rutas y constructores de mensaje del canal `/ein:intent` / `/ein:eh`.
// Nunca toca disco: los builders devuelven texto, nunca escriben; el escritor
// real vive en cada superficie, y solo actua tras confirmacion del usuario (R8).
// =============================================================================

import { homedir } from "node:os";
import { join } from "node:path";

import { isSafeChangeName, resolveChangesDir } from "./sdd-router.ts";

export const SKILL_NAME = "intent-channel";
export const INTENT_COMMAND = "ein:intent";
export const EH_COMMAND = "ein:eh";
export const CANONICAL_COMMANDS = [INTENT_COMMAND, EH_COMMAND] as const;
export const ARTIFACT_NAME = "intent.md";

// Replica deliberadamente AGENT_DIR/skills/local de ein-paths.ts (no se importa
// desde ahi: ese fichero tipa contra ExtensionAPI y este modulo debe quedar puro,
// sin depender de internals de Pi -- ver design.md C2).
function defaultAgentDir(): string {
	return process.env.EIN_PI_AGENT_HOME ?? join(homedir(), ".pi", "agent");
}

// Replica el mismo criterio que ein-cc/sync.ts (DEST, no exportado): skills se
// aplanan en `${CLAUDE_CONFIG_DIR}/skills/<nombre>/SKILL.md`.
function defaultClaudeConfigDir(): string {
	return process.env.EIN_CC_HOME ?? join(homedir(), ".claude-ein");
}

/** Ruta del skill desplegado en el runtime Pi (R3). */
export function resolvePiSkillPath(agentDir: string = defaultAgentDir()): string {
	return join(agentDir, "skills", "local", SKILL_NAME, "SKILL.md");
}

/** Ruta del skill desplegado en el runtime Claude, aplanado por sync.ts (R3). */
export function resolveClaudeSkillPath(claudeConfigDir: string = defaultClaudeConfigDir()): string {
	return join(claudeConfigDir, "skills", SKILL_NAME, "SKILL.md");
}

export type IntentPathResult = { ok: true; path: string } | { ok: false; reason: string };

// Nombre inseguro -> rechazo, nunca una ruta (R9). Reusa isSafeChangeName del
// router: dos validadores para la misma regla es exactamente la divergencia que
// ese guard existe para evitar (design.md C4).
export function resolveIntentPath(cwd: string, change: unknown): IntentPathResult {
	if (!isSafeChangeName(change)) return { ok: false, reason: `unsafe change name: ${String(change)}` };
	return { ok: true, path: join(resolveChangesDir(cwd), change, ARTIFACT_NAME) };
}

export type KickoffMessage = { text: string };

// Los builders solo devuelven el texto a inyectar; quien llama decide cuando (y
// si) enviarlo -- nunca escriben ni ejecutan nada (R8).
export function buildIntentKickoff(): KickoffMessage {
	return {
		text: `Ejecuta el protocolo de la skill \`${SKILL_NAME}\`, sección \`/ein:intent\`: modela la petición como árbol de decisiones y recorre la frontera por rondas.`,
	};
}

export function buildEhKickoff(): KickoffMessage {
	return {
		text: `Ejecuta el protocolo de la skill \`${SKILL_NAME}\`, sección \`/ein:eh\`: restata el último mensaje en lenguaje llano, sin actuar.`,
	};
}
