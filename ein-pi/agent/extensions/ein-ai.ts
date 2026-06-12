// =============================================================================
// EIN AI
// Extensión principal de Ein: ensambla los módulos de lib/ (persona,
// guardrails, model-config, models-panel, sdd-preflight) y registra los
// hooks de sesión y los comandos /ein:*. La lógica vive en lib/; aquí solo
// se cablea.
// =============================================================================

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	ensureSddPreflight,
	getSddPreflightPreferences,
	installSddAssets,
	isSddPreflightTrigger,
	renderSddPreflightPrompt,
	sddGlobalAssetDriftCount,
	type SddPreflightPreferences,
} from "../lib/sdd-preflight.ts";
import {
	buildEinPrompt,
	handlePersonaCommand,
	readPersonaMode,
} from "../lib/persona.ts";
import {
	confirmCommand,
	confirmDelegatedDelivery,
} from "../lib/guardrails.ts";
import {
	SDD_AGENT_NAMES,
	SDD_AGENT_NAME_SET,
	applyPreset,
	applySavedModelConfig,
	modelConfigPath,
} from "../lib/model-config.ts";
import { handleModelsCommand } from "../lib/models-panel.ts";
import { humanizeAge, listRecentSessions } from "../lib/sessions";
import { resolveSkillInjection } from "./ein-skill-registry.ts";
import { AGENT_DIR } from "./ein-paths";

// ─── Detección de eventos de subagentes ──────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringPath(value: unknown, path: string[]): string | undefined {
	let current = value;
	for (const key of path) {
		if (!isRecord(current)) return undefined;
		current = current[key];
	}
	return typeof current === "string" ? current : undefined;
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

function isSddAgentStartEvent(event: unknown): boolean {
	const candidates = readAgentStartNames(event);
	if (candidates.some((value) => SDD_AGENT_NAME_SET.has(value))) return true;

	const systemPrompt = readStringPath(event, ["systemPrompt"]) ?? "";
	return SDD_AGENT_NAMES.some((name) => {
		const phase = name.replace(/^sdd-/, "");
		return new RegExp(`\\bSDD ${phase} executor\\b`, "i").test(systemPrompt);
	});
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

// ─── Extensión ────────────────────────────────────────────────────────────────

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
		// Delegaciones con push: el usuario confirma aquí (sesión con UI) y se
		// emite el grant one-shot que el guard headless del subagente consume.
		if (event.toolName === "subagent")
			return confirmDelegatedDelivery(event.input, ctx);
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
				`Assets SDD: ${result.agents} agente(s), ${result.chains} chain(s), ${result.support} soporte disponibles (${result.installed} instalados, ${result.skipped} ya presentes).`,
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
		description: "Preset lite: orquestador + sdd-design → MiniMax-M3, resto → MiniMax-M2.7",
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
			const agentsDir = join(AGENT_DIR, "agents");
			const chainsDir = join(AGENT_DIR, "chains");
			const skillsLocalDir = join(AGENT_DIR, "skills", "local");
			const skillsDownloadedDir = join(AGENT_DIR, "skills", "downloaded");
			const mcpFile = join(AGENT_DIR, "mcp.json");

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
			lines.push("- /ein:models:lite  → preset MiniMax-M3 (orch + design) / M2.7 (resto)");
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
