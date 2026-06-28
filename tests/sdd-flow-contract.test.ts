// =============================================================================
// TESTS: contrato del flujo SDD por fases (router + gatekeeper + archive)
// El orquestador debe enrutar por el router determinista, gatekeepear cada fase,
// y cerrar con archive. Los tools deterministas deben estar cableados en ein-ai.
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

	test("incluye tasks y archive en el flujo de 7", () => {
		expect(orch).toContain("init → explore → design → tasks → apply → verify → archive");
	});

	test("conserva la chain como fallback (no como ruta primaria)", () => {
		expect(orch.toLowerCase()).toContain("fallback");
		expect(orch).toContain("ein-sdd` chain");
	});
});

describe("ein-ai: tools deterministas cableados", () => {
	const ai = read("extensions/ein-ai.ts");
	test("registra ein_sdd_status y ein_sdd_check", () => {
		expect(ai).toContain('name: "ein_sdd_status"');
		expect(ai).toContain('name: "ein_sdd_check"');
	});
	test("registra los comandos sdd-status y sdd-archive", () => {
		expect(ai).toContain('"ein:sdd-status"');
		expect(ai).toContain('"ein:sdd-archive"');
	});
});

describe("sdd-archive agent existe y solo escribe summary", () => {
	const archive = read("agents/sdd-archive.md");
	test("nombre y output", () => {
		expect(archive).toContain("name: sdd-archive");
		expect(archive).toContain("summary.md");
	});
	test("no mueve ficheros (eso lo hace el parent determinista)", () => {
		expect(archive.toLowerCase()).toContain("do not move or delete files");
	});
});

describe("sdd-tasks agent existe y produce tasks.md", () => {
	const tasks = read("agents/sdd-tasks.md");
	test("nombre y contrato", () => {
		expect(tasks).toContain("name: sdd-tasks");
		expect(tasks).toContain("tasks.md");
		expect(tasks).toContain("status: ready | blocked");
	});
	test("no reexplora ni edita source code", () => {
		expect(tasks.toLowerCase()).toContain("do not re-explore");
		expect(tasks.toLowerCase()).toContain("do not write or edit source code");
	});
});
