import { expect, test } from "bun:test";
import { join } from "node:path";

test("CLI recovery crosses a real native session in an isolated process", () => {
  const result = Bun.spawnSync([process.execPath, "test", "./tests/fixtures/claude-continuity-recovery-cli.case.ts"], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  expect(result.exitCode).toBe(0);
});
