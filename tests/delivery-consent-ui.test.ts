import { expect, test } from "bun:test";
import { join } from "node:path";
test("delivery consent uses the real terminal keybindings and bounded rendering", () => {
  const result = Bun.spawnSync([process.execPath, "test", join(import.meta.dir, "fixtures/delivery-consent.case.ts")], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  expect(result.exitCode).toBe(0);
});
