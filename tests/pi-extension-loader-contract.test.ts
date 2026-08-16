import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EXTENSIONS = join(import.meta.dir, "..", "ein-pi", "agent", "extensions");

// Pi carga TODO fichero .ts del primer nivel de extensions/ y aborta con codigo
// 1 si alguno no exporta una factory por defecto. Un modulo auxiliar colocado
// ahi tumba el arranque entero: paso exactamente eso con models-panel.ts.
describe("Pi extension loader contract", () => {
	const topLevel = readdirSync(EXTENSIONS, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
		.map((entry) => entry.name)
		.sort();

	test("every auto-loaded extension declares a default export", () => {
		expect(topLevel.length).toBeGreaterThan(0);
		const missing = topLevel.filter((name) => !/^export default/m.test(readFileSync(join(EXTENSIONS, name), "utf8")));
		expect(missing).toEqual([]);
	});

	test("helper modules stay under a subdirectory Pi does not scan", () => {
		expect(topLevel).not.toContain("models-panel.ts");
		expect(readdirSync(join(EXTENSIONS, "internal"))).toContain("models-panel.ts");
	});
});
