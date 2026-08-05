// =============================================================================
// BUILD ALL
// Bundles the template, then cross-compiles standalone binaries for the four
// supported targets via `bun build --compile`. Host-independent.
// Run: bun run build:all
// =============================================================================

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const DIST = join(ROOT, "dist");
const ENTRY = join(ROOT, "src", "main.ts");

export type BuildTarget = { bunTarget: string; assetName: string };

export const BUILD_TARGETS: BuildTarget[] = [
  { bunTarget: "bun-darwin-arm64", assetName: "ein-installer-darwin-arm64" },
  { bunTarget: "bun-darwin-x64", assetName: "ein-installer-darwin-x64" },
  { bunTarget: "bun-linux-arm64", assetName: "ein-installer-linux-arm64" },
  { bunTarget: "bun-linux-x64", assetName: "ein-installer-linux-x64" },
];

async function bundleAssetScript(script: string, label: string): Promise<void> {
  const proc = Bun.spawn(["bun", "run", join(HERE, script)], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${label} fallo`);
}

async function bundleTemplate(): Promise<void> {
  await bundleAssetScript("bundle-template.ts", "bundle-template");
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

async function main(): Promise<void> {
  if (!existsSync(ENTRY)) throw new Error(`No existe entry: ${ENTRY}`);
  await mkdir(DIST, { recursive: true });

  console.log("/// empaquetando assets");
  await bundleTemplate();
  await bundleCcEinPayload();

  // Allow building a single target: bun run build:all -- linux-x64
  const only = process.argv.slice(2)[0];
  const targets = only ? BUILD_TARGETS.filter((t) => t.assetName.includes(only)) : BUILD_TARGETS;
  if (targets.length === 0) throw new Error(`Sin targets que coincidan con "${only}"`);

  for (const target of targets) {
    await compile(target);
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
