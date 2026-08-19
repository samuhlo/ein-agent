// =============================================================================
// CC-EIN PAYLOAD
// Resolve and stage the embedded Claude runtime archive. Callers receive an
// explicit root; no path is inferred from process.cwd().
// =============================================================================

import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  type Dirent,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { run } from "./exec.ts";
import {
  CC_EIN_PAYLOAD_FILES,
  CC_EIN_PAYLOAD_MANIFEST,
  CC_EIN_PAYLOAD_REQUIRED_PATHS,
  CC_EIN_PAYLOAD_ROOTS,
  CC_EIN_PAYLOAD_SDD_ENTRY,
  type CcEinPayloadManifest,
  type CcEinPayloadManifestEntry,
} from "./cc-payload-inventory.ts";

export {
  CC_EIN_PAYLOAD_FILES,
  CC_EIN_PAYLOAD_MANIFEST,
  CC_EIN_PAYLOAD_REQUIRED_PATHS,
  CC_EIN_PAYLOAD_ROOTS,
  CC_EIN_PAYLOAD_SDD_ENTRY,
  type CcEinPayloadManifest,
  type CcEinPayloadManifestEntry,
};

// Keep the generated asset behind a lazy import: clean checkouts can exercise
// payload logic without first running the packaging step. Bun still embeds this
// statically-addressed asset when the installer is compiled.
export const CC_EIN_PAYLOAD_ARCHIVE = "../assets/cc-ein-runtime.tar.gz";

export type CcEinPayloadStage = {
  archivePath: string;
  root: string;
  syncPath: string;
  sddCliPath: string;
  manifestPath: string;
  cleanup: () => void;
};

export type StageCcEinPayloadOptions = {
  /** Explicit archive override for tests and asset resolvers. */
  archivePath?: string;
  /** Parent directory for the temporary staged root. */
  tempDirectory?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve one concrete archive. Missing assets are errors, not invitations to
 * search the caller's cwd or an adjacent repository checkout. Existence is
 * probed with `stat`: a compiled installer resolves its own payload to a BunFS
 * path, which answers `stat` but has no real path to resolve.
 */
function validateCcEinPayloadArchive(archivePath: string): string {
  try {
    if (!archivePath) {
      throw new Error("ruta vacia");
    }
    statSync(archivePath);
  } catch {
    throw new Error(`No se encontro el payload cc-ein: ${archivePath || "ruta vacia"}`);
  }
  return archivePath;
}

async function resolveEmbeddedCcEinPayloadArchive(): Promise<string> {
  try {
    const { default: archivePath } = await import(
      "../assets/cc-ein-runtime.tar.gz",
      { with: { type: "file" } },
    );
    return validateCcEinPayloadArchive(archivePath);
  } catch (error) {
    throw new Error(
      `No se encontro el payload cc-ein generado en ${CC_EIN_PAYLOAD_ARCHIVE}: ${errorMessage(error)}`,
    );
  }
}

export function resolveCcEinPayloadArchive(archivePath: string): string;
export function resolveCcEinPayloadArchive(): Promise<string>;
export function resolveCcEinPayloadArchive(archivePath?: string): string | Promise<string> {
  return archivePath === undefined
    ? resolveEmbeddedCcEinPayloadArchive()
    : validateCcEinPayloadArchive(archivePath);
}

const REQUIRED_PAYLOAD_DIRECTORIES = new Set(["ein-pi/core"]);
const LOCAL_PAYLOAD_ARCHIVE = "cc-ein-runtime.tar.gz";

function isWithinRoot(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return Boolean(path) && !path.startsWith("..") && !isAbsolute(path);
}

function assertConfinedPath(root: string, relativePath: string): string {
  const segments = relativePath.split("/");
  const candidate = resolve(root, relativePath);
  if (
    !relativePath ||
    isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
    !isWithinRoot(root, candidate)
  ) {
    throw new Error(`Manifest del payload cc-ein referencia una ruta invalida: ${relativePath}`);
  }

  let realRoot: string;
  let realCandidate: string;
  try {
    realRoot = realpathSync(root);
    realCandidate = realpathSync(candidate);
  } catch {
    throw new Error(`Manifest del payload cc-ein referencia una ruta inexistente: ${relativePath}`);
  }
  if (!isWithinRoot(realRoot, realCandidate)) {
    throw new Error(`Manifest del payload cc-ein escapa del root: ${relativePath}`);
  }
  return candidate;
}

function assertPayloadLayout(root: string): void {
  const missing: string[] = [];
  const invalidKinds: string[] = [];
  for (const relativePath of CC_EIN_PAYLOAD_REQUIRED_PATHS) {
    const file = join(root, relativePath);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(file);
    } catch {
      missing.push(relativePath);
      continue;
    }

    const isDirectory = REQUIRED_PAYLOAD_DIRECTORIES.has(relativePath);
    const validKind = isDirectory ? stat.isDirectory() : stat.isFile();
    if (!validKind) {
      invalidKinds.push(`${relativePath} (${isDirectory ? "directory" : "file"})`);
      continue;
    }
    try {
      assertConfinedPath(root, relativePath);
    } catch {
      invalidKinds.push(`${relativePath} (fuera del root)`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Payload cc-ein incompleto; faltan: ${missing.join(", ")}`);
  }
  if (invalidKinds.length > 0) {
    throw new Error(`Payload cc-ein con tipos invalidos: ${invalidKinds.join(", ")}`);
  }
}

function collectRegularFiles(root: string, current = root): string[] {
  const files: string[] = [];
  const entries = readdirSync(current, { withFileTypes: true }) as Dirent[];
  for (const entry of entries) {
    const absolutePath = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRegularFiles(root, absolutePath));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Payload cc-ein contiene un miembro no regular: ${relative(root, absolutePath)}`);
    }
    files.push(relative(root, absolutePath).split("\\").join("/"));
  }
  return files;
}

function isManifestEntry(value: unknown): value is CcEinPayloadManifestEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.path === "string" && typeof entry.sha256 === "string";
}

async function validatePayloadManifest(root: string): Promise<string> {
  const manifestPath = join(root, CC_EIN_PAYLOAD_MANIFEST);
  let manifestStat: ReturnType<typeof lstatSync>;
  try {
    manifestStat = lstatSync(manifestPath);
  } catch {
    throw new Error("Manifest del payload cc-ein ausente");
  }
  if (!manifestStat.isFile()) {
    throw new Error("Manifest del payload cc-ein no es un fichero regular");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await Bun.file(manifestPath).text());
  } catch (error) {
    throw new Error(`Manifest del payload cc-ein invalido: ${errorMessage(error)}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Manifest del payload cc-ein invalido");
  }
  const manifest = parsed as Record<string, unknown>;
  if (manifest.format !== "ein-cc-payload/v1" || !Array.isArray(manifest.files)) {
    throw new Error("Manifest del payload cc-ein invalido");
  }

  const listed = new Set<string>();
  for (const value of manifest.files) {
    if (!isManifestEntry(value)) {
      throw new Error("Entrada invalida en el manifest del payload cc-ein");
    }
    const entry = value;
    if (!/^[0-9a-f]{64}$/.test(entry.sha256)) {
      throw new Error(`Checksum invalido en el payload cc-ein: ${entry.path}`);
    }
    if (listed.has(entry.path)) {
      throw new Error(`Entrada duplicada en el manifest del payload cc-ein: ${entry.path}`);
    }
    listed.add(entry.path);
    const file = assertConfinedPath(root, entry.path);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(file);
    } catch {
      throw new Error(`Manifest del payload cc-ein referencia un archivo inexistente: ${entry.path}`);
    }
    if (!stat.isFile()) {
      throw new Error(`Manifest del payload cc-ein referencia un miembro no regular: ${entry.path}`);
    }
    const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (digest !== entry.sha256) {
      throw new Error(`Checksum invalido en el payload cc-ein: ${entry.path}`);
    }
  }

  const extractedFiles = collectRegularFiles(root).filter(
    (path) => path !== CC_EIN_PAYLOAD_MANIFEST && path !== LOCAL_PAYLOAD_ARCHIVE,
  );
  const extracted = new Set(extractedFiles);
  const missing = extractedFiles.filter((path) => !listed.has(path));
  const unexpected = [...listed].filter((path) => !extracted.has(path));
  if (missing.length > 0 || unexpected.length > 0) {
    const details = [
      missing.length > 0 ? `sin entrada: ${missing.join(", ")}` : "",
      unexpected.length > 0 ? `no extraidos: ${unexpected.join(", ")}` : "",
    ].filter(Boolean).join("; ");
    throw new Error(`Manifest del payload cc-ein incompleto: ${details}`);
  }
  return manifestPath;
}

/**
 * Copy the archive through Bun's filesystem so external tools receive a real
 * filesystem path even when the source lives in BunFS after `--compile`.
 */
async function materializeCcEinPayloadArchive(sourcePath: string, root: string): Promise<string> {
  const archivePath = join(root, "cc-ein-runtime.tar.gz");
  try {
    const bytes = await Bun.file(sourcePath).arrayBuffer();
    const written = await Bun.write(archivePath, bytes);
    if (written !== bytes.byteLength) {
      throw new Error(`se escribieron ${written} de ${bytes.byteLength} bytes`);
    }
    return archivePath;
  } catch (error) {
    throw new Error(
      `No se pudo materializar el payload cc-ein desde ${sourcePath}: ${errorMessage(error)}`,
    );
  }
}

/**
 * Extract the embedded archive and return its deterministic repository root.
 * Cleanup is idempotent and is also performed when extraction or validation
 * fails, so a failed Claude attempt cannot leak staging directories.
 */
export async function stageCcEinPayload(
  options: StageCcEinPayloadOptions = {},
): Promise<CcEinPayloadStage> {
  const sourceArchivePath = await (options.archivePath === undefined
    ? resolveCcEinPayloadArchive()
    : resolveCcEinPayloadArchive(options.archivePath));
  const parent = options.tempDirectory ?? tmpdir();
  mkdirSync(parent, { recursive: true });
  const root = resolve(mkdtempSync(join(parent, "ein-cc-payload-")));
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    rmSync(root, { recursive: true, force: true });
  };

  try {
    const archivePath = await materializeCcEinPayloadArchive(sourceArchivePath, root);
    const extracted = await run("tar", ["-xzf", archivePath, "-C", root]);
    if (!extracted.ok) {
      throw new Error(`No se pudo extraer el payload cc-ein: ${extracted.stderr || extracted.code}`);
    }
    assertPayloadLayout(root);

    const manifestPath = await validatePayloadManifest(root);

    return {
      archivePath,
      root,
      syncPath: join(root, "cc-ein", "sync.ts"),
      sddCliPath: join(root, CC_EIN_PAYLOAD_SDD_ENTRY),
      manifestPath,
      cleanup,
    };
  } catch (error) {
    cleanup();
    throw new Error(errorMessage(error));
  }
}

// Explicit aliases make the seam readable at call sites that describe the
// operation as extraction rather than staging.
export const resolveCcEinPayload = resolveCcEinPayloadArchive;
export const extractCcEinPayload = stageCcEinPayload;
