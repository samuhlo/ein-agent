import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpdate } from "../installer/src/cli/update.ts";
import {
  EXIT_ALREADY_CURRENT,
  EXIT_BLOCKED_EXTERNAL_OWNER,
  EXIT_DRY_RUN,
  EXIT_FAILED,
  EXIT_UPDATED,
  renderOutcome,
} from "../installer/src/cli/result.ts";
import { deriveArtifactId, type ArtifactId, type ResolvedRelease, type UpdateOutcome } from "../installer/src/core/release-types.ts";
import { defaultUpdateCaps, type HttpResponse, type UpdateCaps } from "../installer/src/core/update-caps.ts";
import { fakeUpdateCaps } from "./helpers/fake-update-caps.ts";
import { bannerStatic, bannerVersionLabel, readBannerState, renderBanner } from "../installer/src/tui/banner.ts";
import { INSTALLER_VERSION } from "../installer/src/core/version.ts";
import { readInstallerUpdateEvidence } from "../installer/src/core/update-advisor-read.ts";
import {
  preferenceFilePath,
  readReleaseChannelPreference,
  writeReleaseChannelPreference,
} from "../installer/src/core/release-channel-preference.ts";
import { createTransaction, recoverPendingTransaction } from "../installer/src/core/transaction.ts";
function createArtifactId(releaseTag: string, sha256: string): ArtifactId {
  const result = deriveArtifactId(releaseTag, sha256);
  if (!result.ok) throw new Error(`Invalid fixture artifact identity: ${result.error.message}`);
  return result.value;
}

const roots: string[] = [];
const encoder = new TextEncoder();
const assetBytes = encoder.encode("verified-release-0.20.0");
const assetDigest = createHash("sha256").update(assetBytes).digest("hex");

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), "ein-release-cli-"));
  roots.push(dir);
  return dir;
}

function release(): ResolvedRelease {
  return {
    selector: { kind: "latest", raw: "latest" },
    release: { tag: "installer-v0.20.0", htmlUrl: "https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.20.0", draft: false, prerelease: false, assets: [] },
  };
}

function releaseResponse(): HttpResponse {
  return {
    status: 200,
    url: "https://api.github.com/repos/samuhlo/ein-agent/releases/latest",
    headers: {},
    body: encoder.encode(JSON.stringify({
      tag_name: "installer-v0.20.0",
      html_url: "https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.20.0",
      assets: [
        { name: "ein-installer-linux-x64", browser_download_url: "https://github.com/samuhlo/ein-agent/releases/download/installer-v0.20.0/ein-installer-linux-x64" },
        { name: "checksums.txt", browser_download_url: "https://github.com/samuhlo/ein-agent/releases/download/installer-v0.20.0/checksums.txt" },
      ],
    })),
  };
}

function updateHttp(requests: string[] = []): UpdateCaps["http"] {
  return {
    async get(url) {
      requests.push(url);
      if (url.includes("/releases?per_page=")) {
        const payload = JSON.parse(new TextDecoder().decode(releaseResponse().body));
        return { ...releaseResponse(), url, body: encoder.encode(JSON.stringify([payload])) };
      }
      if (url.endsWith("/releases/latest") || url.includes("/releases/tags/")) return releaseResponse();
      if (url.endsWith("checksums.txt")) return { status: 200, url, headers: {}, body: encoder.encode(`${assetDigest}  ein-installer-linux-x64\n`) };
      return { status: 200, url, headers: {}, body: assetBytes };
    },
  };
}

const alphaAssetBytes = encoder.encode("verified-release-0.21.0-alpha.1");
const alphaAssetDigest = createHash("sha256").update(alphaAssetBytes).digest("hex");

function alphaReleasePayload(): Record<string, unknown> {
  return {
    tag_name: "installer-v0.21.0",
    html_url: "https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.21.0",
    draft: false,
    prerelease: false,
    assets: [
      { name: "ein-installer-linux-x64", browser_download_url: "https://github.com/samuhlo/ein-agent/releases/download/installer-v0.21.0/ein-installer-linux-x64" },
      { name: "checksums.txt", browser_download_url: "https://github.com/samuhlo/ein-agent/releases/download/installer-v0.21.0/checksums.txt" },
    ],
  };
}

function alphaUpdateHttp(requests: string[] = []): UpdateCaps["http"] {
  return {
    async get(url) {
      requests.push(url);
      if (url.includes("/releases?per_page=")) {
        return { status: 200, url, headers: {}, body: encoder.encode(JSON.stringify([alphaReleasePayload()])) };
      }
      if (url.endsWith("checksums.txt")) return { status: 200, url, headers: {}, body: encoder.encode(`${alphaAssetDigest}  ein-installer-linux-x64\n`) };
      return { status: 200, url, headers: {}, body: alphaAssetBytes };
    },
  };
}

function legacyMarker(version: string, channel: "stable" | "alpha"): Uint8Array {
  return encoder.encode(JSON.stringify({
    version,
    installedAt: "2026-01-01T00:00:00.000Z",
    channel,
  }));
}

function marker(version = "0.19.0", owner: object = { type: "standalone" }): Uint8Array {
  return encoder.encode(JSON.stringify({
    schemaVersion: 2,
    version,
    releaseTag: `installer-v${version}`,
    binaryVersion: version,
    templateVersion: version,
    installedAt: "2026-01-01T00:00:00.000Z",
    channel: "stable",
    owner,
    artifactId: `installer-v${version}@sha256:${"a".repeat(64)}`,
    asset: { assetName: "ein-installer-linux-x64", sha256: "a".repeat(64) },
  }));
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("release update CLI", () => {
  test("formats every outcome with stable exit codes", () => {
    const resolved = release();
    const cases: Array<[UpdateOutcome, number, string]> = [
      [{ type: "updated", release: resolved }, EXIT_UPDATED, "Instalado verificado: v0.20.0"],
      [{ type: "already-current", release: resolved }, EXIT_ALREADY_CURRENT, "Ya está actualizado."],
      [{ type: "dry-run", release: resolved, owner: { type: "standalone" } }, EXIT_DRY_RUN, "no se modifico ningun archivo"],
      [{ type: "blocked-external-owner", owner: { type: "package-manager", manager: "homebrew" }, release: resolved }, EXIT_BLOCKED_EXTERNAL_OWNER, "homebrew"],
      [{ type: "failed", stage: "verifying", message: "checksum mismatch", selector: resolved.selector, release: resolved }, EXIT_FAILED, "verifying"],
    ];
    for (const [outcome, exitCode, text] of cases) {
      const rendered = renderOutcome(outcome);
      expect(rendered.exitCode).toBe(exitCode);
      expect(rendered.lines.join("\n")).toContain(text);
    }
  });

  test("dry-run resolves the requested release without acquiring or mutating", async () => {
    const markerPath = "/fake/marker.json";
    const files = new Map([[markerPath, marker()]]);
    const caps = fakeUpdateCaps({ files, http: updateHttp() });
    const output: string[] = [];
    const code = await runUpdate(["--dry-run", "0.20.0"], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir: "/fake/agent",
      markerPath,
      journalPath: "/fake/journal.json",
      destinationPath: "/fake/ein",
      interactive: false,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_DRY_RUN);
    expect(output.join("\n")).toContain("installer-v0.20.0");
    expect(output.join("\n")).toContain("Canal efectivo: stable");
    expect([...files.keys()]).toEqual([markerPath]);
  });

  test("updates an alpha v1 standalone installation through the verified transaction", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const clientDir = join(dir, "client");
    const destinationPath = join(dir, "ein");
    const markerPath = join(agentDir, ".ein-install.json");
    const journalPath = join(dir, "journal.json");
    const clientSettingsPath = join(clientDir, "settings.json");
    const clientSettings = encoder.encode('{"channel":"stable","unchanged":true}\n');
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(clientDir, { recursive: true });
    writeFileSync(destinationPath, "old-binary");
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, legacyMarker("0.19.0-alpha.1", "alpha"));
    writeFileSync(clientSettingsPath, clientSettings);
    expect(writeReleaseChannelPreference(dir, "stable")).toEqual({ status: "explicit", channel: "stable" });

    const requests: string[] = [];
    const base = defaultUpdateCaps();
    const caps: UpdateCaps = {
      ...base,
      http: alphaUpdateHttp(requests),
      child: {
        async spawn(_command, args) {
          if (args.some((arg) => arg.startsWith("--ein-continuation="))) {
            const txId = args.find((arg) => arg.startsWith("--ein-continuation="))!.split("=")[1]!;
            return { code: 0, stdout: JSON.stringify({ txId, releaseTag: "installer-v0.21.0", binaryVersion: "0.21.0", templateVersion: "0.21.0", status: "ok" }) };
          }
          return { code: 0, stdout: "ein-installer 0.21.0\ntemplate-version 0.21.0\n" };
        },
      },
      template: {
        async deploy(_binary, target) {
          writeFileSync(join(target, "template-manifest.json"), JSON.stringify({ templateVersion: "0.21.0" }));
        },
        async readManifest(target) {
          return JSON.parse(await Bun.file(join(target, "template-manifest.json")).text()) as { templateVersion?: string };
        },
      },
    };
    const output: string[] = [];
    const code = await runUpdate(["--channel", "alpha"], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      installationPath: dir,
      markerPath,
      journalPath,
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
      promote: () => ({ installer: { path: join(dir, "ein-install"), written: false }, app: { path: destinationPath, written: false, reason: "test" } }),
    });

    expect(code).toBe(EXIT_UPDATED);
    expect(requests[0]).toContain("/releases?per_page=30");
    expect(output.join("\n")).toContain("Preferencia de canal: persistida (alpha)");
    expect(output.join("\n")).toContain("Canal efectivo: alpha");
    expect(readReleaseChannelPreference(dir)).toEqual({ status: "explicit", channel: "alpha" });
    const installed = await Bun.file(markerPath).json() as Record<string, unknown>;
    expect(installed).toMatchObject({
      channel: "alpha",
      releaseTag: "installer-v0.21.0",
      artifactId: `installer-v0.21.0@sha256:${alphaAssetDigest}`,
    });
    const evidence = await readInstallerUpdateEvidence({
      caps,
      markerPath,
      installationPath: dir,
      readRelease: async () => ({ ok: true, value: { tag: "installer-v0.21.0", htmlUrl: "https://example.test/alpha", draft: false, prerelease: false, assets: [] } }),
    });
    expect(evidence.preference).toEqual({ status: "explicit", channel: "alpha" });
    expect(evidence.effectiveChannel).toBe("alpha");
    expect(evidence.installed.artifact).toEqual({ status: "verified", reason: "verified-marker-identity", artifactId: createArtifactId("installer-v0.21.0", alphaAssetDigest) });
    expect(new Uint8Array(await Bun.file(clientSettingsPath).arrayBuffer())).toEqual(clientSettings);
  });

  test("uses the agent directory as the preference fallback before an alpha dry-run", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const markerPath = join(agentDir, ".ein-install.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(markerPath, marker());
    expect(writeReleaseChannelPreference(agentDir, "alpha")).toEqual({ status: "explicit", channel: "alpha" });
    const base = defaultUpdateCaps();
    const requests: string[] = [];
    const caps: UpdateCaps = { ...base, http: alphaUpdateHttp(requests) };
    const output: string[] = [];

    const code = await runUpdate(["--dry-run"], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      markerPath,
      journalPath: join(dir, "journal.json"),
      destinationPath: join(dir, "ein"),
      interactive: false,
      write: (line) => output.push(line),
    });

    expect(code).toBe(EXIT_DRY_RUN);
    expect(requests[0]).toContain("/releases?per_page=30");
    expect(output.join("\n")).toContain("Canal efectivo: alpha");
  });

  test("previews an explicit alpha channel without changing the stable preference", async () => {
    const dir = root();
    const markerPath = "/fake/marker.json";
    expect(writeReleaseChannelPreference(dir, "stable")).toEqual({ status: "explicit", channel: "stable" });
    const requests: string[] = [];
    const caps = fakeUpdateCaps({ files: new Map([[markerPath, marker()]]), http: alphaUpdateHttp(requests) });
    const output: string[] = [];

    const code = await runUpdate(["--dry-run", "--channel", "alpha"], {
      caps,
      platform: { os: "linux", arch: "x64" },
      installationPath: dir,
      markerPath,
      journalPath: "/fake/journal.json",
      destinationPath: "/fake/ein",
      interactive: false,
      write: (line) => output.push(line),
    });

    expect(code).toBe(EXIT_DRY_RUN);
    expect(requests[0]).toContain("/releases?per_page=30");
    expect(output.join("\n")).toContain("Preferencia de canal: persistida (stable)");
    expect(output.join("\n")).toContain("Canal efectivo: alpha");
    expect(readReleaseChannelPreference(dir)).toEqual({ status: "explicit", channel: "stable" });
  });

  test("rejects malformed channel flags before treating them as release selectors", async () => {
    const cases = [
      { args: ["--channel"], message: "--channel necesita un valor separado" },
      { args: ["--channel", "alpha", "--channel", "stable"], message: "--channel no puede repetirse" },
      { args: ["--channel=alpha"], message: "--channel usa un valor separado" },
      { args: ["--channel", "beta"], message: "canal no soportado: beta" },
    ];

    for (const fixture of cases) {
      let httpCalls = 0;
      const output: string[] = [];
      const caps = fakeUpdateCaps({ http: { get: async () => { httpCalls += 1; throw new Error("must not acquire"); } } });
      const code = await runUpdate(fixture.args, {
        caps,
        markerPath: "/fake/marker.json",
        journalPath: "/fake/journal.json",
        destinationPath: "/fake/ein",
        interactive: false,
        write: (line) => output.push(line),
      });

      expect(code).toBe(EXIT_FAILED);
      expect(output.join("\n")).toContain(fixture.message);
      expect(httpCalls).toBe(0);
    }
  });

  test("repairs a malformed preference after an explicit successful channel selection", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(agentDir, ".ein-install.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(destinationPath, assetBytes);
    chmodSync(destinationPath, 0o755);
    writeFileSync(join(agentDir, "template-manifest.json"), JSON.stringify({ templateVersion: "0.20.0" }));
    writeFileSync(markerPath, JSON.stringify({
      schemaVersion: 2, version: "0.20.0", releaseTag: "installer-v0.20.0", binaryVersion: "0.20.0", templateVersion: "0.20.0",
      installedAt: "2026-01-01T00:00:00.000Z", channel: "stable", owner: { type: "standalone" }, artifactId: `installer-v0.20.0@sha256:${assetDigest}`, asset: { assetName: "ein-installer-linux-x64", sha256: assetDigest },
    }));
    writeFileSync(preferenceFilePath(dir), '{"channel":"alpha"', "utf8");
    const base = defaultUpdateCaps();
    const caps: UpdateCaps = {
      ...base,
      http: updateHttp(),
      child: { spawn: async () => ({ code: 0, stdout: "ein-installer 0.20.0\ntemplate-version 0.20.0\n" }) },
    };
    const output: string[] = [];

    const code = await runUpdate(["--channel", "stable"], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      installationPath: dir,
      markerPath,
      journalPath: join(dir, "journal.json"),
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
      promote: () => ({ installer: { path: join(dir, "ein-install"), written: false }, app: { path: destinationPath, written: false, reason: "test" } }),
    });

    expect(code).toBe(EXIT_ALREADY_CURRENT);
    expect(output.join("\n")).toContain("Preferencia de canal: persistida (stable)");
    expect(output.join("\n")).toContain("Canal efectivo: stable");
    expect(readReleaseChannelPreference(dir)).toEqual({ status: "explicit", channel: "stable" });
  });

  test("does not persist an explicit channel after a failed update", async () => {
    const dir = root();
    const markerPath = "/fake/marker.json";
    expect(writeReleaseChannelPreference(dir, "stable")).toEqual({ status: "explicit", channel: "stable" });
    const caps = fakeUpdateCaps({
      files: new Map([[markerPath, marker()]]),
      http: { get: async () => { throw new Error("offline"); } },
    });
    const output: string[] = [];

    const code = await runUpdate(["--channel", "alpha"], {
      caps,
      installationPath: dir,
      markerPath,
      journalPath: "/fake/journal.json",
      destinationPath: "/fake/ein",
      interactive: false,
      write: (line) => output.push(line),
    });

    expect(code).toBe(EXIT_FAILED);
    expect(output.join("\n")).toContain("Canal efectivo: alpha");
    expect(readReleaseChannelPreference(dir)).toEqual({ status: "explicit", channel: "stable" });
  });

  test("does not persist an explicit channel when an external owner blocks the update", async () => {
    const dir = root();
    const markerPath = "/fake/marker.json";
    expect(writeReleaseChannelPreference(dir, "stable")).toEqual({ status: "explicit", channel: "stable" });
    const caps = fakeUpdateCaps({
      files: new Map([[markerPath, marker("0.19.0", { type: "package-manager", manager: "homebrew" })]]),
      http: alphaUpdateHttp(),
    });

    const code = await runUpdate(["--channel", "alpha"], {
      caps,
      platform: { os: "linux", arch: "x64" },
      installationPath: dir,
      markerPath,
      journalPath: "/fake/journal.json",
      destinationPath: "/fake/ein",
      interactive: false,
      write: () => {},
    });

    expect(code).toBe(EXIT_BLOCKED_EXTERNAL_OWNER);
    expect(readReleaseChannelPreference(dir)).toEqual({ status: "explicit", channel: "stable" });
  });

  test("reports an atomic preference write failure instead of claiming a channel switch", async () => {
    const dir = root();
    const blockedInstallationPath = join(dir, "not-a-directory");
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(agentDir, ".ein-install.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(blockedInstallationPath, "owned");
    writeFileSync(destinationPath, "old-binary");
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, marker());
    const base = defaultUpdateCaps();
    const caps: UpdateCaps = {
      ...base,
      http: updateHttp(),
      child: {
        async spawn(_command, args) {
          if (args.some((arg) => arg.startsWith("--ein-continuation="))) {
            const txId = args.find((arg) => arg.startsWith("--ein-continuation="))!.split("=")[1]!;
            return { code: 0, stdout: JSON.stringify({ txId, releaseTag: "installer-v0.20.0", binaryVersion: "0.20.0", templateVersion: "0.20.0", status: "ok" }) };
          }
          return { code: 0, stdout: "ein-installer 0.20.0\ntemplate-version 0.20.0\n" };
        },
      },
      template: {
        async deploy(_binary, target) {
          writeFileSync(join(target, "template-manifest.json"), JSON.stringify({ templateVersion: "0.20.0" }));
        },
        async readManifest(target) {
          return JSON.parse(await Bun.file(join(target, "template-manifest.json")).text()) as { templateVersion?: string };
        },
      },
    };
    const output: string[] = [];
    let promoted = false;
    let piRefreshed = false;

    const code = await runUpdate(["--yes", "--channel", "stable"], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir,
      installationPath: blockedInstallationPath,
      markerPath,
      journalPath: join(dir, "journal.json"),
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
      promote: () => {
        promoted = true;
        return { installer: { path: join(dir, "ein-install"), written: true }, app: { path: destinationPath, written: true } };
      },
      updatePi: async () => {
        piRefreshed = true;
        return { ok: true, detail: "pi actualizado" };
      },
    });

    expect(code).toBe(EXIT_FAILED);
    expect(output.join("\n")).toContain("Instalado verificado: v0.20.0");
    expect(output.join("\n")).toContain("Ein se actualizó, pero no se pudo guardar el canal stable");
    expect(output.join("\n")).not.toContain("No se confirmó una nueva instalación");
    expect(output.join("\n")).not.toContain("Preferencia de canal: persistida (stable)");
    expect(await Bun.file(markerPath).json()).toMatchObject({
      version: "0.20.0",
      releaseTag: "installer-v0.20.0",
    });
    expect(promoted).toBe(false);
    expect(piRefreshed).toBe(false);
  });

  test("fails closed before recovery or update when preference bytes are malformed", async () => {
    const dir = root();
    const markerPath = "/fake/marker.json";
    const journalPath = "/fake/journal.json";
    const markerBytes = marker();
    const journalBytes = encoder.encode("not-a-journal");
    writeFileSync(preferenceFilePath(dir), '{"channel":"alpha"', "utf8");
    let httpCalls = 0;
    const files = new Map([[markerPath, markerBytes], [journalPath, journalBytes]]);
    const caps = fakeUpdateCaps({
      files,
      http: { get: async () => { httpCalls += 1; throw new Error("must not acquire"); } },
    });
    const output: string[] = [];

    const code = await runUpdate([], {
      caps,
      installationPath: dir,
      markerPath,
      journalPath,
      destinationPath: "/fake/ein",
      interactive: false,
      write: (line) => output.push(line),
    });

    expect(code).toBe(EXIT_FAILED);
    expect(output.join("\n")).toContain("Actualizacion fallida en resolving");
    expect(output.join("\n")).not.toContain("recuperación");
    expect(httpCalls).toBe(0);
    expect(files.get(markerPath)).toEqual(markerBytes);
    expect(files.get(journalPath)).toEqual(journalBytes);
  });

  test("fails closed before recovery or update when preference storage is unreadable", async () => {
    const dir = root();
    const blockedPath = join(dir, "not-a-directory");
    writeFileSync(blockedPath, "owned");
    let httpCalls = 0;
    const caps = fakeUpdateCaps({ http: { get: async () => { httpCalls += 1; throw new Error("must not acquire"); } } });
    const output: string[] = [];

    const code = await runUpdate([], {
      caps,
      installationPath: blockedPath,
      markerPath: "/fake/marker.json",
      journalPath: "/fake/journal.json",
      destinationPath: "/fake/ein",
      interactive: false,
      write: (line) => output.push(line),
    });

    expect(code).toBe(EXIT_FAILED);
    expect(output.join("\n")).toContain("Actualizacion fallida en resolving");
    expect(httpCalls).toBe(0);
  });

  test("blocks an externally managed installation before binary replacement", async () => {
    const markerPath = "/fake/marker.json";
    const destinationPath = "/fake/ein";
    const files = new Map([[markerPath, marker("0.19.0", { type: "package-manager", manager: "homebrew" })], [destinationPath, encoder.encode("old")]]);
    const caps = fakeUpdateCaps({ files, http: updateHttp() });
    const output: string[] = [];
    const code = await runUpdate([], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir: "/fake/agent",
      markerPath,
      journalPath: "/fake/journal.json",
      destinationPath,
      interactive: false,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_BLOCKED_EXTERNAL_OWNER);
    expect(files.get(destinationPath)).toEqual(encoder.encode("old"));
    expect(output.join("\n")).toContain("homebrew");
  });

  test("reports invalid selectors and interrupted journals as non-success", async () => {
    const invalid: string[] = [];
    expect(await runUpdate(["0.20"], { interactive: false, write: (line) => invalid.push(line) })).toBe(EXIT_FAILED);
    expect(invalid.join("\n")).toContain("Solicitud: desconocida");

    const markerPath = "/fake/marker.json";
    const journalPath = "/fake/journal.json";
    const caps = fakeUpdateCaps({ files: new Map([[markerPath, marker()], [journalPath, encoder.encode("not-a-journal")]]) });
    const interrupted: string[] = [];
    expect(await runUpdate([], { caps, markerPath, journalPath, interactive: false, write: (line) => interrupted.push(line) })).toBe(EXIT_FAILED);
    expect(interrupted.join("\n")).toContain("recuperación");
  });

  test("does not block the next normal run after proven local recovery finalizes", async () => {
    const dir = root();
    const markerPath = join(dir, "marker.json");
    const journalPath = join(dir, "journal.json");
    const files = new Map([[markerPath, marker()]]);
    const caps = fakeUpdateCaps({ files, http: updateHttp() });
    const tx = createTransaction({
      caps,
      target: "installer-v0.20.0",
      owner: { type: "standalone" },
      journalPath,
      evidence: {
        authority: "local",
        previousArtifactId: { status: "none" },
        attemptedArtifactId: { status: "present", artifactId: createArtifactId("installer-v0.20.0", assetDigest) },
        managedTree: join(dir, "agent"),
        backupReference: join(dir, "backup"),
      },
    });
    expect(tx.prepare({}).ok).toBe(true);
    expect((await tx.transition("binary-replaced", () => undefined, () => undefined)).ok).toBe(true);
    expect(await recoverPendingTransaction({ caps, journalPath, recover: () => true })).toEqual({ ok: true, value: "recovered" });

    const output: string[] = [];
    const code = await runUpdate(["--dry-run"], {
      caps,
      platform: { os: "linux", arch: "x64" },
      agentDir: join(dir, "agent"),
      markerPath,
      journalPath,
      destinationPath: join(dir, "ein"),
      installationPath: dir,
      interactive: false,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_DRY_RUN);
    expect(output.join("\\n")).not.toContain("recuperación requerida");
    expect(files.has(journalPath)).toBe(false);
  });

  test("reports already-current only after marker, binary, template, and digest agree", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(agentDir, ".ein-install.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(destinationPath, assetBytes);
    chmodSync(destinationPath, 0o755);
    writeFileSync(join(agentDir, "template-manifest.json"), JSON.stringify({ templateVersion: "0.20.0" }));
    writeFileSync(markerPath, JSON.stringify({
      schemaVersion: 2, version: "0.20.0", releaseTag: "installer-v0.20.0", binaryVersion: "0.20.0", templateVersion: "0.20.0",
      installedAt: "2026-01-01T00:00:00.000Z", channel: "stable", owner: { type: "standalone" }, artifactId: `installer-v0.20.0@sha256:${assetDigest}`, asset: { assetName: "ein-installer-linux-x64", sha256: assetDigest },
    }));
    const base = defaultUpdateCaps();
    const caps: UpdateCaps = {
      ...base,
      http: updateHttp(),
      child: { spawn: async () => ({ code: 0, stdout: "ein-installer 0.20.0\ntemplate-version 0.20.0\n" }) },
    };
    const output: string[] = [];
    let promoted = "";
    const code = await runUpdate([], { caps, platform: { os: "linux", arch: "x64" }, agentDir, markerPath, journalPath: join(dir, "journal.json"), destinationPath, interactive: false, write: (line) => output.push(line), promote: (options) => { promoted = options.appArtifact; return { installer: { path: join(dir, "ein-install"), written: true }, app: { path: destinationPath, written: true } }; } });
    expect(code).toBe(EXIT_ALREADY_CURRENT);
    expect(output.join("\n")).toContain("Ya está actualizado.");
    expect(promoted).toBe(join(agentDir, "bin", "ein"));
  });

  test("returns a staged acquisition failure without mutation", async () => {
    const markerPath = "/fake/marker.json";
    const caps = fakeUpdateCaps({ files: new Map([[markerPath, marker()]]), http: { get: async () => { throw new Error("secret-token-ignored"); } } });
    const output: string[] = [];
    expect(await runUpdate([], { caps, markerPath, journalPath: "/fake/journal.json", destinationPath: "/fake/ein", interactive: false, write: (line) => output.push(line) })).toBe(EXIT_FAILED);
    expect(output.join("\n")).toContain("acquiring-metadata");
    expect(output.join("\n")).not.toContain("secret-token-ignored");
  });

  test("runs a verified success transaction entirely in a sandbox", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(agentDir, ".ein-install.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(destinationPath, "old-binary");
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, marker());
    const base = defaultUpdateCaps();
    const caps: UpdateCaps = {
      ...base,
      http: updateHttp(),
      child: {
        async spawn(_command, args) {
          if (args.some((arg) => arg.startsWith("--ein-continuation="))) {
            const txId = args.find((arg) => arg.startsWith("--ein-continuation="))!.split("=")[1]!;
            return { code: 0, stdout: JSON.stringify({ txId, releaseTag: "installer-v0.20.0", binaryVersion: "0.20.0", templateVersion: "0.20.0", status: "ok" }) };
          }
          return { code: 0, stdout: "ein-installer 0.20.0\ntemplate-version 0.20.0\n" };
        },
      },
      template: {
        async deploy(_binary, target) {
          writeFileSync(join(target, "template-manifest.json"), JSON.stringify({ templateVersion: "0.20.0" }));
        },
        async readManifest(target) {
          return JSON.parse(await Bun.file(join(target, "template-manifest.json")).text()) as { templateVersion?: string };
        },
      },
    };
    const output: string[] = [];
    const code = await runUpdate([], { caps, platform: { os: "linux", arch: "x64" }, agentDir, markerPath, journalPath, destinationPath, interactive: false, write: (line) => output.push(line) });
    expect(code).toBe(EXIT_UPDATED);
    expect(output.join("\n")).toContain("Instalado verificado: v0.20.0");
    expect(await Bun.file(markerPath).json()).toMatchObject({ schemaVersion: 2, version: "0.20.0" });
  });

  test("refreshes pi and declared packages after a successful update", async () => {
    const dir = root();
    const agentDir = join(dir, "agent");
    const destinationPath = join(dir, "ein");
    const markerPath = join(agentDir, ".ein-install.json");
    const journalPath = join(dir, "journal.json");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(destinationPath, "old-binary");
    chmodSync(destinationPath, 0o755);
    writeFileSync(markerPath, marker());
    const base = defaultUpdateCaps();
    const caps: UpdateCaps = {
      ...base,
      http: updateHttp(),
      child: {
        async spawn(_command, args) {
          if (args.some((arg) => arg.startsWith("--ein-continuation="))) {
            const txId = args.find((arg) => arg.startsWith("--ein-continuation="))!.split("=")[1]!;
            return { code: 0, stdout: JSON.stringify({ txId, releaseTag: "installer-v0.20.0", binaryVersion: "0.20.0", templateVersion: "0.20.0", status: "ok" }) };
          }
          return { code: 0, stdout: "ein-installer 0.20.0\ntemplate-version 0.20.0\n" };
        },
      },
      template: {
        async deploy(_binary, target) {
          writeFileSync(join(target, "template-manifest.json"), JSON.stringify({ templateVersion: "0.20.0" }));
        },
        async readManifest(target) {
          return JSON.parse(await Bun.file(join(target, "template-manifest.json")).text()) as { templateVersion?: string };
        },
      },
    };
    let piUpdated = 0;
    let packagesSynced = 0;
    let externalRefreshed = 0;
    const output: string[] = [];
    const code = await runUpdate(["--yes"], {
      caps, platform: { os: "linux", arch: "x64" }, agentDir, markerPath, journalPath, destinationPath, interactive: false,
      write: (line) => output.push(line),
      updatePi: async () => { piUpdated += 1; return { ok: true, detail: "pi actualizado" }; },
      syncPiPackages: async () => { packagesSynced += 1; return { ok: true, detail: "2 paquetes al dia" }; },
      refreshExternalTools: async () => { externalRefreshed += 1; return [{ ok: true, detail: "engram actualizado a la última release" }]; },
    });
    expect(code).toBe(EXIT_UPDATED);
    expect(piUpdated).toBe(1);
    expect(packagesSynced).toBe(1);
    // Las deps externas (engram/hypa/codegraph) se refrescan tras un update ok.
    expect(externalRefreshed).toBe(1);
    expect(output.join("\n")).toContain("pi actualizado");
    expect(output.join("\n")).toContain("engram actualizado a la última release");
  });

  test("skips pi and external-tool refresh on dry-run and on failure", async () => {
    let piTouched = 0;
    let externalTouched = 0;
    const spy = {
      updatePi: async () => { piTouched += 1; return { ok: true, detail: "no deberia correr" }; },
      refreshExternalTools: async () => { externalTouched += 1; return []; },
    };

    const dryMarkerPath = "/fake/marker.json";
    const dryCaps = fakeUpdateCaps({ files: new Map([[dryMarkerPath, marker()]]), http: updateHttp() });
    expect(await runUpdate(["--dry-run", "--yes", "0.20.0"], {
      caps: dryCaps, platform: { os: "linux", arch: "x64" }, agentDir: "/fake/agent", markerPath: dryMarkerPath,
      journalPath: "/fake/journal.json", destinationPath: "/fake/ein", interactive: false, write: () => {}, ...spy,
    })).toBe(EXIT_DRY_RUN);

    const failCaps = fakeUpdateCaps({ files: new Map([["/fake/marker.json", marker()]]), http: { get: async () => { throw new Error("boom"); } } });
    expect(await runUpdate(["--yes"], {
      caps: failCaps, markerPath: "/fake/marker.json", journalPath: "/fake/journal.json", destinationPath: "/fake/ein",
      interactive: false, write: () => {}, ...spy,
    })).toBe(EXIT_FAILED);

    expect(piTouched).toBe(0);
    expect(externalTouched).toBe(0);
  });

  test("projects defaulted preference separately from effective channel, installed version, and verified identity", async () => {
    const dir = root();
    const markerPath = join(dir, "marker.json");
    const caps = fakeUpdateCaps({ files: new Map([[markerPath, marker()]]), http: updateHttp() });
    const evidence = await readInstallerUpdateEvidence({
      caps,
      markerPath,
      installationPath: dir,
      readRelease: async () => ({ ok: true, value: { ...release().release, identity: { status: "pending" as const } } }),
    });

    expect(evidence.preference).toEqual({ status: "defaulted", channel: "stable" });
    expect(evidence.effectiveChannel).toBe("stable");
    expect(evidence.installed).toMatchObject({
      version: "0.19.0",
      artifact: { status: "verified", artifactId: `installer-v0.19.0@sha256:${"a".repeat(64)}` },
    });
    expect(evidence.release.artifact).toEqual({ status: "pending", reason: "verification-pending" });
  });

  test("keeps legacy installed identity unavailable while a pending candidate stays visible", async () => {
    const dir = root();
    const markerPath = join(dir, "marker.json");
    const legacy = encoder.encode(JSON.stringify({ version: "0.18.0", installedAt: "2026-01-01T00:00:00.000Z", channel: "stable" }));
    const caps = fakeUpdateCaps({ files: new Map([[markerPath, legacy]]), http: updateHttp() });
    const evidence = await readInstallerUpdateEvidence({
      caps,
      markerPath,
      installationPath: dir,
      readRelease: async () => ({ ok: true, value: { ...release().release, identity: { status: "pending" as const } } }),
    });

    expect(evidence.installed).toMatchObject({
      version: "0.18.0",
      artifact: { status: "unavailable", reason: "legacy-marker-identity-unavailable" },
    });
    expect(evidence.release.artifact).toEqual({ status: "pending", reason: "verification-pending" });
  });

  test("keeps alpha freshness unknown without immutable publication evidence or policy", async () => {
    const dir = root();
    const markerPath = join(dir, "marker.json");
    expect(writeReleaseChannelPreference(dir, "alpha")).toEqual({ status: "explicit", channel: "alpha" });
    const caps = fakeUpdateCaps({ files: new Map([[markerPath, marker()]]), http: updateHttp() });
    const evidence = await readInstallerUpdateEvidence({
      caps,
      markerPath,
      installationPath: dir,
      readRelease: async () => ({ ok: true, value: { ...release().release, identity: { status: "pending" as const } } }),
    });

    expect(evidence.preference).toEqual({ status: "explicit", channel: "alpha" });
    expect(evidence.effectiveChannel).toBe("alpha");
    expect(evidence.freshness).toEqual({ status: "unknown", reason: "alpha-expiration-evidence-unavailable" });
    expect(evidence.freshness.status).not.toBe("current");
  });

  test("does not default unreadable preference or conflicting identity evidence", async () => {
    const dir = root();
    const markerPath = join(dir, "marker.json");
    writeFileSync(preferenceFilePath(dir), "{\"channel\":\"beta\"", "utf8");
    const conflicting = JSON.parse(new TextDecoder().decode(marker()));
    conflicting.artifactId = `installer-v0.19.0@sha256:${"b".repeat(64)}`;
    const caps = fakeUpdateCaps({ files: new Map([[markerPath, encoder.encode(JSON.stringify(conflicting))]]), http: updateHttp() });
    const evidence = await readInstallerUpdateEvidence({ caps, markerPath, installationPath: dir });

    expect(evidence.preference).toEqual({ status: "unavailable", reason: "malformed-preference" });
    expect(evidence.effectiveChannel).toBeUndefined();
    expect(evidence.installed).toMatchObject({ status: "invalid", artifact: { status: "unavailable" } });
    expect(evidence.release).toMatchObject({ status: "unavailable", artifact: { status: "unavailable" } });
    expect(evidence.freshness.status).toBe("unavailable");
  });

  test("renders running-binary version and recovery-required banner labels", () => {
    // El banner refleja el binario que corre (INSTALLER_VERSION), no el marker.
    const running = { marker: JSON.parse(new TextDecoder().decode(marker("0.20.0"))), recoveryRequired: false };
    expect(bannerVersionLabel(running)).toBe(`v${INSTALLER_VERSION}`);
    expect(renderBanner(running)).toContain(`v${INSTALLER_VERSION}`);
    expect(renderBanner(running)).not.toContain("v0.20.0");
    expect(bannerVersionLabel({ marker: null, recoveryRequired: true })).toBe("recovery required");
    expect(bannerStatic({ marker: null, recoveryRequired: false })).toContain(`v${INSTALLER_VERSION}`);
    const markerPath = "/fake/marker.json";
    const state = readBannerState(fakeUpdateCaps({ files: new Map([[markerPath, marker()], ["/fake/journal.json", encoder.encode("pending")]]) }), markerPath, "/fake/journal.json");
    expect(state.recoveryRequired).toBe(true);
  });

  test("renders persisted preference separately from effective channel and keeps evidence quality visible", async () => {
    const dir = root();
    const markerPath = join(dir, "marker.json");
    expect(writeReleaseChannelPreference(dir, "alpha")).toEqual({ status: "explicit", channel: "alpha" });
    const caps = fakeUpdateCaps({ files: new Map([[markerPath, marker()]]), http: updateHttp() });
    const evidence = await readInstallerUpdateEvidence({
      caps,
      markerPath,
      installationPath: dir,
      readRelease: async () => ({ ok: true, value: { ...release().release, identity: { status: "pending" as const } } }),
    });
    const rendered = renderOutcome({ type: "updated", release: release() }, evidence);
    const output = rendered.lines.join("\n");

    expect(rendered.exitCode).toBe(EXIT_UPDATED);
    expect(output).toContain("Preferencia de canal: persistida (alpha)");
    expect(output).toContain("Canal efectivo: alpha");
    expect(output).toContain("Versión instalada: v0.19.0");
    expect(output).toContain(`Artifact ID instalado: installer-v0.19.0@sha256:${"a".repeat(64)}`);
    expect(output).toContain("Artifact ID del release: pendiente (verification-pending)");
    expect(output).toContain("Freshness: unknown (alpha-expiration-evidence-unavailable)");
  });

  test("threads the advisor projection through update output and keeps rollback local-only", async () => {
    const dir = root();
    const markerPath = join(dir, "marker.json");
    const caps = fakeUpdateCaps({ files: new Map([[markerPath, marker("0.19.0", { type: "package-manager", manager: "homebrew" })]]), http: updateHttp() });
    const evidence = await readInstallerUpdateEvidence({
      caps,
      markerPath,
      installationPath: dir,
      readRelease: async () => ({ ok: true, value: { ...release().release, identity: { status: "pending" as const } } }),
    });
    const output: string[] = [];
    const code = await runUpdate([], {
      caps,
      platform: { os: "linux", arch: "x64" },
      markerPath,
      journalPath: join(dir, "journal.json"),
      destinationPath: join(dir, "ein"),
      interactive: false,
      readAdvisor: async () => evidence,
      write: (line) => output.push(line),
    });
    expect(code).toBe(EXIT_BLOCKED_EXTERNAL_OWNER);
    expect(output.join("\n")).toContain("Preferencia de canal:");

    const recovery = renderOutcome({
      type: "failed",
      stage: "recovering",
      message: "rollback required",
      selector: release().selector,
    }, evidence).lines.join("\n");
    expect(recovery).toContain("Rollback local");
    expect(recovery).toContain("no modifica ningún canal remoto");
    expect(recovery).not.toContain("canal alpha remoto actualizado");
  });

  test("renders unavailable channel, identity, and freshness evidence without upgrading it", async () => {
    const dir = root();
    const markerPath = join(dir, "marker.json");
    writeFileSync(preferenceFilePath(dir), "{\"channel\":\"beta\"}", "utf8");
    const conflicting = JSON.parse(new TextDecoder().decode(marker()));
    conflicting.artifactId = `installer-v0.19.0@sha256:${"b".repeat(64)}`;
    const caps = fakeUpdateCaps({ files: new Map([[markerPath, encoder.encode(JSON.stringify(conflicting))]]), http: updateHttp() });
    const evidence = await readInstallerUpdateEvidence({ caps, markerPath, installationPath: dir });
    const rendered = renderOutcome({
      type: "failed",
      stage: "verifying",
      message: "identity unavailable",
      selector: release().selector,
    }, evidence);
    const output = rendered.lines.join("\n");

    expect(rendered.exitCode).toBe(EXIT_FAILED);
    expect(output).toContain("Preferencia de canal: no disponible (unsupported-channel)");
    expect(output).toContain("Canal efectivo: no disponible");
    expect(output).toContain("Artifact ID instalado: no disponible (marker-identity-unavailable)");
    expect(output).toContain("Artifact ID del release: no disponible (release-unavailable)");
    expect(output).toContain("Freshness: unavailable (unsupported-channel)");
    expect(output).not.toContain("Freshness: current");
  });
});
