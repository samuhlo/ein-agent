// =============================================================================
// DEPENDENCIES
// Check + install the tools Ein needs. bun/pi are required; engram/gh optional.
// git/curl are check-only prerequisites.
// =============================================================================

import { existsSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
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
  activeHome,
  BUN_BIN_DIR,
  defaultPiInstallContext,
  type PiInstallContext,
  LOCAL_BIN_DIR,
  MISE_SHIM_DIR,
} from "./paths.ts";
import {
  isPublishedPackageVersion,
  PI_HOST_PACKAGE,
  PI_HOST_SPEC,
  PI_NODE_MIN_VERSION,
} from "../../../shared/contracts/runtime-compat.ts";

export type DepId =
  | "git"
  | "curl"
  | "node"
  | "bun"
  | "pi"
  | "claude"
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

function isOmarchyMiseWrapper(
  path: string,
  home: string,
  packageName: string,
  bin: string,
): boolean {
  if (path !== join(home, ".local", "bin", bin)) return false;
  try {
    const source = readFileSync(path, "utf8");
    const use = source.includes(`mise use -g --quiet "${packageName}"`)
      || source.includes(`mise use -g "${packageName}"`);
    return use && source.includes(`exec mise x "${packageName}" -- "${bin}"`);
  } catch {
    return false;
  }
}

export type PiRuntimeInspection = {
  path: string | null;
  version: string | null;
  compatible: boolean;
};

export type PiRuntimeInspectionDeps = {
  lookPath?: typeof lookPath;
  readVersion?: (path: string) => string | null;
};

function readPiVersion(path: string): string | null {
  try {
    const result = Bun.spawnSync([path, "--version"], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) return null;
    const version = new TextDecoder().decode(result.stdout).trim();
    return version || null;
  } catch {
    return null;
  }
}

export function inspectPiRuntime(
  searchPath: string[] = EXTRA_PATH,
  deps: PiRuntimeInspectionDeps = {},
): PiRuntimeInspection {
  const path = (deps.lookPath ?? lookPath)("pi", searchPath);
  if (!path) return { path: null, version: null, compatible: false };
  const version = (deps.readVersion ?? readPiVersion)(path);
  return { path, version, compatible: isPublishedPackageVersion(version) };
}

export type NodeRuntimeInspection = {
  path: string | null;
  version: string | null;
  compatible: boolean;
};

export type NodeRuntimeInspectionDeps = {
  lookPath?: typeof lookPath;
  readVersion?: (path: string) => string | null;
};

function readNodeVersion(path: string): string | null {
  try {
    const result = Bun.spawnSync([path, "--version"], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) return null;
    return new TextDecoder().decode(result.stdout).trim() || null;
  } catch {
    return null;
  }
}

export function isCompatibleNodeVersion(version: string | null): boolean {
  const parse = (value: string): readonly [number, number, number] | null => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };
  const current = parse(version ?? "");
  const minimum = parse(PI_NODE_MIN_VERSION);
  if (!current || !minimum) return false;
  return current[0] > minimum[0]
    || (current[0] === minimum[0] && current[1] > minimum[1])
    || (current[0] === minimum[0] && current[1] === minimum[1] && current[2] >= minimum[2]);
}

export function inspectNodeRuntime(
  searchPath: string[] = EXTRA_PATH,
  deps: NodeRuntimeInspectionDeps = {},
): NodeRuntimeInspection {
  const path = (deps.lookPath ?? lookPath)("node", searchPath);
  if (!path) return { path: null, version: null, compatible: false };
  const version = (deps.readVersion ?? readNodeVersion)(path);
  return { path, version, compatible: isCompatibleNodeVersion(version) };
}

export function checkDeps(platform: Platform): DepStatus[] {
  const engram = resolveEngram(platform);
  const nodeRuntime = inspectNodeRuntime();
  const piRuntime = inspectPiRuntime();
  const defs: Array<Omit<DepStatus, "present" | "path">> = [
    { id: "git", required: true, hint: "instala git con tu gestor de paquetes" },
    { id: "curl", required: true, hint: "instala curl con tu gestor de paquetes" },
    { id: "node", required: true, hint: `instala Node ${PI_NODE_MIN_VERSION} o posterior` },
    { id: "bun", required: true, hint: "curl -fsSL https://bun.sh/install | bash" },
    { id: "pi", required: true, hint: `bun install -g ${PI_HOST_SPEC}` },
    { id: "claude", required: false, hint: "complemento opcional: curl -fsSL https://claude.ai/install.sh | bash" },
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
    if (d.id === "node") {
      return { ...d, present: nodeRuntime.compatible, path: nodeRuntime.path };
    }
    if (d.id === "pi") {
      return {
        ...d,
        present: piRuntime.compatible,
        path: piRuntime.path,
      };
    }
    const path = lookPath(d.id, EXTRA_PATH);
    const brokenOmarchyWrapper = path !== null && (
      (d.id === "gh" && isOmarchyMiseWrapper(path, platform.home, "gh", "gh"))
      || (d.id === "claude" && isOmarchyMiseWrapper(path, platform.home, "claude", "claude"))
    );
    return { ...d, present: path !== null && !brokenOmarchyWrapper, path };
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

export type PiInstallDeps = {
  home?: string;
  inspectNode?: () => NodeRuntimeInspection;
  lookPath?: typeof lookPath;
  readPiVersion?: (path: string) => string | null;
  resolveLatestVersion?: () => Promise<PiLatestVersionResolution>;
  run?: typeof run;
  runtimeEnv?: Record<string, string | undefined>;
};

export type PiLatestVersionResolution =
  | { ok: true; version: string }
  | { ok: false; detail: string };

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const PI_NPM_LATEST_URL = `https://registry.npmjs.org/${encodeURIComponent(PI_HOST_PACKAGE)}/latest`;
const PI_LATEST_EVIDENCE_TIMEOUT_MS = 10_000;

/** Resolve fresh npm dist-tag evidence without coupling the pure package contract to I/O. */
export async function resolveLatestPiVersion(fetchFn: FetchLike = fetch): Promise<PiLatestVersionResolution> {
  let response: Response;
  try {
    response = await fetchFn(PI_NPM_LATEST_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(PI_LATEST_EVIDENCE_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, detail: "registro npm no disponible" };
  }
  if (!response.ok) return { ok: false, detail: `registro npm respondió ${response.status}` };
  try {
    const payload = await response.json() as { version?: unknown };
    const version = payload.version;
    return typeof version === "string" && isPublishedPackageVersion(version)
      ? { ok: true, version }
      : { ok: false, detail: "evidencia npm latest malformada" };
  } catch {
    return { ok: false, detail: "evidencia npm latest malformada" };
  }
}

type BunGlobalTarget = {
  binDir: string;
  globalDir: string;
  piPath: string;
};

function existingRedirectedPiTarget(
  canonicalBinDir: string,
  environment: Record<string, string | undefined>,
): BunGlobalTarget | null {
  const binDir = environment.BUN_INSTALL_BIN?.trim();
  const globalDir = environment.BUN_INSTALL_GLOBAL_DIR?.trim();
  if (!binDir || !globalDir || !isAbsolute(binDir) || !isAbsolute(globalDir)) return null;
  if (resolve(binDir) === resolve(canonicalBinDir)) return null;

  const piPath = join(binDir, "pi");
  const manifest = join(globalDir, "node_modules", "@earendil-works", "pi-coding-agent", "package.json");
  // Never create or overwrite an arbitrary redirected `pi`: this path is
  // reconciled only when Bun's matching scoped package is already installed.
  return existsSync(piPath) && existsSync(manifest) ? { binDir, globalDir, piPath } : null;
}

// pi via bun global install. Lands in ~/.bun/bin/pi.
export async function installPi(deps: PiInstallDeps = {}): Promise<InstallStep> {
  const home = deps.home ?? activeHome();
  const bunBinDir = join(home, ".bun", "bin");
  const bunGlobalDir = join(home, ".bun", "install", "global");
  const localBinDir = join(home, ".local", "bin");
  const managedPath = [bunBinDir, localBinDir];
  const piPath = join(bunBinDir, "pi");
  const find = deps.lookPath ?? lookPath;
  const execute = deps.run ?? run;
  const node = (deps.inspectNode ?? inspectNodeRuntime)();
  if (!node.compatible) {
    const found = node.version ? `Node ${node.version} no es compatible.` : "Node no está instalado o no aparece en PATH.";
    return { ok: false, detail: `${found} Pi requiere Node ${PI_NODE_MIN_VERSION} o posterior; actualízalo y repite la instalación.` };
  }
  const bun = find("bun", managedPath);
  if (!bun) return { ok: false, detail: "bun no disponible; instala bun primero" };
  const res = await execute(bun, ["install", "-g", PI_HOST_SPEC], {
    ...CAPTURED,
    extraPath: managedPath,
    env: {
      // Ein owns this Pi runtime. Bun also supports user-wide redirection via
      // BUN_INSTALL_{GLOBAL_DIR,BIN}; overriding both here keeps install,
      // doctor and the launcher on the same canonical executable.
      BUN_INSTALL_GLOBAL_DIR: bunGlobalDir,
      BUN_INSTALL_BIN: bunBinDir,
    },
  });
  // Always name the scoped package: the bare `pi` on npm is an unrelated math
  // library whose bin shadows the agent and breaks `pi`. A truncated hint here
  // is a footgun if a user copies it.
  if (!res.ok) {
    return { ok: false, detail: `'bun install -g ${PI_HOST_SPEC}' falló (${why(res)})` };
  }
  const installedVersion = (deps.readPiVersion ?? readPiVersion)(piPath);
  if (!isPublishedPackageVersion(installedVersion)) {
    const observed = installedVersion ? `devolvió una versión no válida (${installedVersion})` : "no se pudo leer su versión";
    return {
      ok: false,
      detail: `pi en ${piPath}: ${observed} tras instalar ${PI_HOST_SPEC}`,
    };
  }

  let latest: PiLatestVersionResolution;
  try {
    latest = await (deps.resolveLatestVersion ?? resolveLatestPiVersion)();
  } catch {
    latest = { ok: false, detail: "registro npm no disponible" };
  }
  if (!latest.ok) return { ok: false, detail: `pi latest no verificable: ${latest.detail}` };
  if (installedVersion !== latest.version) {
    return {
      ok: false,
      detail: `pi latest no alcanzado en ${piPath}: esperada ${latest.version}; observada ${installedVersion}`,
    };
  }

  // Alpha installers once honored a user-wide Bun redirection and could leave
  // a second Pi installation shadowing the canonical ~/.bun/bin runtime. Keep
  // an existing scoped copy in lockstep, but do not create a new redirected
  // installation merely because those environment variables are present.
  const redirected = existingRedirectedPiTarget(bunBinDir, deps.runtimeEnv ?? process.env);
  if (redirected) {
    const redirectedInstall = await execute(bun, ["install", "-g", PI_HOST_SPEC], {
      ...CAPTURED,
      extraPath: managedPath,
      env: {
        BUN_INSTALL_GLOBAL_DIR: redirected.globalDir,
        BUN_INSTALL_BIN: redirected.binDir,
      },
    });
    if (!redirectedInstall.ok) {
      return { ok: false, detail: `Pi latest canónico instalado, pero la copia Bun heredada no se actualizó (${why(redirectedInstall)})` };
    }
    const redirectedVersion = (deps.readPiVersion ?? readPiVersion)(redirected.piPath);
    if (redirectedVersion !== latest.version) {
      const observed = redirectedVersion ?? "no resoluble";
      return { ok: false, detail: `Pi latest quedó bifurcado: esperada ${latest.version}; canónico ${installedVersion}; copia Bun heredada ${observed}` };
    }
    return { ok: true, detail: `pi ${installedVersion} instalado desde ${PI_HOST_SPEC}; copia Bun heredada reconciliada` };
  }
  return { ok: true, detail: `pi ${installedVersion} instalado desde ${PI_HOST_SPEC}` };
}

export type ClaudeCodeInstallDeps = {
  home?: string;
  lookPath?: typeof lookPath;
  run?: typeof run;
};

// Claude Code via Anthropic's native installer. The native binary lives in
// ~/.local/bin and self-updates; Ein verifies the executable before claiming
// that the isolated Claude surface is usable.
export async function installClaudeCode(deps: ClaudeCodeInstallDeps = {}): Promise<InstallStep> {
  const home = deps.home ?? activeHome();
  const localBinDir = join(home, ".local", "bin");
  const find = deps.lookPath ?? lookPath;
  const execute = deps.run ?? run;
  const extraPath = [localBinDir, join(home, ".bun", "bin")];
  const existing = find("claude", extraPath);
  const omarchyWrapper = existing && isOmarchyMiseWrapper(existing, home, "claude", "claude")
    ? existing
    : null;
  if (existing && !omarchyWrapper) {
    const probe = await execute(existing, ["--version"], CAPTURED);
    if (probe.ok) return { ok: true, detail: "claude code ya presente" };
  }

  // Anthropic's installer deliberately preserves an existing command. Move
  // only the exact generated Omarchy wrapper out of the way, and keep it
  // recoverable until the native binary has answered its version probe.
  const wrapperBackup = omarchyWrapper ? `${omarchyWrapper}.ein-omarchy-wrapper.bak` : null;
  if (omarchyWrapper && wrapperBackup) {
    if (existsSync(wrapperBackup)) {
      return { ok: false, detail: "existe un backup pendiente del wrapper de Claude de Omarchy" };
    }
    try {
      renameSync(omarchyWrapper, wrapperBackup);
    } catch (error) {
      return { ok: false, detail: `no se pudo apartar el wrapper roto de Claude (${error instanceof Error ? error.message : String(error)})` };
    }
  }
  const restoreWrapper = (): void => {
    if (!omarchyWrapper || !wrapperBackup || !existsSync(wrapperBackup) || existsSync(omarchyWrapper)) return;
    try { renameSync(wrapperBackup, omarchyWrapper); } catch { /* recovery path stays visible */ }
  };

  const installed = await execute(
    "bash",
    ["-c", "curl -fsSL https://claude.ai/install.sh | bash"],
    { ...CAPTURED, env: { HOME: home }, extraPath },
  );
  if (!installed.ok) {
    restoreWrapper();
    return { ok: false, detail: `instalación de claude code falló (${why(installed)})` };
  }
  const claude = find("claude", extraPath);
  if (!claude) {
    restoreWrapper();
    return { ok: false, detail: "claude code se instaló pero no aparece en ~/.local/bin" };
  }
  if (isOmarchyMiseWrapper(claude, home, "claude", "claude")) {
    restoreWrapper();
    return { ok: false, detail: "el instalador no reemplazó el wrapper roto de Claude de Omarchy" };
  }
  const probe = await execute(claude, ["--version"], { ...CAPTURED, extraPath });
  if (!probe.ok) {
    restoreWrapper();
    return { ok: false, detail: `claude code instalado pero no ejecutable (${why(probe)})` };
  }
  if (wrapperBackup) {
    try { unlinkSync(wrapperBackup); } catch {
      return { ok: false, detail: "claude funciona, pero no se pudo retirar el backup del wrapper roto de Omarchy" };
    }
  }
  return { ok: true, detail: "claude code instalado" };
}

export async function installEngramDep(platform: Platform): Promise<InstallStep> {
  const result = await installEngram(platform);
  return { ok: result.ok, detail: result.detail };
}

// Install Pi extension packages declared in settings.json (pi-subagents,
// pi-mcp-adapter, ask-user-question, i18n...). Idempotent: `pi install`
// reports "up to date". The caller decides whether a failed reconciliation is
// fatal; fresh installs fail closed while updates retain the working release.
export type PiPackageInstallDeps = {
  lookPath?: typeof lookPath;
  run?: typeof run;
};

export async function installDeclaredPackages(
  context: PiInstallContext = defaultPiInstallContext(),
  deps: PiPackageInstallDeps = {},
): Promise<InstallStep> {
  const extraPath = [context.bunBinDir, context.localBinDir];
  const pi = (deps.lookPath ?? lookPath)("pi", extraPath);
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
  const failed: Array<{ pkg: string; reason: string }> = [];
  for (const pkg of packages) {
    const res = await (deps.run ?? run)(pi, ["install", pkg], {
      extraPath,
      env: {
        PI_CODING_AGENT_DIR: context.agentDir,
        EIN_PI_AGENT_HOME: context.agentDir,
      },
    });
    if (res.ok) ok += 1;
    else failed.push({ pkg, reason: why(res) });
  }
  if (failed.length === 0) return { ok: true, detail: `${ok} paquetes instalados/al dia` };

  const first = failed[0]!;
  const remaining = failed.length - 1;
  return {
    ok: false,
    detail: `${failed.length}/${packages.length} fallaron; primera causa: ${first.reason} (${first.pkg})${remaining > 0 ? `; +${remaining}` : ""}`,
  };
}

export type GhInstallDeps = {
  home?: string;
  lookPath?: typeof lookPath;
  run?: typeof run;
  isRoot?: () => boolean;
};

// gh: best-effort via Omarchy's package wrapper or the platform package
// manager. Optional, never blocks the rest of Ein, but a confirmed install must
// actually execute and verify gh instead of printing a manual command.
export async function installGh(platform: Platform, deps: GhInstallDeps = {}): Promise<InstallStep> {
  const home = deps.home ?? activeHome();
  const find = deps.lookPath ?? lookPath;
  const execute = deps.run ?? run;
  const current = find("gh", EXTRA_PATH);
  if (current && !isOmarchyMiseWrapper(current, home, "gh", "gh")) {
    const probe = await execute(current, ["--version"], CAPTURED);
    if (probe.ok) return { ok: true, detail: "gh ya presente" };
  }

  const omarchyInstaller = find("omarchy-mise-install");
  if (platform.packageManager === "pacman" && omarchyInstaller) {
    const result = await execute(
      omarchyInstaller,
      ["github:cli/cli", "gh"],
      { ...CAPTURED, env: { HOME: home }, extraPath: [join(home, ".local", "bin")] },
    );
    if (!result.ok) return { ok: false, detail: `omarchy no pudo preparar gh (${why(result)})` };
    const gh = find("gh", [join(home, ".local", "bin")]);
    if (!gh) return { ok: false, detail: "omarchy preparó gh pero el comando no aparece en ~/.local/bin" };
    const probe = await execute(gh, ["--version"], { ...CAPTURED, extraPath: [join(home, ".local", "bin")] });
    return probe.ok
      ? { ok: true, detail: "gh instalado via omarchy/mise" }
      : { ok: false, detail: `omarchy preparó gh pero no se puede ejecutar (${why(probe)})` };
  }

  switch (platform.packageManager) {
    case "brew": {
      const res = await execute("brew", ["install", "gh"], CAPTURED);
      if (!res.ok) return { ok: false, detail: `brew install gh falló (${why(res)})` };
      break;
    }
    case "apt":
    case "dnf":
    case "pacman": {
      const manager = platform.packageManager === "apt" ? "apt-get" : platform.packageManager;
      const managerArgs = platform.packageManager === "pacman"
        ? ["-S", "--noconfirm", "--needed", "github-cli"]
        : ["install", "-y", "gh"];
      const root = deps.isRoot?.() ?? (typeof process.getuid === "function" && process.getuid() === 0);
      const command = root ? manager : "sudo";
      const args = root ? managerArgs : [manager, ...managerArgs];
      const res = await execute(command, args, { ...CAPTURED, inherit: true });
      if (!res.ok) return { ok: false, detail: `${manager} no pudo instalar gh (${why(res)})` };
      break;
    }
    default:
      return { ok: false, detail: "instala gh manualmente desde cli.github.com" };
  }
  const gh = find("gh", ["/usr/local/bin", "/usr/bin"]);
  if (!gh) return { ok: false, detail: "el gestor terminó pero gh no aparece en PATH" };
  const probe = await execute(gh, ["--version"], CAPTURED);
  return probe.ok
    ? { ok: true, detail: `gh instalado via ${platform.packageManager}` }
    : { ok: false, detail: `gh se instaló pero no se puede ejecutar (${why(probe)})` };
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
