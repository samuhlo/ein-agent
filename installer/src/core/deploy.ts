// =============================================================================
// DEPLOY
// Extracts the embedded template tarball into ~/.pi/agent and applies path
// templating to mcp.json + settings.json. Idempotent: never touches user
// state (auth.json, sessions/, backups/, .sdd/, etc. are simply not in the
// tarball, so re-extracting only overwrites Ein-owned files).
// =============================================================================

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

export type DeployResult = {
  agentDir: string;
  engramCommand: string;
  engramFound: boolean;
};

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

export async function deployTemplate(platform: Platform): Promise<DeployResult> {
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

    return {
      agentDir: AGENT_DIR,
      engramCommand: engram.command,
      engramFound: engram.found,
    };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
