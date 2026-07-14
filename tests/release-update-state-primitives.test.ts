import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitMarkerV2, migrateLegacyMarker, readMarkerV2 } from "../installer/src/core/marker-v2.ts";
import type { ResolvedRelease } from "../installer/src/core/release-types.ts";
import { deployEmbeddedTemplate, restoreTemplate, snapshotTemplate, validateDeployedManifest } from "../installer/src/core/template-transaction.ts";
import { defaultUpdateCaps, type UpdateCaps } from "../installer/src/core/update-caps.ts";

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "ein-release-state-primitives-"));
  roots.push(value);
  return value;
}

function release(): ResolvedRelease {
  return {
    selector: { kind: "explicit", raw: "0.20.0", tag: "installer-v0.20.0" },
    release: { tag: "installer-v0.20.0", htmlUrl: "https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.20.0", draft: false, prerelease: false, assets: [] },
  };
}

function capsWithTemplate(agentDir: string): UpdateCaps {
  const base = defaultUpdateCaps();
  return {
    ...base,
    template: {
      async deploy(binaryPath, target) {
        expect(binaryPath).toBe("/verified/ein");
        mkdirSync(join(target, "agents"), { recursive: true });
        writeFileSync(join(target, "agents", "new.md"), "new");
        writeFileSync(join(target, "template-manifest.json"), JSON.stringify({ templateVersion: "0.20.0" }));
      },
      async readManifest(target) {
        const path = join(target, "template-manifest.json");
        return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as { templateVersion?: string } : null;
      },
    },
  };
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("release update state primitives", () => {
  test("cleans managed paths before restoring the snapshot and preserves user state", async () => {
    const agentDir = join(root(), "agent");
    mkdirSync(join(agentDir, "agents"), { recursive: true });
    mkdirSync(join(agentDir, "skills", "downloaded"), { recursive: true });
    writeFileSync(join(agentDir, "agents", "old.md"), "old");
    writeFileSync(join(agentDir, "auth.json"), "secret");
    writeFileSync(join(agentDir, "skills", "downloaded", "user.md"), "user");
    const caps = capsWithTemplate(agentDir);
    const snapshot = snapshotTemplate({ agentDir, snapshotPath: join(root(), "snapshot"), caps });
    expect(snapshot.ok).toBe(true);
    expect((await deployEmbeddedTemplate({ binaryPath: "/verified/ein", agentDir, caps })).ok).toBe(true);
    expect(await validateDeployedManifest({ agentDir, expectedVersion: "0.20.0", caps })).toEqual({ ok: true, value: undefined });
    expect(existsSync(join(agentDir, "agents", "new.md"))).toBe(true);
    if (snapshot.ok) expect(restoreTemplate({ agentDir, snapshotPath: snapshot.value.path, caps }).ok).toBe(true);
    expect(existsSync(join(agentDir, "agents", "new.md"))).toBe(false);
    expect(readFileSync(join(agentDir, "agents", "old.md"), "utf8")).toBe("old");
    expect(readFileSync(join(agentDir, "auth.json"), "utf8")).toBe("secret");
    expect(readFileSync(join(agentDir, "skills", "downloaded", "user.md"), "utf8")).toBe("user");
    expect(await validateDeployedManifest({ agentDir, expectedVersion: "0.20.0", caps })).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "manifest-mismatch" }) }));
  });

  test("migrates a legacy marker only after executable and deployed template coherence", () => {
    const markerPath = join(root(), ".ein-install.json");
    const caps = defaultUpdateCaps();
    const legacy = { version: "0.20.0", installedAt: "2026-01-01T00:00:00.000Z", channel: "stable" };
    expect(migrateLegacyMarker(legacy, { release: release(), binaryVersion: "0.19.0", templateVersion: "0.20.0", deployedTemplateVersion: "0.20.0", asset: { assetName: "ein-installer-linux-x64", sha256: "abc" } }, { caps, markerPath }))
      .toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "coherence-unproven" }) }));
    const migrated = migrateLegacyMarker(legacy, { release: release(), binaryVersion: "0.20.0", templateVersion: "0.20.0", deployedTemplateVersion: "0.20.0", asset: { assetName: "ein-installer-linux-x64", sha256: "abc" } }, { caps, markerPath });
    expect(migrated.ok).toBe(true);
    expect(readMarkerV2(caps, markerPath)).toEqual(expect.objectContaining({ schemaVersion: 2, version: "0.20.0", owner: { type: "standalone" } }));
  });

  test("fails closed when atomic marker read-back cannot prove the committed identity", () => {
    const markerPath = join(root(), ".ein-install.json");
    const base = defaultUpdateCaps();
    const caps: UpdateCaps = { ...base, fs: { ...base.fs, readFile: () => new TextEncoder().encode("{}") } };
    const committed = commitMarkerV2({ release: release(), binaryVersion: "0.20.0", templateVersion: "0.20.0", owner: { type: "standalone" }, asset: { assetName: "ein-installer-linux-x64", sha256: "abc" }, markerPath, caps });
    expect(committed).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "read-back-failed" }) }));
  });
});
