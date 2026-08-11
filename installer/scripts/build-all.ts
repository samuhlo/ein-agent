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
import { candidateInputArgs, candidateInputFromArgs, type CandidateInput } from "./dashboard-candidate-input.ts";

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

async function bundleAssetScript(script: string, label: string, candidate?: CandidateInput): Promise<void> {
	const proc = Bun.spawn(["bun", "run", join(HERE, script), ...(candidate ? candidateInputArgs(candidate) : [])], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${label} fallo`);
}

async function bundleTemplate(candidate?: CandidateInput): Promise<void> {
	await bundleAssetScript("bundle-template.ts", "bundle-template", candidate);
}

async function bundleCcEinPayload(candidate?: CandidateInput): Promise<void> {
	await bundleAssetScript("bundle-cc-ein.ts", "bundle-cc-ein", candidate);
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

export async function buildAll(options: { candidates?: readonly CandidateInput[]; compileTarget?: (target: BuildTarget) => Promise<void> } = {}): Promise<void> {
  if (!existsSync(ENTRY)) throw new Error(`No existe entry: ${ENTRY}`);
  await mkdir(DIST, { recursive: true });

	// Allow building a single target: bun run build:all -- linux-x64
	const only = process.argv.slice(2)[0];
	const candidates = options.candidates ?? [];
	if (new Set(candidates.map(({ target }) => target.id)).size !== candidates.length) throw new Error("Duplicate candidate target");
	const requested = candidates.length === 1 ? candidates[0]!.target.id : candidates.length > 1 ? undefined : only;
	const targets = requested ? BUILD_TARGETS.filter((t) => t.assetName.includes(requested)) : BUILD_TARGETS;
	if (targets.length === 0) throw new Error(`Sin targets que coincidan con "${only}"`);
	if (candidates.length > 0 && targets.length !== candidates.length) throw new Error("Missing candidate target");

	for (const target of targets) {
		const candidate = candidates.find(({ target: value }) => target.assetName.endsWith(value.id));
		if (candidates.length > 0 && !candidate) throw new Error(`Missing candidate for ${target.assetName}`);
		console.log(`/// empaquetando assets para ${target.assetName}`);
		await bundleTemplate(candidate);
		await bundleCcEinPayload(candidate);
		await (options.compileTarget ?? compile)(target);
	}

  console.log("\n/// binarios listos en dist/");
  for (const t of targets) {
    const f = Bun.file(join(DIST, t.assetName));
    console.log(`  ${t.assetName}  (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const candidate = args[0]?.startsWith("--") ? candidateInputFromArgs(args) : undefined;
	buildAll(candidate ? { candidates: [candidate] } : {}).catch((error) => {
    console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
