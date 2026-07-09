// =============================================================================
// TESTS: lib/project-context (EIN.md)
// Generación del scaffold (comandos + estructura), preservación de la zona
// curada al refrescar, inyección de la directiva y sello de frescura.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { writeEinMd, readEinMd, einContextDirective, einMdPath, einMdCommitsBehind } =
	await import("../ein-pi/agent/lib/project-context");

describe("writeEinMd", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-ctx-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("crea EIN.md con sello, zona AUTO y comandos del package.json", () => {
		writeFileSync(
			join(cwd, "package.json"),
			JSON.stringify({ scripts: { build: "x", test: "y" } }),
		);
		mkdirSync(join(cwd, "src"));
		const { created } = writeEinMd(cwd);
		expect(created).toBe(true);
		const content = readFileSync(einMdPath(cwd), "utf8");
		expect(content).toContain("# EIN.md");
		expect(content).toContain("<!-- ein:init");
		expect(content).toContain("## Overview");
		expect(content).toContain("ein:auto:start");
		expect(content).toContain("ein:auto:end");
		expect(content).toContain("npm run build");
		expect(content).toContain("`src/`");
	});

	test("índice sembrado (curado) + docs detectados (AUTO)", () => {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "docs"));
		writeFileSync(join(cwd, "README.md"), "# r");
		writeFileSync(join(cwd, "docs", "guide.md"), "# g");
		writeEinMd(cwd);
		const content = readFileSync(einMdPath(cwd), "utf8");
		expect(content).toContain("## Índice");
		expect(content).toContain("- `src/` — _(describe)_");
		expect(content).toContain("## Docs");
		expect(content).toContain("[README](README.md)");
		expect(content).toContain("[docs/guide.md](docs/guide.md)");
	});

	test("refrescar preserva el Índice curado (descripciones del modelo)", () => {
		mkdirSync(join(cwd, "src"));
		writeEinMd(cwd);
		let content = readFileSync(einMdPath(cwd), "utf8");
		content = content.replace("- `src/` — _(describe)_", "- `src/` — núcleo de la app");
		writeFileSync(einMdPath(cwd), content);
		mkdirSync(join(cwd, "lib"));
		writeEinMd(cwd);
		const refreshed = readFileSync(einMdPath(cwd), "utf8");
		expect(refreshed).toContain("- `src/` — núcleo de la app");
		// Capa A: el dir nuevo entra al índice curado con placeholder.
		expect(refreshed).toContain("- `lib/` — _(describe)_");
	});

	test("sync del índice: dir eliminado se cae, descripción preservada", () => {
		mkdirSync(join(cwd, "src"));
		mkdirSync(join(cwd, "legacy"));
		writeEinMd(cwd);
		let content = readFileSync(einMdPath(cwd), "utf8");
		content = content.replace("- `src/` — _(describe)_", "- `src/` — app");
		writeFileSync(einMdPath(cwd), content);
		// legacy/ desaparece; refresco.
		rmSync(join(cwd, "legacy"), { recursive: true, force: true });
		writeEinMd(cwd);
		const refreshed = readFileSync(einMdPath(cwd), "utf8");
		expect(refreshed).toContain("- `src/` — app"); // preservada
		// La línea de índice de legacy/ se cae (el heading ## Índice sigue).
		expect(refreshed).not.toContain("- `legacy/`");
		expect(refreshed).toContain("## Índice");
	});

	test("refrescar preserva la zona curada y regenera la AUTO", () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "y" } }));
		writeEinMd(cwd);
		// El usuario edita la zona curada.
		const edited = readFileSync(einMdPath(cwd), "utf8").replace(
			"## Overview",
			"## Overview\nSENTINEL-CURADO",
		);
		writeFileSync(einMdPath(cwd), edited);
		// Aparece un script nuevo y refrescamos.
		writeFileSync(
			join(cwd, "package.json"),
			JSON.stringify({ scripts: { test: "y", build: "z" } }),
		);
		const { created } = writeEinMd(cwd);
		expect(created).toBe(false);
		const content = readFileSync(einMdPath(cwd), "utf8");
		expect(content).toContain("SENTINEL-CURADO"); // curado intacto
		expect(content).toContain("npm run build"); // AUTO regenerada
	});
});

describe("einContextDirective", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-ctx-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("vacío si no hay EIN.md", () => {
		expect(einContextDirective(cwd)).toBe("");
	});

	test("inyecta el contenido cuando existe", () => {
		writeFileSync(einMdPath(cwd), "# EIN.md\nhola contexto\n");
		const out = einContextDirective(cwd);
		expect(out).toContain("EIN.md");
		expect(out).toContain("hola contexto");
	});
});

describe("frescura", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-ctx-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("EIN.md sin sello → rev undefined y commitsBehind undefined", () => {
		writeFileSync(einMdPath(cwd), "# EIN.md\nhecho a mano\n");
		expect(readEinMd(cwd).rev).toBeUndefined();
		expect(einMdCommitsBehind(cwd)).toBeUndefined();
	});
});
