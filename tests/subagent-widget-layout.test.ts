import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");
const fleetConfigPath = join(repositoryRoot, "ein-pi", "agent", "extensions", "subagent", "config.json");
const todoExtensionPath = join(repositoryRoot, "ein-pi", "agent", "extensions", "ein-sdd-overlay.ts");

describe("shipped subagent widget layout", () => {
	test("shows native live activity instead of the collapsed fleet counter", () => {
		const config = JSON.parse(readFileSync(fleetConfigPath, "utf8")) as Record<string, unknown>;

		expect(config.fleetView).toBe(false);
		expect(config.asyncWidget).toBe(true);
		expect(config.mainWindowRenderer).toEqual({ compactResultMaxLines: 5, horizontalSpacing: 1 });
	});

	test("keeps TODO below the editor, away from the native activity widget above it", () => {
		const todoExtension = readFileSync(todoExtensionPath, "utf8");
		const todoPlacement = todoExtension.match(/setWidget\(OVERLAY_KEY,[\s\S]*?placement: "([^"]+)"/)?.[1];

		expect(todoPlacement).toBe("belowEditor");
	});
});
