// =============================================================================
// SMOKE TEST: entry-points CLI que la transacción de update SPAWNEA en el binario
// -----------------------------------------------------------------------------
// La transacción de `ein update` ejecuta el binario nuevo con tres flags:
//   - `--version`                → binary-probe (necesita installer Y template)
//   - `--ein-continuation=<tx>`  → confirma identidad tras el swap
//   - `--ein-deploy-template=<d>`→ extrae el template embebido
// Ninguno existía en main.ts, así que el updater fallaba etapa tras etapa. Los
// tests previos mockeaban `child.spawn`/`template.deploy` y nunca lo detectaron.
// Este corre el main.ts REAL vía `bun` — el smoke test que habría cazado los 3.
// =============================================================================

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INSTALLER_VERSION } from "../installer/src/core/version.ts";

const MAIN = join(import.meta.dir, "..", "installer", "src", "main.ts");
const SEMVER = "[0-9]+\\.[0-9]+\\.[0-9]+";
const roots: string[] = [];

afterEach(() => {
	while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function runMain(args: string[], env: Record<string, string> = {}) {
	const proc = Bun.spawnSync(["bun", MAIN, ...args], {
		env: { ...process.env, ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: proc.exitCode,
		stdout: new TextDecoder().decode(proc.stdout),
		stderr: new TextDecoder().decode(proc.stderr),
	};
}

describe("updater CLI entry points (main.ts real)", () => {
	test("--version emite installer Y template en el formato que el probe parsea", () => {
		const { code, stdout } = runMain(["--version"]);
		expect(code).toBe(0);
		// Mismos regex que binary-probe.ts: dos líneas etiquetadas con semver.
		expect(stdout).toMatch(new RegExp(`(?:^|\\n)ein-installer\\s+${SEMVER}\\s*$`, "m"));
		expect(stdout).toMatch(new RegExp(`(?:^|\\n)template-version\\s+${SEMVER}\\s*$`, "m"));
		expect(stdout).toContain(`ein-installer ${INSTALLER_VERSION}`);
	});

	test("--ein-continuation se enruta y emite un ContinuationMessage JSON (no 'comando desconocido')", () => {
		const { stdout, stderr } = runMain([
			`--ein-continuation=tx-smoke`,
			`--ein-release=installer-v${INSTALLER_VERSION}`,
		]);
		expect(stderr).not.toContain("comando desconocido");
		const msg = JSON.parse(stdout.trim()) as { txId: string; binaryVersion: string; status: string };
		expect(msg.txId).toBe("tx-smoke");
		expect(msg.binaryVersion).toBe(INSTALLER_VERSION);
		expect(["ok", "failed"]).toContain(msg.status);
	});

	test("--ein-deploy-template extrae el template en el agent dir AISLADO por defecto (HOME sandbox)", () => {
		const home = mkdtempSync(join(tmpdir(), "ein-deploy-"));
		roots.push(home);
		// Fase 2: sin marker previo, AGENT_DIR resuelve al dir aislado
		// (~/.pi-ein/agent) — las instalaciones nuevas van aisladas por defecto.
		// deployTemplate usa AGENT_DIR (el valor del flag es informativo).
		const agentDir = join(home, ".pi-ein", "agent");
		// TMPDIR bajo el propio HOME sandbox: el staging del deploy y el target
		// quedan en el mismo árbol (hermético, sin tocar /tmp real).
		const { code, stderr } = runMain([`--ein-deploy-template=${agentDir}`], { HOME: home, TMPDIR: home });
		expect(stderr).not.toContain("comando desconocido");
		expect(code).toBe(0);
		// Se desplegaron artefactos del template (agents/, AGENTS.md, ...).
		expect(readdirSync(agentDir).length).toBeGreaterThan(0);
	});
});
