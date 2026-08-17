import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	DEFAULT_LANE,
	LANE_PHASES,
	laneSkips,
	normalizeLane,
	readChangeLane,
	writeChangeLane,
} from "../ein-pi/agent/lib/sdd-lane.ts";
import { resolveSddStatus } from "../ein-pi/agent/lib/sdd-router.ts";
import { lintChange } from "../ein-pi/agent/lib/sdd-guardrails.ts";
import { runLaneCommand } from "../cc-ein/sdd-cli/cli.ts";

// =============================================================================
// Medido sobre los 44 cambios archivados: 42 usaron las siete fases. La
// ceremonia se paga siempre, también en un cambio de una línea.
// `micro` son CINCO fases y no tres porque `scope.md` guarda la declaración de
// delta de spec —sin ella el cierre se bloquea— y cerrar sigue siendo puerta
// dura. Lo que se ahorra, `map` y `tasks`, son las dos fases que LEEN CÓDIGO.
// =============================================================================

const SCOPE = `# scope

## Spec delta declaration
spec_delta: none
spec_delta_reason: cambio mecanico de configuracion sin delta de comportamiento
`;

let cwd: string;
let changeDir: string;

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "ein-lane-"));
	changeDir = join(cwd, "openspec", "changes", "probe");
	mkdirSync(changeDir, { recursive: true });
	execFileSync("git", ["init", "-q"], { cwd, stdio: "ignore" });
	writeFileSync(join(changeDir, "scope.md"), SCOPE);
});

afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

describe("carril del cambio", () => {
	test("sin declaración se conduce con las siete fases", () => {
		expect(readChangeLane(changeDir)).toBe("standard");
		expect(DEFAULT_LANE).toBe("standard");
		expect(resolveSddStatus(cwd, "probe").nextRecommended).toBe("map");
	});

	test("`micro` salta map y tasks, y NADA más", () => {
		writeChangeLane(changeDir, "micro");
		expect(laneSkips("micro")).toEqual(["map", "tasks"]);
		expect(laneSkips("standard")).toEqual([]);
		// Las puertas duras siguen en la lista.
		expect(LANE_PHASES.micro).toContain("verify");
		expect(LANE_PHASES.micro).toContain("close");
		// Y `scope` se queda: guarda la declaración de delta sin la que no se cierra.
		expect(LANE_PHASES.micro[0]).toBe("scope");
	});

	test("el siguiente paso se calcula contra la lista del carril", () => {
		writeChangeLane(changeDir, "micro");
		const status = resolveSddStatus(cwd, "probe");
		expect(status.lane).toBe("micro");
		expect(status.nextRecommended).toBe("design");
	});

	// Una fase que el carril no pide no es una deuda: listarla como ausente
	// convertiría un ahorro deliberado en un hueco aparente.
	test("map y tasks no figuran como artefactos ausentes en `micro`", () => {
		writeChangeLane(changeDir, "micro");
		const status = resolveSddStatus(cwd, "probe");
		const phases = [...status.artifacts.present, ...status.artifacts.missing].map((a) => a.phase);
		expect(phases).toEqual(["scope", "design", "apply", "verify", "close"]);
	});

	// Sin esto, cada cambio `micro` saldría con un muro de errores de secuencia
	// por fases que nadie pidió.
	test("el gatekeeper no reclama las fases que el carril no ejecuta", () => {
		writeFileSync(join(changeDir, "design.md"), "# design\n\n## A. Proposal\n\n## B. Spec\n");

		const strict = lintChange(cwd, "probe").issues.map((i) => i.code);
		expect(strict).toContain("sequence-map-missing-before-design");

		writeChangeLane(changeDir, "micro");
		const relaxed = lintChange(cwd, "probe").issues.map((i) => i.code);
		expect(relaxed).not.toContain("sequence-map-missing-before-design");
		expect(relaxed).not.toContain("sequence-design-without-tasks");
	});

	// FAIL CLOSED: el error se paga en ceremonia de más, nunca en comprobación
	// de menos.
	test("una declaración rota o desconocida cae a `standard`", () => {
		for (const body of ['{"lane":"turbo"}', "{ not json", "[]", '{"lane":42}']) {
			writeFileSync(join(changeDir, "lane.json"), body);
			expect(readChangeLane(changeDir)).toBe("standard");
		}
		expect(normalizeLane("MICRO")).toBe("micro");
		expect(normalizeLane("rapido")).toBeUndefined();
	});
});

describe("el humano declara el carril", () => {
	test("sin argumento informa; con argumento declara", () => {
		expect(runLaneCommand(cwd, ["probe"]).text).toContain("standard");

		const set = runLaneCommand(cwd, ["probe", "micro"]);
		expect(set.exitCode).toBe(0);
		expect(set.text).toContain("Skips: map, tasks");
		// El comando dice explícitamente lo que NO relaja.
		expect(set.text).toContain("Verify and close stay hard gates");

		expect(readChangeLane(changeDir)).toBe("micro");
		expect(runLaneCommand(cwd, ["probe", "standard"]).text).toContain("standard");
	});

	test("un cambio inexistente falla en vez de crear estado", () => {
		const result = runLaneCommand(cwd, ["no-existe", "micro"]);
		expect(result.exitCode).toBe(1);
		expect(result.text).toContain("does not exist");
	});
});
