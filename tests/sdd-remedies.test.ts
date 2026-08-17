import { describe, expect, test } from "bun:test";
import {
	collectSddRemedies,
	formatSddRemedies,
	specStateRemedy,
	verifyStaleRemedy,
} from "../ein-pi/agent/lib/sdd-remedies.ts";

const CLEAN = { specState: "synchronized" as const, verifyStale: false, summaryStale: false };

describe("remedios de estado SDD", () => {
	// La razón de existir: el router ya calculaba estos estados, pero el remedio
	// vivía como prosa en el prompt del orquestador. Un bloqueo que no dice cómo
	// salir obliga a interpretar, y un ejecutor barato interpreta mal.
	test("cada estado bloqueante trae una acción concreta", () => {
		for (const state of ["pending", "unresolved", "conflict"] as const) {
			const remedy = specStateRemedy(state);
			expect(remedy).not.toBeNull();
			expect(remedy?.fix.length).toBeGreaterThan(20);
		}
	});

	test("un estado sano no inventa un remedio", () => {
		expect(specStateRemedy("synchronized")).toBeNull();
		expect(specStateRemedy("legacy")).toBeNull();
		expect(verifyStaleRemedy(false)).toBeNull();
		expect(collectSddRemedies(CLEAN)).toEqual([]);
		expect(formatSddRemedies([])).toBe("");
	});

	// El caso que más caro sale: forzar el cierre sobre un conflicto no funciona,
	// y el remedio tiene que decirlo antes de que alguien lo intente.
	test("el conflicto avisa de que forzar no archiva", () => {
		expect(specStateRemedy("conflict")?.fix).toContain("NO archiva");
	});

	test("una corrección posterior a verify pide reverificar, no cerrar", () => {
		const remedy = verifyStaleRemedy(true);
		expect(remedy?.code).toBe("verify-stale");
		expect(remedy?.fix).toContain("sdd-verify");
	});

	test("los remedios salen en orden estable y legible", () => {
		const remedies = collectSddRemedies({ specState: "pending", verifyStale: true, summaryStale: true });
		expect(remedies.map((r) => r.code)).toEqual(["spec-state", "verify-stale", "summary-stale"]);

		const text = formatSddRemedies(remedies);
		expect(text).toContain("■ cómo desbloquear:");
		expect(text.split("\n")).toHaveLength(4);
		for (const remedy of remedies) expect(text).toContain(remedy.fix);
	});
});
