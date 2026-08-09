// =============================================================================
// TESTS: lib/sessions
// humanizeAge (pura) y listRecentSessions contra fixtures con ownership local.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getRuntimeTestOwner, type SessionLease } from "./fixtures/runtime-test-fixture";

const owner = getRuntimeTestOwner();
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
	function writeSession(
		lease: SessionLease,
		project: string,
		file: string,
		meta: { id: string; cwd: string },
		mtime: Date,
	): string {
		const dir = lease.ensureProjectDir(project);
		const path = join(dir, file);
		writeFileSync(
			path,
			`${JSON.stringify({ type: "session", ...meta })}\nrelleno posterior\n`,
		);
		utimesSync(path, mtime, mtime);
		return path;
	}

	async function withRecords<T>(callback: (lease: SessionLease) => T | Promise<T>): Promise<T> {
		return owner.withSessionLease(async (lease) => {
			writeSession(
				lease,
				"proj-a",
				"old.jsonl",
				{ id: "id-old", cwd: "/home/u/proyectos/alpha" },
				new Date(Date.now() - 3_600_000),
			);
			writeSession(
				lease,
				"proj-b",
				"new.jsonl",
				{ id: "id-new", cwd: "/home/u/proyectos/beta" },
				new Date(),
			);
			const noise = lease.ensureProjectDir("proj-c");
			writeFileSync(join(noise, "notas.txt"), "no es sesion");
			writeFileSync(join(noise, "rota.jsonl"), "esto no es json\n");
			return callback(lease);
		});
	}

	test("ordena por mtime descendente y deriva project del cwd", async () => {
		await withRecords(() => {
			const sessions = listRecentSessions(5);
			expect(sessions.length).toBe(2);
			expect(sessions[0]?.id).toBe("id-new");
			expect(sessions[0]?.project).toBe("beta");
			expect(sessions[1]?.id).toBe("id-old");
			expect(sessions[1]?.project).toBe("alpha");
		});
	});

	test("respeta limit y excludePath", async () => {
		await withRecords(() => {
			expect(listRecentSessions(1).length).toBe(1);
			const all = listRecentSessions(5);
			const excluded = listRecentSessions(5, { excludePath: all[0]?.path });
			expect(excluded.find((s) => s.id === "id-new")).toBeUndefined();
		});
	});

	test("mantiene dedupe por project y los campos legacy", async () => {
		await withRecords((lease) => {
			const duplicatePath = writeSession(
				lease,
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
		});
	});
});
