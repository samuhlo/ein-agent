// =============================================================================
// BUNDLE TEMPLATE
// Builds src/assets/template.tar.gz composing two source roots:
//   ein-pi/core/  — portable assets (agent prompts, skills, docs, prompts)
//   ein-pi/agent/ — Pi runtime (extensions, lib, chains, assets, configs)
// The DEPLOYED layout stays flat under ~/.pi/agent (Pi expects it); the split
// only exists repo-side so a future non-Pi adapter can consume core/ as-is.
// - allowlist of Ein-owned content (never secrets/runtime/binaries)
// - JSON-aware tokenization of mcp.json + settings.json into {{TOKENS}}
// Run: bun run bundle-template
// =============================================================================

import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const INSTALLER_ROOT = dirname(HERE);
const REPO_ROOT = dirname(INSTALLER_ROOT);
const CORE_SOURCE = join(REPO_ROOT, "ein-pi", "core");
const AGENT_SOURCE = join(REPO_ROOT, "ein-pi", "agent");
const OUT = join(INSTALLER_ROOT, "src", "assets", "template.tar.gz");

// Ein-owned content per source root. Everything else (auth.json, npm/,
// sessions/, backups/, .atl/, .piagents/, .sdd/, bin/,
// disabled-skill-conflicts/, run-history) is intentionally left out.
const CORE_FILES = ["AGENTS.md"];
const CORE_DIRS = ["agents", "docs", "prompts", "skills"];
const AGENT_FILES = ["brand.json", "extensions-manifest.json", "models.json", "mcp.json", "settings.json"];
const AGENT_DIRS = ["assets", "chains", "extensions", "lib", "themes"];

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

// template-manifest.json: qué contiene exactamente este bundle. Es la fuente
// que consumen `ein doctor` (validar lo desplegado contra lo que se distribuyó,
// sin listas cableadas) y `ein install --dry-run` (mostrar el plan). Se genera
// escaneando el staging: no puede derivar del contenido real.
function writeManifest(staging: string): void {
  const pkg = JSON.parse(
    readFileSync(join(INSTALLER_ROOT, "package.json"), "utf8"),
  ) as { version?: string };

  const listMd = (dir: string): string[] =>
    existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];

  const topFiles: string[] = [];
  const topDirs: string[] = [];
  for (const entry of readdirSync(staging).sort()) {
    if (statSync(join(staging, entry)).isDirectory()) topDirs.push(entry);
    else topFiles.push(entry);
  }

  let extensions: string[] = [];
  const extManifest = join(staging, "extensions-manifest.json");
  if (existsSync(extManifest)) {
    const parsed = JSON.parse(readFileSync(extManifest, "utf8")) as { core?: unknown };
    if (Array.isArray(parsed.core)) extensions = (parsed.core as string[]).slice().sort();
  }

  const manifest = {
    templateVersion: pkg.version ?? "0.0.0",
    generatedAt: new Date().toISOString(),
    agents: listMd(join(staging, "agents")),
    chains: existsSync(join(staging, "chains"))
      ? readdirSync(join(staging, "chains")).sort()
      : [],
    extensions,
    topLevelDirs: topDirs,
    topLevelFiles: [...topFiles, "template-manifest.json"].sort(),
  };
  writeFileSync(join(staging, "template-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function copyInto(sourceRoot: string, staging: string, files: string[], dirs: string[]): void {
  for (const file of files) {
    const src = join(sourceRoot, file);
    if (!existsSync(src)) {
      console.warn(`[warn] falta archivo esperado: ${file}`);
      continue;
    }
    cpSync(src, join(staging, file));
  }
  for (const dir of dirs) {
    const src = join(sourceRoot, dir);
    if (!existsSync(src)) {
      console.warn(`[warn] falta dir esperado: ${dir}`);
      continue;
    }
    cpSync(src, join(staging, dir), { recursive: true });
  }
}

async function main(): Promise<void> {
  for (const source of [CORE_SOURCE, AGENT_SOURCE]) {
    if (!existsSync(source)) {
      throw new Error(`No existe el source del template: ${source}`);
    }
  }

  const staging = mkdtempSync(join(tmpdir(), "ein-template-"));
  try {
    copyInto(CORE_SOURCE, staging, CORE_FILES, CORE_DIRS);
    copyInto(AGENT_SOURCE, staging, AGENT_FILES, AGENT_DIRS);

    // assets/agents y assets/chains son la copia "de fábrica" que usa
    // installSddAssets para reparar instalaciones. Se generan aquí desde las
    // fuentes (core/agents, agent/chains) — única fuente de verdad, drift
    // imposible.
    for (const [root, dir] of [
      [CORE_SOURCE, "agents"],
      [AGENT_SOURCE, "chains"],
    ] as const) {
      const src = join(root, dir);
      if (!existsSync(src)) continue;
      cpSync(src, join(staging, "assets", dir), { recursive: true, force: true });
    }

    tokenizeMcp(staging);
    tokenizeSettings(staging);
    writeManifest(staging);

    // src/assets/ holds only the generated tarball (gitignored), so the dir is
    // absent on a fresh checkout (CI). Ensure it exists before tar writes to it.
    mkdirSync(dirname(OUT), { recursive: true });

    // tar from inside staging so paths are relative (./agents, ./extensions...).
    const proc = Bun.spawn(["tar", "-czf", OUT, "."], { cwd: staging, stderr: "pipe" });
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code !== 0) {
      throw new Error(`tar fallo (code ${code}): ${stderr}`);
    }

    const size = Bun.file(OUT).size;
    console.log(`/// template empaquetado`);
    console.log(`  origen:  ${CORE_SOURCE} + ${AGENT_SOURCE}`);
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
