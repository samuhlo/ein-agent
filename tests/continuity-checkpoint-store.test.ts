import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	clearContinuityCheckpoint,
	continuityCheckpointPath,
	readContinuityCheckpoint,
	writeContinuityCheckpoint,
	type ContinuityCheckpointLocation,
} from "../ein-pi/agent/lib/continuity-checkpoint-store.ts";
import { CONTINUITY_CHECKPOINT_LIMITS, parseContinuityCheckpoint, type ContinuityCheckpointV1 } from "../ein-pi/agent/lib/continuity-checkpoint.ts";

const roots: string[] = [];
const root = (): string => { const value = mkdtempSync(join(tmpdir(), "ein-continuity-store-")); roots.push(value); return value; };
afterEach(() => { for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true }); });

function checkpoint(patch: Partial<ContinuityCheckpointV1> = {}): ContinuityCheckpointV1 {
	const content = {
		version: 1 as const, mode: "adhoc" as const, change: null, stateRef: null,
		capturedAt: "2026-08-14T12:00:00Z", objective: "Preserve provider-neutral continuity.", completed: [],
		nextAction: "Read the checkpoint safely.", unresolvedDecisions: [], changedPaths: [],
		verification: { status: "not-run" as const, observedStateRef: null }, warnings: [], ...patch,
	};
	const { revision: ignored, ...unsigned } = content as typeof content & { revision?: string }; void ignored;
	return { ...unsigned, revision: `sha256:${createHash("sha256").update(JSON.stringify(unsigned)).digest("hex")}` };
}
function sdd(change = "safe-change"): ContinuityCheckpointV1 { return checkpoint({ mode: "sdd", change }); }
function canonicalBytes(value: ContinuityCheckpointV1): string { const parsed = parseContinuityCheckpoint(value); if (!parsed.ok) throw new Error("invalid fixture"); return `${JSON.stringify(parsed.checkpoint)}\n`; }
const absent = { kind: "absent" } as const;
const expected = (revision: string) => ({ kind: "revision", revision } as const);

describe("continuity checkpoint filesystem store", () => {
	test.each([
		[{ mode: "adhoc" }, [".ein", "continuity.json"]],
		[{ mode: "sdd", change: "safe-change" }, ["openspec", "changes", "safe-change", "continuity.json"]],
	] as const)("selects the canonical %o path", (location, parts) => {
		const cwd = root(); expect(continuityCheckpointPath(cwd, location)).toBe(join(cwd, ...parts));
	});

	test.each(["../escape", "a/b", "a\\b", ".", "bad\0change"])("rejects unsafe SDD change %p without disk mutation", (change) => {
		const cwd = root(), location = { mode: "sdd", change } as ContinuityCheckpointLocation;
		expect(readContinuityCheckpoint(cwd, location)).toEqual({ status: "failure", reason: "unsafe-request" });
		expect(writeContinuityCheckpoint(cwd, location, sdd(change), absent)).toMatchObject({ ok: false, outcome: "not-published", reason: "invalid" });
		expect(readdirSync(cwd)).toEqual([]);
	});

	test("distinguishes absence and rejects checkpoint/location mismatch before touching disk", () => {
		const cwd = root();
		expect(readContinuityCheckpoint(cwd, { mode: "adhoc" })).toEqual({ status: "absent" });
		expect(writeContinuityCheckpoint(cwd, { mode: "adhoc" }, sdd(), absent)).toEqual({ ok: false, outcome: "not-published", reason: "invalid" });
		expect(readdirSync(cwd)).toEqual([]);
	});

	test("treats throwing expectation and seam getters as invalid without touching disk", () => {
		const cwd = root(), throwing = Object.defineProperty({}, "kind", { enumerable: true, get: () => { throw new Error("getter"); } });
		expect(writeContinuityCheckpoint(cwd, { mode: "adhoc" }, checkpoint(), throwing as typeof absent)).toEqual({ ok: false, outcome: "not-published", reason: "invalid" });
		expect(readContinuityCheckpoint(cwd, Object.defineProperty({}, "mode", { enumerable: true, get: () => { throw new Error("getter"); } }) as ContinuityCheckpointLocation)).toEqual({ status: "failure", reason: "unsafe-request" });
		const seam = Object.defineProperty({}, "beforePublish", { enumerable: true, get: () => { throw new Error("getter"); } });
		expect(writeContinuityCheckpoint(cwd, { mode: "adhoc" }, checkpoint(), absent, seam)).toEqual({ ok: false, outcome: "not-published", reason: "invalid" });
		expect(readdirSync(cwd)).toEqual([]);
	});

	test("writes canonical private bytes, reads back, and overwrites only a matching revision", () => {
		const cwd = root(), location = { mode: "adhoc" } as const, first = checkpoint(), path = join(cwd, ".ein", "continuity.json");
		expect(writeContinuityCheckpoint(cwd, location, first, absent)).toEqual({ ok: true, outcome: "published-verified", revision: first.revision });
		expect(readContinuityCheckpoint(cwd, location)).toEqual({ status: "valid", checkpoint: first });
		expect(readFileSync(path, "utf8")).toBe(canonicalBytes(first));
		expect(statSync(path).mode & 0o777).toBe(0o600);
		const second = checkpoint({ objective: "Continue from the verified boundary." });
		expect(writeContinuityCheckpoint(cwd, location, second, expected(first.revision))).toMatchObject({ ok: true, revision: second.revision });
		expect(readFileSync(path, "utf8")).toBe(canonicalBytes(second));
	});

	test("CAS conflicts preserve prior bytes", () => {
		const cwd = root(), location = { mode: "adhoc" } as const, first = checkpoint(), second = checkpoint({ objective: "New objective." });
		writeContinuityCheckpoint(cwd, location, first, absent); const path = continuityCheckpointPath(cwd, location)!; const before = readFileSync(path);
		for (const expectation of [absent, expected(`sha256:${"f".repeat(64)}`)]) {
			expect(writeContinuityCheckpoint(cwd, location, second, expectation)).toEqual({ ok: false, outcome: "not-published", reason: "conflict" });
			expect(readFileSync(path)).toEqual(before);
		}
	});

	test.each(["malformed", "oversized", "symlink"] as const)("rejects a %s checkpoint", (kind) => {
		const cwd = root(), parent = join(cwd, ".ein"), path = join(parent, "continuity.json"); mkdirSync(parent);
		if (kind === "malformed") writeFileSync(path, "{bad");
		if (kind === "oversized") writeFileSync(path, "x".repeat(CONTINUITY_CHECKPOINT_LIMITS.maxSerializedBytes + 1));
		if (kind === "symlink") { const outside = join(cwd, "outside"); writeFileSync(outside, "private"); symlinkSync(outside, path); }
		const result = readContinuityCheckpoint(cwd, { mode: "adhoc" });
		expect(result).toMatchObject({ status: "failure", reason: kind === "symlink" ? "read-failure" : "invalid-content" });
		if (kind === "symlink") expect(readFileSync(join(cwd, "outside"), "utf8")).toBe("private");
	});

	test("rejects a FIFO without blocking where supported, with a portable special-file fallback", () => {
		const cwd = root(), parent = join(cwd, ".ein"), path = join(parent, "continuity.json"); mkdirSync(parent);
		const fifoSupported = process.platform !== "win32" && spawnSync("mkfifo", [path]).status === 0;
		if (!fifoSupported) mkdirSync(path);
		expect(readContinuityCheckpoint(cwd, { mode: "adhoc" })).toMatchObject({ status: "failure", reason: "invalid-content" });
	});

	test("lock contention fails busy, preserves bytes, and never removes another lock", () => {
		const cwd = root(), location = { mode: "adhoc" } as const, first = checkpoint(); writeContinuityCheckpoint(cwd, location, first, absent);
		const path = continuityCheckpointPath(cwd, location)!, before = readFileSync(path), lock = `${path}.lock`; writeFileSync(lock, "other", { mode: 0o600 });
		expect(writeContinuityCheckpoint(cwd, location, checkpoint({ objective: "Contender." }), expected(first.revision))).toEqual({ ok: false, outcome: "not-published", reason: "busy" });
		expect(readFileSync(path)).toEqual(before); expect(readFileSync(lock, "utf8")).toBe("other");
	});

	test("clear requires matching CAS and preserves unrelated siblings", () => {
		const cwd = root(), location = { mode: "adhoc" } as const, first = checkpoint(); writeContinuityCheckpoint(cwd, location, first, absent);
		const path = continuityCheckpointPath(cwd, location)!, sibling = join(cwd, ".ein", "sessions.json"); writeFileSync(sibling, "keep");
		expect(clearContinuityCheckpoint(cwd, location, expected(`sha256:${"e".repeat(64)}`))).toEqual({ ok: false, outcome: "not-published", reason: "conflict" });
		expect(existsSync(path)).toBe(true);
		expect(clearContinuityCheckpoint(cwd, location, expected(first.revision))).toEqual({ ok: true, outcome: "published-verified", revision: null });
		expect(readContinuityCheckpoint(cwd, location)).toEqual({ status: "absent" }); expect(readFileSync(sibling, "utf8")).toBe("keep");
		expect(clearContinuityCheckpoint(cwd, location, absent)).toEqual({ ok: false, outcome: "not-published", reason: "absent" });
	});

	test("a pre-publish fault preserves old bytes and cleans only owned artifacts", () => {
		const cwd = root(), location = { mode: "adhoc" } as const, first = checkpoint(); writeContinuityCheckpoint(cwd, location, first, absent);
		const path = continuityCheckpointPath(cwd, location)!, before = readFileSync(path);
		const result = writeContinuityCheckpoint(cwd, location, checkpoint({ objective: "Never published." }), expected(first.revision), { beforePublish: () => { throw new Error("fault"); } });
		expect(result).toEqual({ ok: false, outcome: "not-published", reason: "io" }); expect(readFileSync(path)).toEqual(before);
		expect(existsSync(`${path}.tmp`)).toBe(false); expect(existsSync(`${path}.lock`)).toBe(false);
	});

	test("parent replacement cannot escape root before publish", () => {
		const cwd = root(), outside = root(), location = { mode: "adhoc" } as const, first = checkpoint(); writeContinuityCheckpoint(cwd, location, first, absent);
		const parent = join(cwd, ".ein"), held = join(cwd, ".ein-held"), second = checkpoint({ objective: "Must remain contained." });
		const result = writeContinuityCheckpoint(cwd, location, second, expected(first.revision), { beforePublish: () => { renameSync(parent, held); symlinkSync(outside, parent, "dir"); } });
		expect(result).toEqual({ ok: false, outcome: "not-published", reason: "busy" }); expect(readdirSync(outside)).toEqual([]);
		expect(readFileSync(join(held, "continuity.json"), "utf8")).toBe(canonicalBytes(first));
	});

	test("clear refuses a replacement target after the publish seam", () => {
		const cwd = root(), location = { mode: "adhoc" } as const, first = checkpoint(); writeContinuityCheckpoint(cwd, location, first, absent);
		const path = continuityCheckpointPath(cwd, location)!;
		const result = clearContinuityCheckpoint(cwd, location, expected(first.revision), { beforePublish: () => { unlinkSync(path); writeFileSync(path, "replacement"); } });
		expect(result).toEqual({ ok: false, outcome: "not-published", reason: "conflict" }); expect(readFileSync(path, "utf8")).toBe("replacement");
	});

	test.each(["lock", "temp"] as const)("cleanup never unlinks a replacement %s inode", (kind) => {
		const cwd = root(), location = { mode: "adhoc" } as const, first = checkpoint(); writeContinuityCheckpoint(cwd, location, first, absent);
		const path = continuityCheckpointPath(cwd, location)!, suffix = kind === "temp" ? "tmp" : kind, replaced = `${path}.${suffix}`, marker = `replacement-${kind}`;
		const result = writeContinuityCheckpoint(cwd, location, checkpoint({ objective: `Replace ${kind}.` }), expected(first.revision), { beforePublish: () => { unlinkSync(replaced); writeFileSync(replaced, marker); } });
		expect(result).toMatchObject({ ok: false, outcome: "not-published" }); expect(readFileSync(path, "utf8")).toBe(canonicalBytes(first));
		const surviving = readdirSync(dirname(replaced)).filter((name) => name.startsWith(`continuity.json.${suffix}`)).map((name) => join(dirname(replaced), name));
		expect(surviving.some((candidate) => readFileSync(candidate, "utf8") === marker)).toBe(true);
	});

	test("a readback fault after rename reports published-unverified", () => {
		const cwd = root(), location = { mode: "adhoc" } as const, first = checkpoint(); writeContinuityCheckpoint(cwd, location, first, absent);
		const path = continuityCheckpointPath(cwd, location)!, second = checkpoint({ objective: "Published before readback failed." });
		const result = writeContinuityCheckpoint(cwd, location, second, expected(first.revision), { afterPublish: () => writeFileSync(path, "{fault") });
		expect(result).toEqual({ ok: false, outcome: "published-unverified", reason: "invalid" });
		expect(readFileSync(path, "utf8")).toBe("{fault"); expect(existsSync(`${path}.lock`)).toBe(false);
	});

	test("parent replacement after rename remains published-unverified and contained", () => {
		const cwd = root(), outside = root(), location = { mode: "adhoc" } as const, first = checkpoint(); writeContinuityCheckpoint(cwd, location, first, absent);
		const parent = join(cwd, ".ein"), held = join(cwd, ".ein-published"), second = checkpoint({ objective: "Published before parent changed." });
		const result = writeContinuityCheckpoint(cwd, location, second, expected(first.revision), { afterPublish: () => { renameSync(parent, held); symlinkSync(outside, parent, "dir"); } });
		expect(result).toEqual({ ok: false, outcome: "published-unverified", reason: "io" }); expect(readFileSync(join(held, "continuity.json"), "utf8")).toBe(canonicalBytes(second)); expect(readdirSync(outside)).toEqual([]);
	});

	test("target creation after clear reports published-unverified", () => {
		const cwd = root(), location = { mode: "adhoc" } as const, first = checkpoint(); writeContinuityCheckpoint(cwd, location, first, absent); const path = continuityCheckpointPath(cwd, location)!;
		const result = clearContinuityCheckpoint(cwd, location, expected(first.revision), { afterPublish: () => writeFileSync(path, "replacement") });
		expect(result).toEqual({ ok: false, outcome: "published-unverified", reason: "io" }); expect(readFileSync(path, "utf8")).toBe("replacement");
	});
});
