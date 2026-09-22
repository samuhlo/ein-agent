import { expect, test } from "bun:test";
import { join } from "node:path";

test("native SDK operation admission stays isolated from unrelated SDK mocks", () => {
  const result = Bun.spawnSync([process.execPath, "test", "./tests/fixtures/continuity-admission-denial.case.ts"], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  expect(result.exitCode).toBe(0);
});
