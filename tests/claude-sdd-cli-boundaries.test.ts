import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "ein-cc", "sdd-cli", "cli.ts");
const PRESENTATION = join(ROOT, "ein-cc", "sdd-cli", "presentation.ts");
const SYNC_COMMAND = join(ROOT, "ein-cc", "sdd-cli", "sync-command.ts");

describe("fronteras internas de la CLI SDD de Claude", () => {
	test("presentación y sincronización tienen módulos propietarios", () => {
		expect(existsSync(PRESENTATION)).toBeTrue();
		expect(existsSync(SYNC_COMMAND)).toBeTrue();

		const cli = readFileSync(CLI, "utf8");
		expect(cli).toContain('from "./presentation.ts"');
		expect(cli).toContain('from "./sync-command.ts"');
		expect(cli).not.toContain("function formatStatus");
		expect(cli).not.toContain("OPEN_SPEC_PARSE_CODES");
	});

	test("los módulos extraídos son puros respecto al proceso", () => {
		if (!existsSync(PRESENTATION) || !existsSync(SYNC_COMMAND)) return;
		const presentation = readFileSync(PRESENTATION, "utf8");
		const syncCommand = readFileSync(SYNC_COMMAND, "utf8");
		expect(presentation).not.toMatch(/\b(?:process|Bun)\b/);
		expect(syncCommand).not.toMatch(/\b(?:process|Bun)\b/);
	});
});
