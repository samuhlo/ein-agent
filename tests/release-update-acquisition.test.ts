import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { acquireRelease } from "../installer/src/core/acquisition.ts";
import { selectAsset } from "../installer/src/core/asset-selector.ts";
import { parseChecksums } from "../installer/src/core/checksum.ts";
import type { HttpResponse } from "../installer/src/core/update-caps.ts";
import { fakeUpdateCaps } from "./helpers/fake-update-caps.ts";
import { fetchLatestRelease, fetchReleaseByTag } from "../installer/src/core/release-record.ts";
import { parseSelector } from "../installer/src/core/release-resolver.ts";

const encoder = new TextEncoder();
const assetName = "ein-installer-linux-arm64";
const assetBytes = encoder.encode("verified-installer-bytes");
const digest = createHash("sha256").update(assetBytes).digest("hex");
const apiUrl = "https://api.github.com/repos/samuhlo/ein-agent/releases?per_page=30";
const explicitUrl = "https://api.github.com/repos/samuhlo/ein-agent/releases/tags/installer-v0.19.0";
const assetUrl = "https://github.com/samuhlo/ein-agent/releases/download/installer-v0.19.0/ein-installer-linux-arm64";
const checksumsUrl = "https://github.com/samuhlo/ein-agent/releases/download/installer-v0.19.0/checksums.txt";

function response(status: number, body: Uint8Array, url = "https://github.com/response"): HttpResponse {
  return { status, body, url, headers: {} };
}

function releaseRecord(options: { draft?: boolean; prerelease?: boolean; checksums?: boolean } = {}) {
  return {
    tag_name: "installer-v0.19.0",
    html_url: "https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.19.0",
    draft: options.draft ?? false,
    prerelease: options.prerelease ?? false,
    assets: [
      { name: assetName, browser_download_url: assetUrl },
      ...(options.checksums === false ? [] : [{ name: "checksums.txt", browser_download_url: checksumsUrl }]),
    ],
  };
}

function releasePayload(options: { draft?: boolean; prerelease?: boolean; checksums?: boolean } = {}): Uint8Array {
  return encoder.encode(JSON.stringify(releaseRecord(options)));
}

function releaseListPayload(options: { draft?: boolean; prerelease?: boolean; checksums?: boolean } = {}): Uint8Array {
  return encoder.encode(JSON.stringify([releaseRecord(options)]));
}

function fakeHttp(responses: Map<string, HttpResponse | Error>) {
  return {
    get: async (url: string): Promise<HttpResponse> => {
      const scripted = responses.get(url);
      if (!scripted) throw new Error(`Unscripted URL: ${url}`);
      if (scripted instanceof Error) throw scripted;
      return scripted;
    },
  };
}

function acquireFixture(options: { checksums?: string; asset?: Uint8Array; assetResponseUrl?: string; failure?: Error; release?: Uint8Array } = {}) {
  const files = new Map<string, Uint8Array>();
  const removedDirs: string[] = [];
  const caps = fakeUpdateCaps({
    files,
    removedDirs,
    http: fakeHttp(new Map([
      [apiUrl, response(200, options.release ?? releaseListPayload())],
      [assetUrl, options.failure ?? response(200, options.asset ?? assetBytes, options.assetResponseUrl)],
      [checksumsUrl, response(200, encoder.encode(options.checksums ?? `${digest}  ${assetName}\n`))],
    ])),
  });
  const selector = parseSelector([]);
  if (!selector.ok) throw new Error("fixture selector failed");
  return { caps, files, removedDirs, selector: selector.value };
}

describe("release acquisition", () => {
  test("selects all published platform names deterministically, including WSL", () => {
    for (const [os, arch] of [["darwin", "arm64"], ["darwin", "x64"], ["linux", "arm64"], ["linux", "x64"]] as const) {
      expect(selectAsset({ os, arch })).toEqual(expect.objectContaining({ value: { assetName: `ein-installer-${os}-${arch}`, os, arch, wsl: false } }));
    }
    expect(selectAsset({ os: "darwin", arch: "x64", isWsl: true })).toEqual({
      ok: true,
      value: { assetName: "ein-installer-linux-x64", os: "linux", arch: "x64", wsl: true },
    });
  });

  test("parses checksums strictly", () => {
    expect(parseChecksums(`${digest}  ${assetName}\n`, assetName)).toEqual({ ok: true, value: { assetName, sha256: digest } });
    for (const checksums of ["", `${digest} *${assetName}\n`, `bad  ${assetName}\n`, `${digest}  other\n`]) {
      expect(parseChecksums(checksums, assetName).ok).toBe(false);
    }
    expect(parseChecksums(`${digest}  ${assetName}\n${digest}  ${assetName}\n`, assetName)).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "duplicate-entry" }) }));
  });

  test("acquires and verifies a same-release asset through injected HTTP and filesystem seams", async () => {
    const fixture = acquireFixture();
    const acquired = await acquireRelease({ selector: fixture.selector, platform: { os: "linux", arch: "arm64" }, caps: fixture.caps });
    expect(acquired.ok).toBe(true);
    if (acquired.ok) {
      expect(fixture.files.get(acquired.value.stagedPath)).toEqual(assetBytes);
      expect(acquired.value.digest.sha256).toBe(digest);
      acquired.value.cleanup();
      expect(fixture.removedDirs).toEqual([acquired.value.stagingDir]);
    }
  });

  test("cleans temporary staging after missing integrity metadata, mismatch, and network failure", async () => {
    for (const [fixture, expectedCleanup] of [
      [acquireFixture({ release: releasePayload({ checksums: false }) }), 0],
      [acquireFixture({ checksums: `${"0".repeat(64)}  ${assetName}\n` }), 1],
      [acquireFixture({ failure: new Error("timeout") }), 1],
    ] as const) {
      const acquired = await acquireRelease({ selector: fixture.selector, platform: { os: "linux", arch: "arm64" }, caps: fixture.caps });
      expect(acquired.ok).toBe(false);
      if (!acquired.ok) expect(["acquiring-metadata", "verifying"]).toContain(acquired.error.stage);
      expect(fixture.removedDirs).toHaveLength(expectedCleanup);
    }
  });

  test("rejects an injected redirect response that leaves trusted GitHub hosts", async () => {
    const fixture = acquireFixture({ assetResponseUrl: "https://downloads.example.test/asset" });
    const acquired = await acquireRelease({ selector: fixture.selector, platform: { os: "linux", arch: "arm64" }, caps: fixture.caps });
    expect(acquired).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "unsafe-redirect" }) }));
    expect(fixture.removedDirs).toHaveLength(1);
  });

  test("keeps latest and explicit endpoints distinct and rejects unavailable or ineligible records", async () => {
    const latestCaps = fakeUpdateCaps({ http: fakeHttp(new Map([[apiUrl, response(200, releaseListPayload({ draft: true }))]])) });
    expect(await fetchLatestRelease(latestCaps)).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "ineligible" }) }));

    const explicitCaps = fakeUpdateCaps({ http: fakeHttp(new Map([[explicitUrl, response(404, encoder.encode("missing"))]])) });
    expect(await fetchReleaseByTag("installer-v0.19.0", explicitCaps)).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "not-found" }) }));
  });
});
