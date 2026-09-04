// =============================================================================
// TESTS: installer deps — pi (agente subyacente)
// Fija el contrato: toda referencia al comando de instalación de pi nombra el
// paquete con scope. El `pi` pelado en npm es una librería matemática ajena
// cuyo bin pisa al agente y rompe `pi`; una pista truncada es un footgun.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	checkDeps,
	inspectNodeRuntime,
	inspectPiRuntime,
	installDeclaredPackages,
	installPi,
	isCompatibleNodeVersion,
	resolveLatestPiVersion,
} from "../installer/src/core/deps";
import { detectPlatform } from "../installer/src/core/platform";
import { resolvePiInstallContext } from "../installer/src/core/paths";
import { PI_HOST_SPEC, PI_NODE_MIN_VERSION, PI_RUNTIME_DIST_TAG, REQUIRED_PI_PACKAGE_SPECS } from "../shared/contracts/runtime-compat.ts";

const DEPS_SOURCE = readFileSync(join(import.meta.dir, "..", "installer", "src", "core", "deps.ts"), "utf8");
const SCOPED = "@earendil-works/pi-coding-agent";
const COHERENT_HOST_TREE = { inspectHostTree: () => ({ coherent: true } as const) };

describe("deps — pi siempre con scope", () => {
	const deps = checkDeps(detectPlatform());
	const pi = deps.find((d) => d.id === "pi");

	test("el hint de pi usa el paquete con scope, no el `pi` pelado", () => {
		expect(pi?.hint).toContain(SCOPED);
	});

	test("ninguna cadena de deps.ts sugiere `install -g pi` sin scope", () => {
		expect(DEPS_SOURCE).not.toContain("install -g pi");
		expect(pi?.hint).toContain(PI_HOST_SPEC);
	});

	test("Node aparece como prerrequisito obligatorio y no como instalación administrada", () => {
		const node = deps.find((dependency) => dependency.id === "node");
		expect(node?.required).toBe(true);
		expect(node?.hint).toContain(PI_NODE_MIN_VERSION);
		expect(DEPS_SOURCE).not.toContain("installManagedNode");
	});

	test("acepta cualquier versión publicada y rechaza una salida que no sea SemVer", () => {
		const treeDeps = { resolveRoot: () => "/fake/root/node_modules", readManifestFile: () => null };
		expect(inspectPiRuntime([], {
			lookPath: () => "/fake/pi",
			readVersion: () => "0.1.0",
			...treeDeps,
		})).toMatchObject({ path: "/fake/pi", version: "0.1.0", compatible: true });
		expect(inspectPiRuntime([], {
			lookPath: () => "/fake/pi",
			readVersion: () => "latest",
			...treeDeps,
		})).toMatchObject({ path: "/fake/pi", version: "latest", compatible: false });
	});

	test("el árbol del host se declara fallo cuando el manifiesto no se puede leer (fail closed)", () => {
		const result = inspectPiRuntime([], {
			lookPath: () => "/fake/pi",
			readVersion: () => "0.85.0",
			resolveRoot: () => "/fake/root/node_modules",
			readManifestFile: () => null,
		});
		expect(result.tree.coherent).toBe(false);
	});

	test("installPi resuelve latest en el destino administrado y verifica el binario canónico", async () => {
		const home = "/fake/home";
		const canonicalPi = join(home, ".bun", "bin", "pi");
		const calls: Array<{
			command: string;
			args: string[];
			env: Record<string, string> | undefined;
		}> = [];
		const inspected: string[] = [];
		const result = await installPi({
			home,
			runtimeEnv: {},
			...COHERENT_HOST_TREE,
			inspectNode: () => ({ path: "/fake/node", version: `v${PI_NODE_MIN_VERSION}`, compatible: true }),
			lookPath: (command) => command === "bun" ? "/fake/bun" : null,
			readPiVersion: (path) => {
				inspected.push(path);
				return "9.8.7";
			},
			resolveLatestVersion: async () => ({ ok: true, version: "9.8.7" }),
			run: async (command, args, options) => {
				calls.push({ command, args: args ?? [], env: options?.env });
				return { ok: true, code: 0, stdout: "", stderr: "" };
			},
		});
		expect(calls).toEqual([{
			command: "/fake/bun",
			args: ["install", "-g", PI_HOST_SPEC],
			env: {
				BUN_INSTALL_GLOBAL_DIR: join(home, ".bun", "install", "global"),
				BUN_INSTALL_BIN: join(home, ".bun", "bin"),
			},
		}]);
		expect(inspected).toEqual([canonicalPi]);
		expect(PI_HOST_SPEC.endsWith(`@${PI_RUNTIME_DIST_TAG}`)).toBe(true);
		expect(result).toEqual({ ok: true, detail: `pi 9.8.7 instalado desde ${PI_HOST_SPEC}` });
	});

	test("installPi repara los paquetes internos que el host recién instalado deja fuera de rango", async () => {
		const home = "/fake/home";
		const calls: string[][] = [];
		let inspections = 0;
		const result = await installPi({
			home,
			runtimeEnv: {},
			inspectNode: () => ({ path: "/fake/node", version: `v${PI_NODE_MIN_VERSION}`, compatible: true }),
			lookPath: (command) => command === "bun" ? "/fake/bun" : null,
			readPiVersion: () => "9.8.7",
			resolveLatestVersion: async () => ({ ok: true, version: "9.8.7" }),
			inspectHostTree: () => inspections++ === 0
				? {
					coherent: false,
					failures: [
						{
							package: "@earendil-works/pi-agent-core",
							reason: "versión instalada fuera del rango declarado",
							requiredRange: "^0.85.0",
							installedVersion: "0.78.0",
							repairCommand: "bun install -g @earendil-works/pi-agent-core@latest",
						},
						{
							package: "@earendil-works/pi-ai",
							reason: "versión instalada fuera del rango declarado",
							requiredRange: "^0.85.0",
							installedVersion: "0.78.0",
							repairCommand: "bun install -g @earendil-works/pi-ai@latest",
						},
					],
				}
				: { coherent: true },
			run: async (_command, args) => {
				calls.push(args ?? []);
				return { ok: true, code: 0, stdout: "", stderr: "" };
			},
		});

		expect(calls).toEqual([
			["install", "-g", PI_HOST_SPEC],
			[
				"install",
				"-g",
				"@earendil-works/pi-agent-core@latest",
				"@earendil-works/pi-ai@latest",
			],
		]);
		expect(inspections).toBe(2);
		expect(result).toEqual({
			ok: true,
			detail: `pi 9.8.7 instalado desde ${PI_HOST_SPEC}; árbol interno reconciliado`,
		});
	});

	test("installPi nunca declara éxito si la reparación termina pero el árbol sigue incoherente", async () => {
		const failure = {
			package: "@earendil-works/pi-agent-core",
			reason: "versión instalada fuera del rango declarado",
			requiredRange: "^0.85.0",
			installedVersion: "0.78.0",
			repairCommand: "bun install -g @earendil-works/pi-agent-core@latest",
		};
		const calls: string[][] = [];
		const result = await installPi({
			home: "/fake/home",
			runtimeEnv: {},
			inspectNode: () => ({ path: "/fake/node", version: `v${PI_NODE_MIN_VERSION}`, compatible: true }),
			lookPath: (command) => command === "bun" ? "/fake/bun" : null,
			readPiVersion: () => "9.8.7",
			resolveLatestVersion: async () => ({ ok: true, version: "9.8.7" }),
			inspectHostTree: () => ({ coherent: false, failures: [failure] }),
			run: async (_command, args) => {
				calls.push(args ?? []);
				return { ok: true, code: 0, stdout: "", stderr: "" };
			},
		});

		expect(calls).toHaveLength(2);
		expect(result.ok).toBe(false);
		expect(result.detail).toContain("sigue incoherente");
		expect(result.detail).toContain("@earendil-works/pi-agent-core");
		expect(result.detail).not.toContain("instalado desde");
	});

	test("reconcilia una copia Bun redirigida existente sin crear otra por accidente", async () => {
		const home = mkdtempSync(join(tmpdir(), "ein-pi-redirected-"));
		try {
			const redirectedBin = join(home, ".omarchy", "bun", "bin");
			const redirectedGlobal = join(home, ".omarchy", "bun", "global");
			const redirectedPi = join(redirectedBin, "pi");
			mkdirSync(join(redirectedGlobal, "node_modules", "@earendil-works", "pi-coding-agent"), { recursive: true });
			mkdirSync(redirectedBin, { recursive: true });
			writeFileSync(redirectedPi, "fixture");
			writeFileSync(
				join(redirectedGlobal, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"),
				JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "0.1.0" }),
			);

			const calls: Array<Record<string, string> | undefined> = [];
			const inspected: string[] = [];
			const result = await installPi({
				home,
				runtimeEnv: {
					BUN_INSTALL_BIN: redirectedBin,
					BUN_INSTALL_GLOBAL_DIR: redirectedGlobal,
				},
				...COHERENT_HOST_TREE,
				inspectNode: () => ({ path: "/fake/node", version: `v${PI_NODE_MIN_VERSION}`, compatible: true }),
				lookPath: (command) => command === "bun" ? "/fake/bun" : null,
				readPiVersion: (path) => {
					inspected.push(path);
					return "9.8.7";
				},
				resolveLatestVersion: async () => ({ ok: true, version: "9.8.7" }),
				run: async (_command, _args, options) => {
					calls.push(options?.env);
					return { ok: true, code: 0, stdout: "", stderr: "" };
				},
			});

			expect(calls).toEqual([
				{
					BUN_INSTALL_GLOBAL_DIR: join(home, ".bun", "install", "global"),
					BUN_INSTALL_BIN: join(home, ".bun", "bin"),
				},
				{
					BUN_INSTALL_GLOBAL_DIR: redirectedGlobal,
					BUN_INSTALL_BIN: redirectedBin,
				},
			]);
			expect(inspected).toEqual([join(home, ".bun", "bin", "pi"), redirectedPi]);
			expect(result).toEqual({
				ok: true,
				detail: `pi 9.8.7 instalado desde ${PI_HOST_SPEC}; copia Bun heredada reconciliada`,
			});
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("repara también el árbol interno de una copia Bun heredada", async () => {
		const home = mkdtempSync(join(tmpdir(), "ein-pi-redirected-tree-"));
		try {
			const redirectedBin = join(home, ".omarchy", "bun", "bin");
			const redirectedGlobal = join(home, ".omarchy", "bun", "global");
			const redirectedPi = join(redirectedBin, "pi");
			mkdirSync(join(redirectedGlobal, "node_modules", "@earendil-works", "pi-coding-agent"), { recursive: true });
			mkdirSync(redirectedBin, { recursive: true });
			writeFileSync(redirectedPi, "fixture");
			writeFileSync(
				join(redirectedGlobal, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"),
				JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "0.1.0" }),
			);

			const canonicalRoot = join(home, ".bun", "install", "global", "node_modules");
			const redirectedRoot = join(redirectedGlobal, "node_modules");
			let redirectedInspections = 0;
			const calls: Array<{ args: string[]; globalDir: string | undefined }> = [];
			const result = await installPi({
				home,
				runtimeEnv: {
					BUN_INSTALL_BIN: redirectedBin,
					BUN_INSTALL_GLOBAL_DIR: redirectedGlobal,
				},
				inspectNode: () => ({ path: "/fake/node", version: `v${PI_NODE_MIN_VERSION}`, compatible: true }),
				lookPath: (command) => command === "bun" ? "/fake/bun" : null,
				readPiVersion: () => "9.8.7",
				resolveLatestVersion: async () => ({ ok: true, version: "9.8.7" }),
				inspectHostTree: (root) => {
					if (root === canonicalRoot) return { coherent: true };
					expect(root).toBe(redirectedRoot);
					redirectedInspections += 1;
					return redirectedInspections === 1
						? {
							coherent: false,
							failures: [{
								package: "@earendil-works/pi-agent-core",
								reason: "versión instalada fuera del rango declarado",
								requiredRange: "^0.85.0",
								installedVersion: "0.78.0",
								repairCommand: "bun install -g @earendil-works/pi-agent-core@latest",
							}],
						}
						: { coherent: true };
				},
				run: async (_command, args, options) => {
					calls.push({ args: args ?? [], globalDir: options?.env?.BUN_INSTALL_GLOBAL_DIR });
					return { ok: true, code: 0, stdout: "", stderr: "" };
				},
			});

			expect(calls).toEqual([
				{ args: ["install", "-g", PI_HOST_SPEC], globalDir: join(home, ".bun", "install", "global") },
				{ args: ["install", "-g", PI_HOST_SPEC], globalDir: redirectedGlobal },
				{ args: ["install", "-g", "@earendil-works/pi-agent-core@latest"], globalDir: redirectedGlobal },
			]);
			expect(redirectedInspections).toBe(2);
			expect(result).toEqual({
				ok: true,
				detail: `pi 9.8.7 instalado desde ${PI_HOST_SPEC}; árbol interno reconciliado; copia Bun heredada reconciliada`,
			});
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("installPi falla sin mentir si bun no deja una versión publicada en la ruta canónica", async () => {
		const home = "/fake/home";
		const result = await installPi({
			home,
			runtimeEnv: {},
			inspectNode: () => ({ path: "/fake/node", version: `v${PI_NODE_MIN_VERSION}`, compatible: true }),
			lookPath: (command) => command === "bun" ? "/fake/bun" : null,
			readPiVersion: () => "not-a-version",
			resolveLatestVersion: async () => ({ ok: true, version: "9.8.7" }),
			run: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
		});

		expect(result.ok).toBe(false);
		expect(result.detail).toContain("not-a-version");
		expect(result.detail).toContain(PI_HOST_SPEC);
		expect(result.detail).toContain(join(home, ".bun", "bin", "pi"));
		expect(result.detail).not.toContain("instalado");
	});

	test("resuelve el dist-tag latest desde evidencia npm fresca y validada", async () => {
		const requests: string[] = [];
		const result = await resolveLatestPiVersion(async (input) => {
			requests.push(String(input));
			return new Response(JSON.stringify({ version: "9.8.7" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		});

		expect(result).toEqual({ ok: true, version: "9.8.7" });
		expect(requests).toHaveLength(1);
		expect(requests[0]).toContain("registry.npmjs.org");
		expect(requests[0]).toContain("pi-coding-agent");
	});

	test("la evidencia latest no disponible o malformada falla sin inventar frescura", async () => {
		expect(await resolveLatestPiVersion(async () => new Response("down", { status: 503 }))).toMatchObject({
			ok: false,
			detail: expect.stringContaining("503"),
		});
		expect(await resolveLatestPiVersion(async () => new Response(JSON.stringify({ version: "latest" }), { status: 200 }))).toMatchObject({
			ok: false,
			detail: expect.stringContaining("malformada"),
		});
		expect(await resolveLatestPiVersion(async () => { throw new Error("offline"); })).toMatchObject({
			ok: false,
			detail: expect.stringContaining("no disponible"),
		});
	});

	test("installPi rechaza una versión publicada válida que no coincide con latest", async () => {
		const home = "/fake/home";
		const result = await installPi({
			home,
			runtimeEnv: {},
			inspectNode: () => ({ path: "/fake/node", version: `v${PI_NODE_MIN_VERSION}`, compatible: true }),
			lookPath: (command) => command === "bun" ? "/fake/bun" : null,
			readPiVersion: () => "9.8.6",
			resolveLatestVersion: async () => ({ ok: true, version: "9.8.7" }),
			run: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
		});

		expect(result).toEqual({
			ok: false,
			detail: `pi latest no alcanzado en ${join(home, ".bun", "bin", "pi")}: esperada 9.8.7; observada 9.8.6`,
		});
	});

	test("installPi no afirma latest cuando la evidencia remota no está disponible", async () => {
		const result = await installPi({
			home: "/fake/home",
			runtimeEnv: {},
			inspectNode: () => ({ path: "/fake/node", version: `v${PI_NODE_MIN_VERSION}`, compatible: true }),
			lookPath: (command) => command === "bun" ? "/fake/bun" : null,
			readPiVersion: () => "9.8.7",
			resolveLatestVersion: async () => ({ ok: false, detail: "registro npm no disponible" }),
			run: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
		});

		expect(result).toEqual({ ok: false, detail: "pi latest no verificable: registro npm no disponible" });
	});

	test("Pi exige Node 22.19+ y explica cómo corregir un runtime ausente", async () => {
		expect(isCompatibleNodeVersion("v22.18.0")).toBe(false);
		expect(isCompatibleNodeVersion(`v${PI_NODE_MIN_VERSION}`)).toBe(true);
		expect(isCompatibleNodeVersion("v23.0.0")).toBe(true);
		expect(isCompatibleNodeVersion("roto")).toBe(false);
		expect(inspectNodeRuntime([], {
			lookPath: () => "/fake/node",
			readVersion: () => `v${PI_NODE_MIN_VERSION}`,
		})).toEqual({ path: "/fake/node", version: `v${PI_NODE_MIN_VERSION}`, compatible: true });

		const missing = await installPi({
			inspectNode: () => ({ path: null, version: null, compatible: false }),
			lookPath: () => "/fake/bun",
		});
		expect(missing.ok).toBe(false);
		expect(missing.detail).toContain("Node no está instalado");
		expect(missing.detail).toContain(PI_NODE_MIN_VERSION);
		expect(missing.detail).toContain("actualízalo y repite");
	});

	test("los paquetes se instalan en el runtime aislado desde sus specs latest", async () => {
		const home = mkdtempSync(join(tmpdir(), "ein-pi-packages-"));
		try {
			const context = resolvePiInstallContext(home);
			mkdirSync(context.agentDir, { recursive: true });
			writeFileSync(join(context.agentDir, "settings.json"), JSON.stringify({ packages: REQUIRED_PI_PACKAGE_SPECS }));
			const calls: Array<{ args: string[]; env: Record<string, string> | undefined }> = [];
			const result = await installDeclaredPackages(context, {
				lookPath: () => "/fake/pi",
				run: async (_command, args, options) => {
					calls.push({ args: args ?? [], env: options?.env });
					return { ok: true, code: 0, stdout: "", stderr: "" };
				},
			});
			expect(result.ok).toBe(true);
			expect(calls.map(({ args }) => args)).toEqual(REQUIRED_PI_PACKAGE_SPECS.map((spec) => ["install", spec]));
			expect(calls.every(({ env }) =>
				env?.PI_CODING_AGENT_DIR === context.agentDir && env.EIN_PI_AGENT_HOME === context.agentDir
			)).toBe(true);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("un fallo de paquetes conserva la primera causa útil", async () => {
		const home = mkdtempSync(join(tmpdir(), "ein-pi-package-failure-"));
		try {
			const context = resolvePiInstallContext(home);
			mkdirSync(context.agentDir, { recursive: true });
			writeFileSync(join(context.agentDir, "settings.json"), JSON.stringify({
				packages: REQUIRED_PI_PACKAGE_SPECS.slice(0, 2),
			}));
			const result = await installDeclaredPackages(context, {
				lookPath: () => "/fake/pi",
				run: async () => ({
					ok: false,
					code: -1,
					stdout: "",
					stderr: "Failed to spawn npm: ENOENT",
				}),
			});

			expect(result).toEqual({
				ok: false,
				detail: `2/2 fallaron; primera causa: Failed to spawn npm: ENOENT (${REQUIRED_PI_PACKAGE_SPECS[0]}); +1`,
			});
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});
