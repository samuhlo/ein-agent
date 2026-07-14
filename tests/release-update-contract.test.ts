import { describe, expect, test } from "bun:test";
import { classifyOwnership, type MarkerV1, type MarkerV2 } from "../installer/src/core/release-types.ts";
import { isEligibleRelease, normalizeTag, parseSelector, resolveRecord } from "../installer/src/core/release-resolver.ts";
import { defaultUpdateCaps } from "../installer/src/core/update-caps.ts";
import { fakeUpdateCaps } from "./helpers/fake-update-caps.ts";

const release = {
  tag: "installer-v0.19.0" as const,
  htmlUrl: "https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.19.0",
  draft: false,
  prerelease: false,
  assets: [],
};

describe("release update contract", () => {
  test("normalizes no selector, latest, and equivalent stable spellings", () => {
    expect(parseSelector([])).toEqual({ ok: true, value: { kind: "latest", raw: "latest" } });
    expect(parseSelector(["latest"])).toEqual({ ok: true, value: { kind: "latest", raw: "latest" } });
    for (const input of ["0.19.0", "v0.19.0", "installer-v0.19.0"]) {
      expect(normalizeTag(input)).toEqual({ ok: true, value: "installer-v0.19.0" });
    }
  });

  test("rejects malformed selectors without a latest fallback", () => {
    for (const input of ["0", "0.19", "latest-rc1", "draft", "^0.19.0"]) {
      const result = parseSelector([input]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.stage).toBe("resolving");
    }
  });

  test("requires an explicit selector to match its exact release tag", () => {
    const selector = parseSelector(["0.20.0"]);
    expect(selector.ok).toBe(true);
    if (selector.ok) {
      const resolved = resolveRecord(selector.value, release);
      expect(resolved).toEqual({
        ok: false,
        error: expect.objectContaining({ stage: "resolving", code: "exact-tag-mismatch" }),
      });
    }
  });

  test("filters draft and prerelease records", () => {
    expect(isEligibleRelease(release)).toBe(true);
    expect(isEligibleRelease({ ...release, draft: true })).toBe(false);
    expect(isEligibleRelease({ ...release, prerelease: true })).toBe(false);
  });

  test("classifies ownership from metadata instead of install paths", () => {
    const legacy: MarkerV1 = { version: "0.18.0", installedAt: "2026-01-01", channel: "stable" };
    const external: MarkerV2 = {
      ...legacy,
      schemaVersion: 2,
      releaseTag: "installer-v0.18.0",
      binaryVersion: "0.18.0",
      templateVersion: "0.18.0",
      owner: { type: "package-manager", manager: "homebrew" },
      asset: { assetName: "ein-installer-darwin-arm64", sha256: "0".repeat(64) },
    };
    expect(classifyOwnership(legacy)).toEqual({ type: "legacy-standalone" });
    expect(classifyOwnership(external)).toEqual({ type: "package-manager", manager: "homebrew" });
    expect(classifyOwnership(null)).toEqual(expect.objectContaining({ type: "ownership-ambiguous" }));
  });

  test("constructs production and fake capabilities without test-only branches", () => {
    expect(defaultUpdateCaps().http.get).toBeFunction();
    expect(fakeUpdateCaps().child.spawn).toBeFunction();
  });
});
