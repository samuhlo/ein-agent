import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EIN_AI_PATH = join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts");
const SDD_INIT_PATH = join(import.meta.dir, "../ein-pi/agent/extensions/sdd-init.ts");
import { bootstrapOpenSpecConfig } from "../ein-pi/agent/lib/openspec-config-bootstrap";

let DIR: string;

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "openspec-bootstrap-"));
	writeFileSync(join(DIR, "package.json"), '{"name":"fixture","type":"module"}\n');
});

afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
});

describe("Pi bootstrap wiring", () => {
	test("both entry surfaces reuse create-if-absent bootstrap", () => {
		for (const path of [EIN_AI_PATH, SDD_INIT_PATH]) {
			const source = readFileSync(path, "utf8");
			expect(source).toContain("bootstrapOpenSpecConfig(ctx.cwd)");
		}
	});
});

describe("bootstrapOpenSpecConfig", () => {
	test("crea config y directorios OpenSpec si faltan", () => {
		const result = bootstrapOpenSpecConfig(DIR);
		const configPath = join(DIR, "openspec", "config.yaml");

		expect(result.kind).toBe("created");
		expect(existsSync(configPath)).toBe(true);
		expect(existsSync(join(DIR, "openspec", "specs"))).toBe(true);
		expect(existsSync(join(DIR, "openspec", "changes", "archive"))).toBe(true);
		expect(readFileSync(configPath, "utf8")).toContain("strict_tdd:");
	});

	test("preserva bytes existentes en llamadas repetidas", () => {
		const configPath = join(DIR, "openspec", "config.yaml");
		const original = "# formato del usuario\r\nstrict_tdd: false\r\n";
		mkdirSync(join(DIR, "openspec"), { recursive: true });
		writeFileSync(configPath, original);

		expect(bootstrapOpenSpecConfig(DIR).kind).toBe("preserved");
		expect(bootstrapOpenSpecConfig(DIR).kind).toBe("preserved");
		expect(readFileSync(configPath)).toEqual(Buffer.from(original));
	});

	test("una llamada competida conserva el primer contenido creado", () => {
		const first = bootstrapOpenSpecConfig(DIR);
		const configPath = join(DIR, "openspec", "config.yaml");
		const content = readFileSync(configPath);
		const second = bootstrapOpenSpecConfig(DIR);

		expect(first.kind).toBe("created");
		expect(second.kind).toBe("preserved");
		expect(readFileSync(configPath)).toEqual(content);
	});

	// Prefill lean: los comandos salen de la fuente autoritativa (scripts), no de
	// heurística que adivina. strict_tdd solo se enciende con un runner real.
	test("rellena test_command desde package.json scripts y enciende strict_tdd", () => {
		writeFileSync(join(DIR, "package.json"), '{"name":"fixture","scripts":{"test":"vitest run","typecheck":"tsc --noEmit"}}\n');
		const result = bootstrapOpenSpecConfig(DIR);
		expect(result.kind).toBe("created");
		if (result.kind === "created") expect(result.detection.testCommand).toBe("npm run test");
		const yaml = readFileSync(join(DIR, "openspec", "config.yaml"), "utf8");
		expect(yaml).toContain("strict_tdd: true");
		expect(yaml).toContain('test_command: "npm run test"');
		expect(yaml).toContain("ver EIN.md");
	});

	// Fallback implícito: un proyecto Bun corre `bun test` sin declarar script —
	// el bug real que la detección heurística dejaba vacío.
	test("infiere `bun test` por bunfig.toml cuando no hay script de test", () => {
		writeFileSync(join(DIR, "package.json"), '{"name":"fixture"}\n');
		writeFileSync(join(DIR, "bunfig.toml"), "[test]\n");
		const result = bootstrapOpenSpecConfig(DIR);
		expect(result.kind).toBe("created");
		if (result.kind === "created") expect(result.detection.testCommand).toBe("bun test");
		expect(readFileSync(join(DIR, "openspec", "config.yaml"), "utf8")).toContain('command: "bun test"');
	});

	// Sin runner detectable → vacío con marcador; strict_tdd off (no mentir).
	test("deja el test_command vacío con marcador cuando no hay runner", () => {
		const yaml = (() => {
			bootstrapOpenSpecConfig(DIR); // package.json sin scripts (del beforeEach)
			return readFileSync(join(DIR, "openspec", "config.yaml"), "utf8");
		})();
		expect(yaml).toContain("strict_tdd: false");
		expect(yaml).toContain("el sdd-scope lo rellena");
	});
});
