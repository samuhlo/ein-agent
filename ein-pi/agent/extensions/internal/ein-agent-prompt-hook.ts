// =============================================================================
// EIN AGENT PROMPT HOOK
// Builds the context added before each Pi agent starts. Selection rules live
// here; the individual prompt sources remain with their domain owners.
// =============================================================================

import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	getSddPreflightPreferences,
	getSddSessionMemory,
	renderMemoryAdvisory,
	renderSddPreflightPrompt,
	sddPreflightSessionKey,
} from "../../lib/sdd-preflight.ts";
import { buildEinPrompt, readPersonaMode } from "../../lib/persona.ts";
import {
	artifactLanguageDirective,
	readArtifactLang,
	readChatLang,
} from "../../lib/lang.ts";
import { codegraphDirective } from "../../lib/codegraph.ts";
import { readLinearIntegration } from "../../lib/linear-integration.ts";
import { internalAgentRoutingDirective } from "../../lib/agent-controls.ts";
import { einContextDirective } from "../../lib/project-context.ts";
import {
	readInstalledVersion,
	staleSessionNudge,
} from "../../lib/session-version.ts";
import {
	codeConventionSkillBlock,
	resolveSkillInjection,
} from "../ein-skill-registry.ts";
import { AGENT_DIR } from "../ein-paths.ts";
import { canonicalSpecPrompt } from "./ein-canonical-spec-context.ts";
import {
	isNamedAgentStartEvent,
	isSddAgentStartEvent,
	readAgentStartNames,
	readAgentTask,
	readExplicitSddChange,
} from "./ein-pi-event-contracts.ts";

export function registerAgentPromptHook(pi: ExtensionAPI): void {
	const sessionStartVersion = new Map<string, string | null>();
	const staleSessionNudged = new Set<string>();

	pi.on("before_agent_start", async (event, ctx) => {
		const isSddAgent = isSddAgentStartEvent(event);
		const isNamedAgent = isNamedAgentStartEvent(event);
		const preferences = getSddPreflightPreferences(ctx);
		const startNames = readAgentStartNames(event);
		const memoryPrompt = renderMemoryAdvisory(
			!isNamedAgent && !isSddAgent ? getSddSessionMemory(ctx) : undefined,
		);
		const isParent = !isNamedAgent && !isSddAgent;
		const isScout = startNames.includes("ein-scout");
		if (isParent && ctx.hasUI) {
			const sessionKey = sddPreflightSessionKey(ctx);
			const current = readInstalledVersion(
				join(AGENT_DIR, ".ein-install.json"),
			);
			if (!sessionStartVersion.has(sessionKey)) {
				sessionStartVersion.set(sessionKey, current);
			} else {
				const decision = staleSessionNudge({
					startVersion: sessionStartVersion.get(sessionKey) ?? null,
					currentVersion: current,
					alreadyNudged: staleSessionNudged.has(sessionKey),
				});
				if (decision.nudge) {
					staleSessionNudged.add(sessionKey);
					ctx.ui.notify(
						`Ein se actualizó a v${decision.version} durante esta sesión — sigue con la plantilla anterior. Reinicia Pi (o abre una sesión nueva) para cargar los cambios.`,
						"warning",
					);
				}
			}
		}
		const writesCode = isParent || startNames.includes("sdd-apply");
		const sddPrompt = preferences && (!isNamedAgent || isSddAgent)
			? `\n\n${renderSddPreflightPrompt(preferences, {
				includeTdd: writesCode,
				includeBaseline: isParent,
			})}`
			: "";
		const einPrompt = isNamedAgent || isSddAgent
			? ""
			: `\n\n${buildEinPrompt(
				readPersonaMode(ctx.cwd),
				readChatLang(),
				readLinearIntegration(ctx.cwd),
			)}\n\n${internalAgentRoutingDirective()}`;
		let skillsPrompt = "";
		if ((isNamedAgent || isSddAgent) && !isScout) {
			const block = resolveSkillInjection(ctx.cwd, readAgentTask(event));
			if (block) skillsPrompt = `\n\n${block}`;
		}
		let artifactPrompt = "";
		if (
			isNamedAgent
			&& startNames.some((name) => name === "ein-git" || name === "ein-linear")
		) {
			artifactPrompt = `\n\n${artifactLanguageDirective(readArtifactLang(ctx.cwd))}`;
		}
		const conventions = writesCode ? codeConventionSkillBlock(ctx.cwd) : "";
		const conventionsPrompt = conventions ? `\n\n${conventions}` : "";
		const wantsContext = !isNamedAgent || isSddAgent;
		const context = wantsContext ? einContextDirective(ctx.cwd) : "";
		const contextPrompt = context ? `\n\n${context}` : "";
		const canonicalAgent = startNames.includes("sdd-scope")
			? "sdd-scope"
			: startNames.includes("sdd-design")
				? "sdd-design"
				: undefined;
		const canonicalSpecContext = canonicalAgent
			? canonicalSpecPrompt(
				ctx.cwd,
				canonicalAgent,
				readAgentTask(event),
				readExplicitSddChange(event),
			)
			: "";
		const codegraph = wantsContext ? codegraphDirective(ctx.cwd) : "";
		const codegraphPrompt = codegraph ? `\n\n${codegraph}` : "";
		return {
			systemPrompt: `${event.systemPrompt}${einPrompt}${sddPrompt}${memoryPrompt ? `\n\n${memoryPrompt}` : ""}${skillsPrompt}${artifactPrompt}${conventionsPrompt}${contextPrompt}${canonicalSpecContext}${codegraphPrompt}`,
		};
	});
}
