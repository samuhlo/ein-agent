// =============================================================================
// COMPILED CC-EIN PAYLOAD SMOKE
// This entrypoint is compiled on Linux x64 so BunFS asset imports exercise the
// same extraction path as the published installer binary.
// =============================================================================

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CC_EIN_PAYLOAD_REQUIRED_PATHS,
  stageCcEinPayload,
  type CcEinPayloadStage,
} from "../src/core/cc-payload.ts";

function assertSmoke(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const originalCwd = process.cwd();
  const unrelatedCwd = mkdtempSync(join(tmpdir(), "ein-cc-payload-smoke-cwd-"));
  let staged: CcEinPayloadStage | undefined;

  try {
    process.chdir(unrelatedCwd);
    staged = await stageCcEinPayload();
    assertSmoke(
      staged.archivePath.startsWith(`${staged.root}/`),
      `payload archive was not materialized inside staging root: ${staged.archivePath}`,
    );
    assertSmoke(existsSync(staged.archivePath), "materialized payload archive is missing");
    for (const relativePath of CC_EIN_PAYLOAD_REQUIRED_PATHS) {
      assertSmoke(
        existsSync(join(staged.root, relativePath)),
        `required payload path is missing: ${relativePath}`,
      );
    }
  } finally {
    staged?.cleanup();
    if (staged) {
      assertSmoke(!existsSync(staged.archivePath), "payload archive cleanup failed");
      assertSmoke(!existsSync(staged.root), "payload staging cleanup failed");
    }
    process.chdir(originalCwd);
    rmSync(unrelatedCwd, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
