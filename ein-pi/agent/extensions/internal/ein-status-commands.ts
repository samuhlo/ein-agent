// =============================================================================
// EIN STATUS COMMANDS
// Owns the human-facing status and help commands. It reads runtime/project
// state and renders it without participating in session or tool coordination.
// =============================================================================

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { sddGlobalAssetDriftCount } from "../../lib/sdd-preflight.ts";
import { readGitDeliveryMode } from "../../lib/git-delivery.ts";
import { readPersonaMode } from "../../lib/persona.ts";
import {
	LANG_LABEL,
	readArtifactLang,
	readChatLang,
} from "../../lib/lang.ts";
import { t, tf } from "../../lib/i18n/strings.ts";
import { inspectLinearIntegration, linearIntegrationLabel } from "../../lib/linear-integration.ts";
import { modelConfigPath } from "../../lib/model-config.ts";
import {
	aggregateSddBudget,
	formatBudget,
	listActiveChangeSummaries,
} from "../../lib/sdd-router.ts";
import {
	einMdCommitsBehind,
	readEinMd,
} from "../../lib/project-context.ts";
import { AGENT_DIR } from "../ein-paths.ts";

function countEntries(dir: string): number {
	if (!existsSync(dir)) return 0;
	try {
		return readdirSync(dir).length;
	} catch {
		return 0;
	}
}

export function registerStatusCommands(pi: ExtensionAPI): void {
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
				? readdirSync(agentsDir).filter((file) => file.endsWith(".md")).sort()
				: [];
			const chains = existsSync(chainsDir)
				? readdirSync(chainsDir).filter((file) => file.endsWith(".chain.md")).sort()
				: [];
			const localSkills = countEntries(skillsLocalDir);
			const downloadedSkills = countEntries(skillsDownloadedDir);
			const openspecConfigured = existsSync(
				join(ctx.cwd, "openspec", "config.yaml"),
			);
			const staleDrift = sddGlobalAssetDriftCount();
			let mcpServers: string[] = [];
			if (existsSync(mcpFile)) {
				try {
					const config = JSON.parse(readFileSync(mcpFile, "utf8")) as {
						mcpServers?: Record<string, unknown>;
					};
					mcpServers = Object.keys(config.mcpServers ?? {});
				} catch {
					mcpServers = [];
				}
			}

			const lines: string[] = [];
			const chatLang = readChatLang();
			const artifactLang = readArtifactLang(ctx.cwd);
			lines.push("// 000. ein status");
			lines.push(`${t("status.author", "autor")}: samuhlo`);
			lines.push(`${t("status.linear", "linear")}: ${linearIntegrationLabel(inspectLinearIntegration(ctx.cwd))}`);
			lines.push(`${t("status.persona", "persona")}: ${readPersonaMode(ctx.cwd)}`);
			lines.push(`${t("status.git", "entrega git")}: ${readGitDeliveryMode(ctx.cwd)}`);
			lines.push(
				`${t("status.lang", "idioma")}: ${t("status.lang.chat", "conversación")}=${LANG_LABEL[chatLang]} · ${t("status.lang.artifacts", "artefactos")}=${LANG_LABEL[artifactLang]}`,
			);
			lines.push(
				`${t("status.state", "estado")}: ${staleDrift > 0 ? t("status.state.drift", "drift detectado") : t("status.state.ok", "operativo")}`,
			);
			lines.push("");
			lines.push(`// 001. ${t("status.sdd", "SDD")}`);
			lines.push(`${t("status.agents", "agentes")}: ${agents.length}`);
			for (const agent of agents) lines.push(`- ${agent}`);
			lines.push(`${t("status.chains", "chains")}: ${chains.length}`);
			for (const chain of chains) lines.push(`- ${chain}`);
			const summaries = listActiveChangeSummaries(ctx.cwd);
			const budget = aggregateSddBudget(summaries);
			if (summaries.length === 0) {
				lines.push(`${t("status.sdd.active", "active change")}: ${t("status.sdd.none", "none")}`);
			} else {
				lines.push(tf("status.sdd.multi", "{0} active", summaries.length));
				for (const summary of summaries.slice(0, 8)) {
					lines.push(
						`- ${summary.change}: phase=${summary.currentPhase} · next=${summary.nextRecommended} · ready=${summary.tasks.ready} · blocked=${summary.tasks.blocked} · budget=${formatBudget(summary.budget)}`,
					);
				}
				if (summaries.length > 8) lines.push(`- … ${summaries.length - 8} more`);
				if (budget.changesWithBudget > 0) {
					lines.push(
						`${t("status.sdd.budget-total", "budget total")}: allocated=${budget.allocated ?? "unknown"} · consumed=${budget.consumed ?? "unknown"}`,
					);
				}
			}
			if (staleDrift > 0) {
				lines.push(
					`drift: ${staleDrift} ${t("status.drift.files", "archivo(s) desincronizado(s)")} — /ein:ai:install-sdd --force ${t("status.drift.refresh", "para refrescar")}`,
				);
			}
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
				const fresh = behind === undefined
					? t("status.einmd.present", "presente")
					: behind === 0
						? t("status.einmd.fresh", "al día")
						: tf("status.einmd.stale", `{0} commits atrás — /ein:init para refrescar`, behind);
				lines.push(`EIN.md: ${fresh}`);
			}
			lines.push(
				`openspec: ${openspecConfigured ? t("status.openspec.configured", "configurado") : t("status.openspec.unconfigured", "no configurado — ejecuta el preflight SDD para arrancar")}`,
			);
			lines.push(
				`${t("status.model", "modelo")}: ${existsSync(modelConfigPath(ctx.cwd)) ? t("status.model.present", "config presente") : t("status.model.absent", "sin config local")}`,
			);
			lines.push("");
			lines.push("// 004. MCP");
			lines.push(mcpServers.length > 0
				? `${t("status.mcp.servers", "servidores")}: ${mcpServers.join(", ")}`
				: `${t("status.mcp.servers", "servidores")}: ${t("status.mcp.none", "ninguno configurado")}`);
			lines.push("");
			lines.push(`// 005. ${t("status.diag", "DIAGNOSTICO")}`);
			lines.push(`- /ein:doctor-output ${t("status.diag.output", "para smoke checks tecnicos")}`);
			lines.push(`- /ein:doctor ${t("status.diag.doctor", "para diagnostico explicativo")}`);
			ctx.ui.notify(lines.join("\n"), staleDrift > 0 ? "warning" : "info");
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
			const output = mode === "full"
				? t("help.full", "Ein listo. Autor: samuhlo. (i18n no disponible)")
				: t("help.short", "// ayuda ein — autor: samuhlo");
			ctx.ui.notify(output, "info");
		},
	});
}
