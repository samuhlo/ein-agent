import { describe, expect, test } from "bun:test";
import {
  evaluateSharedConfigUpdateAdvisor,
  type AdvisorInput,
} from "../shared/contracts/shared-config-update-advisor.ts";

// `satisfies` and not an annotation: `AdvisorInput.update` is optional, so
// annotating erases the literal's known shape and every spread below breaks.
const currentInput = {
  configuration: {
    mode: { status: "valid", source: "project", value: "solo", freshness: "current" },
    model: { status: "valid", source: "user", value: "configured", freshness: "current" },
  },
  update: {
    installed: { status: "valid", source: "installer-marker", version: "0.42.0", freshness: "current" },
    release: { status: "valid", source: "release-provider", version: "0.43.0", freshness: "current" },
    owner: { status: "valid", source: "installer-marker", owner: "installer", action: "update", actionId: "installer.update", freshness: "current" },
    capability: { status: "valid", source: "installer-capability", supported: true, freshness: "current" },
  },
} satisfies AdvisorInput;

describe("shared config update advisor contract", () => {
  test("normalizes current configuration and a fresh update handoff without executing it", () => {
    const result = evaluateSharedConfigUpdateAdvisor(currentInput);
    expect(result.configuration.status).toBe("current");
    expect(result.update.status).toBe("update-available");
    expect(result.update.freshness).toBe("current");
    expect(result.recommendation.kind).toBe("installer-handoff");
    expect(result.update).not.toHaveProperty("handoff");
    expect(result.handoff).toEqual({ owner: "installer", action: "update", actionId: "installer.update", performed: false });
    expect(JSON.stringify(result)).not.toMatch(/private|token|payload|exception|\x1b|\r/);
  });

  test("distinguishes current, incomplete, unavailable, unsupported, error, and stale facets", () => {
    const current = evaluateSharedConfigUpdateAdvisor({
      configuration: {
        mode: { status: "valid", source: "project", value: "solo", freshness: "current" },
        model: { status: "valid", source: "user", value: "configured", freshness: "current" },
      },
      update: {
        installed: { status: "valid", source: "installer-marker", version: "0.42.0", freshness: "current" },
        release: { status: "valid", source: "release-provider", version: "0.42.0", freshness: "current" },
        owner: { status: "valid", source: "installer-marker", owner: "installer", action: "update", actionId: "installer.update", freshness: "current" },
        capability: { status: "valid", source: "installer-capability", supported: true, freshness: "current" },
      },
    });
    expect(current.configuration.status).toBe("current");
    expect(current.update.status).toBe("current");

    const incomplete = evaluateSharedConfigUpdateAdvisor({ configuration: { mode: { status: "missing", source: "project", freshness: "current" }, model: { status: "missing", source: "user", freshness: "current" } }, update: {} });
    expect(incomplete.configuration.status).toBe("incomplete");
    expect(incomplete.update.status).toBe("unavailable");

    const unsupported = evaluateSharedConfigUpdateAdvisor({ configuration: { mode: { status: "unsupported", source: "project", freshness: "current" }, model: { status: "valid", source: "user", freshness: "current" } }, update: {} });
    expect(unsupported.configuration.status).toBe("unsupported");
  });

  test("fails closed on stale or unknown decisive evidence while preserving the other facet", () => {
    const stale = evaluateSharedConfigUpdateAdvisor({
      ...currentInput,
      update: {
        ...currentInput.update,
        release: { ...currentInput.update.release, freshness: "stale" },
      },
    });
    expect(stale.configuration.status).toBe("current");
    expect(stale.update.status).toBe("unavailable");
    expect(stale.update.reason).toBe("stale-evidence");
    expect(stale.handoff).toBeUndefined();

    const unknown = evaluateSharedConfigUpdateAdvisor({
      ...currentInput,
      update: {
        ...currentInput.update,
        release: { status: "unknown", source: "release-provider", freshness: "unknown" },
      },
    });
    expect(unknown.update.status).toBe("unavailable");
    expect(unknown.update.freshness).toBe("unknown");
  });

  test("fails closed on conflicting versions, owners, and stale project snapshots", () => {
    const regression = evaluateSharedConfigUpdateAdvisor({
      ...currentInput,
      update: {
        ...currentInput.update,
        release: { ...currentInput.update.release, version: "0.41.0" },
      },
    });
    expect(regression.update).toMatchObject({ status: "ambiguous", reason: "version-regression" });

    const ownerAmbiguous = evaluateSharedConfigUpdateAdvisor({
      ...currentInput,
      update: {
        ...currentInput.update,
        owner: { status: "valid", source: "installer-marker", owner: "ambiguous", freshness: "current" },
      },
    });
    expect(ownerAmbiguous.update).toMatchObject({ status: "ambiguous", reason: "ambiguous-evidence" });
    expect(ownerAmbiguous.handoff).toBeUndefined();

    const unsupportedCapability = evaluateSharedConfigUpdateAdvisor({
      ...currentInput,
      update: {
        ...currentInput.update,
        capability: { status: "valid", source: "installer-capability", supported: false, freshness: "current" },
      },
    });
    expect(unsupportedCapability.update).toMatchObject({ status: "unsupported", reason: "unsupported" });
    expect(unsupportedCapability.handoff).toBeUndefined();

    const unknownOwner = evaluateSharedConfigUpdateAdvisor({
      ...currentInput,
      update: {
        ...currentInput.update,
        owner: { status: "valid", source: "installer-marker", owner: "unknown", freshness: "current" },
      },
    });
    expect(unknownOwner.update).toMatchObject({ status: "unavailable", reason: "unknown-evidence" });

    const staleProject = evaluateSharedConfigUpdateAdvisor({
      ...currentInput,
      configuration: {
        ...currentInput.configuration,
        project: { status: "valid", source: "project-state", freshness: "stale", reason: "state-mismatch" },
      },
    });
    expect(staleProject.configuration).toMatchObject({ status: "unavailable", freshness: "stale", reason: "stale-evidence" });
    expect(staleProject.update.status).toBe("update-available");
  });

  test("bounds provenance and semantic output without private paths, payloads, controls, or secrets", () => {
    const result = evaluateSharedConfigUpdateAdvisor({
      configuration: {
        mode: { status: "error", source: "/private/\u001b[2Jconfig", reason: "token=secret\r", freshness: "unknown" },
        model: { status: "missing", source: "user", freshness: "current" },
      },
      update: {
        installed: { status: "missing", source: "installer-marker", freshness: "current" },
        release: { status: "error", source: "release-provider", reason: "payload=/private/raw\r", freshness: "unknown" },
        owner: { status: "ambiguous", source: "installer-marker", freshness: "current" },
        capability: { status: "unsupported", source: "installer-capability", supported: false, freshness: "current" },
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/private|secret|payload|token|\u001b|\r/);
    expect(result.configuration.provenance.length).toBeLessThanOrEqual(8);
  });

  test.each([
    [{ supported: undefined }, "unsupported"],
    [{ supported: false }, "unsupported"],
  ] as const)("fails closed when capability support is not proven (%o)", ({ supported }, status) => {
    const result = evaluateSharedConfigUpdateAdvisor({
      ...currentInput,
      update: {
        ...currentInput.update,
        capability: { status: "valid", source: "installer-capability", ...(supported === undefined ? {} : { supported }), freshness: "current" },
      },
    });
    expect(result.update.status).toBe(status);
    expect(result.handoff).toBeUndefined();
  });

  test.each([
    ["install", "installer.update"],
    ["update", "installer.install"],
  ] as const)("rejects action %s with mismatched action id %s", (action, actionId) => {
    const result = evaluateSharedConfigUpdateAdvisor({
      ...currentInput,
      update: {
        ...currentInput.update,
        owner: { status: "valid", source: "installer-marker", owner: "installer", action, actionId, freshness: "current" },
      },
    });
    expect(result.update).toMatchObject({ status: "ambiguous", reason: "ambiguous-owner" });
    expect(result.handoff).toBeUndefined();
  });

  test.each(["invalid", "unreadable", "error"] as const)("rejects non-successful owner status %s before comparing versions", (status) => {
    const result = evaluateSharedConfigUpdateAdvisor({
      ...currentInput,
      update: {
        ...currentInput.update,
        owner: { ...currentInput.update.owner, status },
      },
    });
    expect(result.update.status).not.toBe("update-available");
    expect(result.handoff).toBeUndefined();
  });

  test.each(["invalid", "unreadable", "error"] as const)("rejects non-successful capability status %s before comparing versions", (status) => {
    const result = evaluateSharedConfigUpdateAdvisor({
      ...currentInput,
      update: {
        ...currentInput.update,
        capability: { ...currentInput.update.capability, status },
      },
    });
    expect(result.update.status).not.toBe("update-available");
    expect(result.handoff).toBeUndefined();
  });

  test("normalizes external ownership as unsupported at equal versions", () => {
    const result = evaluateSharedConfigUpdateAdvisor({
      ...currentInput,
      update: {
        ...currentInput.update,
        release: { ...currentInput.update.release, version: currentInput.update.installed?.version },
        owner: { ...currentInput.update.owner, owner: "external" },
      },
    });
    expect(result.update).toMatchObject({ status: "unsupported", reason: "unsupported" });
    expect(result.handoff).toBeUndefined();
  });

  test("distinguishes normalization failures and is deterministic for equal inputs", () => {
    const invalid = evaluateSharedConfigUpdateAdvisor({
      configuration: {
        mode: { status: "invalid", source: "project", freshness: "current" },
        model: { status: "missing", source: "user", freshness: "current" },
      },
      update: {
        installed: { status: "invalid", source: "installer-marker", freshness: "current" },
        release: { status: "malformed", source: "release-provider", freshness: "current" },
        owner: { status: "ambiguous", source: "installer-marker", freshness: "current" },
        capability: { status: "unsupported", source: "installer-capability", supported: false, freshness: "current" },
      },
    });
    expect(invalid.configuration.status).toBe("error");
    expect(invalid.update.status).toBe("ambiguous");
    expect(invalid.recommendation.kind).not.toBe("installer-handoff");
    expect(JSON.stringify(invalid)).toBe(JSON.stringify(evaluateSharedConfigUpdateAdvisor({
      configuration: {
        mode: { status: "invalid", source: "project", freshness: "current" },
        model: { status: "missing", source: "user", freshness: "current" },
      },
      update: {
        installed: { status: "invalid", source: "installer-marker", freshness: "current" },
        release: { status: "malformed", source: "release-provider", freshness: "current" },
        owner: { status: "ambiguous", source: "installer-marker", freshness: "current" },
        capability: { status: "unsupported", source: "installer-capability", supported: false, freshness: "current" },
      },
    })));
  });
});
