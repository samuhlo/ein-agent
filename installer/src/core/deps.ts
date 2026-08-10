// =============================================================================
// DEPENDENCIES
// Check + install the tools Ein needs. bun/pi are required; engram/gh optional.
// git/curl are check-only prerequisites.
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Platform } from "./platform.ts";
import {
  EXTERNAL_TOOL_TIMEOUT_MS,
  lastLine,
  lookPath,
  run,
  type RunOptions,
  type RunResult,
} from "./exec.ts";
import {
  brewFailureDetail,
  ENGRAM_FORMULA,
  installEngram,
  resolveEngram,
} from "./engram.ts";
import {
  BUN_BIN_DIR,
  defaultPiInstallContext,
  type PiInstallContext,
  LOCAL_BIN_DIR,
  MISE_SHIM_DIR,
} from "./paths.ts";

export type DepId =
  | "git"
  | "curl"
  | "bun"
  | "pi"
  | "engram"
  | "gh"
  | "hypa"
  | "codegraph";

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

export function resolveHypa(searchPath: string[] = HYPA_PATH): string | null {
  return lookPath("hypa", searchPath);
}

// codegraph: npm global (mise lo shima) o instaladores en ~/.local/bin.
export function resolveCodegraph(searchPath: string[] = HYPA_PATH): string | null {
  return lookPath("codegraph", searchPath);
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
    { id: "codegraph", required: false, hint: "grafo de código para exploración barata (opcional)" },
  ];

  return defs.map((d) => {
    if (d.id === "engram") {
      return { ...d, present: engram.found, path: engram.found ? engram.command : null };
    }
    if (d.id === "hypa") {
      const path = resolveHypa();
      return { ...d, present: path !== null, path };
    }
    if (d.id === "codegraph") {
      const path = resolveCodegraph();
      return { ...d, present: path !== null, path };
    }
    const path = lookPath(d.id, EXTRA_PATH);
    return { ...d, present: path !== null, path };
  });
}

export type InstallStep = { ok: boolean; detail: string };

// Los instaladores externos corren bajo un spinner de clack, que repinta una
// línea sola. Heredar stdio deja que brew/npm/curl escriban encima y parta la
// terminal, así que su salida se captura y solo se rescata la línea de error.
const CAPTURED: RunOptions = { timeoutMs: EXTERNAL_TOOL_TIMEOUT_MS };

function why(res: RunResult): string {
  return lastLine(res.stderr) || lastLine(res.stdout) || `exit ${res.code}`;
}

// bun via the official installer script. Lands in ~/.bun/bin.
export async function installBun(): Promise<InstallStep> {
  if (lookPath("bun", EXTRA_PATH)) return { ok: true, detail: "bun ya presente" };
  const res = await run("sh", ["-c", "curl -fsSL https://bun.sh/install | bash"], CAPTURED);
  if (!res.ok) return { ok: false, detail: `instalación de bun falló (${why(res)})` };
  return lookPath("bun", EXTRA_PATH)
    ? { ok: true, detail: "bun instalado" }
    : { ok: false, detail: "bun instalado pero no resoluble; reinicia el shell" };
}

// pi via bun global install. Lands in ~/.bun/bin/pi.
export async function installPi(): Promise<InstallStep> {
  const bun = lookPath("bun", EXTRA_PATH);
  if (!bun) return { ok: false, detail: "bun no disponible; instala bun primero" };
  const res = await run(bun, ["install", "-g", "@earendil-works/pi-coding-agent"], {
    ...CAPTURED,
    extraPath: EXTRA_PATH,
  });
  // Always name the scoped package: the bare `pi` on npm is an unrelated math
  // library whose bin shadows the agent and breaks `pi`. A truncated hint here
  // is a footgun if a user copies it.
  if (!res.ok) {
    return { ok: false, detail: `'bun install -g @earendil-works/pi-coding-agent' falló (${why(res)})` };
  }
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
export async function installDeclaredPackages(
  context: PiInstallContext = defaultPiInstallContext(),
): Promise<InstallStep> {
  const extraPath = [context.bunBinDir, context.localBinDir];
  const pi = lookPath("pi", extraPath);
  if (!pi) return { ok: false, detail: "pi no disponible; salto paquetes" };
  const settingsPath = join(context.agentDir, "settings.json");
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
    const res = await run(pi, ["install", pkg], { extraPath });
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
    case "brew": {
      const res = await run("brew", ["install", "gh"], CAPTURED);
      return res.ok
        ? { ok: true, detail: "gh instalado via brew" }
        : { ok: false, detail: `brew install gh falló (${why(res)})` };
    }
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

// codegraph: best-effort vía el instalador oficial. Opcional, nunca bloquea.
// BLINDAJE -> tras instalar, telemetría OFF siempre (default-on upstream; la
// política de Ein es no telemetría, igual que enableInstallTelemetry: false).
export async function installCodegraph(): Promise<InstallStep> {
  if (resolveCodegraph()) return { ok: true, detail: "codegraph ya presente" };
  const res = await run(
    "sh",
    ["-c", "curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh"],
    CAPTURED,
  );
  if (!res.ok) return { ok: false, detail: "instala codegraph manualmente: npm i -g @colbymchenry/codegraph" };
  const bin = resolveCodegraph();
  if (!bin) return { ok: false, detail: "codegraph instalado pero no resuelto en PATH (reinicia shell)" };
  await run(bin, ["telemetry", "off"]);
  return { ok: true, detail: "codegraph instalado (telemetría off)" };
}

// hypa: best-effort vía el instalador oficial (verifica checksum, cae en
// ~/.local/bin o npm global). Opcional, nunca bloquea. El script prefiere npm
// si existe; si no, baja el binario self-contained por plataforma.
export async function installHypa(): Promise<InstallStep> {
  if (resolveHypa()) return { ok: true, detail: "hypa ya presente" };
  const res = await run(
    "sh",
    ["-c", "curl -fsSL https://hypabolic.github.io/Hypa/install.sh | sh"],
    CAPTURED,
  );
  if (!res.ok) return { ok: false, detail: "instala hypa manualmente: hypabolic.github.io/Hypa" };
  return resolveHypa()
    ? { ok: true, detail: "hypa instalado" }
    : { ok: false, detail: "hypa instalado pero no resuelto en PATH (reinicia shell)" };
}

// ── Refresh de deps externas (auto-update) ──────────────────────────────────
// Los instaladores de arriba hacen skip-si-presente para que `install` sea
// rápido. Estas variantes RE-EJECUTAN el instalador oficial (que baja la última
// versión) SOLO para las herramientas ya presentes, de modo que `ein update` las
// mantenga al día. Si el tool no está, no se instala: respeta el opt-out
// (--no-hypa/--no-codegraph/--no-engram). Best-effort: nunca bloquean el update,
// y un fallo de red conserva la versión actual.

export async function refreshCodegraph(): Promise<InstallStep> {
  if (!resolveCodegraph()) return { ok: true, detail: "codegraph no instalado; nada que actualizar" };
  const res = await run(
    "sh",
    ["-c", "curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh"],
    CAPTURED,
  );
  if (!res.ok) {
    return { ok: false, detail: `codegraph: falló al actualizar, se conserva la versión actual (${why(res)})` };
  }
  const bin = resolveCodegraph();
  if (bin) await run(bin, ["telemetry", "off"]);
  return { ok: true, detail: "codegraph actualizado (telemetría off)" };
}

export async function refreshHypa(): Promise<InstallStep> {
  if (!resolveHypa()) return { ok: true, detail: "hypa no instalado; nada que actualizar" };
  const res = await run(
    "sh",
    ["-c", "curl -fsSL https://hypabolic.github.io/Hypa/install.sh | sh"],
    CAPTURED,
  );
  return res.ok
    ? { ok: true, detail: "hypa actualizado" }
    : { ok: false, detail: `hypa: falló al actualizar, se conserva la versión actual (${why(res)})` };
}

// Inyectables para poder fijar el contrato de honestidad sin tocar la red ni
// depender del brew de la máquina que corre los tests.
export type EngramRefreshDeps = {
  run?: typeof run;
  installEngram?: typeof installEngram;
  resolveEngram?: typeof resolveEngram;
};

/**
 * BLINDAJE -> El resultado de brew se comprueba SIEMPRE. La versión anterior
 * descartaba el exit code y reportaba éxito fijo asumiendo que un fallo solo
 * podía significar "ya al día"; con el gate de taps no confiados de Homebrew eso
 * pasó a tapar un fallo real y dejar engram congelado sin decirlo.
 */
export async function refreshEngram(
  platform: Platform,
  deps: EngramRefreshDeps = {},
): Promise<InstallStep> {
  const exec = deps.run ?? run;
  const resolve = deps.resolveEngram ?? resolveEngram;
  const install = deps.installEngram ?? installEngram;

  if (!resolve(platform).found) return { ok: true, detail: "engram no instalado; nada que actualizar" };
  if (platform.os === "darwin" && platform.packageManager === "brew") {
    // brew upgrade es idempotente: con la última ya instalada sale 0 sin hacer nada.
    const res = await exec("brew", ["upgrade", "--formula", ENGRAM_FORMULA], CAPTURED);
    return res.ok
      ? { ok: true, detail: "engram: brew upgrade aplicado (o ya al día)" }
      : { ok: false, detail: brewFailureDetail("upgrade", res) };
  }
  // Linux: installEngram siempre baja la última release y sobrescribe el binario.
  const result = await install(platform);
  return result.ok
    ? { ok: true, detail: "engram actualizado a la última release" }
    : { ok: false, detail: `engram: falló al actualizar (${result.detail})` };
}

// Refresca las tres deps externas presentes. El orden no importa; cada una es
// independiente y best-effort.
export async function refreshExternalTools(platform: Platform): Promise<InstallStep[]> {
  return [
    await refreshEngram(platform),
    await refreshHypa(),
    await refreshCodegraph(),
  ];
}
