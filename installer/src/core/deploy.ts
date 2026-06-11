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

export type DeployOptions = {
  skipLinear?: boolean;
};

export type DeployResult = {
  agentDir: string;
  engramCommand: string;
  engramFound: boolean;
};

// Fields in settings.json that belong to the user, not to Ein.
// These survive across `ein update` re-deployments.
const USER_SETTINGS_KEYS = [
  "defaultProvider",
  "defaultModel",
  "theme",
  "lastChangelogVersion",
  "enabledModels",
  "packages",
] as const;

type UserSettings = Partial<Record<(typeof USER_SETTINGS_KEYS)[number], unknown>>;

function readUserSettings(agentDir: string): UserSettings {
  const path = join(agentDir, "settings.json");
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    const result: UserSettings = {};
    for (const key of USER_SETTINGS_KEYS) {
      if (key in record) result[key] = record[key];
    }
    return result;
  } catch {
    return {};
  }
}

function mergeUserSettings(agentDir: string, saved: UserSettings): void {
  if (Object.keys(saved).length === 0) return;
  const path = join(agentDir, "settings.json");
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    const merged = { ...(parsed as Record<string, unknown>), ...saved };
    writeFileSync(path, `${JSON.stringify(merged, null, "\t")}\n`);
  } catch {
    // Leave freshly-extracted file as-is if merge fails
  }
}

// Files owned by the Linear integration. Removed when user opts out.
const LINEAR_FILES = [
  join("agents", "ein-linear.md"),
  join("extensions", "ein-linear.ts"),
];

function removeLinearFiles(agentDir: string): void {
  for (const rel of LINEAR_FILES) {
    const full = join(agentDir, rel);
    if (existsSync(full)) rmSync(full);
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

    if (opts.skipLinear) removeLinearFiles(AGENT_DIR);

    return {
      agentDir: AGENT_DIR,
      engramCommand: engram.command,
      engramFound: engram.found,
    };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
