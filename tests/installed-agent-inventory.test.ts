import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SOURCE_AGENTS = join(ROOT, "ein-pi", "core", "agents");
const BUNDLE_SCRIPT = join(ROOT, "installer", "scripts", "bundle-template.ts");

function sourceAgents(): string[] {
	return readdirSync(SOURCE_AGENTS).filter((file) => file.endsWith(".md")).sort();
}

function bundledTemplate(): string {
	const result = Bun.spawnSync(["bun", "run", BUNDLE_SCRIPT], { cwd: ROOT });
	expect(result.exitCode).toBe(0);
	const staging = mkdtempSync(join(tmpdir(), "ein-template-inventory-"));
	const archive = join(ROOT, "installer", "src", "assets", "template.tar.gz");
	const extract = Bun.spawnSync(["tar", "-xzf", archive, "-C", staging]);
	expect(extract.exitCode).toBe(0);
	return staging;
}

describe("inventario instalado de agentes", () => {
	test("el scan fuente genera agents, assets/agents y manifest idénticos", () => {
		const staging = bundledTemplate();
		try {
			const source = sourceAgents();
			const staged = readdirSync(join(staging, "agents")).filter((file) => file.endsWith(".md")).sort();
			const assets = readdirSync(join(staging, "assets", "agents")).filter((file) => file.endsWith(".md")).sort();
			const manifest = JSON.parse(readFileSync(join(staging, "template-manifest.json"), "utf8")) as { agents: string[] };
			expect(source).toContain("ein-scout.md");
			expect(staged).toEqual(source);
			expect(assets).toEqual(source);
			expect(manifest.agents).toEqual(source);
		} finally {
			rmSync(staging, { recursive: true, force: true });
		}
	});

	test("install fallback y doctor incluyen scout sin ampliar los siete SDD", () => {
		const verify = readFileSync(join(ROOT, "installer", "src", "core", "verify.ts"), "utf8");
		const doctor = readFileSync(join(ROOT, "ein-pi", "agent", "extensions", "ein-doctor.ts"), "utf8");
		expect(verify).toContain('NON_SDD_AGENTS = ["ein-linear.md", "ein-git.md", "ein-scout.md"]');
		expect(verify).toContain("manifest?.agents?.length ? manifest.agents");
		expect(doctor).toContain('"ein-scout.md"');
		expect(doctor).toContain('"ein-scout tools"');
		expect(doctor).toContain('"ein-scout extensions"');
		expect(doctor).toContain("static extension contract");
		expect(doctor).toContain("no es una sonda ni recibo por ejecución");
		expect((verify.match(/sdd-[a-z]+\.md/g) ?? []).slice(0, 7)).toEqual([
			"sdd-scope.md", "sdd-map.md", "sdd-design.md", "sdd-tasks.md", "sdd-apply.md", "sdd-verify.md", "sdd-close.md",
		]);
	});

	test("el bundler conserva un scan list-free", () => {
		const bundle = readFileSync(BUNDLE_SCRIPT, "utf8");
		expect(bundle).not.toContain("ein-scout.md");
		expect(bundle).toContain('listMd(join(staging, "agents"))');
		expect(existsSync(join(SOURCE_AGENTS, "ein-scout.md"))).toBe(true);
	});
});
