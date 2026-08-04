import { afterEach, describe, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreBackup, snapshot } from "../installer/src/core/backup.ts";
import { installFishLauncher } from "../installer/src/core/launcher.ts";
import { migrateLegacyPi } from "../installer/src/core/pi-migration.ts";
import {
  derivePiInstallPaths,
  isValidInstallMarker,
  resolvePiInstallContext,
} from "../installer/src/core/paths.ts";
import { readMarkerAt, writeMarker } from "../installer/src/core/version.ts";
import {
  getInstallTargets,
  orchestrateInstall,
  runClaudeInstall,
  type RuntimeInstallResult,
} from "../installer/src/cli/install.ts";
import { runMenu, selectInstallTarget } from "../installer/src/cli/menu.ts";
import {
  CC_EIN_PAYLOAD_FILES,
  CC_EIN_PAYLOAD_REQUIRED_PATHS,
  CC_EIN_PAYLOAD_ROOTS,
  CC_EIN_PAYLOAD_SDD_ENTRY,
  resolveCcEinPayloadArchive,
  stageCcEinPayload,
  type CcEinPayloadStage,
} from "../installer/src/core/cc-payload.ts";

const roots: string[] = [];

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "ein-runtime-menu-"));
  roots.push(home);
  return home;
}

function validMarker(): string {
  return JSON.stringify({ version: "0.33.1", installedAt: new Date().toISOString(), channel: "stable" });
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("EIN Fish launcher", () => {
  test("creates the functions directory, owns only the named launcher, and is idempotent", () => {
    const home = tempHome();
    const destination = join(home, ".config", "fish", "functions");
    const unrelatedPath = join(destination, "unrelated.fish");
    const unrelatedContent = "function unrelated\nend\n";
    const launchers = [
      ["pi-ein.fish", readFileSync(join(import.meta.dir, "../pi-ein/pi-ein.fish"), "utf8")],
      ["cc-ein.fish", readFileSync(join(import.meta.dir, "../cc-ein/cc-ein.fish"), "utf8")],
    ] as const;

    const first = installFishLauncher({
      home,
      destination,
      name: launchers[0][0],
      content: launchers[0][1],
    });
    mkdirSync(destination, { recursive: true });
    writeFileSync(unrelatedPath, unrelatedContent);
    const second = installFishLauncher({
      home,
      destination,
      name: launchers[0][0],
      content: launchers[0][1],
    });
    installFishLauncher({
      home,
      destination,
      name: launchers[1][0],
      content: launchers[1][1],
    });

    expect(first.path).toBe(join(destination, "pi-ein.fish"));
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(readFileSync(first.path, "utf8")).toBe(launchers[0][1]);
    expect(readFileSync(join(destination, "cc-ein.fish"), "utf8")).toBe(launchers[1][1]);
    expect(readFileSync(unrelatedPath, "utf8")).toBe(unrelatedContent);
  });
});

describe("Claude runtime payload", () => {
  test("inventory names the cc-ein roots, Pi assets, and SDD entry", () => {
    expect(CC_EIN_PAYLOAD_ROOTS).toEqual(["cc-ein", "ein-pi/core"]);
    expect(CC_EIN_PAYLOAD_FILES).toEqual(["pi-ein/pi-ein.fish", "pi-ein/migrate.ts"]);
    expect(CC_EIN_PAYLOAD_SDD_ENTRY).toBe("cc-ein/sdd-cli/cli.ts");
    expect(CC_EIN_PAYLOAD_REQUIRED_PATHS).toContain("cc-ein/sync.ts");
  });

  test("stages an explicit archive and rejects missing assets without cwd fallback", async () => {
    const home = tempHome();
    const source = join(home, "payload-source");
    const archive = join(home, "payload.tar.gz");
    for (const path of [
      "cc-ein/sync.ts",
      "cc-ein/sdd-cli/cli.ts",
      "ein-pi/core",
      "pi-ein/pi-ein.fish",
    ]) {
      const fullPath = join(source, path);
      if (path.endsWith(".ts") || path.endsWith(".fish")) {
        mkdirSync(join(fullPath, ".."), { recursive: true });
        writeFileSync(fullPath, `// ${path}\\n`);
      } else {
        mkdirSync(fullPath, { recursive: true });
      }
    }
    execFileSync("tar", ["-czf", archive, "-C", source, "."]);
    const sourceBytes = readFileSync(archive);

    const staged = await stageCcEinPayload({ archivePath: archive, tempDirectory: home });
    expect(readFileSync(staged.syncPath, "utf8")).toContain("cc-ein/sync.ts");
    expect(staged.sddCliPath).toBe(join(staged.root, "cc-ein", "sdd-cli", "cli.ts"));
    expect(staged.archivePath).not.toBe(archive);
    expect(staged.archivePath).toBe(join(staged.root, "cc-ein-runtime.tar.gz"));
    expect(existsSync(staged.archivePath)).toBe(true);
    expect(readFileSync(staged.archivePath)).toEqual(sourceBytes);
    const stagedRoot = staged.root;
    staged.cleanup();
    staged.cleanup();
    expect(existsSync(staged.archivePath)).toBe(false);
    expect(existsSync(stagedRoot)).toBe(false);
    expect(() => resolveCcEinPayloadArchive(join(home, "missing.tar.gz"))).toThrow(/payload cc-ein/);
  });

  test("fails clearly for an unreadable source and removes the staging root", async () => {
    const home = tempHome();
    const stagingParent = join(home, "staging");
    const unreadableSource = join(home, "unreadable-source");
    mkdirSync(stagingParent);
    mkdirSync(unreadableSource);

    await expect(
      stageCcEinPayload({ archivePath: unreadableSource, tempDirectory: stagingParent }),
    ).rejects.toThrow(/No se pudo materializar el payload cc-ein/);
    expect(readdirSync(stagingParent)).toEqual([]);
  });

  test("removes the materialized archive and staging root after tar fails", async () => {
    const home = tempHome();
    const stagingParent = join(home, "staging");
    const invalidArchive = join(home, "invalid.tar.gz");
    mkdirSync(stagingParent);
    writeFileSync(invalidArchive, "not a tar archive");

    await expect(
      stageCcEinPayload({ archivePath: invalidArchive, tempDirectory: stagingParent }),
    ).rejects.toThrow(/No se pudo extraer el payload cc-ein/);
    expect(readdirSync(stagingParent)).toEqual([]);
  });
});

describe("Claude runtime runner", () => {
  function fakeStage(home: string, onCleanup: () => void): CcEinPayloadStage {
    return {
      archivePath: join(home, "payload.tar.gz"),
      root: join(home, "staged-payload"),
      syncPath: join(home, "staged-payload", "cc-ein", "sync.ts"),
      sddCliPath: join(home, "staged-payload", "cc-ein", "sdd-cli", "cli.ts"),
      manifestPath: join(home, "staged-payload", "ein-cc-payload-manifest.json"),
      cleanup: onCleanup,
    };
  }

  test("runs Bun from the staged context before installing cc-ein.fish", async () => {
    const home = tempHome();
    const calls: Array<{ command: string; args: string[]; cwd?: string; env?: Record<string, string> }> = [];
    let cleaned = false;
    let launcherInstalled = false;
    const stage = fakeStage(home, () => { cleaned = true; });

    const result = await runClaudeInstall({
      home,
      bunPath: "/custom/bun",
      stagePayload: async () => stage,
      execute: async (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd, env: options.env });
        expect(launcherInstalled).toBe(false);
        return { ok: true, code: 0, stdout: "sync ok", stderr: "" };
      },
      installLauncher: () => {
        launcherInstalled = true;
        return { path: join(home, ".config", "fish", "functions", "cc-ein.fish"), changed: true };
      },
    });

    expect(result).toEqual({ target: "claude", ok: true, detail: "Claude Code listo. Ejecuta `cc-ein` para empezar." });
    expect(calls).toEqual([{
      command: "/custom/bun",
      args: ["cc-ein/sync.ts"],
      cwd: stage.root,
      env: { HOME: home, CC_EIN_HOME: join(home, ".claude-ein") },
    }]);
    expect(launcherInstalled).toBe(true);
    expect(cleaned).toBe(true);
  });

  test("required sync failure skips the launcher and cleans staging", async () => {
    const home = tempHome();
    let cleaned = false;
    let launcherCalls = 0;
    const stage = fakeStage(home, () => { cleaned = true; });

    const result = await runClaudeInstall({
      home,
      stagePayload: async () => stage,
      execute: async () => ({ ok: false, code: 9, stdout: "", stderr: "required sync failed" }),
      installLauncher: () => {
        launcherCalls += 1;
        return { path: "unused", changed: true };
      },
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("required sync failed");
    expect(launcherCalls).toBe(0);
    expect(cleaned).toBe(true);
  });

  test("launcher failure reports Claude failure and cleans staging", async () => {
    const home = tempHome();
    let cleaned = false;
    const stage = fakeStage(home, () => { cleaned = true; });

    const result = await runClaudeInstall({
      home,
      stagePayload: async () => stage,
      execute: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
      installLauncher: () => { throw new Error("launcher write failed"); },
    });

    expect(result).toEqual({ target: "claude", ok: false, detail: "launcher write failed" });
    expect(cleaned).toBe(true);
  });

  test("optional sync warnings do not block the launcher after a successful process", async () => {
    const home = tempHome();
    let cleaned = false;
    const stage = fakeStage(home, () => { cleaned = true; });

    const result = await runClaudeInstall({
      home,
      stagePayload: async () => stage,
      execute: async () => ({ ok: true, code: 0, stdout: "MCP warning: optional integration unavailable", stderr: "" }),
      installLauncher: () => ({ path: join(home, "cc-ein.fish"), changed: true }),
    });

    expect(result.ok).toBe(true);
    expect(cleaned).toBe(true);
  });
});

describe("Interactive runtime menu", () => {
  test("offers Pi, Claude Code, and Both and forwards one selection", async () => {
    let promptCalls = 0;
    let promptedOptions: Array<{ value: string; label: string; hint: string }> = [];
    const selected = await selectInstallTarget(
      async (options) => {
        promptCalls += 1;
        promptedOptions = options.options;
        return "claude";
      },
      () => false,
    );

    expect(promptCalls).toBe(1);
    expect(promptedOptions.map((option) => option.value)).toEqual(["pi", "claude", "both"]);
    expect(promptedOptions.map((option) => option.label.replace(/\x1b\[[0-9;]*m/g, ""))).toEqual([
      "Pi",
      "Claude Code",
      "Both",
    ]);
    expect(selected).toBe("claude");
  });

  test("cancelling runtime selection returns cleanly without a target", async () => {
    const cancellation = Symbol("cancel");
    const selected = await selectInstallTarget(
      async () => cancellation,
      (value) => value === cancellation,
    );

    expect(selected).toBeNull();
  });

  test("real Install branch forwards the selected target exactly once", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    const installCalls: Array<{ args: string[]; target: string }> = [];

    try {
      const result = await runMenu({
        actionPrompt: async () => "install",
        runtimePrompt: async () => "claude",
        runInstall: async (args, target) => {
          installCalls.push({ args, target });
          return 23;
        },
        playBanner: async () => {},
        isCancel: () => false,
      });

      expect(result).toBe(23);
      expect(installCalls).toEqual([{ args: [], target: "claude" }]);
    } finally {
      if (descriptor) Object.defineProperty(process.stdin, "isTTY", descriptor);
      else delete (process.stdin as unknown as { isTTY?: boolean }).isTTY;
    }
  });

  test("non-TTY menu exits before prompting", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    try {
      await expect(runMenu()).resolves.toBe(0);
    } finally {
      if (descriptor) Object.defineProperty(process.stdin, "isTTY", descriptor);
      else delete (process.stdin as unknown as { isTTY?: boolean }).isTTY;
    }
  });
});

describe("Runtime target orchestration", () => {
  test("target contract keeps Pi and Claude distinct and orders both Pi then Claude", () => {
    expect(getInstallTargets("pi")).toEqual(["pi"]);
    expect(getInstallTargets("claude")).toEqual(["claude"]);
    expect(getInstallTargets("both")).toEqual(["pi", "claude"]);
  });

  test("shared Bun preparation runs once for both and selected runners run once", async () => {
    let bunPreparations = 0;
    const calls: string[] = [];
    const runner = (target: "pi" | "claude"): (() => Promise<RuntimeInstallResult>) => async () => {
      calls.push(target);
      return { target, ok: true, detail: `${target} ok` };
    };

    const result = await orchestrateInstall("both", {
      prepareBun: async () => {
        bunPreparations += 1;
        return { ok: true, detail: "bun ready" };
      },
      runners: { pi: runner("pi"), claude: runner("claude") },
    });

    expect(bunPreparations).toBe(1);
    expect(calls).toEqual(["pi", "claude"]);
    expect(result.ok).toBe(true);
    expect(result.results.map((item) => item.target)).toEqual(["pi", "claude"]);
  });

  test("both continues after one target fails and aggregates independent results", async () => {
    const calls: string[] = [];
    const result = await orchestrateInstall("both", {
      prepareBun: async () => ({ ok: true, detail: "bun ready" }),
      runners: {
        pi: async () => {
          calls.push("pi");
          return { target: "pi", ok: false, detail: "pi failed" };
        },
        claude: async () => {
          calls.push("claude");
          return { target: "claude", ok: true, detail: "claude ok" };
        },
      },
    });

    expect(calls).toEqual(["pi", "claude"]);
    expect(result.ok).toBe(false);
    expect(result.results).toEqual([
      { target: "pi", ok: false, detail: "pi failed" },
      { target: "claude", ok: true, detail: "claude ok" },
    ]);
  });
});

describe("Pi path context and migration", () => {
  test("Pi path context derives an isolated target from the active home", () => {
    const home = tempHome();
    const paths = derivePiInstallPaths(home);
    const context = resolvePiInstallContext(paths);

    expect(paths.legacyAgentDir).toBe(join(home, ".pi", "agent"));
    expect(paths.isolatedAgentDir).toBe(join(home, ".pi-ein", "agent"));
    expect(context.agentDir).toBe(paths.isolatedAgentDir);
    expect(context.installMarker).toBe(join(paths.isolatedAgentDir, ".ein-install.json"));
  });

  test("legacy and malformed markers are gated without touching vanilla Pi", () => {
    const home = tempHome();
    const paths = derivePiInstallPaths(home);
    mkdirSync(paths.legacyAgentDir, { recursive: true });
    writeFileSync(join(paths.legacyAgentDir, "settings.json"), "vanilla");
    writeFileSync(paths.legacyMarker, "not-json");

    expect(isValidInstallMarker(paths.legacyMarker)).toBe(false);
    expect(migrateLegacyPi(paths).migrated).toBe(false);
    expect(existsSync(paths.legacyAgentDir)).toBe(true);
    expect(resolvePiInstallContext(paths).agentDir).toBe(paths.isolatedAgentDir);
  });

  test("valid legacy EIN migrates before final Pi path resolution", () => {
    const home = tempHome();
    const paths = derivePiInstallPaths(home);
    mkdirSync(paths.legacyAgentDir, { recursive: true });
    writeFileSync(paths.legacyMarker, validMarker());
    writeFileSync(
      join(paths.legacyAgentDir, "settings.json"),
      JSON.stringify({ extensionPath: join(paths.legacyAgentDir, "extensions") }),
    );

    const migration = migrateLegacyPi(paths);
    const context = resolvePiInstallContext(paths);

    expect(migration.migrated).toBe(true);
    expect(existsSync(paths.legacyAgentDir)).toBe(false);
    expect(context.agentDir).toBe(paths.isolatedAgentDir);
    expect(readFileSync(join(context.agentDir, "settings.json"), "utf8")).toContain(paths.isolatedAgentDir);
    expect(migration.backupPath).not.toBeNull();
  });

  test("migration conflict fails closed before a Pi deployment can use a stale path", () => {
    const home = tempHome();
    const paths = derivePiInstallPaths(home);
    mkdirSync(paths.legacyAgentDir, { recursive: true });
    writeFileSync(paths.legacyMarker, validMarker());
    mkdirSync(paths.isolatedAgentDir, { recursive: true });

    expect(() => migrateLegacyPi(paths)).toThrow(/destino ya existe/);
    expect(existsSync(paths.legacyAgentDir)).toBe(true);
  });

  test("Pi path context threads marker, snapshot, and rollback through one target", async () => {
    const home = tempHome();
    const context = resolvePiInstallContext(derivePiInstallPaths(home));
    mkdirSync(context.agentDir, { recursive: true });
    writeFileSync(join(context.agentDir, "settings.json"), "before");
    writeMarker("stable", context);

    const marker = readMarkerAt(context.installMarker);
    const snap = await snapshot("context-test", context);
    writeFileSync(join(context.agentDir, "settings.json"), "after");
    await restoreBackup(snap.path!, context);

    expect(marker?.channel).toBe("stable");
    expect(readFileSync(join(context.agentDir, "settings.json"), "utf8")).toBe("before");
  });
});
