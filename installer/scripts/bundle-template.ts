// =============================================================================
// BUNDLE TEMPLATE
// Builds src/assets/template.tar.gz from ../ein-pi/agent.
// - allowlist of Ein-owned content (never secrets/runtime/binaries)
// - JSON-aware tokenization of mcp.json + settings.json into {{TOKENS}}
// Run: bun run bundle-template
// =============================================================================

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const INSTALLER_ROOT = dirname(HERE);
const REPO_ROOT = dirname(INSTALLER_ROOT);
const SOURCE = join(REPO_ROOT, "ein-pi", "agent");
const OUT = join(INSTALLER_ROOT, "src", "assets", "template.tar.gz");

// Ein-owned content. Everything else (auth.json, npm/, sessions/, backups/,
// .atl/, .piagents/, .sdd/, bin/, disabled-skill-conflicts/, run-history) is
// intentionally left out.
const INCLUDE_FILES = ["AGENTS.md", "brand.json", "models.json", "mcp.json", "settings.json"];
const INCLUDE_DIRS = ["agents", "assets", "chains", "docs", "extensions", "lib", "prompts", "skills"];

function tokenizeMcp(staging: string): void {
  const path = join(staging, "mcp.json");
  const cfg = JSON.parse(readFileSync(path, "utf8")) as {
    mcpServers?: Record<string, { command?: string; environment?: Record<string, string> }>;
  };
  const engram = cfg.mcpServers?.engram;
  if (engram) {
    engram.command = "{{ENGRAM_BIN}}";
    if (engram.environment && "ENGRAM_DATA_DIR" in engram.environment) {
      engram.environment.ENGRAM_DATA_DIR = "{{ENGRAM_DATA_DIR}}";
    }
  }
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`);
}

function tokenizeSettings(staging: string): void {
  const path = join(staging, "settings.json");
  const cfg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  cfg.extensions = ["{{AGENT_DIR}}/extensions"];
  cfg.prompts = ["{{AGENT_DIR}}/prompts"];
  cfg.skills = ["{{AGENT_DIR}}/skills/local", "{{AGENT_DIR}}/skills/downloaded"];
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`);
}

async function main(): Promise<void> {
  if (!existsSync(SOURCE)) {
    throw new Error(`No existe el source del template: ${SOURCE}`);
  }

  const staging = mkdtempSync(join(tmpdir(), "ein-template-"));
  try {
    for (const file of INCLUDE_FILES) {
      const src = join(SOURCE, file);
      if (!existsSync(src)) {
        console.warn(`[warn] falta archivo esperado: ${file}`);
        continue;
      }
      cpSync(src, join(staging, file));
    }
    for (const dir of INCLUDE_DIRS) {
      const src = join(SOURCE, dir);
      if (!existsSync(src)) {
        console.warn(`[warn] falta dir esperado: ${dir}`);
        continue;
      }
      cpSync(src, join(staging, dir), { recursive: true });
    }

    tokenizeMcp(staging);
    tokenizeSettings(staging);

    // tar from inside staging so paths are relative (./agents, ./extensions...).
    const proc = Bun.spawn(["tar", "-czf", OUT, "."], { cwd: staging, stderr: "pipe" });
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code !== 0) {
      throw new Error(`tar fallo (code ${code}): ${stderr}`);
    }

    const size = Bun.file(OUT).size;
    console.log(`/// template empaquetado`);
    console.log(`  origen:  ${SOURCE}`);
    console.log(`  salida:  ${OUT}`);
    console.log(`  tamano:  ${(size / 1024 / 1024).toFixed(2)} MB`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
