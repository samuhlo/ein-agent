import { afterEach, describe, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CC_EIN_PAYLOAD_FILES,
  CC_EIN_PAYLOAD_REQUIRED_PATHS,
  CC_EIN_PAYLOAD_ROOTS,
  CC_EIN_PAYLOAD_SDD_ENTRY,
  resolveCcEinPayloadArchive,
  stageCcEinPayload,
} from "../installer/src/core/cc-payload.ts";
import { restoreBackup, snapshot } from "../installer/src/core/backup.ts";
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
  type RuntimeInstallResult,
} from "../installer/src/cli/install.ts";
// The generated template archive is not part of slice B; keep menu imports
// isolated from the later production asset while exercising the menu seams.
mock.module("../installer/src/assets/template.tar.gz", () => ({ default: "" }));

async function menuApi() {
  return await import("../installer/src/cli/menu.ts");
}

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

    const staged = await stageCcEinPayload({ archivePath: archive, tempDirectory: home });
    expect(readFileSync(staged.syncPath, "utf8")).toContain("cc-ein/sync.ts");
    expect(staged.sddCliPath).toBe(join(staged.root, "cc-ein", "sdd-cli", "cli.ts"));
    const stagedRoot = staged.root;
    staged.cleanup();
    staged.cleanup();
    expect(existsSync(stagedRoot)).toBe(false);
    expect(() => resolveCcEinPayloadArchive(join(home, "missing.tar.gz"))).toThrow(/payload cc-ein/);
  });
});

describe("Interactive runtime menu", () => {
  test("offers Pi, Claude Code, and Both and forwards one selection", async () => {
    const { selectInstallTarget } = await menuApi();
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
    const { selectInstallTarget } = await menuApi();
    const cancellation = Symbol("cancel");
    const selected = await selectInstallTarget(
      async () => cancellation,
      (value) => value === cancellation,
    );

    expect(selected).toBeNull();
  });

  test("real Install branch forwards the selected target exactly once", async () => {
    const { runMenu } = await menuApi();
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
    const { runMenu } = await menuApi();
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
