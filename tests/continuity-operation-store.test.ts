import { afterEach, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOperationJournal, operationId, operationInputDigest, type ContinuityOperation } from "../ein-pi/agent/lib/continuity-operations.ts";
import { readContinuityOperations, transactContinuityOperations } from "../ein-pi/agent/lib/continuity-operation-store.ts";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "operation-store-")); execFileSync("git", ["init", "-q"], { cwd: root }); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
function operation(n = 0): ContinuityOperation {
	const nativeCallRef = { sessionRef: `pi:v1:sha256:${"a".repeat(64)}`, toolCallId: `call-${n}` };
	return { id: operationId("pi", nativeCallRef), runtime: "pi", tool: "edit", inputDigest: operationInputDigest({ n }), nativeCallRef,
		beforeStateRef: null, startedAt: new Date(1700000000000 + n).toISOString(), effectScope: "local", status: "running" };
}
test("reads are nonmutating; CAS persists exact operations with private permissions", () => {
	expect(readContinuityOperations(root).status).toBe("absent"); expect(existsSync(join(root, ".ein"))).toBe(false);
	const first = transactContinuityOperations(root, "absent", () => [operation()]); if (!first.ok) throw new Error(first.reason);
	expect(readContinuityOperations(root)).toEqual({ status: "valid", journal: first.journal });
	expect(lstatSync(join(root, ".ein/continuity-operations.json")).mode & 0o777).toBe(0o600);
	expect(lstatSync(join(root, ".ein")).mode & 0o777).toBe(0o700);
	expect(transactContinuityOperations(root, "absent", () => [])).toMatchObject({ ok: false, reason: "conflict" });
	expect(transactContinuityOperations(root, first.journal.revision, (ops) => [...ops, operation(1)]).ok).toBe(true);
	expect(execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })).not.toContain("continuity-operations");
});
test("corrupt and unknown journals are protected, never treated as empty", () => {
	mkdirSync(join(root, ".ein")); const path = join(root, ".ein/continuity-operations.json");
	for (const text of ["{broken", JSON.stringify({ schemaVersion: 7, operations: [] })]) {
		writeFileSync(path, text); expect(readContinuityOperations(root).status).toBe("failure");
		expect(transactContinuityOperations(root, "absent", () => [operation()]).ok).toBe(false);
		expect(readFileSync(path, "utf8")).toBe(text);
	}
});
test("busy locks and failures before or after publication retain their actual outcome", () => {
	const first = transactContinuityOperations(root, "absent", () => [operation()]); if (!first.ok) throw new Error(first.reason);
	const lock = join(root, ".ein/continuity-operations.json.lock"); writeFileSync(lock, "another owner");
	expect(transactContinuityOperations(root, first.journal.revision, () => []).ok).toBe(false); expect(readFileSync(lock, "utf8")).toBe("another owner"); rmSync(lock);
	expect(transactContinuityOperations(root, first.journal.revision, () => [], { beforePublish() { throw new Error("injected"); } })).toMatchObject({ ok: false, outcome: "not-published" });
	expect(readContinuityOperations(root)).toEqual({ status: "valid", journal: first.journal });
	expect(transactContinuityOperations(root, first.journal.revision, () => [], { afterPublish() { throw new Error("injected"); } })).toMatchObject({ ok: false, outcome: "published-unverified" });
	expect(readContinuityOperations(root)).toMatchObject({ status: "valid", journal: { operations: [] } });
});
test("symlinked directories or targets do not overwrite their destinations", () => {
	mkdirSync(join(root, "outside")); symlinkSync(join(root, "outside"), join(root, ".ein"));
	expect(transactContinuityOperations(root, "absent", () => [operation()]).ok).toBe(false);
	expect(existsSync(join(root, "outside/continuity-operations.json"))).toBe(false);
	rmSync(join(root, ".ein")); mkdirSync(join(root, ".ein")); const target = join(root, "precious"); writeFileSync(target, "keep");
	symlinkSync(target, join(root, ".ein/continuity-operations.json"));
	expect(transactContinuityOperations(root, "absent", () => [operation()]).ok).toBe(false); expect(readFileSync(target, "utf8")).toBe("keep");
});
test("tracked journals are refused without changing the index", () => {
	mkdirSync(join(root, ".ein")); writeFileSync(join(root, ".ein/continuity-operations.json"), JSON.stringify(buildOperationJournal([])));
	execFileSync("git", ["add", ".ein/continuity-operations.json"], { cwd: root });
	const index = readFileSync(join(root, ".git/index"));
	expect(transactContinuityOperations(root, "absent", () => [operation()])).toMatchObject({ ok: false, reason: "state-store-not-isolated" });
	expect(readFileSync(join(root, ".git/index"))).toEqual(index);
});
test("retention removes settled entries only and bounds active operations", () => {
	const active = Array.from({ length: 32 }, (_, i) => operation(i));
	const settled = Array.from({ length: 70 }, (_, i) => ({ ...operation(i + 100), status: "settled" as const, outcome: "succeeded" as const }));
	const retained = buildOperationJournal([...active, ...settled]);
	expect(retained.operations.filter((o) => o.status === "running")).toHaveLength(32);
	expect(retained.operations.filter((o) => o.status === "settled")).toHaveLength(64);
	expect(() => buildOperationJournal([...active, operation(33)])).toThrow("active-limit");
});
