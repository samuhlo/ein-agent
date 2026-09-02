// =============================================================================
// EIN ADVISORY TOOLS
// Registers the bounded SDD participant, Cleaner, and Architect tool surfaces.
// Their evidence and mutation policies remain in lib/ owners.
// =============================================================================

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	bindArchitectPlan,
	collectArchitectEvidence,
	validateArchitectPlan,
	type ArchitectEvidence,
	type BoundArchitectPlan,
} from "../../lib/architect-read-only.ts";
import {
	collectCleanerAuditEvidence,
	type CleanerAuditScope,
} from "../../lib/cleaner-audit-evidence.ts";
import type {
	CleanerBoundedMutationRequestV1,
	CleanerStateTransitionRecordV1,
	CleanerVerificationRecordV1,
} from "../../lib/cleaner-bounded-mutations.ts";
import {
	admitCleanerImprove,
	applyCleanerImprove,
	completeCleanerImprove,
} from "../../lib/cleaner-improve.ts";
import {
	cleanerEvidenceForModel,
	collectCleanerPassiveEvidence,
	ingestCleanerActiveEvidence,
	planCleanerActiveEvidence,
	type CleanerActiveEvidence,
	type CleanerActivePlan,
	type CleanerPassiveEvidence,
	type CleanerPlanInput,
} from "../../lib/cleaner-operational-evidence.ts";
import type { CleanerFindingV1 } from "../../lib/cleaner-read-only-audit.ts";
import { sddPreflightSessionKey } from "../../lib/sdd-preflight.ts";
import { planSddParticipants } from "../../lib/sdd-participants.ts";
import { isSafeChangeName } from "../../lib/sdd-router.ts";
import type { EinToolRegistrar } from "./ein-tool-registration.ts";

const areaSelectorSchema = {
	type: "object",
	properties: {
		kind: { type: "string", enum: ["file", "tree"] },
		path: {
			type: "string",
			minLength: 1,
			maxLength: 512,
			description: "Repository-relative path; never use '.', absolute paths, traversal, or globs.",
		},
	},
	required: ["kind", "path"],
	additionalProperties: false,
} as const;

const selectorScopeSchema = {
	type: "object",
	properties: {
		kind: { type: "string", enum: ["selectors"] },
		selectors: {
			type: "array",
			minItems: 1,
			maxItems: 32,
			items: areaSelectorSchema,
		},
	},
	required: ["kind", "selectors"],
	additionalProperties: false,
} as const;

const changedFilesScopeSchema = {
	type: "object",
	properties: { kind: { type: "string", enum: ["changed-files"] } },
	required: ["kind"],
	additionalProperties: false,
} as const;

const cleanerScopeSchema = {
	description: "Use exactly {kind:'changed-files'} or {kind:'selectors',selectors:[{kind:'file'|'tree',path:'relative/path'}]}.",
	oneOf: [changedFilesScopeSchema, selectorScopeSchema],
} as const;

type CleanerEvidenceState = {
	passive: CleanerPassiveEvidence;
	plan?: CleanerActivePlan;
	active?: CleanerActiveEvidence;
};

type ActiveEvidenceInput = {
	testArtifactPath: string;
	coverageArtifactPath?: string;
	binding?: import("../../lib/cleaner-test-evidence.ts").CleanerTestBinding;
};

const improveParameters = {
	type: "object",
	properties: {
		auditEvidence: { type: "object" },
		finding: { type: "object" },
		request: { type: "object" },
	},
	required: ["auditEvidence", "finding", "request"],
} as const;

/** Register the optional post-apply evidence and improvement tools. */
export function registerAdvisoryTools(registerEinTool: EinToolRegistrar): void {
	registerEinTool({
		name: "ein_sdd_participants",
		label: "Ein SDD Participants",
		description: "Attempt a best-effort advisory Cleaner/Architect pass after apply when enabled and return the next bounded participant task. Report unavailable or blocked audits honestly, then continue to sdd-verify; a source mutation invalidates freshness and must be verified.",
		parameters: {
			type: "object",
			properties: { change: { type: "string" } },
			required: ["change"],
		} as const,
		async execute(_id, params: { change: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			if (!isSafeChangeName(params.change)) {
				throw new Error("Invalid SDD change name.");
			}
			const plan = planSddParticipants(
				ctx.cwd,
				sddPreflightSessionKey(ctx),
				params.change,
			);
			return {
				content: [{ type: "text", text: JSON.stringify(plan) }],
				details: plan,
			};
		},
	});

	registerEinTool({
		name: "ein_cleaner_audit",
		label: "Ein Cleaner Audit Evidence",
		description: "Read-only deterministic evidence packet for a bounded existing-code Cleaner audit. Rejects invalid, root-wide, missing, oversized, symlinked, or empty scopes before semantic inspection.",
		parameters: {
			type: "object",
			properties: { scope: cleanerScopeSchema },
			required: ["scope"],
			additionalProperties: false,
		} as const,
		async execute(_id, params: { scope: CleanerAuditScope }, _signal, _onUpdate, ctx: ExtensionContext) {
			const evidence = collectCleanerAuditEvidence(ctx.cwd, params.scope);
			return {
				content: [{ type: "text", text: JSON.stringify(evidence) }],
				details: evidence,
			};
		},
	});

	const cleanerEvidence = new Map<string, CleanerEvidenceState>();
	const cleanerEvidenceKey = (stateRef: string, areaId: string): string =>
		`${stateRef}\0${areaId}`;

	registerEinTool({
		name: "ein_cleaner_evidence",
		label: "Ein Cleaner Evidence",
		description: "Collect bounded source, environment, complexity, and structural-duplication evidence for one exact current Audit state. Model content includes compact measured facts plus every admitted source file.",
		parameters: {
			type: "object",
			properties: { scope: cleanerScopeSchema },
			required: ["scope"],
			additionalProperties: false,
		} as const,
		async execute(_id, params: { scope: CleanerAuditScope }, _signal, _onUpdate, ctx: ExtensionContext) {
			const passive = collectCleanerPassiveEvidence(ctx.cwd, params.scope);
			cleanerEvidence.set(
				cleanerEvidenceKey(passive.stateRef, passive.areaId),
				{ passive },
			);
			return {
				content: [{ type: "text", text: cleanerEvidenceForModel(passive) }],
				details: passive,
			};
		},
	});

	registerEinTool({
		name: "ein_cleaner_active_evidence",
		label: "Ein Cleaner Active Evidence",
		description: "Plan exact test/coverage argv without execution, or ingest externally produced bound artifacts and derive CRAP. Requires passive evidence from the same session and state.",
		parameters: {
			type: "object",
			properties: {
				action: { type: "string", enum: ["plan", "ingest"] },
				stateRef: { type: "string" },
				areaId: { type: "string" },
				input: { type: "object" },
			},
			required: ["action", "stateRef", "areaId", "input"],
		} as const,
		async execute(_id, rawParams): Promise<{
			content: { type: "text"; text: string }[];
			details: CleanerActivePlan | CleanerActiveEvidence;
		}> {
			const params = rawParams as {
				action: "plan" | "ingest";
				stateRef: string;
				areaId: string;
				input: CleanerPlanInput | ActiveEvidenceInput;
			};
			const entry = cleanerEvidence.get(
				cleanerEvidenceKey(params.stateRef, params.areaId),
			);
			if (!entry) throw new Error("Cleaner passive evidence is missing or stale");
			if (params.action === "plan") {
				const plan = planCleanerActiveEvidence(
					entry.passive,
					params.input as CleanerPlanInput,
				);
				entry.plan = plan;
				return {
					content: [{
						type: "text",
						text: JSON.stringify({ stateRef: params.stateRef, test: plan.test, coverage: plan.coverage }),
					}],
					details: plan,
				};
			}
			if (!entry.plan) throw new Error("Cleaner active evidence plan is missing");
			const active = ingestCleanerActiveEvidence(
				entry.passive,
				entry.plan,
				params.input as ActiveEvidenceInput,
			);
			entry.active = active;
			return {
				content: [{ type: "text", text: cleanerEvidenceForModel(entry.passive, active) }],
				details: active,
			};
		},
	});

	registerEinTool({
		name: "ein_cleaner_improve_admit",
		label: "Ein Cleaner Improve Admit",
		description: "Validate a bounded behavior-preserving exact-replacement plan against fresh Cleaner Audit evidence without writing.",
		parameters: improveParameters,
		async execute(_id, params: {
			auditEvidence: ReturnType<typeof collectCleanerAuditEvidence>;
			finding: CleanerFindingV1;
			request: CleanerBoundedMutationRequestV1;
		}) {
			const outcome = admitCleanerImprove(params);
			return { content: [{ type: "text", text: JSON.stringify(outcome) }], details: outcome };
		},
	});

	registerEinTool({
		name: "ein_cleaner_improve_apply",
		label: "Ein Cleaner Improve Apply",
		description: "Apply one previously admissible exact replacement; returns verification-required or mutation-uncertain evidence and a bounded recovery source.",
		parameters: improveParameters,
		async execute(_id, params: {
			auditEvidence: ReturnType<typeof collectCleanerAuditEvidence>;
			finding: CleanerFindingV1;
			request: CleanerBoundedMutationRequestV1;
		}) {
			const outcome = applyCleanerImprove(params);
			return { content: [{ type: "text", text: JSON.stringify(outcome) }], details: outcome };
		},
	});

	registerEinTool({
		name: "ein_cleaner_improve_complete",
		label: "Ein Cleaner Improve Complete",
		description: "Assess completion using the resulting source state, focused verification record, and current project/router verification evidence.",
		parameters: {
			type: "object",
			properties: {
				transition: { type: "object" },
				verification: { type: ["object", "null"] },
			},
			required: ["transition", "verification"],
		} as const,
		async execute(_id, params: {
			transition: CleanerStateTransitionRecordV1;
			verification: CleanerVerificationRecordV1 | null;
		}, _signal, _onUpdate, ctx: ExtensionContext) {
			const outcome = completeCleanerImprove(
				ctx.cwd,
				params.transition,
				params.verification,
			);
			return { content: [{ type: "text", text: JSON.stringify(outcome) }], details: outcome };
		},
	});

	registerEinTool({
		name: "ein_architect_evidence",
		label: "Ein Architect Evidence",
		description: "Collect immutable read-only repository evidence for a bounded explicit Architect scope; graph evidence is unavailable unless an authoritative runtime contract exists.",
		parameters: {
			type: "object",
			properties: { scope: selectorScopeSchema },
			required: ["scope"],
			additionalProperties: false,
		} as const,
		async execute(_id, params: { scope: unknown }, _signal, _onUpdate, ctx: ExtensionContext) {
			const result = collectArchitectEvidence(ctx.cwd, params.scope);
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
		},
	});

	registerEinTool({
		name: "ein_architect_plan_bind",
		label: "Ein Architect Plan Bind",
		description: "Validate required architecture-plan shape and bind it to fresh scope, evidence, and repository state without writing.",
		parameters: {
			type: "object",
			properties: { evidence: { type: "object" }, plan: { type: "object" } },
			required: ["evidence", "plan"],
		} as const,
		async execute(_id, params: { evidence: object; plan: object }, _signal, _onUpdate, ctx: ExtensionContext) {
			const result = bindArchitectPlan(
				ctx.cwd,
				params.evidence as ArchitectEvidence,
				params.plan,
			);
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
		},
	});

	registerEinTool({
		name: "ein_architect_validate",
		label: "Ein Architect Validate",
		description: "Re-collect current evidence and admit a fresh, bound, in-scope plan for model consistency assessment; never executes the plan.",
		parameters: {
			type: "object",
			properties: { plan: { type: "object" } },
			required: ["plan"],
		} as const,
		async execute(_id, params: { plan: object }, _signal, _onUpdate, ctx: ExtensionContext) {
			const result = validateArchitectPlan(ctx.cwd, params.plan as BoundArchitectPlan);
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
		},
	});
}
