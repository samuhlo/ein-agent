// =============================================================================
// TESTS: lib/onboarding
// El disparador es agnóstico a la edad del proyecto: "pendiente" = fichero de
// config ausente. Un proyecto sin configurar reporta los 5 esenciales; aplicar
// los defaults los deja configurados (no vuelven a estar pendientes).
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Essential } from "../ein-pi/agent/lib/onboarding.ts";

const { pendingEssentials, applyDefault, runOnboarding } = await import(
	"../ein-pi/agent/lib/onboarding"
);

describe("pendingEssentials", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-onboard-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("proyecto sin configurar → los 6 esenciales pendientes, incluido agents", () => {
		expect(pendingEssentials(cwd).sort()).toEqual(
			(["agents", "einmd", "hypa", "lang", "persona", "tdd"] satisfies Essential[]).sort(),
		);
	});

	test("aplicar un default lo saca de pendientes", () => {
		applyDefault(cwd, "hypa");
		expect(pendingEssentials(cwd)).not.toContain("hypa");
		expect(pendingEssentials(cwd)).toContain("persona");
	});

	test("missing agents config alone keeps onboarding pending", () => {
		for (const item of ["persona", "lang", "tdd", "hypa", "einmd"] as const) applyDefault(cwd, item);
		expect(pendingEssentials(cwd)).toEqual(["agents"]);
	});

	test("aplicar todos → nada pendiente + EIN.md en la raíz", () => {
		for (const item of ["persona", "lang", "tdd", "hypa", "agents", "einmd"] as const) {
			applyDefault(cwd, item);
		}
		expect(pendingEssentials(cwd)).toEqual([]);
		expect(existsSync(join(cwd, "EIN.md"))).toBe(true);
	});

	test("recommended writes Balanced only when agents config is missing", async () => {
		const selects = ["Usar recomendados (rellena solo lo que falta)"];
		await runOnboarding({ cwd, hasUI: true, ui: {
			select: async () => selects.shift(), notify: () => undefined,
		} } as never);
		const path = join(cwd, ".pi", "ein", "agents.json");
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ agents: {
			cleaner: { enabled: true }, architect: { enabled: false },
		} });
		const original = readFileSync(path, "utf8");
		await runOnboarding({ cwd, hasUI: true, ui: {
			select: async () => "Usar recomendados (rellena solo lo que falta)", notify: () => undefined,
		} } as never, { all: true });
		expect(readFileSync(path, "utf8")).toBe(original);
	});

	test("personalized selection persists the chosen agent profile and advertises controls", async () => {
		for (const item of ["persona", "lang", "tdd", "hypa", "agents", "einmd"] as const) applyDefault(cwd, item);
		writeFileSync(join(cwd, ".pi", "ein", "agents.json"), `${JSON.stringify({ agents: {
			cleaner: { enabled: false }, architect: { enabled: true },
		} }, null, 2)}\n`);
		const labels: string[] = [];
		const notices: string[] = [];
		await runOnboarding({ cwd, hasUI: true, ui: {
			select: async (label: string, options: string[]) => {
				labels.push(label);
				if (label.startsWith("Configurar")) return options[1];
				if (label.startsWith("Automatic SDD")) return options.find((option) => option.startsWith("Thorough"));
				return options.find((option) => option.includes("← actual"));
			},
			notify: (message: string) => notices.push(message),
		} } as never, { all: true });
		expect(labels.filter((label) => label.startsWith("Automatic SDD"))).toHaveLength(1);
		expect(labels.join("\n")).toContain("current: custom (Cleaner off, Architect on)");
		expect(readFileSync(join(cwd, ".pi", "ein", "agents.json"), "utf8")).toContain('"architect": {\n      "enabled": true');
		expect(notices.join("\n")).toContain("/ein:cleaner on|off");
		expect(notices.join("\n")).toContain("/ein:architect on|off");
		expect(notices.join("\n")).toContain("/ein:onboard");
	});
});
