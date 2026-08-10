// =============================================================================
// TESTS: portable update probes in lib/update-probes.ts (mirror per EIN.md:19)
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkEinTemplateUpdate,
  checkPiBinaryUpdate,
  isNewerVersion,
  parseVersion,
  readEinVersion,
  startUpdateEvidenceSnapshot,
  type FetchLike,
} from "../ein-pi/agent/lib/update-probes.ts";
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
