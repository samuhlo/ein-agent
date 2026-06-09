// =============================================================================
// DEPENDENCIES
// Check + install the tools Ein needs. bun/pi are required; engram/gh optional.
// git/curl are check-only prerequisites.
// =============================================================================

import type { Platform } from "./platform.ts";
import { lookPath, run } from "./exec.ts";
import { installEngram, resolveEngram } from "./engram.ts";
import { BUN_BIN_DIR, LOCAL_BIN_DIR } from "./paths.ts";

export type DepId = "git" | "curl" | "bun" | "pi" | "engram" | "gh";

export type DepStatus = {
  id: DepId;
  present: boolean;
  path: string | null;
  required: boolean;
  hint: string;
};

const EXTRA_PATH = [BUN_BIN_DIR, LOCAL_BIN_DIR];

export function checkDeps(platform: Platform): DepStatus[] {
  const engram = resolveEngram(platform);
  const defs: Array<Omit<DepStatus, "present" | "path">> = [
    { id: "git", required: true, hint: "instala git con tu gestor de paquetes" },
    { id: "curl", required: true, hint: "instala curl con tu gestor de paquetes" },
    { id: "bun", required: true, hint: "curl -fsSL https://bun.sh/install | bash" },
    { id: "pi", required: true, hint: "bun install -g @earendil-works/pi-coding-agent" },
    { id: "engram", required: false, hint: "memoria persistente (opcional)" },
    { id: "gh", required: false, hint: "GitHub CLI para entrega (opcional)" },
  ];

  return defs.map((d) => {
    if (d.id === "engram") {
      return { ...d, present: engram.found, path: engram.found ? engram.command : null };
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
