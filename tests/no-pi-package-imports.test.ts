// =============================================================================
// TESTS: el código del agente no hace value-import de paquetes Pi
// Los paquetes declarados de Pi (@juicesharp/*, pi-subagents, ...) viven en
// ~/.pi/agent/npm/node_modules y NO son resolubles por Node desde lib/ o
// extensions/ (un `import` falla al cargar la extensión en runtime). Pi los
// carga como extensiones por su cuenta; nuestro código debe leerlos solo por
// globalThis/ficheros, nunca importarlos. Este test bloquea esa regresión.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "..", "ein-pi", "agent");
const ROOTS = [join(AGENT, "lib"), join(AGENT, "extensions")];

// Bare-package value-imports que romperían la carga de extensiones en Pi.
// `import type ...` está permitido (se borra en runtime).
const FORBIDDEN =
	/(^\s*import\s+(?!type\b)[^;]*?from\s+["'](@juicesharp\/|pi-subagents|pi-mcp-adapter)[^"']*["'])|(\bimport\(\s*["'](@juicesharp\/|pi-subagents|pi-mcp-adapter))/m;

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else if (entry.endsWith(".ts")) out.push(full);
	}
	return out;
}

describe("sin value-imports de paquetes Pi en el código del agente", () => {
	const files = ROOTS.flatMap(walk);

	test("hay ficheros que escanear", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	test("ningún lib/extension importa un paquete Pi como valor", () => {
		const offenders = files.filter((f) => FORBIDDEN.test(readFileSync(f, "utf8")));
		expect(offenders).toEqual([]);
	});
});
