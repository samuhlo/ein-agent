// =============================================================================
// EIN DELEGATION RESULTS
// Owns Pi's tool_result boundary for SDD participants, scouts, and phase
// reconciliation. Unknown envelopes degrade explicitly; none invent success.
// =============================================================================

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { t } from "../../lib/i18n/strings.ts";
import {
	formatReconciliation,
	reconcilePhaseFailure,
	resolveDelegationPhase,
	snapshotPhaseArtifacts,
	type PhaseSnapshot,
} from "../../lib/sdd-reconcile.ts";
import type { SddPhase } from "../../lib/sdd-guardrails.ts";
import { sddPreflightSessionKey } from "../../lib/sdd-preflight.ts";
import {
	acceptTrackedScoutResult,
	type ScoutTracking,
} from "../../lib/scout-contract.ts";
import {
	completeSddParticipantCall,
	getSddParticipantCall,
	participantResultIsUnrecognized,
	sddParticipantCallsAreTracked,
} from "../../lib/sdd-participants.ts";
import { recognizePiParticipantTerminal } from "./ein-pi-event-contracts.ts";

export function registerDelegationResultHook(
	pi: ExtensionAPI,
	scoutTracking: ScoutTracking,
) {
	const phaseSnapshotByToolCall = new Map<
		string,
		{ phase: SddPhase; before: PhaseSnapshot }
	>();
	const participantResultDriftWarned = new Set<string>();

	function warnParticipantResultDrift(ctx: ExtensionContext): void {
		const key = sddPreflightSessionKey(ctx);
		if (participantResultDriftWarned.has(key)) return;
		participantResultDriftWarned.add(key);
		ctx.ui.notify(
			t(
				"ai.delegation.participant-result-drift",
				"Ein no reconoce la forma del resultado de este participante SDD: la evidencia no se registra. Actualiza Ein (`ein update`).",
			),
			"warning",
		);
	}

	function rememberPhaseSnapshot(
		toolCallId: string,
		input: unknown,
		cwd: string,
	): void {
		const phase = resolveDelegationPhase(input);
		if (!phase) return;
		phaseSnapshotByToolCall.set(toolCallId, {
			phase,
			before: snapshotPhaseArtifacts(cwd, phase),
		});
	}

	pi.on("tool_result", (event, ctx) => {
		if (event.toolName === "subagent_wait") {
			if (ctx.hasUI && participantResultIsUnrecognized({
				toolName: event.toolName,
				details: event.details,
				hasTrackedCalls: sddParticipantCallsAreTracked(),
			})) warnParticipantResultDrift(ctx);
			const tracked = getSddParticipantCall(event.toolCallId);
			if (tracked) completeSddParticipantCall(
				ctx.cwd,
				sddPreflightSessionKey(ctx),
				event.toolCallId,
				{ status: "unavailable", reason: "background participant delivery is unsupported" },
			);
			return undefined;
		}
		if (event.toolName !== "subagent") {
			const tracked = getSddParticipantCall(event.toolCallId);
			if (tracked) completeSddParticipantCall(
				ctx.cwd,
				sddPreflightSessionKey(ctx),
				event.toolCallId,
				{ status: "unavailable", reason: "unsupported participant delivery" },
			);
			return undefined;
		}
		if (ctx.hasUI && participantResultIsUnrecognized({
			toolName: event.toolName,
			details: event.details,
			hasTrackedCalls: sddParticipantCallsAreTracked(),
		})) warnParticipantResultDrift(ctx);
		const tracked = getSddParticipantCall(event.toolCallId);
		if (tracked) {
			const terminal = recognizePiParticipantTerminal({
				toolName: event.toolName,
				isError: event.isError,
				details: event.details,
				agent: tracked.unit,
				task: tracked.task,
			});
			completeSddParticipantCall(
				ctx.cwd,
				sddPreflightSessionKey(ctx),
				event.toolCallId,
				terminal,
			);
		}
		try {
			const report = acceptTrackedScoutResult(
				scoutTracking,
				event.toolCallId,
				event.details,
				event.isError,
				ctx.cwd,
			);
			if (report) return {
				isError: false,
				content: [{ type: "text", text: JSON.stringify(report) }],
			};
		} catch (error) {
			return {
				isError: true,
				content: [{
					type: "text",
					text: error instanceof Error
						? error.message
						: "ein-scout contract: validation failed",
				}],
			};
		}
		const snapshot = phaseSnapshotByToolCall.get(event.toolCallId);
		phaseSnapshotByToolCall.delete(event.toolCallId);
		if (!snapshot || !event.isError) return undefined;
		const result = reconcilePhaseFailure(
			ctx.cwd,
			snapshot.phase,
			snapshot.before,
		);
		if (!result.reconciled) return undefined;
		const originalError = event.content
			.map((part) => (part.type === "text" ? part.text : ""))
			.join("\n");
		return {
			isError: false,
			content: [{
				type: "text",
				text: formatReconciliation(result, originalError),
			}],
		};
	});

	return { rememberPhaseSnapshot };
}
