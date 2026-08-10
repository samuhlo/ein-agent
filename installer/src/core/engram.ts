// =============================================================================
// ENGRAM RESOLUTION
// Finds the engram binary across platforms so mcp.json gets a correct path.
// Install logic (brew tap / linux release download) lives in deps.ts (Fase 3).
// =============================================================================

import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Platform } from "./platform.ts";
import {
  EXTERNAL_TOOL_TIMEOUT_MS,
  lastLine,
  resolveFromCandidates,
  run,
  type RunResult,
} from "./exec.ts";
import { BUN_BIN_DIR, LOCAL_BIN_DIR } from "./paths.ts";

export type EngramResolution = {
  // Absolute path if found, or the literal "engram" fallback.
  command: string;
  found: boolean;
};

export type EngramSearchPaths = {
  bunBinDir: string;
  localBinDir: string;
};

// Candidate locations engram may live in, by platform.
function candidatePaths(
  platform: Platform,
  searchPaths: EngramSearchPaths = { bunBinDir: BUN_BIN_DIR, localBinDir: LOCAL_BIN_DIR },
): string[] {
  if (platform.os === "darwin") {
    return [
      "/opt/homebrew/bin/engram", // Apple Silicon brew
      "/usr/local/bin/engram", // Intel brew
      join(searchPaths.localBinDir, "engram"),
    ];
  }
  // linux
  return [
    "/usr/local/bin/engram",
    join(searchPaths.localBinDir, "engram"),
    join(searchPaths.bunBinDir, "engram"),
  ];
}

// Resolve engram for mcp.json. Absolute path when found; bare "engram" otherwise
// so the JSON stays valid (doctor flags it as WARN if PATH can't resolve later).
export function resolveEngram(
  platform: Platform,
  searchPaths: EngramSearchPaths = { bunBinDir: BUN_BIN_DIR, localBinDir: LOCAL_BIN_DIR },
): EngramResolution {
  const found = resolveFromCandidates("engram", candidatePaths(platform, searchPaths), [
    searchPaths.bunBinDir,
    searchPaths.localBinDir,
  ]);
  if (found) {
    // macOS: Cellar paths are versioned and break on brew upgrade. Prefer the
    // stable symlink under bin.
    if (found.includes("/Cellar/")) {
      const stable = candidatePaths(platform, searchPaths).find((c) => c.endsWith("/bin/engram"));
      return { command: stable ?? found, found: true };
    }
    return { command: found, found: true };
  }
  return { command: "engram", found: false };
}

// --- Installation --------------------------------------------------------

const ENGRAM_REPO = "Gentleman-Programming/engram";

export const ENGRAM_TAP = "gentleman-programming/tap";
// Cualificada y con --formula: el tap publica formula y cask con el mismo
// nombre, y `brew install engram` a secas deja que brew adivine.
export const ENGRAM_FORMULA = `${ENGRAM_TAP}/engram`;

export type EngramInstall = { ok: boolean; path?: string; detail: string };

/**
 * Traduce un `brew` fallido a un detalle accionable.
 *
 * BLINDAJE -> Homebrew moderno se niega a cargar formulas de taps de terceros
 * hasta que el usuario los confía explícitamente. Ein NO ejecuta `brew trust`
 * por su cuenta: saltarse esa barrera en silencio es justo lo que Homebrew
 * añadió el gate para impedir. Se reporta el fallo con el comando exacto.
 */
export function brewFailureDetail(action: "install" | "upgrade", res: RunResult): string {
  if (/untrusted tap/i.test(`${res.stderr}\n${res.stdout}`)) {
    return `engram: brew no confía en el tap; ejecuta \`brew trust ${ENGRAM_TAP}\` y repite`;
  }
  const reason = lastLine(res.stderr) || lastLine(res.stdout) || `exit ${res.code}`;
  return `engram: brew ${action} falló (${reason})`;
}

// macOS: brew tap + install. Returns once engram resolves on PATH.
async function installEngramMac(): Promise<EngramInstall> {
  const tap = await run("brew", ["tap", "Gentleman-Programming/homebrew-tap"], {
    timeoutMs: EXTERNAL_TOOL_TIMEOUT_MS,
  });
  if (!tap.ok) return { ok: false, detail: `brew tap falló (${lastLine(tap.stderr) || `exit ${tap.code}`})` };
  const inst = await run("brew", ["install", "--formula", ENGRAM_FORMULA], {
    timeoutMs: EXTERNAL_TOOL_TIMEOUT_MS,
  });
  if (!inst.ok) return { ok: false, detail: brewFailureDetail("install", inst) };
  return { ok: true, detail: "engram instalado via brew" };
}

// Map our arch token to the engram release convention (amd64/arm64).
function engramArchToken(platform: Platform): string {
  return platform.arch === "x64" ? "amd64" : "arm64";
}

// Pick the matching release asset URL by fuzzy os+arch substrings.
async function resolveEngramAssetUrl(platform: Platform): Promise<string | null> {
  const res = await run("curl", [
    "-fsSL",
    `https://api.github.com/repos/${ENGRAM_REPO}/releases/latest`,
  ]);
  if (!res.ok) return null;
  let release: { assets?: Array<{ name: string; browser_download_url: string }> };
  try {
    release = JSON.parse(res.stdout);
  } catch {
    return null;
  }
  const osToken = platform.os; // darwin | linux
  const archToken = engramArchToken(platform);
  const asset = (release.assets ?? []).find(
    (a) =>
      a.name.includes(`_${osToken}_`) &&
      a.name.includes(`_${archToken}`) &&
      a.name.endsWith(".tar.gz"),
  );
  return asset?.browser_download_url ?? null;
}

// Choose a writable bin dir, preferring ~/.local/bin to avoid sudo.
function engramInstallDir(): string {
  return LOCAL_BIN_DIR;
}

// Linux (and generic non-brew): download the release tarball, extract the
// engram binary, place it in ~/.local/bin, chmod 755.
async function installEngramLinux(platform: Platform): Promise<EngramInstall> {
  const url = await resolveEngramAssetUrl(platform);
  if (!url) return { ok: false, detail: "no se encontró asset de engram para esta plataforma" };

  const staging = mkdtempSync(join(tmpdir(), "ein-engram-"));
  const tarPath = join(staging, "engram.tar.gz");
  try {
    const dl = await run("curl", ["-fsSL", "-o", tarPath, url]);
    if (!dl.ok) return { ok: false, detail: `descarga falló: ${dl.stderr}` };

    const extract = await run("tar", ["-xzf", tarPath, "-C", staging]);
    if (!extract.ok) return { ok: false, detail: `extracción falló: ${extract.stderr}` };

    const extractedBin = join(staging, "engram");
    if (!existsSync(extractedBin)) {
      return { ok: false, detail: "el tarball no contiene un binario 'engram' en la raíz" };
    }

    const destDir = engramInstallDir();
    await mkdir(destDir, { recursive: true });
    const dest = join(destDir, "engram");
    const bytes = await Bun.file(extractedBin).arrayBuffer();
    writeFileSync(dest, new Uint8Array(bytes));
    chmodSync(dest, 0o755);
    return { ok: true, path: dest, detail: `engram instalado en ${dest}` };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

// Install engram for the current platform.
export async function installEngram(platform: Platform): Promise<EngramInstall> {
  if (platform.os === "darwin" && platform.packageManager === "brew") {
    return installEngramMac();
  }
  return installEngramLinux(platform);
}
