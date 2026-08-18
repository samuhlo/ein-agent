// =============================================================================
// TESTS: el preflight SDD es POR CAMBIO, no por sesión
// -----------------------------------------------------------------------------
// A) Lo que se pregunta una vez por SESIÓN (modo de ejecución, cuaderno Engram)
//    no se repite; lo que describe UN CAMBIO (TDD estricto, carril) se vuelve a
//    preguntar cuando el cambio activo es otro. Antes todo se cacheaba por
//    sesión y el segundo cambio heredaba en silencio la respuesta del primero.
// B) El carril (`micro` / `standard`) se pregunta aquí en vez de depender de que
//    el orquestador se acuerde de pedirlo: era prosa del prompt, y 44 cambios
//    archivados no produjeron ni un solo `lane.json`.
// C) Una postura ya escrita en disco (p. ej. por Claude) NO se vuelve a
//    preguntar: se adopta. El puente entre runtimes es el disco.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	collectSddPreflightPreferences,
	ensureSddPreflight,
	renderSddPreflightPrompt,
} from "../ein-pi/agent/lib/sdd-preflight";
import {
	preflightRecordPath,
	readPreflightRecord,
	writePreflightRecord,
} from "../ein-pi/agent/lib/sdd-preflight-record";
import { laneConfigPath, readChangeLane } from "../ein-pi/agent/lib/sdd-lane";

type AskLog = { execution: number; tdd: number; lane: number; memory: number };

// El preflight cachea por sesión en mapas de módulo. Cada test estrena sesión:
// compartir el id haría que un test heredara la postura del anterior, que es
// justo el fallo que este fichero existe para impedir.
let sessionSeq = 0;

function makeCtx(cwd: string, answers: { tdd?: string; lane?: string; execution?: string }) {
	const asks: AskLog = { execution: 0, tdd: 0, lane: 0, memory: 0 };
	const sessionId = `session-${(sessionSeq += 1)}`;
	const ctx = {
		hasUI: true,
		cwd,
		sessionManager: { getSessionId: () => sessionId },
		ui: {
			select: async (title: string, options: string[]) => {
				if (/execution mode/i.test(title)) {
					asks.execution += 1;
					return answers.execution ?? "interactive";
				}
				if (/strict tdd/i.test(title)) {
					asks.tdd += 1;
					return answers.tdd ?? "off";
				}
				if (/lane/i.test(title)) {
					asks.lane += 1;
					return answers.lane ?? "standard";
				}
				if (/notebook/i.test(title)) {
					asks.memory += 1;
					return "off";
				}
				return options[0];
			},
			input: async () => "400",
			notify: () => {},
		},
	} as never;
	return { ctx, asks };
}

const CALLBACKS = {
	pi: {} as never,
	installAssets: () => ({ agents: 0, chains: 0, support: 0, skipped: 0, installed: 0 }),
	applyModelConfig: () => ({ updated: 0, skipped: 0 }),
};

function sandbox() {
	const cwd = mkdtempSync(join(tmpdir(), "ein-preflight-change-"));
	return {
		cwd,
		addChange: (name: string) => {
			const dir = join(cwd, "openspec", "changes", name);
			mkdirSync(dir, { recursive: true });
			return dir;
		},
		cleanup: () => rmSync(cwd, { recursive: true, force: true }),
	};
}

describe("B — el carril se pregunta en el preflight", () => {
	test("la respuesta `micro` llega a las preferencias", async () => {
		const box = sandbox();
		try {
			const { ctx, asks } = makeCtx(box.cwd, { lane: "micro" });
			const prefs = await collectSddPreflightPreferences(ctx, false);
			expect(asks.lane).toBe(1);
			expect(prefs.lane).toBe("micro");
		} finally {
			box.cleanup();
		}
	});

	test("cualquier respuesta que no sea `micro` deja el carril completo", async () => {
		const box = sandbox();
		try {
			const { ctx } = makeCtx(box.cwd, { lane: "standard" });
			expect((await collectSddPreflightPreferences(ctx, false)).lane).toBe("standard");
		} finally {
			box.cleanup();
		}
	});

	test("sin UI el carril cae a standard: nunca se degrada por accidente", async () => {
		const ctx = { hasUI: false, cwd: "/tmp/ein-no-existe-lane" } as never;
		expect((await collectSddPreflightPreferences(ctx, false)).lane).toBe("standard");
	});

	test("el bloque inyectado nombra el carril solo cuando salta fases", () => {
		const base = {
			executionMode: "interactive",
			memoryMode: "off",
			reviewBudgetLines: 400,
			tddMode: "off",
			engramAvailable: false,
			prompted: true,
		} as const;
		expect(renderSddPreflightPrompt({ ...base, lane: "micro" })).toContain("SDD lane");
		expect(renderSddPreflightPrompt({ ...base, lane: "micro" })).toContain("map");
		expect(renderSddPreflightPrompt({ ...base, lane: "standard" })).not.toContain("SDD lane");
		// Compat: una preferencia legacy sin carril no rompe el render.
		expect(renderSddPreflightPrompt(base)).not.toContain("SDD lane");
	});
});

describe("A — una decisión por cambio", () => {
	test("mismo cambio activo → no se vuelve a preguntar nada", async () => {
		const box = sandbox();
		try {
			box.addChange("cambio-uno");
			const { ctx, asks } = makeCtx(box.cwd, { tdd: "strict" });
			await ensureSddPreflight(ctx, CALLBACKS);
			await ensureSddPreflight(ctx, CALLBACKS);
			expect(asks.tdd).toBe(1);
			expect(asks.lane).toBe(1);
			expect(asks.execution).toBe(1);
		} finally {
			box.cleanup();
		}
	});

	test("cambio nuevo en la misma sesión → re-pregunta TDD y carril, NO el modo de sesión", async () => {
		const box = sandbox();
		try {
			box.addChange("cambio-uno");
			const { ctx, asks } = makeCtx(box.cwd, { tdd: "strict" });
			const first = await ensureSddPreflight(ctx, CALLBACKS);
			expect(first.tddMode).toBe("strict");

			rmSync(join(box.cwd, "openspec", "changes", "cambio-uno"), { recursive: true, force: true });
			box.addChange("cambio-dos");
			const second = await ensureSddPreflight(ctx, CALLBACKS);

			expect(asks.tdd).toBe(2);
			expect(asks.lane).toBe(2);
			expect(asks.execution).toBe(1);
			expect(asks.memory).toBe(1);
			expect(second.activeChange).toBe("cambio-dos");
		} finally {
			box.cleanup();
		}
	});

	test("el preflight que arranca sin cambio se ADOPTA por el cambio que scope crea", async () => {
		const box = sandbox();
		try {
			const { ctx, asks } = makeCtx(box.cwd, { tdd: "off", lane: "micro" });
			await ensureSddPreflight(ctx, CALLBACKS);
			// sdd-scope crea el directorio DESPUÉS del preflight.
			box.addChange("recien-creado");
			const bound = await ensureSddPreflight(ctx, CALLBACKS);

			expect(asks.tdd).toBe(1); // no se re-pregunta: es el mismo trabajo
			expect(bound.activeChange).toBe("recien-creado");
			expect(readPreflightRecord(join(box.cwd, "openspec", "changes", "recien-creado"))?.tdd).toBe("off");
			expect(readChangeLane(join(box.cwd, "openspec", "changes", "recien-creado"))).toBe("micro");
		} finally {
			box.cleanup();
		}
	});
});

describe("C — la postura se persiste y se adopta", () => {
	test("la respuesta se escribe en el directorio del cambio", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			const { ctx } = makeCtx(box.cwd, { tdd: "strict", lane: "micro" });
			await ensureSddPreflight(ctx, CALLBACKS);
			expect(existsSync(preflightRecordPath(dir))).toBe(true);
			expect(existsSync(laneConfigPath(dir))).toBe(true);
			expect(readPreflightRecord(dir)?.tdd).toBe("strict");
			expect(readPreflightRecord(dir)?.decidedBy).toBe("pi");
		} finally {
			box.cleanup();
		}
	});

	test("una postura escrita por Claude se adopta sin preguntar", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writePreflightRecord(dir, { tdd: "strict", decidedBy: "claude" });
			const { ctx, asks } = makeCtx(box.cwd, { tdd: "off" });
			const prefs = await ensureSddPreflight(ctx, CALLBACKS);
			expect(asks.tdd).toBe(0);
			expect(prefs.tddMode).toBe("strict");
		} finally {
			box.cleanup();
		}
	});

	test("adoptar una postura existente no pisa el carril ya declarado", async () => {
		const box = sandbox();
		try {
			const dir = box.addChange("cambio-uno");
			writePreflightRecord(dir, { tdd: "off", decidedBy: "claude" });
			const { ctx, asks } = makeCtx(box.cwd, { lane: "micro" });
			const prefs = await ensureSddPreflight(ctx, CALLBACKS);
			expect(asks.lane).toBe(0);
			expect(prefs.lane).toBe("standard");
			expect(existsSync(laneConfigPath(dir))).toBe(false);
		} finally {
			box.cleanup();
		}
	});
});
