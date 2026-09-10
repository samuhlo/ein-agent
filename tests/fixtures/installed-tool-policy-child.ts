// Exercise the real CLI entry without running brew/curl or touching user tools.
import { mock } from "bun:test";
import { appendFileSync } from "node:fs";
const deps = await import("../../installer/src/core/deps.ts");
mock.module("../../installer/src/core/deps.ts", () => ({
  ...deps,
  refreshExternalTools: async () => {
    appendFileSync(process.env.EIN_TEST_TOOL_POLICY_LOG!, "new-policy\n");
    return [{ ok: true, detail: "new-policy tool only" }];
  },
}));
await import("../../installer/src/main.ts");
