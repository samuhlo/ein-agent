// =============================================================================
// CC-EIN PAYLOAD
// Resolve and stage the embedded Claude runtime archive. Callers receive an
// explicit root; no path is inferred from process.cwd().
// =============================================================================

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
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
 * search the caller's cwd or an adjacent repository checkout.
 */
function validateCcEinPayloadArchive(archivePath: string): string {
  if (!archivePath || !existsSync(archivePath)) {
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

function assertPayloadLayout(root: string): void {
  const missing = CC_EIN_PAYLOAD_REQUIRED_PATHS.filter((relativePath) =>
    !existsSync(join(root, relativePath)),
  );
  if (missing.length > 0) {
    throw new Error(`Payload cc-ein incompleto; faltan: ${missing.join(", ")}`);
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
  const archivePath = await (options.archivePath === undefined
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
    const extracted = await run("tar", ["-xzf", archivePath, "-C", root]);
    if (!extracted.ok) {
      throw new Error(`No se pudo extraer el payload cc-ein: ${extracted.stderr || extracted.code}`);
    }
    assertPayloadLayout(root);

    // A manifest is emitted by the asset builder. Read it when present to
    // catch malformed JSON early, while allowing fixture archives to exercise
    // the extraction seam without duplicating generated checksums.
    const manifestPath = join(root, CC_EIN_PAYLOAD_MANIFEST);
    if (existsSync(manifestPath)) {
      const raw = await Bun.file(manifestPath).text();
      const manifest = JSON.parse(raw) as Partial<CcEinPayloadManifest>;
      if (manifest.format !== "ein-cc-payload/v1" || !Array.isArray(manifest.files)) {
        throw new Error("Manifest del payload cc-ein invalido");
      }
      for (const entry of manifest.files) {
        if (!entry || typeof entry.path !== "string" || typeof entry.sha256 !== "string") {
          throw new Error("Entrada invalida en el manifest del payload cc-ein");
        }
        const file = resolve(root, entry.path);
        if (isAbsolute(entry.path) || (file !== root && !file.startsWith(`${root}/`)) || !existsSync(file)) {
          throw new Error(`Manifest del payload cc-ein referencia un archivo invalido: ${entry.path}`);
        }
        const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
        if (digest !== entry.sha256) {
          throw new Error(`Checksum invalido en el payload cc-ein: ${entry.path}`);
        }
      }
    }

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
