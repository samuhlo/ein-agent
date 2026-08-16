// =============================================================================
// BUILD ALL
// For each target: compile its native app, bundle that app into its template,
// then compile the installer that embeds the matching template.
// Run: bun run build:all
// =============================================================================

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTerminalApp } from "./build-terminal-app.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const DIST = join(ROOT, "dist");
const ENTRY = join(ROOT, "src", "main.ts");

export type BuildTarget = { id: string; bunTarget: string; assetName: string; libc: "glibc" | null };

export const BUILD_TARGETS: BuildTarget[] = [
  { id: "darwin-arm64", bunTarget: "bun-darwin-arm64", assetName: "ein-installer-darwin-arm64", libc: null },
  { id: "darwin-x64", bunTarget: "bun-darwin-x64", assetName: "ein-installer-darwin-x64", libc: null },
  { id: "linux-arm64", bunTarget: "bun-linux-arm64", assetName: "ein-installer-linux-arm64", libc: "glibc" },
  { id: "linux-x64", bunTarget: "bun-linux-x64", assetName: "ein-installer-linux-x64", libc: "glibc" },
];

async function bundleAssetScript(script: string, label: string, env: Record<string, string> = {}): Promise<void> {
  const proc = Bun.spawn(["bun", "run", join(HERE, script)], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ...env },
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${label} fallo`);
}

async function bundleTemplate(target: BuildTarget, appArtifact: string): Promise<void> {
  await bundleAssetScript("bundle-template.ts", "bundle-template", { EIN_APP_BINARY: appArtifact, EIN_APP_TARGET: target.id });
}

async function bundleCcEinPayload(): Promise<void> {
  await bundleAssetScript("bundle-cc-ein.ts", "bundle-cc-ein");
}

// Pure command construction keeps target injection testable without executing a
// platform-specific binary (the produced Darwin artifact remains unchanged).
export function compileCommand(target: BuildTarget, outfile: string): string[] {
  return [
    "bun",
    "build",
    ENTRY,
    "--compile",
    `--target=${target.bunTarget}`,
    "--outfile",
    outfile,
  ];
}

async function compile(target: BuildTarget): Promise<void> {
  const outfile = join(DIST, target.assetName);
  console.log(`\n→ compilando ${target.assetName} (${target.bunTarget})`);
  const proc = Bun.spawn(compileCommand(target, outfile), {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`compile fallo para ${target.bunTarget}`);
}

export type TargetBuildEffects = Readonly<{
  buildApp: (target: BuildTarget, outfile: string) => Promise<void>;
  bundleTemplate: (target: BuildTarget, appArtifact: string) => Promise<void>;
  compileInstaller: (target: BuildTarget) => Promise<void>;
}>;

export async function buildInstallerTarget(target: BuildTarget, effects: TargetBuildEffects = {
  buildApp: buildTerminalApp,
  bundleTemplate,
  compileInstaller: compile,
}): Promise<void> {
  const appArtifact = join(DIST, `ein-app-${target.id}`);
  await effects.buildApp(target, appArtifact);
  await effects.bundleTemplate(target, appArtifact);
  await effects.compileInstaller(target);
}

async function main(): Promise<void> {
  if (!existsSync(ENTRY)) throw new Error(`No existe entry: ${ENTRY}`);
  await mkdir(DIST, { recursive: true });

  console.log("/// empaquetando assets");
  await bundleCcEinPayload();

  // Allow building a single target: bun run build:all -- linux-x64
  const only = process.argv.slice(2)[0];
  const targets = only ? BUILD_TARGETS.filter((t) => t.assetName.includes(only)) : BUILD_TARGETS;
  if (targets.length === 0) throw new Error(`Sin targets que coincidan con "${only}"`);

  for (const target of targets) {
    await buildInstallerTarget(target);
  }

  console.log("\n/// binarios listos en dist/");
  for (const t of targets) {
    const f = Bun.file(join(DIST, t.assetName));
    console.log(`  ${t.assetName}  (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
