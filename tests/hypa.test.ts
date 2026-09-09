// =============================================================================
// TESTS: lib/hypa
// Compresión Hypa del tool bash. El foco es el contrato FAIL CLOSED de
// buildHypaCommand: solo envuelve tools con reducer real; cualquier operador,
// comilla o marca de streaming/interactivo deja el comando crudo. Más la
// normalización de prefijo Bun y el round-trip de config.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import commandGuard from "../ein-pi/agent/extensions/internal/ein-command-guard-child.ts";

const {
	normalizeBunPrefix,
	buildHypaCommand,
	readHypaMode,
	writeHypaMode,
	hypaConfigPath,
	detectStackWantsHypa,
	resolveHypaEnabled,
	resolveHypaBin,
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
		expect(buildHypaCommand("git log -5", BIN)).toBe(
			`${BIN} -c "git log -5"`,
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
	test("los parches de revisión conservan salida y recuperación nativas", () => {
		for (const command of ["git diff", "git diff HEAD~3", "git show HEAD", "git --no-pager diff"]) {
			expect(buildHypaCommand(command, BIN)).toBeNull();
		}
	});
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

	test("default 'auto' sin fichero", () => {
		expect(readHypaMode(cwd)).toBe("auto");
	});

	test("round-trip auto/on/off", () => {
		writeHypaMode(cwd, "on");
		expect(readHypaMode(cwd)).toBe("on");
		writeHypaMode(cwd, "off");
		expect(readHypaMode(cwd)).toBe("off");
		writeHypaMode(cwd, "auto");
		expect(readHypaMode(cwd)).toBe("auto");
	});

	test("valor inválido → default auto", () => {
		writeHypaMode(cwd, "on");
		writeFileSync(hypaConfigPath(cwd), '{"mode":"maybe"}\n');
		expect(readHypaMode(cwd)).toBe("auto");
	});
});

describe("detectStackWantsHypa", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-hypa-stack-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("Bun puro (sin marcas) → false", () => {
		writeFileSync(join(cwd, "package.json"), "{}\n");
		writeFileSync(join(cwd, "bunfig.toml"), "\n");
		expect(detectStackWantsHypa(cwd)).toBe(false);
	});

	test("marcas de stack verboso → true", () => {
		for (const f of ["go.mod", "pom.xml", "Cargo.toml", "Dockerfile", "main.tf", "app.csproj", "build.gradle.kts"]) {
			const d = mkdtempSync(join(tmpdir(), "ein-hypa-mark-"));
			writeFileSync(join(d, f), "\n");
			expect(detectStackWantsHypa(d)).toBe(true);
			rmSync(d, { recursive: true, force: true });
		}
	});
});

describe("resolveHypaEnabled", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-hypa-res-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("on/off fuerzan; auto delega en la detección", () => {
		writeHypaMode(cwd, "on");
		expect(resolveHypaEnabled(cwd)).toBe(true);
		writeHypaMode(cwd, "off");
		expect(resolveHypaEnabled(cwd)).toBe(false);
		// auto sin marcas de stack → off
		writeHypaMode(cwd, "auto");
		expect(resolveHypaEnabled(cwd)).toBe(false);
		// auto con marca → on
		writeFileSync(join(cwd, "go.mod"), "\n");
		expect(resolveHypaEnabled(cwd)).toBe(true);
	});
});

describe("resolveHypaBin — instalación real", () => {
	let dir: string;
	beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ein-hypa-path-")); });
	afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
	const name = process.platform === "win32" ? "hypa.exe" : "hypa";
	function binary(folder: string) {
		mkdirSync(folder, { recursive: true }); const path = join(folder, name);
		writeFileSync(path, "#!/bin/sh\nexit 0\n"); chmodSync(path, 0o755); return path;
	}
	test("encuentra Homebrew/PATH y conserva la prioridad del override", () => {
		const found = binary(join(dir, "brew bin")); const explicit = binary(join(dir, "override"));
		expect(resolveHypaBin({ PATH: join(dir, "brew bin") })).toBe(found);
		expect(resolveHypaBin({ PATH: join(dir, "brew bin"), HYPA_BIN: explicit })).toBe(explicit);
	});
	test("omite entradas relativas y directorios que parecen binarios", () => {
		const bad = join(dir, "bad"); mkdirSync(join(bad, name), { recursive: true });
		const goodDir = join(dir, "good"); const good = binary(goodDir);
		expect(resolveHypaBin({ PATH: [".", "", "node_modules/.bin", bad, goodDir].join(delimiter) })).toBe(good);
	});
	test("omite un archivo no ejecutable en Unix", () => {
		if (process.platform === "win32") return;
		const badDir = join(dir, "bad"); chmodSync(binary(badDir), 0o644);
		const goodDir = join(dir, "good"); const good = binary(goodDir);
		expect(resolveHypaBin({ PATH: [badDir, goodDir].join(delimiter) })).toBe(good);
	});
	test("el binario descubierto se cita como una sola palabra de shell", () => {
		if (process.platform === "win32") return;
		const path = binary(join(dir, "brew bin"));
		const command = buildHypaCommand("git status", path)!;
		expect(Bun.spawnSync(["/bin/sh", "-c", command]).exitCode).toBe(0);
	});
	test("el proveedor foreground respeta off, protege comandos y no envuelve dos veces", async () => {
		const prior = process.env.HYPA_BIN;
		process.env.HYPA_BIN = binary(join(dir, "bin"));
		try {
			let handler: any;
			commandGuard({ on: (_event: string, callback: unknown) => { handler = callback; } } as never);
			const ctx = { cwd: dir, hasUI: false };
			const call = (command: string) => ({ toolName: "bash", toolCallId: "hypa", input: { command } });
			writeHypaMode(dir, "on");
			const log = call("git log -1");
			expect(await handler(log, ctx)).toBeUndefined();
			const wrapped = log.input.command;
			expect(wrapped).toContain(' -c "git log -1"');
			expect(await handler(log, ctx)).toBeUndefined();
			expect(log.input.command).toBe(wrapped);
			expect(await handler(call("git push --force origin main"), ctx)).toMatchObject({ block: true });
			const diff = call("git diff"); await handler(diff, ctx); expect(diff.input.command).toBe("git diff");
			writeHypaMode(dir, "off");
			const off = call("git log -1"); await handler(off, ctx); expect(off.input.command).toBe("git log -1");
		} finally {
			if (prior === undefined) delete process.env.HYPA_BIN; else process.env.HYPA_BIN = prior;
		}
	});
});
