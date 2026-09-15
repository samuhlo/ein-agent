import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compileClaudeSurface } from "../ein-cc/sync.ts";
import { runDeltaCommand } from "../ein-cc/sdd-cli/cli.ts";
import { writeOpenSpecDelta } from "../ein-pi/agent/lib/openspec-delta-write.ts";
import { parseOpenSpecDelta } from "../ein-pi/agent/lib/openspec-spec-parser.ts";
import { writeOpenSpecDelta as writeSharedOpenSpecDelta } from "../shared/sdd/openspec-delta-write.ts";

const OPERATION = {
	kind: "ADDED",
	scenario: {
		id: "claude-writes-delta",
		title: "Claude writes its own delta",
		requirement: "The system MUST let the Claude runtime write a behaviour delta from structured operations.",
		given: "an active change carrying a behaviour delta",
		when: "Claude invokes the delta command with structured operations",
		then: "the delta is validated with the strict grammar and written",
	},
};

const UNCHANGED_OPERATION = {
	kind: "ADDED",
	scenario: {
		id: "unrelated-scenario",
		title: "An unrelated scenario",
		requirement: "The system MUST preserve scenarios outside an authorized correction.",
		given: "a valid persisted delta contains another scenario",
		when: "one scenario is corrected",
		then: "the unrelated scenario remains unchanged",
	},
};

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

let cwd: string;

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "ein-delta-"));
	mkdirSync(join(cwd, "openspec", "changes", "probe"), { recursive: true });
});

afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

describe("OpenSpec delta writing is shared, not Pi-only", () => {
	test("Pi y Claude reciben el mismo escritor", () => {
		expect(writeOpenSpecDelta).toBe(writeSharedOpenSpecDelta);
	});
	test("structured operations become a delta that re-parses with the strict grammar", () => {
		const result = writeOpenSpecDelta({ cwd, change: "probe", domain: "scout-routing", operations: [OPERATION] });
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const written = readFileSync(result.path, "utf8");
		expect(parseOpenSpecDelta(written).ok).toBe(true);
		expect(written).toContain("domain: scout-routing");
		expect(result.changed).toBe(true);
	});

	test("an identical retry is idempotent without revision authority", () => {
		const first = writeOpenSpecDelta({ cwd, change: "probe", domain: "scout-routing", operations: [OPERATION] });
		expect(first.ok).toBe(true);
		const second = writeOpenSpecDelta({ cwd, change: "probe", domain: "scout-routing", operations: [OPERATION] });

		expect(second).toMatchObject({ ok: true, changed: false });
	});

	test("a concurrent writer lock fails closed without creating the delta", () => {
		const path = join(cwd, "openspec", "changes", "probe", "specs", "scout-routing", "spec.md");
		mkdirSync(`${path}.lock`, { recursive: true });

		const result = writeOpenSpecDelta({ cwd, change: "probe", domain: "scout-routing", operations: [OPERATION] });

		expect(result).toMatchObject({ ok: false, code: "write-locked" });
		expect(() => readFileSync(path, "utf8")).toThrow();
	});

	test("a bounded correction needs the current digest and preserves unrelated scenarios", () => {
		const initial = writeOpenSpecDelta({ cwd, change: "probe", domain: "scout-routing", operations: [OPERATION, UNCHANGED_OPERATION] });
		expect(initial.ok).toBe(true);
		if (!initial.ok) return;
		const before = readFileSync(initial.path, "utf8");
		const corrected = {
			...OPERATION,
			scenario: { ...OPERATION.scenario, requirement: "The system MUST let an explicit correction revise its affected scenario." },
		};

		const withoutRevision = writeOpenSpecDelta({ cwd, change: "probe", domain: "scout-routing", operations: [corrected, UNCHANGED_OPERATION] });
		expect(withoutRevision).toMatchObject({ ok: false, code: "revision-required" });
		expect(readFileSync(initial.path, "utf8")).toBe(before);

		const stale = writeOpenSpecDelta({
			cwd,
			change: "probe",
			domain: "scout-routing",
			operations: [corrected, UNCHANGED_OPERATION],
			revision: { expectedSha256: "0".repeat(64), scenarioIds: ["claude-writes-delta"] },
		});
		expect(stale).toMatchObject({ ok: false, code: "stale-delta" });
		expect(readFileSync(initial.path, "utf8")).toBe(before);

		const revised = writeOpenSpecDelta({
			cwd,
			change: "probe",
			domain: "scout-routing",
			operations: [corrected, UNCHANGED_OPERATION],
			revision: { expectedSha256: sha256(before), scenarioIds: ["claude-writes-delta"] },
		});
		expect(revised).toMatchObject({ ok: true, changed: true, revisedScenarioIds: ["claude-writes-delta"] });
		expect(readFileSync(initial.path, "utf8")).toContain(UNCHANGED_OPERATION.scenario.requirement);
	});

	test("a correction cannot alter a scenario outside its declared boundary", () => {
		const initial = writeOpenSpecDelta({ cwd, change: "probe", domain: "scout-routing", operations: [OPERATION, UNCHANGED_OPERATION] });
		expect(initial.ok).toBe(true);
		if (!initial.ok) return;
		const before = readFileSync(initial.path, "utf8");
		const changedBoth = [
			{ ...OPERATION, scenario: { ...OPERATION.scenario, title: "Corrected title" } },
			{ ...UNCHANGED_OPERATION, scenario: { ...UNCHANGED_OPERATION.scenario, title: "Unexpected edit" } },
		];
		const result = writeOpenSpecDelta({
			cwd,
			change: "probe",
			domain: "scout-routing",
			operations: changedBoth,
			revision: { expectedSha256: sha256(before), scenarioIds: ["claude-writes-delta"] },
		});

		expect(result).toMatchObject({ ok: false, code: "revision-out-of-scope" });
		expect(readFileSync(initial.path, "utf8")).toBe(before);
	});

	// Fail closed: un delta malformado se rechaza ANTES de tocar el disco, en vez
	// de reventar el sync en el cierre.
	test("a malformed requirement is refused and nothing is written", () => {
		const bad = { ...OPERATION, scenario: { ...OPERATION.scenario, requirement: "makes things better" } };
		const result = writeOpenSpecDelta({ cwd, change: "probe", domain: "scout-routing", operations: [bad] });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe("malformed");
		expect(() => readFileSync(join(cwd, "openspec", "changes", "probe", "specs", "scout-routing", "spec.md"))).toThrow();
	});

	test("an empty operation set and a bad domain are refused by code, not by grammar", () => {
		expect(writeOpenSpecDelta({ cwd, change: "probe", domain: "scout-routing", operations: [] }))
			.toMatchObject({ ok: false, code: "no-operations" });
		expect(writeOpenSpecDelta({ cwd, change: "probe", domain: "Scout Routing", operations: [OPERATION] }))
			.toMatchObject({ ok: false, code: "invalid-domain" });
	});

	test("the Claude command accepts both a bare array and an operations envelope", () => {
		const bare = runDeltaCommand(cwd, ["probe", "--domain", "scout-routing"], JSON.stringify([OPERATION]));
		expect(bare.exitCode).toBe(0);

		const wrapped = runDeltaCommand(cwd, ["probe", "--domain", "surface-wiring"], JSON.stringify({ operations: [OPERATION] }));
		expect(wrapped.exitCode).toBe(0);
	});

	test("the Claude command forwards bounded revision authority", () => {
		const first = runDeltaCommand(cwd, ["probe", "--domain", "scout-routing"], JSON.stringify([OPERATION, UNCHANGED_OPERATION]));
		expect(first.exitCode).toBe(0);
		const path = join(cwd, "openspec", "changes", "probe", "specs", "scout-routing", "spec.md");
		const before = readFileSync(path, "utf8");
		const corrected = { ...OPERATION, scenario: { ...OPERATION.scenario, title: "Corrected title" } };
		const result = runDeltaCommand(cwd, ["probe", "--domain", "scout-routing"], JSON.stringify({
			operations: [corrected, UNCHANGED_OPERATION],
			revision: { expectedSha256: sha256(before), scenarioIds: ["claude-writes-delta"] },
		}));

		expect(result.exitCode).toBe(0);
		expect(readFileSync(path, "utf8")).toContain("title: Corrected title");
	});

	test("invalid stdin fails loudly instead of writing an empty delta", () => {
		const result = runDeltaCommand(cwd, ["probe", "--domain", "scout-routing"], "not json");
		expect(result.exitCode).toBe(1);
		expect(result.text).toContain("not valid JSON");
	});
});

describe("a translated agent never names a command that does not exist", () => {
	// El fallo original: la traducción convertía `ein_openspec_delta_write` en la
	// prosa "the OpenSpec delta writer" — un nombre sin nada detrás. Este test
	// exige que todo `ein-cc-sdd <sub>` citado por un agente o por el
	// coordinador sea un subcomando real del CLI.
	test("every ein-cc-sdd subcommand cited in the compiled surface is dispatched", () => {
		const cli = readFileSync(join(import.meta.dir, "..", "ein-cc", "sdd-cli", "cli.ts"), "utf8");
		const dispatched = new Set(
			[...cli.matchAll(/^\t\tcase "([a-z-]+)":/gm)].map((match) => match[1]!),
		);
		expect(dispatched.size).toBeGreaterThan(0);

		const surface = compileClaudeSurface();
		const documents = [surface.coordinator, ...Object.values(surface.agents)];
		const cited = new Set<string>();
		for (const document of documents) {
			for (const match of document.matchAll(/ein-cc-sdd ([a-z-]+)/g)) cited.add(match[1]!);
		}

		expect(cited.has("delta")).toBe(true);
		expect([...cited].filter((command) => !dispatched.has(command)).sort()).toEqual([]);
	});
});
