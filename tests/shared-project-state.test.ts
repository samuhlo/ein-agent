import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	PROJECT_STATE_SCHEMA_VERSION,
	projectProjectState,
	type ProjectStateQuality,
	type ProjectStateV1,
} from "../ein-pi/agent/lib/project-state";

const QUALITY_VALUES: readonly ProjectStateQuality[] = [
	"current",
	"absent",
	"incomplete",
	"ambiguous",
	"legacy",
	"stale",
	"unbound",
	"unavailable",
];

function ownKeys(value: unknown): string[] {
	if (value === null || typeof value !== "object") return [];
	return Object.keys(value).flatMap((key) => [key, ...ownKeys((value as Record<string, unknown>)[key])]);
}

describe("projectProjectState contract", () => {
	test("schema version and required source sections are stable", () => {
		const state: ProjectStateV1 = projectProjectState({ cwd: "/tmp/example-project" });

		expect(PROJECT_STATE_SCHEMA_VERSION).toBe(1);
		expect(state.schemaVersion).toBe(1);
		expect(state.identity).toBeDefined();
		expect(state.openspec).toBeDefined();
		expect(state.ein).toBeDefined();
		expect(state.git).toBeDefined();
		expect(state.verification).toBeDefined();
		expect(state.runtimes).toBeDefined();
		expect(state.runtimes.pi).toBeDefined();
		expect(state.runtimes.claude).toBeDefined();
	});

	test("source quality uses only the closed vocabulary", () => {
		const state = projectProjectState({ cwd: "/tmp/example-project" });
		const sources = [state.identity, state.openspec, state.ein, state.git, state.verification];

		for (const source of sources) {
			expect(QUALITY_VALUES).toContain(source.quality);
			expect(typeof source.reason).toBe("string");
		}
	});

	test("runtime shape defaults to deterministic not-provided entries", () => {
		const state = projectProjectState({ cwd: "/tmp/example-project" });

		for (const provider of ["pi", "claude"] as const) {
			expect(state.runtimes[provider]).toEqual({
				provider,
				availability: "not-provided",
				quality: "absent",
				reason: "not-provided",
				capabilities: [],
				references: [],
				errors: [],
			});
		}
	});

	test("public state has no private session or execution surfaces", () => {
		const state = projectProjectState({ cwd: "/tmp/example-project" });
		const forbidden = /^(?:command|commands|persistence|persist|session|transcript|messages?)$/i;

		expect(ownKeys(state).filter((key) => forbidden.test(key))).toEqual([]);
	});

	test("runtime metadata normalizes capabilities and opaque references", () => {
		const state = projectProjectState({
			cwd: "/tmp/example-project",
			runtime: {
				pi: {
					availability: "available",
					quality: "current",
					reason: "read-success",
					capabilities: ["resume", "models", "models"],
					references: ["pi-public:opaque-2", "pi-public:opaque-1", "pi-public:opaque-2"],
					errors: [{ code: "read-error", detail: "provider unavailable" }],
				},
				claude: {
					availability: "unavailable",
					quality: "unavailable",
					reason: "command-error",
					errors: [{ code: "command-error" }],
				},
			},
		});

		expect(state.runtimes.pi).toEqual({
			provider: "pi",
			availability: "available",
			quality: "current",
			reason: "read-success",
			capabilities: ["models", "resume"],
			references: ["pi-public:opaque-1", "pi-public:opaque-2"],
			errors: [{ code: "read-error", detail: "provider unavailable" }],
		});
		expect(state.runtimes.claude).toEqual({
			provider: "claude",
			availability: "unavailable",
			quality: "unavailable",
			reason: "command-error",
			capabilities: [],
			references: [],
			errors: [{ code: "command-error" }],
		});
	});

	test("runtime metadata omits private paths, content, and execution fields", () => {
		const state = projectProjectState({
			cwd: "/tmp/example-project",
			runtime: {
				pi: {
					capabilities: ["models", "prompt:read"],
					references: [
						"pi-public:opaque-1",
						"/private/pi/sessions/secret.json",
						"transcript: secret conversation",
					],
					errors: [
						{ code: "read-error", detail: "provider unavailable" },
						{ code: "read-error", detail: "/private/pi/sessions/secret.json" },
					],
					commands: ["cat /private/pi/sessions/secret.json"],
					prompt: "private prompt",
					transcript: "private transcript",
					session: { path: "/private/pi/sessions/secret.json" },
				} as any,
			},
		});
		const serialized = JSON.stringify(state.runtimes.pi);

		expect(state.runtimes.pi.capabilities).toEqual(["models"]);
		expect(state.runtimes.pi.references).toEqual(["pi-public:opaque-1"]);
		expect(state.runtimes.pi.errors).toEqual([
			{ code: "read-error", detail: "provider unavailable" },
			{ code: "read-error" },
		]);
		expect(serialized).not.toContain("/private/pi/sessions/secret.json");
		expect(serialized).not.toContain("private prompt");
		expect(serialized).not.toContain("private transcript");
		expect(ownKeys(state.runtimes.pi).filter((key) => /^(?:commands?|prompt|transcript|session)$/i.test(key))).toEqual([]);
	});

	test("runtime metadata keeps not-provided defaults for omitted fields", () => {
		const state = projectProjectState({
			cwd: "/tmp/example-project",
			runtime: { pi: { capabilities: ["models"] } },
		});

		expect(state.runtimes.pi).toEqual({
			provider: "pi",
			availability: "not-provided",
			quality: "absent",
			reason: "not-provided",
			capabilities: ["models"],
			references: [],
			errors: [],
		});
		expect(state.runtimes.claude.availability).toBe("not-provided");
	});

	test("runtime metadata stays deterministic and provider-scoped", () => {
		const runtime = {
			claude: {
				availability: "available" as const,
				capabilities: ["zeta", " session.read ", "alpha", "zeta", "message:read"],
				references: ["claude-public:opaque-2", "claude-public:opaque-1"],
				errors: [{ code: "read-success" as const, detail: "provider ready" }],
			},
		};
		const before = structuredClone(runtime);
		const first = projectProjectState({ cwd: "/tmp/example-project", runtime });
		const second = projectProjectState({ cwd: "/tmp/example-project", runtime });

		expect(first.runtimes).toEqual(second.runtimes);
		expect(first.runtimes.pi.availability).toBe("not-provided");
		expect(first.runtimes.claude).toMatchObject({
			provider: "claude",
			availability: "available",
			quality: "absent",
			reason: "not-provided",
			capabilities: ["alpha", "session.read", "zeta"],
			references: ["claude-public:opaque-1", "claude-public:opaque-2"],
			errors: [{ code: "read-success", detail: "provider ready" }],
		});
		expect(runtime).toEqual(before);
	});

	test("contract output is deterministic and request-scoped", () => {
		const request = { cwd: "/tmp/example-project" } as const;
		const first = projectProjectState(request);
		const second = projectProjectState(request);
		const other = projectProjectState({ cwd: "/tmp/other-project" });

		expect(first).toEqual(second);
		expect(first.identity.cwd).toBe(request.cwd);
		expect(first.ein.path).toBe("/tmp/example-project/EIN.md");
		expect(other.identity.cwd).toBe("/tmp/other-project");
		expect(other.ein.path).toBe("/tmp/other-project/EIN.md");
	});
});

function git(cwd: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function temporaryRepository(): string {
	const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-git-"));
	git(cwd, ["init", "--quiet"]);
	git(cwd, ["config", "user.email", "ein-tests@example.invalid"]);
	git(cwd, ["config", "user.name", "Ein Tests"]);
	return cwd;
}

function commitFile(cwd: string, file: string, content: string): void {
	writeFileSync(join(cwd, file), content);
	git(cwd, ["add", "--", file]);
	git(cwd, ["commit", "--quiet", "-m", `commit ${file}`]);
}

function withRepository(run: (cwd: string) => void): void {
	const cwd = temporaryRepository();
	try {
		run(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function writeVerificationFixture(cwd: string, change = "verification-change", deliveredFile?: string): string {
	const changePath = join(cwd, "openspec", "changes", change);
	mkdirSync(changePath, { recursive: true });
	writeFileSync(
		join(changePath, "scope.md"),
		"# Scope\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: no delta needed\n",
	);
	writeFileSync(join(changePath, "map.md"), "# Map\n");
	writeFileSync(join(changePath, "design.md"), "# Design\n");
	const delivered = deliveredFile ? `\nEdita ${deliveredFile}.\n` : "";
	writeFileSync(
		join(changePath, "tasks.md"),
		`status: ready\nblocked_by: none\n- [x] 4 verification\n${delivered}`,
	);
	writeFileSync(join(changePath, "apply-progress.md"), "status: complete\n");
	if (deliveredFile) {
		mkdirSync(join(cwd, deliveredFile, ".."), { recursive: true });
		writeFileSync(join(cwd, deliveredFile), "delivered\n");
	}
	writeFileSync(join(cwd, ".gitignore"), `openspec/changes/${change}/verify-report.md\n`);
	return join(changePath, "verify-report.md");
}

function commitVerificationFixture(cwd: string, change = "verification-change", deliveredFile?: string): string {
	const reportPath = writeVerificationFixture(cwd, change, deliveredFile);
	git(cwd, ["add", "--all"]);
	git(cwd, ["commit", "--quiet", "-m", "verification fixture"]);
	return reportPath;
}

describe("OpenSpec active projection", () => {
	test("OpenSpec absent state is done without an active change", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-openspec-"));
		try {
			const state = projectProjectState({ cwd });
			expect(state.openspec).toMatchObject({
				quality: "absent",
				reason: "not-found",
				activeChanges: [],
				selection: "none",
				provenance: "none",
				next: "done",
				verify: "absent",
				verifyStale: false,
			});
			expect(state.openspec.selectedChange).toBeUndefined();
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("invalid OpenSpec changes root is unavailable and never done", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-invalid-openspec-"));
		try {
			mkdirSync(join(cwd, "openspec"), { recursive: true });
			writeFileSync(join(cwd, "openspec", "changes"), "not a directory\n");

			const state = projectProjectState({ cwd });
			expect(state.openspec).toMatchObject({
				quality: "unavailable",
				reason: "invalid-source",
				activeChanges: [],
				selection: "none",
				provenance: "none",
				verify: "absent",
				verifyStale: false,
			});
			expect(state.openspec.next).toBeUndefined();
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("OpenSpec unique active change composes phase, next, artifacts, blockers, and router verify", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-openspec-"));
		try {
			const changePath = join(cwd, "openspec", "changes", "unique-change");
			mkdirSync(changePath, { recursive: true });
			writeFileSync(join(changePath, "scope.md"), "# Scope\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: no delta needed\n");
			writeFileSync(join(changePath, "map.md"), "# Map\n");
			writeFileSync(join(changePath, "design.md"), "# Design\n");
			writeFileSync(join(changePath, "tasks.md"), "status: ready\nblocked_by: none\n- [x] 1 done\n");
			writeFileSync(join(changePath, "apply-progress.md"), "status: complete\n");
			writeFileSync(join(changePath, "verify-report.md"), "status: pass\n");

			const state = projectProjectState({ cwd });
			expect(state.openspec).toMatchObject({
				quality: "current",
				activeChanges: ["unique-change"],
				selection: "selected",
				selectedChange: "unique-change",
				phase: "close",
				next: "close",
				provenance: "canonical",
				verify: "pass",
				verifyStale: false,
			});
			expect(state.openspec.artifacts).toEqual([
				{ phase: "scope", file: "scope.md", present: true },
				{ phase: "map", file: "map.md", present: true },
				{ phase: "design", file: "design.md", present: true },
				{ phase: "tasks", file: "tasks.md", present: true },
				{ phase: "apply", file: "apply-progress.md", present: true },
				{ phase: "verify", file: "verify-report.md", present: true },
				{ phase: "close", file: "summary.md", present: false },
			]);
			expect(state.openspec.blockers).toEqual([]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("OpenSpec active ambiguity preserves candidates and never guesses alphabetical intent", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-openspec-"));
		try {
			for (const name of ["zeta-change", "alpha-change"]) {
				mkdirSync(join(cwd, "openspec", "changes", name), { recursive: true });
			}
			const ambiguous = projectProjectState({ cwd });
			expect(ambiguous.openspec).toMatchObject({
				quality: "ambiguous",
				reason: "ambiguous-selection",
				activeChanges: ["alpha-change", "zeta-change"],
				selection: "ambiguous",
				provenance: "none",
			});
			expect(ambiguous.openspec.selectedChange).toBeUndefined();
			expect(ambiguous.openspec.phase).toBeUndefined();
			expect(ambiguous.openspec.next).toBeUndefined();

			const selected = projectProjectState({ cwd, selectedChange: "zeta-change" });
			expect(selected.openspec.selection).toBe("selected");
			expect(selected.openspec.selectedChange).toBe("zeta-change");
			expect(selected.openspec.phase).toBe("scope");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("OpenSpec legacy provenance remains explicit while canonical provenance is current", () => {
		const canonicalCwd = mkdtempSync(join(tmpdir(), "ein-project-state-openspec-"));
		const legacyCwd = mkdtempSync(join(tmpdir(), "ein-project-state-legacy-"));
		try {
			mkdirSync(join(canonicalCwd, "openspec", "changes", "canonical-change"), { recursive: true });
			mkdirSync(join(legacyCwd, ".sdd", "changes", "legacy-change"), { recursive: true });
			expect(projectProjectState({ cwd: canonicalCwd }).openspec.provenance).toBe("canonical");
			const legacy = projectProjectState({ cwd: legacyCwd }).openspec;
			expect(legacy).toMatchObject({
				quality: "legacy",
				reason: "legacy-source",
				activeChanges: ["legacy-change"],
				selection: "selected",
				selectedChange: "legacy-change",
				provenance: "legacy",
			});
		} finally {
			rmSync(canonicalCwd, { recursive: true, force: true });
			rmSync(legacyCwd, { recursive: true, force: true });
		}
	});

	test("OpenSpec provenance blockers remain visible for unresolved canonical state", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-provenance-"));
		try {
			const changePath = join(cwd, "openspec", "changes", "blocked-change");
			mkdirSync(changePath, { recursive: true });
			writeFileSync(join(changePath, "scope.md"), "# Scope\n");
			const state = projectProjectState({ cwd });
			expect(state.openspec).toMatchObject({
				quality: "incomplete",
				reason: "incomplete-source",
				provenance: "canonical",
				selectedChange: "blocked-change",
				next: "scope",
			});
			expect(state.openspec.blockers.some((blocker) => blocker.includes("OpenSpec"))).toBe(true);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("EIN context projection", () => {
	test("EIN absent context is explicit", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-ein-"));
		try {
			const state = projectProjectState({ cwd });
			expect(state.ein).toMatchObject({
				quality: "absent",
				reason: "not-found",
				path: join(cwd, "EIN.md"),
				curated: { present: false, complete: false },
				auto: { present: false },
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("EIN incomplete context preserves revision and curated/AUTO boundaries", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-ein-"));
		try {
			const content = [
				"# EIN.md",
				"<!-- ein:init rev=abc123 generado=2026-01-01 -->",
				"## Overview",
				"_(pendiente)_",
				"<!-- ein:auto:start — generado por /ein:init, no editar a mano -->",
				"## Commands",
				"_No detectados automáticamente._",
				"<!-- ein:auto:end -->",
			].join("\n");
			writeFileSync(join(cwd, "EIN.md"), content);
			const state = projectProjectState({ cwd });
			expect(state.ein).toMatchObject({
				quality: "incomplete",
				reason: "incomplete-source",
				revision: "abc123",
				curated: { present: true, complete: false },
				auto: { present: true },
			});
			expect(readFileSync(join(cwd, "EIN.md"), "utf8")).toBe(content);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("EIN current context is read-only and preserves revision metadata", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-ein-"));
		try {
			const content = [
				"# EIN.md",
				"<!-- ein:init rev=def456 generado=2026-01-01 -->",
				"## Overview",
				"A project context kept by the team.",
				"<!-- ein:auto:start — generado por /ein:init, no editar a mano -->",
				"## Commands",
				"_No detectados automáticamente._",
				"<!-- ein:auto:end -->",
			].join("\n");
			writeFileSync(join(cwd, "EIN.md"), content);
			const state = projectProjectState({ cwd });
			expect(state.ein).toMatchObject({
				quality: "current",
				reason: "read-success",
				revision: "def456",
				curated: { present: true, complete: true },
				auto: { present: true },
			});
			expect(readFileSync(join(cwd, "EIN.md"), "utf8")).toBe(content);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("EIN malformed AUTO context remains incomplete without rewriting bytes", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-ein-"));
		try {
			const content = "# EIN.md\n## Overview\nUseful context\n<!-- ein:auto:start -->\n";
			writeFileSync(join(cwd, "EIN.md"), content);
			const state = projectProjectState({ cwd });
			expect(state.ein).toMatchObject({
				quality: "incomplete",
				reason: "incomplete-source",
				curated: { present: true, complete: true },
				auto: { present: false },
			});
			expect(readFileSync(join(cwd, "EIN.md"), "utf8")).toBe(content);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("EIN unavailable context is distinguished from absent", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-ein-"));
		try {
			mkdirSync(join(cwd, "EIN.md"));
			const state = projectProjectState({ cwd });
			expect(state.ein.quality).toBe("unavailable");
			expect(state.ein.reason).toBe("read-error");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("verification freshness and source degradation", () => {
	test("verification bound pass is fresh only with exact complete Git binding", () => {
		withRepository((cwd) => {
			const reportPath = commitVerificationFixture(cwd);
			const currentRef = projectProjectState({ cwd }).git.stateRef!;
			writeFileSync(reportPath, `status: pass\nproject_state_git_ref: ${currentRef}\n`);

			const state = projectProjectState({ cwd });
			expect(state.openspec.verify).toBe("pass");
			expect(state.openspec.verifyStale).toBe(false);
			expect(state.verification).toMatchObject({
				quality: "current",
				reason: "read-success",
				reportedOutcome: "pass",
				effectiveOutcome: "pass",
				freshness: "current",
				currentStateRef: currentRef,
				observedStateRef: currentRef,
			});
		});
	});

	test("verification legacy pass remains explicitly unbound", () => {
		withRepository((cwd) => {
			const reportPath = commitVerificationFixture(cwd);
			writeFileSync(reportPath, "status: pass\n");

			const state = projectProjectState({ cwd });
			expect(state.verification).toMatchObject({
				quality: "unbound",
				reason: "legacy-source",
				reportedOutcome: "pass",
				effectiveOutcome: "unknown",
				freshness: "unbound",
				currentStateRef: state.git.stateRef,
			});
			expect(state.verification.observedStateRef).toBeUndefined();
		});
	});

	test("verification mismatch is stale and exposes observed and current references", () => {
		withRepository((cwd) => {
			const reportPath = commitVerificationFixture(cwd);
			const currentRef = projectProjectState({ cwd }).git.stateRef!;
			const observedRef = `git-v1:sha256:${"0".repeat(64)}`;
			writeFileSync(reportPath, `status: pass\nproject_state_git_ref: ${observedRef}\n`);

			const state = projectProjectState({ cwd });
			expect(state.verification).toMatchObject({
				quality: "stale",
				reason: "state-mismatch",
				reportedOutcome: "pass",
				effectiveOutcome: "unknown",
				freshness: "stale",
				currentStateRef: currentRef,
				observedStateRef: observedRef,
			});
		});
	});

	test("verification router staleness stays stale despite a matching binding", () => {
		withRepository((cwd) => {
			const deliveredFile = "src/delivered.ts";
			const reportPath = commitVerificationFixture(cwd, "stale-verification", deliveredFile);
			const currentRef = projectProjectState({ cwd }).git.stateRef!;
			writeFileSync(reportPath, `status: pass\nproject_state_git_ref: ${currentRef}\n`);
			utimesSync(reportPath, new Date(2_000_000), new Date(2_000_000));
			utimesSync(join(cwd, deliveredFile), new Date(3_000_000), new Date(3_000_000));

			const state = projectProjectState({ cwd });
			expect(state.openspec.verifyStale).toBe(true);
			expect(state.verification).toMatchObject({
				quality: "stale",
				reason: "stale-source",
				reportedOutcome: "pass",
				effectiveOutcome: "pass",
				freshness: "stale",
				currentStateRef: currentRef,
				observedStateRef: currentRef,
			});
		});
	});

	test("verification absent, failed, and malformed evidence remain explicit", () => {
		withRepository((cwd) => {
			const reportPath = commitVerificationFixture(cwd);
			const currentRef = projectProjectState({ cwd }).git.stateRef!;

			const absent = projectProjectState({ cwd }).verification;
			expect(absent).toMatchObject({
				quality: "absent",
				reason: "not-found",
				reportedOutcome: "absent",
				effectiveOutcome: "absent",
				freshness: "unavailable",
				currentStateRef: currentRef,
			});

			writeFileSync(reportPath, `status: fail\nproject_state_git_ref: ${currentRef}\n`);
			const failed = projectProjectState({ cwd }).verification;
			expect(failed).toMatchObject({
				quality: "incomplete",
				reason: "invalid-source",
				reportedOutcome: "fail",
				effectiveOutcome: "fail",
				freshness: "invalid",
				currentStateRef: currentRef,
				observedStateRef: currentRef,
			});

			writeFileSync(reportPath, `status: pass\nproject_state_git_ref: ${currentRef}\nproject_state_git_ref: ${currentRef}\n`);
			const malformed = projectProjectState({ cwd }).verification;
			expect(malformed).toMatchObject({
				quality: "incomplete",
				reason: "invalid-source",
				reportedOutcome: "pass",
				effectiveOutcome: "unknown",
				freshness: "invalid",
				currentStateRef: currentRef,
			});

			writeFileSync(reportPath, "not a verification report\n");
			const malformedStatus = projectProjectState({ cwd }).verification;
			expect(malformedStatus).toMatchObject({
				quality: "incomplete",
				reason: "invalid-source",
				reportedOutcome: "unknown",
				effectiveOutcome: "unknown",
				freshness: "invalid",
				currentStateRef: currentRef,
			});
		});
	});

	test("degradation keeps OpenSpec and EIN values when Git and verification are unavailable", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-degradation-"));
		try {
			const reportPath = writeVerificationFixture(cwd);
			const einContent = "# EIN.md\n## Overview\nStable project context.\n";
			writeFileSync(join(cwd, "EIN.md"), einContent);
			writeFileSync(reportPath, "status: pass\n");

			const state = projectProjectState({ cwd });
			expect(state.openspec.selection).toBe("selected");
			expect(state.ein.quality).toBe("current");
			expect(state.git).toMatchObject({
				repository: false,
				quality: "absent",
				reason: "not-a-repository",
				complete: true,
			});
			expect(state.verification).toMatchObject({
				quality: "unavailable",
				reason: "not-a-repository",
				reportedOutcome: "pass",
				effectiveOutcome: "unknown",
				freshness: "unavailable",
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("degradation blocks current verification when Git identity is incomplete", () => {
		withRepository((cwd) => {
			const reportPath = commitVerificationFixture(cwd);
			for (let index = 0; index < 257; index += 1) {
				writeFileSync(join(cwd, `untracked-${String(index).padStart(3, "0")}.txt`), "x");
			}
			writeFileSync(reportPath, `status: pass\nproject_state_git_ref: git-v1:sha256:${"a".repeat(64)}\n`);

			const state = projectProjectState({ cwd });
			expect(state.git).toMatchObject({ complete: false, quality: "incomplete" });
			expect(state.git.stateRef).toBeUndefined();
			expect(state.verification).toMatchObject({
				quality: "unavailable",
				reason: "incomplete-source",
				reportedOutcome: "pass",
				effectiveOutcome: "unknown",
				freshness: "unavailable",
			});
		});
	});

	test("degradation keeps Git and OpenSpec when EIN is unavailable, and keeps EIN when OpenSpec is absent", () => {
		withRepository((cwd) => {
			const reportPath = commitVerificationFixture(cwd);
			void reportPath;
			mkdirSync(join(cwd, "EIN.md"));
			const state = projectProjectState({ cwd });
			expect(state.git.quality).toBe("current");
			expect(state.openspec.selection).toBe("selected");
			expect(state.ein).toMatchObject({ quality: "unavailable", reason: "read-error" });
		});

		withRepository((cwd) => {
			const einContent = "# EIN.md\n## Overview\nIndependent context.\n";
			writeFileSync(join(cwd, "EIN.md"), einContent);
			git(cwd, ["add", "--", "EIN.md"]);
			git(cwd, ["commit", "--quiet", "-m", "EIN fixture"]);
			const state = projectProjectState({ cwd });
			expect(state.git.quality).toBe("current");
			expect(state.ein.quality).toBe("current");
			expect(state.openspec).toMatchObject({ quality: "absent", selection: "none" });
		});
	});

	test("determinism and no file writes preserve sources across repeated projections", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-no-write-"));
		try {
			writeVerificationFixture(cwd);
			const einPath = join(cwd, "EIN.md");
			const einContent = "# EIN.md\n## Overview\nDo not rewrite this context.\n";
			writeFileSync(einPath, einContent);
			const beforeEntries = readdirSync(cwd).sort();

			const first = projectProjectState({ cwd });
			const second = projectProjectState({ cwd });

			expect(first).toEqual(second);
			expect(readFileSync(einPath, "utf8")).toBe(einContent);
			expect(readdirSync(cwd).sort()).toEqual(beforeEntries);
			expect(existsSync(join(cwd, "project-state.json"))).toBe(false);
			expect(existsSync(join(cwd, ".project-state-cache"))).toBe(false);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("Git bounded exact identity", () => {
	test("HEAD, unborn, and detached states have exact bounded identities", () => {
		withRepository((cwd) => {
			const unbornState = projectProjectState({ cwd });
			const unborn = unbornState.git;
			expect(unborn.repository).toBe(true);
			expect(unbornState.identity.quality).toBe("current");
			expect(unbornState.identity.repositoryRoot).toBe(cwd);
			expect(unborn.head).toBe("unborn");
			expect(unborn.branch).toBeTruthy();
			expect(unborn.complete).toBe(true);
			expect(unborn.stateRef).toMatch(/^git-v1:sha256:[0-9a-f]{64}$/);

			commitFile(cwd, "tracked.txt", "first\n");
			const committed = projectProjectState({ cwd }).git;
			expect(committed.head).toMatch(/^[0-9a-f]{40,64}$/);
			expect(committed.branch).not.toBe("detached");
			expect(committed.stateRef).not.toBe(unborn.stateRef);

			git(cwd, ["checkout", "--quiet", "--detach", "HEAD"]);
			const detached = projectProjectState({ cwd }).git;
			expect(detached.branch).toBe("detached");
			expect(detached.head).toBe(committed.head);
			expect(detached.stateRef).not.toBe(committed.stateRef);
		});
	});

	test("HEAD, index, tracked, and untracked transitions change only the fingerprint", () => {
		withRepository((cwd) => {
			commitFile(cwd, "tracked.txt", "first\n");
			const clean = projectProjectState({ cwd }).git;
			const beforeBytes = readFileSync(join(cwd, "tracked.txt"));

			writeFileSync(join(cwd, "tracked.txt"), "tracked secret\n");
			const tracked = projectProjectState({ cwd }).git;
			expect(tracked.stateRef).not.toBe(clean.stateRef);
			writeFileSync(join(cwd, "tracked.txt"), "tracked secret changed\n");
			const trackedAgain = projectProjectState({ cwd }).git;
			expect(trackedAgain.stateRef).not.toBe(tracked.stateRef);
			expect(trackedAgain.changes).toEqual([
				{
					path: "tracked.txt",
					kind: "modified",
					indexStatus: ".",
					worktreeStatus: "M",
				},
			]);

			writeFileSync(join(cwd, "tracked.txt"), "tracked secret\n");
			const trackedRestored = projectProjectState({ cwd }).git;
			expect(trackedRestored.stateRef).toBe(tracked.stateRef);

			git(cwd, ["add", "--", "tracked.txt"]);
			const indexBeforeProjection = readFileSync(join(cwd, ".git", "index"));
			const staged = projectProjectState({ cwd }).git;
			expect(readFileSync(join(cwd, ".git", "index"))).toEqual(indexBeforeProjection);
			expect(staged.stateRef).not.toBe(tracked.stateRef);
			expect(staged.changes).toEqual([
				{
					path: "tracked.txt",
					kind: "modified",
					indexStatus: "M",
					worktreeStatus: ".",
				},
			]);

			writeFileSync(join(cwd, "untracked.txt"), "untracked secret\n");
			const untracked = projectProjectState({ cwd }).git;
			expect(untracked.stateRef).not.toBe(staged.stateRef);
			expect(untracked.changes.map(({ path }) => path)).toEqual([
				"tracked.txt",
				"untracked.txt",
			]);
			expect(untracked.changes.every(({ path }) => !path.startsWith(cwd))).toBe(true);
			expect(JSON.stringify(untracked)).not.toContain("tracked secret");
			expect(JSON.stringify(untracked)).not.toContain("untracked secret");
			expect(readFileSync(join(cwd, "tracked.txt"))).toEqual(
				Buffer.from("tracked secret\n"),
			);
			expect(beforeBytes).toEqual(Buffer.from("first\n"));
		});
	});

	test("Git changes expose staged, unstaged, and mixed index/worktree classifications", () => {
		withRepository((cwd) => {
			commitFile(cwd, "tracked.txt", "first\n");

			writeFileSync(join(cwd, "tracked.txt"), "unstaged\n");
			const unstaged = projectProjectState({ cwd }).git.changes;
			expect(unstaged).toContainEqual({
				path: "tracked.txt",
				kind: "modified",
				indexStatus: ".",
				worktreeStatus: "M",
			});

			git(cwd, ["add", "--", "tracked.txt"]);
			const staged = projectProjectState({ cwd }).git.changes;
			expect(staged).toContainEqual({
				path: "tracked.txt",
				kind: "modified",
				indexStatus: "M",
				worktreeStatus: ".",
			});

			writeFileSync(join(cwd, "tracked.txt"), "mixed\n");
			const mixed = projectProjectState({ cwd }).git.changes;
			expect(mixed).toContainEqual({
				path: "tracked.txt",
				kind: "modified",
				indexStatus: "M",
				worktreeStatus: "M",
			});
		});
	});

	test("nested working directories still emit repository-relative paths", () => {
		withRepository((cwd) => {
			commitFile(cwd, "tracked.txt", "tracked\n");
			const nested = join(cwd, "nested");
			mkdirSync(nested);
			writeFileSync(join(cwd, "tracked.txt"), "tracked dirty\n");

			const state = projectProjectState({ cwd: nested });
			expect(state.git.root).toBe(cwd);
			expect(state.git.changes).toEqual([
				{
					path: "tracked.txt",
					kind: "modified",
					indexStatus: ".",
					worktreeStatus: "M",
				},
			]);
		});
	});

	test("physical repository identity is stable through a symlinked working directory", () => {
		withRepository((cwd) => {
			commitFile(cwd, "tracked.txt", "tracked\n");
			const aliasParent = mkdtempSync(join(tmpdir(), "ein-project-state-alias-"));
			const alias = join(aliasParent, "repository");
			try {
				symlinkSync(cwd, alias, "dir");
				writeFileSync(join(cwd, "tracked.txt"), "tracked dirty\n");

				const direct = projectProjectState({ cwd });
				const throughAlias = projectProjectState({ cwd: alias });
				expect(throughAlias.identity.cwd).toBe(cwd);
				expect(throughAlias.identity.repositoryRoot).toBe(cwd);
				expect(throughAlias.git.root).toBe(cwd);
				expect(throughAlias.git.changes).toEqual(direct.git.changes);
				expect(throughAlias.git.stateRef).toBe(direct.git.stateRef);
			} finally {
				rmSync(aliasParent, { recursive: true, force: true });
			}
		});
	});

	test("unrelated dirty files remain summarized and untouched", () => {
		withRepository((cwd) => {
			commitFile(cwd, "tracked.txt", "tracked\n");
			commitFile(cwd, "unrelated.txt", "unrelated\n");
			writeFileSync(join(cwd, "unrelated.txt"), "unrelated dirty\n");
			const unrelatedBytes = readFileSync(join(cwd, "unrelated.txt"));
			writeFileSync(join(cwd, "tracked.txt"), "tracked dirty\n");

			const gitState = projectProjectState({ cwd }).git;
			expect(gitState.changes.map(({ path }) => path)).toEqual([
				"tracked.txt",
				"unrelated.txt",
			]);
			expect(readFileSync(join(cwd, "unrelated.txt"))).toEqual(unrelatedBytes);
		});
	});

	test("rename and delete transitions remain repository-relative", () => {
		withRepository((cwd) => {
			commitFile(cwd, "before.txt", "content\n");
			git(cwd, ["mv", "before.txt", "after.txt"]);
			const renamed = projectProjectState({ cwd }).git;
			expect(renamed.changes).toContainEqual({
				path: "after.txt",
				kind: "renamed",
				indexStatus: "R",
				worktreeStatus: ".",
				previousPath: "before.txt",
			});

			git(cwd, ["rm", "--quiet", "-f", "after.txt"]);
			const deleted = projectProjectState({ cwd }).git;
			expect(deleted.changes).toContainEqual({
				path: "before.txt",
				kind: "deleted",
				indexStatus: "D",
				worktreeStatus: ".",
			});
			expect(deleted.changes.every(({ path }) => !path.startsWith("/"))).toBe(true);
		});
	});

	test("overflow is bounded and fails closed without a state reference", () => {
		withRepository((cwd) => {
			for (let index = 0; index < 257; index += 1) {
				writeFileSync(join(cwd, `untracked-${String(index).padStart(3, "0")}.txt`), "x");
			}
			const gitState = projectProjectState({ cwd }).git;
			expect(gitState.changes).toHaveLength(256);
			expect(gitState.changes.every(({ path }) => !path.startsWith("/"))).toBe(true);
			expect(gitState.complete).toBe(false);
			expect(gitState.quality).toBe("incomplete");
			expect(gitState.reason).toBe("incomplete-source");
			expect(gitState.stateRef).toBeUndefined();
		});
	});

	function withFakeGit(statusMode: "malformed" | "error", run: (cwd: string, bin: string) => void): void {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-fake-git-"));
		const bin = join(cwd, "bin");
		mkdirSync(bin);
		const fakeGit = join(bin, "git");
		writeFileSync(
			fakeGit,
			`#!/bin/sh
case "$*" in
  *"--version"*) printf '%s\\n' 'git version 2.0.0';;
  *"rev-parse --is-inside-work-tree"*) printf '%s\\n' 'true';;
  *"rev-parse --show-toplevel"*) printf '%s\\n' "$FAKE_ROOT";;
  *"symbolic-ref --quiet --short HEAD"*) printf '%s\\n' 'main';;
  *"rev-parse --verify HEAD"*) printf '%s\\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';;
  *"status --porcelain=v2"*) ${statusMode === "error" ? "exit 1;;" : "printf '%s\\0' 'malformed status record';;"}
  *) exit 1;;
esac
`,
		);
		chmodSync(fakeGit, 0o755);
		try {
			run(cwd, bin);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}

	function projectGitWithFake(cwd: string, bin: string): ProjectStateV1["git"] {
		const script = `import { projectProjectState } from ${JSON.stringify(join(process.cwd(), "ein-pi/agent/lib/project-state.ts"))}; process.stdout.write(JSON.stringify(projectProjectState({ cwd: ${JSON.stringify(cwd)} }).git));`;
		const raw = execFileSync("bun", ["-e", script], {
			cwd: process.cwd(),
			env: {
				...process.env,
				PATH: `${bin}:${process.env.PATH ?? ""}`,
				FAKE_ROOT: cwd,
			},
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		return JSON.parse(raw) as ProjectStateV1["git"];
	}

	test("malformed Git output fails closed", () => {
		withFakeGit("malformed", (cwd, bin) => {
			const gitState = projectGitWithFake(cwd, bin);
			expect(gitState.repository).toBe(true);
			expect(gitState.quality).toBe("incomplete");
			expect(gitState.reason).toBe("parse-error");
			expect(gitState.complete).toBe(false);
			expect(gitState.stateRef).toBeUndefined();
		});
	});

	test("Git command errors fail closed without raw command output", () => {
		withFakeGit("error", (cwd, bin) => {
			const gitState = projectGitWithFake(cwd, bin);
			expect(gitState.repository).toBe(true);
			expect(gitState.quality).toBe("unavailable");
			expect(gitState.reason).toBe("command-error");
			expect(gitState.complete).toBe(false);
			expect(gitState.stateRef).toBeUndefined();
			expect(JSON.stringify(gitState)).not.toContain("status record");
		});
	});

	test("non-repositories are explicit and do not become clean Git states", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-project-state-no-git-"));
		try {
			const gitState = projectProjectState({ cwd }).git;
			expect(gitState.repository).toBe(false);
			expect(gitState.quality).toBe("absent");
			expect(gitState.reason).toBe("not-a-repository");
			expect(gitState.complete).toBe(true);
			expect(gitState.dirty).toBe(false);
			expect(gitState.stateRef).toBeUndefined();
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
