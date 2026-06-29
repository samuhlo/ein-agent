// =============================================================================
// TESTS: contrato del flujo SDD por fases (router + gatekeeper + close)
// El orquestador debe enrutar por el router determinista, gatekeepear cada fase,
// y cerrar con close. Los tools deterministas deben estar cableados en ein-ai.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const read = (p: string) => readFileSync(join(AGENT, p), "utf8");

describe("orchestrator: flujo por fases determinista", () => {
	const orch = read("assets/orchestrator.md");

	test("enruta por ein_sdd_status, no por memoria", () => {
		expect(orch).toContain("ein_sdd_status");
		expect(orch.toLowerCase()).toContain("do not trust your memory");
	});

	test("gatekeepea cada fase con ein_sdd_check", () => {
		expect(orch).toContain("ein_sdd_check");
	});

	test("incluye tasks y close en el flujo de 7", () => {
		expect(orch).toContain("scope → map → design → tasks → apply → verify → close");
	});

	test("conserva la chain como fallback (no como ruta primaria)", () => {
		expect(orch.toLowerCase()).toContain("fallback");
		expect(orch).toContain("ein-sdd` chain");
	});

	test("documenta sdd-next como ruta manual sin sustituir el router interno", () => {
		expect(orch).toContain("/ein:sdd-next <change> [--auto]");
		expect(orch).toContain("read-only slash command for humans");
		expect(orch).toContain("the orchestrator still routes with `ein_sdd_status`");
	});
});

describe("ein-ai: tools deterministas cableados", () => {
	const ai = read("extensions/ein-ai.ts");
	test("registra ein_sdd_status y ein_sdd_check", () => {
		expect(ai).toContain('name: "ein_sdd_status"');
		expect(ai).toContain('name: "ein_sdd_check"');
	});
	test("registra los comandos sdd-status, sdd-next y sdd-close", () => {
		expect(ai).toContain('"ein:sdd-status"');
		expect(ai).toContain('"ein:sdd-next"');
		expect(ai).toContain('"ein:sdd-close"');
		expect(ai).not.toContain(`"ein:sdd-${"archive"}"`);
	});
});

describe("sdd-close agent existe y solo escribe summary", () => {
	const close = read("agents/sdd-close.md");
	test("nombre y output", () => {
		expect(close).toContain("name: sdd-close");
		expect(close).toContain("summary.md");
	});
	test("no mueve ficheros (eso lo hace el parent determinista)", () => {
		expect(close.toLowerCase()).toContain("do not move or delete files");
	});
});

describe("sdd-tasks agent existe y produce tasks.md", () => {
	const tasks = read("agents/sdd-tasks.md");
	test("nombre y contrato", () => {
		expect(tasks).toContain("name: sdd-tasks");
		expect(tasks).toContain("tasks.md");
		expect(tasks).toContain("status: ready | blocked");
	});
	test("no remapea ni edita source code", () => {
		expect(tasks.toLowerCase()).toContain("do not remap");
		expect(tasks.toLowerCase()).toContain("do not write or edit source code");
	});
});
