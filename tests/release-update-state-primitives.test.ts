import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireRelease } from "../installer/src/core/acquisition.ts";
import { commitMarkerV2, migrateLegacyMarker, readMarkerV2 } from "../installer/src/core/marker-v2.ts";
import { createTransaction, recoverPendingTransaction, runUpdateTransaction } from "../installer/src/core/transaction.ts";
import { deriveArtifactId, type ArtifactId, type MarkerV1, type ResolvedRelease } from "../installer/src/core/release-types.ts";
import { fakeUpdateCaps } from "./helpers/fake-update-caps.ts";
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

const encoder = new TextEncoder();
const assetName = "ein-installer-linux-arm64";
const assetUrl = "https://github.com/samuhlo/ein-agent/releases/download/installer-v0.20.0/ein-installer-linux-arm64";
const checksumsUrl = "https://github.com/samuhlo/ein-agent/releases/download/installer-v0.20.0/checksums.txt";
const assetBytes = encoder.encode("verified-installer-bytes");
const assetDigest = createHash("sha256").update(assetBytes).digest("hex");

function createArtifactId(releaseTag: string, sha256: string): ArtifactId {
  const result = deriveArtifactId(releaseTag, sha256);
  if (!result.ok) throw new Error(`Invalid fixture artifact identity: ${result.error.message}`);
  return result.value;
}

const artifactId = createArtifactId("installer-v0.20.0", assetDigest);
const latestReleasesUrl = "https://api.github.com/repos/samuhlo/ein-agent/releases?per_page=30";

function candidatePayload(tag: string, options: { draft?: boolean; prerelease?: boolean } = {}): Record<string, unknown> {
  const assetUrl = `https://github.com/samuhlo/ein-agent/releases/download/${tag}/${assetName}`;
  const checksumsUrl = `https://github.com/samuhlo/ein-agent/releases/download/${tag}/checksums.txt`;
  return {
    tag_name: tag,
    html_url: `https://github.com/samuhlo/ein-agent/releases/tag/${tag}`,
    draft: options.draft ?? false,
    prerelease: options.prerelease ?? tag.slice("installer-v".length).includes("-"),
    assets: [
      { name: assetName, browser_download_url: assetUrl },
      { name: "checksums.txt", browser_download_url: checksumsUrl },
    ],
  };
}

function markerBytes(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

function transactionFixture(candidates: Record<string, unknown>[]): {
  caps: UpdateCaps;
  files: Map<string, Uint8Array>;
  requests: string[];
  journalWrites: Record<string, unknown>[];
  markerPath: string;
  journalPath: string;
  destinationPath: string;
  agentDir: string;
} {
  const dir = root();
  const markerPath = join(dir, ".ein-install.json");
  const journalPath = join(dir, ".ein-update-journal.json");
  const destinationPath = "/verified/ein";
  const agentDir = join(dir, "agent");
  mkdirSync(agentDir, { recursive: true });
  const files = new Map<string, Uint8Array>([
    [destinationPath, encoder.encode("previous-installer")],
    [markerPath, markerBytes({
      schemaVersion: 2,
      version: "0.20.0",
      releaseTag: "installer-v0.20.0",
      binaryVersion: "0.20.0",
      templateVersion: "0.20.0",
      installedAt: "2026-01-01T00:00:00.000Z",
      channel: "stable",
      owner: { type: "standalone" },
      artifactId: `installer-v0.20.0@sha256:${assetDigest}`,
      asset: { assetName, sha256: assetDigest },
    })],
  ]);
  const requests: string[] = [];
  const journalWrites: Record<string, unknown>[] = [];
  const caps = fakeUpdateCaps({
    files,
    http: { get: async (url) => {
      requests.push(url);
      if (url === latestReleasesUrl) return { status: 200, body: encoder.encode(JSON.stringify(candidates)), url, headers: {} };
      const selected = candidates.find((candidate) => candidate.tag_name === "installer-v1.2.0");
      const tag = typeof selected?.tag_name === "string" ? selected.tag_name : "installer-v1.2.0";
      const expectedAssetUrl = `https://github.com/samuhlo/ein-agent/releases/download/${tag}/${assetName}`;
      const expectedChecksumsUrl = `https://github.com/samuhlo/ein-agent/releases/download/${tag}/checksums.txt`;
      if (url === expectedAssetUrl) return { status: 200, body: assetBytes, url, headers: {} };
      if (url === expectedChecksumsUrl) return { status: 200, body: encoder.encode(`${assetDigest}  ${assetName}\n`), url, headers: {} };
      throw new Error(`Unexpected transaction URL: ${url}`);
    } },
  });
  const baseFs = caps.fs;
  const baseChild = caps.child;
  const baseTemplate = caps.template;
  return {
    caps: {
      ...caps,
      fs: {
        ...baseFs,
        writeFile(path, data) {
          if (path === journalPath || path.startsWith(`${journalPath}.`)) journalWrites.push(JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>);
          baseFs.writeFile(path, data);
        },
      },
      child: {
        ...baseChild,
        spawn: async (_command, args) => {
          if (args[0] === "--version") return { code: 0, stdout: "ein-installer 1.2.0\ntemplate-version 1.2.0\n" };
          const txId = args[0]?.slice("--ein-continuation=".length) ?? "";
          const releaseTag = args[1]?.slice("--ein-release=".length) ?? "";
          return { code: 0, stdout: JSON.stringify({ txId, releaseTag, binaryVersion: "1.2.0", templateVersion: "1.2.0", status: "ok" }) };
        },
      },
      template: {
        ...baseTemplate,
        async deploy(_binaryPath, target) {
          writeFileSync(join(target, "template-manifest.json"), JSON.stringify({ templateVersion: "1.2.0" }));
        },
        async readManifest(target) {
          const path = join(target, "template-manifest.json");
          return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as { templateVersion?: string } : null;
        },
      },
    },
    files,
    requests,
    journalWrites,
    markerPath,
    journalPath,
    destinationPath,
    agentDir,
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

  test("migrates coherent legacy evidence only when its digest can establish identity", () => {
    const markerPath = join(root(), ".ein-install.json");
    const caps = defaultUpdateCaps();
    const legacy: MarkerV1 = { version: "0.20.0", installedAt: "2026-01-01T00:00:00.000Z", channel: "stable" };
    expect(migrateLegacyMarker(legacy, { release: release(), binaryVersion: "0.19.0", templateVersion: "0.20.0", deployedTemplateVersion: "0.20.0", asset: { assetName: "ein-installer-linux-x64", sha256: assetDigest } }, { caps, markerPath }))
      .toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "coherence-unproven" }) }));
    const migrated = migrateLegacyMarker(legacy, { release: release(), binaryVersion: "0.20.0", templateVersion: "0.20.0", deployedTemplateVersion: "0.20.0", asset: { assetName: "ein-installer-linux-x64", sha256: assetDigest } }, { caps, markerPath });
    expect(migrated.ok).toBe(true);
    expect(readMarkerV2(caps, markerPath)).toEqual(expect.objectContaining({ schemaVersion: 2, version: "0.20.0", artifactId: "installer-v0.20.0@sha256:" + assetDigest, owner: { type: "standalone" } }));
  });

  test("allows metadata without identity through acquisition and derives identity after verified bytes", async () => {
    const files = new Map<string, Uint8Array>();
    const releaseUrl = "https://api.github.com/repos/samuhlo/ein-agent/releases/tags/installer-v0.20.0";
    const releasePayload = encoder.encode(JSON.stringify({
      tag_name: "installer-v0.20.0",
      html_url: "https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.20.0",
      draft: false,
      prerelease: false,
      assets: [
        { name: assetName, browser_download_url: assetUrl },
        { name: "checksums.txt", browser_download_url: checksumsUrl },
      ],
    }));
    const caps = fakeUpdateCaps({
      files,
      http: { get: async (url) => {
        if (url === releaseUrl) return { status: 200, body: releasePayload, url, headers: {} };
        if (url === assetUrl) return { status: 200, body: assetBytes, url, headers: {} };
        if (url === checksumsUrl) return { status: 200, body: encoder.encode(`${assetDigest}  ${assetName}\n`), url, headers: {} };
        throw new Error(`Unscripted URL: ${url}`);
      } },
    });
    const acquired = await acquireRelease({
      selector: { kind: "explicit", raw: "0.20.0", tag: "installer-v0.20.0" },
      platform: { os: "linux", arch: "arm64" },
      caps,
    });
    expect(acquired.ok).toBe(true);
    if (acquired.ok) {
      expect(acquired.value.release.identity).toEqual({ status: "verified", artifactId });
      expect(acquired.value.identity).toEqual({ status: "verified", artifactId });
      acquired.value.cleanup();
    }
  });

  test("acquires the highest eligible latest candidate and its own assets for each channel", async () => {
    const candidates = [
      candidatePayload("installer-v1.0.0"),
      candidatePayload("installer-v1.1.0-alpha.1", { prerelease: true }),
      candidatePayload("installer-v1.1.0"),
      candidatePayload("installer-v1.2.0-alpha.1", { prerelease: true }),
      candidatePayload("installer-v1.3.0-beta.1", { prerelease: true }),
      candidatePayload("installer-v1.3.0-rc.1", { prerelease: true }),
      candidatePayload("installer-v1.3.0-nightly.1", { prerelease: true }),
      candidatePayload("installer-v1.4.0", { draft: true }),
    ];

    const acquireLatest = async (channel: "stable" | "alpha", expectedTag: string, list = candidates) => {
      const requests: string[] = [];
      const expectedAssetUrl = `https://github.com/samuhlo/ein-agent/releases/download/${expectedTag}/${assetName}`;
      const expectedChecksumsUrl = `https://github.com/samuhlo/ein-agent/releases/download/${expectedTag}/checksums.txt`;
      const caps = fakeUpdateCaps({
        http: { get: async (url) => {
          requests.push(url);
          if (url === latestReleasesUrl) return { status: 200, body: encoder.encode(JSON.stringify(list)), url, headers: {} };
          if (url === expectedAssetUrl) return { status: 200, body: assetBytes, url, headers: {} };
          if (url === expectedChecksumsUrl) return { status: 200, body: encoder.encode(`${assetDigest}  ${assetName}\n`), url, headers: {} };
          throw new Error(`Unexpected selected asset request: ${url}`);
        } },
      });
      const result = await acquireRelease({ selector: { kind: "latest", raw: "latest" }, channel, platform: { os: "linux", arch: "arm64" }, caps });
      return { result, requests, expectedAssetUrl, expectedChecksumsUrl };
    };

    const stable = await acquireLatest("stable", "installer-v1.1.0");
    expect(stable.result.ok).toBe(true);
    if (stable.result.ok) {
      expect(stable.result.value.release.release.tag).toBe("installer-v1.1.0");
      expect(stable.result.value.release.identity).toEqual({ status: "verified", artifactId: createArtifactId("installer-v1.1.0", assetDigest) });
      stable.result.value.cleanup();
    }
    expect(stable.requests).toContain(latestReleasesUrl);
    expect(stable.requests).toContain(stable.expectedAssetUrl);
    expect(stable.requests).toContain(stable.expectedChecksumsUrl);
    for (const rejectedTag of ["installer-v1.2.0-alpha.1", "installer-v1.3.0-beta.1", "installer-v1.3.0-rc.1", "installer-v1.3.0-nightly.1"]) {
      expect(stable.requests).not.toContain(`https://github.com/samuhlo/ein-agent/releases/download/${rejectedTag}/${assetName}`);
    }

    const alpha = await acquireLatest("alpha", "installer-v1.2.0-alpha.1");
    expect(alpha.result.ok).toBe(true);
    if (alpha.result.ok) {
      expect(alpha.result.value.release.release.tag).toBe("installer-v1.2.0-alpha.1");
      expect(alpha.result.value.release.identity).toEqual({ status: "verified", artifactId: createArtifactId("installer-v1.2.0-alpha.1", assetDigest) });
      alpha.result.value.cleanup();
    }
    expect(alpha.requests).toContain(latestReleasesUrl);
    expect(alpha.requests).toContain(alpha.expectedAssetUrl);
    expect(alpha.requests).toContain(alpha.expectedChecksumsUrl);
    expect(alpha.requests).not.toContain("https://github.com/samuhlo/ein-agent/releases/download/installer-v1.1.0/ein-installer-linux-arm64");

    const finalOutranksSameVersionAlpha = await acquireLatest(
      "alpha",
      "installer-v1.1.0",
      [candidatePayload("installer-v1.1.0-alpha.1", { prerelease: true }), candidatePayload("installer-v1.1.0")],
    );
    expect(finalOutranksSameVersionAlpha.result.ok).toBe(true);
    if (finalOutranksSameVersionAlpha.result.ok) finalOutranksSameVersionAlpha.result.value.cleanup();
  });

  test("keeps explicit tags exact and uses the selected explicit assets", async () => {
    const tag = "installer-v2.0.0-alpha.1";
    const releaseUrl = `https://api.github.com/repos/samuhlo/ein-agent/releases/tags/${encodeURIComponent(tag)}`;
    const expectedAssetUrl = `https://github.com/samuhlo/ein-agent/releases/download/${tag}/${assetName}`;
    const expectedChecksumsUrl = `https://github.com/samuhlo/ein-agent/releases/download/${tag}/checksums.txt`;
    const requests: string[] = [];
    const caps = fakeUpdateCaps({
      http: { get: async (url) => {
        requests.push(url);
        if (url === releaseUrl) return { status: 200, body: encoder.encode(JSON.stringify(candidatePayload(tag, { prerelease: true }))), url, headers: {} };
        if (url === expectedAssetUrl) return { status: 200, body: assetBytes, url, headers: {} };
        if (url === expectedChecksumsUrl) return { status: 200, body: encoder.encode(`${assetDigest}  ${assetName}\n`), url, headers: {} };
        throw new Error(`Unexpected explicit acquisition request: ${url}`);
      } },
    });
    const explicit = await acquireRelease({ selector: { kind: "explicit", raw: "2.0.0-alpha.1", tag }, channel: "alpha", platform: { os: "linux", arch: "arm64" }, caps });
    expect(explicit.ok).toBe(true);
    if (explicit.ok) {
      expect(explicit.value.release.release.tag).toBe(tag);
      expect(explicit.value.release.identity).toEqual({ status: "verified", artifactId: createArtifactId(tag, assetDigest) });
      explicit.value.cleanup();
    }
    expect(requests).toContain(releaseUrl);
    expect(requests).toContain(expectedAssetUrl);
    expect(requests).not.toContain(latestReleasesUrl);
  });

  test("rejects invalid channels before any acquisition request", async () => {
    const invalidRequests: string[] = [];
    const invalid = await acquireRelease({
      selector: { kind: "latest", raw: "latest" },
      channel: "beta" as never,
      platform: { os: "linux", arch: "arm64" },
      caps: fakeUpdateCaps({ http: { get: async (url) => {
        invalidRequests.push(url);
        throw new Error(`Invalid channel attempted acquisition: ${url}`);
      } } }),
    });
    expect(invalid).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "invalid-channel" }) }));
    expect(invalidRequests).toEqual([]);
  });

  test("propagates explicit alpha through dry-run and local commit evidence while omitted channel stays stable", async () => {
    const dryRunCandidates = [
      candidatePayload("installer-v1.1.0"),
      candidatePayload("installer-v1.2.0-alpha.1", { prerelease: true }),
    ];
    const alphaDryRun = transactionFixture(dryRunCandidates);
    const alphaDry = await runUpdateTransaction({
      caps: alphaDryRun.caps,
      selector: { kind: "latest", raw: "latest" },
      platform: { os: "linux", arch: "arm64" },
      destinationPath: alphaDryRun.destinationPath,
      agentDir: alphaDryRun.agentDir,
      markerPath: alphaDryRun.markerPath,
      journalPath: alphaDryRun.journalPath,
      channel: "alpha",
      dryRun: true,
    });
    expect(alphaDry).toEqual(expect.objectContaining({ type: "dry-run", release: expect.objectContaining({ release: expect.objectContaining({ tag: "installer-v1.2.0-alpha.1" }) }) }));
    expect(alphaDryRun.requests).toContain(latestReleasesUrl);
    expect(alphaDryRun.files.get(alphaDryRun.markerPath)).toEqual(expect.any(Uint8Array));
    expect(alphaDryRun.journalWrites).toEqual([]);

    const stableDryRun = transactionFixture(dryRunCandidates);
    const stableDry = await runUpdateTransaction({
      caps: stableDryRun.caps,
      selector: { kind: "latest", raw: "latest" },
      platform: { os: "linux", arch: "arm64" },
      destinationPath: stableDryRun.destinationPath,
      agentDir: stableDryRun.agentDir,
      markerPath: stableDryRun.markerPath,
      journalPath: stableDryRun.journalPath,
      dryRun: true,
    });
    expect(stableDry).toEqual(expect.objectContaining({ type: "dry-run", release: expect.objectContaining({ release: expect.objectContaining({ tag: "installer-v1.1.0" }) }) }));

    const installCandidates = [
      candidatePayload("installer-v1.1.0"),
      candidatePayload("installer-v1.2.0-alpha.1", { prerelease: true }),
      candidatePayload("installer-v1.2.0"),
    ];
    const alphaInstall = transactionFixture(installCandidates);
    const alphaResult = await runUpdateTransaction({
      caps: alphaInstall.caps,
      selector: { kind: "latest", raw: "latest" },
      platform: { os: "linux", arch: "arm64" },
      destinationPath: alphaInstall.destinationPath,
      agentDir: alphaInstall.agentDir,
      markerPath: alphaInstall.markerPath,
      journalPath: alphaInstall.journalPath,
      channel: "alpha",
    });
    expect(alphaResult).toEqual(expect.objectContaining({ type: "updated" }));
    expect(JSON.parse(new TextDecoder().decode(alphaInstall.files.get(alphaInstall.markerPath)!))).toEqual(expect.objectContaining({ channel: "alpha" }));
    expect(readMarkerV2(alphaInstall.caps, alphaInstall.markerPath)).toEqual(expect.objectContaining({ channel: "alpha" }));
    expect(alphaInstall.journalWrites).toContainEqual(expect.objectContaining({ channel: "alpha" }));

    const stableInstall = transactionFixture(installCandidates);
    const stableResult = await runUpdateTransaction({
      caps: stableInstall.caps,
      selector: { kind: "latest", raw: "latest" },
      platform: { os: "linux", arch: "arm64" },
      destinationPath: stableInstall.destinationPath,
      agentDir: stableInstall.agentDir,
      markerPath: stableInstall.markerPath,
      journalPath: stableInstall.journalPath,
    });
    expect(stableResult).toEqual(expect.objectContaining({ type: "updated" }));
    expect(JSON.parse(new TextDecoder().decode(stableInstall.files.get(stableInstall.markerPath)!))).toEqual(expect.objectContaining({ channel: "stable" }));
    expect(readMarkerV2(stableInstall.caps, stableInstall.markerPath)).toEqual(expect.objectContaining({ channel: "stable" }));
    expect(stableInstall.journalWrites).toContainEqual(expect.objectContaining({ channel: "stable" }));
  });

  test("fails before local mutation when the effective channel has no eligible candidate", async () => {
    const fixture = transactionFixture([]);
    const markerBefore = fixture.files.get(fixture.markerPath);
    const binaryBefore = fixture.files.get(fixture.destinationPath);
    const failed = await runUpdateTransaction({
      caps: fixture.caps,
      selector: { kind: "latest", raw: "latest" },
      platform: { os: "linux", arch: "arm64" },
      destinationPath: fixture.destinationPath,
      agentDir: fixture.agentDir,
      markerPath: fixture.markerPath,
      journalPath: fixture.journalPath,
      channel: "alpha",
    });
    expect(failed).toEqual(expect.objectContaining({ type: "failed", stage: "acquiring-metadata" }));
    expect(fixture.requests).toEqual([latestReleasesUrl]);
    expect(fixture.files.get(fixture.markerPath)).toEqual(markerBefore);
    expect(fixture.files.get(fixture.destinationPath)).toEqual(binaryBefore);
    expect(fixture.journalWrites).toEqual([]);
  });

  test("rejects invalid or unavailable transaction channels before acquisition or mutation", async () => {
    const fixture = transactionFixture([]);
    const markerBefore = fixture.files.get(fixture.markerPath);
    const binaryBefore = fixture.files.get(fixture.destinationPath);
    const failed = await runUpdateTransaction({
      caps: fixture.caps,
      selector: { kind: "latest", raw: "latest" },
      platform: { os: "linux", arch: "arm64" },
      destinationPath: fixture.destinationPath,
      agentDir: fixture.agentDir,
      markerPath: fixture.markerPath,
      journalPath: fixture.journalPath,
      channel: "unavailable" as never,
    });
    expect(failed).toEqual(expect.objectContaining({ type: "failed", stage: "resolving" }));
    expect(fixture.requests).toEqual([]);
    expect(fixture.files.get(fixture.markerPath)).toEqual(markerBefore);
    expect(fixture.files.get(fixture.destinationPath)).toEqual(binaryBefore);
    expect(fixture.journalWrites).toEqual([]);
  });

  test("blocks identity disagreement before marker mutation and preserves both channels", () => {
    const markerPath = join(root(), ".ein-install.json");
    const files = new Map<string, Uint8Array>();
    const caps = fakeUpdateCaps({ files });
    const before = markerBytes({ legacy: "untouched" });
    files.set(markerPath, before);
    const blocked = commitMarkerV2({ release: release(), binaryVersion: "0.20.0", templateVersion: "0.20.0", owner: { type: "standalone" }, asset: { assetName, sha256: assetDigest }, artifactId: "installer-v0.20.0@sha256:" + "f".repeat(64), markerPath, caps });
    expect(blocked).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "identity-conflict" }) }));
    expect(files.get(markerPath)).toEqual(before);
    for (const invalid of [
      { release: { ...release(), release: { ...release().release, tag: "not-a-release-tag" } } as unknown as ResolvedRelease, asset: { assetName, sha256: assetDigest }, code: "invalid-release-tag" },
      { release: release(), asset: { assetName, sha256: "" }, code: "missing-digest" },
    ]) {
      const missing = commitMarkerV2({ release: invalid.release, binaryVersion: "0.20.0", templateVersion: "0.20.0", owner: { type: "standalone" }, asset: invalid.asset, markerPath, caps });
      expect(missing).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: invalid.code }) }));
      expect(files.get(markerPath)).toEqual(before);
    }

    for (const channel of ["stable", "alpha"] as const) {
      const committed = commitMarkerV2({ release: release(), binaryVersion: "0.20.0", templateVersion: "0.20.0", owner: { type: "standalone" }, asset: { assetName, sha256: assetDigest }, artifactId, channel, markerPath, caps });
      expect(committed).toEqual(expect.objectContaining({ ok: true, value: expect.objectContaining({ channel, artifactId }) }));
      expect(readMarkerV2(caps, markerPath)).toEqual(expect.objectContaining({ channel, artifactId }));
    }
  });

  test("rejects missing, conflicting, or malformed marker identity while leaving legacy evidence honest", () => {
    const markerPath = join(root(), ".ein-install.json");
    const files = new Map<string, Uint8Array>();
    const caps = fakeUpdateCaps({ files });
    const committed = commitMarkerV2({ release: release(), binaryVersion: "0.20.0", templateVersion: "0.20.0", owner: { type: "standalone" }, asset: { assetName, sha256: assetDigest }, artifactId, markerPath, caps });
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    const valid = JSON.parse(new TextDecoder().decode(files.get(markerPath)!)) as Record<string, unknown>;
    for (const mutation of [
      (value: Record<string, unknown>) => { delete value.artifactId; },
      (value: Record<string, unknown>) => { value.artifactId = "installer-v0.20.0@sha256:" + "f".repeat(64); },
      (value: Record<string, unknown>) => { value.asset = { assetName, sha256: "not-a-digest" }; },
      (value: Record<string, unknown>) => { value.asset = { assetName, sha256: assetDigest.toUpperCase() }; },
    ]) {
      const malformed = structuredClone(valid) as Record<string, unknown>;
      mutation(malformed);
      files.set(markerPath, markerBytes(malformed));
      expect(readMarkerV2(caps, markerPath)).toBeNull();
    }

    const legacy: MarkerV1 = { version: "0.20.0", installedAt: "2026-01-01T00:00:00.000Z", channel: "stable" };
    files.set(markerPath, markerBytes(legacy));
    const legacyRead = readMarkerV2(caps, markerPath);
    expect(legacyRead).toEqual(legacy);
    expect(legacyRead && "artifactId" in legacyRead).toBe(false);
  });

  test("fails closed when atomic marker read-back cannot prove the committed identity", () => {
    const markerPath = join(root(), ".ein-install.json");
    const base = defaultUpdateCaps();
    const caps: UpdateCaps = { ...base, fs: { ...base.fs, readFile: () => new TextEncoder().encode("{}") } };
    const committed = commitMarkerV2({ release: release(), binaryVersion: "0.20.0", templateVersion: "0.20.0", owner: { type: "standalone" }, asset: { assetName, sha256: assetDigest }, artifactId, markerPath, caps });
    expect(committed).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "read-back-failed" }) }));
  });

  test("persists local rollback evidence with explicit previous-none and successful outcome", async () => {
    const dir = root();
    const journalPath = join(dir, "backups", ".ein-update-journal.json");
    const managedTree = join(dir, "agent");
    const backupReference = join(dir, "backups", "template.snapshot");
    const tx = createTransaction({
      caps: defaultUpdateCaps(),
      target: "installer-v0.20.0",
      owner: { type: "standalone" },
      journalPath,
      evidence: {
        authority: "local",
        previousArtifactId: { status: "none" },
        attemptedArtifactId: { status: "present", artifactId },
        managedTree,
        backupReference,
      },
    });
    expect(tx.prepare({ binary: join(dir, "ein.backup"), template: backupReference }).ok).toBe(true);
    expect(JSON.parse(readFileSync(journalPath, "utf8"))).toMatchObject({
      authority: "local",
      previousArtifactId: { status: "none" },
      attemptedArtifactId: { status: "present", artifactId },
      managedTree,
      backupReference,
      state: "prepared",
      rollbackOutcome: { status: "not-attempted" },
    });

    expect((await tx.transition("binary-replaced", () => undefined, () => undefined)).ok).toBe(true);
    expect((await tx.rollback()).ok).toBe(true);
    expect(JSON.parse(readFileSync(journalPath, "utf8"))).toMatchObject({
      state: "recovery-succeeded",
      rollbackOutcome: { status: "succeeded" },
    });

    expect(await recoverPendingTransaction({ caps: defaultUpdateCaps(), journalPath })).toEqual({ ok: true, value: "clean" });
    expect(existsSync(journalPath)).toBe(false);
  });

  test("finalizes proven recovery after durable success and keeps cleanup failures fail-closed", async () => {
    const dir = root();
    const journalPath = join(dir, "journal.json");
    const base = defaultUpdateCaps();
    const tx = createTransaction({
      caps: base,
      target: "installer-v0.20.0",
      owner: { type: "standalone" },
      journalPath,
      evidence: {
        authority: "local",
        previousArtifactId: { status: "none" },
        attemptedArtifactId: { status: "present", artifactId },
        managedTree: join(dir, "agent"),
        backupReference: join(dir, "backup"),
      },
    });
    expect(tx.prepare({}).ok).toBe(true);
    expect((await tx.transition("binary-replaced", () => undefined, () => undefined)).ok).toBe(true);
    expect(await recoverPendingTransaction({ caps: base, journalPath, recover: () => true })).toEqual({ ok: true, value: "recovered" });
    expect(JSON.parse(readFileSync(journalPath, "utf8"))).toMatchObject({ state: "recovery-succeeded", rollbackOutcome: { status: "succeeded" } });

    let failCleanup = true;
    const cleanupCaps: UpdateCaps = {
      ...base,
      fs: {
        ...base.fs,
        removeFile(path) {
          if (path === journalPath && failCleanup) {
            failCleanup = false;
            throw new Error("cleanup unavailable");
          }
          base.fs.removeFile(path);
        },
      },
    };
    expect(await recoverPendingTransaction({ caps: cleanupCaps, journalPath })).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "journal-cleanup-failed" }) }));
    expect(JSON.parse(readFileSync(journalPath, "utf8"))).toMatchObject({ state: "recovery-succeeded", rollbackOutcome: { status: "succeeded" } });
    expect(await recoverPendingTransaction({ caps: cleanupCaps, journalPath })).toEqual({ ok: true, value: "clean" });
  });

  test("retains failed rollback and distinguishes missing previous evidence from previous-none", async () => {
    const dir = root();
    const journalPath = join(dir, "journal.json");
    const tx = createTransaction({
      caps: defaultUpdateCaps(),
      target: "installer-v0.20.0",
      owner: { type: "standalone" },
      journalPath,
      evidence: {
        authority: "local",
        previousArtifactId: { status: "missing", reason: "legacy marker has no verified artifactId" },
        attemptedArtifactId: { status: "present", artifactId },
        managedTree: join(dir, "agent"),
        backupReference: join(dir, "backup"),
      },
    });
    expect(tx.prepare({}).ok).toBe(true);
    expect((await tx.transition("binary-replaced", () => { throw new Error("transition failed"); }, () => { throw new Error("restore failed"); }))).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "rollback-failed" }) }));
    expect(JSON.parse(readFileSync(journalPath, "utf8"))).toMatchObject({
      previousArtifactId: { status: "missing" },
      rollbackOutcome: { status: "failed", message: "restore failed" },
    });
  });

  test("records explicit recovery outcome for an interrupted local transaction", async () => {
    const dir = root();
    const journalPath = join(dir, "journal.json");
    const tx = createTransaction({
      caps: defaultUpdateCaps(),
      target: "installer-v0.20.0",
      owner: { type: "standalone" },
      journalPath,
      evidence: {
        authority: "local",
        previousArtifactId: { status: "none" },
        attemptedArtifactId: { status: "present", artifactId },
        managedTree: join(dir, "agent"),
        backupReference: join(dir, "backup"),
      },
    });
    expect(tx.prepare({}).ok).toBe(true);
    expect((await tx.transition("binary-replaced", () => undefined, () => undefined)).ok).toBe(true);
    let observed: unknown;
    expect(await recoverPendingTransaction({
      caps: defaultUpdateCaps(),
      journalPath,
      recover: async (journal) => {
        observed = journal.rollbackOutcome;
        return journal.authority === "local";
      },
    })).toEqual({ ok: true, value: "recovered" });
    expect(observed).toEqual({ status: "attempted" });
    expect(JSON.parse(readFileSync(journalPath, "utf8"))).toMatchObject({
      authority: "local",
      state: "recovery-succeeded",
      rollbackOutcome: { status: "succeeded" },
    });
  });

  test("fails recovery closed when local rollback evidence is malformed or restoration is unproven", async () => {
    const dir = root();
    const journalPath = join(dir, "malformed-journal.json");
    const tx = createTransaction({
      caps: defaultUpdateCaps(),
      target: "installer-v0.20.0",
      owner: { type: "standalone" },
      journalPath,
      evidence: {
        authority: "local",
        previousArtifactId: { status: "missing", reason: "legacy marker has no verified artifactId" },
        attemptedArtifactId: { status: "present", artifactId },
        managedTree: join(dir, "agent"),
        backupReference: join(dir, "backup"),
      },
    });
    expect(tx.prepare({}).ok).toBe(true);
    const malformed = JSON.parse(readFileSync(journalPath, "utf8")) as Record<string, unknown>;
    delete malformed.backupReference;
    writeFileSync(journalPath, JSON.stringify(malformed));
    expect(await recoverPendingTransaction({ caps: defaultUpdateCaps(), journalPath, recover: () => true })).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "recovery-required" }) }));
    expect(existsSync(journalPath)).toBe(true);

    const failedPath = join(dir, "failed-recovery-journal.json");
    const failedTx = createTransaction({
      caps: defaultUpdateCaps(),
      target: "installer-v0.20.0",
      owner: { type: "standalone" },
      journalPath: failedPath,
      evidence: {
        authority: "local",
        previousArtifactId: { status: "none" },
        attemptedArtifactId: { status: "present", artifactId },
        managedTree: join(dir, "agent"),
        backupReference: join(dir, "backup"),
      },
    });
    expect(failedTx.prepare({}).ok).toBe(true);
    expect(await recoverPendingTransaction({ caps: defaultUpdateCaps(), journalPath: failedPath, recover: () => false })).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "recovery-required" }) }));
    expect(JSON.parse(readFileSync(failedPath, "utf8"))).toMatchObject({ rollbackOutcome: { status: "failed" } });
  });

  test("retains attempted and pending evidence while cleaning only a complete legacy journal", async () => {
    const dir = root();
    const base = defaultUpdateCaps();
    const evidence = {
      authority: "local" as const,
      previousArtifactId: { status: "none" } as const,
      attemptedArtifactId: { status: "present" as const, artifactId },
      managedTree: join(dir, "agent"),
      backupReference: join(dir, "backup"),
    };
    const attemptedPath = join(dir, "attempted-journal.json");
    const attemptedTx = createTransaction({ caps: base, target: "installer-v0.20.0", owner: { type: "standalone" }, journalPath: attemptedPath, evidence });
    expect(attemptedTx.prepare({}).ok).toBe(true);
    const attempted = JSON.parse(readFileSync(attemptedPath, "utf8")) as Record<string, unknown>;
    attempted.state = "binary-replaced";
    attempted.rollbackOutcome = { status: "attempted" };
    writeFileSync(attemptedPath, JSON.stringify(attempted));
    expect(await recoverPendingTransaction({ caps: base, journalPath: attemptedPath })).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "recovery-required" }) }));
    expect(JSON.parse(readFileSync(attemptedPath, "utf8"))).toMatchObject({ state: "binary-replaced", rollbackOutcome: { status: "attempted" } });

    const pendingPath = join(dir, "pending-journal.json");
    const pendingTx = createTransaction({ caps: base, target: "installer-v0.20.0", owner: { type: "standalone" }, journalPath: pendingPath, evidence });
    expect(pendingTx.prepare({}).ok).toBe(true);
    const pending = JSON.parse(readFileSync(pendingPath, "utf8")) as Record<string, unknown>;
    pending.pending = "binary-replaced";
    writeFileSync(pendingPath, JSON.stringify(pending));
    expect(await recoverPendingTransaction({ caps: base, journalPath: pendingPath })).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "recovery-required" }) }));
    expect(existsSync(pendingPath)).toBe(true);

    const completePath = join(dir, "complete-journal.json");
    let retainComplete = true;
    const completeCaps: UpdateCaps = {
      ...base,
      fs: {
        ...base.fs,
        removeFile(path) {
          if (path === completePath && retainComplete) {
            retainComplete = false;
            throw new Error("retain complete journal for recovery");
          }
          base.fs.removeFile(path);
        },
      },
    };
    const completeTx = createTransaction({ caps: completeCaps, target: "installer-v0.20.0", owner: { type: "standalone" }, journalPath: completePath, evidence });
    expect(completeTx.prepare({}).ok).toBe(true);
    for (const state of ["binary-replaced", "child-reexecuted", "template-deployed", "marker-committed", "validated"] as const) {
      expect((await completeTx.transition(state, () => undefined, () => undefined)).ok).toBe(true);
    }
    expect(completeTx.complete()).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "journal-cleanup-failed" }) }));
    expect(JSON.parse(readFileSync(completePath, "utf8"))).toMatchObject({ state: "complete" });
    expect(await recoverPendingTransaction({ caps: base, journalPath: completePath })).toEqual({ ok: true, value: "clean" });
  });
});
