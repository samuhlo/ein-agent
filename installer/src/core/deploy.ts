// =============================================================================
// DEPLOY
// Extracts the embedded template tarball into ~/.pi/agent and applies path
// templating to mcp.json + settings.json. Idempotent: never touches user
// state (auth.json, sessions/, backups/, .sdd/, etc. are simply not in the
// tarball). User-owned fields in settings.json (defaultProvider, defaultModel,
// theme, enabledModels, packages) are preserved across updates via a
// read-before / merge-after pattern around the tarball extraction.
// =============================================================================

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Embedded at compile time via `bun build --compile`. At runtime this import
// resolves to the bundled asset path.
import templateTarball from "../assets/template.tar.gz" with { type: "file" };
import type { Platform } from "./platform.ts";
import { resolveEngram } from "./engram.ts";
import { renderTemplate, type TemplateVars } from "./template.ts";
import { run } from "./exec.ts";
import { AGENT_DIR, ENGRAM_DIR, HOME } from "./paths.ts";
import {
  mergeUserSettings,
  readUserSettings,
  type UserSettings,
} from "./settings.ts";

// Re-export para consumidores existentes (y tests) sin acoplarlos al asset.
export { mergeUserSettings, readUserSettings, type UserSettings };

export type DeployOptions = {
  // skipLinear opts out of Linear → sets the default work mode to "solo".
  // We no longer DELETE ein-linear files (that was destructive + incoherent);
  // the agent stays deployed and the runtime work mode decides whether Linear
  // is used. Mirrors lib/mode.ts (~/.pi/agent/ein-mode.json, default solo).
  skipLinear?: boolean;
};

export type DeployResult = {
  agentDir: string;
  engramCommand: string;
  engramFound: boolean;
};

// Writes the global default work mode read by lib/mode.ts when a project has no
// .pi/ein/mode.json. "solo" (no Linear) when the user opts out; "team" otherwise.
function writeGlobalMode(agentDir: string, mode: "solo" | "team"): void {
  writeFileSync(join(agentDir, "ein-mode.json"), `${JSON.stringify({ mode }, null, 2)}\n`);
}

// Directories fully owned by the template. Wiped before extraction so files
// removed upstream (e.g. a renamed agent like ein-github→ein-git) don't linger
// as orphans — tar only adds/overwrites, it never deletes. Deliberately
// excludes `skills/` and `themes/`, which hold user-managed state (downloaded
// skills, symlinks, personal pi themes), and the agent root (auth.json,
// sessions/, backups/, .sdd/, ...).
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

function templateConfig(fileName: string, vars: TemplateVars): void {
  const path = join(AGENT_DIR, fileName);
  const raw = readFileSync(path, "utf8");
  const rendered = renderTemplate(raw, vars);
  writeFileSync(path, rendered);
}

export async function deployTemplate(platform: Platform, opts: DeployOptions = {}): Promise<DeployResult> {
  // Preserve user-owned settings before extraction overwrites the file.
  const userSettings = readUserSettings(AGENT_DIR);

  // Bun's compiled binary exposes the embedded file via its import path; in dev
  // (bun run) it resolves to the real file on disk. Read bytes and stage them
  // so `tar` has a concrete path to read from.
  const bytes = await Bun.file(templateTarball).arrayBuffer();
  const staging = mkdtempSync(join(tmpdir(), "ein-deploy-"));
  const stagedTar = join(staging, "template.tar.gz");
  try {
    writeFileSync(stagedTar, new Uint8Array(bytes));
    // Wipe template-owned dirs first so upstream deletions/renames don't leave
    // orphans behind. User state (skills/, auth.json, ...) is untouched.
    cleanManagedDirs(AGENT_DIR);
    await extractTarball(stagedTar, AGENT_DIR);

    const engram = resolveEngram(platform);
    const vars: TemplateVars = {
      HOME,
      AGENT_DIR,
      ENGRAM_BIN: engram.command,
      ENGRAM_DATA_DIR: ENGRAM_DIR,
    };

    templateConfig("mcp.json", vars);
    templateConfig("settings.json", vars);

    // Restore user-owned fields (model, theme, etc.) that the tarball reset.
    mergeUserSettings(AGENT_DIR, userSettings);

    // Set the default work mode instead of deleting Linear files. Solo (no
    // Linear) when the user opted out; Team (Linear board) otherwise.
    writeGlobalMode(AGENT_DIR, opts.skipLinear ? "solo" : "team");

    return {
      agentDir: AGENT_DIR,
      engramCommand: engram.command,
      engramFound: engram.found,
    };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
