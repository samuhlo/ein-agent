// =============================================================================
// TESTS: lib/linear-integration.ts — Linear como integración opcional
// Solo + OpenSpec/git es el contrato normal; Linear se enciende a propósito.
// El fichero en disco sigue llamándose mode.json: es estado del usuario y
// renombrarlo pertenece a la unidad de migración, no a esta.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	globalLinearIntegrationConfigPath,
	inspectLinearIntegration,
	linearIntegrationLabel,
	linearDirective,
	linearIntegrationConfigPath,
	readLinearIntegration,
	writeLinearIntegration,
} from "../ein-pi/agent/lib/linear-integration";

let DIR: string;
let originalEinPiAgentHome: string | undefined;
let originalPiCodingAgentDir: string | undefined;

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "ein-linear-integration-"));
	originalEinPiAgentHome = process.env.EIN_PI_AGENT_HOME;
	originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;
	delete process.env.EIN_PI_AGENT_HOME;
	delete process.env.PI_CODING_AGENT_DIR;
});
afterEach(() => {
	if (originalEinPiAgentHome === undefined) delete process.env.EIN_PI_AGENT_HOME;
	else process.env.EIN_PI_AGENT_HOME = originalEinPiAgentHome;
	if (originalPiCodingAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalPiCodingAgentDir;
	rmSync(DIR, { recursive: true, force: true });
});

function writeRaw(cwd: string, contents: string): string {
	const path = linearIntegrationConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, contents);
	return path;
}

function writeGlobal(agentDir: string, contents: string): string {
	const path = globalLinearIntegrationConfigPath(agentDir);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, contents);
	return path;
}

describe("readLinearIntegration / writeLinearIntegration", () => {
	test("shows the effective integration and its source without masking invalid evidence", () => {
		const agentDir = join(DIR, "agent");
		writeGlobal(agentDir, '{"linear":"on"}');
		expect(linearIntegrationLabel(inspectLinearIntegration(DIR, agentDir))).toBe("on · global");
		writeRaw(DIR, '{"linear":"off"}');
		expect(linearIntegrationLabel(inspectLinearIntegration(DIR, agentDir))).toBe("off · proyecto");
		writeRaw(DIR, '{broken');
		expect(linearIntegrationLabel(inspectLinearIntegration(DIR, agentDir))).toBe("desconocido · proyecto");
	});
	test("sin configuración, Linear está apagado", () => {
		expect(readLinearIntegration(DIR, join(DIR, "agent"))).toBe("off");
	});

	test("el path global usa el agentDir explícito del installer", () => {
		const agentDir = join(DIR, "isolated-agent");
		expect(globalLinearIntegrationConfigPath(agentDir)).toBe(join(agentDir, "ein-mode.json"));
		writeGlobal(agentDir, '{"linear":"on"}');
		expect(readLinearIntegration(DIR, agentDir)).toBe("on");
	});

	test("el hogar Ein aislado prevalece sobre PI_CODING_AGENT_DIR", () => {
		const einHome = join(DIR, "ein-home");
		const piHome = join(DIR, "pi-home");
		process.env.EIN_PI_AGENT_HOME = einHome;
		process.env.PI_CODING_AGENT_DIR = piHome;
		writeGlobal(einHome, '{"linear":"on"}');
		writeGlobal(piHome, '{"linear":"off"}');
		expect(globalLinearIntegrationConfigPath()).toBe(join(einHome, "ein-mode.json"));
		expect(readLinearIntegration(DIR)).toBe("on");
	});

	test("PI_CODING_AGENT_DIR se usa cuando no existe hogar Ein explícito", () => {
		const piHome = join(DIR, "pi-home");
		process.env.PI_CODING_AGENT_DIR = piHome;
		writeGlobal(piHome, '{"linear":"on"}');
		expect(globalLinearIntegrationConfigPath()).toBe(join(piHome, "ein-mode.json"));
		expect(readLinearIntegration(DIR)).toBe("on");
	});

	test("round-trip: se persiste la clave nueva y se recupera igual", () => {
		writeLinearIntegration(DIR, "on");
		expect(readLinearIntegration(DIR)).toBe("on");
		expect(JSON.parse(readFileSync(linearIntegrationConfigPath(DIR), "utf8"))).toEqual({ linear: "on" });
	});

	test("un `mode: team` heredado enciende Linear sin reescribir el fichero", () => {
		const bytes = '{\n  "mode": "team"\n}\n';
		const path = writeRaw(DIR, bytes);
		expect(readLinearIntegration(DIR)).toBe("on");
		// Leer no muta: reescribir la configuración del usuario en una consulta
		// destruiría la evidencia con la que se diagnostica una sorpresa.
		expect(readFileSync(path, "utf8")).toBe(bytes);
	});

	test("un `mode: solo` heredado deja Linear apagado", () => {
		writeRaw(DIR, '{"mode":"solo"}');
		expect(readLinearIntegration(DIR)).toBe("off");
	});

	test("con las dos claves gana la nueva: una escritura deliberada no puede quedar sin efecto", () => {
		writeRaw(DIR, '{"mode":"team","linear":"off"}');
		expect(readLinearIntegration(DIR)).toBe("off");
	});

	test("una clave linear desconocida no cae silenciosamente al mode heredado", () => {
		writeRaw(DIR, '{"linear":"quizas","mode":"team"}');
		const agentDir = join(DIR, "agent");
		expect(readLinearIntegration(DIR, agentDir)).toBe("off");
		expect(inspectLinearIntegration(DIR, agentDir).status).toBe("invalid");
	});

	test("configuración corrupta cae al valor apagado", () => {
		writeRaw(DIR, "{ no es json");
		expect(readLinearIntegration(DIR, join(DIR, "agent"))).toBe("off");
	});

	test("un valor desconocido no se confunde con encendido", () => {
		writeRaw(DIR, '{"linear":"quizas"}');
		expect(readLinearIntegration(DIR, join(DIR, "agent"))).toBe("off");
	});
});

describe("inspectLinearIntegration", () => {
	test("conserva JSON inválido explícito sin cambiar la resolución tolerante", () => {
		writeRaw(DIR, "{ no es json");
		const inspection = inspectLinearIntegration(DIR, join(DIR, "agent"));
		expect(inspection.status).toBe("invalid");
		expect(inspection.source).toBe("project");
		expect(readLinearIntegration(DIR, join(DIR, "agent"))).toBe("off");
	});

	test("conserva un valor desconocido como evidencia inválida", () => {
		writeRaw(DIR, '{"linear":"quizas"}');
		const inspection = inspectLinearIntegration(DIR, join(DIR, "agent"));
		expect(inspection.status).toBe("invalid");
		expect(inspection.reason).toBe("invalid-evidence");
	});

	test("conserva una lectura ilegible de la autoridad global", () => {
		const agentDir = join(DIR, "agent");
		mkdirSync(globalLinearIntegrationConfigPath(agentDir), { recursive: true });
		const inspection = inspectLinearIntegration(DIR, agentDir);
		expect(inspection.status).toBe("unreadable");
		expect(inspection.source).toBe("global");
		expect(readLinearIntegration(DIR, agentDir)).toBe("off");
	});

	test("registra un default conocido cuando faltan las dos autoridades", () => {
		const inspection = inspectLinearIntegration(DIR, join(DIR, "agent"));
		expect(inspection.reason).toBe("defaulted");
		expect(inspection.value).toBe("off");
		expect(inspection.observed.map((entry) => entry.source)).toEqual(["project", "global"]);
	});

	test("la evidencia heredada se lee como válida, con su procedencia", () => {
		writeRaw(DIR, '{"mode":"team"}');
		const inspection = inspectLinearIntegration(DIR);
		expect(inspection.status).toBe("valid");
		expect(inspection.value).toBe("on");
		expect(inspection.source).toBe("project");
	});
});

describe("linearDirective", () => {
	test("apagado: sin Linear, board local, sin preflight", () => {
		const d = linearDirective("off").toLowerCase();
		expect(d).toContain("no linear");
		expect(d).toContain("openspec/changes");
		expect(d).toMatch(/do not run linear preflight/);
	});

	test("encendido: Linear es la board + preflight", () => {
		const d = linearDirective("on").toLowerCase();
		expect(d).toContain("linear");
		expect(d).toContain("preflight");
	});
});
