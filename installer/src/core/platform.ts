// =============================================================================
// PLATFORM DETECTION
// OS / arch / linux distro / shell + rc file. Pure detection, no side effects.
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export type OS = "darwin" | "linux";
export type Arch = "arm64" | "x64";
export type LinuxDistro = "ubuntu" | "debian" | "arch" | "fedora" | "unknown";
export type PackageManager = "brew" | "apt" | "dnf" | "pacman" | "none";
export type Shell = "zsh" | "bash" | "fish" | "unknown";

export type Platform = {
  os: OS;
  arch: Arch;
  distro: LinuxDistro;
  packageManager: PackageManager;
  shell: Shell;
  shellRc: string;
  home: string;
};

// uname -s is the source of truth; node's process.platform matches it closely.
function detectOS(): OS {
  const p = process.platform;
  if (p === "darwin") return "darwin";
  if (p === "linux") return "linux";
  throw new Error(
    `Sistema no soportado: ${p}. El instalador de Ein solo cubre macOS y Linux.`,
  );
}

// Normalize node's arch to the goreleaser-style tokens we use for assets.
function detectArch(): Arch {
  const a = process.arch;
  if (a === "arm64") return "arm64";
  if (a === "x64") return "x64";
  throw new Error(
    `Arquitectura no soportada: ${a}. Ein solo cubre arm64 y x86_64.`,
  );
}

// Parse /etc/os-release ID + ID_LIKE to map the distro family.
function detectLinuxDistro(): LinuxDistro {
  const releasePath = "/etc/os-release";
  if (!existsSync(releasePath)) return "unknown";
  let content = "";
  try {
    content = readFileSync(releasePath, "utf8");
  } catch {
    return "unknown";
  }
  const fields = new Map<string, string>();
  for (const line of content.split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^"|"$/g, "");
    fields.set(key, value.toLowerCase());
  }
  const id = fields.get("ID") ?? "";
  const idLike = fields.get("ID_LIKE") ?? "";
  const haystack = `${id} ${idLike}`;
  if (haystack.includes("ubuntu")) return "ubuntu";
  if (haystack.includes("debian")) return "debian";
  if (haystack.includes("arch")) return "arch";
  if (haystack.includes("fedora") || haystack.includes("rhel")) return "fedora";
  return "unknown";
}

function detectPackageManager(os: OS, distro: LinuxDistro): PackageManager {
  if (os === "darwin") return "brew";
  switch (distro) {
    case "ubuntu":
    case "debian":
      return "apt";
    case "arch":
      return "pacman";
    case "fedora":
      return "dnf";
    default:
      return "none";
  }
}

function detectShell(): Shell {
  const shellPath = process.env.SHELL ?? "";
  const name = basename(shellPath);
  if (name === "zsh") return "zsh";
  if (name === "bash") return "bash";
  if (name === "fish") return "fish";
  return "unknown";
}

// Resolve the rc file we append PATH/env exports to.
function detectShellRc(shell: Shell, home: string): string {
  switch (shell) {
    case "zsh":
      return join(home, ".zshrc");
    case "bash":
      // .bashrc is the interactive non-login default on Linux; macOS uses .bash_profile.
      return join(home, process.platform === "darwin" ? ".bash_profile" : ".bashrc");
    case "fish":
      return join(home, ".config", "fish", "config.fish");
    default:
      return join(home, ".profile");
  }
}

export function detectPlatform(): Platform {
  const os = detectOS();
  const arch = detectArch();
  const distro = os === "linux" ? detectLinuxDistro() : "unknown";
  const packageManager = detectPackageManager(os, distro);
  const shell = detectShell();
  const home = homedir();
  const shellRc = detectShellRc(shell, home);
  return { os, arch, distro, packageManager, shell, shellRc, home };
}

// Human-readable one-liner for banners / logs.
export function describePlatform(p: Platform): string {
  const parts: string[] = [p.os, p.arch];
  if (p.os === "linux" && p.distro !== "unknown") parts.push(p.distro);
  parts.push(p.shell);
  return parts.join(" / ");
}
