// =============================================================================
// TESTS: command name promotion (ein / ein-install)
// The migration destroys nothing on failure: these assertions exist because a
// wrong order would leave a machine with neither installer nor app.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  APP_COMMAND,
  INSTALLER_COMMAND,
  promoteCommandNames,
} from "../installer/src/core/command-names.ts";

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "ein-command-names-"));
  const binDir = join(root, "bin");
  const selfPath = join(root, "current-installer");
  const appArtifact = join(root, "ein-app");
  writeFileSync(selfPath, "INSTALLER-BINARY");
  writeFileSync(appArtifact, "APP-BINARY");
  return { root, binDir, selfPath, appArtifact, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe("command name promotion", () => {
  test("writes both names: the installer under its own, the app under ein", () => {
    const ws = workspace();
    try {
      const result = promoteCommandNames({
        binDir: ws.binDir,
        selfPath: ws.selfPath,
        appArtifact: ws.appArtifact,
      });
      expect(result.installer.written).toBe(true);
      expect(result.app.written).toBe(true);
      expect(readFileSync(join(ws.binDir, INSTALLER_COMMAND), "utf8")).toBe("INSTALLER-BINARY");
      expect(readFileSync(join(ws.binDir, APP_COMMAND), "utf8")).toBe("APP-BINARY");
    } finally {
      ws.cleanup();
    }
  });

  test("the installer is preserved before the app overwrites ein", () => {
    const ws = workspace();
    try {
      const order: string[] = [];
      promoteCommandNames({
        binDir: ws.binDir,
        selfPath: ws.selfPath,
        appArtifact: ws.appArtifact,
        copy: (from, to) => { order.push(`copy:${to}`); writeFileSync(to, readFileSync(from)); },
      });
      expect(order[0]).toContain(INSTALLER_COMMAND);
      expect(order[1]).toContain(`${APP_COMMAND}.staging-`);
    } finally {
      ws.cleanup();
    }
  });

  test("migrating from the old layout keeps a working installer", () => {
    // The old world: `ein` IS the installer and there is no `ein-install`.
    const ws = workspace();
    try {
      const legacy = join(ws.binDir, APP_COMMAND);
      promoteCommandNames({
        binDir: ws.binDir, selfPath: ws.selfPath, appArtifact: ws.appArtifact,
      });
      expect(readFileSync(join(ws.binDir, INSTALLER_COMMAND), "utf8")).toBe("INSTALLER-BINARY");
      expect(readFileSync(legacy, "utf8")).toBe("APP-BINARY");
    } finally {
      ws.cleanup();
    }
  });

  test("a failed app copy leaves the installer intact and the existing ein untouched", () => {
    const ws = workspace();
    try {
      writeFileSync(join(ws.selfPath), "INSTALLER-BINARY");
      const appPath = join(ws.binDir, APP_COMMAND);
      mkdirSync(ws.binDir, { recursive: true });
      writeFileSync(appPath, "OLD-APP");
      const result = promoteCommandNames({
        binDir: ws.binDir,
        selfPath: ws.selfPath,
        appArtifact: ws.appArtifact,
        copy: (from, to) => {
          if (from === ws.appArtifact) throw new Error("copy exploded");
          writeFileSync(to, readFileSync(from));
        },
      });
      expect(result.installer.written).toBe(true);
      expect(result.app.written).toBe(false);
      expect(result.app.reason).toContain("copy exploded");
      expect(readFileSync(join(ws.binDir, INSTALLER_COMMAND), "utf8")).toBe("INSTALLER-BINARY");
      expect(readFileSync(appPath, "utf8")).toBe("OLD-APP");
      expect(existsSync(`${appPath}.staging-${process.pid}`)).toBe(false);
    } finally {
      ws.cleanup();
    }
  });

  test("a missing app artifact is reported without replacing ein", () => {
    const ws = workspace();
    try {
      const result = promoteCommandNames({
        binDir: ws.binDir,
        selfPath: ws.selfPath,
        appArtifact: join(ws.root, "absent"),
      });
      expect(result.installer.written).toBe(true);
      expect(result.app.written).toBe(false);
      expect(result.app.reason).toBe("app-artifact-missing");
    } finally {
      ws.cleanup();
    }
  });

  test("running already as ein-install does not copy over itself", () => {
    const ws = workspace();
    try {
      const selfPath = join(ws.binDir, INSTALLER_COMMAND);
      promoteCommandNames({
        binDir: ws.binDir, selfPath: ws.selfPath, appArtifact: ws.appArtifact,
      });
      const result = promoteCommandNames({
        binDir: ws.binDir, selfPath, appArtifact: ws.appArtifact,
        copy: (from, to) => { if (from === to) throw new Error("must not copy onto itself"); writeFileSync(to, readFileSync(from)); },
      });
      expect(result.installer.written).toBe(false);
      expect(readFileSync(join(ws.binDir, APP_COMMAND), "utf8")).toBe("APP-BINARY");
    } finally {
      ws.cleanup();
    }
  });
});
