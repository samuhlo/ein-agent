import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");
const fleetConfigPath = join(repositoryRoot, "ein-pi", "agent", "extensions", "subagent", "config.json");
const todoExtensionPath = join(repositoryRoot, "ein-pi", "agent", "extensions", "ein-sdd-overlay.ts");

describe("shipped subagent widget layout", () => {
	test("uses the tracked extension config for the single fleet surface policy", () => {
		const config = JSON.parse(readFileSync(fleetConfigPath, "utf8")) as Record<string, unknown>;

		expect(config.fleetViewPlacement).toBe("aboveEditor");
		expect(config.asyncWidget).toBe(false);
	});

	test("keeps fleet and TODO in distinct ordered regions", () => {
		const config = JSON.parse(readFileSync(fleetConfigPath, "utf8")) as Record<string, unknown>;
		const todoExtension = readFileSync(todoExtensionPath, "utf8");
		const todoPlacement = todoExtension.match(/setWidget\(OVERLAY_KEY,[\s\S]*?placement: "([^"]+)"/)?.[1];

		expect([config.fleetViewPlacement, todoPlacement]).toEqual(["aboveEditor", "belowEditor"]);
		expect(config.fleetViewPlacement).not.toBe(todoPlacement);
	});
});
