// =============================================================================
// DEPENDENCIES
// Check + install the tools Ein needs. bun/pi are required; engram/gh optional.
// git/curl are check-only prerequisites.
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Platform } from "./platform.ts";
import { lookPath, run } from "./exec.ts";
import { installEngram, resolveEngram } from "./engram.ts";
import {
  AGENT_DIR,
  BUN_BIN_DIR,
  LOCAL_BIN_DIR,
  MISE_SHIM_DIR,
} from "./paths.ts";

export type DepId = "git" | "curl" | "bun" | "pi" | "engram" | "gh" | "hypa";

export type DepStatus = {
  id: DepId;
  present: boolean;
  path: string | null;
  required: boolean;
  hint: string;
};

const EXTRA_PATH = [BUN_BIN_DIR, LOCAL_BIN_DIR];

// hypa: el installer oficial lo deja en ~/.local/bin, o mise lo shima cuando el
// script prefiere npm global. Se busca en ambos además del PATH.
const HYPA_PATH = [BUN_BIN_DIR, LOCAL_BIN_DIR, MISE_SHIM_DIR];

export function resolveHypa(): string | null {
  return lookPath("hypa", HYPA_PATH);
}

export function checkDeps(platform: Platform): DepStatus[] {
  const engram = resolveEngram(platform);
  const defs: Array<Omit<DepStatus, "present" | "path">> = [
    { id: "git", required: true, hint: "instala git con tu gestor de paquetes" },
    { id: "curl", required: true, hint: "instala curl con tu gestor de paquetes" },
    { id: "bun", required: true, hint: "curl -fsSL https://bun.sh/install | bash" },
    { id: "pi", required: true, hint: "bun install -g @earendil-works/pi-coding-agent" },
    { id: "engram", required: false, hint: "memoria persistente (opcional)" },
    { id: "gh", required: false, hint: "GitHub CLI para entrega (opcional)" },
    { id: "hypa", required: false, hint: "compresión de salida de comandos (opcional)" },
  ];

  return defs.map((d) => {
    if (d.id === "engram") {
      return { ...d, present: engram.found, path: engram.found ? engram.command : null };
    }
    if (d.id === "hypa") {
      const path = resolveHypa();
      return { ...d, present: path !== null, path };
    }
    const path = lookPath(d.id, EXTRA_PATH);
    return { ...d, present: path !== null, path };
  });
}

export type InstallStep = { ok: boolean; detail: string };

// bun via the official installer script. Lands in ~/.bun/bin.
export async function installBun(): Promise<InstallStep> {
  if (lookPath("bun", EXTRA_PATH)) return { ok: true, detail: "bun ya presente" };
  const res = await run("sh", ["-c", "curl -fsSL https://bun.sh/install | bash"], {
    inherit: true,
  });
  if (!res.ok) return { ok: false, detail: "instalacion de bun fallo" };
  return lookPath("bun", EXTRA_PATH)
    ? { ok: true, detail: "bun instalado" }
    : { ok: false, detail: "bun instalado pero no resoluble; reinicia el shell" };
}

// pi via bun global install. Lands in ~/.bun/bin/pi.
export async function installPi(): Promise<InstallStep> {
  const bun = lookPath("bun", EXTRA_PATH);
  if (!bun) return { ok: false, detail: "bun no disponible; instala bun primero" };
  const res = await run(bun, ["install", "-g", "@earendil-works/pi-coding-agent"], {
    inherit: true,
    extraPath: EXTRA_PATH,
  });
  if (!res.ok) return { ok: false, detail: "bun install -g pi fallo" };
  return lookPath("pi", EXTRA_PATH)
    ? { ok: true, detail: "pi instalado" }
    : { ok: false, detail: "pi instalado pero no resoluble; reinicia el shell" };
}

export async function installEngramDep(platform: Platform): Promise<InstallStep> {
  const result = await installEngram(platform);
  return { ok: result.ok, detail: result.detail };
}

// Install Pi extension packages declared in settings.json (pi-subagents,
// pi-mcp-adapter, ask-user-question, i18n...). Idempotent: `pi install`
// reports "up to date". Best-effort.
export async function installDeclaredPackages(): Promise<InstallStep> {
  const pi = lookPath("pi", EXTRA_PATH);
  if (!pi) return { ok: false, detail: "pi no disponible; salto paquetes" };
  const settingsPath = join(AGENT_DIR, "settings.json");
  if (!existsSync(settingsPath)) return { ok: true, detail: "sin settings.json" };

  let packages: string[] = [];
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as { packages?: unknown };
    if (Array.isArray(parsed.packages)) {
      packages = parsed.packages.filter((p): p is string => typeof p === "string");
    }
  } catch {
    return { ok: false, detail: "settings.json ilegible" };
  }
  if (packages.length === 0) return { ok: true, detail: "sin paquetes declarados" };

  let ok = 0;
  const failed: string[] = [];
  for (const pkg of packages) {
    const res = await run(pi, ["install", pkg], { extraPath: EXTRA_PATH });
    if (res.ok) ok += 1;
    else failed.push(pkg);
  }
  return failed.length === 0
    ? { ok: true, detail: `${ok} paquetes instalados/al dia` }
    : { ok: false, detail: `fallaron: ${failed.join(", ")}` };
}

// gh: best-effort via the platform package manager. Optional, never blocks.
export async function installGh(platform: Platform): Promise<InstallStep> {
  if (lookPath("gh", EXTRA_PATH)) return { ok: true, detail: "gh ya presente" };
  switch (platform.packageManager) {
    case "brew":
      return (await run("brew", ["install", "gh"], { inherit: true })).ok
        ? { ok: true, detail: "gh instalado via brew" }
        : { ok: false, detail: "brew install gh fallo" };
    case "apt":
      return { ok: false, detail: "instala gh manualmente: sudo apt install gh" };
    case "dnf":
      return { ok: false, detail: "instala gh manualmente: sudo dnf install gh" };
    case "pacman":
      return { ok: false, detail: "instala gh manualmente: sudo pacman -S github-cli" };
    default:
      return { ok: false, detail: "instala gh manualmente desde cli.github.com" };
  }
}

// hypa: best-effort vía el instalador oficial (verifica checksum, cae en
// ~/.local/bin o npm global). Opcional, nunca bloquea. El script prefiere npm
// si existe; si no, baja el binario self-contained por plataforma.
export async function installHypa(): Promise<InstallStep> {
  if (resolveHypa()) return { ok: true, detail: "hypa ya presente" };
  const res = await run(
    "sh",
    ["-c", "curl -fsSL https://hypabolic.github.io/Hypa/install.sh | sh"],
    { inherit: true },
  );
  if (!res.ok) return { ok: false, detail: "instala hypa manualmente: hypabolic.github.io/Hypa" };
  return resolveHypa()
    ? { ok: true, detail: "hypa instalado" }
    : { ok: false, detail: "hypa instalado pero no resuelto en PATH (reinicia shell)" };
}
