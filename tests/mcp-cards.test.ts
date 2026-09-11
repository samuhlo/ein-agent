import { expect, test } from "bun:test";
import { join } from "node:path";

// Native renderers must not inherit pi-tui mocks installed by unrelated suites.
test("MCP card presentation and native lifecycle", () => {
  const result = Bun.spawnSync([process.execPath, "test", join(import.meta.dir, "fixtures/mcp-cards.case.ts")], {
    cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  expect(result.exitCode).toBe(0);
});
