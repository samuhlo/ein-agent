import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promoteClaudeTerminalApp } from "../cc-ein/sync.ts";
import { selectDashboardBinary } from "../ein-pi/agent/launcher/dashboard-selector.ts";
import { validateDashboardRelease } from "../ein-pi/agent/lib/dashboard-package.ts";
import type { PromotionPorts } from "../installer/src/core/app-package-promotion.ts";

const roots: string[] = [];
const target = "darwin-arm64";
const candidateName = `ein-opentui-dashboard-${target}`;

function fixture(seed = true) {
  const root = mkdtempSync(join(tmpdir(), "ein-claude-promotion-"));
  roots.push(root);
  const repo = join(root, "payload");
  const destination = join(root, "home", ".claude-ein", "bin");
  const agentDir = join(repo, "ein-pi", "agent");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(agentDir, "app.ts"), "export {};\n");
  if (seed) {
    const seedRoot = join(repo, "ein", "runtime-seed", "dashboard", "v1");
    const packageDir = join(seedRoot, "packages", target);
    mkdirSync(packageDir, { recursive: true });
    mkdirSync(join(seedRoot, "selector", "launcher"), { recursive: true });
    writeFileSync(join(seedRoot, "selector", "launcher", "dashboard-selector.ts"), "export {};\n");
    const bytes = Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from("fixture:@opentui/core-darwin-arm64")]);
    writeFileSync(join(packageDir, candidateName), bytes, { mode: 0o755 });
    writeFileSync(join(packageDir, "candidate-inventory.json"), `${JSON.stringify({
      format: "ein-opentui-dashboard-candidate/v1", target, bunTarget: "bun-darwin-arm64",
      nativePackage: "@opentui/core-darwin-arm64",
      packageVersions: { "@opentui/core": "0.5.1", "@opentui/solid": "0.5.1", "solid-js": "1.9.12" },
      artifact: { filename: candidateName, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, mode: "0755" },
      verification: { binaryFormat: "mach-o", nativePackageMarker: "@opentui/core-darwin-arm64", result: "pass" },
    }, null, 2)}\n`);
  }
  return { root, repo, destination, app: join(destination, "ein-app"), packageRoot: join(destination, ".ein-dashboard") };
}

function ports(release: string, fail?: string, events: string[] = []): Partial<PromotionPorts> {
  return {
    compile(entry, output) {
      const selector = entry.endsWith("selector-main.ts");
      if (fail === (selector ? "selector-compile" : "legacy-compile")) throw new Error(fail);
      writeFileSync(output, `${selector ? "SELECTOR" : "LEGACY"}:${release}`);
    },
    copy(from, to) {
      const phase = from.endsWith(candidateName) ? "candidate-copy"
        : to.includes(".ein-app.backup") ? "app-backup" : to.includes(".current.backup") ? "pointer-backup" : "copy";
      if (fail === phase) throw new Error(phase);
      copyFileSync(from, to);
    },
    write(path, data, mode) {
      if (fail === "manifest-write" && path.endsWith("manifest.json")) throw new Error(fail);
      writeFileSync(path, data, { mode });
    },
    rename(from, to) {
      const phase = to.endsWith("current.json") ? "pointer-switch"
        : to.endsWith("ein-app") ? "app-switch" : to.endsWith(`/releases/${release}`) ? "release-switch" : "rename";
      events.push(phase);
      if (fail === phase) throw new Error(phase);
      renameSync(from, to);
    },
    validate: fail === "validation" ? async () => undefined : validateDashboardRelease,
  };
}

async function promote(value: ReturnType<typeof fixture>, release: string, fail?: string, events?: string[]) {
  return promoteClaudeTerminalApp({
    repo: value.repo, destination: value.destination, platform: "darwin", arch: "arm64", releaseId: release,
    ports: ports(release, fail, events),
  });
}

afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("Claude app package promotion", () => {
  test("keeps legacy no-seed sync as one stable ein-app executable", async () => {
    const value = fixture(false);
    const result = await promote(value, "legacy");
    result.commit();
    expect(result.packaged).toBe(false);
    expect(readFileSync(value.app, "utf8")).toBe("LEGACY:legacy");
    expect(existsSync(value.packageRoot)).toBe(false);
  });

  test("installs strict coherent releases and selects static versus TTY binaries", async () => {
    const value = fixture();
    const events: string[] = [];
    const first = await promote(value, "r1", undefined, events); first.commit();
    const second = await promote(value, "r2", undefined, events); second.commit();
    const selected = await validateDashboardRelease(value.packageRoot, target);
    expect(selected).toBeDefined();
    expect(readFileSync(selected!.legacy, "utf8")).toBe("LEGACY:r2");
    expect(readFileSync(join(value.packageRoot, "current.json"), "utf8")).toContain('"r2"');
    expect(existsSync(join(value.packageRoot, "releases", "r1"))).toBe(true);
    expect(events.at(-1)).toBe("pointer-switch");
    for (const path of [value.app, selected!.legacy, selected!.candidate]) expect(lstatSync(path).mode & 0o777).toBe(0o755);
    const manifest = JSON.parse(readFileSync(join(value.packageRoot, "releases", "r2", "manifest.json"), "utf8"));
    for (const artifact of [manifest.legacy, manifest.candidate]) {
      const bytes = readFileSync(join(value.packageRoot, "releases", "r2", artifact.filename));
      expect(artifact).toMatchObject({ bytes: bytes.length, mode: "0755", sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    const selectorPorts = { platform: "darwin", arch: "arm64", stdinTTY: true, stdoutTTY: true };
    expect(await selectDashboardBinary({ argv: ["--once"], cwd: value.root, packageRoot: value.packageRoot, legacyBinary: "bad", ports: selectorPorts })).toBe(selected!.legacy);
    expect(await selectDashboardBinary({ argv: [], cwd: value.root, packageRoot: value.packageRoot, legacyBinary: "bad", ports: selectorPorts })).toBe(selected!.candidate);
  });

  test("rejects corrupt and wrong-target seeds before switching the command", async () => {
    for (const mutation of ["corrupt", "wrong-target"]) {
      const value = fixture();
      writeFileSync(value.app, "PRIOR", { mode: 0o755 });
      const packageDir = join(value.repo, "ein", "runtime-seed", "dashboard", "v1", "packages", target);
      if (mutation === "corrupt") writeFileSync(join(packageDir, candidateName), "corrupt", { mode: 0o755 });
      else {
        const inventory = join(packageDir, "candidate-inventory.json");
        writeFileSync(inventory, readFileSync(inventory, "utf8").replace('"target": "darwin-arm64"', '"target": "linux-arm64"'));
      }
      await expect(promote(value, "bad")).rejects.toThrow();
      expect(readFileSync(value.app, "utf8")).toBe("PRIOR");
      expect(existsSync(join(value.packageRoot, "current.json"))).toBe(false);
    }
  });

  test("every mutation failure preserves the prior release and executable without staging debris", async () => {
    const phases = ["legacy-compile", "candidate-copy", "manifest-write", "selector-compile", "validation", "release-switch", "app-backup", "app-switch", "pointer-backup", "pointer-switch"];
    for (const phase of phases) {
      const value = fixture();
      const first = await promote(value, "r1"); first.commit();
      const command = readFileSync(value.app);
      const pointer = readFileSync(join(value.packageRoot, "current.json"));
      await expect(promote(value, "r2", phase)).rejects.toThrow();
      expect(readFileSync(value.app)).toEqual(command);
      expect(readFileSync(join(value.packageRoot, "current.json"))).toEqual(pointer);
      expect(existsSync(join(value.packageRoot, "releases", "r1"))).toBe(true);
      expect(existsSync(join(value.packageRoot, "releases", "r2"))).toBe(false);
      expect(existsSync(value.app)).toBe(true);
      expect(readdirSync(value.destination).some((name) => name.includes("staging") || name.includes("backup"))).toBe(false);
      expect(readdirSync(value.packageRoot).some((name) => name.startsWith(".staging"))).toBe(false);
    }
  });
});
