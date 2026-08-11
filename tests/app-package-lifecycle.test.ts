import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { removeAppPackage } from "../installer/src/core/app-package-lifecycle";
import { parseInstallFlags } from "../installer/src/cli/install";
import { uninstallAppPackages } from "../installer/src/cli/uninstall";

const ROOT = join(tmpdir(), "ein-agent-tests", "app-package-lifecycle");
const HOME = join(ROOT, "home");
const PI_BIN = join(ROOT, "pi-bin");
const CLAUDE_BIN = join(HOME, ".claude-ein", "bin");
const FISH = join(HOME, ".config", "fish", "functions");

function file(path: string, content = "owned"): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function seed(root: string, command: string): void {
  file(join(root, command));
  file(join(root, ".ein-dashboard", "current.json"), "pointer");
  file(join(root, ".ein-dashboard", "releases", "r1", "candidate"));
  file(join(root, ".ein-dashboard", ".staging-r2", "candidate"));
  file(join(root, ".ein-dashboard", "user-note"), "keep-package");
  file(join(root, "user-runtime"), "keep-runtime");
}

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  seed(PI_BIN, "ein");
  seed(CLAUDE_BIN, "ein-app");
  file(join(FISH, "cc-ein.fish"));
  file(join(FISH, "mine.fish"), "keep-launcher");
  file(join(HOME, ".claude", "settings.json"), "keep-claude");
});

describe("app package lifecycle", () => {
  test("removes only owned package state and is idempotent", () => {
    expect(removeAppPackage({ root: PI_BIN, commands: ["ein"] })).toBe(4);
    expect(removeAppPackage({ root: PI_BIN, commands: ["ein"] })).toBe(0);
    expect(readFileSync(join(PI_BIN, ".ein-dashboard", "user-note"), "utf8")).toBe("keep-package");
    expect(readFileSync(join(PI_BIN, "user-runtime"), "utf8")).toBe("keep-runtime");
  });

  test("keeps default Pi semantics and scopes pi, claude, and both", () => {
    expect(parseInstallFlags([]).runtime).toBe("pi");
    expect(uninstallAppPackages("pi", { home: HOME, binDir: PI_BIN }).map((result) => result.ok)).toEqual([true]);
    expect(existsSync(join(PI_BIN, "ein"))).toBe(false);
    expect(existsSync(join(CLAUDE_BIN, "ein-app"))).toBe(true);

    expect(uninstallAppPackages("both", { home: HOME, binDir: PI_BIN }).every((result) => result.ok)).toBe(true);
    expect(existsSync(join(CLAUDE_BIN, "ein-app"))).toBe(false);
    expect(existsSync(join(FISH, "cc-ein.fish"))).toBe(false);
    expect(readFileSync(join(FISH, "mine.fish"), "utf8")).toBe("keep-launcher");
    expect(readFileSync(join(HOME, ".claude", "settings.json"), "utf8")).toBe("keep-claude");
  });

  test("reports both targets independently when one fails", () => {
    const visited: string[] = [];
    const results = uninstallAppPackages("both", {
      home: HOME,
      binDir: PI_BIN,
      remove: (paths) => {
        visited.push(paths.root);
        if (paths.root === PI_BIN) throw new Error("pi denied");
        return 0;
      },
    });
    expect(results.map(({ target, ok }) => [target, ok])).toEqual([["pi", false], ["claude", true]]);
    expect(visited).toContain(CLAUDE_BIN);
    expect(visited).toContain(FISH);
  });

  test("refuses traversal and symlinks before deleting anything", () => {
    expect(() => removeAppPackage({ root: PI_BIN, commands: ["../ein"] })).toThrow("unsafe app command");
    symlinkSync(join(ROOT, "missing-target"), join(PI_BIN, "dangling"));
    expect(() => removeAppPackage({ root: PI_BIN, commands: ["ein", "dangling"] })).toThrow("symlink");
    rmSync(join(PI_BIN, ".ein-dashboard"), { recursive: true });
    const outside = join(ROOT, "outside");
    file(join(outside, "current.json"), "outside");
    symlinkSync(outside, join(PI_BIN, ".ein-dashboard"));
    expect(() => removeAppPackage({ root: PI_BIN, commands: ["ein"] })).toThrow("symlink");
    expect(existsSync(join(PI_BIN, "ein"))).toBe(true);
    expect(readFileSync(join(outside, "current.json"), "utf8")).toBe("outside");
  });

  test("removes legacy-only and missing layouts", () => {
    rmSync(join(PI_BIN, ".ein-dashboard"), { recursive: true });
    expect(removeAppPackage({ root: PI_BIN, commands: ["ein"] })).toBe(1);
    expect(removeAppPackage({ root: join(ROOT, "missing"), commands: ["ein"] })).toBe(0);
  });
});
