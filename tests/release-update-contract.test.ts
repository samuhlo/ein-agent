import { describe, expect, test } from "bun:test";
import { classifyOwnership, type MarkerV1, type MarkerV2 } from "../installer/src/core/release-types.ts";
import { isEligibleRelease, normalizeTag, parseSelector, resolveRecord } from "../installer/src/core/release-resolver.ts";
import { defaultUpdateCaps } from "../installer/src/core/update-caps.ts";
import { fakeUpdateCaps } from "./helpers/fake-update-caps.ts";
import { readInstallerUpdateEvidence } from "../installer/src/core/update-advisor-read.ts";

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

  test("reads bounded marker, release, ownership, capability, and freshness evidence without mutation", async () => {
    const markerPath = "/fake/.ein-install.json";
    const files = new Map([[markerPath, new TextEncoder().encode(JSON.stringify({
      schemaVersion: 2, version: "0.18.0", releaseTag: "installer-v0.18.0", binaryVersion: "0.18.0", templateVersion: "0.18.0",
      installedAt: "2026-01-01T00:00:00.000Z", channel: "stable", owner: { type: "standalone" }, asset: { assetName: "installer", sha256: "a".repeat(64) },
    }))]]);
    const baseCaps = fakeUpdateCaps({ files });
    let reads = 0;
    let writes = 0;
    let spawns = 0;
    const before = new Uint8Array(files.get(markerPath)!);
    const caps = {
      ...baseCaps,
      fs: {
        ...baseCaps.fs,
        readFile: (path: string) => { reads += 1; return baseCaps.fs.readFile(path); },
        writeFile: () => { writes += 1; },
      },
      child: { spawn: async () => { spawns += 1; return { code: 0, stdout: "" }; } },
    };
    const evidence = await readInstallerUpdateEvidence({ caps, markerPath, readRelease: async () => ({ ok: true, value: { ...release, tag: "installer-v0.19.0" } }) });
    expect(evidence).toMatchObject({
      installed: { status: "valid", owner: "installer", freshness: "current", version: "0.18.0" },
      release: { status: "valid", freshness: "current", version: "0.19.0" },
      owner: { owner: "installer", action: "update", actionId: "installer.update" },
      capability: { status: "valid", supported: true },
    });
    expect([...files.keys()]).toEqual([markerPath]);
    expect([...files.get(markerPath)!]).toEqual([...before]);
    expect(reads).toBeGreaterThan(0);
    expect(writes).toBe(0);
    expect(spawns).toBe(0);
  });
});
