// =============================================================================
// BUNDLE TEMPLATE
// Empaqueta src/assets/template.tar.gz componiendo tres raices:
//   runtime/     — assets Ein portables (agents, policy, skills, docs, prompts)
//   vendor/skills — skills externas curadas, separadas del codigo propio
//   ein-pi/agent/ — adaptador Pi (extensions, lib, chains, surfaces, configs)
// Los contratos compartidos se superponen en lib/: el checkout conserva
// entrypoints de compatibilidad, pero el despliegue recibe la implementación.
// El layout DESPLEGADO va plano bajo ~/.pi/agent (es lo que Pi espera); el
// split solo existe repo-side para que cada origen tenga un dueño visible.
// - allowlist de contenido Ein-owned (nunca secrets/runtime/binarios)
// - tokenizacion JSON-aware de mcp.json + settings.json en {{TOKENS}}
// Run: bun run bundle-template
// =============================================================================

import { createHash } from "node:crypto";
import {
	cpSync,
	chmodSync,
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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const INSTALLER_ROOT = dirname(HERE);
const REPO_ROOT = dirname(INSTALLER_ROOT);
const RUNTIME_SOURCE = join(REPO_ROOT, "runtime");
const VENDOR_SKILLS_SOURCE = join(REPO_ROOT, "vendor", "skills");
const SHARED_CONTRACT_SOURCE = join(REPO_ROOT, "shared", "contracts");
const AGENT_SOURCE = join(REPO_ROOT, "ein-pi", "agent");
const OUT = process.env.EIN_TEMPLATE_OUT ? resolve(process.env.EIN_TEMPLATE_OUT) : join(INSTALLER_ROOT, "src", "assets", "template.tar.gz");
const TYPESCRIPT_VERSION = "5.9.3";

// Contenido Ein-owned por raiz de origen. Todo lo demas (auth.json, npm/,
// sessions/, backups/, .atl/, .piagents/, .sdd/,
// disabled-skill-conflicts/, run-history) queda fuera a proposito.
const RUNTIME_FILES = ["AGENTS.md"];
const RUNTIME_DIRS = ["agents", "assets", "docs", "prompts", "skills"];
const SHARED_CONTRACT_FILES = [
  "ein-tv.ts",
  "memory-contract.ts",
  "runtime-compat.ts",
  "sdd-intent-preflight-context.ts",
  "shared-config-update-advisor.ts",
  "style-contract.ts",
];
// Allowlist del template. `app.ts` remains available to provider launchers;
// the user-facing app is precompiled and staged separately as bin/ein. Ver
// tests/template-agent-inventory.test.ts, que deriva lo requerido del código.
const AGENT_FILES = ["app.ts", "brand.json", "extensions-manifest.json", "models.json", "mcp.json", "settings.json"];
const AGENT_DIRS = ["chains", "extensions", "lib", "surfaces", "themes"];

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

// template-manifest.json: que contiene exactamente este bundle. Es la fuente
// que consumen `ein doctor` (validar lo desplegado contra lo que se distribuyo,
// sin listas cableadas) y `ein install --dry-run` (mostrar el plan). Se genera
// escaneando el staging: no puede derivar del contenido real.
function writeManifest(staging: string, runtimeDependencies: readonly Record<string, string>[], terminalApp: Record<string, string>): void {
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
    terminalApp,
    runtimeDependencies,
    topLevelDirs: topDirs,
    topLevelFiles: [...topFiles, "template-manifest.json"].sort(),
  };
  writeFileSync(join(staging, "template-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function vendorTypescriptRuntime(staging: string): readonly Record<string, string>[] {
  const source = join(INSTALLER_ROOT, "node_modules", "typescript");
  const pkg = JSON.parse(readFileSync(join(source, "package.json"), "utf8")) as { version?: string };
  if (pkg.version !== TYPESCRIPT_VERSION) throw new Error(`typescript runtime must be ${TYPESCRIPT_VERSION}, found ${pkg.version ?? "missing"}`);
  const destination = join(staging, "lib", "vendor", "typescript");
  mkdirSync(destination, { recursive: true });
  for (const file of ["LICENSE.txt", "ThirdPartyNoticeText.txt"]) cpSync(join(source, file), join(destination, file));
  const compiler = readFileSync(join(source, "lib", "typescript.js"));
  writeFileSync(join(destination, "typescript.js"), compiler);
  for (const file of ["cleaner-complexity-evidence.ts", "cleaner-duplication-evidence.ts", "cleaner-script-regions.ts"]) {
    const path = join(staging, "lib", file);
    const sourceText = readFileSync(path, "utf8");
    const rewritten = sourceText.replace('from "typescript"', 'from "./vendor/typescript/typescript.js"');
    if (rewritten === sourceText || rewritten.includes('from "typescript"')) throw new Error(`failed to close TypeScript runtime import in ${file}`);
    writeFileSync(path, rewritten);
  }
  return [{ name: "typescript", version: TYPESCRIPT_VERSION, path: "lib/vendor/typescript/typescript.js", sha256: createHash("sha256").update(compiler).digest("hex") }];
}

function stageTerminalApp(staging: string): Record<string, string> {
  const source = process.env.EIN_APP_BINARY;
  const target = process.env.EIN_APP_TARGET;
  if (!source || !target || !existsSync(source)) throw new Error("EIN_APP_BINARY and EIN_APP_TARGET must name a built terminal app");
  const destination = join(staging, "bin", "ein");
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
  chmodSync(destination, 0o755);
  return { path: "bin/ein", target, mode: "0755", sha256: createHash("sha256").update(readFileSync(destination)).digest("hex") };
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
  for (const source of [RUNTIME_SOURCE, VENDOR_SKILLS_SOURCE, SHARED_CONTRACT_SOURCE, AGENT_SOURCE]) {
    if (!existsSync(source)) {
      throw new Error(`No existe el source del template: ${source}`);
    }
  }

  const staging = mkdtempSync(join(tmpdir(), "ein-template-"));
  try {
    copyInto(RUNTIME_SOURCE, staging, RUNTIME_FILES, RUNTIME_DIRS);
    cpSync(VENDOR_SKILLS_SOURCE, join(staging, "skills", "downloaded"), { recursive: true });
    copyInto(AGENT_SOURCE, staging, AGENT_FILES, AGENT_DIRS);
    copyInto(SHARED_CONTRACT_SOURCE, join(staging, "lib"), SHARED_CONTRACT_FILES, []);

    // assets/agents y assets/chains son la copia "de fabrica" que usa
    // installSddAssets para reparar instalaciones. Se generan aqui desde las
    // fuentes (runtime/agents, agent/chains) — unica fuente de verdad, drift
    // imposible.
    for (const [root, dir] of [
      [RUNTIME_SOURCE, "agents"],
      [AGENT_SOURCE, "chains"],
    ] as const) {
      const src = join(root, dir);
      if (!existsSync(src)) continue;
      cpSync(src, join(staging, "assets", dir), { recursive: true, force: true });
    }

    tokenizeMcp(staging);
    tokenizeSettings(staging);
    const terminalApp = stageTerminalApp(staging);
    const runtimeDependencies = vendorTypescriptRuntime(staging);
    writeManifest(staging, runtimeDependencies, terminalApp);

    // src/assets/ solo guarda el tarball generado (gitignored), asi que el dir
    // no existe en un checkout limpio (CI). Asegurarlo antes de que tar
    // escriba ahi.
    mkdirSync(dirname(OUT), { recursive: true });

    // tar desde dentro de staging para que las rutas sean relativas
    // (./agents, ./extensions, ...).
    // macOS needs both gates: one suppresses AppleDouble and one strips PAX xattrs.
    const proc = Bun.spawn(["tar", "--no-xattrs", "-czf", OUT, "."], {
      cwd: staging,
      stderr: "pipe",
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code !== 0) {
      throw new Error(`tar fallo (code ${code}): ${stderr}`);
    }

    const size = Bun.file(OUT).size;
    console.log(`/// template empaquetado`);
    console.log(`  origen:  ${RUNTIME_SOURCE} + ${VENDOR_SKILLS_SOURCE} + ${SHARED_CONTRACT_SOURCE} + ${AGENT_SOURCE}`);
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
