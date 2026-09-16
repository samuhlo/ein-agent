import { expect, test } from "bun:test";
import { join } from "node:path";

test("question cards preserve native answers through real Pi rendering", () => {
  const result = Bun.spawnSync([process.execPath, "test", "./tests/fixtures/question-cards.case.ts"], {
    cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  expect(result.exitCode).toBe(0);
});
