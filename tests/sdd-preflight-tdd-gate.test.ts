// =============================================================================
// TESTS: renderSddPreflightPrompt — gate de la linea Strict TDD
// La linea de TDD solo debe entrar donde se escribe codigo (parent inline +
// sdd-apply). En init/explore/design/verify es ruido que empujaba a los
// modelos baratos a un ciclo RED/GREEN en fases read-only.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateTddForDelegation } from "../ein-pi/agent/lib/sdd-preflight.ts";
import { readChangeStance, writePreflightRecord } from "../ein-pi/agent/lib/sdd-preflight-record.ts";
import { writeTddMode } from "../ein-pi/agent/lib/tdd.ts";

const { collectSddPreflightPreferences, normalizeSddMemoryMode, renderSddPreflightPrompt } = await import(
	"../ein-pi/agent/lib/sdd-preflight"
);

const PREFS = {
	executionMode: "auto",
	memoryMode: "off",
	reviewBudgetLines: 400,
	tddMode: "strict",
	engramAvailable: false,
	prompted: true,
} as const;

describe("renderSddPreflightPrompt TDD gate", () => {
	test("asks once on an existing change, persists, and adopts across sessions", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-tdd-owner-"));
		try {
			writeTddMode(cwd, "ask");
			let asks = 0;
			const ctx = { cwd, hasUI: true, ui: { select: async () => { asks++; return "strict"; }, notify: () => {} } } as never;
			const input = { agent: "sdd-scope", task: "Fix behavior" };
			await gateTddForDelegation(input, ctx);
			expect(asks).toBe(0);
			const first = join(cwd, "openspec/changes/first");
			mkdirSync(first, { recursive: true });
			await gateTddForDelegation(input, ctx);
			expect(readChangeStance(cwd, "first")?.tdd).toBe("strict");
			expect(asks).toBe(1);
			await gateTddForDelegation({ agent: "sdd-apply", task: "Apply" }, { ...ctx as object, sessionManager: { getSessionId: () => "resumed" } } as never);
			expect(asks).toBe(1);
			renameSync(first, join(cwd, "first-closed"));
			mkdirSync(join(cwd, "openspec/changes/second"));
			await gateTddForDelegation(input, ctx);
			expect(asks).toBe(2);
			writePreflightRecord(join(cwd, "openspec/changes/second"), { tdd: "off", decidedBy: "claude" });
			await gateTddForDelegation(input, ctx);
			expect((await collectSddPreflightPreferences({ ...ctx as object, hasUI: false } as never, false)).tddMode).toBe("off");
		} finally { rmSync(cwd, { recursive: true, force: true }); }
	});

	test("cancelling the choice leaves TDD undecided and stops delegation", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-tdd-cancel-"));
		try {
			writeTddMode(cwd, "ask");
			mkdirSync(join(cwd, "openspec/changes/change"), { recursive: true });
			const ctx = { cwd, hasUI: true, ui: { select: async () => undefined, notify: () => {} } } as never;
			await expect(gateTddForDelegation({ agent: "sdd-apply", task: "Fix behavior" }, ctx)).rejects.toThrow("TDD");
			expect(readChangeStance(cwd, "change")?.tdd).toBeUndefined();
		} finally { rmSync(cwd, { recursive: true, force: true }); }
	});
	test("normaliza preferencias legacy sin hacer seleccionable OpenSpec", () => {
		expect(normalizeSddMemoryMode({ artifactStore: "openspec" })).toBe("off");
		expect(normalizeSddMemoryMode({ artifactStore: "engram" })).toBe("engram");
		expect(normalizeSddMemoryMode({ artifactStore: "both" })).toBe("engram");
	});

	test("por defecto incluye la linea Strict TDD (compat: parent/apply)", () => {
		const out = renderSddPreflightPrompt(PREFS);
		expect(out).toContain("Strict TDD");
	});

	test("includeTdd:true incluye la linea", () => {
		expect(renderSddPreflightPrompt(PREFS, { includeTdd: true })).toContain(
			"Strict TDD",
		);
	});

	test("includeTdd:false omite TDD pero conserva el resto del preflight", () => {
		const out = renderSddPreflightPrompt(PREFS, { includeTdd: false });
		expect(out).not.toContain("Strict TDD");
		expect(out).toContain("## SDD Session Preflight");
		expect(out).toContain("OpenSpec: canonical full SDD record");
		expect(out).toContain("Optional project notebook: Engram off");
		expect(out).not.toContain("Artifact store");
		expect(out).not.toContain("retrieved");
		expect(out).not.toContain("saved");
		expect(out).toContain("Execution mode");
	});

	test("TDD technical default is consumed without a per-change TDD or lane selector", async () => {
		const selected: string[] = [];
		const ctx = {
			hasUI: true,
			cwd: "/tmp/ein-preflight-tdd-default",
			sessionManager: { getSessionId: () => "tdd-default-session" },
			ui: {
				select: async (title: string, options: string[]) => {
					selected.push(title);
					return options[0];
				},
				notify: () => {},
			},
		} as never;
		const prefs = await collectSddPreflightPreferences(ctx, false);
		expect(selected.some((title) => /strict tdd|lane/i.test(title))).toBe(false);
		expect(["auto", "off", "strict"]).toContain(prefs.tddMode);
	});
});
