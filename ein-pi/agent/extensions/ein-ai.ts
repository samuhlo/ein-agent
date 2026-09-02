// =============================================================================
// EIN AI
// Extensión principal de Ein: ensambla los módulos de lib/ (persona,
// guardrails, model-config, models-panel, sdd-preflight) y registra los
// hooks de sesión y los comandos /ein:*. La lógica vive en lib/; aquí solo
// se cablea.
// =============================================================================

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	installSddAssets,
	sddGlobalAssetDriftCount,
	sddPreflightSessionKey,
} from "../lib/sdd-preflight.ts";
import { readGitDeliveryMode } from "../lib/git-delivery.ts";
import { readPersonaMode } from "../lib/persona.ts";
import {
	LANG_LABEL,
	readArtifactLang,
	readChatLang,
} from "../lib/lang.ts";
import { t, tf } from "../lib/i18n/strings.ts";
import { readLinearIntegration } from "../lib/linear-integration.ts";
import { modelConfigPath } from "../lib/model-config.ts";
import { registerAdvisoryTools } from "./internal/ein-advisory-tools.ts";
import { registerGeneralCommands } from "./internal/ein-general-commands.ts";
import { registerAgentPromptHook } from "./internal/ein-agent-prompt-hook.ts";
import { registerDelegationResultHook } from "./internal/ein-delegation-results.ts";
import { createPiIntentGate } from "./internal/ein-pi-intent-gate.ts";
import { registerToolCallGate } from "./internal/ein-tool-call-gate.ts";
import { registerOpenSpecWriteTools } from "./internal/ein-openspec-write-tools.ts";
import { registerSessionLifecycle } from "./internal/ein-session-lifecycle.ts";
import { registerSddLifecycleTools } from "./internal/ein-sdd-lifecycle-tools.ts";
import { registerSddChangeSettings } from "./internal/ein-sdd-change-settings.ts";
import { registerSddReadSurface } from "./internal/ein-sdd-read-surface.ts";
import { createEinToolRegistrar } from "./internal/ein-tool-registration.ts";
import { aggregateSddBudget, formatBudget, listActiveChangeSummaries } from "../lib/sdd-router.ts";
import {
	einMdCommitsBehind,
	readEinMd,
} from "../lib/project-context.ts";
import { AGENT_DIR } from "./ein-paths";
import type { ScoutTracking } from "../lib/scout-contract.ts";
import {
	readAgentControlStatus,
	routeAgentControl,
	type EinInternalAgent,
} from "../lib/agent-controls.ts";

// ─── Detección de eventos de subagentes ──────────────────────────────────────

const scoutTracking: ScoutTracking = new Map();

// ─── Extensión ────────────────────────────────────────────────────────────────

export default function einAi(pi: ExtensionAPI): void {
	const intentGate = createPiIntentGate();
	const delegationResults = registerDelegationResultHook(pi, scoutTracking);
	const toolCallGate = registerToolCallGate(pi, {
		intentGate,
		scoutTracking,
		rememberPhaseSnapshot: delegationResults.rememberPhaseSnapshot,
	});
	const sessionLifecycle = registerSessionLifecycle(pi, {
		intentGate,
		scoutTracking,
		recordDeliveryIntent: toolCallGate.recordDeliveryIntent,
	});
	registerAgentPromptHook(pi, intentGate);

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
			await sessionLifecycle.runSddPreflight(ctx);
		},
	});

	const registerAgentControl = (agent: EinInternalAgent): void => {
		pi.registerCommand(`ein:${agent}`, {
			description: `Route an explicit ${agent} request or set this session's automatic participation (on/off/status)`,
			handler: async (args, ctx) => {
				const result = routeAgentControl(ctx.cwd, sddPreflightSessionKey(ctx), agent, String(args ?? ""));
				if (result.kind === "request") {
					pi.sendUserMessage(result.prompt);
					return;
				}
				if (result.kind === "usage") {
					ctx.ui.notify(result.message, "warning");
					return;
				}
				ctx.ui.notify(
					`${agent}: ${result.status.enabled ? "on" : "off"} (${result.status.source}); automatic SDD participation only`,
					"info",
				);
			},
		});
	};
	registerAgentControl("cleaner");
	registerAgentControl("architect");

	const registerEinTool = createEinToolRegistrar(pi);

	registerAdvisoryTools(registerEinTool);

	registerGeneralCommands(pi);

	registerSddReadSurface(pi, registerEinTool);

	registerSddChangeSettings(registerEinTool);

	registerOpenSpecWriteTools(registerEinTool);

	registerSddLifecycleTools(pi, registerEinTool);

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
			lines.push("// 000. ein status");
			lines.push(`${t("status.author", "autor")}: samuhlo`);
			lines.push(`${t("status.linear", "linear")}: ${readLinearIntegration(ctx.cwd)}`);
			lines.push(`${t("status.persona", "persona")}: ${readPersonaMode(ctx.cwd)}`);
			lines.push(
				`${t("status.git", "entrega git")}: ${readGitDeliveryMode(ctx.cwd)}`,
			);
			lines.push(
				`${t("status.lang", "idioma")}: ${t("status.lang.chat", "conversación")}=${LANG_LABEL[chatLang]} · ${t("status.lang.artifacts", "artefactos")}=${LANG_LABEL[artifactLang]}`,
			);
			lines.push(
				`${t("status.state", "estado")}: ${staleDrift > 0 ? t("status.state.drift", "drift detectado") : t("status.state.ok", "operativo")}`,
			);
			lines.push("");

			lines.push(`// 001. ${t("status.sdd", "SDD")}`);
			lines.push(`${t("status.agents", "agentes")}: ${agents.length}`);
			for (const a of agents) lines.push(`- ${a}`);
			lines.push(`${t("status.chains", "chains")}: ${chains.length}`);
			for (const c of chains) lines.push(`- ${c}`);
			{
				const summaries = listActiveChangeSummaries(ctx.cwd);
				const budget = aggregateSddBudget(summaries);
				if (summaries.length === 0) {
					lines.push(`${t("status.sdd.active", "active change")}: ${t("status.sdd.none", "none")}`);
				} else {
					lines.push(tf("status.sdd.multi", "{0} active", summaries.length));
					for (const summary of summaries.slice(0, 8)) {
						lines.push(`- ${summary.change}: phase=${summary.currentPhase} · next=${summary.nextRecommended} · ready=${summary.tasks.ready} · blocked=${summary.tasks.blocked} · budget=${formatBudget(summary.budget)}`);
					}
					if (summaries.length > 8) lines.push(`- … ${summaries.length - 8} more`);
					if (budget.changesWithBudget > 0) {
						lines.push(`${t("status.sdd.budget-total", "budget total")}: allocated=${budget.allocated ?? "unknown"} · consumed=${budget.consumed ?? "unknown"}`);
					}
				}
			}
			if (staleDrift > 0)
				lines.push(
					`drift: ${staleDrift} ${t("status.drift.files", "archivo(s) desincronizado(s)")} — /ein:ai:install-sdd --force ${t("status.drift.refresh", "para refrescar")}`,
				);
			lines.push("");

			lines.push(`// 002. ${t("status.skills", "SKILLS")}`);
			lines.push(`${t("status.skills.local", "locales")}: ${localSkills}`);
			lines.push(`${t("status.skills.downloaded", "descargadas")}: ${downloadedSkills}`);
			lines.push("");

			lines.push(`// 003. ${t("status.project", "PROYECTO")}`);
			const einMd = readEinMd(ctx.cwd);
			if (!einMd.exists) {
				lines.push(`EIN.md: ${t("status.einmd.absent", "ausente — /ein:init para generarlo")}`);
			} else {
				const behind = einMdCommitsBehind(ctx.cwd);
				const fresh =
					behind === undefined
						? t("status.einmd.present", "presente")
						: behind === 0
							? t("status.einmd.fresh", "al día")
							: tf("status.einmd.stale", `{0} commits atrás — /ein:init para refrescar`, behind);
				lines.push(`EIN.md: ${fresh}`);
			}
			lines.push(`openspec: ${openspecConfigured ? t("status.openspec.configured", "configurado") : t("status.openspec.unconfigured", "no configurado — ejecuta el preflight SDD para arrancar")}`);
			lines.push(`${t("status.model", "modelo")}: ${existsSync(modelConfigPath(ctx.cwd)) ? t("status.model.present", "config presente") : t("status.model.absent", "sin config local")}`);
			lines.push("");

			lines.push("// 004. MCP");
			if (mcpServers.length > 0) {
				lines.push(`${t("status.mcp.servers", "servidores")}: ${mcpServers.join(", ")}`);
			} else {
				lines.push(`${t("status.mcp.servers", "servidores")}: ${t("status.mcp.none", "ninguno configurado")}`);
			}
			lines.push("");

			lines.push(`// 005. ${t("status.diag", "DIAGNOSTICO")}`);
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
					: t("help.short", "// ayuda ein — autor: samuhlo");
			ctx.ui.notify(text, "info");
		},
	});
}
