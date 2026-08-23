import { describe, expect, test } from "bun:test";
import { closeSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  agreeArtifactIdentity,
  classifyOwnership,
  deriveArtifactId,
  isReleaseChannel,
  normalizeReleaseTag,
  type ArtifactIdentity,
  type ArtifactId,
  type FreshnessEvidence,
  type MarkerV1,
  type MarkerV2,
  type ReleaseChannel,
  type ReleaseChannelResolution,
  type ReleaseRecord,
  type ReleaseTag,
} from "../installer/src/core/release-types.ts";
import { adaptReleaseRecord, fetchLatestRelease, fetchReleaseByTag } from "../installer/src/core/release-record.ts";
import { isEligibleRelease, normalizeTag, parseSelector, resolveExplicitTag, resolveRecord, resolveReleases } from "../installer/src/core/release-resolver.ts";
import { defaultUpdateCaps } from "../installer/src/core/update-caps.ts";
import { fakeUpdateCaps } from "./helpers/fake-update-caps.ts";
import { readInstallerUpdateEvidence } from "../installer/src/core/update-advisor-read.ts";
import {
  preferenceFilePath,
  readReleaseChannelPreference,
  writeReleaseChannelPreference,
  type ReleaseChannelPreferenceFs,
} from "../installer/src/core/release-channel-preference.ts";

const release = {
  tag: "installer-v0.19.0" as const,
  htmlUrl: "https://github.com/samuhlo/ein-agent/releases/tag/installer-v0.19.0",
  draft: false,
  prerelease: false,
  assets: [],
};

function createPreferenceFs(): ReleaseChannelPreferenceFs {
  return {
    makeDir: path => mkdirSync(path, { recursive: true, mode: 0o700 }),
    createTempPath: destination => join(dirname(destination), `.${basename(destination)}.test-tmp`),
    writeFile: (path, data) => writeFileSync(path, data, { flag: "wx", mode: 0o600 }),
    readFile: path => new Uint8Array(readFileSync(path)),
    rename: renameSync,
    removeFile: path => { try { unlinkSync(path); } catch {} },
    syncFile: path => {
      const fd = openSync(path, "r");
      try { fsyncSync(fd); } finally { closeSync(fd); }
    },
    syncDirectory: path => {
      const fd = openSync(path, "r");
      try { fsyncSync(fd); } finally { closeSync(fd); }
    },
  };
}

describe("release update contract", () => {
  test("keeps the channel vocabulary closed and resolution uncertainty explicit", () => {
    const channels: ReleaseChannel[] = ["stable", "alpha"];
    expect(channels).toEqual(["stable", "alpha"]);
    expect(isReleaseChannel("stable")).toBe(true);
    expect(isReleaseChannel("alpha")).toBe(true);
    expect(isReleaseChannel("beta")).toBe(false);
    expect(isReleaseChannel(undefined)).toBe(false);

    const defaulted: ReleaseChannelResolution = { status: "defaulted", channel: "stable" };
    const explicit: ReleaseChannelResolution = { status: "explicit", channel: "alpha" };
    const unavailable: ReleaseChannelResolution = { status: "unavailable", reason: "malformed-preference" };
    expect(defaulted).toEqual({ status: "defaulted", channel: "stable" });
    expect(explicit).toEqual({ status: "explicit", channel: "alpha" });
    expect(unavailable).toEqual({ status: "unavailable", reason: "malformed-preference" });
  });

  test("binds a normalized release tag to a lowercase verified SHA-256 artifact identity", () => {
    const tag = "installer-v0.82.0-alpha.1" as ReleaseTag;
    const uppercaseDigest = "ABCDEF0123456789".repeat(4);
    const artifact = deriveArtifactId(tag, uppercaseDigest);
    expect(artifact).toEqual({
      ok: true,
      value: "installer-v0.82.0-alpha.1@sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789" as ArtifactId,
    });

    if (artifact.ok) {
      const pending: ArtifactIdentity = { status: "pending" };
      const verified: ArtifactIdentity = { status: "verified", artifactId: artifact.value };
      expect(pending).toEqual({ status: "pending" });
      expect(verified).toEqual({ status: "verified", artifactId: artifact.value });
      expect(agreeArtifactIdentity({ releaseTag: tag, sha256: uppercaseDigest, artifactId: artifact.value })).toEqual(artifact);
    }
  });

  test("fails closed for malformed or incomplete verified identity evidence", () => {
    const tag = "installer-v0.82.0";
    const digest = "0".repeat(64);
    expect(deriveArtifactId("v0.82.0", digest)).toEqual({
      ok: true,
      value: `installer-v0.82.0@sha256:${digest}` as ArtifactId,
    });
    expect(deriveArtifactId(undefined, digest)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "missing-release-tag" }),
    });
    expect(deriveArtifactId(tag, undefined)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "missing-digest" }),
    });
    expect(deriveArtifactId("installer-v0.82" as ReleaseTag, digest)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid-release-tag" }),
    });
    expect(deriveArtifactId(tag as ReleaseTag, "not-a-sha256-digest")).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid-digest" }),
    });
    expect(agreeArtifactIdentity({ releaseTag: tag, sha256: digest })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "missing-artifact-id" }),
    });
    expect(agreeArtifactIdentity({ releaseTag: tag, sha256: digest, artifactId: "installer-v0.82.0@sha256:1" })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "identity-conflict" }),
    });
  });

  test("keeps normalized release-tag acceptance aligned across selection and artifact identity", () => {
    const digest = "a".repeat(64);
    const accepted = [
      ["installer-v1.2.3", "installer-v1.2.3"],
      ["v1.2.3", "installer-v1.2.3"],
      ["1.2.3", "installer-v1.2.3"],
      ["v1.2.3-alpha", "installer-v1.2.3-alpha"],
      ["v1.2.3-alpha.10+build.7", "installer-v1.2.3-alpha.10+build.7"],
      ["v1.2.3-0alpha", "installer-v1.2.3-0alpha"],
    ] as const;

    for (const [input, normalized] of accepted) {
      expect(normalizeTag(input)).toEqual({ ok: true, value: normalized });
      expect(normalizeReleaseTag(input)).toEqual({ ok: true, value: normalized });
      expect(deriveArtifactId(input, digest)).toEqual({
        ok: true,
        value: `${normalized}@sha256:${digest}` as ArtifactId,
      });
    }

    for (const malformed of ["v01.2.3", "v1.2.3-alpha.01", "v1.2.3-", "v1.2.3-alpha..1"]) {
      expect(normalizeTag(malformed).ok).toBe(false);
      expect(normalizeReleaseTag(malformed).ok).toBe(false);
      expect(deriveArtifactId(malformed, digest)).toMatchObject({
        ok: false,
        error: { code: "invalid-release-tag" },
      });
    }
    expect(normalizeTag("").ok).toBe(false);
    expect(normalizeReleaseTag("")).toMatchObject({
      ok: false,
      error: { code: "missing-release-tag" },
    });
    expect(deriveArtifactId("", digest)).toMatchObject({
      ok: false,
      error: { code: "missing-release-tag" },
    });
  });

  test("uses shared normalized-tag validation for explicit selectors and provider adaptation", () => {
    const digest = "b".repeat(64);
    const accepted = [
      ["0.19.0", "installer-v0.19.0"],
      ["v1.2.3-alpha.2", "installer-v1.2.3-alpha.2"],
      ["v1.2.3-alpha", "installer-v1.2.3-alpha"],
      ["v1.2.3-beta.2", "installer-v1.2.3-beta.2"],
      ["v1.2.3-rc.1", "installer-v1.2.3-rc.1"],
      ["installer-v1.2.3+build.7", "installer-v1.2.3+build.7"],
    ] as const;

    for (const [input, normalized] of accepted) {
      const shared = normalizeReleaseTag(input);
      expect(shared).toEqual({ ok: true, value: normalized });
      expect(resolveExplicitTag(input)).toEqual({ ok: true, value: normalized });
      const adapted = adaptReleaseRecord({
        tag_name: input,
        html_url: `https://example.test/${input}`,
        draft: false,
        prerelease: input.includes("-"),
        assets: [],
      });
      expect(adapted).toMatchObject({ ok: true, value: { tag: normalized, identity: { status: "pending" } } });
      if (adapted.ok) {
        if (input.includes("-alpha")) expect(isEligibleRelease(adapted.value, "alpha")).toBe(true);
        if (input.includes("-beta") || input.includes("-rc")) expect(isEligibleRelease(adapted.value, "alpha")).toBe(false);
      }
      expect(deriveArtifactId(input, digest)).toEqual({
        ok: true,
        value: `${normalized}@sha256:${digest}` as ArtifactId,
      });
    }

    for (const malformed of ["v01.2.3", "v1.2.3-alpha.01", "v1.2.3-", "v1.2.3-alpha..1"]) {
      const shared = normalizeReleaseTag(malformed);
      expect(shared.ok).toBe(false);
      if (shared.ok) continue;
      expect(resolveExplicitTag(malformed)).toMatchObject({
        ok: false,
        error: { message: shared.error.message },
      });
      expect(adaptReleaseRecord({ tag_name: malformed, html_url: "https://example.test/rejected", assets: [] })).toMatchObject({
        ok: false,
        error: { message: shared.error.message },
      });
    }
  });

  test("keeps freshness evidence unknown or unavailable without publication claims", () => {
    const unknown: FreshnessEvidence = { status: "unknown", reason: "publication-evidence-unavailable" };
    const unavailable: FreshnessEvidence = { status: "unavailable", reason: "policy-unavailable" };
    expect(unknown.status).toBe("unknown");
    expect(unavailable.status).toBe("unavailable");
  });

  test("defaults absent preference to stable and persists alpha across a new process without touching client settings", async () => {
    const root = mkdtempSync(join(tmpdir(), "ein-release-channel-"));
    const installation = join(root, "installation");
    const clientProject = join(root, "client-project");
    mkdirSync(installation, { recursive: true });
    mkdirSync(clientProject, { recursive: true });
    const clientSettingsPath = join(clientProject, "settings.json");
    const clientSettings = Buffer.from('{"defaultProvider":"client","packages":["keep-me"]}\n');
    writeFileSync(clientSettingsPath, clientSettings);
    try {
      expect(readReleaseChannelPreference(installation)).toEqual({ status: "defaulted", channel: "stable" });
      expect(writeReleaseChannelPreference(installation, "stable")).toEqual({ status: "explicit", channel: "stable" });
      expect(writeReleaseChannelPreference(installation, "alpha")).toEqual({ status: "explicit", channel: "alpha" });
      expect(readReleaseChannelPreference(installation)).toEqual({ status: "explicit", channel: "alpha" });

      const childScript = `
        const moduleUrl = ${JSON.stringify(pathToFileURL(join(process.cwd(), "installer/src/core/release-channel-preference.ts")).href)};
        const { readReleaseChannelPreference } = await import(moduleUrl);
        console.log(JSON.stringify(readReleaseChannelPreference(process.argv.at(-1))));
      `;
      const child = Bun.spawn([process.execPath, "-e", childScript, installation], { stdout: "pipe", stderr: "pipe" });
      const stdout = await new Response(child.stdout).text();
      const stderr = await new Response(child.stderr).text();
      expect(await child.exited, stderr).toBe(0);
      expect(JSON.parse(stdout.trim())).toEqual({ status: "explicit", channel: "alpha" });
      expect(readFileSync(clientSettingsPath)).toEqual(clientSettings);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns unavailable for unsupported, malformed, and unreadable preference bytes", () => {
    const root = mkdtempSync(join(tmpdir(), "ein-release-channel-invalid-"));
    const installation = join(root, "installation");
    mkdirSync(installation, { recursive: true });
    const path = preferenceFilePath(installation);
    try {
      writeFileSync(path, '{"channel":"beta"}\n');
      expect(readReleaseChannelPreference(installation)).toEqual({ status: "unavailable", reason: "unsupported-channel" });
      writeFileSync(path, "{\"channel\":\"alpha\"} trailing bytes");
      expect(readReleaseChannelPreference(installation)).toEqual({ status: "unavailable", reason: "malformed-preference" });
      writeFileSync(path, "{\"channel\":\"alpha\"");
      expect(readReleaseChannelPreference(installation)).toEqual({ status: "unavailable", reason: "malformed-preference" });
      unlinkSync(path);
      mkdirSync(path);
      expect(readReleaseChannelPreference(installation)).toEqual({ status: "unavailable", reason: "preference-unreadable" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails closed when atomic preference read-back differs from the bytes written", () => {
    const root = mkdtempSync(join(tmpdir(), "ein-release-channel-atomic-"));
    const installation = join(root, "installation");
    const clientProject = join(root, "client-project");
    mkdirSync(installation, { recursive: true });
    mkdirSync(clientProject, { recursive: true });
    const clientSettingsPath = join(clientProject, "settings.json");
    const clientSettings = Buffer.from('{"defaultProvider":"client"}\n');
    writeFileSync(clientSettingsPath, clientSettings);
    const realFs = createPreferenceFs();
    const targetPath = preferenceFilePath(installation);
    const mismatchingFs: ReleaseChannelPreferenceFs = {
      ...realFs,
      readFile: path => path === targetPath ? new TextEncoder().encode('{"channel":"stable"}\n') : realFs.readFile(path),
    };
    try {
      expect(writeReleaseChannelPreference(installation, "alpha", { fs: mismatchingFs })).toEqual({
        status: "unavailable",
        reason: "atomic-read-back-mismatch",
      });
      expect(readFileSync(clientSettingsPath)).toEqual(clientSettings);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

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

  test("normalizes prerelease SemVer tags without guessing malformed versions", () => {
    expect(normalizeTag("v1.2.3-alpha.10+build.7")).toEqual({
      ok: true,
      value: "installer-v1.2.3-alpha.10+build.7",
    });
    for (const malformed of ["v01.2.3", "v1.2.3-alpha.01", "v1.2", "v1.2.3-alpha..1"]) {
      expect(normalizeTag(malformed).ok).toBe(false);
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

  test("adapts provider records without applying channel policy and keeps identity pending", () => {
    const adapted = adaptReleaseRecord({
      tag_name: "v1.2.3-alpha.2",
      html_url: "https://github.com/samuhlo/ein-agent/releases/tag/v1.2.3-alpha.2",
      draft: false,
      prerelease: true,
      assets: [],
    });
    expect(adapted).toEqual({
      ok: true,
      value: expect.objectContaining({
        tag: "installer-v1.2.3-alpha.2",
        draft: false,
        prerelease: true,
        identity: { status: "pending" },
      }),
    });
  });

  test("fetches a bounded candidate list before selecting the highest eligible latest release", async () => {
    const providerRelease = (tag: string, options: { draft?: boolean; prerelease?: boolean } = {}) => ({
      tag_name: tag,
      html_url: `https://example.test/releases/${tag}`,
      draft: options.draft ?? false,
      prerelease: options.prerelease ?? tag.replace(/^installer-v/, "").includes("-"),
      assets: [],
    });
    const candidates = [
      providerRelease("installer-v1.0.0"),
      providerRelease("installer-v1.5.0"),
      providerRelease("installer-v2.0.0-alpha.2", { prerelease: true }),
      providerRelease("installer-v2.0.0-alpha.10", { prerelease: true }),
      providerRelease("installer-v9.0.0", { draft: true }),
      providerRelease("installer-v3.0.0-beta.1", { prerelease: true }),
      providerRelease("installer-v3.0.0-rc.1", { prerelease: true }),
      providerRelease("not-a-semver"),
    ];
    const encoder = new TextEncoder();
    const requests: string[] = [];
    const caps = {
      http: {
        get: async (url: string) => {
          requests.push(url);
          return {
            status: 200,
            url,
            headers: {},
            body: encoder.encode(JSON.stringify(candidates)),
          };
        },
      },
    };

    const stable = await fetchLatestRelease(caps, "samuhlo/ein-agent", "stable");
    const alpha = await fetchLatestRelease(caps, "samuhlo/ein-agent", "alpha");

    expect(requests).toHaveLength(2);
    expect(requests.every(url => url.includes("/releases?per_page="))).toBe(true);
    expect(requests.every(url => !url.endsWith("/releases/latest"))).toBe(true);
    expect(stable).toEqual({
      ok: true,
      value: expect.objectContaining({ tag: "installer-v1.5.0", identity: { status: "pending" } }),
    });
    expect(alpha).toEqual({
      ok: true,
      value: expect.objectContaining({ tag: "installer-v2.0.0-alpha.10", identity: { status: "pending" } }),
    });
  });

  test("fails closed for unusable candidate-list payloads and preserves exact-tag fetches", async () => {
    const encoder = new TextEncoder();
    const responseFor = (body: unknown) => ({
      status: 200,
      url: "https://example.test",
      headers: {},
      body: encoder.encode(typeof body === "string" ? body : JSON.stringify(body)),
    });
    const emptyCaps = { http: { get: async (url: string) => ({ ...responseFor([]), url }) } };
    const malformedCaps = { http: { get: async (url: string) => ({ ...responseFor({ releases: [] }), url }) } };
    const malformedJsonCaps = { http: { get: async (url: string) => ({ ...responseFor("not-json"), url }) } };
    const allIneligibleCaps = {
      http: {
        get: async (url: string) => ({
          ...responseFor([
            { tag_name: "installer-v9.0.0", html_url: "https://example.test/draft", draft: true, prerelease: false, assets: [] },
            { tag_name: "installer-v8.0.0-beta.1", html_url: "https://example.test/beta", draft: false, prerelease: true, assets: [] },
            { tag_name: "not-a-semver", html_url: "https://example.test/malformed", draft: false, prerelease: false, assets: [] },
          ]),
          url,
        }),
      },
    };
    expect(await fetchLatestRelease(emptyCaps, "samuhlo/ein-agent", "alpha")).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "ineligible" }) }),
    );
    expect(await fetchLatestRelease(allIneligibleCaps, "samuhlo/ein-agent", "alpha")).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "ineligible" }) }),
    );
    expect(await fetchLatestRelease(malformedCaps, "samuhlo/ein-agent", "stable")).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "invalid-response" }) }),
    );
    expect(await fetchLatestRelease(malformedJsonCaps, "samuhlo/ein-agent", "stable")).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "invalid-response" }) }),
    );

    const explicitUrl = "https://api.github.com/repos/samuhlo/ein-agent/releases/tags/installer-v1.5.0";
    const explicitRequests: string[] = [];
    const explicitCaps = {
      http: {
        get: async (url: string) => {
          explicitRequests.push(url);
          return {
            ...responseFor({
              tag_name: "installer-v1.5.0",
              html_url: "https://example.test/releases/installer-v1.5.0",
              draft: false,
              prerelease: false,
              assets: [],
            }),
            url,
          };
        },
      },
    };
    const explicit = await fetchReleaseByTag("installer-v1.5.0", explicitCaps, "samuhlo/ein-agent", "stable");
    expect(explicitRequests).toEqual([explicitUrl]);
    expect(explicit).toEqual({
      ok: true,
      value: expect.objectContaining({ tag: "installer-v1.5.0", identity: { status: "pending" } }),
    });
  });

  test("applies the stable and alpha eligibility matrix before highest-SemVer selection", () => {
    type CandidateRecord = ReleaseRecord & { identity?: ArtifactIdentity };
    const recordAt = (tag: string, options: Partial<Pick<CandidateRecord, "draft" | "prerelease" | "identity">> = {}): CandidateRecord => ({
      tag: tag as ReleaseTag,
      htmlUrl: `https://example.test/${tag}`,
      draft: options.draft ?? false,
      prerelease: options.prerelease ?? tag.replace(/^installer-v/, "").includes("-"),
      assets: [],
      ...(options.identity ? { identity: options.identity } : {}),
    });
    const candidates = [
      recordAt("installer-v1.0.0"),
      recordAt("installer-v2.0.0"),
      recordAt("installer-v2.1.0-alpha.2"),
      recordAt("installer-v2.1.0-alpha.10"),
      recordAt("installer-v2.1.0-beta.99"),
      recordAt("installer-v2.1.0-rc.1"),
      recordAt("installer-v2.1.0-canary.1"),
      recordAt("installer-v9.0.0", { draft: true }),
      recordAt("installer-vnot-semver"),
    ];

    expect(resolveReleases({ kind: "latest", raw: "latest" }, candidates, "stable")).toEqual({
      ok: true,
      value: expect.objectContaining({ release: expect.objectContaining({ tag: "installer-v2.0.0" }) }),
    });
    expect(resolveReleases({ kind: "latest", raw: "latest" }, candidates, "alpha")).toEqual({
      ok: true,
      value: expect.objectContaining({ release: expect.objectContaining({ tag: "installer-v2.1.0-alpha.10" }) }),
    });
    expect(resolveReleases({ kind: "latest", raw: "latest" }, [recordAt("installer-v2.2.0")], "alpha")).toEqual({
      ok: true,
      value: expect.objectContaining({ release: expect.objectContaining({ tag: "installer-v2.2.0" }) }),
    });
    expect(resolveReleases({ kind: "latest", raw: "latest" }, [recordAt("installer-v2.1.0-alpha.99"), recordAt("installer-v2.1.0")], "alpha")).toEqual({
      ok: true,
      value: expect.objectContaining({ release: expect.objectContaining({ tag: "installer-v2.1.0" }) }),
    });

    const alphaOnly = candidates.filter(candidate => candidate.tag.includes("alpha"));
    expect(resolveReleases({ kind: "latest", raw: "latest" }, alphaOnly, "stable").ok).toBe(false);
    expect(resolveReleases({ kind: "latest", raw: "latest" }, alphaOnly, "alpha")).toEqual({
      ok: true,
      value: expect.objectContaining({ release: expect.objectContaining({ tag: "installer-v2.1.0-alpha.10" }) }),
    });
    expect(isEligibleRelease(recordAt("installer-v2.1.0-alpha"), "stable")).toBe(false);
    expect(isEligibleRelease(recordAt("installer-v2.1.0-alpha"), "alpha")).toBe(true);
    expect(isEligibleRelease(recordAt("installer-v2.1.0-alpha.1"), "stable")).toBe(false);
    expect(isEligibleRelease(recordAt("installer-v2.1.0-alpha.1"), "alpha")).toBe(true);
    expect(isEligibleRelease(recordAt("installer-v2.1.0"), "beta" as ReleaseChannel)).toBe(false);
    for (const prerelease of ["beta.1", "rc.1", "preview.1", "alphaish.1"]) {
      expect(isEligibleRelease(recordAt(`installer-v3.0.0-${prerelease}`), "alpha")).toBe(false);
    }
  });

  test("does not make pending or conflicting candidate identity a resolution prerequisite", () => {
    const pending = {
      ...release,
      tag: "installer-v3.0.0" as ReleaseTag,
      identity: { status: "pending" as const },
    };
    const conflicting = {
      ...release,
      tag: "installer-v4.0.0" as ReleaseTag,
      identity: { status: "verified" as const, artifactId: "not-canonical" as ArtifactId },
    };
    expect(resolveReleases({ kind: "latest", raw: "latest" }, [pending, conflicting], "stable")).toEqual({
      ok: true,
      value: expect.objectContaining({ release: expect.objectContaining({ tag: "installer-v4.0.0" }) }),
    });
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
      installedAt: "2026-01-01T00:00:00.000Z", channel: "stable", owner: { type: "standalone" }, artifactId: "installer-v0.18.0@sha256:" + "a".repeat(64), asset: { assetName: "installer", sha256: "a".repeat(64) },
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
