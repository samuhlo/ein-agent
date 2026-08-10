import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	MAX_LEDGER_BYTES,
	MAX_RECORDS,
	MAX_SELECTORS,
	areaPath,
	canonicalArea,
	evaluateReviewedArea,
	intersects,
	normalizeArea,
	parseLedger,
	serializeLedger,
	type Area,
	type EvidenceResolution,
	type GitChange,
	type GitTransition,
	type LedgerSnapshot,
} from "../ein-pi/agent/lib/reviewed-area-ledger";
import { evaluateWorkspaceLedger, REVIEWED_AREA_LEDGER_FILE, readWorkspaceLedger, replaceWorkspaceLedger } from "../ein-pi/agent/lib/reviewed-area-ledger-store";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { projectGitStateForReviewedArea, projectProjectState } from "../ein-pi/agent/lib/project-state";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REF_A = `git-v1:sha256:${"a".repeat(64)}`;
const REF_B = `git-v1:sha256:${"b".repeat(64)}`;
const EVIDENCE = {
	kind: "human-review" as const,
	reference: `review-evidence-v1:${"1".repeat(32)}`,
	digest: `sha256:${"2".repeat(64)}`,
	reviewerRef: `reviewer-v1:sha256:${"3".repeat(64)}`,
};

function area(...selectors: Array<{ kind: "file" | "tree"; path: string }>): Area {
	const result = normalizeArea({ selectors });
	if (!result) throw new Error("fixture area is invalid");
	return result;
}

function reviewed(a: Area, stateRef = REF_A): LedgerSnapshot {
	return {
		schemaVersion: 1,
		records: [{ area: a, status: "reviewed", evidence: EVIDENCE, git: { stateRef } }],
	};
}

function verified(a: Area, stateRef = REF_A): EvidenceResolution {
	return { status: "verified", ...EVIDENCE, areaId: a.id, stateRef };
}

// Deliberately out-of-contract input: `GitChange.kind` has no "unknown" member,
// but git output is untrusted and an unrecognized kind must not count as a hit.
// The test asserts runtime robustness the type system alone cannot express.
function outOfContractChange(kind: string, path: string): GitChange {
	return { kind, path } as unknown as GitChange;
}

function transition(changes: GitTransition["changes"], fromStateRef = REF_A, toStateRef = REF_B): GitTransition {
	return { fromStateRef, toStateRef, complete: true, changes };
}

function canonicalTemp(prefix: string): string {
	return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

describe("reviewed-area-ledger domain", () => {
	test("normalizes safe selectors, deterministic ordering, and area-v1 identity", () => {
		const first = normalizeArea({ selectors: [
			{ kind: "tree", path: "src" },
			{ kind: "file", path: "README.md" },
		] });
		const second = normalizeArea({ selectors: [
			{ kind: "file", path: "README.md" },
			{ kind: "tree", path: "src" },
		] });
		expect(first?.id).toBe(second?.id);
		expect(first?.selectors).toEqual([
			{ kind: "file", path: "README.md" },
			{ kind: "tree", path: "src" },
		]);
		expect(first?.id).toMatch(/^area-v1:sha256:[0-9a-f]{64}$/);
		expect(first?.id).toBe(canonicalArea(first!.selectors).id);
		expect(areaPath(first!, "src/lib/a.ts")).toBe(true);
	});

	test("persisted records require canonical IDs and never carry free-form labels", () => {
		const a = area({ kind: "tree", path: "src" });
		const base = { schemaVersion: 1, records: [{ area: { id: a.id, selectors: a.selectors }, status: "unreviewed" }] };
		const missingId = { schemaVersion: 1, records: [{ area: { selectors: a.selectors }, status: "unreviewed" }] };
		const mismatchedId = { schemaVersion: 1, records: [{ area: { id: `area-v1:sha256:${"f".repeat(64)}`, selectors: a.selectors }, status: "unreviewed" }] };
		expect(parseLedger(`${JSON.stringify(missingId)}\n`)).toMatchObject({ status: "invalid", reason: "malformed-ledger" });
		expect(parseLedger(`${JSON.stringify(mismatchedId)}\n`)).toMatchObject({ status: "invalid", reason: "malformed-ledger" });
		expect(() => serializeLedger({ ...base, records: [{ area: { selectors: a.selectors }, status: "unreviewed" }] })).toThrow("malformed-ledger");
		for (const label of [
			"/Users/private/project.ts",
			"prompt: review this private path",
			"transcript: user message and response",
			"secret=do-not-persist",
			"Reviewer Name",
		]) {
			const labeled = { schemaVersion: 1, records: [{ area: { id: a.id, selectors: a.selectors, label }, status: "unreviewed" }] };
			expect(parseLedger(`${JSON.stringify(labeled)}\n`)).toMatchObject({ status: "invalid", reason: "malformed-ledger" });
		}
	});

	test("rejects unsafe, duplicate, redundant, empty, and over-bounded areas", () => {
		for (const selectors of [
			[],
			[{ kind: "file", path: "../escape" }],
			[{ kind: "file", path: "/absolute" }],
			[{ kind: "file", path: "a\\b" }],
			[{ kind: "file", path: "a//b" }],
			[{ kind: "file", path: "a/./b" }],
			[{ kind: "file", path: "a/../b" }],
			[{ kind: "tree", path: "src" }, { kind: "file", path: "src/a.ts" }],
			[{ kind: "tree", path: "src" }, { kind: "tree", path: "src/lib" }],
			[{ kind: "file", path: "src/a.ts" }, { kind: "file", path: "src/a.ts" }],
			Array.from({ length: MAX_SELECTORS + 1 }, (_, index) => ({ kind: "file" as const, path: `f${index}` })),
		]) expect(normalizeArea({ selectors })).toBeNull();
		expect(normalizeArea({ selectors: [{ kind: "file", path: "a\u0000b" }] })).toBeNull();
		expect(normalizeArea({ selectors: [{ kind: "file", path: "é".repeat(300) }] })).toBeNull();
	});

	test("serializes canonically and rejects unknown fields, duplicates, malformed and future data", () => {
		const a = area({ kind: "tree", path: "src" });
		const bytes = serializeLedger(reviewed(a));
		expect(bytes).toBe(`${JSON.stringify({ schemaVersion: 1, records: [{ area: { id: a.id, selectors: [{ kind: "tree", path: "src" }] }, status: "reviewed", evidence: EVIDENCE, git: { stateRef: REF_A } }] })}\n`);
		expect(bytes.endsWith("\n")).toBe(true);
		expect(serializeLedger({ schemaVersion: 1, records: [{ area: a, status: "reviewed", evidence: EVIDENCE, git: { stateRef: REF_A } }] })).toBe(bytes);
		expect(parseLedger(bytes)).toMatchObject({ status: "valid" });
		expect(parseLedger('{"schemaVersion":1,"records":[]}\n').status).toBe("valid");
		expect(parseLedger('{"schemaVersion":2,"records":[]}\n')).toMatchObject({ status: "unavailable", reason: "unsupported-version" });
		expect(parseLedger('{"schemaVersion":1,"records":[],"extra":true}\n')).toMatchObject({ status: "invalid", reason: "malformed-ledger" });
		expect(parseLedger('{"schemaVersion":1,"records":[{"area":null,"status":"reviewed"}]}\n')).toMatchObject({ status: "invalid" });
		expect(parseLedger('{"schemaVersion":1,"records":[],"records":[]}\n')).toMatchObject({ status: "invalid" });
		expect(parseLedger("not json")).toMatchObject({ status: "invalid", reason: "malformed-ledger" });
	});

	test("intersects exact/tree selectors across Git change semantics", () => {
		const src = area({ kind: "tree", path: "src" });
		const exact = area({ kind: "file", path: "README.md" });
		expect(intersects(src, transition([{ kind: "modified", path: "src/a.ts" }]))).toBe(true);
		expect(intersects(src, transition([{ kind: "deleted", path: "src/a.ts" }]))).toBe(true);
		expect(intersects(src, transition([{ kind: "renamed", path: "docs/a.ts", previousPath: "src/a.ts" }]))).toBe(true);
		expect(intersects(exact, transition([{ kind: "copied", path: "docs/README.md", previousPath: "README.md" }]))).toBe(true);
		expect(intersects(src, transition([{ kind: "modified", path: "docs/a.ts" }]))).toBe(false);
		expect(intersects(src, transition([outOfContractChange("unknown", "src/a.ts")]))).toBe(false);
	});

	test("evaluates exact current, stale, unknown, unreviewed and fail-closed evidence", () => {
		const a = area({ kind: "tree", path: "src" });
		const current = { repository: true, complete: true, quality: "current" as const, stateRef: REF_A, dirty: true };
		expect(evaluateReviewedArea(reviewed(a), a.id, current, undefined, verified(a))).toMatchObject({ outcome: "reviewed", freshness: "current", reason: "exact-git-binding" });
		expect(evaluateReviewedArea({ schemaVersion: 1, records: [{ area: a, status: "unreviewed" }] }, a.id, current)).toMatchObject({ outcome: "unreviewed", reason: "explicit-unreviewed" });
		expect(evaluateReviewedArea(reviewed(a), a.id, { ...current, stateRef: REF_B }, transition([{ kind: "modified", path: "src/a.ts" }]), verified(a, REF_A))).toMatchObject({ outcome: "stale", reason: "relevant-git-change" });
		expect(evaluateReviewedArea(reviewed(a), a.id, { ...current, stateRef: REF_B }, transition([{ kind: "modified", path: "docs/a.ts" }]), verified(a, REF_A))).toMatchObject({ outcome: "unknown", reason: "binding-mismatch-unaffected" });
		expect(evaluateReviewedArea(reviewed(a), a.id, { ...current, stateRef: REF_B }, undefined, verified(a, REF_A))).toMatchObject({ outcome: "unknown", reason: "git-transition-unverifiable" });
		for (const evidence of [
			{ status: "missing" as const },
			{ status: "unavailable" as const },
		]) expect(evaluateReviewedArea(reviewed(a), a.id, current, undefined, evidence)).toMatchObject({ outcome: "unavailable" });
		expect(evaluateReviewedArea(reviewed(a), a.id, current, undefined, { status: "invalid" })).toMatchObject({ outcome: "invalid", reason: "invalid-evidence" });
		expect(evaluateReviewedArea(reviewed(a), a.id, current, undefined, { status: "mismatch" })).toMatchObject({ outcome: "unknown", reason: "evidence-mismatch" });
		expect(evaluateReviewedArea(reviewed(a), a.id, { ...current, complete: false }, undefined, verified(a))).toMatchObject({ outcome: "unavailable", reason: "git-state-unavailable" });
	});

	test("transition validation is fail-closed for rename/delete, unknown, overflow, and unsafe paths", () => {
		const a = area({ kind: "tree", path: "src" });
		const current = { repository: true, complete: true, quality: "current" as const, stateRef: REF_B, dirty: false };
		for (const change of [
			{ kind: "added" as const, path: "src/a.ts" },
			{ kind: "modified" as const, path: "src/a.ts" },
			{ kind: "type-changed" as const, path: "src/a.ts" },
			{ kind: "unmerged" as const, path: "src/a.ts" },
			{ kind: "untracked" as const, path: "src/a.ts" },
			{ kind: "deleted" as const, path: "src/a.ts", previousPath: "src/old.ts" },
		]) expect(intersects(a, transition([change]))).toBe(true);
		const badRename = transition([{ kind: "renamed", path: "src/new.ts" } as never]);
		const badPath = transition([{ kind: "modified", path: "../src/a.ts" } as never]);
		const contradictoryPreviousPath = transition([{ kind: "modified", path: "docs/a.ts", previousPath: "src/old.ts" } as never]);
		const overflowed = { ...transition([]), overflowed: true };
		for (const candidate of [badRename, badPath, overflowed]) {
			expect(intersects(a, candidate)).toBe(false);
			expect(evaluateReviewedArea(reviewed(a), a.id, current, candidate, verified(a))).toMatchObject({ outcome: "unknown", reason: "git-transition-unverifiable" });
		}
		expect(intersects(a, contradictoryPreviousPath)).toBe(false);
		expect(evaluateReviewedArea(reviewed(a), a.id, current, contradictoryPreviousPath, verified(a))).toMatchObject({ outcome: "unknown", reason: "git-transition-unverifiable" });
	});

	test("workspace evaluation consumes B/F inputs read-only and preserves unavailable authority", () => {
		const cwd = canonicalTemp("reviewed-area-ledger-eval-");
		const a = area({ kind: "tree", path: "src" });
		const current = { repository: true, complete: true, quality: "current" as const, stateRef: REF_A, dirty: false };
		expect(evaluateWorkspaceLedger(cwd, a.id, current)).toMatchObject({ outcome: "unreviewed", reason: "no-record" });
		mkdirSync(join(cwd, "openspec"), { recursive: true });
		writeFileSync(join(cwd, "openspec", REVIEWED_AREA_LEDGER_FILE), "{\"schemaVersion\":2,\"records\":[]}\n");
		expect(evaluateWorkspaceLedger(cwd, a.id, current)).toMatchObject({ outcome: "unavailable", reason: "unsupported-version" });
	});

	test("sessions and artifacts are not review evidence", () => {
		const a = area({ kind: "tree", path: "src" });
		const empty: LedgerSnapshot = { schemaVersion: 1, records: [] };
		const result = evaluateReviewedArea(empty, a.id, { repository: true, complete: true, quality: "current", stateRef: REF_A, dirty: false });
		expect(result).toMatchObject({ outcome: "unreviewed", reason: "no-record" });
		expect(Object.keys(result).some((key) => /approval|session|artifact|prompt|transcript/i.test(key))).toBe(false);
	});

	test("B projection is read-only and does not mislabel current changes as a historical transition", () => {
		const state = projectProjectState({ cwd: "/tmp/reviewed-area-ledger-no-repo" });
		const projection = projectGitStateForReviewedArea(state);
		expect(projection).not.toHaveProperty("changes");
		expect(Object.isFrozen(projection)).toBe(true);
	});

	test("evaluation output is repeatable, deeply immutable, and never includes evidence payloads", () => {
		const a = area({ kind: "file", path: "src/a.ts" });
		const result = evaluateReviewedArea(reviewed(a), a.id, { repository: true, complete: true, quality: "current", stateRef: REF_A, dirty: true }, undefined, verified(a));
		expect(result).toMatchObject({ outcome: "reviewed", observedStateRef: REF_A });
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.keys(result)).not.toContain("prompt");
		expect(evaluateReviewedArea(reviewed(a), a.id, { repository: true, complete: true, quality: "current", stateRef: REF_A, dirty: true }, undefined, verified(a))).toEqual(result);
	});

	test("workspace reader distinguishes absence and unsupported versions without repair", () => {
		const absent = canonicalTemp("reviewed-area-ledger-absent-");
		expect(readWorkspaceLedger(absent)).toMatchObject({ status: "absent" });
		const cwd = canonicalTemp("reviewed-area-ledger-future-");
		const openspec = join(cwd, "openspec");
		mkdirSync(openspec, { recursive: true });
		const path = join(openspec, REVIEWED_AREA_LEDGER_FILE);
		const future = "{\"schemaVersion\":2,\"records\":[]}\n";
		writeFileSync(path, future);
		expect(readWorkspaceLedger(cwd)).toMatchObject({ status: "unavailable", reason: "unsupported-version" });
		expect(readFileSync(path, "utf8")).toBe(future);
	});

	test("workspace reader is local, bounded, and read-only", () => {
		const cwd = canonicalTemp("reviewed-area-ledger-");
		const openspec = join(cwd, "openspec");
		mkdirSync(openspec, { recursive: true });
		const path = join(openspec, "reviewed-area-ledger.json");
		writeFileSync(path, "", { encoding: "utf8" });
		const before = readFileSync(path);
		expect(readWorkspaceLedger(cwd)).toMatchObject({ status: "invalid" });
		expect(readFileSync(path)).toEqual(before);
		writeFileSync(path, "{" + "x".repeat(MAX_LEDGER_BYTES) + "}");
		expect(readWorkspaceLedger(cwd)).toMatchObject({ status: "unavailable", reason: "oversized" });
		const first = readWorkspaceLedger(cwd);
		const second = readWorkspaceLedger(cwd);
		expect(second).toEqual(first);
		expect(existsSync(join(cwd, ".pi", "ein", "reviewed-area-ledger.json"))).toBe(false);
	});

	test("explicit writer requires B exclusion proof and compare-and-swap", () => {
		const cwd = canonicalTemp("reviewed-area-ledger-write-");
		const openspec = join(cwd, "openspec");
		mkdirSync(openspec, { recursive: true });
		const path = join(openspec, "reviewed-area-ledger.json");
		// The writer never creates or edits the B-owned ignore proof.
		writeFileSync(path, serializeLedger({ schemaVersion: 1, records: [] }));
		const a = area({ kind: "file", path: "src/a.ts" });
		const snapshot = reviewed(a);
		const before = readFileSync(path);
		expect(() => replaceWorkspaceLedger(cwd, snapshot, { expectedDigest: "sha256:" + "0".repeat(64), exclusionProof: { path, excluded: true, owner: "B" } })).toThrow();
		expect(readFileSync(path)).toEqual(before);
		const expectedDigest = `sha256:${createHash("sha256").update(before).digest("hex")}`;
		const result = replaceWorkspaceLedger(cwd, snapshot, { expectedDigest, exclusionProof: { path, excluded: true, owner: "B" } });
		expect(result.status).toBe("written");
		expect(readFileSync(path).toString()).toBe(serializeLedger(snapshot));
		expect(readdirSync(openspec).filter((name) => name.includes(".tmp"))).toEqual([]);
		writeFileSync(path, "{malformed");
		const corrupt = readFileSync(path);
		const corruptDigest = `sha256:${createHash("sha256").update(corrupt).digest("hex")}`;
		expect(() => replaceWorkspaceLedger(cwd, snapshot, { expectedDigest: corruptDigest, exclusionProof: { path, excluded: true, owner: "B" } })).toThrow("malformed-ledger");
		expect(readFileSync(path)).toEqual(corrupt);
		writeFileSync(path, serializeLedger(snapshot));
		const prior = readFileSync(path);
		expect(() => replaceWorkspaceLedger(cwd, snapshot, { expectedDigest: `sha256:${"f".repeat(64)}`, exclusionProof: { path, excluded: true, owner: "B" } })).toThrow("precondition-failed");
		expect(readFileSync(path)).toEqual(prior);
	});

	test("a workspace ledger symlink is unavailable and never follows global-looking paths", () => {
		const cwd = canonicalTemp("reviewed-area-ledger-link-");
		const other = canonicalTemp("reviewed-area-ledger-other-");
		mkdirSync(join(cwd, "openspec"), { recursive: true });
		mkdirSync(join(other, "openspec"), { recursive: true });
		writeFileSync(join(other, "openspec", REVIEWED_AREA_LEDGER_FILE), "{\"schemaVersion\":1,\"records\":[]}\n");
		symlinkSync(join(other, "openspec", REVIEWED_AREA_LEDGER_FILE), join(cwd, "openspec", REVIEWED_AREA_LEDGER_FILE));
		expect(readWorkspaceLedger(cwd)).toMatchObject({ status: "unavailable", reason: "unreadable" });

		const linkedCwd = canonicalTemp("reviewed-area-ledger-parent-link-");
		const linkedOther = canonicalTemp("reviewed-area-ledger-parent-other-");
		const externalPath = join(linkedOther, "openspec", REVIEWED_AREA_LEDGER_FILE);
		mkdirSync(join(linkedOther, "openspec"), { recursive: true });
		const externalBytes = serializeLedger({ schemaVersion: 1, records: [] });
		writeFileSync(externalPath, externalBytes);
		symlinkSync(join(linkedOther, "openspec"), join(linkedCwd, "openspec"));
		expect(readWorkspaceLedger(linkedCwd)).toMatchObject({ status: "unavailable", reason: "unreadable" });
		const linkedArea = area({ kind: "file", path: "src/a.ts" });
		expect(() => replaceWorkspaceLedger(linkedCwd, reviewed(linkedArea), {
			expectedDigest: `sha256:${createHash("sha256").update(externalBytes).digest("hex")}`,
			exclusionProof: { path: join(linkedCwd, "openspec", REVIEWED_AREA_LEDGER_FILE), excluded: true, owner: "B" },
		})).toThrow();
		expect(readFileSync(externalPath)).toEqual(Buffer.from(externalBytes));
	});

	test("the explicit writer owns only its temp and aborts target or temp races", () => {
		const cwd = canonicalTemp("reviewed-area-ledger-race-");
		const openspec = join(cwd, "openspec");
		mkdirSync(openspec, { recursive: true });
		const path = join(openspec, REVIEWED_AREA_LEDGER_FILE);
		const empty = serializeLedger({ schemaVersion: 1, records: [] });
		writeFileSync(path, empty);
		const a = area({ kind: "file", path: "src/a.ts" });
		const options = { expectedDigest: `sha256:${createHash("sha256").update(empty).digest("hex")}`, exclusionProof: { path, excluded: true as const, owner: "B" as const } };
		const collisionTemp = join(openspec, `.${REVIEWED_AREA_LEDGER_FILE}.${process.pid}.collision.tmp`);
		const competitorTemp = Buffer.from("competitor-temp");
		writeFileSync(collisionTemp, competitorTemp);
		expect(() => replaceWorkspaceLedger(cwd, reviewed(a), options, { temporaryName: "collision" })).toThrow();
		expect(readFileSync(collisionTemp)).toEqual(competitorTemp);
		unlinkSync(collisionTemp);

		const replacedTemp = join(openspec, `.${REVIEWED_AREA_LEDGER_FILE}.${process.pid}.temp-race.tmp`);
		const replacedTempBytes = Buffer.from("replacement-temp");
		expect(() => replaceWorkspaceLedger(cwd, reviewed(a), options, {
			temporaryName: "temp-race",
			beforeFinalCheck: (temporaryPath) => {
				unlinkSync(temporaryPath);
				writeFileSync(temporaryPath, replacedTempBytes);
			},
		})).toThrow();
		expect(readFileSync(replacedTemp)).toEqual(replacedTempBytes);
		unlinkSync(replacedTemp);

		const competitor = serializeLedger(reviewed(area({ kind: "file", path: "docs/changed.ts" })));
		expect(() => replaceWorkspaceLedger(cwd, reviewed(a), options, {
			temporaryName: "target-race",
			beforeFinalCheck: () => writeFileSync(path, competitor),
		})).toThrow("precondition-failed");
		expect(readFileSync(path, "utf8")).toBe(competitor);
		expect(readdirSync(openspec).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	test("fails closed for a workspace under a symlinked ancestor without touching the external ledger", () => {
		const externalRoot = canonicalTemp("reviewed-area-ledger-external-root-");
		const externalWorkspace = join(externalRoot, "workspace");
		const externalOpenspec = join(externalWorkspace, "openspec");
		mkdirSync(externalOpenspec, { recursive: true });
		const externalPath = join(externalOpenspec, REVIEWED_AREA_LEDGER_FILE);
		const externalBytes = Buffer.from(serializeLedger({ schemaVersion: 1, records: [] }));
		writeFileSync(externalPath, externalBytes);

		const logicalRoot = canonicalTemp("reviewed-area-ledger-logical-root-");
		const linkedAncestor = join(logicalRoot, "linked-ancestor");
		symlinkSync(externalRoot, linkedAncestor);
		const logicalWorkspace = join(linkedAncestor, "workspace");
		const logicalLedgerPath = join(logicalWorkspace, "openspec", REVIEWED_AREA_LEDGER_FILE);
		const areaInLogicalWorkspace = area({ kind: "file", path: "src/a.ts" });
		const externalDigest = `sha256:${createHash("sha256").update(externalBytes).digest("hex")}`;

		expect(readWorkspaceLedger(logicalWorkspace)).toMatchObject({ status: "unavailable", reason: "unreadable" });
		expect(() => replaceWorkspaceLedger(logicalWorkspace, reviewed(areaInLogicalWorkspace), {
			expectedDigest: externalDigest,
			exclusionProof: { path: logicalLedgerPath, excluded: true, owner: "B" },
		})).toThrow("workspace-boundary");
		expect(readFileSync(externalPath)).toEqual(externalBytes);
		expect(readdirSync(externalOpenspec).filter((name) => name.endsWith(".tmp"))).toEqual([]);

		const missingLogicalWorkspace = join(linkedAncestor, "missing-workspace");
		expect(readWorkspaceLedger(missingLogicalWorkspace)).toMatchObject({ status: "unavailable", reason: "unreadable" });
		expect(() => replaceWorkspaceLedger(missingLogicalWorkspace, reviewed(areaInLogicalWorkspace), {
			expectedDigest: null,
			exclusionProof: {
				path: join(missingLogicalWorkspace, "openspec", REVIEWED_AREA_LEDGER_FILE),
				excluded: true,
				owner: "B",
			},
		})).toThrow("workspace-boundary");

		const canonicalWorkspace = canonicalTemp("reviewed-area-ledger-canonical-");
		expect(canonicalWorkspace).toBe(realpathSync(canonicalWorkspace));
		const canonicalOpenspec = join(canonicalWorkspace, "openspec");
		mkdirSync(canonicalOpenspec, { recursive: true });
		const canonicalPath = join(canonicalOpenspec, REVIEWED_AREA_LEDGER_FILE);
		expect(readWorkspaceLedger(canonicalWorkspace)).toMatchObject({ status: "absent" });
		replaceWorkspaceLedger(canonicalWorkspace, reviewed(areaInLogicalWorkspace), {
			expectedDigest: null,
			exclusionProof: { path: canonicalPath, excluded: true, owner: "B" },
		});
		expect(readWorkspaceLedger(canonicalWorkspace)).toMatchObject({ status: "valid" });
		expect(readdirSync(canonicalOpenspec).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});
});
