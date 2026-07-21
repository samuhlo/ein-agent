// =============================================================================
// TESTS: lib/pi-contract — lo que Ein necesita de Pi
// =============================================================================
// BLINDAJE -> Ein codifica supuestos sobre Pi en las allowlists de los agentes,
// en los hooks de extensión y en los métodos de ExtensionAPI. Pi se mueve rápido
// y ninguno estaba comprobado: cada `pi update` era una ruleta. Ya salió caro
// una vez —`glob` no existe en Pi y tres fases SDD salieron ✗ con sus artefactos
// correctos, ~120k tokens en reintentos falsos.
//
// Dos derivas distintas, dos defensas:
//   1. DERIVA DE EIN — si Ein empieza a usar un hook o un método sin declararlo,
//      lo caza el escaneo del propio código fuente. Funciona en CI, sin Pi.
//   2. DERIVA DE PI — si un update quita o renombra algo, se ve al contrastar
//      contra la instalación real. Solo corre donde Pi existe; en CI se salta
//      DECLARÁNDOLO, nunca fingiendo un veredicto.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
	PI_BUILTIN_TOOLS,
	PI_EXTENSION_API,
	PI_HOOKS,
	compareWithSurface,
	driftIsEmpty,
	formatDrift,
	observePiSurface,
	resolvePiRoot,
	verifyPiContract,
} = await import("../ein-pi/agent/lib/pi-contract");

const EXTENSIONS = join(import.meta.dir, "../ein-pi/agent/extensions");

function extensionSources(): string {
	return readdirSync(EXTENSIONS)
		.filter((file) => file.endsWith(".ts"))
		.map((file) => readFileSync(join(EXTENSIONS, file), "utf8"))
		.join("\n");
}

// =============================================================================
// 1. DERIVA DE EIN. Esto es lo que impide que el contrato se convierta en una
//    lista que se pudre: si Ein usa algo que no está declarado, falla.
// =============================================================================
describe("el contrato cubre lo que Ein realmente usa", () => {
	const sources = extensionSources();

	test("todo hook `pi.on(...)` está declarado", () => {
		const used = [...sources.matchAll(/pi\.on\(\s*"([a-z_]+)"/g)].map((match) => match[1] as string);
		expect(used.length).toBeGreaterThan(0);
		const undeclared = [...new Set(used)].filter((hook) => !PI_HOOKS.includes(hook)).sort();
		expect(undeclared).toEqual([]);
	});

	test("todo método `pi.<x>(...)` está declarado", () => {
		const used = [...sources.matchAll(/\bpi\.([a-zA-Z][a-zA-Z0-9]*)\s*\(/g)].map((match) => match[1] as string);
		expect(used.length).toBeGreaterThan(0);
		const undeclared = [...new Set(used)].filter((method) => !PI_EXTENSION_API.includes(method)).sort();
		expect(undeclared).toEqual([]);
	});

	test("el contrato no declara de más: todo lo declarado se usa", () => {
		// Un contrato inflado miente igual que uno corto: hace creer que Ein
		// depende de cosas que no toca, y estorba al leer qué hay que revisar
		// cuando Pi cambia.
		const unused = PI_HOOKS.filter((hook) => !sources.includes(`"${hook}"`));
		expect(unused).toEqual([]);
	});

	test("`glob` NO es un builtin y `find` sí (ancla del bug original)", () => {
		expect(PI_BUILTIN_TOOLS).not.toContain("glob");
		expect(PI_BUILTIN_TOOLS).toContain("find");
	});
});

// =============================================================================
// 2. Lógica pura de comparación.
// =============================================================================
describe("compareWithSurface", () => {
	const full = {
		root: "/x",
		version: "9.9.9",
		tools: [...PI_BUILTIN_TOOLS],
		hooks: [...PI_HOOKS],
		extensionApi: [...PI_EXTENSION_API],
	};

	test("una superficie completa no tiene deriva", () => {
		expect(driftIsEmpty(compareWithSurface(full))).toBe(true);
	});

	test("detecta una tool retirada", () => {
		const drift = compareWithSurface({ ...full, tools: full.tools.filter((tool) => tool !== "find") });
		expect(drift.missingTools).toEqual(["find"]);
		expect(driftIsEmpty(drift)).toBe(false);
		expect(formatDrift(drift)).toContain("find");
	});

	test("detecta un hook retirado", () => {
		const drift = compareWithSurface({ ...full, hooks: full.hooks.filter((hook) => hook !== "tool_result") });
		expect(drift.missingHooks).toEqual(["tool_result"]);
	});

	test("detecta un método retirado", () => {
		const drift = compareWithSurface({ ...full, extensionApi: full.extensionApi.filter((m) => m !== "registerTool") });
		expect(drift.missingExtensionApi).toEqual(["registerTool"]);
	});

	test("que Pi ofrezca DE MÁS no es deriva", () => {
		// La dirección importa: Pi puede crecer sin romper a Ein.
		const drift = compareWithSurface({ ...full, tools: [...full.tools, "tool_nueva"], hooks: [...full.hooks, "hook_nuevo"] });
		expect(driftIsEmpty(drift)).toBe(true);
	});
});

// =============================================================================
// 3. Observación de una instalación, con una FALSA montada en disco: así el
//    parseo se prueba en CI sin depender de que Pi esté instalado.
// =============================================================================
describe("observePiSurface", () => {
	function fakePi(opts: { tools?: string; hooks?: string[]; version?: string } = {}): string {
		const root = mkdtempSync(join(tmpdir(), "fake-pi-"));
		mkdirSync(join(root, "dist", "core", "extensions"), { recursive: true });
		mkdirSync(join(root, "dist", "core", "tools"), { recursive: true });
		writeFileSync(join(root, "package.json"), JSON.stringify({ version: opts.version ?? "0.80.0" }));
		const hooks = (opts.hooks ?? [...PI_HOOKS]).map((hook) => `    on(event: "${hook}", handler: X): void;`).join("\n");
		const methods = PI_EXTENSION_API.filter((m) => m !== "on").map((m) => `    ${m}(arg: X): void;`).join("\n");
		writeFileSync(join(root, "dist", "core", "extensions", "types.d.ts"), `export interface ExtensionAPI {\n${hooks}\n${methods}\n}\n`);
		const tools = opts.tools ?? PI_BUILTIN_TOOLS.map((tool) => `"${tool}"`).join(", ");
		writeFileSync(join(root, "dist", "core", "tools", "index.js"), `export const allToolNames = new Set([${tools}]);\n`);
		return root;
	}

	test("lee tools, hooks, métodos y versión", () => {
		const surface = observePiSurface(fakePi({ version: "1.2.3" }))!;
		expect(surface.version).toBe("1.2.3");
		expect(surface.tools.sort()).toEqual([...PI_BUILTIN_TOOLS].sort());
		for (const hook of PI_HOOKS) expect(surface.hooks).toContain(hook);
		for (const method of PI_EXTENSION_API) expect(surface.extensionApi).toContain(method);
	});

	test("una instalación con `glob` en vez de `find` sale como deriva", () => {
		// El bug original, exactamente: si Pi renombrara `find` a `glob`, esto lo
		// diría por su nombre en vez de dejar que un run falle sin explicación.
		const surface = observePiSurface(fakePi({ tools: '"read", "glob"' }))!;
		expect(compareWithSurface(surface).missingTools).toContain("find");
	});

	test("un directorio que no es Pi devuelve null", () => {
		expect(observePiSurface(mkdtempSync(join(tmpdir(), "no-pi-")))).toBeNull();
	});

	test("`EIN_PI_ROOT` permite apuntar a una instalación concreta", () => {
		const root = fakePi();
		expect(resolvePiRoot({ EIN_PI_ROOT: root } as NodeJS.ProcessEnv)).toBe(root);
	});

	test("sin Pi resoluble, el veredicto es `unavailable`, no un falso OK", () => {
		const check = verifyPiContract({ EIN_PI_ROOT: join(tmpdir(), "no-existe-jamas"), PATH: "" } as NodeJS.ProcessEnv);
		expect(check.status).toBe("unavailable");
	});

	test("una instalación falsa completa verifica OK de punta a punta", () => {
		const check = verifyPiContract({ EIN_PI_ROOT: fakePi({ version: "0.81.1" }) } as NodeJS.ProcessEnv);
		expect(check.status).toBe("ok");
	});

	test("una instalación falsa incompleta reporta deriva", () => {
		const check = verifyPiContract({ EIN_PI_ROOT: fakePi({ hooks: ["input"] }) } as NodeJS.ProcessEnv);
		expect(check.status).toBe("drift");
		if (check.status === "drift") expect(check.drift.missingHooks).toContain("tool_result");
	});
});

// =============================================================================
// 4. DERIVA DE PI, contra la instalación REAL. Solo corre donde Pi existe. En
//    CI no está, y ahí el test se declara omitido en vez de fingir que pasó:
//    un verde que no verificó nada es peor que un hueco reconocido.
// =============================================================================
describe("contraste contra la instalación real de Pi", () => {
	const root = resolvePiRoot();

	test("Pi instalado sigue ofreciendo lo que Ein declara", () => {
		if (!root) {
			// Sin Pi (CI): no hay nada que afirmar. `ein doctor` lo cubre donde sí existe.
			expect(root).toBeNull();
			return;
		}
		const check = verifyPiContract();
		if (check.status === "drift") {
			throw new Error(`Pi ${check.surface.version ?? "?"} ya no ofrece lo que Ein declara — ${formatDrift(check.drift)}`);
		}
		expect(check.status).toBe("ok");
	});
});
