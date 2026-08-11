import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DASHBOARD_PACKAGE_DIR, LEGACY_APP_NAME, promotePiAppPackage, type AppPromotionOptions } from "../installer/src/core/app-package-promotion.ts";
import { selectDashboardBinary } from "../ein-pi/agent/launcher/dashboard-selector.ts";
import { validateDashboardRelease } from "../ein-pi/agent/lib/dashboard-package.ts";
const roots: string[] = [];
const target = "darwin-arm64";
const candidateName = `ein-opentui-dashboard-${target}`;
function fixture(seed = true) {
  const root = mkdtempSync(join(tmpdir(), "ein-app-promotion-"));
  roots.push(root);
  const binDir = join(root, "bin");
  const agentDir = join(root, "agent");
  const selfPath = join(binDir, "installer");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(selfPath, "INSTALLER", { mode: 0o755 });
  writeFileSync(join(agentDir, "app.ts"), "export {};\n");
  if (seed) {
    const seedRoot = join(agentDir, "ein", "runtime-seed", "dashboard", "v1");
    const packageDir = join(seedRoot, "packages", target);
    mkdirSync(packageDir, { recursive: true });
    mkdirSync(join(seedRoot, "selector", "launcher"), { recursive: true });
    writeFileSync(join(seedRoot, "selector", "launcher", "dashboard-selector.ts"), "export {};\n");
    const bytes = Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from(`fixture:${"@opentui/core-darwin-arm64"}`)]);
    const candidate = join(packageDir, candidateName);
    writeFileSync(candidate, bytes, { mode: 0o755 });
    writeFileSync(join(packageDir, "candidate-inventory.json"), `${JSON.stringify({
		format: "ein-opentui-dashboard-candidate/v1", sourceRevision: "a".repeat(40), target, bunTarget: "bun-darwin-arm64",
      nativePackage: "@opentui/core-darwin-arm64",
      packageVersions: { "@opentui/core": "0.5.1", "@opentui/solid": "0.5.1", "solid-js": "1.9.12" },
      artifact: { filename: candidateName, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, mode: "0755" },
      verification: { binaryFormat: "mach-o", nativePackageMarker: "@opentui/core-darwin-arm64", result: "pass" },
    }, null, 2)}\n`);
  }
  return { root, binDir, agentDir, selfPath, packageRoot: join(binDir, DASHBOARD_PACKAGE_DIR), appPath: join(binDir, "ein") };
}
function options(value: ReturnType<typeof fixture>, releaseId: string, fail?: string): AppPromotionOptions {
  let legacyBuild = 0;
  return {
    ...value, platform: "darwin", arch: "arm64", releaseId,
    ports: {
      compile(entry, output) {
        const selector = entry.endsWith("selector-main.ts");
        if (fail === (selector ? "selector-compile" : "legacy-compile")) throw new Error(fail);
        writeFileSync(output, selector ? `SELECTOR:${releaseId}` : `LEGACY:${releaseId}:${legacyBuild++}`);
      },
      copy(from, to) {
        if (fail === "candidate-copy" && from.endsWith(candidateName)) throw new Error(fail);
        copyFileSync(from, to);
      },
      write(path, data, mode) {
        if (fail === "manifest-write" && path.endsWith("manifest.json")) throw new Error(fail);
        writeFileSync(path, data, { mode });
      },
      rename(from, to) {
        if (fail === "pointer-switch" && to.endsWith("current.json")) throw new Error(fail);
        renameSync(from, to);
      },
      validate: fail === "validation" ? async () => undefined : validateDashboardRelease,
    },
  };
}

afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });
describe("Pi app package promotion", () => {
  test("keeps a fresh no-seed install as a directly compiled legacy ein", async () => {
    const value = fixture(false);
    const promoted = await promotePiAppPackage(options(value, "legacy"));
    promoted.commit();
    expect(promoted.packaged).toBe(false);
    expect(readFileSync(value.appPath, "utf8")).toContain("LEGACY:legacy");
    expect(existsSync(join(value.packageRoot, "current.json"))).toBe(false);
  });
  test("installs one immutable package and selects its bound legacy/candidate coherently", async () => {
    const value = fixture();
    const promoted = await promotePiAppPackage(options(value, "r1"));
    promoted.commit();
    const release = await validateDashboardRelease(value.packageRoot, target);
    expect(release).toBeDefined();
    expect(readFileSync(join(value.packageRoot, "current.json"), "utf8")).toContain('"r1"');
    expect(lstatSync(value.appPath).mode & 0o777).toBe(0o755);
    expect(lstatSync(release!.legacy).mode & 0o777).toBe(0o755);
    expect(lstatSync(release!.candidate).mode & 0o777).toBe(0o755);
    const ports = { platform: "darwin", arch: "arm64", stdinTTY: true, stdoutTTY: true };
    expect(await selectDashboardBinary({ argv: ["--once"], cwd: value.root, packageRoot: value.packageRoot, legacyBinary: "fallback", ports })).toBe(release!.legacy);
    expect(await selectDashboardBinary({ argv: [], cwd: value.root, packageRoot: value.packageRoot, legacyBinary: "fallback", ports })).toBe(release!.candidate);
  });
  test("rejects a wrong-target seed before replacing the public command", async () => {
    const value = fixture();
    writeFileSync(value.appPath, "PRIOR", { mode: 0o755 });
    const inventory = join(value.agentDir, "ein", "runtime-seed", "dashboard", "v1", "packages", target, "candidate-inventory.json");
    writeFileSync(inventory, readFileSync(inventory, "utf8").replace('"target": "darwin-arm64"', '"target": "linux-arm64"'));
    await expect(promotePiAppPackage(options(value, "bad"))).rejects.toThrow("target mismatch");
    expect(readFileSync(value.appPath, "utf8")).toBe("PRIOR");
  });
  test("all staged failure points preserve the prior selector, pointer, and release", async () => {
    for (const phase of ["legacy-compile", "selector-compile", "candidate-copy", "manifest-write", "validation", "pointer-switch"]) {
      const value = fixture();
      const prior = await promotePiAppPackage(options(value, "r1"));
      prior.commit();
      const app = readFileSync(value.appPath);
      const current = readFileSync(join(value.packageRoot, "current.json"));
      await expect(promotePiAppPackage(options(value, "r2", phase))).rejects.toThrow();
      expect(readFileSync(value.appPath)).toEqual(app);
      expect(readFileSync(join(value.packageRoot, "current.json"))).toEqual(current);
      expect(existsSync(join(value.packageRoot, "releases", "r2"))).toBe(false);
    }
  });
  test("a successful switch can roll back both public selector and current pointer", async () => {
    const value = fixture();
    const first = await promotePiAppPackage(options(value, "r1")); first.commit();
    const app = readFileSync(value.appPath);
    const second = await promotePiAppPackage(options(value, "r2"));
    expect(readFileSync(join(value.packageRoot, "current.json"), "utf8")).toContain('"r2"');
    second.rollback();
    expect(readFileSync(value.appPath)).toEqual(app);
    expect(readFileSync(join(value.packageRoot, "current.json"), "utf8")).toContain('"r1"');
    expect(existsSync(join(value.packageRoot, "releases", "r2"))).toBe(false);
  });
});
