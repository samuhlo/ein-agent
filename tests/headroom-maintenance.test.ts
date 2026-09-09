import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { selectHeadroomVersion } from "../tooling/headroom-maintain.ts";
import { acquireHeadroomMaintenanceLock, maintainHeadroom } from "../ein-pi/agent/lib/headroom-maintenance.ts";

test("promotion preserves a previous version; a failed compatibility check cannot replace it", () => {
  const home = mkdtempSync(join(tmpdir(), "ein-headroom-promotion-"));
  const candidate = (name: string, pass: boolean) => {
    const dir = join(home, "versions", name); mkdirSync(join(dir, "venv/bin"), { recursive: true });
    writeFileSync(join(dir, "venv/bin/headroom"), "fixture");
    writeFileSync(join(dir, "verified.json"), JSON.stringify({ pass, results: [{ pass }, { pass }, { pass }] }));
    return realpathSync(dir);
  };
  try {
    const a = candidate("a", true), bad = candidate("bad", false), b = candidate("b", true);
    selectHeadroomVersion(home, a); expect(readlinkSync(join(home, "active"))).toBe(a);
    expect(() => selectHeadroomVersion(home, bad)).toThrow(); expect(readlinkSync(join(home, "active"))).toBe(a);
    selectHeadroomVersion(home, b); expect(readlinkSync(join(home, "active"))).toBe(b); expect(readlinkSync(join(home, "previous"))).toBe(a);
    selectHeadroomVersion(home, a); expect(readlinkSync(join(home, "active"))).toBe(a); expect(readlinkSync(join(home, "previous"))).toBe(b);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("maintenance refuses live owners and recovers a known dead owner", () => {
  const home = mkdtempSync(join(tmpdir(), "ein-headroom-lock-"));
  try {
    const release = acquireHeadroomMaintenanceLock(home);
    expect(() => acquireHeadroomMaintenanceLock(home)).toThrow("already running"); release();
    mkdirSync(join(home, "maintenance.lock")); writeFileSync(join(home, "maintenance.lock/owner.json"), JSON.stringify({ pid: 2147483646, token: "dead" }));
    const recovered = acquireHeadroomMaintenanceLock(home); recovered(); expect(existsSync(join(home, "maintenance.lock"))).toBe(false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("cancelled maintenance releases its lock without selecting an installation", async () => {
  const home = mkdtempSync(join(tmpdir(), "ein-headroom-cancel-"));
  try {
    const script = join(home, "wait.ts"); writeFileSync(script, "setTimeout(()=>{}, 30000);\n");
    writeFileSync(join(home, "uv"), `#!/bin/sh\nexec '${process.execPath}' '${script}'\n`, { mode: 0o755 });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 150);
    try { await expect(maintainHeadroom("update", "0.37.0", { ...process.env, PATH: home, EIN_HEADROOM_SERVICE_DIR: home }, controller.signal)).rejects.toThrow(); }
    finally { clearTimeout(timer); }
    expect(existsSync(join(home, "active"))).toBe(false); expect(existsSync(join(home, "maintenance.lock"))).toBe(false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
