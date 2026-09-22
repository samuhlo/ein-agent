import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint-store.ts";
import { setContinuityObjective } from "../ein-pi/agent/lib/continuity-objective.ts";

const roots: string[] = [];
function fixture(): string {
	const cwd = mkdtempSync(join(tmpdir(), "ein-claude-objective-")); roots.push(cwd);
	execFileSync("git", ["init", "-q"], { cwd }); execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd }); execFileSync("git", ["config", "user.name", "Fixture"], { cwd });
	writeFileSync(join(cwd, ".gitignore"), "/.ein/continuity.json\n"); writeFileSync(join(cwd, "safe.txt"), "safe\n"); execFileSync("git", ["add", "."], { cwd }); execFileSync("git", ["commit", "-qm", "fixture"], { cwd });
	return cwd;
}
function cli(cwd: string, args: string[], input?: unknown) {
	const result = Bun.spawnSync([process.execPath, join(import.meta.dir, "../ein-cc/sdd-cli/cli.ts"), "objective", ...args], {
		cwd, stdin: input === undefined ? undefined : Buffer.from(JSON.stringify(input)),
	});
	return { code: result.exitCode, text: result.stdout.toString().trim(), error: result.stderr.toString() };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("Claude continuity objective CLI", () => {
	test("show is read-only and set records a Claude attestation without SDD preflight", () => {
		const cwd = fixture();
		expect(JSON.parse(cli(cwd, ["show"]).text)).toEqual({ kind: "absent", expectedRevision: "absent" });
		expect(existsSync(join(cwd, "openspec"))).toBeFalse();
		const result = cli(cwd, ["set"], { objective: "Exportar contactos", expectedRevision: "absent", requestId: "claude-request-1", requestText: "Exporta mis contactos" });
		expect(result.code, `${result.text}\n${result.error}`).toBe(0);
		const checkpoint = readContinuityCheckpoint(cwd, { mode: "adhoc" });
		expect(checkpoint.status === "valid" && checkpoint.checkpoint).toMatchObject({ objective: "Exportar contactos", objectiveEvidence: { kind: "claude-attested", requestId: "claude-request-1" } });
		expect(existsSync(join(cwd, "openspec"))).toBeFalse();
	});

	test("requires exact attestation input and preserves a newer CAS write", () => {
		const cwd = fixture();
		for (const input of [{ objective: "A", expectedRevision: "absent", requestId: "id" }, { objective: "A", expectedRevision: "absent", requestId: "id", requestText: "text", extra: true }]) expect(cli(cwd, ["set"], input).code).toBe(1);
		const first = cli(cwd, ["set"], { objective: "A", expectedRevision: "absent", requestId: "id-a", requestText: "Primera petición" }); expect(first.code).toBe(0);
		const observed = JSON.parse(cli(cwd, ["show"]).text);
		const second = cli(cwd, ["set"], { objective: "B", expectedRevision: observed.expectedRevision, requestId: "id-b", requestText: "Corrige el objetivo" }); expect(second.code).toBe(0);
		expect(cli(cwd, ["set"], { objective: "C", expectedRevision: observed.expectedRevision, requestId: "id-c", requestText: "Otra corrección" }).code).toBe(1);
		expect(JSON.parse(cli(cwd, ["show"]).text).objective).toBe("B");
	});

	test("Pi can replace a Claude objective and Claude reads the same checkpoint on reentry", () => {
		const cwd = fixture(); cli(cwd, ["set"], { objective: "Objetivo Claude", expectedRevision: "absent", requestId: "claude-1", requestText: "Empieza esto" });
		const shown = JSON.parse(cli(cwd, ["show"]).text);
		const pi = setContinuityObjective(cwd, { objective: "Objetivo Pi", evidence: { kind: "pi-observed", requestId: "pi-1", recordedAt: "2026-09-22T12:00:00Z" } }, shown.expectedRevision);
		expect(pi.outcome).toBe("set");
		expect(JSON.parse(cli(cwd, ["show"]).text)).toMatchObject({ objective: "Objetivo Pi", objectiveEvidence: { kind: "pi-observed", requestId: "pi-1" } });
	});
});
