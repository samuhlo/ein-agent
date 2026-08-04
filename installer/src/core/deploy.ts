// =============================================================================
// DEPLOY
// Extract the embedded template tarball into ~/.pi/agent and apply path
// templating to mcp.json + settings.json. Idempotent: user state (auth.json,
// sessions/, backups/, .sdd/, ...) is simply not in the tarball. User-owned
// settings.json fields (model, theme, packages, ...) are preserved via
// read-before / merge-after around extraction.
// =============================================================================

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Embedded at compile time via `bun build --compile`; at runtime resolves to
// the bundled asset path.
import templateTarball from "../assets/template.tar.gz" with { type: "file" };
import type { Platform } from "./platform.ts";
import { resolveEngram } from "./engram.ts";
import { renderTemplate, type TemplateVars } from "./template.ts";
import { run } from "./exec.ts";
import { defaultPiInstallContext, type PiInstallContext } from "./paths.ts";
import {
  mergeUserSettings,
  readUserSettings,
  type UserSettings,
} from "./settings.ts";

// Re-export para consumidores existentes (y tests) sin acoplarlos al asset.
export { mergeUserSettings, readUserSettings, type UserSettings };

import type { TemplateManifest } from "./verify.ts";

// Read template-manifest.json straight out of the embedded tarball (no deploy).
// Powers `--dry-run`. Tries both "./name" and "name" spellings: GNU tar matches
// literally, bsdtar is lenient.
export async function readBundledManifest(): Promise<TemplateManifest | null> {
  const bytes = await Bun.file(templateTarball).arrayBuffer();
  const staging = mkdtempSync(join(tmpdir(), "ein-manifest-"));
  try {
    const stagedTar = join(staging, "template.tar.gz");
    writeFileSync(stagedTar, new Uint8Array(bytes));
    for (const member of ["./template-manifest.json", "template-manifest.json"]) {
      const result = await run("tar", ["-xzOf", stagedTar, member]);
      if (result.ok && result.stdout) {
        try {
          return JSON.parse(result.stdout) as TemplateManifest;
        } catch {
          return null;
        }
      }
    }
    return null;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export type DeployOptions = {
  // skipLinear writes ein-mode.json=solo instead of deleting ein-linear files.
  // Deletion was destructive and incoherent; the agent stays deployed and the
  // runtime mode in lib/mode.ts decides whether Linear is actually used.
  skipLinear?: boolean;
};

export type DeployResult = {
  agentDir: string;
  engramCommand: string;
  engramFound: boolean;
};

// Writes the global default work mode (lib/mode.ts fallback when a project has
// no .pi/ein/mode.json). solo when skipLinear, team otherwise.
function writeGlobalMode(agentDir: string, mode: "solo" | "team"): void {
  writeFileSync(join(agentDir, "ein-mode.json"), `${JSON.stringify({ mode }, null, 2)}\n`);
}

// Template-owned dirs. Wiped before extraction so files removed upstream (e.g.
// a renamed agent like ein-github -> ein-git) don't linger as orphans: tar
// only adds/overwrites, never deletes. Deliberately excludes skills/ and
// themes/ (user-managed) and the agent root (auth.json, sessions/, backups/,
// .sdd/, ...).
export const MANAGED_DIRS = ["agents", "assets", "chains", "docs", "extensions", "lib", "prompts"];

// Clean-replace the template-owned dirs. No-op on a fresh install (dirs absent).
export function cleanManagedDirs(agentDir: string): void {
  for (const dir of MANAGED_DIRS) {
    const full = join(agentDir, dir);
    if (existsSync(full)) rmSync(full, { recursive: true, force: true });
  }
}

// Extract the tarball into a target dir using the system `tar`.
async function extractTarball(tarPath: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const result = await run("tar", ["-xzf", tarPath, "-C", target]);
  if (!result.ok) {
    throw new Error(`No se pudo extraer el template (tar): ${result.stderr}`);
  }
}

function templateConfig(fileName: string, vars: TemplateVars, agentDir: string): void {
  const path = join(agentDir, fileName);
  const raw = readFileSync(path, "utf8");
  const rendered = renderTemplate(raw, vars);
  writeFileSync(path, rendered);
}

export async function deployTemplate(
  platform: Platform,
  opts: DeployOptions = {},
  context: PiInstallContext = defaultPiInstallContext(),
): Promise<DeployResult> {
  // Read user-owned settings before the tarball overwrites settings.json.
  const { agentDir } = context;
  const userSettings = readUserSettings(agentDir);

  // Stage the embedded asset to a real file: `tar` needs a concrete path,
  // not a bun:// import.
  const bytes = await Bun.file(templateTarball).arrayBuffer();
  const staging = mkdtempSync(join(tmpdir(), "ein-deploy-"));
  const stagedTar = join(staging, "template.tar.gz");
  try {
    writeFileSync(stagedTar, new Uint8Array(bytes));
    // Clean first so upstream deletions/renames don't leave orphans; user state
    // (skills/, auth.json, ...) is not in MANAGED_DIRS so it survives.
    cleanManagedDirs(agentDir);
    await extractTarball(stagedTar, agentDir);

    const engram = resolveEngram(platform, {
      bunBinDir: context.bunBinDir,
      localBinDir: context.localBinDir,
    });
    const vars: TemplateVars = {
      HOME: context.home,
      AGENT_DIR: agentDir,
      ENGRAM_BIN: engram.command,
      ENGRAM_DATA_DIR: context.engramDir,
    };

    templateConfig("mcp.json", vars, agentDir);
    templateConfig("settings.json", vars, agentDir);

    // Re-apply user-owned fields the tarball reset.
    mergeUserSettings(agentDir, userSettings);

    // Default work mode (overridden per-project by .pi/ein/mode.json).
    writeGlobalMode(agentDir, opts.skipLinear ? "solo" : "team");

    return {
      agentDir,
      engramCommand: engram.command,
      engramFound: engram.found,
    };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
