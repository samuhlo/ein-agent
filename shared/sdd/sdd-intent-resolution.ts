import {
	createIntentMaterialKey,
	decideIntentPreflight,
	normalizeIntentMaterial,
	planIntentInteraction,
	type DeclaredIntentLane,
	type IntentDecisionEvidence,
	type IntentInteractionPlan,
	type IntentMaterial,
	type MaterialThirdDecision,
} from "./sdd-intent-preflight.ts";
import type { SddIntentPreflightContext } from "./sdd-intent-preflight-context.ts";

export type { SddIntentPreflightContext } from "./sdd-intent-preflight-context.ts";

export type PreflightAuthor = "pi" | "claude";
export type SddIntentResolution = "confirmed" | "automatic-small" | "bypassed";
export type SddIntentRoute = "normal" | "small";
export type SddLaneOrigin = "declared" | "classified";

export type SddIntentRecord = Readonly<{
	version: 1;
	resolution: SddIntentResolution;
	route: SddIntentRoute;
	summary: string;
	objective: string;
	boundaries: Readonly<{ in: readonly string[]; out: readonly string[] }>;
	completionCriteria: readonly string[];
	materialKey: string;
	laneOrigin: SddLaneOrigin;
	reason: string;
	resolvedBy: PreflightAuthor;
	resolvedAt: string;
}>;

export type SddIntentMaterialPatch = Readonly<{
	objective?: string;
	boundaries?: Readonly<{ in?: readonly string[]; out?: readonly string[] }>;
	completionCriteria?: readonly string[];
}>;

export type SddIntentPreflightOutcome =
	| Readonly<{ kind: "read-only"; reason: string }>
	| Readonly<{ kind: "adopted"; intent: SddIntentRecord }>
	| Readonly<{
			kind: "pending";
			route: "normal";
			reason: "confirmation-required" | "material-change" | "material-uncertain";
			interaction: Extract<IntentInteractionPlan, { kind: "normal" }>;
		}>
	| Readonly<{
			kind: "resolved";
			route: SddIntentRoute;
			resolution: SddIntentResolution;
			persisted: boolean;
			intent: SddIntentRecord;
			interaction?: Extract<IntentInteractionPlan, { kind: "small" }>;
		}>;

export type SddIntentPreflightInput = Readonly<{
	change: string;
	evidence: IntentDecisionEvidence;
	summary: string;
	material?: SddIntentMaterialPatch;
	materialEvidence: "sufficient" | "uncertain";
	confirmed?: boolean;
	thirdDecision?: MaterialThirdDecision;
	resolvedBy?: PreflightAuthor;
}>;

export type SddIntentResolutionState = Readonly<{
	intent?: SddIntentRecord;
	declaredLane: DeclaredIntentLane | null;
}>;

export type SddIntentPersistenceOutcome =
	| Readonly<{ kind: "persisted" }>
	| Readonly<{ kind: "adopted"; intent: SddIntentRecord }>
	| Readonly<{ kind: "unpersisted" }>;

export type SddIntentResolutionDependencies = Readonly<{
	readState: (cwd: string, change: string) => SddIntentResolutionState;
	persistResolution: (
		cwd: string,
		change: string,
		intent: SddIntentRecord,
		observedMaterialKey: string | undefined,
	) => SddIntentPersistenceOutcome;
	now: () => string;
}>;

export type SddIntentPreflightCoordinator = Readonly<{
	resolve: (
		context: SddIntentPreflightContext,
		input: SddIntentPreflightInput,
	) => Promise<SddIntentPreflightOutcome>;
}>;

function materialFromRecord(intent: SddIntentRecord): IntentMaterial {
	return {
		objective: intent.objective,
		boundaries: { in: [...intent.boundaries.in], out: [...intent.boundaries.out] },
		completionCriteria: [...intent.completionCriteria],
	};
}

/** Applies only declared material slots; omitted slots inherit from the current intent. */
export function patchSddIntentMaterial(
	current: IntentMaterial | undefined,
	patch: SddIntentMaterialPatch,
): IntentMaterial {
	const objective = patch.objective ?? current?.objective;
	const boundaries = {
		in: [...(patch.boundaries?.in ?? current?.boundaries.in ?? [])],
		out: [...(patch.boundaries?.out ?? current?.boundaries.out ?? [])],
	};
	const completionCriteria = [
		...(patch.completionCriteria ?? current?.completionCriteria ?? []),
	];
	return normalizeIntentMaterial({
		objective: objective ?? "",
		boundaries,
		completionCriteria,
	});
}

function normalPending(
	reason: Extract<SddIntentPreflightOutcome, { kind: "pending" }>["reason"],
	thirdDecision?: MaterialThirdDecision,
): Extract<SddIntentPreflightOutcome, { kind: "pending" }> {
	const interaction = planIntentInteraction({
		route: "normal",
		...(thirdDecision ? { thirdDecision } : {}),
	});
	if (interaction.kind !== "normal") throw new Error("Normal intent plan expected");
	return { kind: "pending", route: "normal", reason, interaction };
}

async function resolveOnce(
	dependencies: SddIntentResolutionDependencies,
	context: SddIntentPreflightContext,
	input: SddIntentPreflightInput,
): Promise<SddIntentPreflightOutcome> {
	// Yield once so reentrant calls observe the in-flight resolution.
	await Promise.resolve();
	const observed = dependencies.readState(context.cwd, input.change);
	const existingIntent = observed.intent;
	const decision = decideIntentPreflight({
		...input.evidence,
		declaredLane: observed.declaredLane,
	});
	if (decision.kind === "read-only") return { kind: "read-only", reason: decision.reason };

	if (input.materialEvidence !== "sufficient") {
		return normalPending("material-uncertain", input.thirdDecision);
	}
	let material: IntentMaterial;
	try {
		material = patchSddIntentMaterial(
			existingIntent ? materialFromRecord(existingIntent) : undefined,
			input.material ?? {},
		);
	} catch {
		return normalPending("material-uncertain", input.thirdDecision);
	}
	const materialKey = createIntentMaterialKey(material);
	if (existingIntent?.materialKey === materialKey) {
		return { kind: "adopted", intent: existingIntent };
	}

	if (decision.route === "normal" && !decision.bypassQuestions && input.confirmed !== true) {
		return normalPending(existingIntent ? "material-change" : "confirmation-required", input.thirdDecision);
	}

	const interaction = decision.route === "small"
		? planIntentInteraction({ route: "small", restatement: input.summary })
		: undefined;
	if (interaction?.kind === "small") context.notify?.(interaction.lines[0]);
	const resolution: SddIntentResolution = decision.bypassQuestions
		? "bypassed"
		: decision.route === "small"
			? "automatic-small"
			: "confirmed";
	const intent: SddIntentRecord = {
		version: 1,
		resolution,
		route: decision.route,
		summary: input.summary.trim(),
		...material,
		materialKey,
		laneOrigin: observed.declaredLane ? "declared" : "classified",
		reason: decision.reason,
		resolvedBy: input.resolvedBy ?? "pi",
		resolvedAt: dependencies.now(),
	};
	const persisted = dependencies.persistResolution(
		context.cwd,
		input.change,
		intent,
		existingIntent?.materialKey,
	);
	if (persisted.kind === "adopted") {
		return { kind: "adopted", intent: persisted.intent };
	}
	return {
		kind: "resolved",
		route: decision.route,
		resolution,
		persisted: persisted.kind === "persisted",
		intent,
		...(interaction?.kind === "small" ? { interaction } : {}),
	};
}

export function createSddIntentPreflightCoordinator(
	dependencies: SddIntentResolutionDependencies,
): SddIntentPreflightCoordinator {
	const inFlight = new Map<string, Promise<SddIntentPreflightOutcome>>();
	return {
		resolve(context, input) {
			const key = `${context.sessionKey}\u0000${input.change}`;
			const current = inFlight.get(key);
			if (current) return current;
			const promise = resolveOnce(dependencies, context, input);
			inFlight.set(key, promise);
			const clear = () => {
				if (inFlight.get(key) === promise) inFlight.delete(key);
			};
			void promise.then(clear, clear);
			return promise;
		},
	};
}
