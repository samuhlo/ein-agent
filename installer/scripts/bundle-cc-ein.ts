// =============================================================================
// BUNDLE CC-EIN
// Build the repository-relative source payload consumed by Claude sync. The
// archive is generated alongside template.tar.gz and embedded by Bun compile.
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
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CC_EIN_PAYLOAD_FILES,
  CC_EIN_PAYLOAD_MANIFEST,
  CC_EIN_PAYLOAD_ROOTS,
  CC_EIN_PAYLOAD_SOURCE_ENTRIES,
  type CcEinPayloadManifest,
  type CcEinPayloadManifestEntry,
} from "../src/core/cc-payload-inventory.ts";
import { candidateInputFromArgs, stageDashboardSeed, verifyCandidateInput, type CandidateInput } from "./dashboard-candidate-input.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const INSTALLER_ROOT = dirname(HERE);
const REPO_ROOT = dirname(INSTALLER_ROOT);
const OUT = join(INSTALLER_ROOT, "src", "assets", "cc-ein-runtime.tar.gz");

const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".json"];
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|export\s+from\s+)["']([^"']+)["']/g;

function sourcePath(repoRelativePath: string): string {
  const candidate = resolve(REPO_ROOT, repoRelativePath);
  if (!candidate.startsWith(`${REPO_ROOT}/`) && candidate !== REPO_ROOT) {
    throw new Error(`Ruta de payload fuera del repositorio: ${repoRelativePath}`);
  }
  return candidate;
}

function filesUnder(path: string): string[] {
  if (!existsSync(path)) throw new Error(`No existe source del payload: ${path}`);
  if (statSync(path).isFile()) return [path];

  const files: string[] = [];
  for (const entry of readdirSync(path).sort()) {
    files.push(...filesUnder(join(path, entry)));
  }
  return files;
}

function resolveImportedFile(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier);
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = join(base, `index${extension}`);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Import relativo del payload no encontrado: ${specifier} desde ${from}`);
}

function collectSourceClosure(entries: readonly string[]): string[] {
  const pending = entries.map(sourcePath);
  const found = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (found.has(current)) continue;
    found.add(current);
    const source = readFileSync(current, "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1];
      if (!specifier) continue;
      const imported = resolveImportedFile(current, specifier);
      if (imported) pending.push(imported);
    }
  }
  return [...found];
}

function hash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function addFile(source: string, staging: string, files: Set<string>): void {
  const repoRelativePath = relative(REPO_ROOT, source).split("\\").join("/");
  const destination = join(staging, repoRelativePath);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
  files.add(repoRelativePath);
}

function addSourcePath(repoRelativePath: string, staging: string, files: Set<string>): void {
  for (const source of filesUnder(sourcePath(repoRelativePath))) addFile(source, staging, files);
}

export async function bundleCcEin(options: { candidate?: CandidateInput; out?: string } = {}): Promise<void> {
	const verified = options.candidate ? verifyCandidateInput(options.candidate) : undefined;
	const staging = mkdtempSync(join(tmpdir(), "ein-cc-payload-"));
  try {
    const files = new Set<string>();
    for (const root of CC_EIN_PAYLOAD_ROOTS) addSourcePath(root, staging, files);
    for (const file of CC_EIN_PAYLOAD_FILES) addSourcePath(file, staging, files);
		for (const source of collectSourceClosure(CC_EIN_PAYLOAD_SOURCE_ENTRIES)) addFile(source, staging, files);
		if (verified) for (const path of stageDashboardSeed(verified, staging, REPO_ROOT)) files.add(path);

    const manifest: CcEinPayloadManifest = {
      format: "ein-cc-payload/v1",
      files: [...files]
        .sort()
			.map((path): CcEinPayloadManifestEntry => ({ path, sha256: hash(join(staging, path)) })),
		};
		if (options.candidate) manifest.dashboardSeed = { format: "ein-dashboard-seed/v1", target: options.candidate.target.id };
    writeFileSync(join(staging, CC_EIN_PAYLOAD_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

		const out = options.out ?? OUT;
		mkdirSync(dirname(out), { recursive: true });
		const proc = Bun.spawn(["tar", "-czf", out, "."], { cwd: staging, stderr: "pipe" });
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code !== 0) throw new Error(`tar fallo (code ${code}): ${stderr}`);

    console.log("/// cc-ein payload empaquetado");
    console.log(`  archivos: ${manifest.files.length}`);
		console.log(`  salida:   ${out}`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (import.meta.main) bundleCcEin({ candidate: candidateInputFromArgs(process.argv.slice(2)) }).catch((error) => {
  console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
