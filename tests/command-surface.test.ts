import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

test("real command output renders a themed session entry without entering model context", () => {
	const output = execFileSync("bun", [join(import.meta.dir, "fixtures/command-surface-probe.ts")], {
		cwd: join(import.meta.dir, ".."), encoding: "utf8", timeout: 10000,
	});
	expect(output.trim()).toBe("command surfaces: passed");
});
