// =============================================================================
// TESTS: el guardián de dependencias del workspace
//   Si este guardián se rompe, vuelven los 16-19 rojos que parecen tests rotos
//   y no lo son. Por eso se prueba: corta toda la suite.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WORKSPACE_INSTALLS, missingDepsMessage, missingWorkspaceDeps } from "./fixtures/workspace-deps";

function tree(...dirs: string[]): string {
	const root = mkdtempSync(join(tmpdir(), "ein-workspace-deps-"));
	for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true });
	return root;
}

describe("qué falta", () => {
	test("un árbol sin nada declara las dos instalaciones", () => {
		expect(missingWorkspaceDeps(tree()).length).toBe(WORKSPACE_INSTALLS.length);
	});

	test("con la raíz instalada solo falta la del instalador", () => {
		const missing = missingWorkspaceDeps(tree("node_modules"));
		expect(missing).toHaveLength(1);
		expect(missing[0].deps).toBe(join("installer", "node_modules"));
		expect(missing[0].fix).toContain("cd installer");
	});

	test("con las dos instaladas no falta nada", () => {
		expect(missingWorkspaceDeps(tree("node_modules", join("installer", "node_modules")))).toEqual([]);
	});

	test("el repo real, tal como está ahora, pasa el guardián", () => {
		expect(missingWorkspaceDeps(join(import.meta.dir, ".."))).toEqual([]);
	});
});

describe("qué se lee cuando falta", () => {
	test("el aviso nombra lo que falta Y el comando exacto", () => {
		const message = missingDepsMessage(missingWorkspaceDeps(tree("node_modules")));
		expect(message).toContain("installer");
		expect(message).toContain("cd installer && bun install");
		expect(message).toMatch(/no son tuyos/);
	});

	test("sin nada que avisar, no se dice nada", () => {
		expect(missingDepsMessage([])).toBe("");
	});
});
