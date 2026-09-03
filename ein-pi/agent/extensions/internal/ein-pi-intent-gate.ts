// =============================================================================
// EIN PI INTENT GATE
// Owns Pi's interactive intent state across input, agent-start, and tool-call
// hooks. Only the input path may ask; secondary hooks adopt or fail closed.
// =============================================================================

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	piSddIntentPreflightContext,
	resolveSddIntentPreflight,
	sddPreflightSessionKey,
	type SddIntentPreflightInput,
} from "../../lib/sdd-preflight.ts";
import { resolveActiveChange } from "../../lib/sdd-preflight-record.ts";

type PiIntentGateState =
	| Readonly<{ kind: "pending"; input: SddIntentPreflightInput }>
	| Readonly<{ kind: "confirming"; input: SddIntentPreflightInput; answers: string }>
	| Readonly<{ kind: "resolved" }>;

const READ_ONLY_INTENT = /^(?:(?:can|could|would)\s+you\s+|please\s+|(?:puedes|podrías)\s+|por\s+favor[,\s]+)?(?:explain|inspect|show|list|read|review|analy[sz]e|describe|what|why|how|where|which|explica|inspecciona|muestra|lista|lee|revisa|analiza|qué|que|por qué|por que|cómo|como|dónde|donde|cuál|cual)\b/iu;
const MODIFYING_INTENT = /\b(?:implement|add|change|update|fix|remove|delete|write|create|refactor|rename|move|install|configur|implementa|añade|agrega|cambia|actualiza|corrige|elimina|borra|escribe|crea|refactoriza|renombra|mueve|instala)\w*\b/iu;
const SMALL_TEXT_INTENT = /^(?:fix|correct|update|corrige|actualiza)\s+(?:the\s+|el\s+|la\s+)?(?:typo|spelling|wording|text|errata|ortograf[ií]a|texto)\s+(?:in|en)\s+\S+(?:\s+(?:skip questions|without questions|don't ask|do not ask|sin preguntas|no preguntes))?\s*\.?$/iu;
const SAFE_BYPASS_INTENT = /\b(?:skip questions|without questions|don't ask|do not ask|sin preguntas|no preguntes)\b/iu;
const SUBAGENT_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/iu;
const SUBAGENT_RUN_ID = /^[a-z0-9][a-z0-9-]{0,127}$/iu;

export function isDelegatedPiSubagent(
	environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
	const agent = environment.PI_SUBAGENT_CHILD_AGENT?.trim() ?? "";
	const childIndex = environment.PI_SUBAGENT_CHILD_INDEX?.trim() ?? "";
	const runId = environment.PI_SUBAGENT_RUN_ID?.trim() ?? "";
	return environment.PI_SUBAGENT_CHILD === "1"
		&& SUBAGENT_ID.test(agent)
		&& /^\d+$/u.test(childIndex)
		&& SUBAGENT_RUN_ID.test(runId);
}

export function classifyPiIntentRequest(text: string) {
	const modifying = MODIFYING_INTENT.test(text);
	const readOnly = !modifying && READ_ONLY_INTENT.test(text.trim());
	const smallText = SMALL_TEXT_INTENT.test(text.trim());
	return {
		activation: readOnly ? "read-only" : modifying ? "modifying" : "unknown",
		declaredLane: null,
		bounded: smallText ? true : "unknown",
		mechanical: smallText ? true : "unknown",
		documentationOrTextOnly: smallText ? true : "unknown",
		introducesBehavior: smallText ? false : "unknown",
		securityRisk: smallText ? false : "unknown",
		persistentDataRisk: smallText ? false : "unknown",
		destructiveActionRisk: smallText ? false : "unknown",
		bypassRequested: SAFE_BYPASS_INTENT.test(text),
	} as const;
}

function piIntentMaterial(text: string, answers?: string) {
	return {
		objective: text,
		boundaries: {
			in: [answers?.trim() || "The explicitly requested change"],
			out: ["Behavior and files outside the explicit request"],
		},
		completionCriteria: ["The requested outcome is complete and focused checks pass"],
	};
}

export function createPiIntentGate(
	options: Readonly<{ environment?: Readonly<Record<string, string | undefined>> }> = {},
) {
	const stateBySession = new Map<string, PiIntentGateState>();
	const environment = options.environment ?? process.env;

	function piIntentGateDirective(ctx: ExtensionContext): string {
		const gate = stateBySession.get(sddPreflightSessionKey(ctx));
		return gate && gate.kind !== "resolved"
			? "\n\n## Intent preflight gate\nFAIL CLOSED: intent is unresolved. Do not construct, edit, delegate modifying work, or invoke mutating tools. Secondary hooks cannot ask intent questions."
			: "";
	}

	async function adoptPiIntentGate(ctx: ExtensionContext): Promise<void> {
		const sessionKey = sddPreflightSessionKey(ctx);
		const gate = stateBySession.get(sessionKey);
		if (!gate || gate.kind === "resolved") return;
		const change = resolveActiveChange(ctx.cwd);
		if (!change) return;
		const outcome = await resolveSddIntentPreflight(
			piSddIntentPreflightContext(ctx),
			{ ...gate.input, change },
		);
		if (outcome.kind === "adopted" || outcome.kind === "resolved") {
			stateBySession.set(sessionKey, { kind: "resolved" });
		}
	}

	function piIntentToolBlockReason(
		ctx: ExtensionContext,
		toolName: string,
	): string | undefined {
		const gate = stateBySession.get(sddPreflightSessionKey(ctx));
		if (!gate || gate.kind === "resolved") return undefined;
		if (["read", "grep", "find", "codegraph_explore", "codegraph_callers", "codegraph_callees"].includes(toolName)) {
			return undefined;
		}
		return "Intent preflight is unresolved. Only the input hook may ask; submit a clarified or confirmed request before construction.";
	}

	async function runPiIntentPreflight(
		text: string,
		ctx: ExtensionContext,
	): Promise<"read-only" | "pending" | "resolved"> {
		// pi-subagents already received an authorized task and a bounded tool
		// contract from its parent. Reopening the human clarification flow here
		// consumes the child's only non-interactive input and makes it exit empty.
		// `read-only` is only the input-hook control token; child tool permissions
		// still come from pi-subagents and may include the phase-owned report.
		if (isDelegatedPiSubagent(environment)) return "read-only";

		const sessionKey = sddPreflightSessionKey(ctx);
		const current = stateBySession.get(sessionKey);
		if (current?.kind === "pending") {
			const answers = text.trim();
			if (!answers) return "pending";
			stateBySession.set(sessionKey, { kind: "confirming", input: current.input, answers });
			if (ctx.hasUI) {
				ctx.ui.notify(
					`${current.input.summary} — ${answers}\nReply "confirm" to continue, or send a revised request.`,
					"info",
				);
			}
			return "pending";
		}
		if (current?.kind === "confirming") {
			if (!/^(?:confirm|confirmed|yes|sí|si)$/iu.test(text.trim())) {
				stateBySession.delete(sessionKey);
				return runPiIntentPreflight(text, ctx);
			}
			const confirmed = await resolveSddIntentPreflight(
				piSddIntentPreflightContext(ctx),
				{
					...current.input,
					summary: `${current.input.summary} — ${current.answers}`,
					material: piIntentMaterial(current.input.summary, current.answers),
					confirmed: true,
				},
			);
			if (confirmed.kind === "pending") return "pending";
			stateBySession.set(sessionKey, { kind: "resolved" });
			return "resolved";
		}

		stateBySession.delete(sessionKey);
		const change = resolveActiveChange(ctx.cwd);
		const input: SddIntentPreflightInput = {
			change: change ?? `pi-session-${sessionKey.replace(/[^a-z0-9-]/giu, "-").slice(-48) || "pending"}`,
			evidence: classifyPiIntentRequest(text),
			summary: text.trim(),
			material: piIntentMaterial(text),
			materialEvidence: "sufficient",
		};
		const outcome = await resolveSddIntentPreflight(
			piSddIntentPreflightContext(ctx),
			input,
		);
		if (outcome.kind === "read-only") return "read-only";
		if (outcome.kind === "pending") {
			stateBySession.set(sessionKey, { kind: "pending", input });
			if (ctx.hasUI) ctx.ui.notify(outcome.interaction.text, "info");
			return "pending";
		}
		stateBySession.set(sessionKey, { kind: "resolved" });
		return "resolved";
	}

	function clearPiIntentGate(ctx: ExtensionContext): void {
		stateBySession.delete(sddPreflightSessionKey(ctx));
	}

	return {
		adoptPiIntentGate,
		clearPiIntentGate,
		piIntentGateDirective,
		piIntentToolBlockReason,
		runPiIntentPreflight,
	};
}

export type PiIntentGate = ReturnType<typeof createPiIntentGate>;
