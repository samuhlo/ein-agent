import { join } from "node:path";
import { MANAGED_DIRS, cleanManagedDirs } from "./deploy.ts";
import type { Result, UpdateStageError } from "./release-types.ts";
import type { UpdateCaps } from "./update-caps.ts";

export type TemplateSnapshot = { path: string };
export type TemplateTransactionError = UpdateStageError;

function templateError(code: string, message: string): TemplateTransactionError {
  return { stage: "deploying", code, message };
}

/** Copies only updater-owned paths; credentials and user-managed skills stay outside recovery. */
export function snapshotTemplate(
  options: { agentDir: string; snapshotPath?: string; caps: UpdateCaps },
): Result<TemplateSnapshot, TemplateTransactionError> {
  const { agentDir, caps } = options;
  const snapshotPath = options.snapshotPath ?? caps.fs.createTempDir("ein-template-snapshot-");
  try {
    caps.fs.makeDir(snapshotPath);
    for (const dir of MANAGED_DIRS) {
      const source = join(agentDir, dir);
      if (caps.fs.exists(source)) caps.fs.copyDir(source, join(snapshotPath, dir));
    }
    const manifest = join(agentDir, "template-manifest.json");
    if (caps.fs.exists(manifest)) caps.fs.copyFile(manifest, join(snapshotPath, "template-manifest.json"));
    return { ok: true, value: { path: snapshotPath } };
  } catch (error) {
    return { ok: false, error: templateError("snapshot-failed", error instanceof Error ? error.message : "Could not snapshot managed template") };
  }
}

/** Deploys through the verified continuation binary, never the running installer's embedded asset. */
export async function deployEmbeddedTemplate(
  options: { binaryPath: string; agentDir: string; caps: UpdateCaps },
): Promise<Result<void, TemplateTransactionError>> {
  try {
    await options.caps.template.deploy(options.binaryPath, options.agentDir);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: templateError("deploy-failed", error instanceof Error ? error.message : "Could not deploy embedded template") };
  }
}

/** A restore starts with a wipe so removed files from a failed release cannot survive. */
export function restoreTemplate(
  options: { agentDir: string; snapshotPath: string; caps: UpdateCaps },
): Result<void, TemplateTransactionError> {
  try {
    cleanManagedDirs(options.agentDir);
    for (const dir of MANAGED_DIRS) {
      const source = join(options.snapshotPath, dir);
      if (options.caps.fs.exists(source)) options.caps.fs.copyDir(source, join(options.agentDir, dir));
    }
    const manifest = join(options.snapshotPath, "template-manifest.json");
    const deployedManifest = join(options.agentDir, "template-manifest.json");
    if (options.caps.fs.exists(manifest)) options.caps.fs.copyFile(manifest, deployedManifest);
    else if (options.caps.fs.exists(deployedManifest)) options.caps.fs.removeFile(deployedManifest);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: templateError("restore-failed", error instanceof Error ? error.message : "Could not restore managed template") };
  }
}

export async function validateDeployedManifest(
  options: { agentDir: string; expectedVersion: string; caps: UpdateCaps },
): Promise<Result<void, TemplateTransactionError>> {
  try {
    const manifest = await options.caps.template.readManifest(options.agentDir);
    if (!manifest || manifest.templateVersion !== options.expectedVersion) {
      return { ok: false, error: templateError("manifest-mismatch", "Deployed template does not match selected release") };
    }
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: templateError("manifest-unreadable", error instanceof Error ? error.message : "Could not validate deployed template") };
  }
}
