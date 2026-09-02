import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseConfigRules, readConfigRules } from "../ein-pi/agent/lib/openspec-config-rules.ts";
import {
	parseConfigRules as parseSharedConfigRules,
	readConfigRules as readSharedConfigRules,
} from "../shared/sdd/openspec-config-rules.ts";
import { lintDesignArtifact } from "../ein-pi/agent/lib/sdd-guardrails.ts";

// La forma EXACTA que escribe openspec-config-bootstrap.
const BOOTSTRAP_CONFIG = `strict_tdd: true
context: |
  Verdad de base del proyecto: ver EIN.md.
rules:
  design:
    require_problem_statement: true
    require_acceptance_criteria: true
  apply:
    test_command: "bun test"
  verify:
    test_command: ""  # vacío: el sdd-scope lo rellena leyendo el proyecto
testing:
  detected: "2026-08-17"
`;

let cwd: string;

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "ein-config-rules-"));
	mkdirSync(join(cwd, "openspec"), { recursive: true });
});

afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

describe("rules de config.yaml", () => {
	test("Pi y shared reciben el mismo parser y lector", () => {
		expect(parseConfigRules).toBe(parseSharedConfigRules);
		expect(readConfigRules).toBe(readSharedConfigRules);
	});
	test("lee la forma que escribe el bootstrap, comentario incluido", () => {
		const rules = parseConfigRules(BOOTSTRAP_CONFIG);
		expect(rules.design?.requireProblemStatement).toBe(true);
		expect(rules.design?.requireAcceptanceCriteria).toBe(true);
		expect(rules.apply?.testCommand).toBe("bun test");
		// El marcador `""  # vacío: …` es ausencia, no un comando llamado "#".
		expect(rules.verify?.testCommand).toBeUndefined();
	});

	test("para en el final del bloque y no se lleva lo que viene después", () => {
		const rules = parseConfigRules(BOOTSTRAP_CONFIG);
		expect(Object.keys(rules).sort()).toEqual(["apply", "design", "verify"]);
	});

	// FAIL CLOSED: lo que el lector no reconoce sale ausente, y ausente significa
	// comportamiento estricto por defecto. Nunca un valor inventado.
	test("una config ausente, vacía o rara no produce reglas", () => {
		expect(readConfigRules(cwd)).toEqual({});
		expect(parseConfigRules("")).toEqual({});
		expect(parseConfigRules("strict_tdd: true\n")).toEqual({});
		expect(parseConfigRules("rules:\n  design:\n    require_problem_statement: quizás\n").design)
			.toEqual({});
	});

	test("lee desde disco", () => {
		writeFileSync(join(cwd, "openspec", "config.yaml"), BOOTSTRAP_CONFIG);
		expect(readConfigRules(cwd).apply?.testCommand).toBe("bun test");
	});
});

describe("las reglas solo relajan, nunca aprietan", () => {
	const EMPTY_DESIGN = "# design\n\nsin secciones canónicas.\n";

	test("sin declaración, el default estricto avisa de las dos secciones", () => {
		const codes = lintDesignArtifact(EMPTY_DESIGN).issues.map((i) => i.code);
		expect(codes).toContain("missing-proposal");
		expect(codes).toContain("missing-spec");
	});

	test("un `false` explícito apaga ese aviso y solo ese", () => {
		const codes = lintDesignArtifact(EMPTY_DESIGN, {
			designRules: { requireProblemStatement: false },
		}).issues.map((i) => i.code);
		expect(codes).not.toContain("missing-proposal");
		expect(codes).toContain("missing-spec");
	});

	test("un `true` explícito no añade nada: el default ya era estricto", () => {
		const strict = lintDesignArtifact(EMPTY_DESIGN).issues.map((i) => i.code).sort();
		const declared = lintDesignArtifact(EMPTY_DESIGN, {
			designRules: { requireProblemStatement: true, requireAcceptanceCriteria: true },
		}).issues.map((i) => i.code).sort();
		expect(declared).toEqual(strict);
	});
});
