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
} from "../installer/src/core/deps";
import { detectPlatform } from "../installer/src/core/platform";
import { resolvePiInstallContext } from "../installer/src/core/paths";
import { PI_HOST_SPEC, PI_HOST_VERSION, PI_NODE_MIN_VERSION, REQUIRED_PI_PACKAGE_SPECS } from "../ein-pi/agent/lib/runtime-compat";

const DEPS_SOURCE = readFileSync(join(import.meta.dir, "..", "installer", "src", "core", "deps.ts"), "utf8");
const SCOPED = "@earendil-works/pi-coding-agent";

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

	test("una versión distinta se considera incompatible aunque el binario exista", () => {
		expect(inspectPiRuntime([], {
			lookPath: () => "/fake/pi",
			readVersion: () => "0.1.0",
		})).toEqual({ path: "/fake/pi", version: "0.1.0", compatible: false });
		expect(inspectPiRuntime([], {
			lookPath: () => "/fake/pi",
			readVersion: () => PI_HOST_VERSION,
		})).toEqual({ path: "/fake/pi", version: PI_HOST_VERSION, compatible: true });
	});

	test("installPi entrega a bun el spec exacto, sin shell ni latest implícito", async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const result = await installPi({
			inspectNode: () => ({ path: "/fake/node", version: `v${PI_NODE_MIN_VERSION}`, compatible: true }),
			lookPath: (command) => command === "bun" ? "/fake/bun" : "/fake/pi",
			run: async (command, args) => {
				calls.push({ command, args: args ?? [] });
				return { ok: true, code: 0, stdout: "", stderr: "" };
			},
		});
		expect(calls).toEqual([{ command: "/fake/bun", args: ["install", "-g", PI_HOST_SPEC] }]);
		expect(result).toEqual({ ok: true, detail: `pi ${PI_HOST_VERSION} instalado` });
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

	test("los paquetes se instalan en el runtime aislado y con sus specs exactos", async () => {
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
