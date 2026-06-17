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
	askRunTddMode,
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
	LANG_LABEL,
	artifactLanguageDirective,
	handleLangCommand,
	readArtifactLang,
	readChatLang,
} from "../lib/lang.ts";
import { t, tf } from "../lib/i18n/strings.ts";
import { handleTddCommand } from "../lib/tdd.ts";
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
import { codeConventionSkillBlock, resolveSkillInjection } from "./ein-skill-registry.ts";
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
					tf(
						"ai.models.invalid",
						`Ein omitio la config de modelos: ${modelResult.invalidPath} no es JSON valido. Corrigelo o eliminalo y vuelve a ejecutar /ein:models.`,
						modelResult.invalidPath,
					),
					"warning",
				);
				return;
			}
			if (ctx.hasUI && modelResult.updated > 0) {
				ctx.ui.notify(
					tf(
						"ai.models.applied",
						`Config de modelos aplicada a ${modelResult.updated} agente(s). Assets SDD listos: ${installResult.agents} agente(s), ${installResult.chains} chain(s), ${installResult.support} soporte.`,
						modelResult.updated,
						installResult.agents,
						installResult.chains,
						installResult.support,
					),
					"info",
				);
			}
		} catch (error) {
			if (ctx.hasUI) {
				const message =
					error instanceof Error ? error.message : String(error);
				ctx.ui.notify(
					tf("ai.models.error", `Error al aplicar config de modelos: ${message}`, message),
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
		// TDD por tarea: si el modo global es "ask", preguntar aquí (un disparo
		// explícito de SDD = una tarea). Determinista, a diferencia de pedírselo
		// al padre antes de apply (que en un chain nunca dispara).
		await askRunTddMode(ctx);
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
			: `\n\n${buildEinPrompt(readPersonaMode(ctx.cwd), readChatLang())}`;
		// Deterministic skill injection: phase/named subagents receive exact
		// SKILL.md paths resolved from their task, not the parent model's discretion.
		let skillsPrompt = "";
		if (isNamedAgent || isSddAgent) {
			const block = resolveSkillInjection(ctx.cwd, readAgentTask(event));
			if (block) skillsPrompt = `\n\n${block}`;
		}
		const startNames = readAgentStartNames(event);
		// Idioma de artefactos: los agentes de delivery (PR/commits/Linear) reciben
		// la directiva autoritativa segun .pi/ein/lang.json (o el idioma de chat).
		let artifactPrompt = "";
		if (isNamedAgent && startNames.some((n) => n === "ein-github" || n === "ein-linear")) {
			artifactPrompt = `\n\n${artifactLanguageDirective(readArtifactLang(ctx.cwd))}`;
		}
		// Convenciones de codigo (comment/logging/file-naming): SOLO donde se
		// escribe codigo — el parent (trabajo inline) y sdd-apply. Inyectarlas en
		// delivery/linear/explore solo hacia que el modelo barato leyera 3 SKILL.md
		// inutiles (gasto de tokens) sin escribir codigo.
		const writesCode = (!isNamedAgent && !isSddAgent) || startNames.includes("sdd-apply");
		const conventions = writesCode ? codeConventionSkillBlock(ctx.cwd) : "";
		const conventionsPrompt = conventions ? `\n\n${conventions}` : "";
		return {
			systemPrompt: `${event.systemPrompt}${einPrompt}${sddPrompt}${skillsPrompt}${artifactPrompt}${conventionsPrompt}`,
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
		description: t(
			"cmd.install-sdd.description",
			"Reinstalar o refrescar los agentes y chains SDD globales de Ein",
		),
		handler: async (args, ctx) => {
			const force = args.includes("--force");
			const result = installSddAssets(ctx.cwd, force);
			ctx.ui.notify(
				tf(
					"ai.sdd.installed",
					`Assets SDD: ${result.agents} agente(s), ${result.chains} chain(s), ${result.support} soporte disponibles (${result.installed} instalados, ${result.skipped} ya presentes).`,
					result.agents,
					result.chains,
					result.support,
					result.installed,
					result.skipped,
				),
				"info",
			);
		},
	});

	pi.registerCommand("ein:ai:sdd-preflight", {
		description: t(
			"cmd.sdd-preflight.description",
			"Ejecutar o reutilizar el preflight SDD para esta sesion de Pi",
		),
		handler: async (_args, ctx) => {
			await runSddPreflight(ctx);
		},
	});

	pi.registerCommand("ein:models", {
		description: t(
			"cmd.models.description",
			"Ver o configurar los modelos activos por agente en Ein",
		),
		handler: async (_args, ctx) => {
			await handleModelsCommand(ctx);
		},
	});

	pi.registerCommand("ein:models:full", {
		description: t(
			"cmd.models.full.description",
			"Preset full: orquestador + sdd-design → gpt-5.5, resto → MiniMax-M2.7",
		),
		handler: (_args, ctx) => {
			const msg = applyPreset(ctx.cwd, "full");
			ctx.ui.notify(msg, "info");
		},
	});

	pi.registerCommand("ein:models:lite", {
		description: t(
			"cmd.models.lite.description",
			"Preset lite: orquestador + sdd-design → MiniMax-M3, resto → MiniMax-M2.7",
		),
		handler: (_args, ctx) => {
			const msg = applyPreset(ctx.cwd, "lite");
			ctx.ui.notify(msg, "info");
		},
	});

	pi.registerCommand("ein:persona", {
		description: t(
			"cmd.persona.description",
			"Cambiar la persona de Ein entre samuhlo y neutral",
		),
		handler: async (_args, ctx) => {
			await handlePersonaCommand(ctx);
		},
	});

	pi.registerCommand("ein:lang", {
		description: t(
			"cmd.lang.description",
			"Ver o cambiar el idioma de Ein (conversación/UI y artefactos PR/commit/Linear)",
		),
		handler: async (_args, ctx) => {
			await handleLangCommand(ctx);
		},
	});

	pi.registerCommand("ein:tdd", {
		description: t(
			"cmd.tdd.description",
			"Ver o cambiar el modo de TDD estricto (auto/strict/off/ask)",
		),
		handler: async (_args, ctx) => {
			await handleTddCommand(ctx);
		},
	});

	pi.registerCommand("ein:resume", {
		description: t(
			"cmd.resume.description",
			"Listar sesiones recientes con el comando para recuperarlas",
		),
		handler: async (_args, ctx) => {
			const sessions = listRecentSessions(8);
			const lines: string[] = [t("resume.title", "/// 000. SESIONES RECIENTES"), ""];
			if (!sessions.length) {
				lines.push(t("resume.none", "- No hay sesiones guardadas todavia."));
			} else {
				lines.push(
					t(
						"resume.shortcuts",
						"- Atajos: `pi -c` (continuar ultima) · `pi -r` (elegir sesion)",
					),
				);
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
		description: t(
			"cmd.status.description",
			"Ver estado del sistema Ein (agentes, chains, skills, proyecto)",
		),
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
			const chatLang = readChatLang();
			const artifactLang = readArtifactLang(ctx.cwd);
			lines.push("/// 000. EIN STATUS");
			lines.push(`${t("status.author", "autor")}: samuhlo`);
			lines.push(`${t("status.persona", "persona")}: ${readPersonaMode(ctx.cwd)}`);
			lines.push(
				`${t("status.lang", "idioma")}: ${t("status.lang.chat", "conversación")}=${LANG_LABEL[chatLang]} · ${t("status.lang.artifacts", "artefactos")}=${LANG_LABEL[artifactLang]}`,
			);
			lines.push(
				`${t("status.state", "estado")}: ${staleDrift > 0 ? t("status.state.drift", "drift detectado") : t("status.state.ok", "operativo")}`,
			);
			lines.push("");

			lines.push(`■ 001. ${t("status.sdd", "SDD")}`);
			lines.push(`${t("status.agents", "agentes")}: ${agents.length}`);
			for (const a of agents) lines.push(`- ${a}`);
			lines.push(`${t("status.chains", "chains")}: ${chains.length}`);
			for (const c of chains) lines.push(`- ${c}`);
			if (staleDrift > 0)
				lines.push(
					`drift: ${staleDrift} ${t("status.drift.files", "archivo(s) desincronizado(s)")} — /ein:ai:install-sdd --force ${t("status.drift.refresh", "para refrescar")}`,
				);
			lines.push("");

			lines.push(`■ 002. ${t("status.skills", "SKILLS")}`);
			lines.push(`${t("status.skills.local", "locales")}: ${localSkills}`);
			lines.push(`${t("status.skills.downloaded", "descargadas")}: ${downloadedSkills}`);
			lines.push("");

			lines.push(`■ 003. ${t("status.project", "PROYECTO")}`);
			lines.push(`openspec: ${openspecConfigured ? t("status.openspec.configured", "configurado") : t("status.openspec.unconfigured", "no configurado — /sdd-init para arrancar")}`);
			lines.push(`${t("status.model", "modelo")}: ${existsSync(modelConfigPath(ctx.cwd)) ? t("status.model.present", "config presente") : t("status.model.absent", "sin config local")}`);
			lines.push("");

			lines.push("■ 004. MCP");
			if (mcpServers.length > 0) {
				lines.push(`${t("status.mcp.servers", "servidores")}: ${mcpServers.join(", ")}`);
			} else {
				lines.push(`${t("status.mcp.servers", "servidores")}: ${t("status.mcp.none", "ninguno configurado")}`);
			}
			lines.push("");

			lines.push(`■ 005. ${t("status.diag", "DIAGNOSTICO")}`);
			lines.push(`- ${"/ein:doctor-output"} ${t("status.diag.output", "para smoke checks tecnicos")}`);
			lines.push(`- ${"/ein:doctor"} ${t("status.diag.doctor", "para diagnostico explicativo")}`);

			const level = staleDrift > 0 ? "warning" : "info";
			ctx.ui.notify(lines.join("\n"), level);
		},
	});

	pi.registerCommand("ein:help", {
		description: t(
			"cmd.help.description",
			"Ayuda del sistema Ein — usa 'full' para detalle completo",
		),
		handler: async (args, ctx) => {
			const mode = (Array.isArray(args) ? args.join(" ") : String(args ?? ""))
				.trim()
				.toLowerCase();
			const text =
				mode === "full"
					? t("help.full", "Ein listo. Autor: samuhlo. (i18n no disponible)")
					: t("help.short", "/// AYUDA EIN — autor: samuhlo");
			ctx.ui.notify(text, "info");
		},
	});
}
