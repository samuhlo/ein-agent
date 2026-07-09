// =============================================================================
// TESTS: lib/hypa
// Compresión Hypa del tool bash. El foco es el contrato FAIL CLOSED de
// buildHypaCommand: solo envuelve tools con reducer real; cualquier operador,
// comilla o marca de streaming/interactivo deja el comando crudo. Más la
// normalización de prefijo Bun y el round-trip de config.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
	normalizeBunPrefix,
	buildHypaCommand,
	readHypaMode,
	writeHypaMode,
	hypaConfigPath,
} = await import("../ein-pi/agent/lib/hypa");

const BIN = "/bin/hypa";

describe("normalizeBunPrefix", () => {
	test("desenvuelve bunx <tool-con-reducer>", () => {
		expect(normalizeBunPrefix("bunx vitest run")).toEqual({
			command: "vitest run",
			injectLocalBin: true,
		});
	});

	test("desenvuelve 'bun x' y 'bun run' para tools", () => {
		expect(normalizeBunPrefix("bun x eslint .").command).toBe("eslint .");
		expect(normalizeBunPrefix("bun run vitest").command).toBe("vitest");
	});

	test("NO toca 'bun run <script>' (no es tool)", () => {
		// "lint" es script de package.json, no binario con reducer.
		expect(normalizeBunPrefix("bun run lint")).toEqual({
			command: "bun run lint",
			injectLocalBin: false,
		});
	});

	test("tools no-locales (dotnet) no marcan injectLocalBin", () => {
		// dotnet no vive en node_modules/.bin; no se invoca por bunx en la práctica
		// pero si llegara, no debe pedir inyección de bin local.
		expect(normalizeBunPrefix("bunx dotnet test").injectLocalBin).toBe(false);
	});

	test("sin prefijo bun, pasa igual", () => {
		expect(normalizeBunPrefix("git diff")).toEqual({
			command: "git diff",
			injectLocalBin: false,
		});
	});
});

describe("buildHypaCommand — envuelve el allowlist", () => {
	test("git de lectura", () => {
		expect(buildHypaCommand("git diff HEAD~3", BIN)).toBe(
			`${BIN} -c "git diff HEAD~3"`,
		);
	});

	test("bunx vitest → inyecta bin local + anchor intacto", () => {
		expect(buildHypaCommand("bunx vitest run", BIN)).toBe(
			`env PATH="./node_modules/.bin:$PATH" ${BIN} -c "vitest run"`,
		);
	});

	test("dotnet test (first-class, sin bin local)", () => {
		expect(buildHypaCommand("dotnet test", BIN)).toBe(`${BIN} -c "dotnet test"`);
	});

	test("eslint directo", () => {
		expect(buildHypaCommand("eslint src", BIN)).toBe(`${BIN} -c "eslint src"`);
	});
});

describe("buildHypaCommand — FAIL CLOSED (deja crudo)", () => {
	test("comando vacío", () => {
		expect(buildHypaCommand("   ", BIN)).toBeNull();
	});

	test("tool sin reducer (tsc)", () => {
		expect(buildHypaCommand("tsc --noEmit", BIN)).toBeNull();
		expect(buildHypaCommand("bunx tsc --noEmit", BIN)).toBeNull();
	});

	test("script bun genérico", () => {
		expect(buildHypaCommand("bun run lint", BIN)).toBeNull();
		expect(buildHypaCommand("bun test", BIN)).toBeNull();
	});

	test("git de escritura/entrega no se toca", () => {
		expect(buildHypaCommand("git commit -m x", BIN)).toBeNull();
		expect(buildHypaCommand("git push", BIN)).toBeNull();
	});

	test("operadores de shell", () => {
		expect(buildHypaCommand("git diff | head", BIN)).toBeNull();
		expect(buildHypaCommand("eslint . && vitest run", BIN)).toBeNull();
		expect(buildHypaCommand("git diff > out.txt", BIN)).toBeNull();
		expect(buildHypaCommand("echo $(git diff)", BIN)).toBeNull();
	});

	test("comillas dobles (romperían el -c)", () => {
		expect(buildHypaCommand('eslint "src/**"', BIN)).toBeNull();
	});

	test("streaming / watch / interactivo cuelga → crudo", () => {
		expect(buildHypaCommand("vitest --watch", BIN)).toBeNull();
		expect(buildHypaCommand("vitest -w", BIN)).toBeNull();
		expect(buildHypaCommand("bunx vitest --ui", BIN)).toBeNull();
		expect(buildHypaCommand("docker logs -f app", BIN)).toBeNull();
		expect(buildHypaCommand("kubectl logs -f pod", BIN)).toBeNull();
	});

	test("tool fuera del allowlist", () => {
		expect(buildHypaCommand("npm run build", BIN)).toBeNull();
		expect(buildHypaCommand("find . -type f", BIN)).toBeNull();
	});
});

describe("readHypaMode / writeHypaMode", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-hypa-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("default 'off' sin fichero", () => {
		expect(readHypaMode(cwd)).toBe("off");
	});

	test("round-trip on/off", () => {
		writeHypaMode(cwd, "on");
		expect(readHypaMode(cwd)).toBe("on");
		writeHypaMode(cwd, "off");
		expect(readHypaMode(cwd)).toBe("off");
	});

	test("valor inválido → default off", () => {
		writeHypaMode(cwd, "on");
		writeFileSync(hypaConfigPath(cwd), '{"mode":"maybe"}\n');
		expect(readHypaMode(cwd)).toBe("off");
	});
});
