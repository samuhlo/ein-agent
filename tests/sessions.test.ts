// =============================================================================
// TESTS: lib/sessions
// humanizeAge (pura) y listRecentSessions contra un fixture en un AGENT_DIR
// temporal (EIN_PI_AGENT_HOME se fija antes del import dinámico).
// =============================================================================

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mismo home temporal en todos los tests del repo: ein-paths cachea AGENT_DIR
// en el primer import del proceso.
const TEST_AGENT_HOME = join(tmpdir(), "ein-agent-tests", "agent");
process.env.EIN_PI_AGENT_HOME = TEST_AGENT_HOME;

const { humanizeAge, listRecentSessions } = await import(
	"../ein-pi/agent/lib/sessions"
);

const I18N_KEY = Symbol.for("rpiv-i18n");
const originalLocale = (globalThis as Record<symbol, unknown>)[I18N_KEY];

function setLocale(locale: string): void {
	(globalThis as Record<symbol, unknown>)[I18N_KEY] = { locale, namespaces: {} };
}

describe("humanizeAge", () => {
	beforeEach(() => {
		setLocale("es");
	});

	afterEach(() => {
		(globalThis as Record<symbol, unknown>)[I18N_KEY] = originalLocale;
	});

	test("menos de 45s es 'justo ahora'", () => {
		expect(humanizeAge(0)).toBe("justo ahora");
		expect(humanizeAge(44_000)).toBe("justo ahora");
	});

	test("minutos, horas y dias", () => {
		expect(humanizeAge(5 * 60_000)).toBe("5m");
		expect(humanizeAge(3 * 3_600_000)).toBe("3h");
		expect(humanizeAge(2 * 86_400_000)).toBe("2d");
	});
});

describe("listRecentSessions", () => {
	const sessionsDir = join(TEST_AGENT_HOME, "sessions");

	function writeSession(
		project: string,
		file: string,
		meta: { id: string; cwd: string },
		mtime: Date,
	): string {
		const dir = join(sessionsDir, project);
		mkdirSync(dir, { recursive: true });
		const path = join(dir, file);
		writeFileSync(
			path,
			`${JSON.stringify({ type: "session", ...meta })}\nrelleno posterior\n`,
		);
		utimesSync(path, mtime, mtime);
		return path;
	}

	beforeAll(() => {
		rmSync(sessionsDir, { recursive: true, force: true });
		writeSession(
			"proj-a",
			"old.jsonl",
			{ id: "id-old", cwd: "/home/u/proyectos/alpha" },
			new Date(Date.now() - 3_600_000),
		);
		writeSession(
			"proj-b",
			"new.jsonl",
			{ id: "id-new", cwd: "/home/u/proyectos/beta" },
			new Date(),
		);
		// Ruido que debe ignorarse: sin .jsonl y primera línea inválida.
		mkdirSync(join(sessionsDir, "proj-c"), { recursive: true });
		writeFileSync(join(sessionsDir, "proj-c", "notas.txt"), "no es sesion");
		writeFileSync(join(sessionsDir, "proj-c", "rota.jsonl"), "esto no es json\n");
	});

	afterAll(() => {
		// Solo lo propio: el home temporal es compartido entre ficheros de test.
		rmSync(sessionsDir, { recursive: true, force: true });
	});

	test("ordena por mtime descendente y deriva project del cwd", () => {
		const sessions = listRecentSessions(5);
		expect(sessions.length).toBe(2);
		expect(sessions[0]?.id).toBe("id-new");
		expect(sessions[0]?.project).toBe("beta");
		expect(sessions[1]?.id).toBe("id-old");
		expect(sessions[1]?.project).toBe("alpha");
	});

	test("respeta limit y excludePath", () => {
		expect(listRecentSessions(1).length).toBe(1);
		const all = listRecentSessions(5);
		const excluded = listRecentSessions(5, { excludePath: all[0]?.path });
		expect(excluded.find((s) => s.id === "id-new")).toBeUndefined();
	});

	test("mantiene dedupe por project y los campos legacy", () => {
		const duplicatePath = writeSession(
			"proj-d",
			"duplicate.jsonl",
			{ id: "id-duplicate", cwd: "/home/u/proyectos/alpha" },
			new Date(),
		);
		const deduped = listRecentSessions(10, { dedupeByProject: true });
		const alpha = deduped.filter((session) => session.project === "alpha");
		expect(alpha).toHaveLength(1);
		expect(alpha[0]).toMatchObject({
			id: "id-duplicate",
			cwd: "/home/u/proyectos/alpha",
			path: duplicatePath,
		});
		rmSync(join(sessionsDir, "proj-d"), { recursive: true, force: true });
	});
});
