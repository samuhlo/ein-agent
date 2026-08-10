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
import type { ResolvedRelease, UpdateOutcome } from "../installer/src/core/release-types.ts";
import { defaultUpdateCaps, type HttpResponse, type UpdateCaps } from "../installer/src/core/update-caps.ts";
import { fakeUpdateCaps } from "./helpers/fake-update-caps.ts";
import { bannerStatic, bannerVersionLabel, readBannerState, renderBanner } from "../installer/src/tui/banner.ts";
import { INSTALLER_VERSION } from "../installer/src/core/version.ts";

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

function updateHttp(): UpdateCaps["http"] {
  return {
    async get(url) {
      if (url.endsWith("/releases/latest") || url.includes("/releases/tags/")) return releaseResponse();
      if (url.endsWith("checksums.txt")) return { status: 200, url, headers: {}, body: encoder.encode(`${assetDigest}  ein-installer-linux-x64\n`) };
      return { status: 200, url, headers: {}, body: assetBytes };
    },
  };
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
    asset: { assetName: "ein-installer-linux-x64", sha256: "old" },
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
    expect([...files.keys()]).toEqual([markerPath]);
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
      installedAt: "2026-01-01T00:00:00.000Z", channel: "stable", owner: { type: "standalone" }, asset: { assetName: "ein-installer-linux-x64", sha256: assetDigest },
    }));
    const base = defaultUpdateCaps();
    const caps: UpdateCaps = {
      ...base,
      http: updateHttp(),
      child: { spawn: async () => ({ code: 0, stdout: "ein-installer 0.20.0\ntemplate-version 0.20.0\n" }) },
    };
    const output: string[] = [];
    const code = await runUpdate([], { caps, platform: { os: "linux", arch: "x64" }, agentDir, markerPath, journalPath: join(dir, "journal.json"), destinationPath, interactive: false, write: (line) => output.push(line) });
    expect(code).toBe(EXIT_ALREADY_CURRENT);
    expect(output.join("\n")).toContain("Ya está actualizado.");
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
});
