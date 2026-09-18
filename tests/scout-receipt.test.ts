import { expect, test } from "bun:test";
import { join } from "node:path";

test("scout evidence receipts survive result delivery and real Pi rendering", () => {
  const result = Bun.spawnSync([process.execPath, "test", "./tests/fixtures/scout-receipt.case.ts"], {
    cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  expect(result.exitCode).toBe(0);
});
