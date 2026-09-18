import { validateEvidenceDelegation } from "../../lib/intent-discovery.ts";
import { askDeliveryConsent } from "../../lib/delivery-consent.ts";
// =============================================================================
// EIN TOOL CALL GATE
// Owns Pi's pre-execution boundary: intent, delegation normalization, delivery
// consent, participant admission, and guarded shell execution.
// =============================================================================

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	ensureApplyAcceptance,
	ensureApplyTurnBudget,
	ensureDelegationAcceptance,
	ensureParticipantForeground,
	ensurePhaseRuntime,
	ensurePlanningAcceptance,
	gateTddForDelegation,
	isSddParticipantMarker,
	sddPreflightSessionKey,
} from "../../lib/sdd-preflight.ts";
import {
	collectDelegationItems,
	delegationTargetsOnly,
	normalizeDelegationForRunner,
	rewriteDelegationTasks,
} from "../../lib/delegation-shape.ts";
import { admitDelegation } from "../../lib/delegation-admission.ts";
import {
	attachResolvedApplyTdd,
	decideApplyTurnBudget,
	resolveApplyTdd,
	type ResolvedApplyTdd,
} from "../../lib/apply-tdd-contract.ts";
import {
	type DeliveryIntent,
	bindDeliveryWork,
	deliveryIntentActive,
	nextDeliveryIntent,
	readGitDeliveryMode,
} from "../../lib/git-delivery.ts";
import {
	confirmDelegatedDelivery,
} from "../../lib/guardrails.ts";
import { compileApplyHandoff } from "../../lib/apply-packet-handoff.ts";
import { guardChildCommand } from "./ein-command-guard-child.ts";
import {
	normalizeScoutLaunch,
	type ScoutTracking,
} from "../../lib/scout-contract.ts";
import {
	admitSddParticipantCall,
	expandSddParticipantTask,
	type SddParticipant,
} from "../../lib/sdd-participants.ts";
import { isRecord, readExplicitSddChange } from "./ein-pi-event-contracts.ts";
import { ensurePhaseContextBudget } from "../../lib/sdd-phase-context-budget.ts";
import { normalizeAgentDiscoveryScope } from "../../lib/agent-discovery-scope.ts";
import {
	applyPacketNotification,
	observeNextApplyPacket,
} from "../../lib/apply-packet-observation.ts";
import {
	APPLY_PACKET_OBSERVATION_CUSTOM_TYPE,
	createApplyPacketObservationRecord,
} from "../../lib/apply-packet-observation-record.ts";

type ToolCallGateDependencies = Readonly<{
	scoutTracking: ScoutTracking;
	rememberPhaseSnapshot: (
		toolCallId: string,
		input: unknown,
		cwd: string,
	) => void;
}>;

export function registerToolCallGate(
	pi: ExtensionAPI,
	dependencies: ToolCallGateDependencies,
) {
	const deliveryIntentBySession = new Map<string, DeliveryIntent>();
	function recordDeliveryIntent(ctx: ExtensionContext, text: string): void {
		const key = sddPreflightSessionKey(ctx);
		deliveryIntentBySession.set(
			key,
			nextDeliveryIntent(deliveryIntentBySession.get(key), text),
		);
	}

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "subagent") {
			const initialAdmission = admitDelegation(event.input);
			if (initialAdmission.kind === "rejected") {
				return {
					block: true,
					reason: `[${initialAdmission.code}] ${initialAdmission.reason}${initialAdmission.line ? ` (line ${initialAdmission.line}, column ${initialAdmission.column})` : ""}`,
				};
			}
			if (initialAdmission.kind === "management") return undefined;
			try { if (validateEvidenceDelegation(ctx, event.input)) return; }
			catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
			try { rewriteDelegationTasks(event.input, (agent, task) => expandSddParticipantTask(ctx.cwd, sddPreflightSessionKey(ctx), agent, task)); }
			catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
			try { normalizeAgentDiscoveryScope(event.input, ctx.cwd); }
			catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
			const scoutLaunch = normalizeScoutLaunch(
				event.input,
				event.toolCallId,
				dependencies.scoutTracking,
				ctx.cwd,
			);
			if (scoutLaunch) {
				Object.assign(event.input as Record<string, unknown>, scoutLaunch);
				delete (event.input as Record<string, unknown>).turnBudget;
				try { normalizeDelegationForRunner(event.input); }
				catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
				return undefined;
			}
			let items = collectDelegationItems(event.input);
			const workKeys = [...new Set(items.flatMap((item) => {
				const match = item.task?.match(/^intent_work:\s*([^\s]+)\s*$/m);
				return match ? [match[1]!] : [];
			}))];
			const deliveryWork = workKeys.length === 1 ? workKeys[0] : undefined;
			const deliveryKey = sddPreflightSessionKey(ctx);
			const boundIntent = bindDeliveryWork(deliveryIntentBySession.get(deliveryKey), deliveryWork);
			if (boundIntent) deliveryIntentBySession.set(deliveryKey, boundIntent);
			for (const item of items) {
				if (
					(item.agent !== "ein-cleaner" && item.agent !== "ein-architect")
					|| !item.task
				) continue;
				const participants = items.filter((candidate) =>
					(candidate.agent === "ein-cleaner" || candidate.agent === "ein-architect")
					&& isSddParticipantMarker(candidate.task)
				);
				if (participants.length > 1) {
					return {
						block: true,
						reason: "SDD participants must run sequentially, one delegation at a time.",
					};
				}
				try {
					const blocker = admitSddParticipantCall(
						ctx.cwd,
						sddPreflightSessionKey(ctx),
						event.toolCallId,
						item.agent as SddParticipant,
						item.task,
					);
					if (blocker) return { block: true, reason: blocker };
				} catch (error) {
					return {
						block: true,
						reason: error instanceof Error ? error.message : String(error),
					};
				}
			}
			ensureParticipantForeground(event.input);
			// Resolve one effective TDD contract per apply child. The existing gate
			// may persist a missing change decision; resolution happens only after
			// that opportunity, and the result itself is then reused for budget and
			// child transport.
			await gateTddForDelegation(event.input, ctx);
			items = collectDelegationItems(event.input);
			const applyContracts: ResolvedApplyTdd[] = [];
			for (const item of items) {
				if (item.agent !== "sdd-apply") continue;
				let resolution = resolveApplyTdd({ cwd: ctx.cwd, task: item.task, structuredHint: item.tdd });
				if (resolution.kind === "needs-decision" && resolution.reason === "project-ask" && ctx.hasUI) {
					const picked = await ctx.ui.select("TDD estricto para este apply ad-hoc", ["off", "strict"]);
					if (picked === "off" || picked === "strict") {
						resolution = resolveApplyTdd({ cwd: ctx.cwd, task: item.task, structuredHint: picked, change: null });
					}
				}
				if (resolution.kind !== "resolved") {
					return {
						block: true,
						reason: resolution.kind === "invalid"
							? `Invalid apply TDD contract: ${resolution.reason}`
							: `Apply TDD decision required: ${resolution.message}`,
					};
				}
				const explicitBudget = item.turnBudget ?? (isRecord(event.input) ? event.input.turnBudget : undefined);
				const budget = decideApplyTurnBudget(resolution.contract, explicitBudget);
				if (budget.status === "unavailable" && explicitBudget !== undefined) {
					return { block: true, reason: `${budget.message}; the apply was not launched` };
				}
				if (budget.status === "unavailable" && ctx.hasUI) ctx.ui.notify(
					"Apply: límite de turnos no disponible en el runner; maxRuntimeMs sigue activo.",
					"warning",
				);
				applyContracts.push(resolution.contract);
			}
			if (applyContracts.length > 0) {
				let applyIndex = 0;
				rewriteDelegationTasks(event.input, (agent, task) => agent === "sdd-apply"
					? attachResolvedApplyTdd(task, applyContracts[applyIndex++]!)
					: task);
				if (items.length === 1) ensureApplyTurnBudget(event.input, applyContracts[0]);
				items = collectDelegationItems(event.input);
			}
			// Rollout 1: observar el contrato vivo sin bloquear ni mutar la
			// delegación. La puerta dura llega solo después de medir planes reales.
			if (delegationTargetsOnly(event.input, "sdd-apply")) {
				const change = readExplicitSddChange(event);
				const observation = observeNextApplyPacket(ctx.cwd, change);
				const contractRequested = Boolean(change) || items.some((item) => /^apply_group:[\t ]*\S/m.test(item.task ?? ""));
				try {
					pi.appendEntry(
						APPLY_PACKET_OBSERVATION_CUSTOM_TYPE,
						createApplyPacketObservationRecord(observation, {
							observedAt: new Date().toISOString(),
							toolCallId: event.toolCallId,
						}),
					);
				} catch (error) {
					// La telemetría report-only nunca puede convertirse por accidente
					// en una puerta de ejecución. La ausencia queda visible en UI.
					if (ctx.hasUI) ctx.ui.notify(
						`Apply packet v2: observation not persisted · ${error instanceof Error ? error.message : String(error)}`,
						"warning",
					);
				}
				const notification = applyPacketNotification(observation, contractRequested);
				if (ctx.hasUI && notification) ctx.ui.notify(notification.message, notification.level);
			}
			if (isRecord(event.input) && event.input.agent === "sdd-apply" && typeof event.input.task === "string") {
				try { compileApplyHandoff(ctx.cwd, event.input.task); }
				catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
			}
			ensurePlanningAcceptance(event.input);
			ensureApplyAcceptance(event.input);
			ensurePhaseRuntime(event.input);
			try {
				const phaseBudgets = ensurePhaseContextBudget(event.input);
				for (const allocation of phaseBudgets.allocations) {
					if (allocation.warning && ctx.hasUI) ctx.ui.notify(`${allocation.agent}: ${allocation.warning}`, "warning");
				}
			}
			catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
			ensureDelegationAcceptance(event.input);
			try { normalizeDelegationForRunner(event.input); }
			catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
			dependencies.rememberPhaseSnapshot(
				event.toolCallId,
				event.input,
				ctx.cwd,
			);
			return confirmDelegatedDelivery(event.input, ctx, {
				mode: readGitDeliveryMode(ctx.cwd),
				confirm: (preview) => askDeliveryConsent(ctx, preview),
				userRequested: deliveryIntentActive(
					deliveryIntentBySession.get(sddPreflightSessionKey(ctx)),
					Date.now(), deliveryWork,
				),
			});
		}
		if (event.toolName !== "bash") return undefined;
		if (!isRecord(event.input) || typeof event.input.command !== "string") {
			return undefined;
		}
		const guard = await guardChildCommand(event, ctx);
		if (guard) return guard;
		return undefined;
	});

	return { recordDeliveryIntent };
}
