import { expect, test } from "bun:test";
import { join } from "node:path";

test("apply capability and presentation in isolation from global Pi mocks", () => {
  const result = Bun.spawnSync([process.execPath, "test", join(import.meta.dir, "fixtures/apply-progress.case.ts")], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  expect(result.exitCode).toBe(0);
});
