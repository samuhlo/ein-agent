import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installClaudeCode,
  installGh,
} from "../installer/src/core/deps.ts";
import type { Platform } from "../installer/src/core/platform.ts";
import type { RunOptions } from "../installer/src/core/exec.ts";

type Invocation = {
  command: string;
  args: string[];
  options?: RunOptions;
};

const platform = (packageManager: Platform["packageManager"]): Platform => ({
  os: packageManager === "brew" ? "darwin" : "linux",
  arch: "x64",
  distro: packageManager === "pacman" ? "arch" : packageManager === "apt" ? "ubuntu" : "unknown",
  packageManager,
  shell: "fish",
  shellRc: "/fake/home/.config/fish/config.fish",
  home: "/fake/home",
});

const ok = { ok: true, code: 0, stdout: "version", stderr: "" } as const;

describe("Claude Code dependency", () => {
  test("uses Anthropic's native installer and verifies the resulting executable", async () => {
    const home = "/fake/home";
    const claude = join(home, ".local", "bin", "claude");
    const calls: Invocation[] = [];
    let installed = false;
    const result = await installClaudeCode({
      home,
      lookPath: (command) => command === "claude" && installed ? claude : null,
      run: async (command, args, options) => {
        calls.push({ command, args: args ?? [], options });
        if (command === "bash") installed = true;
        return ok;
      },
    });

    expect(result).toEqual({ ok: true, detail: "claude code instalado" });
    expect(calls.map(({ command, args }) => [command, ...args])).toEqual([
      ["bash", "-c", "curl -fsSL https://claude.ai/install.sh | bash"],
      [claude, "--version"],
    ]);
    expect(calls[0]?.options?.env).toEqual({ HOME: home });
  });

  test("does not claim success when the installer produces no executable", async () => {
    const result = await installClaudeCode({
      home: "/fake/home",
      lookPath: () => null,
      run: async () => ok,
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("no aparece");
  });

  test("replaces Omarchy's bare mise wrapper instead of accepting it as Claude", async () => {
    const home = mkdtempSync(join(tmpdir(), "ein-claude-wrapper-"));
    const localBin = join(home, ".local", "bin");
    const claude = join(localBin, "claude");
    mkdirSync(localBin, { recursive: true });
    writeFileSync(claude, [
      "#!/bin/bash",
      'mise use -g --quiet "claude" || exit 1',
      'exec mise x "claude" -- "claude" "$@"',
      "",
    ].join("\n"), { mode: 0o755 });
    const calls: Invocation[] = [];
    try {
      const result = await installClaudeCode({
        home,
        lookPath: (command) => command === "claude" ? claude : null,
        run: async (command, args, options) => {
          calls.push({ command, args: args ?? [], options });
          if (command === "bash") {
            writeFileSync(claude, "#!/bin/sh\necho '2.1.0 (Claude Code)'\n");
            chmodSync(claude, 0o755);
          }
          return ok;
        },
      });
      expect(result).toEqual({ ok: true, detail: "claude code instalado" });
      expect(calls.map(({ command, args }) => [command, ...args])).toEqual([
        ["bash", "-c", "curl -fsSL https://claude.ai/install.sh | bash"],
        [claude, "--version"],
      ]);
      expect(Bun.file(`${claude}.ein-omarchy-wrapper.bak`).size).toBe(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("restores Omarchy's wrapper when the native Claude install fails", async () => {
    const home = mkdtempSync(join(tmpdir(), "ein-claude-wrapper-"));
    const localBin = join(home, ".local", "bin");
    const claude = join(localBin, "claude");
    const wrapper = [
      "#!/bin/bash",
      'mise use -g --quiet "claude" || exit 1',
      'exec mise x "claude" -- "claude" "$@"',
      "",
    ].join("\n");
    mkdirSync(localBin, { recursive: true });
    writeFileSync(claude, wrapper, { mode: 0o755 });
    try {
      const result = await installClaudeCode({
        home,
        lookPath: (command) => command === "claude" ? claude : null,
        run: async () => ({ ok: false, code: 1, stdout: "", stderr: "offline" }),
      });
      expect(result).toEqual({ ok: false, detail: "instalación de claude code falló (offline)" });
      expect(await Bun.file(claude).text()).toBe(wrapper);
      expect(Bun.file(`${claude}.ein-omarchy-wrapper.bak`).size).toBe(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("GitHub CLI dependency", () => {
  test("repairs Omarchy's gh wrapper with the explicit GitHub mise backend and verifies it", async () => {
    const home = "/fake/home";
    const helper = "/usr/bin/omarchy-mise-install";
    const gh = join(home, ".local", "bin", "gh");
    const calls: Invocation[] = [];
    let installed = false;
    const result = await installGh(platform("pacman"), {
      home,
      lookPath: (command) => command === "omarchy-mise-install"
        ? helper
        : command === "gh" && installed
          ? gh
          : null,
      run: async (command, args, options) => {
        calls.push({ command, args: args ?? [], options });
        if (command === helper) installed = true;
        return ok;
      },
    });

    expect(result).toEqual({ ok: true, detail: "gh instalado via omarchy/mise" });
    expect(calls.map(({ command, args }) => [command, ...args])).toEqual([
      [helper, "github:cli/cli", "gh"],
      [gh, "--version"],
    ]);
  });

  test("falls back to the real Arch package install with inherited sudo input", async () => {
    const calls: Invocation[] = [];
    let installed = false;
    const result = await installGh(platform("pacman"), {
      home: "/fake/home",
      isRoot: () => false,
      lookPath: (command) => command === "gh" && installed ? "/usr/bin/gh" : null,
      run: async (command, args, options) => {
        calls.push({ command, args: args ?? [], options });
        if (command === "sudo") installed = true;
        return ok;
      },
    });

    expect(result).toEqual({ ok: true, detail: "gh instalado via pacman" });
    expect(calls.map(({ command, args }) => [command, ...args])).toEqual([
      ["sudo", "pacman", "-S", "--noconfirm", "--needed", "github-cli"],
      ["/usr/bin/gh", "--version"],
    ]);
    expect(calls[0]?.options?.inherit).toBe(true);
  });

  test("propagates a package-manager failure as an honest optional failure", async () => {
    const result = await installGh(platform("pacman"), {
      isRoot: () => false,
      lookPath: () => null,
      run: async () => ({ ok: false, code: 1, stdout: "", stderr: "denied" }),
    });
    expect(result).toEqual({ ok: false, detail: "pacman no pudo instalar gh (denied)" });
  });
});
