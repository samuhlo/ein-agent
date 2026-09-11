import { expect, test } from "bun:test";
import { join } from "node:path";

test("native cards with real Pi components in an isolated process", () => {
  for (const args of [["test", "./tests/fixtures/native-cards.case.ts"], ["tooling/verify-native-cards-runtime.ts"]]) {
    const result = Bun.spawnSync([process.execPath, ...args], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
    expect(result.exitCode).toBe(0);
  }
});
