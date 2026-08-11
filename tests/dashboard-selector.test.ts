import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { validateDashboardPackage } from "../ein-pi/agent/lib/dashboard-package.ts";
import { parseTerminalAppArgs, type TerminalAppArgs } from "../ein-pi/agent/lib/terminal-app-args.ts";
import { launchDashboard, selectDashboardBinary, type DashboardLauncherPorts } from "../ein-pi/agent/launcher/dashboard-selector.ts";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

function fixture(): { root: string; release: string; manifest: Record<string, unknown>; candidate: string } {
  const root = mkdtempSync(join(tmpdir(), "ein-dashboard-selector-"));
  roots.push(root);
  const release = join(root, "releases", "r1");
  mkdirSync(release, { recursive: true });
  writeFileSync(join(root, "current.json"), JSON.stringify({ format: "ein-dashboard-current/v1", release: "r1" }));
  const entry = (filename: string, content: string) => ({ filename, sha256: hash(content), bytes: Buffer.byteLength(content), mode: "0755" });
  const manifest: Record<string, unknown> = {
    format: "ein-dashboard-release/v1", release: "r1", target: "darwin-arm64",
    legacy: entry("legacy", "legacy"), candidate: entry("candidate", "candidate"),
  };
  for (const [name, content] of [["legacy", "legacy"], ["candidate", "candidate"]]) {
    writeFileSync(join(release, name), content);
    chmodSync(join(release, name), 0o755);
  }
  writeFileSync(join(release, "manifest.json"), JSON.stringify(manifest));
  return { root, release, manifest, candidate: join(release, "candidate") };
}

const rewriteManifest = (value: ReturnType<typeof fixture>): void =>
  writeFileSync(join(value.release, "manifest.json"), JSON.stringify(value.manifest));

describe("terminal app argument contract", () => {
  test("preserves exact run, help, moved, and usage results", () => {
    const cases: Array<[string[], TerminalAppArgs]> = [
      [[], { kind: "run", cwd: "/work", once: false, intro: true }],
      [["--once", "--no-intro", "--project", "/other"], { kind: "run", cwd: "/other", once: true, intro: false }],
      [["--project", "/other", "--project", "/last"], { kind: "run", cwd: "/last", once: false, intro: true }],
      [["--help", "--wat"], { kind: "help" }], [["-h"], { kind: "help" }],
      [["install", "--wat"], { kind: "moved", verb: "install" }],
      [["doctor"], { kind: "moved", verb: "doctor" }],
      [["--project"], { kind: "usage", reason: "missing-project-value" }],
      [["--wat"], { kind: "usage", reason: "unknown-argument" }],
      [["--update"], { kind: "usage", reason: "unknown-argument" }],
    ];
    for (const [argv, expected] of cases) expect(parseTerminalAppArgs(argv, "/work")).toEqual(expected);
  });
});

describe("installed dashboard package", () => {
  test("accepts only the complete target-specific immutable release", async () => {
    const value = fixture();
    expect(await validateDashboardPackage(value.root, "darwin-arm64")).toBe(value.candidate);
    expect(await validateDashboardPackage(value.root, "linux-arm64")).toBeUndefined();
  });

  test("rejects malformed pointers, manifests, and traversal", async () => {
    for (const mutate of [
      (value: ReturnType<typeof fixture>) => rmSync(join(value.root, "current.json")),
      (value: ReturnType<typeof fixture>) => writeFileSync(join(value.root, "current.json"), "{"),
      (value: ReturnType<typeof fixture>) => writeFileSync(join(value.release, "manifest.json"), "{"),
      (value: ReturnType<typeof fixture>) => writeFileSync(join(value.root, "current.json"), JSON.stringify({ format: "ein-dashboard-current/v1", release: "../r1" })),
      (value: ReturnType<typeof fixture>) => { value.manifest.extra = true; rewriteManifest(value); },
      (value: ReturnType<typeof fixture>) => { value.manifest.target = "linux-arm64"; rewriteManifest(value); },
      (value: ReturnType<typeof fixture>) => { (value.manifest.candidate as Record<string, unknown>).filename = "../candidate"; rewriteManifest(value); },
    ]) {
      const value = fixture(); mutate(value);
      expect(await validateDashboardPackage(value.root, "darwin-arm64")).toBeUndefined();
    }
  });

  test("rejects symlinks, non-files, and artifact mismatches", async () => {
    const mutations = [
      (value: ReturnType<typeof fixture>) => { rmSync(value.candidate); symlinkSync(join(value.release, "legacy"), value.candidate); },
      (value: ReturnType<typeof fixture>) => { rmSync(value.candidate); mkdirSync(value.candidate); },
      (value: ReturnType<typeof fixture>) => writeFileSync(value.candidate, "xxxxxxxxx"),
      (value: ReturnType<typeof fixture>) => { (value.manifest.candidate as Record<string, unknown>).bytes = 99; rewriteManifest(value); },
      (value: ReturnType<typeof fixture>) => chmodSync(value.candidate, 0o700),
    ];
    for (const mutate of mutations) {
      const value = fixture(); mutate(value);
      expect(await validateDashboardPackage(value.root, "darwin-arm64")).toBeUndefined();
    }
  });
});

describe("dashboard selector", () => {
  const ports = (overrides: Partial<DashboardLauncherPorts> = {}): DashboardLauncherPorts => ({
    platform: "darwin", arch: "arm64", stdinTTY: true, stdoutTTY: true,
    validate: async () => ({ legacy: "/package/legacy", candidate: "/package/candidate" }), spawn: async () => ({ started: true, code: 0 }), ...overrides,
  });
  const options = (injected: DashboardLauncherPorts, argv: string[] = []) => ({
    argv, cwd: "/work", packageRoot: "/package", legacyBinary: "/package/legacy", ports: injected,
  });

  test("selects candidate only for eligible interactive static state", async () => {
    expect(await selectDashboardBinary(options(ports()))).toBe("/package/candidate");
    for (const [argv, override] of [
      [["--once"], {}], [["--help"], {}], [["install"], {}], [["--wat"], {}],
      [[], { stdinTTY: false }], [[], { stdoutTTY: false }], [[], { platform: "win32" }],
      [[], { arch: "ia32" }], [[], { validate: async () => undefined }],
    ] as Array<[string[], Partial<DashboardLauncherPorts>]>) {
      expect(await selectDashboardBinary(options(ports(override), argv))).toBe("/package/legacy");
    }
  });

  test("falls back only when candidate fails before start", async () => {
    const calls: string[] = [];
    const injected = ports({ spawn: async (binary) => { calls.push(binary); return { started: binary.endsWith("legacy"), code: binary.endsWith("legacy") ? 7 : 1 }; } });
    expect(await launchDashboard(options(injected))).toBe(7);
    expect(calls).toEqual(["/package/candidate", "/package/legacy"]);
  });

  test("never double-launches after a candidate starts and exits nonzero", async () => {
    const calls: string[] = [];
    const injected = ports({ spawn: async (binary) => { calls.push(binary); return { started: true, code: 23 }; } });
    expect(await launchDashboard(options(injected))).toBe(23);
    expect(calls).toEqual(["/package/candidate"]);
  });

  test("source closure contains only Node built-ins and dependency-free local modules", () => {
    const entry = resolve(import.meta.dir, "../ein-pi/agent/launcher/dashboard-selector.ts");
    const pending = [entry];
    const visited = new Set<string>();
    while (pending.length) {
      const file = pending.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/@opentui|solid-js|terminal-app-controller|terminal-app\.ts|runtime-session/);
      for (const specifier of source.matchAll(/from\s+["']([^"']+)["']/g)) {
        const dependency = specifier[1]!;
        expect(dependency.startsWith("node:") || dependency.startsWith(".")).toBe(true);
        if (dependency.startsWith(".")) pending.push(resolve(dirname(file), dependency));
      }
    }
    expect([...visited].map((file) => file.slice(resolve(import.meta.dir, "..").length + 1)).sort()).toEqual([
      "ein-pi/agent/launcher/dashboard-selector.ts", "ein-pi/agent/lib/dashboard-package.ts", "ein-pi/agent/lib/terminal-app-args.ts",
    ]);
    expect(lstatSync(entry).isFile()).toBe(true);
  });
});
