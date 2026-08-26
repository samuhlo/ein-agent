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
import { checkDeps, inspectPiRuntime, installDeclaredPackages, installPi } from "../installer/src/core/deps";
import { detectPlatform } from "../installer/src/core/platform";
import { resolvePiInstallContext } from "../installer/src/core/paths";
import { PI_HOST_SPEC, PI_HOST_VERSION, REQUIRED_PI_PACKAGE_SPECS } from "../ein-pi/agent/lib/runtime-compat";

const DEPS_SOURCE = readFileSync(join(import.meta.dir, "..", "installer", "src", "core", "deps.ts"), "utf8");
const SCOPED = "@earendil-works/pi-coding-agent";

describe("deps — pi siempre con scope", () => {
	const pi = checkDeps(detectPlatform()).find((d) => d.id === "pi");

	test("el hint de pi usa el paquete con scope, no el `pi` pelado", () => {
		expect(pi?.hint).toContain(SCOPED);
	});

	test("ninguna cadena de deps.ts sugiere `install -g pi` sin scope", () => {
		expect(DEPS_SOURCE).not.toContain("install -g pi");
		expect(pi?.hint).toContain(PI_HOST_SPEC);
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
			lookPath: (command) => command === "bun" ? "/fake/bun" : "/fake/pi",
			run: async (command, args) => {
				calls.push({ command, args: args ?? [] });
				return { ok: true, code: 0, stdout: "", stderr: "" };
			},
		});
		expect(calls).toEqual([{ command: "/fake/bun", args: ["install", "-g", PI_HOST_SPEC] }]);
		expect(result).toEqual({ ok: true, detail: `pi ${PI_HOST_VERSION} instalado` });
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
});
