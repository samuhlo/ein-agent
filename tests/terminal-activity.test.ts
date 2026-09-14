import { expect, test } from "bun:test";
import { join } from "node:path";

// Other suites mock pi-tui globally. Exercise native components in a clean process.
test("native terminal activity and transcript regression cases", () => {
  const result = Bun.spawnSync([process.execPath, "test", join(import.meta.dir, "fixtures/terminal-activity.case.ts")], {
    cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe",
  });
  expect(new TextDecoder().decode(result.stderr)).toContain("workflow result owns one title");
  expect(result.exitCode).toBe(0);
});
