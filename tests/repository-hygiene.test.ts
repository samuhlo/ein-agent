import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const BUN_BUILD_ARTIFACT = /^\.[a-f0-9]+-\d+\.bun-build$/;
const tracked = (...pathspec: string[]): string[] => execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...pathspec], {
	cwd: ROOT,
	encoding: "utf8",
}).trim().split("\n").filter(Boolean).sort();

describe("higiene del repositorio", () => {
	test("la raíz no contiene imágenes ni binarios de producto sueltos", () => {
		expect(tracked().filter((path) => !path.includes("/") && /\.(?:png|webp|jpe?g|gif|svg)$/i.test(path))).toEqual([]);
	});

	test("docs contiene un índice, un roadmap y ADR con nombres duraderos", () => {
		const documents = tracked("docs");
		expect(documents).toContain("docs/README.md");
		expect(documents).toContain("docs/roadmap.md");
		expect(documents.filter((path) => path !== "docs/README.md" && path !== "docs/roadmap.md")
			.every((path) => /^docs\/adr\/\d{4}-[a-z0-9-]+\.md$/.test(path))).toBe(true);
	});

	test("la raíz y el instalador no acumulan temporales de compilación de Bun", () => {
		for (const root of [ROOT, join(ROOT, "installer")]) {
			expect(readdirSync(root).filter((name) => BUN_BUILD_ARTIFACT.test(name))).toEqual([]);
		}
	});

	test("no queda una zona de spikes cerrados", () => {
		expect(tracked("spikes")).toEqual([]);
	});

	test("EIN.md no indexa documentos retirados ni placeholders", () => {
		const source = readFileSync(join(ROOT, "EIN.md"), "utf8");
		expect(source).not.toContain("_(describe)_");
		for (const retired of ["fricciones-dogfooding", "plan-hallazgos", "valoracion-estado", "origen-y-ideas", "EIN_DOCUMENTATION_BRIEF"]) {
			expect(source).not.toContain(retired);
		}
	});
});
