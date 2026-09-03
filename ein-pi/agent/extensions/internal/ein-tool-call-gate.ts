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
	delegationShapeIsUnrecognized,
	delegationTargetsOnly,
} from "../../lib/delegation-shape.ts";
import {
	type DeliveryIntent,
	deliveryIntentActive,
	nextDeliveryIntent,
	readGitDeliveryMode,
} from "../../lib/git-delivery.ts";
import { t } from "../../lib/i18n/strings.ts";
import { maybeWrapBashInput } from "../../lib/hypa.ts";
import {
	confirmCommand,
	confirmDelegatedDelivery,
} from "../../lib/guardrails.ts";
import { evaluateStaging } from "../../lib/git-staging.ts";
import {
	normalizeScoutLaunch,
	type ScoutTracking,
} from "../../lib/scout-contract.ts";
import {
	admitSddParticipantCall,
	type SddParticipant,
} from "../../lib/sdd-participants.ts";
import { isRecord } from "./ein-pi-event-contracts.ts";
import {
	formatApplyPacketObservation,
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
	const shapeDriftWarned = new Set<string>();

	function recordDeliveryIntent(ctx: ExtensionContext, text: string): void {
		const key = sddPreflightSessionKey(ctx);
		deliveryIntentBySession.set(
			key,
			nextDeliveryIntent(deliveryIntentBySession.get(key), text),
		);
	}

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "subagent") {
			const scoutLaunch = normalizeScoutLaunch(
				event.input,
				event.toolCallId,
				dependencies.scoutTracking,
			);
			if (scoutLaunch) {
				Object.assign(event.input as Record<string, unknown>, scoutLaunch);
				return undefined;
			}
			const items = collectDelegationItems(event.input);
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
			if (ctx.hasUI && delegationShapeIsUnrecognized(event.input)) {
				const driftKey = sddPreflightSessionKey(ctx);
				if (!shapeDriftWarned.has(driftKey)) {
					shapeDriftWarned.add(driftKey);
					ctx.ui.notify(
						t(
							"ai.delegation.shape-drift",
							"Ein no reconoce la forma de esta delegación: los gates de entrega y TDD no se aplican. Si el runtime de subagentes se acaba de actualizar, actualiza Ein (`ein update`).",
						),
						"warning",
					);
				}
			}
			// Rollout 1: observar el contrato vivo sin bloquear ni mutar la
			// delegación. La puerta dura llega solo después de medir planes reales.
			if (delegationTargetsOnly(event.input, "sdd-apply")) {
				const observation = observeNextApplyPacket(ctx.cwd);
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
				if (ctx.hasUI) ctx.ui.notify(
					formatApplyPacketObservation(observation),
					observation.status === "executable" ? "info" : "warning",
				);
			}
			ensurePlanningAcceptance(event.input);
			ensureApplyAcceptance(event.input);
			ensureApplyTurnBudget(event.input);
			ensurePhaseRuntime(event.input);
			ensureDelegationAcceptance(event.input);
			await gateTddForDelegation(event.input, ctx);
			dependencies.rememberPhaseSnapshot(
				event.toolCallId,
				event.input,
				ctx.cwd,
			);
			return confirmDelegatedDelivery(event.input, ctx, {
				mode: readGitDeliveryMode(ctx.cwd),
				userRequested: deliveryIntentActive(
					deliveryIntentBySession.get(sddPreflightSessionKey(ctx)),
				),
			});
		}
		if (event.toolName !== "bash") return undefined;
		if (!isRecord(event.input) || typeof event.input.command !== "string") {
			return undefined;
		}
		const guard = await confirmCommand(event.input.command, ctx);
		if (guard) return guard;
		const staging = evaluateStaging(ctx.cwd, event.input.command);
		if (staging.kind === "blocked") {
			return { block: true, reason: staging.reason };
		}
		maybeWrapBashInput(event.input as { command: string }, ctx.cwd);
		return undefined;
	});

	return { recordDeliveryIntent };
}
