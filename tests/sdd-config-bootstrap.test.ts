import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapOpenSpecConfig } from "../ein-pi/agent/lib/openspec-config-bootstrap";

let DIR: string;

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "openspec-bootstrap-"));
	writeFileSync(join(DIR, "package.json"), '{"name":"fixture","type":"module"}\n');
});

afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
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
});
