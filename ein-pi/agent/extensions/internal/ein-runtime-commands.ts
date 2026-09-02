// =============================================================================
// EIN RUNTIME COMMANDS
// Registers commands that operate Pi's local runtime: asset refresh, manual
// preflight, and per-session Cleaner/Architect controls.
// =============================================================================

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { installSddAssets, sddPreflightSessionKey } from "../../lib/sdd-preflight.ts";
import { t, tf } from "../../lib/i18n/strings.ts";
import {
	routeAgentControl,
	type EinInternalAgent,
} from "../../lib/agent-controls.ts";

export function registerRuntimeCommands(
	pi: ExtensionAPI,
	runSddPreflight: (ctx: ExtensionContext) => Promise<unknown>,
): void {
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

	const registerAgentControl = (agent: EinInternalAgent): void => {
		pi.registerCommand(`ein:${agent}`, {
			description: `Route an explicit ${agent} request or set this session's automatic participation (on/off/status)`,
			handler: async (args, ctx) => {
				const result = routeAgentControl(
					ctx.cwd,
					sddPreflightSessionKey(ctx),
					agent,
					String(args ?? ""),
				);
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
}
