// =============================================================================
// TESTS: nudge de sesión obsoleta (session-version)
// `ein update` a mitad de sesión no surte efecto hasta reiniciar Pi; el nudge
// detecta el cambio de versión instalada durante la sesión.
// =============================================================================

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readInstalledVersion, staleSessionNudge } from "../ein-pi/agent/lib/session-version";

const dirs: string[] = [];
function tmpMarker(body: string): string {
	const dir = mkdtempSync(join(tmpdir(), "ein-marker-"));
	dirs.push(dir);
	const path = join(dir, ".ein-install.json");
	writeFileSync(path, body);
	return path;
}
afterEach(() => {
	while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("readInstalledVersion", () => {
	test("lee la versión del marker (v1 y v2)", () => {
		expect(readInstalledVersion(tmpMarker(JSON.stringify({ version: "0.19.12", channel: "stable" })))).toBe("0.19.12");
		expect(readInstalledVersion(tmpMarker(JSON.stringify({ schemaVersion: 2, version: "0.20.0" })))).toBe("0.20.0");
	});

	test("marker ausente o roto → null (dev/fuente, no molesta)", () => {
		expect(readInstalledVersion(join(tmpdir(), "no-existe-marker.json"))).toBeNull();
		expect(readInstalledVersion(tmpMarker("{roto"))).toBeNull();
		expect(readInstalledVersion(tmpMarker(JSON.stringify({ channel: "stable" })))).toBeNull();
	});
});

describe("staleSessionNudge", () => {
	test("versión cambió durante la sesión → avisa una vez", () => {
		expect(staleSessionNudge({ startVersion: "0.19.11", currentVersion: "0.19.12", alreadyNudged: false })).toEqual({ nudge: true, version: "0.19.12" });
	});

	test("misma versión → no molesta", () => {
		expect(staleSessionNudge({ startVersion: "0.19.12", currentVersion: "0.19.12", alreadyNudged: false }).nudge).toBe(false);
	});

	test("ya avisado → no repite", () => {
		expect(staleSessionNudge({ startVersion: "0.19.11", currentVersion: "0.19.12", alreadyNudged: true }).nudge).toBe(false);
	});

	test("sin versión de arranque o actual (dev) → no molesta", () => {
		expect(staleSessionNudge({ startVersion: null, currentVersion: "0.19.12", alreadyNudged: false }).nudge).toBe(false);
		expect(staleSessionNudge({ startVersion: "0.19.12", currentVersion: null, alreadyNudged: false }).nudge).toBe(false);
	});
});
