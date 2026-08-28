// =============================================================================
// TESTS: sdd-preflight-record — la postura del CAMBIO, en disco
// -----------------------------------------------------------------------------
// La decisión de TDD vivía solo en la memoria de la sesión de Pi: Claude no
// podía leerla y un segundo cambio de la misma sesión heredaba la del primero.
// Este módulo la baja a disco, junto al carril, para que ambos runtimes lean
// la MISMA postura y para que "un cambio" sea la unidad de decisión.
//
// FAIL CLOSED es la propiedad central: un fichero ausente, roto o con un valor
// desconocido devuelve `undefined` (nadie lo ha decidido), nunca un default
// disfrazado de decisión.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	changeStanceDirective,
	preflightRecordPath,
	readChangeStance,
	readPreflightRecord,
	renderChangeStanceLine,
	resolveActiveChange,
	writePreflightRecord,
	type SddIntentRecord,
} from "../ein-pi/agent/lib/sdd-preflight-record";
import { writeChangeLane } from "../ein-pi/agent/lib/sdd-lane";

function validIntent(
	overrides: Partial<SddIntentRecord> = {},
): SddIntentRecord {
	return {
		version: 1,
		resolution: "confirmed",
		route: "normal",
		summary: "Add compatible intent persistence",
		objective: "Persist one resolved intent",
		boundaries: { in: ["preflight codec"], out: ["runtime orchestration"] },
		completionCriteria: ["Legacy TDD remains readable"],
		materialKey: `sha256:${"a".repeat(64)}`,
		laneOrigin: "declared",
		reason: "intent-confirmed",
		resolvedBy: "pi",
		resolvedAt: "2026-08-28T12:00:00.000Z",
		...overrides,
	};
}

function sandbox(): { cwd: string; changeDir: (name: string) => string; cleanup: () => void } {
	const cwd = mkdtempSync(join(tmpdir(), "ein-preflight-record-"));
	return {
		cwd,
		changeDir: (name: string) => {
			const dir = join(cwd, "openspec", "changes", name);
			mkdirSync(dir, { recursive: true });
			return dir;
		},
		cleanup: () => rmSync(cwd, { recursive: true, force: true }),
	};
}

describe("readPreflightRecord — fail closed", () => {
	test("sin fichero → undefined, no un default", () => {
		const box = sandbox();
		try {
			expect(readPreflightRecord(box.changeDir("uno"))).toBeUndefined();
		} finally {
			box.cleanup();
		}
	});

	test("JSON roto → undefined", () => {
		const box = sandbox();
		try {
			const dir = box.changeDir("uno");
			writeFileSync(preflightRecordPath(dir), "{ no es json");
			expect(readPreflightRecord(dir)).toBeUndefined();
		} finally {
			box.cleanup();
		}
	});

	test("postura desconocida → undefined (no se asciende a off ni a strict)", () => {
		const box = sandbox();
		try {
			const dir = box.changeDir("uno");
			writeFileSync(preflightRecordPath(dir), JSON.stringify({ tdd: "quizá" }));
			expect(readPreflightRecord(dir)).toBeUndefined();
		} finally {
			box.cleanup();
		}
	});
});

describe("writePreflightRecord / readPreflightRecord", () => {
	test("ida y vuelta conserva postura y autoría", () => {
		const box = sandbox();
		try {
			const dir = box.changeDir("uno");
			const written = writePreflightRecord(dir, { tdd: "strict", decidedBy: "pi" });
			expect(written.tdd).toBe("strict");
			expect(written.decidedBy).toBe("pi");
			expect(Number.isNaN(Date.parse(written.decidedAt))).toBe(false);

			const read = readPreflightRecord(dir);
			expect(read?.tdd).toBe("strict");
			expect(read?.decidedBy).toBe("pi");
			expect(read?.decidedAt).toBe(written.decidedAt);
		} finally {
			box.cleanup();
		}
	});

	test("una decisión de Claude se lee igual desde Pi (el puente es el disco)", () => {
		const box = sandbox();
		try {
			const dir = box.changeDir("uno");
			writePreflightRecord(dir, { tdd: "off", decidedBy: "claude" });
			expect(readPreflightRecord(dir)?.tdd).toBe("off");
			expect(readPreflightRecord(dir)?.decidedBy).toBe("claude");
		} finally {
			box.cleanup();
		}
	});
});

describe("intent versionado compatible", () => {
	test("un record legacy conserva TDD sin inventar intent", () => {
		const box = sandbox();
		try {
			const dir = box.changeDir("legacy");
			writeFileSync(preflightRecordPath(dir), JSON.stringify({
				tdd: "strict",
				decidedBy: "claude",
				decidedAt: "2026-08-20T09:00:00.000Z",
			}));
			expect(readPreflightRecord(dir)).toEqual({
				tdd: "strict",
				decidedBy: "claude",
				decidedAt: "2026-08-20T09:00:00.000Z",
			});
		} finally {
			box.cleanup();
		}
	});

	test("confirmed, automatic-small y bypassed hacen round-trip", () => {
		const box = sandbox();
		try {
			const cases: SddIntentRecord[] = [
				validIntent(),
				validIntent({
					resolution: "automatic-small",
					route: "small",
					laneOrigin: "classified",
					reason: "bounded-mechanical-work",
					resolvedBy: "claude",
				}),
				validIntent({ resolution: "bypassed", reason: "explicit-bypass" }),
			];
			for (const [index, intent] of cases.entries()) {
				const dir = box.changeDir(`round-trip-${index}`);
				writePreflightRecord(dir, { tdd: "off", decidedBy: "pi", intent });
				expect(readPreflightRecord(dir)?.intent).toEqual(intent);
			}
		} finally {
			box.cleanup();
		}
	});

	test("intent parcial, desconocido o futuro se ignora sin invalidar TDD", () => {
		const box = sandbox();
		try {
			const invalidIntents = [
				{ version: 1, resolution: "confirmed" },
				{ ...validIntent(), resolution: "unknown" },
				{ ...validIntent(), version: 2 },
			];
			for (const [index, intent] of invalidIntents.entries()) {
				const dir = box.changeDir(`partial-future-${index}`);
				writeFileSync(preflightRecordPath(dir), JSON.stringify({
					tdd: "strict",
					decidedBy: "claude",
					decidedAt: "2026-08-20T09:00:00.000Z",
					intent,
				}));
				const record = readPreflightRecord(dir);
				expect(record?.tdd).toBe("strict");
				expect(record?.decidedBy).toBe("claude");
				expect(record?.intent).toBeUndefined();
			}
		} finally {
			box.cleanup();
		}
	});

	test("autoría o procedencia desconocida invalida solo intent", () => {
		const box = sandbox();
		try {
			for (const [index, intent] of [
				{ ...validIntent(), resolvedBy: "other-runtime" },
				{ ...validIntent(), laneOrigin: "inferred" },
			].entries()) {
				const dir = box.changeDir(`unknown-intent-${index}`);
				writeFileSync(preflightRecordPath(dir), JSON.stringify({
					tdd: "strict",
					decidedBy: "claude",
					decidedAt: "2026-08-20T09:00:00.000Z",
					intent,
				}));
				const record = readPreflightRecord(dir);
				expect(record?.tdd).toBe("strict");
				expect(record?.intent).toBeUndefined();
			}
		} finally {
			box.cleanup();
		}
	});

	test("campos materiales vacíos o fechas y keys inválidas no confirman intent", () => {
		const box = sandbox();
		try {
			const invalidIntents = [
				validIntent({ summary: " " }),
				validIntent({ boundaries: { in: [""], out: [] } }),
				validIntent({ completionCriteria: [] }),
				validIntent({ materialKey: "sha256:no" }),
				validIntent({ resolvedAt: "not-a-date" }),
			];
			for (const [index, intent] of invalidIntents.entries()) {
				const dir = box.changeDir(`invalid-intent-${index}`);
				writeFileSync(preflightRecordPath(dir), JSON.stringify({ tdd: "off", intent }));
				expect(readPreflightRecord(dir)?.tdd).toBe("off");
				expect(readPreflightRecord(dir)?.intent).toBeUndefined();
			}
		} finally {
			box.cleanup();
		}
	});
});

describe("readChangeStance — postura completa del cambio", () => {
	test("sin decidir nada: tdd undefined, carril standard sin declarar", () => {
		const box = sandbox();
		try {
			box.changeDir("uno");
			const stance = readChangeStance(box.cwd, "uno");
			expect(stance?.tdd).toBeUndefined();
			expect(stance?.lane).toBe("standard");
			expect(stance?.laneDeclared).toBe(false);
		} finally {
			box.cleanup();
		}
	});

	test("combina preflight.json y lane.json", () => {
		const box = sandbox();
		try {
			const dir = box.changeDir("uno");
			writePreflightRecord(dir, { tdd: "off", decidedBy: "pi" });
			writeChangeLane(dir, "micro");
			const stance = readChangeStance(box.cwd, "uno");
			expect(stance?.tdd).toBe("off");
			expect(stance?.lane).toBe("micro");
			expect(stance?.laneDeclared).toBe(true);
		} finally {
			box.cleanup();
		}
	});

	test("lane clasificado solo conserva esa procedencia si lane e intent concuerdan", () => {
		const box = sandbox();
		try {
			const dir = box.changeDir("uno");
			writeChangeLane(dir, "micro");
			writePreflightRecord(dir, {
				tdd: "off",
				decidedBy: "pi",
				intent: validIntent({
					resolution: "automatic-small",
					route: "small",
					laneOrigin: "classified",
					reason: "bounded-mechanical-work",
				}),
			});
			const stance = readChangeStance(box.cwd, "uno");
			expect(stance?.laneOrigin).toBe("classified");
			expect(stance?.laneDeclared).toBe(false);
		} finally {
			box.cleanup();
		}
	});

	test("lane declarado, incoherente o corrupto gana sobre procedencia classified", () => {
		const box = sandbox();
		try {
			const intent = validIntent({
				resolution: "automatic-small",
				route: "small",
				laneOrigin: "classified",
				reason: "bounded-mechanical-work",
			});
			for (const [name, laneBody] of [
				["declared", JSON.stringify({ lane: "standard" })],
				["corrupt", "{ no"],
			] as const) {
				const dir = box.changeDir(name);
				writeFileSync(join(dir, "lane.json"), laneBody);
				writePreflightRecord(dir, { tdd: "strict", decidedBy: "pi", intent });
				const stance = readChangeStance(box.cwd, name);
				expect(stance?.lane).toBe("standard");
				expect(stance?.laneOrigin).toBe("declared");
				expect(stance?.laneDeclared).toBe(true);
			}

			const explicitDir = box.changeDir("explicit");
			writeChangeLane(explicitDir, "micro");
			writePreflightRecord(explicitDir, {
				tdd: "strict",
				decidedBy: "pi",
				intent: validIntent({
					resolution: "automatic-small",
					route: "small",
					laneOrigin: "declared",
					reason: "declared-lane",
				}),
			});
			expect(readChangeStance(box.cwd, "explicit")?.laneOrigin).toBe("declared");

			const absentDir = box.changeDir("absent");
			writePreflightRecord(absentDir, { tdd: "strict", decidedBy: "pi", intent });
			const absent = readChangeStance(box.cwd, "absent");
			expect(absent?.laneOrigin).toBeUndefined();
			expect(absent?.laneDeclared).toBe(false);
		} finally {
			box.cleanup();
		}
	});

	test("cambio inexistente o nombre inseguro → undefined", () => {
		const box = sandbox();
		try {
			expect(readChangeStance(box.cwd, "no-existe")).toBeUndefined();
			expect(readChangeStance(box.cwd, "../fuera")).toBeUndefined();
			expect(readChangeStance(box.cwd, "archive")).toBeUndefined();
		} finally {
			box.cleanup();
		}
	});
});

describe("resolveActiveChange", () => {
	test("sin cambios activos → undefined", () => {
		const box = sandbox();
		try {
			expect(resolveActiveChange(box.cwd)).toBeUndefined();
		} finally {
			box.cleanup();
		}
	});

	test("devuelve el cambio activo e ignora archive/", () => {
		const box = sandbox();
		try {
			box.changeDir("archive");
			box.changeDir("mi-cambio");
			expect(resolveActiveChange(box.cwd)).toBe("mi-cambio");
		} finally {
			box.cleanup();
		}
	});
});

describe("render / directive", () => {
	test("la línea de status dice `sin decidir` cuando nadie decidió", () => {
		const box = sandbox();
		try {
			box.changeDir("uno");
			const line = renderChangeStanceLine(readChangeStance(box.cwd, "uno"));
			expect(line).toContain("sin decidir");
			expect(line).toContain("standard");
		} finally {
			box.cleanup();
		}
	});

	test("la línea de status nombra la postura y quién la decidió", () => {
		const box = sandbox();
		try {
			const dir = box.changeDir("uno");
			writePreflightRecord(dir, { tdd: "strict", decidedBy: "claude" });
			const line = renderChangeStanceLine(readChangeStance(box.cwd, "uno"));
			expect(line).toContain("strict");
			expect(line).toContain("claude");
		} finally {
			box.cleanup();
		}
	});

	test("sin cambio no hay línea que imprimir", () => {
		expect(renderChangeStanceLine(undefined)).toBe("");
	});

	test("la directiva de una postura decidida manda sobre el config del proyecto", () => {
		const box = sandbox();
		try {
			const dir = box.changeDir("uno");
			writePreflightRecord(dir, { tdd: "off", decidedBy: "pi" });
			const directive = changeStanceDirective(readChangeStance(box.cwd, "uno"));
			expect(directive).toContain("OFF");
			expect(directive).toMatch(/overrides/i);
		} finally {
			box.cleanup();
		}
	});

	test("una postura sin decidir NO emite directiva (no inventa una decisión)", () => {
		const box = sandbox();
		try {
			box.changeDir("uno");
			expect(changeStanceDirective(readChangeStance(box.cwd, "uno"))).toBe("");
		} finally {
			box.cleanup();
		}
	});

	test("el carril micro se nombra en la directiva; standard no añade ruido", () => {
		const box = sandbox();
		try {
			const dir = box.changeDir("uno");
			writePreflightRecord(dir, { tdd: "off", decidedBy: "pi" });
			writeChangeLane(dir, "micro");
			const micro = changeStanceDirective(readChangeStance(box.cwd, "uno"));
			expect(micro).toContain("micro");
			expect(micro).toMatch(/map/);

			writeChangeLane(dir, "standard");
			expect(changeStanceDirective(readChangeStance(box.cwd, "uno"))).not.toContain("micro");
		} finally {
			box.cleanup();
		}
	});
});
