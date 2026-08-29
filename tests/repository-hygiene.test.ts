import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const tracked = (...pathspec: string[]): string[] => execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...pathspec], {
	cwd: ROOT,
	encoding: "utf8",
}).trim().split("\n").filter(Boolean).sort();

describe("higiene del repositorio", () => {
	test("la raíz no contiene imágenes ni binarios de producto sueltos", () => {
		expect(tracked().filter((path) => !path.includes("/") && /\.(?:png|webp|jpe?g|gif|svg|bun-build)$/i.test(path))).toEqual([]);
	});

	test("docs contiene únicamente roadmap, índice y decisiones duraderas", () => {
		expect(tracked("docs")).toEqual([
			"docs/README.md",
			"docs/adr/0001-review-workload-guard.md",
			"docs/adr/0002-retain-legacy-terminal-renderer.md",
			"docs/roadmap.md",
		]);
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
