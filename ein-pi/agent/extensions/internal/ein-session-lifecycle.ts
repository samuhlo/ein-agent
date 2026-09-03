// =============================================================================
// EIN SESSION LIFECYCLE
// Owns Pi session startup, shutdown, and user input. It coordinates existing
// services without owning prompt construction or tool execution.
// =============================================================================

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	ensureSddPreflight,
	installSddAssets,
	isSddPreflightTrigger,
	sddPreflightSessionKey,
	type SddPreflightPreferences,
} from "../../lib/sdd-preflight.ts";
import { bootstrapOpenSpecConfig } from "../../lib/openspec-config-bootstrap.ts";
import {
	offerCodegraphInit,
	shouldOfferCodegraphInit,
} from "../../lib/codegraph.ts";
import { tf } from "../../lib/i18n/strings.ts";
import { applySavedModelConfig } from "../../lib/model-config.ts";
import { runOnboarding } from "../../lib/onboarding.ts";
import { ensureEinGitignore } from "../../lib/gitignore.ts";
import { clearAgentControlSession } from "../../lib/agent-controls.ts";
import { clearSddParticipantSession } from "../../lib/sdd-participants.ts";
import type { ScoutTracking } from "../../lib/scout-contract.ts";
import { memoryLifecycleForSession } from "./ein-sdd-memory.ts";

type SessionLifecycleDependencies = Readonly<{
	scoutTracking: ScoutTracking;
	recordDeliveryIntent: (ctx: ExtensionContext, text: string) => void;
}>;

export function registerSessionLifecycle(
	pi: ExtensionAPI,
	dependencies: SessionLifecycleDependencies,
) {
	async function runSddPreflight(
		ctx: ExtensionContext,
	): Promise<SddPreflightPreferences> {
		const preferences = await ensureSddPreflight(ctx, {
			pi,
			memoryLifecycle: memoryLifecycleForSession(ctx),
			installAssets: (cwd) => installSddAssets(cwd, false),
			applyModelConfig: async () => applySavedModelConfig(ctx),
		});
		bootstrapOpenSpecConfig(ctx.cwd);
		return preferences;
	}

	pi.on("session_start", async (_event, ctx) => {
		ensureEinGitignore(ctx.cwd);
		if (ctx.hasUI && shouldOfferCodegraphInit(ctx.cwd)) {
			try {
				await offerCodegraphInit(ctx);
			} catch {
				// An optional offer cannot prevent session startup.
			}
		}
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
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(
					tf(
						"ai.models.error",
						`Error al aplicar config de modelos: ${message}`,
						message,
					),
					"warning",
				);
			}
		}
		await runOnboarding(ctx);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		dependencies.scoutTracking.clear();
		const sessionKey = sddPreflightSessionKey(ctx);
		clearAgentControlSession(sessionKey);
		clearSddParticipantSession(sessionKey);
	});

	pi.on("input", async (event, ctx) => {
		dependencies.scoutTracking.clear();
		if (typeof event.text === "string") {
			dependencies.recordDeliveryIntent(ctx, event.text);
		}
		if (typeof event.text !== "string") return { action: "continue" };
		if (isSddPreflightTrigger(event.text)) await runSddPreflight(ctx);
		return { action: "continue" };
	});

	return { runSddPreflight };
}
