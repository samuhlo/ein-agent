// =============================================================================
// EIN AGENT PROMPT HOOK
// Builds the context added before each Pi agent starts. Selection rules live
// here; the individual prompt sources remain with their domain owners.
// =============================================================================

import { compileApplyHandoff } from "../../lib/apply-packet-handoff.ts";
import { join, resolve } from "node:path";
import { readAgreement } from "../../lib/intent-agreement.ts";
import { PHASE_ARTIFACT, resolveChangesDir, type SddPhase } from "../../lib/sdd-routing-core.ts";
import { formatSkillsForPrompt, type ExtensionAPI, type Skill } from "@earendil-works/pi-coding-agent";
import {
	getSddPreflightPreferences,
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

// Usamos el renderizador público de Pi para reconocer solo su propio catálogo.
// Si otra extensión lo modificó o duplicó, se conserva íntegro.
export function compactParentSkillCatalog(systemPrompt: string, skills: Skill[] | undefined): string {
	if (!skills?.length) return systemPrompt;
	const catalogue = formatSkillsForPrompt(skills);
	if (!catalogue) return systemPrompt;
	const offset = systemPrompt.indexOf(catalogue);
	if (offset < 0 || systemPrompt.indexOf(catalogue, offset + catalogue.length) >= 0) return systemPrompt;
	const names = [...new Set(skills.filter((skill) => !skill.disableModelInvocation).map((skill) => skill.name))];
	const index = `\n\nAvailable skill names: ${names.map((name) => JSON.stringify(name)).join(", ")}.\nUse ein_skill_resolve for the task or ein_skill_registry for an exact name to obtain descriptions and paths, then read the selected SKILL.md. Skills remain installed and explicit /skill commands still work.\n`;
	if (Buffer.byteLength(index) >= Buffer.byteLength(catalogue)) return systemPrompt;
	return systemPrompt.slice(0, offset) + index + systemPrompt.slice(offset + catalogue.length);
}

export function registerAgentPromptHook(pi: ExtensionAPI): void {
	const sessionStartVersion = new Map<string, string | null>();
	const staleSessionNudged = new Set<string>();
	let handoffError: string | undefined;
	let agreementInput: { directory: string; artifact: string; key: string } | undefined;
	pi.on("tool_call", (event, ctx) => {
		if (handoffError) return { block: true, reason: handoffError };
		if (!agreementInput || !["write", "edit", "bash", "ein_sdd_task_progress", "ein_openspec_delta_write", "ein_sdd_summary"].includes(event.toolName)) return;
		const current = readAgreement(agreementInput.directory);
		if (current.kind !== "valid" || current.agreement.status !== "confirmed" || current.agreement.materialKey !== agreementInput.key) {
			return { block: true, reason: "Intent changed after this phase started; return blocked and re-plan against the current agreement." };
		}
		// Bind newly authored full output to the agreement actually supplied at
		// launch. Never retag an existing artifact on read/check or a partial edit.
		if (event.toolName === "write" && typeof event.input.path === "string" && typeof event.input.content === "string"
			&& resolve(ctx.cwd, event.input.path) === agreementInput.artifact) {
			const body = event.input.content.replace(/^[ \t]*(?:[-*][ \t]+)?intent_key:[^\r\n]*(?:\r?\n|$)/gm, "");
			event.input.content = `${body}${body.endsWith("\n") ? "" : "\n"}\nintent_key: ${agreementInput.key}\n`;
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const isSddAgent = isSddAgentStartEvent(event);
		const isNamedAgent = isNamedAgentStartEvent(event);
		const preferences = getSddPreflightPreferences(ctx);
		const startNames = readAgentStartNames(event);
		const isParent = !isNamedAgent && !isSddAgent;
		const phaseMarker = "<!-- ein:phase-context -->";
		if (!isParent && event.systemPrompt.includes(phaseMarker)) return;
		const basePrompt = isParent
			? compactParentSkillCatalog(event.systemPrompt, event.systemPromptOptions?.skills)
			: event.systemPrompt;
		const isScout = startNames.includes("ein-scout");
		handoffError = undefined;
		agreementInput = undefined;
		const change = readExplicitSddChange(event);
		const phase = startNames.find((name) => name.startsWith("sdd-"))?.slice(4) as SddPhase | undefined;
		if (change && phase && PHASE_ARTIFACT[phase]) {
			const directory = join(resolveChangesDir(ctx.cwd), change);
			const stored = readAgreement(directory);
			if (stored.kind === "valid" && stored.agreement.status === "confirmed") agreementInput = { directory, artifact: resolve(directory, PHASE_ARTIFACT[phase]), key: stored.agreement.materialKey };
			else if (stored.kind !== "absent" || /^intent_work:/m.test(readAgentTask(event))) handoffError = "The phase's intent is absent, invalid or no longer confirmed";
		}
		let handoff: ReturnType<typeof compileApplyHandoff>;
		try { if (handoffError) throw new Error(handoffError); handoff = startNames.includes("sdd-apply") ? compileApplyHandoff(ctx.cwd, readAgentTask(event)) : undefined; }
		catch (error) {
			handoffError = error instanceof Error ? error.message : String(error);
			return { systemPrompt: `${basePrompt}\n${phaseMarker}\nExecution blocked: ${handoffError}. Return status: blocked to the parent; tools are unavailable until the assignment is corrected.` };
		}
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
			const block = resolveSkillInjection(ctx.cwd, [readAgentTask(event), handoff?.skillTask].filter(Boolean).join("\n"), 6, startNames[0]);
			if (block) skillsPrompt = `\n\n${block}`;
		}
		let artifactPrompt = "";
		if (
			isNamedAgent
			&& startNames.some((name) => name === "ein-git" || name === "ein-linear")
		) {
			artifactPrompt = `\n\n${artifactLanguageDirective(readArtifactLang(ctx.cwd))}`;
		}
		// El padre delega la escritura; las reglas de edición pertenecen a apply.
		const conventions = startNames.includes("sdd-apply") ? codeConventionSkillBlock(ctx.cwd) : "";
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
			systemPrompt: `${basePrompt}${!isParent ? `\n${phaseMarker}` : ""}${einPrompt}${sddPrompt}${skillsPrompt}${artifactPrompt}${conventionsPrompt}${contextPrompt}${canonicalSpecContext}${codegraphPrompt}${handoff ? `\n\n${handoff.prompt}` : ""}`,
		};
	});
}
