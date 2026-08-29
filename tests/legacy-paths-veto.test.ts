// =============================================================================
// TESTS: estructura canónica del workbench
// BLINDAJE -> Evita que vuelvan copias legacy fuera de ein-pi/agent.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const THIS_FILE = relative(REPO_ROOT, fileURLToPath(import.meta.url));

const deletedLegacyPaths = [
	["ein-pi", "agents"],
	["ein-pi", "chains"],
	["ein-pi", "openspec"],
	["ein-pi", "ein"],
	["ein-pi", "samuhlo"],
	["ein-pi", "settings.json"],
].map((segments) => join(...segments));

const legacyReferencePatterns = deletedLegacyPaths.map((path) =>
	path.endsWith(".json") ? path : `${path}/`,
);

function readRepoFile(path: string): string {
	return readFileSync(join(REPO_ROOT, path), "utf8");
}

function collectFiles(root: string, extensions: Set<string>): string[] {
	const absoluteRoot = join(REPO_ROOT, root);
	if (!existsSync(absoluteRoot)) return [];

	const files: string[] = [];
	const ignoredDirs = new Set([
		".atl",
		".piagents",
		".sdd",
		"backups",
		"bin",
		"disabled-skill-conflicts",
		"npm",
		"sessions",
	]);

	function walk(dir: string): void {
		for (const entry of readdirSync(dir)) {
			if (ignoredDirs.has(entry)) continue;

			const absolutePath = join(dir, entry);
			const stat = statSync(absolutePath);
			if (stat.isDirectory()) {
				walk(absolutePath);
				continue;
			}

			if (extensions.has(extname(entry))) {
				files.push(relative(REPO_ROOT, absolutePath));
			}
		}
	}

	walk(absoluteRoot);
	return files;
}

describe("estructura canónica de ein-pi", () => {
	test("el bundler compone runtime + ein-pi/agent como fuentes", () => {
		const content = readRepoFile("installer/scripts/bundle-template.ts");

		expect(content).toContain('const RUNTIME_SOURCE = join(REPO_ROOT, "runtime")');
		expect(content).toContain('const VENDOR_SKILLS_SOURCE = join(REPO_ROOT, "vendor", "skills")');
		expect(content).toContain('const AGENT_SOURCE = join(REPO_ROOT, "ein-pi", "agent")');
	});

	test("README distingue runtime propio, vendor y adaptadores", () => {
		const content = readRepoFile("README.md");

		expect(content).toContain("`runtime/` es el contenido propio y portable");
		expect(content).toContain("`vendor/skills/` deja visible lo externo");
		expect(content).toContain("├── installer/      # dueño de `ein`");
	});

	test("el corte portable/runtime es el declarado", () => {
		// runtime/: contenido propio; agent/: adaptador Pi. Si un dir cambia de lado,
		// este test obliga a actualizar bundler, README y la decisión consciente.
		for (const dir of ["agents", "docs", "prompts", "skills"]) {
			expect(existsSync(join(REPO_ROOT, "runtime", dir))).toBe(true);
			expect(existsSync(join(REPO_ROOT, "ein-pi", "agent", dir))).toBe(false);
		}
		for (const dir of ["assets", "chains", "extensions", "lib"]) {
			expect(existsSync(join(REPO_ROOT, "ein-pi", "agent", dir))).toBe(true);
			expect(existsSync(join(REPO_ROOT, "runtime", dir))).toBe(false);
		}
		expect(existsSync(join(REPO_ROOT, "runtime", "AGENTS.md"))).toBe(true);
		expect(existsSync(join(REPO_ROOT, "runtime", "skills", "downloaded"))).toBe(false);
		expect(existsSync(join(REPO_ROOT, "vendor", "skills"))).toBe(true);
		expect(existsSync(join(REPO_ROOT, "ein-pi", "launchers", "ein-pi.fish"))).toBe(true);
		expect(existsSync(join(REPO_ROOT, "ein-cc", "launchers", "ein-cc.fish"))).toBe(true);
	});

	test("vendor contiene exactamente las skills declaradas por el catálogo", () => {
		const profile = JSON.parse(readRepoFile("runtime/skills/stack-profile.json")) as {
			catalog: Record<string, unknown>;
		};
		const vendored = readdirSync(join(REPO_ROOT, "vendor", "skills")).sort();

		expect(vendored).toEqual(Object.keys(profile.catalog).sort());
		for (const skill of vendored) {
			expect(existsSync(join(REPO_ROOT, "vendor", "skills", skill, "SKILL.md"))).toBe(true);
		}
	});

	test("las rutas legacy borradas no existen en el repo", () => {
		for (const path of deletedLegacyPaths) {
			expect(existsSync(join(REPO_ROOT, path))).toBe(false);
		}
	});

	test("no hay referencias activas a rutas legacy en archivos clave", () => {
		const files = [
			"README.md",
			...collectFiles("installer", new Set([".ts"])),
			...collectFiles("tests", new Set([".ts"])),
			...collectFiles(join("ein-pi", "agent"), new Set([".ts", ".md", ".json"])),
			...collectFiles("runtime", new Set([".ts", ".md", ".json"])),
		].filter((path) => path !== THIS_FILE);

		const offenders = files.flatMap((path) => {
			const content = readRepoFile(path);
			return legacyReferencePatterns
				.filter((pattern) => content.includes(pattern))
				.map((pattern) => `${path} -> ${pattern}`);
		});

		expect(offenders).toEqual([]);
	});
});
