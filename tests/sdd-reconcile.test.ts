// =============================================================================
// TESTS: lib/sdd-reconcile — el artefacto manda sobre el veredicto del runner
// =============================================================================
// BLINDAJE -> Una fase SDD entrega UN artefacto: si está escrito y sano, la
// fase está hecha aunque el runner reporte ✗ (tool ausente en la allowlist,
// respuesta final vacía, timeout en la lectura final). Sin esto el orquestador
// repetía una fase completa y pagaba dos veces.
//
// La mitad importante de este fichero son los casos en los que NO debe
// reconciliar: reconciliar de más es enmascarar un fallo real, que es peor que
// el bug original.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
	formatReconciliation,
	phaseForAgent,
	reconcilePhaseFailure,
	resolveDelegationPhase,
	snapshotPhaseArtifacts,
} = await import("../ein-pi/agent/lib/sdd-reconcile");

// Artefactos mínimos que PASAN el lint de su fase (ver PHASE_REQUIRED).
const VALID: Record<string, string> = {
	"scope.md": "# Scope\n\nscope: acotado a la CI\nbudget_allocated: 15000\n",
	"map.md": "# Map\n\nledger: 3 ficheros\nbudget_consumed: 2000\nscope_status: ok\n",
	"verify-report.md": "# Verify\n\nstatus: pass\nbehavior_coverage: verified\n",
	"apply-progress.md": "# Apply\n\nstatus: complete\n",
};

function project(): string {
	const dir = mkdtempSync(join(tmpdir(), "ein-reconcile-"));
	mkdirSync(join(dir, "openspec", "changes"), { recursive: true });
	return dir;
}

function changeDir(cwd: string, change: string): string {
	const dir = join(cwd, "openspec", "changes", change);
	mkdirSync(dir, { recursive: true });
	return dir;
}

// Escribe un artefacto con mtime explícito: los tests no pueden depender de la
// resolución del reloj del FS para distinguir "antes" de "después".
function writeArtifact(dir: string, file: string, mtimeSeconds: number, body?: string) {
	const path = join(dir, file);
	writeFileSync(path, body ?? VALID[file] ?? "# vacio\n");
	utimesSync(path, mtimeSeconds, mtimeSeconds);
	return path;
}

describe("phaseForAgent", () => {
	test("mapea los agentes de fase canónicos", () => {
		expect(phaseForAgent("sdd-scope")).toBe("scope");
		expect(phaseForAgent("sdd-map")).toBe("map");
		expect(phaseForAgent("sdd-close")).toBe("close");
	});

	test("cualquier otro agente NO es una fase (nunca se reconcilia)", () => {
		expect(phaseForAgent("ein-git")).toBeNull();
		expect(phaseForAgent("ein-scout")).toBeNull();
		expect(phaseForAgent("sdd-inventado")).toBeNull();
		expect(phaseForAgent("")).toBeNull();
		expect(phaseForAgent(undefined)).toBeNull();
		expect(phaseForAgent(42)).toBeNull();
	});
});

describe("reconcilePhaseFailure — reconcilia cuando el trabajo SÍ está", () => {
	test("artefacto nuevo y sano tras un ✗ → fase completa", () => {
		const cwd = project();
		const before = snapshotPhaseArtifacts(cwd, "map");
		// El run crea el cambio y escribe su artefacto.
		writeArtifact(changeDir(cwd, "mi-cambio"), "map.md", 2000);

		const result = reconcilePhaseFailure(cwd, "map", before);
		expect(result.reconciled).toBe(true);
		expect(result.change).toBe("mi-cambio");
		expect(result.warnings).toEqual([]);
	});

	test("artefacto REESCRITO durante el run también cuenta", () => {
		const cwd = project();
		const dir = changeDir(cwd, "mi-cambio");
		writeArtifact(dir, "verify-report.md", 1000);
		const before = snapshotPhaseArtifacts(cwd, "verify");
		// El run lo reescribe (mtime posterior).
		writeArtifact(dir, "verify-report.md", 2000);

		expect(reconcilePhaseFailure(cwd, "verify", before).reconciled).toBe(true);
	});

	test("scope, que CREA el directorio del cambio, se reconcilia igual", () => {
		const cwd = project();
		const before = snapshotPhaseArtifacts(cwd, "scope");
		writeArtifact(changeDir(cwd, "nuevo"), "scope.md", 2000);

		const result = reconcilePhaseFailure(cwd, "scope", before);
		expect(result.reconciled).toBe(true);
		expect(result.change).toBe("nuevo");
	});

	test("los warnings del artefacto se propagan, no se ocultan", () => {
		const cwd = project();
		const before = snapshotPhaseArtifacts(cwd, "verify");
		// verify PASS sin behavior_coverage → warning, no error.
		writeArtifact(changeDir(cwd, "c"), "verify-report.md", 2000, "# Verify\n\nstatus: pass\n");

		const result = reconcilePhaseFailure(cwd, "verify", before);
		expect(result.reconciled).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});
});

// =============================================================================
// Lo que de verdad importa: NO enmascarar. Cada uno de estos casos es un fallo
// real que debe seguir siendo un fallo.
// =============================================================================
describe("reconcilePhaseFailure — NO reconcilia cuando el trabajo no está", () => {
	test("sin artefacto escrito → el fallo se respeta", () => {
		const cwd = project();
		const before = snapshotPhaseArtifacts(cwd, "map");
		const result = reconcilePhaseFailure(cwd, "map", before);
		expect(result.reconciled).toBe(false);
		expect(result.reason).toContain("no se escribió");
	});

	test("artefacto PREEXISTENTE e intacto no rescata nada", () => {
		// El caso peligroso: la fase ya se había hecho en un run anterior y este
		// run falló sin tocar nada. Sin el check de mtime, el artefacto viejo
		// haría pasar por buena una fase que este run NO hizo.
		const cwd = project();
		writeArtifact(changeDir(cwd, "c"), "map.md", 1000);
		const before = snapshotPhaseArtifacts(cwd, "map");

		const result = reconcilePhaseFailure(cwd, "map", before);
		expect(result.reconciled).toBe(false);
		expect(result.reason).toContain("no se escribió");
	});

	test("artefacto escrito pero con errores de lint → el fallo se respeta", () => {
		const cwd = project();
		const before = snapshotPhaseArtifacts(cwd, "verify");
		// verify sin la línea `status:` que el router necesita para enrutar.
		writeArtifact(changeDir(cwd, "c"), "verify-report.md", 2000, "# Verify\n\nHice cosas.\n");

		const result = reconcilePhaseFailure(cwd, "verify", before);
		expect(result.reconciled).toBe(false);
		expect(result.reason).toContain("error");
	});

	test("artefacto vacío → el fallo se respeta", () => {
		const cwd = project();
		const before = snapshotPhaseArtifacts(cwd, "map");
		writeArtifact(changeDir(cwd, "c"), "map.md", 2000, "   \n");

		expect(reconcilePhaseFailure(cwd, "map", before).reconciled).toBe(false);
	});

	test("dos cambios escribieron la misma fase → ambiguo, no se reconcilia", () => {
		const cwd = project();
		const before = snapshotPhaseArtifacts(cwd, "map");
		writeArtifact(changeDir(cwd, "uno"), "map.md", 2000);
		writeArtifact(changeDir(cwd, "dos"), "map.md", 2000);

		const result = reconcilePhaseFailure(cwd, "map", before);
		expect(result.reconciled).toBe(false);
		expect(result.reason).toContain("ambiguo");
	});
});

describe("formatReconciliation", () => {
	test("el error original viaja SIEMPRE en el reporte", () => {
		const cwd = project();
		const before = snapshotPhaseArtifacts(cwd, "map");
		writeArtifact(changeDir(cwd, "c"), "map.md", 2000);
		const result = reconcilePhaseFailure(cwd, "map", before);

		const text = formatReconciliation(result, "Agent 'sdd-map' requested unavailable child tools: glob.");
		// Reconciliar no es tragarse el fallo: el orquestador debe poder verlo.
		expect(text).toContain("unavailable child tools: glob");
		expect(text).toContain("NO la repitas");
		expect(text).toContain("map.md");
	});

    test("un error vacío no rompe el formato", () => {
		const cwd = project();
		const before = snapshotPhaseArtifacts(cwd, "map");
		writeArtifact(changeDir(cwd, "c"), "map.md", 2000);
		const result = reconcilePhaseFailure(cwd, "map", before);
		expect(formatReconciliation(result, "   ")).toContain("(sin detalle)");
	});
});

// =============================================================================
// Qué delegaciones entran en la reconciliación. Un chain/parallel con varias
// fases no dice cuál falló: ahí reconciliar sería enmascarar.
// =============================================================================
describe("resolveDelegationPhase", () => {
	test("una sola fase SDD → esa fase", () => {
		expect(resolveDelegationPhase({ agent: "sdd-map", task: "mapea" })).toBe("map");
		expect(resolveDelegationPhase({ steps: [{ agent: "sdd-verify", task: "v" }] })).toBe("verify");
	});

	test("varias fases distintas → null (ambiguo)", () => {
		expect(
			resolveDelegationPhase({
				steps: [
					{ agent: "sdd-map", task: "a" },
					{ agent: "sdd-design", task: "b" },
				],
			}),
		).toBeNull();
	});

	test("la misma fase repetida sigue siendo esa fase", () => {
		expect(
			resolveDelegationPhase({
				tasks: [
					{ agent: "sdd-apply", task: "a" },
					{ agent: "sdd-apply", task: "b" },
				],
			}),
		).toBe("apply");
	});

	test("agentes que no son de fase → null", () => {
		expect(resolveDelegationPhase({ agent: "ein-git", task: "entrega" })).toBeNull();
		expect(resolveDelegationPhase({ agent: "ein-scout", task: "investiga" })).toBeNull();
		expect(resolveDelegationPhase({})).toBeNull();
		expect(resolveDelegationPhase(undefined)).toBeNull();
	});
});
