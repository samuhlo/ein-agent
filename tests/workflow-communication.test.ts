import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { responseVoiceDirective } from "../ein-pi/agent/lib/persona.ts";

test("the native thinking display is hidden by default and remains configurable", () => {
	const output = execFileSync("bun", ["-e", `
		import { SettingsManager } from "@earendil-works/pi-coding-agent";
		import { readFileSync } from "node:fs";
		const settings = JSON.parse(readFileSync("ein-pi/agent/settings.json", "utf8"));
		console.log(JSON.stringify([SettingsManager.inMemory(settings).getHideThinkingBlock(), SettingsManager.inMemory({...settings, hideThinkingBlock:false}).getHideThinkingBlock()]));
	`], { cwd: join(import.meta.dir, ".."), encoding: "utf8", timeout: 10_000 });
	expect(JSON.parse(output)).toEqual([true, false]);
});

test("voice permits proportionate explanations instead of mandatory seven-section replies", () => {
	const voice = responseVoiceDirective();
	expect(voice).toContain("a localized fix with tests can use a few paragraphs");
	expect(voice).not.toContain("you MUST answer in the Samu");
	expect(voice).not.toContain("multi-file work");
});
