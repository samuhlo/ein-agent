import { describe, expect, test } from "bun:test";
import {
  createIntentMaterialKey,
  decideIntentPreflight,
  normalizeIntentMaterial,
  planIntentInteraction,
  type IntentDecisionEvidence,
} from "../ein-pi/agent/lib/sdd-intent-preflight";

const completeSmallEvidence = (
  overrides: Partial<IntentDecisionEvidence> = {},
): IntentDecisionEvidence => ({
  activation: "modifying",
  declaredLane: null,
  bounded: true,
  mechanical: true,
  documentationOrTextOnly: false,
  introducesBehavior: false,
  securityRisk: false,
  persistentDataRisk: false,
  destructiveActionRisk: false,
  bypassRequested: false,
  ...overrides,
});

describe("intent material normalization", () => {
  test("canonical material normalizes whitespace, list order, and duplicates", () => {
    const normalized = normalizeIntentMaterial({
      objective: "  Keep   the router stable ",
      boundaries: {
        in: [" router  contract ", "tests", "tests"],
        out: [" persistence ", " adapters"],
      },
      completionCriteria: [" typecheck passes ", "focused   tests pass"],
    });

    expect(normalized).toEqual({
      objective: "Keep the router stable",
      boundaries: {
        in: ["router contract", "tests"],
        out: ["adapters", "persistence"],
      },
      completionCriteria: ["focused tests pass", "typecheck passes"],
    });
  });

  test("canonical material rejects an empty objective, boundaries, criteria, or list item", () => {
    const valid = {
      objective: "Keep the router stable",
      boundaries: { in: ["router"], out: [] },
      completionCriteria: ["focused tests pass"],
    };

    expect(() => normalizeIntentMaterial({ ...valid, objective: "  " })).toThrow();
    expect(() => normalizeIntentMaterial({ ...valid, boundaries: { in: [], out: [] } })).toThrow();
    expect(() => normalizeIntentMaterial({ ...valid, completionCriteria: [] })).toThrow();
    expect(() =>
      normalizeIntentMaterial({ ...valid, boundaries: { in: ["router", " "], out: [] } }),
    ).toThrow();
  });

  test("material key is deterministic for equivalent facts and changes with a material slot", () => {
    const first = {
      objective: "Keep the router stable",
      boundaries: { in: ["tests", "router"], out: ["persistence"] },
      completionCriteria: ["tests pass", "types pass"],
    };
    const paraphrasedFacts = {
      objective: "  Keep  the router stable ",
      boundaries: { in: ["router", "tests", "router"], out: [" persistence "] },
      completionCriteria: ["types pass", "tests pass"],
    };

    expect(createIntentMaterialKey(first)).toBe(createIntentMaterialKey(paraphrasedFacts));
    expect(createIntentMaterialKey(first)).toMatch(/^sha256:[a-f0-9]{64}$/);
    const key = createIntentMaterialKey(first);
    expect(createIntentMaterialKey({ ...first, objective: "Change the router" })).not.toBe(key);
    expect(
      createIntentMaterialKey({ ...first, boundaries: { in: ["router"], out: [] } }),
    ).not.toBe(key);
    expect(createIntentMaterialKey({ ...first, completionCriteria: ["tests pass"] })).not.toBe(
      key,
    );
  });
});

describe("intent activation, classification, lane, and bypass", () => {
  test("read-only activation bypasses the intent channel", () => {
    expect(decideIntentPreflight(completeSmallEvidence({ activation: "read-only" }))).toEqual({
      kind: "read-only",
      reason: "unambiguous-read-only",
    });
  });

  test("uncertain activation fails closed to normal", () => {
    expect(decideIntentPreflight(completeSmallEvidence({ activation: "unknown" }))).toMatchObject({
      kind: "intent",
      route: "normal",
      reason: "activation-uncertain",
      bypassQuestions: false,
    });
  });

  test("declared lane has precedence over classification evidence", () => {
    expect(
      decideIntentPreflight(
        completeSmallEvidence({ declaredLane: "standard", documentationOrTextOnly: true }),
      ),
    ).toMatchObject({ route: "normal", origin: "declared", reason: "declared-standard" });

    expect(
      decideIntentPreflight(
        completeSmallEvidence({
          declaredLane: "micro",
          securityRisk: true,
          introducesBehavior: true,
        }),
      ),
    ).toMatchObject({ route: "small", origin: "declared", reason: "declared-micro" });
  });

  test("classification permits only complete bounded mechanical or documentation evidence", () => {
    expect(decideIntentPreflight(completeSmallEvidence())).toMatchObject({
      route: "small",
      origin: "classified",
      reason: "bounded-mechanical-non-behavioral",
    });
    expect(
      decideIntentPreflight(
        completeSmallEvidence({ mechanical: false, documentationOrTextOnly: true }),
      ),
    ).toMatchObject({ route: "small", reason: "bounded-documentation-or-text" });
    expect(
      decideIntentPreflight(
        completeSmallEvidence({ mechanical: false, documentationOrTextOnly: false }),
      ),
    ).toMatchObject({ route: "normal", reason: "not-provably-small" });
  });

  test("new behavior, protected risks, and unknown evidence classify normal", () => {
    for (const [field, reason] of [
      ["introducesBehavior", "new-behavior"],
      ["securityRisk", "security-risk"],
      ["persistentDataRisk", "persistent-data-risk"],
      ["destructiveActionRisk", "destructive-action-risk"],
    ] as const) {
      expect(decideIntentPreflight(completeSmallEvidence({ [field]: true }))).toMatchObject({
        route: "normal",
        reason,
      });
    }

    expect(decideIntentPreflight(completeSmallEvidence({ bounded: "unknown" }))).toMatchObject({
      route: "normal",
      reason: "classification-uncertain",
    });
    expect(
      decideIntentPreflight(completeSmallEvidence({ documentationOrTextOnly: "unknown" })),
    ).toMatchObject({ route: "normal", reason: "classification-uncertain" });
  });

  test("explicit bypass skips questions only when every protected risk is known false", () => {
    expect(
      decideIntentPreflight(
        completeSmallEvidence({
          bypassRequested: true,
          mechanical: false,
          documentationOrTextOnly: false,
        }),
      ),
    ).toMatchObject({
      route: "normal",
      origin: "bypass",
      reason: "explicit-bypass",
      bypassQuestions: true,
    });

    for (const override of [
      { securityRisk: true as const },
      { persistentDataRisk: true as const },
      { destructiveActionRisk: true as const },
      { securityRisk: "unknown" as const },
    ]) {
      expect(
        decideIntentPreflight(
          completeSmallEvidence({ bypassRequested: true, ...override }),
        ),
      ).toMatchObject({ route: "normal", bypassQuestions: false });
    }
  });
});

describe("declarative interaction question plan", () => {
  test("normal plan contains two base questions in one text turn and confirmation", () => {
    const plan = planIntentInteraction({ route: "normal" });

    expect(plan).toMatchObject({
      kind: "normal",
      presentation: "single-text-turn",
      requiresConfirmation: true,
    });
    if (plan.kind !== "normal") throw new Error("expected normal plan");
    expect(plan.questions).toHaveLength(2);
    expect(plan.questions.map(({ id }) => id)).toEqual(["objective", "boundaries-and-completion"]);
    expect(plan.text).toContain("1.");
    expect(plan.text).toContain("2.");
  });

  test("third question is included only for a concrete unresolved material decision", () => {
    const eligible = planIntentInteraction({
      route: "normal",
      thirdDecision: {
        id: "delivery-shape",
        prompt: "Should completion include a migration?",
        materialImpact: true,
        persistedValueAvailable: false,
        defaultAvailable: false,
      },
    });
    const defaulted = planIntentInteraction({
      route: "normal",
      thirdDecision: {
        id: "tdd",
        prompt: "Which TDD stance applies?",
        materialImpact: true,
        persistedValueAvailable: false,
        defaultAvailable: true,
      },
    });
    const nonMaterial = planIntentInteraction({
      route: "normal",
      thirdDecision: {
        id: "lane",
        prompt: "Which lane applies?",
        materialImpact: false,
        persistedValueAvailable: false,
        defaultAvailable: false,
      },
    });

    if (
      eligible.kind !== "normal" ||
      defaulted.kind !== "normal" ||
      nonMaterial.kind !== "normal"
    ) {
      throw new Error("expected normal plans");
    }
    expect(eligible.questions).toHaveLength(3);
    expect(eligible.text).toContain("3. Should completion include a migration?");
    expect(defaulted.questions).toHaveLength(2);
    expect(nonMaterial.questions).toHaveLength(2);
  });

  test("small plan is one plain restatement line and never asks for a response", () => {
    const plan = planIntentInteraction({
      route: "small",
      restatement: "  Update   the bounded documentation text.  ",
    });

    expect(plan).toEqual({
      kind: "small",
      lines: ["Update the bounded documentation text."],
      awaitsResponse: false,
    });
  });
});
