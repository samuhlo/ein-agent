// =============================================================================
// TESTS: command name promotion (ein / ein-install)
// The migration destroys nothing on failure: these assertions exist because a
// wrong order would leave a machine with neither installer nor app.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
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
  const appSource = join(root, "app.ts");
  writeFileSync(selfPath, "INSTALLER-BINARY");
  writeFileSync(appSource, "export {};");
  return { root, binDir, selfPath, appSource, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe("command name promotion", () => {
  test("writes both names: the installer under its own, the app under ein", () => {
    const ws = workspace();
    try {
      const result = promoteCommandNames({
        binDir: ws.binDir,
        selfPath: ws.selfPath,
        appSource: ws.appSource,
        compile: (_entry, output) => writeFileSync(output, "APP-BINARY"),
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
        appSource: ws.appSource,
        copy: (_from, to) => { order.push(`copy:${to}`); writeFileSync(to, "INSTALLER-BINARY"); },
        compile: (_entry, output) => { order.push("compile"); writeFileSync(output, "APP-BINARY"); },
      });
      expect(order[0]).toContain(INSTALLER_COMMAND);
      expect(order[1]).toBe("compile");
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
        binDir: ws.binDir, selfPath: ws.selfPath, appSource: ws.appSource,
        compile: (_entry, output) => writeFileSync(output, "APP-BINARY"),
      });
      expect(readFileSync(join(ws.binDir, INSTALLER_COMMAND), "utf8")).toBe("INSTALLER-BINARY");
      expect(readFileSync(legacy, "utf8")).toBe("APP-BINARY");
    } finally {
      ws.cleanup();
    }
  });

  test("a failed compile leaves the installer intact and ein untouched", () => {
    const ws = workspace();
    try {
      writeFileSync(join(ws.selfPath), "INSTALLER-BINARY");
      const result = promoteCommandNames({
        binDir: ws.binDir,
        selfPath: ws.selfPath,
        appSource: ws.appSource,
        compile: () => { throw new Error("compile exploded"); },
      });
      expect(result.installer.written).toBe(true);
      expect(result.app.written).toBe(false);
      expect(result.app.reason).toContain("compile exploded");
      // The installer survived; no half-written app was left behind.
      expect(readFileSync(join(ws.binDir, INSTALLER_COMMAND), "utf8")).toBe("INSTALLER-BINARY");
      expect(existsSync(join(ws.binDir, APP_COMMAND))).toBe(false);
    } finally {
      ws.cleanup();
    }
  });

  test("a missing app source is reported, not fatal", () => {
    const ws = workspace();
    try {
      const result = promoteCommandNames({
        binDir: ws.binDir,
        selfPath: ws.selfPath,
        appSource: join(ws.root, "absent.ts"),
        compile: () => { throw new Error("must not be called"); },
      });
      expect(result.installer.written).toBe(true);
      expect(result.app.written).toBe(false);
      expect(result.app.reason).toBe("app-source-missing");
    } finally {
      ws.cleanup();
    }
  });

  test("running already as ein-install does not copy over itself", () => {
    const ws = workspace();
    try {
      const selfPath = join(ws.binDir, INSTALLER_COMMAND);
      promoteCommandNames({
        binDir: ws.binDir, selfPath: ws.selfPath, appSource: ws.appSource,
        compile: (_entry, output) => writeFileSync(output, "APP-BINARY"),
      });
      const result = promoteCommandNames({
        binDir: ws.binDir, selfPath, appSource: ws.appSource,
        copy: () => { throw new Error("must not copy onto itself"); },
        compile: (_entry, output) => writeFileSync(output, "APP-BINARY-2"),
      });
      expect(result.installer.written).toBe(false);
      expect(readFileSync(join(ws.binDir, APP_COMMAND), "utf8")).toBe("APP-BINARY-2");
    } finally {
      ws.cleanup();
    }
  });
});
