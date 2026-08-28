import { createHash } from "node:crypto";

export type EvidenceValue = boolean | "unknown";
export type IntentActivation = "read-only" | "modifying" | "unknown";
export type DeclaredIntentLane = "standard" | "micro";

export interface IntentDecisionEvidence {
  activation: IntentActivation;
  declaredLane: DeclaredIntentLane | null;
  bounded: EvidenceValue;
  mechanical: EvidenceValue;
  documentationOrTextOnly: EvidenceValue;
  introducesBehavior: EvidenceValue;
  securityRisk: EvidenceValue;
  persistentDataRisk: EvidenceValue;
  destructiveActionRisk: EvidenceValue;
  bypassRequested: boolean;
}

export const INTENT_REASON_CODES = {
  unambiguousReadOnly: "unambiguous-read-only",
  activationUncertain: "activation-uncertain",
  declaredStandard: "declared-standard",
  declaredMicro: "declared-micro",
  explicitBypass: "explicit-bypass",
  securityRisk: "security-risk",
  persistentDataRisk: "persistent-data-risk",
  destructiveActionRisk: "destructive-action-risk",
  newBehavior: "new-behavior",
  classificationUncertain: "classification-uncertain",
  boundedMechanicalNonBehavioral: "bounded-mechanical-non-behavioral",
  boundedDocumentationOrText: "bounded-documentation-or-text",
  notProvablySmall: "not-provably-small",
} as const;

export type IntentReasonCode =
  (typeof INTENT_REASON_CODES)[keyof typeof INTENT_REASON_CODES];

export type IntentDecisionResult =
  | {
      kind: "read-only";
      reason: typeof INTENT_REASON_CODES.unambiguousReadOnly;
    }
  | {
      kind: "intent";
      route: "normal" | "small";
      origin: "declared" | "classified" | "bypass";
      reason: Exclude<IntentReasonCode, typeof INTENT_REASON_CODES.unambiguousReadOnly>;
      bypassQuestions: boolean;
    };

export interface IntentBoundaries {
  in: string[];
  out: string[];
}

export interface IntentMaterial {
  objective: string;
  boundaries: IntentBoundaries;
  completionCriteria: string[];
}

export interface NormalizedIntentMaterial {
  objective: string;
  boundaries: IntentBoundaries;
  completionCriteria: string[];
}

const normalizeText = (value: string, slot: string): string => {
  if (typeof value !== "string") {
    throw new TypeError(`${slot} must be a string`);
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    throw new Error(`${slot} must not be empty`);
  }
  return normalized;
};

const normalizeList = (values: string[], slot: string): string[] => {
  if (!Array.isArray(values)) {
    throw new TypeError(`${slot} must be an array`);
  }

  const normalized = values.map((value, index) => normalizeText(value, `${slot}[${index}]`));
  return [...new Set(normalized)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
};

export const normalizeIntentMaterial = (
  material: IntentMaterial,
): NormalizedIntentMaterial => {
  if (!material || typeof material !== "object") {
    throw new TypeError("intent material must be an object");
  }
  if (!material.boundaries || typeof material.boundaries !== "object") {
    throw new TypeError("boundaries must be an object");
  }

  const boundaries = {
    in: normalizeList(material.boundaries.in, "boundaries.in"),
    out: normalizeList(material.boundaries.out, "boundaries.out"),
  };
  if (boundaries.in.length === 0 && boundaries.out.length === 0) {
    throw new Error("boundaries must not be empty");
  }

  const completionCriteria = normalizeList(
    material.completionCriteria,
    "completionCriteria",
  );
  if (completionCriteria.length === 0) {
    throw new Error("completionCriteria must not be empty");
  }

  return {
    objective: normalizeText(material.objective, "objective"),
    boundaries,
    completionCriteria,
  };
};

export const createIntentMaterialKey = (material: IntentMaterial): string => {
  const canonicalJson = JSON.stringify(normalizeIntentMaterial(material));
  return `sha256:${createHash("sha256").update(canonicalJson).digest("hex")}`;
};

const protectedRisks = (
  evidence: IntentDecisionEvidence,
): readonly EvidenceValue[] => [
  evidence.securityRisk,
  evidence.persistentDataRisk,
  evidence.destructiveActionRisk,
];

type ProtectedRiskReason =
  | typeof INTENT_REASON_CODES.securityRisk
  | typeof INTENT_REASON_CODES.persistentDataRisk
  | typeof INTENT_REASON_CODES.destructiveActionRisk;

const firstProtectedRiskReason = (
  evidence: IntentDecisionEvidence,
): ProtectedRiskReason | null => {
  if (evidence.securityRisk === true) return INTENT_REASON_CODES.securityRisk;
  if (evidence.persistentDataRisk === true) return INTENT_REASON_CODES.persistentDataRisk;
  if (evidence.destructiveActionRisk === true) return INTENT_REASON_CODES.destructiveActionRisk;
  return null;
};

const hasUnknownClassificationEvidence = (evidence: IntentDecisionEvidence): boolean =>
  [
    evidence.bounded,
    evidence.mechanical,
    evidence.documentationOrTextOnly,
    evidence.introducesBehavior,
    ...protectedRisks(evidence),
  ].includes("unknown");

export const decideIntentPreflight = (
  evidence: IntentDecisionEvidence,
): IntentDecisionResult => {
  if (evidence.activation === "read-only") {
    return {
      kind: "read-only",
      reason: INTENT_REASON_CODES.unambiguousReadOnly,
    };
  }

  if (evidence.activation === "unknown") {
    return {
      kind: "intent",
      route: "normal",
      origin: "classified",
      reason: INTENT_REASON_CODES.activationUncertain,
      bypassQuestions: false,
    };
  }

  const bypassIsSafe = protectedRisks(evidence).every((risk) => risk === false);

  if (evidence.declaredLane) {
    const isSmall = evidence.declaredLane === "micro";
    return {
      kind: "intent",
      route: isSmall ? "small" : "normal",
      origin: "declared",
      reason: isSmall
        ? INTENT_REASON_CODES.declaredMicro
        : INTENT_REASON_CODES.declaredStandard,
      bypassQuestions: evidence.bypassRequested && bypassIsSafe,
    };
  }

  const protectedReason = firstProtectedRiskReason(evidence);
  if (protectedReason) {
    return {
      kind: "intent",
      route: "normal",
      origin: "classified",
      reason: protectedReason,
      bypassQuestions: false,
    };
  }

  if (evidence.bypassRequested && bypassIsSafe) {
    return {
      kind: "intent",
      route: "normal",
      origin: "bypass",
      reason: INTENT_REASON_CODES.explicitBypass,
      bypassQuestions: true,
    };
  }

  if (evidence.introducesBehavior === true) {
    return {
      kind: "intent",
      route: "normal",
      origin: "classified",
      reason: INTENT_REASON_CODES.newBehavior,
      bypassQuestions: false,
    };
  }

  if (hasUnknownClassificationEvidence(evidence)) {
    return {
      kind: "intent",
      route: "normal",
      origin: "classified",
      reason: INTENT_REASON_CODES.classificationUncertain,
      bypassQuestions: false,
    };
  }

  if (
    evidence.bounded === true &&
    evidence.introducesBehavior === false &&
    evidence.mechanical === true
  ) {
    return {
      kind: "intent",
      route: "small",
      origin: "classified",
      reason: INTENT_REASON_CODES.boundedMechanicalNonBehavioral,
      bypassQuestions: false,
    };
  }

  if (
    evidence.bounded === true &&
    evidence.introducesBehavior === false &&
    evidence.documentationOrTextOnly === true
  ) {
    return {
      kind: "intent",
      route: "small",
      origin: "classified",
      reason: INTENT_REASON_CODES.boundedDocumentationOrText,
      bypassQuestions: false,
    };
  }

  return {
    kind: "intent",
    route: "normal",
    origin: "classified",
    reason: INTENT_REASON_CODES.notProvablySmall,
    bypassQuestions: false,
  };
};

export interface MaterialThirdDecision {
  id: string;
  prompt: string;
  materialImpact: boolean;
  persistedValueAvailable: boolean;
  defaultAvailable: boolean;
}

export interface IntentQuestion {
  id: string;
  prompt: string;
}

export type IntentInteractionPlan =
  | {
      kind: "normal";
      presentation: "single-text-turn";
      questions: IntentQuestion[];
      text: string;
      requiresConfirmation: true;
    }
  | {
      kind: "small";
      lines: [string];
      awaitsResponse: false;
    };

export type IntentInteractionPlanInput =
  | {
      route: "normal";
      thirdDecision?: MaterialThirdDecision;
    }
  | {
      route: "small";
      restatement: string;
    };

const BASE_QUESTIONS: readonly IntentQuestion[] = [
  {
    id: "objective",
    prompt: "What outcome should this change achieve?",
  },
  {
    id: "boundaries-and-completion",
    prompt: "What is in and out of scope, and what proves the change is complete?",
  },
];

export const planIntentInteraction = (
  input: IntentInteractionPlanInput,
): IntentInteractionPlan => {
  if (input.route === "small") {
    return {
      kind: "small",
      lines: [normalizeText(input.restatement, "restatement")],
      awaitsResponse: false,
    };
  }

  const questions = BASE_QUESTIONS.map((question) => ({ ...question }));
  const third = input.thirdDecision;
  if (
    third?.materialImpact === true &&
    !third.persistedValueAvailable &&
    !third.defaultAvailable
  ) {
    questions.push({
      id: normalizeText(third.id, "thirdDecision.id"),
      prompt: normalizeText(third.prompt, "thirdDecision.prompt"),
    });
  }

  return {
    kind: "normal",
    presentation: "single-text-turn",
    questions,
    text: questions.map((question, index) => `${index + 1}. ${question.prompt}`).join("\n"),
    requiresConfirmation: true,
  };
};
