// =============================================================================
// COMPILED EIN-CC PAYLOAD SMOKE
// This entrypoint is compiled on Linux x64 so BunFS asset imports exercise the
// same extraction path as the published installer binary. It stages the
// embedded payload from an unrelated cwd, runs the real Claude hand-off into a
// throwaway home, and fails non-zero unless the installed orchestrator asset
// matches the staged bytes and every staging artifact is gone.
// =============================================================================

import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runClaudeInstall } from "../src/cli/install.ts";
import { EIN_CC_ORCHESTRATOR_ASSET } from "../src/core/cc-payload-inventory.ts";
import { EIN_CC_PAYLOAD_REQUIRED_PATHS, stageEinCcPayload } from "../src/core/cc-payload.ts";

function assertSmoke(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const originalCwd = process.cwd();
  const unrelatedCwd = mkdtempSync(join(tmpdir(), "ein-cc-payload-smoke-cwd-"));
  const home = mkdtempSync(join(tmpdir(), "ein-cc-payload-smoke-home-"));
  let stagedRoot = "";
  let stagedArchive = "";
  let stagedBytes: Buffer | undefined;

  try {
    process.chdir(unrelatedCwd);
    const result = await runClaudeInstall({
      home,
      stagePayload: async () => {
        const staged = await stageEinCcPayload();
        stagedRoot = staged.root;
        stagedArchive = staged.archivePath;
        assertSmoke(
          staged.archivePath.startsWith(`${staged.root}/`),
          `payload archive was not materialized inside staging root: ${staged.archivePath}`,
        );
        assertSmoke(existsSync(staged.archivePath), "materialized payload archive is missing");
        for (const relativePath of EIN_CC_PAYLOAD_REQUIRED_PATHS) {
          assertSmoke(
            existsSync(join(staged.root, relativePath)),
            `required payload path is missing: ${relativePath}`,
          );
        }
        stagedBytes = readFileSync(join(staged.root, EIN_CC_ORCHESTRATOR_ASSET));
        return staged;
      },
    });

    assertSmoke(result.ok, `Claude hand-off failed: ${result.detail}`);
    assertSmoke(stagedBytes !== undefined, "staged orchestrator bytes were never captured");

    const installed = join(home, ".claude-ein", "assets", "orchestrator.md");
    assertSmoke(existsSync(installed), `installed orchestrator asset is missing: ${installed}`);
    assertSmoke(lstatSync(installed).isFile(), `installed orchestrator asset is not a regular file: ${installed}`);
    assertSmoke(
      readFileSync(installed).equals(stagedBytes as Buffer),
      "installed orchestrator asset does not match the packaged bytes",
    );

    assertSmoke(!existsSync(stagedArchive), "payload archive cleanup failed");
    assertSmoke(!existsSync(stagedRoot), "payload staging cleanup failed");
  } finally {
    if (stagedRoot) rmSync(stagedRoot, { recursive: true, force: true });
    process.chdir(originalCwd);
    rmSync(unrelatedCwd, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
