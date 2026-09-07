import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

test("ordinary Pi surfaces inherit the terminal background", () => {
	// Other extension tests mock pi-tui globally; load the real theme in its own process.
	const output = execFileSync("bun", ["-e", `
		import { loadThemeFromPath } from "./node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
		const theme = loadThemeFromPath("./ein-pi/agent/themes/ein.json", "truecolor");
		console.log(JSON.stringify({
			ordinary: ["userMessageBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"].map((token) => theme.bg(token, "sample")),
			selected: theme.bg("selectedBg", "selected"),
		}));
	`], { cwd: join(import.meta.dir, ".."), encoding: "utf8", timeout: 10_000 });
	const colors = JSON.parse(output) as { ordinary: string[]; selected: string };
	for (const value of colors.ordinary) expect(value).toBe("\u001b[49msample\u001b[49m");
	// Selection remains explicit in native menus; normal messages never carry that fill.
	expect(colors.selected).toContain("\u001b[48;2;");
});
