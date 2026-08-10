// =============================================================================
// TESTS: portable update probes in lib/update-probes.ts (mirror per EIN.md:19)
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLAUDE_VERSION_TIMEOUT_MS,
  checkClaudeCodeUpdate,
  checkEinTemplateUpdate,
  checkPiBinaryUpdate,
  isNewerVersion,
  parseVersion,
  defaultPiManifestPaths,
  readEinVersion,
  readPiBinaryVersion,
  startUpdateEvidenceSnapshot,
  type VersionProbeRunner,
  type FetchLike,
} from "../ein-pi/agent/lib/update-probes.ts";
import { UPDATE_CHECK_TIMEOUT_MS } from "../ein-pi/agent/lib/ein-update-notice.ts";
import type { UpdateTimeoutScheduler } from "../ein-pi/agent/lib/ein-update-notice.ts";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function fetchStub(response: Response): FetchLike {
  return (async () => response) as unknown as FetchLike;
}

function fetchThrows(): FetchLike {
  return (async () => {
    throw new Error("network down");
  }) as unknown as FetchLike;
}

type ManualTimer = { callback: () => void; delayMs: number; cancelled: boolean };

function createManualScheduler(): { timers: ManualTimer[]; scheduler: UpdateTimeoutScheduler } {
  const timers: ManualTimer[] = [];
  return {
    timers,
    scheduler: {
      setTimeout(callback: () => void, delayMs: number) {
        const timer = { callback, delayMs, cancelled: false };
        timers.push(timer);
        return timer;
      },
      clearTimeout(handle: unknown) {
        (handle as ManualTimer).cancelled = true;
      },
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe("version comparison", () => {
  test("parseVersion extracts semver triples from tags and plain versions", () => {
    expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("installer-v0.45.1")).toEqual([0, 45, 1]);
    expect(parseVersion("not-a-version")).toBeUndefined();
  });

  test("isNewerVersion compares parsed triples", () => {
    expect(isNewerVersion("v1.2.3", "v1.2.2")).toBe(true);
    expect(isNewerVersion("v1.2.2", "v1.2.3")).toBe(false);
    expect(isNewerVersion("garbage", "v1.0.0")).toBe(false);
  });
});

describe("checkPiBinaryUpdate — fail-closed without an injected version", () => {
  test("no installed version → skipped/installed-version-unavailable, freshness=unknown, never current", async () => {
    const result = await checkPiBinaryUpdate(undefined, fetchStub(jsonResponse({ version: "v9.9.9" })));
    expect(result).toEqual({
      source: "binary",
      status: "skipped",
      reason: "installed-version-unavailable",
      freshness: "unknown",
    });
  });

  test("newer remote version → update-available", async () => {
    const result = await checkPiBinaryUpdate("0.1.0", fetchStub(jsonResponse({ version: "v9.9.9" })));
    expect(result.status).toBe("update-available");
    expect(result.freshness).toBe("current");
  });

  test("non-OK response → unavailable/provider-unavailable", async () => {
    const result = await checkPiBinaryUpdate("0.1.0", fetchStub(jsonResponse({}, false)));
    expect(result).toMatchObject({ status: "unavailable", reason: "provider-unavailable", freshness: "unknown" });
  });

  test("malformed body → error/malformed-response", async () => {
    const result = await checkPiBinaryUpdate("0.1.0", fetchStub(jsonResponse({ version: 42 })));
    expect(result).toMatchObject({ status: "error", reason: "malformed-response", freshness: "unknown" });
  });

  test("fetch throws → error/probe-failed", async () => {
    const result = await checkPiBinaryUpdate("0.1.0", fetchThrows());
    expect(result).toMatchObject({ status: "error", reason: "probe-failed", freshness: "unknown" });
  });
});

describe("checkEinTemplateUpdate — fail-closed without an injected version", () => {
  test("no installed version → skipped/installed-version-unavailable, never current", async () => {
    const result = await checkEinTemplateUpdate(undefined, fetchStub(jsonResponse({ tag_name: "v9.9.9" })));
    expect(result).toEqual({
      source: "ein",
      status: "skipped",
      reason: "installed-version-unavailable",
      freshness: "unknown",
    });
  });

  test("development install → skipped/development-install", async () => {
    const result = await checkEinTemplateUpdate("dev", fetchStub(jsonResponse({ tag_name: "v9.9.9" })));
    expect(result).toEqual({ source: "ein", status: "skipped", reason: "development-install", freshness: "unknown" });
  });

  test("newer remote tag → update-available", async () => {
    const result = await checkEinTemplateUpdate("v0.1.0", fetchStub(jsonResponse({ tag_name: "v9.9.9" })));
    expect(result.status).toBe("update-available");
  });

  test("non-OK response → unavailable/provider-unavailable", async () => {
    const result = await checkEinTemplateUpdate("v0.1.0", fetchStub(jsonResponse({}, false)));
    expect(result).toMatchObject({ status: "unavailable", reason: "provider-unavailable", freshness: "unknown" });
  });

  test("malformed body → error/malformed-response", async () => {
    const result = await checkEinTemplateUpdate("v0.1.0", fetchStub(jsonResponse({ tag_name: 1 })));
    expect(result).toMatchObject({ status: "error", reason: "malformed-response", freshness: "unknown" });
  });
});

describe("readEinVersion — portable, agentDir injected", () => {
  test("valid marker file → version prefixed with v", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ein-update-probes-"));
    try {
      writeFileSync(join(dir, ".ein-install.json"), JSON.stringify({ version: "0.45.1" }));
      expect(await readEinVersion(dir)).toBe("v0.45.1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("missing file → dev, no crash", async () => {
    expect(await readEinVersion("/no/such/dir")).toBe("dev");
  });

  test("malformed JSON → dev, no crash", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ein-update-probes-"));
    try {
      writeFileSync(join(dir, ".ein-install.json"), "{not json");
      expect(await readEinVersion(dir)).toBe("dev");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("startUpdateEvidenceSnapshot — non-blocking read()", () => {
  test("read() is undefined before the timeout resolves, then returns the three observations", async () => {
    const { timers, scheduler } = createManualScheduler();
    const snapshot = startUpdateEvidenceSnapshot(
      {
        binary: () => Promise.resolve({ source: "binary", status: "current", reason: "read-success", freshness: "current" }),
        packages: () => Promise.resolve({ source: "packages", status: "current", reason: "read-success", freshness: "current" }),
        ein: () => Promise.resolve({ source: "ein", status: "update-available", reason: "newer-release", freshness: "current" }),
      },
      { scheduler },
    );

    expect(snapshot.read()).toBeUndefined();

    await flush();
    for (const timer of timers) if (!timer.cancelled) timer.callback();
    await flush();

    const observations = snapshot.read();
    expect(observations).toHaveLength(3);
    expect(observations?.map((item) => item.source).sort()).toEqual(["binary", "ein", "packages"]);
  });

  test("a source missing from injection is declared non-verifiable, never current", async () => {
    const { scheduler } = createManualScheduler();
    const snapshot = startUpdateEvidenceSnapshot(
      {
        binary: () => Promise.resolve({ source: "binary", status: "skipped", reason: "installed-version-unavailable", freshness: "unknown" }),
        packages: async () => ({ source: "packages", status: "skipped", reason: "probe-unavailable", freshness: "unknown" }),
        ein: () => Promise.resolve({ source: "ein", status: "current", reason: "read-success", freshness: "current" }),
      },
      { scheduler },
    );
    await flush();
    const observations = snapshot.read();
    const packages = observations?.find((item) => item.source === "packages");
    expect(packages?.status).not.toBe("current");
    expect(packages).toMatchObject({ status: "skipped", reason: "probe-unavailable" });
  });
});

describe("claude code version probe", () => {
  const ok = (stdout: string): VersionProbeRunner => async () => ({ stdout, exitCode: 0 });
  const fails = (code: string): VersionProbeRunner => async () => {
    const error: NodeJS.ErrnoException = new Error(code);
    error.code = code;
    throw error;
  };

  test("a parseable version yields a known install with unverifiable availability", async () => {
    const observation = await checkClaudeCodeUpdate(ok("2.1.226 (Claude Code)\n"));
    expect(observation).toEqual({
      source: "claude",
      status: "unavailable",
      reason: "availability-not-verifiable",
      freshness: "unknown",
    });
  });

  test("availability is never asserted as current or update-available", async () => {
    const observation = await checkClaudeCodeUpdate(ok("2.1.226 (Claude Code)"));
    expect(observation.status).not.toBe("current");
    expect(observation.status).not.toBe("update-available");
  });

  test("a missing executable is declared, not thrown", async () => {
    expect(await checkClaudeCodeUpdate(fails("ENOENT"))).toMatchObject({
      source: "claude", status: "skipped", reason: "executable-not-found",
    });
  });

  test("a timeout is declared with its own reason", async () => {
    expect(await checkClaudeCodeUpdate(fails("ETIMEDOUT"))).toMatchObject({
      status: "unavailable", reason: "probe-timeout",
    });
  });

  test("a non-zero exit is declared as a failed probe", async () => {
    expect(await checkClaudeCodeUpdate(async () => ({ stdout: "", exitCode: 1 }))).toMatchObject({
      status: "error", reason: "probe-failed",
    });
  });

  test("unparseable output is declared malformed, not guessed", async () => {
    expect(await checkClaudeCodeUpdate(ok("Claude Code (unknown build)"))).toMatchObject({
      status: "error", reason: "malformed-response",
    });
  });

  test("only the version query is ever spawned", async () => {
    const invocations: string[][] = [];
    const recording: VersionProbeRunner = async ({ file, args }) => {
      invocations.push([file, ...args]);
      return { stdout: "2.1.226 (Claude Code)", exitCode: 0 };
    };
    await checkClaudeCodeUpdate(recording);
    expect(invocations).toEqual([["claude", "--version"]]);
    expect(invocations.flat()).not.toContain("update");
    expect(invocations.flat()).not.toContain("upgrade");
  });

  test("the probe bounds the child below the collector budget", async () => {
    let timeoutMs = 0;
    await checkClaudeCodeUpdate(async (input) => {
      timeoutMs = input.timeoutMs;
      return { stdout: "2.1.226", exitCode: 0 };
    });
    expect(timeoutMs).toBe(CLAUDE_VERSION_TIMEOUT_MS);
    expect(timeoutMs).toBeLessThan(UPDATE_CHECK_TIMEOUT_MS);
  });

  test("an absent claude source produces no observation at all", async () => {
    const { scheduler } = createManualScheduler();
    const snapshot = startUpdateEvidenceSnapshot(
      {
        binary: async () => ({ source: "binary", status: "current", reason: "read-success", freshness: "current" }),
        packages: async () => ({ source: "packages", status: "current", reason: "read-success", freshness: "current" }),
        ein: async () => ({ source: "ein", status: "current", reason: "read-success", freshness: "current" }),
      },
      { scheduler },
    );
    await flush();
    expect(snapshot.read()?.map((item) => item.source)).not.toContain("claude");
  });

  test("an injected claude source joins the other three", async () => {
    const { scheduler } = createManualScheduler();
    const snapshot = startUpdateEvidenceSnapshot(
      {
        binary: async () => ({ source: "binary", status: "current", reason: "read-success", freshness: "current" }),
        packages: async () => ({ source: "packages", status: "current", reason: "read-success", freshness: "current" }),
        ein: async () => ({ source: "ein", status: "current", reason: "read-success", freshness: "current" }),
        claude: () => checkClaudeCodeUpdate(ok("2.1.226 (Claude Code)")),
      },
      { scheduler },
    );
    await flush();
    expect(snapshot.read()?.map((item) => item.source).sort()).toEqual(["binary", "claude", "ein", "packages"]);
  });
});

describe("installed pi version from disk", () => {
  test("reads the version from the first readable manifest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ein-pi-manifest-"));
    try {
      const manifest = join(dir, "package.json");
      writeFileSync(manifest, JSON.stringify({ version: "0.84.1" }));
      expect(await readPiBinaryVersion([join(dir, "missing.json"), manifest])).toBe("0.84.1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("exhausting every candidate yields undefined, not a guess", async () => {
    expect(await readPiBinaryVersion([join(tmpdir(), "ein-absent", "package.json")])).toBeUndefined();
  });

  test("a manifest without a usable version is skipped", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ein-pi-manifest-"));
    try {
      const bad = join(dir, "bad.json");
      const good = join(dir, "good.json");
      writeFileSync(bad, JSON.stringify({ version: 84 }));
      writeFileSync(good, JSON.stringify({ version: "0.84.1" }));
      expect(await readPiBinaryVersion([bad, good])).toBe("0.84.1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("malformed json does not throw", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ein-pi-manifest-"));
    try {
      const broken = join(dir, "package.json");
      writeFileSync(broken, "{ not json");
      expect(await readPiBinaryVersion([broken])).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the default candidate list points at the bun global install", () => {
    expect(defaultPiManifestPaths("/home/tester")).toEqual([
      "/home/tester/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/package.json",
    ]);
  });

});
