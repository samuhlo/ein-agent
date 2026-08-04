import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreBackup, snapshot } from "../installer/src/core/backup.ts";
import { migrateLegacyPi } from "../installer/src/core/pi-migration.ts";
import {
  derivePiInstallPaths,
  isValidInstallMarker,
  resolvePiInstallContext,
} from "../installer/src/core/paths.ts";
import { readMarkerAt, writeMarker } from "../installer/src/core/version.ts";

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
