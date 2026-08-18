import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRuntimeTestOwner, type SessionLease } from "./fixtures/runtime-test-fixture";
import type {
	AdapterErrorCode,
	AdapterResult,
	LaunchIntent,
	ProjectBinding,
	SessionMetadata,
} from "../ein-pi/agent/lib/runtime-session-adapters";
import type {
	ProjectStateReasonCode,
	ProjectStateV1,
} from "../ein-pi/agent/lib/project-state";

const owner = getRuntimeTestOwner();
const {
	RUNTIME_CAPABILITY_MATRIX,
	buildLaunchPlan,
	createClaudeSessionAdapter,
	createPiSessionAdapter,
	createSessionRequest,
	executeLaunchPlan,
	getRuntimeCapabilities,
	listPiProjectSessions,
	listSessionRequest,
	projectBindingFromState,
	resolveLaunchExecutable,
	resumeSessionRequest,
	toProjectRuntimeMetadata,
	validateOpaqueReference,
} = await import("../ein-pi/agent/lib/runtime-session-adapters");

const TEST_SESSIONS_DIR = owner.sessionsDir;

function sessionTest(name: string, callback: (lease: SessionLease) => void | Promise<void>): void {
	test(name, async () => owner.withSessionLease(callback));
}

function writeSession(
	lease: SessionLease,
	projectDir: string,
	file: string,
	meta: Record<string, unknown>,
	mtimeMs: number,
	trailing = "private transcript\n",
): string {
	const dir = lease.ensureProjectDir(projectDir);
	const path = join(dir, file);
	writeFileSync(path, `${JSON.stringify({ type: "session", ...meta })}\n${trailing}`);
	utimesSync(path, new Date(mtimeMs), new Date(mtimeMs));
	return path;
}

function opaque(id: string): string {
	return `pi:v1:sha256:${createHash("sha256").update(id).digest("hex")}`;
}

const repositoryProject: ProjectBinding = {
	schemaVersion: 1,
	cwd: "/work/example/packages/app",
	repositoryRoot: "/work/example",
	gitStateRef: "git-v1:sha256:" + "a".repeat(64),
};

const standaloneProject: ProjectBinding = {
	schemaVersion: 1,
	cwd: "/tmp/standalone",
};

const stateVersionProbe = 1 as ProjectStateV1["schemaVersion"];
const stateBindingVersionProbe: ProjectBinding["schemaVersion"] = stateVersionProbe;

function successfulList(): AdapterResult<readonly SessionMetadata[]> {
	return {
		provider: "pi",
		operation: "list",
		outcome: "success",
		project: repositoryProject,
		data: [
			{
				reference: "pi:v1:sha256:" + "b".repeat(64),
				modifiedAtMs: 1_700_000_000_000,
			},
		],
	};
}

function stateFor(options: {
	cwd?: string;
	repositoryRoot?: string;
	repository?: boolean | null;
	complete?: boolean;
	stateRef?: string;
	schemaVersion?: number;
} = {}): ProjectStateV1 {
	const repositoryRoot = options.repositoryRoot ?? "/work/example";
	const repository = options.repository === undefined ? true : options.repository;
	const stateRef = options.stateRef ?? "git-v1:sha256:" + "a".repeat(64);
	return {
		schemaVersion: options.schemaVersion ?? 1,
		identity: {
			quality: "current",
			reason: "read-success",
			cwd: options.cwd ?? "/work/example/packages/app",
			...(repository === true ? { repositoryRoot } : {}),
		},
		openspec: {} as ProjectStateV1["openspec"],
		ein: {} as ProjectStateV1["ein"],
		git: {
			quality: "current",
			reason: "read-success",
			repository,
			...(repository === true ? { root: repositoryRoot } : {}),
			dirty: repository === false ? false : false,
			complete: options.complete ?? repository !== null,
			changes: [],
			...(repository === true && stateRef !== undefined ? { stateRef } : {}),
		},
		verification: {} as ProjectStateV1["verification"],
		runtimes: {} as ProjectStateV1["runtimes"],
	} as ProjectStateV1;
}

describe("runtime session adapter contract", () => {
	test("publishes the evidence-based asymmetric provider matrix", () => {
		expect(Object.keys(RUNTIME_CAPABILITY_MATRIX)).toEqual(["pi", "claude"]);
		expect(Object.keys(RUNTIME_CAPABILITY_MATRIX.pi)).toEqual([
			"list",
			"create",
			"resume",
			"launch",
		]);
		expect(Object.keys(RUNTIME_CAPABILITY_MATRIX.claude)).toEqual([
			"list",
			"create",
			"resume",
			"launch",
		]);

		expect(RUNTIME_CAPABILITY_MATRIX.pi.list.support).toBe("supported");
		expect(RUNTIME_CAPABILITY_MATRIX.pi.create).toMatchObject({
			support: "supported",
			requestOnly: true,
		});
		expect(RUNTIME_CAPABILITY_MATRIX.pi.resume.support).toBe("supported");
		expect(RUNTIME_CAPABILITY_MATRIX.pi.launch.support).toBe("supported");
		expect(RUNTIME_CAPABILITY_MATRIX.claude.list.support).toBe("supported");
		expect(RUNTIME_CAPABILITY_MATRIX.claude.create).toMatchObject({
			support: "supported",
			requestOnly: true,
		});
		expect(RUNTIME_CAPABILITY_MATRIX.claude.resume.support).toBe("supported");
		expect(RUNTIME_CAPABILITY_MATRIX.claude.launch.support).toBe("supported");

		for (const provider of ["pi", "claude"] as const) {
			for (const operation of ["list", "create", "resume", "launch"] as const) {
				expect(RUNTIME_CAPABILITY_MATRIX[provider][operation]).toMatchObject({
					provider,
					operation,
				});
			}
		}
	});

	test("keeps launch intents and results bound to the supplied project", () => {
		const createIntent: LaunchIntent = {
			provider: "pi",
			mode: "create",
			project: repositoryProject,
		};
		const resumeIntent: LaunchIntent = {
			provider: "pi",
			mode: "resume",
			project: repositoryProject,
			reference: "pi:v1:sha256:" + "c".repeat(64),
		};

		expect(createIntent.project).toEqual(repositoryProject);
		expect(resumeIntent.project).toEqual(repositoryProject);
		expect(successfulList().project).toEqual(repositoryProject);
	});

	test("allows exact-cwd non-repository bindings without inventing a git identity", () => {
		const result: AdapterResult<LaunchIntent> = {
			provider: "claude",
			operation: "create",
			outcome: "success",
			project: standaloneProject,
			data: {
				provider: "claude",
				mode: "create",
				project: standaloneProject,
			},
		};

		expect(result.project.gitStateRef).toBeUndefined();
		expect(result.data.project).toEqual(standaloneProject);
	});

	test("discriminates success from non-success without leaking private metadata", () => {
		const success = successfulList();
		const unsupported: AdapterResult<readonly SessionMetadata[]> = {
			provider: "claude",
			operation: "list",
			outcome: "unsupported",
			project: standaloneProject,
			error: { code: "operation-not-supported" },
		};
		const unavailable: AdapterResult<readonly SessionMetadata[]> = {
			provider: "pi",
			operation: "list",
			outcome: "unavailable",
			project: repositoryProject,
			error: { code: "session-source-unavailable" },
		};
		const error: AdapterResult<readonly SessionMetadata[]> = {
			provider: "pi",
			operation: "launch",
			outcome: "error",
			project: repositoryProject,
			error: { code: "process-exit", exitCode: 17 },
		};
		const cancelled: AdapterResult<readonly SessionMetadata[]> = {
			provider: "claude",
			operation: "launch",
			outcome: "cancelled",
			project: standaloneProject,
		};

		expect(success.outcome).toBe("success");
		expect("data" in success).toBe(true);
		expect("error" in unsupported).toBe(true);
		expect("error" in unavailable).toBe(true);
		expect("error" in error).toBe(true);
		expect("data" in cancelled).toBe(false);

		const serialized = JSON.stringify(success);
		expect(serialized).toContain("pi:v1:sha256:");
		for (const privateValue of [
			"raw-session-id",
			"/private/sessions/session.jsonl",
			"prompt text",
			"transcript body",
			"secret-value",
			"12345",
		]) {
			expect(serialized).not.toContain(privateValue);
		}
	});

	test("keeps the public discriminants closed", () => {
		const outcomes = [
			"success",
			"unsupported",
			"unavailable",
			"error",
			"cancelled",
		] as const;
		expect(new Set(outcomes)).toEqual(
			new Set(["success", "unsupported", "unavailable", "error", "cancelled"]),
		);
		expect(stateVersionProbe).toBe(1);
		expect(stateBindingVersionProbe).toBe(1);
	});

	test("keeps malformed-state diagnostics and public metadata bounded", () => {
		const invalidState: AdapterResult<never> = {
			provider: "pi",
			operation: "create",
			outcome: "error",
			project: standaloneProject,
			error: { code: "unsupported-state-version" },
		};
		const providerMismatch: AdapterResult<never> = {
			provider: "claude",
			operation: "resume",
			outcome: "error",
			project: repositoryProject,
			error: { code: "provider-mismatch" },
		};
		const metadata: SessionMetadata = {
			reference: "pi:v1:sha256:" + "d".repeat(64),
			modifiedAtMs: 1_700_000_000_001,
		};

		expect(invalidState.error?.code).toBe("unsupported-state-version");
		expect(providerMismatch.error?.code).toBe("provider-mismatch");
		expect(Object.keys(metadata)).toEqual(["reference", "modifiedAtMs"]);
		expect(JSON.stringify({ invalidState, providerMismatch, metadata })).not.toContain(
			"verification",
		);
	});

	sessionTest("filters repository scope before limiting and emits opaque recency metadata", async (lease) => {
		const root = "/tmp/ein-runtime-adapter/repo";
		const now = Date.now();
		writeSession(lease, "runtime-adapter-scope", "root.jsonl", {
			id: "repo-root-id",
			cwd: root,
		}, now - 3_000);
		writeSession(lease, "runtime-adapter-scope", "nested.jsonl", {
			id: "repo-nested-id",
			cwd: `${root}/packages/lib`,
		}, now - 2_000, "prompt text and transcript body\n");
		writeSession(lease, "runtime-adapter-scope-neighbor", "neighbor.jsonl", {
			id: "neighbor-id",
			cwd: `${root}-copy`,
		}, now - 1_000);
		writeSession(lease, "runtime-adapter-scope", "missing-id.jsonl", {
			cwd: root,
		}, now - 500);
		writeSession(lease, "runtime-adapter-scope", "missing-cwd.jsonl", {
			id: "missing-cwd-id",
		}, now - 400);
		writeFileSync(join(lease.ensureProjectDir("runtime-adapter-scope"), "malformed.jsonl"), "not json\n");
		symlinkSync(
			join(lease.ensureProjectDir("runtime-adapter-scope"), "missing-target.jsonl"),
			join(lease.ensureProjectDir("runtime-adapter-scope"), "unreadable.jsonl"),
		);

		const project: ProjectBinding = {
			schemaVersion: 1,
			cwd: `${root}/packages/app`,
			repositoryRoot: root,
			gitStateRef: "git-v1:sha256:" + "e".repeat(64),
		};
		const result = listPiProjectSessions(project, { limit: 2 });
		expect(result.outcome).toBe("success");
		if (result.outcome !== "success") throw new Error("expected successful project scan");
		expect(result.data).toEqual([
			{ reference: opaque("repo-nested-id"), modifiedAtMs: now - 2_000 },
			{ reference: opaque("repo-root-id"), modifiedAtMs: now - 3_000 },
		]);
		expect(result.project).toEqual(project);
		const serialized = JSON.stringify(result);
		for (const privateValue of [
			"repo-nested-id",
			"neighbor-id",
			"runtime-adapter-scope",
			`${root}/packages/lib`,
			"prompt text",
			"transcript body",
		]) {
			expect(serialized).not.toContain(privateValue);
		}
		expect(serialized).toContain("pi:v1:sha256:");
	});

	sessionTest("requires exact cwd equality for non-repository sessions", async (lease) => {
		const cwd = "/tmp/ein-runtime-adapter/standalone";
		const now = Date.now();
		writeSession(lease, "runtime-adapter-nonrepo", "exact.jsonl", {
			id: "exact-cwd-id",
			cwd,
		}, now);
		writeSession(lease, "runtime-adapter-nonrepo", "child.jsonl", {
			id: "child-cwd-id",
			cwd: `${cwd}/child`,
		}, now - 1_000);
		const result = listPiProjectSessions({ schemaVersion: 1, cwd }, { limit: 10 });
		expect(result.outcome).toBe("success");
		if (result.outcome !== "success") throw new Error("expected successful exact-cwd scan");
		expect(result.data).toEqual([
			{ reference: opaque("exact-cwd-id"), modifiedAtMs: now },
		]);
	});

	sessionTest("rejects duplicate matching opaque references", async (lease) => {
		const root = "/tmp/ein-runtime-adapter/duplicate";
		const now = Date.now();
		writeSession(lease, "runtime-adapter-duplicate-a", "one.jsonl", {
			id: "duplicate-id",
			cwd: root,
		}, now);
		writeSession(lease, "runtime-adapter-duplicate-b", "two.jsonl", {
			id: "duplicate-id",
			cwd: `${root}/nested`,
		}, now - 1_000);
		const result = listPiProjectSessions(
			{
				schemaVersion: 1,
				cwd: `${root}/nested`,
				repositoryRoot: root,
			},
			{ limit: 10 },
		);
		// Both records are in one repository scope, so the public reference is ambiguous.
		expect(result.outcome).toBe("error");
		expect(result.error?.code).toBe("reference-ambiguous");
	});

	sessionTest("fails closed when more than 4,096 candidates remain outside the scan window", async (lease) => {
		const root = "/tmp/ein-runtime-adapter/overflow";
		const now = Date.now();
		for (let i = 0; i < 4_096; i++) {
			writeSession(lease, "runtime-adapter-overflow-noise", `${String(i).padStart(4, "0")}.jsonl`, {
				id: `noise-${i}`,
				cwd: `${root}-neighbor`,
			}, now);
		}
		writeSession(lease, "runtime-adapter-overflow-selected", "old.jsonl", {
			id: "selected-too-old",
			cwd: root,
		}, now - 60_000);

		const result = listPiProjectSessions(
			{ schemaVersion: 1, cwd: root, repositoryRoot: root },
			{ limit: 1 },
		);
		expect(result.outcome).toBe("unavailable");
		expect(result.error?.code).toBe("scan-limit-exceeded");
	});

	sessionTest("normalizes exact project boundaries and rejects invalid result limits", async (lease) => {
		const root = "/tmp/ein-runtime-adapter/boundary";
		const now = Date.now();
		writeSession(lease, "runtime-adapter-boundary", "selected.jsonl", {
			id: "normalized-id",
			cwd: `${root}/packages/app`,
		}, now);
		writeSession(lease, "runtime-adapter-boundary", "prefix.jsonl", {
			id: "prefix-id",
			cwd: `${root}/packages/application`,
		}, now - 1_000);
		const normalized = listPiProjectSessions(
			{
				schemaVersion: 1,
				cwd: `${root}/packages/./app/..//app`,
				repositoryRoot: `${root}/./`,
			},
			{ limit: 1 },
		);
		expect(normalized.outcome).toBe("success");
		if (normalized.outcome !== "success") throw new Error("expected normalized scope");
		expect(normalized.data).toEqual([
			{ reference: opaque("normalized-id"), modifiedAtMs: now },
		]);

		const invalid = listPiProjectSessions(
			{ schemaVersion: 1, cwd: root, repositoryRoot: root },
			{ limit: 0 },
		);
		expect(invalid.outcome).toBe("error");
		expect(invalid.error?.code).toBe("invalid-request");
	});

	sessionTest("uses a deterministic path tie-breaker without reading beyond the first line", async (lease) => {
		const cwd = "/tmp/ein-runtime-adapter/ties";
		const now = Date.now();
		writeSession(lease, "runtime-adapter-tie-b", "session.jsonl", { id: "tie-b", cwd }, now);
		writeSession(lease, "runtime-adapter-tie-a", "session.jsonl", { id: "tie-a", cwd }, now);
		mkdirSync(lease.ensureProjectDir("runtime-adapter-tie-long"), { recursive: true });
		writeFileSync(
			join(lease.ensureProjectDir("runtime-adapter-tie-long"), "session.jsonl"),
			`${JSON.stringify({ type: "session", id: "too-late-id", padding: "x".repeat(2_000), cwd })}\nprivate\n`,
		);
		const result = listPiProjectSessions({ schemaVersion: 1, cwd }, { limit: 20 });
		expect(result.outcome).toBe("success");
		if (result.outcome !== "success") throw new Error("expected tie scan");
		expect(result.data).toEqual([
			{ reference: opaque("tie-a"), modifiedAtMs: now },
			{ reference: opaque("tie-b"), modifiedAtMs: now },
		]);
	});
});

describe("runtime session adapter lifecycle requests", () => {
	test("creates only a state-bound request for both runtimes without persistence", () => {
		const state = stateFor();
		const before = readdirSync(TEST_SESSIONS_DIR, { withFileTypes: true }).map((entry) => entry.name);
		for (const provider of ["pi", "claude"] as const) {
			const result = createSessionRequest(provider, state);
			expect(result).toMatchObject({
				provider,
				operation: "create",
				outcome: "success",
				project: projectBindingFromState(state),
			});
			if (result.outcome !== "success") throw new Error("expected create success");
			expect(result.data).toEqual({
				provider,
				mode: "create",
				project: projectBindingFromState(state),
			});
			expect("reference" in result.data).toBe(false);
		}
		expect(readdirSync(TEST_SESSIONS_DIR, { withFileTypes: true }).map((entry) => entry.name)).toEqual(before);
	});

	test("validates state identity and exact repository state references before runtime work", () => {
		const invalidVersion = createSessionRequest("pi", stateFor({ schemaVersion: 2 }));
		expect(invalidVersion.outcome).toBe("error");
		expect(invalidVersion.error?.code).toBe("unsupported-state-version");

	const relativeCwd = createSessionRequest("pi", stateFor({ cwd: "relative/project" }));
		expect(relativeCwd.outcome).toBe("error");
		expect(relativeCwd.error?.code).toBe("project-identity-unavailable");

	const missingRefState = stateFor();
	delete missingRefState.git.stateRef;
	const missingRef = createSessionRequest("pi", missingRefState);
	expect(missingRef.outcome).toBe("error");
		expect(missingRef.error?.code).toBe("state-ref-unavailable");

	const unknownRepository = createSessionRequest("pi", stateFor({ repository: null }));
		expect(unknownRepository.outcome).toBe("error");
		expect(unknownRepository.error?.code).toBe("state-ref-unavailable");

	const nonRepository = createSessionRequest(
		"claude",
		stateFor({ repository: false, cwd: "/tmp/standalone" }),
	);
		expect(nonRepository.outcome).toBe("success");
	});

sessionTest("keeps listing deterministic across both runtimes", async (lease) => {
		const state = stateFor();
		const root = "/work/example";
		writeSession(lease, "runtime-adapter-group-003", "one.jsonl", { id: "group-003-one", cwd: root }, 2_000);
		const pi = listSessionRequest("pi", state, { limit: 1 });
		expect(pi.outcome).toBe("success");
		if (pi.outcome !== "success") throw new Error("expected Pi list success");
		expect(pi.data).toEqual([{ reference: opaque("group-003-one"), modifiedAtMs: 2_000 }]);

		// Claude's store is readable now; with no isolated home on this machine
		// the honest answer is "no source", never "no sessions".
		const claude = listSessionRequest("claude", state);
		expect(claude.outcome).toBe("unavailable");
		expect(claude.error?.code).toBe("session-source-unavailable");
	});

	test("validates opaque provider references before resolving a resume", () => {
		const state = stateFor();
		const piReference = opaque("resume-id");
		expect(validateOpaqueReference("pi", piReference)).toBe(true);
		expect(validateOpaqueReference("claude", piReference)).toBe(false);
		expect(validateOpaqueReference("pi", "pi:v1:sha256:bad")).toBe(false);

		// Well-formed but not backed by any live session of this project: the
		// reference resolves against the store, so it is not-found, not refused.
		const piResume = resumeSessionRequest("pi", state, piReference);
		expect(piResume.outcome).toBe("error");
		expect(piResume.error?.code).toBe("reference-not-found");
		const claudeResume = resumeSessionRequest("claude", state, "claude:v1:sha256:" + "b".repeat(64));
		expect(claudeResume.error?.code).toBe("reference-not-found");

		const crossRuntime = resumeSessionRequest("claude", state, piReference);
		expect(crossRuntime.outcome).toBe("error");
		expect(crossRuntime.error?.code).toBe("provider-mismatch");
		const malformed = resumeSessionRequest("pi", state, "unknown-reference");
		expect(malformed.outcome).toBe("error");
		expect(malformed.error?.code).toBe("reference-invalid");
	});

	test("factories expose the same deterministic provider translation", () => {
		const pi = createPiSessionAdapter();
		const claude = createClaudeSessionAdapter();
		expect(pi.provider).toBe("pi");
		expect(claude.provider).toBe("claude");
		expect(pi.capabilities).toEqual(getRuntimeCapabilities("pi"));
		expect(claude.capabilities).toEqual(getRuntimeCapabilities("claude"));
		expect(pi.capabilities.filter((capability) => capability.support === "supported").map((capability) => capability.operation)).toEqual(["list", "create", "resume", "launch"]);
		expect(claude.capabilities.filter((capability) => capability.support === "supported").map((capability) => capability.operation)).toEqual(["list", "create", "resume", "launch"]);
	});

	test("accepts request envelopes as the factory-neutral call form", () => {
		const state = stateFor();
		const created = createSessionRequest({ provider: "pi", state });
		expect(created.outcome).toBe("success");
		const listed = listSessionRequest({ provider: "pi", state, limit: 1 });
		expect(listed.outcome).toBe("success");
		const resumed = resumeSessionRequest({
			provider: "pi",
			state,
			reference: opaque("envelope-reference"),
		});
		// The envelope form reaches resolution like the positional one does.
		expect(resumed.error?.code).toBe("reference-not-found");
	});

	test("rejects stale or wrong-project bindings before unsupported resume", () => {
		const state = stateFor();
		const binding = projectBindingFromState(state);
		const wrongProject = { ...binding, cwd: "/work/other" };
		const wrong = createSessionRequest("pi", state, wrongProject);
		expect(wrong.outcome).toBe("error");
		expect(wrong.error?.code).toBe("project-mismatch");

		const staleIntent: LaunchIntent = {
			provider: "pi",
			mode: "resume",
			project: { ...binding, gitStateRef: "git-v1:sha256:" + "c".repeat(64) },
			reference: opaque("stale-reference"),
		};
		const stale = resumeSessionRequest("pi", state, staleIntent);
		expect(stale.outcome).toBe("error");
		expect(stale.error?.code).toBe("project-mismatch");

		const missingRefState = stateFor();
		delete missingRefState.git.stateRef;
		const listWithoutRef = listSessionRequest("pi", missingRefState);
		expect(listWithoutRef.outcome).toBe("success");
	});

	test("rejects inconsistent identity, unknown providers, and private diagnostics", () => {
		const inconsistent = stateFor({ repositoryRoot: "/work/example" });
		inconsistent.git.root = "/work/other";
		const identityFailure = createSessionRequest("pi", inconsistent);
		expect(identityFailure.outcome).toBe("error");
		expect(identityFailure.error?.code).toBe("project-identity-unavailable");

		const unknown = listSessionRequest({ provider: "unknown", state: stateFor() });
		expect(unknown.outcome).toBe("error");
		expect(unknown.error?.code).toBe("invalid-request");

		const result = createSessionRequest("pi", stateFor());
		const serialized = JSON.stringify(result);
		for (const privateValue of ["verification", "raw-session-id", "/private", "transcript", "secret"]) {
			expect(serialized).not.toContain(privateValue);
		}
	});
});

describe("transient ProjectStateV1 runtime metadata translation", () => {
	test("maps successful observations to bounded B-compatible metadata without mutation", () => {
		const list = successfulList();
		const create = createSessionRequest("pi", stateFor());
		if (create.outcome !== "success") throw new Error("expected create success");
		const launch: AdapterResult<{ exitCode: 0 }> = {
			provider: "claude",
			operation: "launch",
			outcome: "success",
			project: standaloneProject,
			data: { exitCode: 0 },
		};
		const beforeList = structuredClone(list);
		const beforeCreate = structuredClone(create);
		const beforeLaunch = structuredClone(launch);

		expect(toProjectRuntimeMetadata(list)).toEqual({
			availability: "available",
			capabilities: ["session.list"],
			references: ["pi:v1:sha256:" + "b".repeat(64)],
		});
		expect(toProjectRuntimeMetadata(create)).toEqual({
			availability: "available",
			capabilities: ["session.create"],
		});
		expect(toProjectRuntimeMetadata(launch)).toEqual({
			availability: "available",
			capabilities: ["runtime.launch"],
		});
		expect(list).toEqual(beforeList);
		expect(create).toEqual(beforeCreate);
		expect(launch).toEqual(beforeLaunch);
	});

	test("maps adapter failures to existing B reason codes and drops adapter diagnostics", () => {
		const cases: Array<{
			result: AdapterResult<unknown>;
			expected: { availability: string; reason?: string; errors?: Array<{ code: string }> };
		}> = [
			{
				result: {
					provider: "claude",
					operation: "list",
					outcome: "unsupported",
					project: standaloneProject,
					error: { code: "operation-not-supported" },
				},
				expected: {
					availability: "not-provided",
					reason: "not-provided",
					errors: [{ code: "not-provided" }],
				},
			},
			{
				result: {
					provider: "pi",
					operation: "list",
					outcome: "unavailable",
					project: repositoryProject,
					error: { code: "session-source-unavailable" },
				},
				expected: {
					availability: "unavailable",
					reason: "read-error",
					errors: [{ code: "read-error" }],
				},
			},
			{
				result: {
					provider: "pi",
					operation: "launch",
					outcome: "unavailable",
					project: repositoryProject,
					error: { code: "executable-unavailable" },
				},
				expected: {
					availability: "unavailable",
					reason: "command-error",
					errors: [{ code: "command-error" }],
				},
			},
			{
				result: {
					provider: "pi",
					operation: "create",
					outcome: "error",
					project: repositoryProject,
					error: { code: "project-identity-unavailable" },
				},
				expected: {
					availability: "unavailable",
					reason: "invalid-source",
					errors: [{ code: "invalid-source" }],
				},
			},
			{
				result: {
					provider: "pi",
					operation: "create",
					outcome: "error",
					project: repositoryProject,
					error: { code: "project-mismatch" },
				},
				expected: {
					availability: "unavailable",
					reason: "state-mismatch",
					errors: [{ code: "state-mismatch" }],
				},
			},
			{
				result: {
					provider: "pi",
					operation: "launch",
					outcome: "error",
					project: repositoryProject,
					error: { code: "process-exit", exitCode: 17 },
				},
				expected: {
					availability: "unavailable",
					reason: "command-error",
					errors: [{ code: "command-error" }],
				},
			},
		];

		for (const { result, expected } of cases) {
			const metadata = toProjectRuntimeMetadata(result);
			expect(metadata).toMatchObject(expected);
			expect(metadata.capabilities).toBeUndefined();
			expect(metadata.references).toBeUndefined();
			expect(JSON.stringify(metadata)).not.toMatch(
				/operation-not-supported|executable-unavailable|project-identity-unavailable|process-exit|exitCode|private|stderr/i,
			);
		}
	});

	test("keeps only provider-scoped opaque references and no project/runtime ownership fields", () => {
		const valid = "pi:v1:sha256:" + "f".repeat(64);
		const result: AdapterResult<unknown> = {
			provider: "pi",
			operation: "list",
			outcome: "success",
			project: {
				...repositoryProject,
				cwd: "/private/project",
			},
			data: [
				{ reference: valid, modifiedAtMs: 3 },
				{ reference: valid, modifiedAtMs: 2 },
				{ reference: "claude:v1:sha256:" + "1".repeat(64), modifiedAtMs: 1 },
				{ reference: "/private/sessions/raw-id.jsonl", modifiedAtMs: 0 },
				{ reference: "raw-session-id", modifiedAtMs: -1 },
				{ reference: "pi:v1:sha256:" + "2".repeat(63), modifiedAtMs: -2 },
			],
		};
		const before = structuredClone(result);
		const beforeEntries = readdirSync(TEST_SESSIONS_DIR).sort();
		const metadata = toProjectRuntimeMetadata(result);

		expect(metadata).toEqual({
			availability: "available",
			capabilities: ["session.list"],
			references: [valid],
		});
		expect(result).toEqual(before);
		expect(readdirSync(TEST_SESSIONS_DIR).sort()).toEqual(beforeEntries);
		expect(Object.keys(metadata).sort()).toEqual(["availability", "capabilities", "references"]);
		const serialized = JSON.stringify(metadata);
		for (const privateValue of [
			"/private/project",
			"/private/sessions/raw-id.jsonl",
			"raw-session-id",
			"transcript",
			"verification",
			"runtimes",
		]) {
			expect(serialized).not.toContain(privateValue);
		}
	});

	test("does not claim availability for cancellation and remains total for malformed success data", () => {
		const cancelled: AdapterResult<unknown> = {
			provider: "pi",
			operation: "launch",
			outcome: "cancelled",
			project: repositoryProject,
		};
		const malformed: AdapterResult<unknown> = {
			provider: "pi",
			operation: "list",
			outcome: "success",
			project: repositoryProject,
			data: "private raw data",
		};

		expect(toProjectRuntimeMetadata(cancelled)).toEqual({ availability: "unavailable" });
		expect(toProjectRuntimeMetadata(malformed)).toEqual({
			availability: "available",
			capabilities: ["session.list"],
			references: [],
		});
	});

	test("triangulates every adapter failure family and bounds malformed reference streams", () => {
		const expectedReasons: Array<[AdapterErrorCode, ProjectStateReasonCode]> = [
			["invalid-request", "invalid-source"],
			["unsupported-state-version", "invalid-source"],
			["state-ref-unavailable", "invalid-source"],
			["reference-invalid", "invalid-source"],
			["reference-not-found", "not-found"],
			["reference-ambiguous", "ambiguous-selection"],
			["provider-mismatch", "state-mismatch"],
			["session-source-unavailable", "read-error"],
			["scan-limit-exceeded", "read-error"],
			["runtime-unavailable", "command-error"],
			["spawn-failed", "command-error"],
			["process-exit", "command-error"],
			["process-signalled", "command-error"],
		];
		for (const [adapterCode, bReason] of expectedReasons) {
			const result: AdapterResult<unknown> = {
				provider: "pi",
				operation: "launch",
				outcome: "error",
				project: repositoryProject,
				error: { code: adapterCode },
			};
			expect(toProjectRuntimeMetadata(result)).toEqual({
				availability: "unavailable",
				reason: bReason,
				errors: [{ code: bReason }],
			});
		}

		const references = Array.from({ length: 25 }, (_, index) => ({
			reference: "pi:v1:sha256:" + index.toString(16).padStart(64, "0"),
			modifiedAtMs: index,
		}));
		const result: AdapterResult<unknown> = {
			provider: "pi",
			operation: "list",
			outcome: "success",
			project: repositoryProject,
			data: [
				"malformed private entry",
				{ reference: "raw-id", modifiedAtMs: 0 },
				...references,
			],
		};
		const metadata = toProjectRuntimeMetadata(result);
		expect(metadata.references).toHaveLength(20);
		expect(metadata.references?.[0]).toBe(references[0]?.reference);
		expect(JSON.stringify(metadata)).not.toContain("malformed private entry");
	});
});

describe("fixed isolated launch boundary", () => {
	test("builds fixed non-shell plans with metacharacter cwd and Fish isolation overrides", () => {
		const state = stateFor({ repository: false, cwd: "/tmp/project;printf leaked" });
		const created = createSessionRequest("pi", state);
		expect(created.outcome).toBe("success");
		if (created.outcome !== "success") throw new Error("expected create intent");

		const pi = buildLaunchPlan(state, created.data, {
			home: "/home/test-user",
			environment: { PATH: "/usr/bin" },
			resolveExecutable: (provider: "pi" | "claude") => `/trusted/${provider}`,
		});
		expect(pi.outcome).toBe("success");
		if (pi.outcome !== "success") throw new Error("expected Pi launch plan");
		expect(pi.data).toMatchObject({
			provider: "pi",
			mode: "create",
			executable: "/trusted/pi",
			argv: [],
			cwd: "/tmp/project;printf leaked",
			env: {
				PI_CODING_AGENT_DIR: "/home/test-user/.pi-ein/agent",
				EIN_PI_AGENT_HOME: "/home/test-user/.pi-ein/agent",
				ENGRAM_DATA_DIR: "/home/test-user/.engram-ein",
			},
			shell: false,
		});
		expect(pi.data.argv).toEqual([]);
		expect(JSON.stringify(pi.data.argv)).not.toContain("printf leaked");

		const claudeIntent = createSessionRequest("claude", state);
		expect(claudeIntent.outcome).toBe("success");
		if (claudeIntent.outcome !== "success") throw new Error("expected Claude create intent");
		const claude = buildLaunchPlan(state, claudeIntent.data, {
			home: "/home/test-user",
			environment: { PATH: "/usr/bin" },
			resolveExecutable: (provider: "pi" | "claude") => `/trusted/${provider}`,
		});
		expect(claude.outcome).toBe("success");
		if (claude.outcome !== "success") throw new Error("expected Claude launch plan");
		expect(claude.data.env).toEqual({
			CLAUDE_CONFIG_DIR: "/home/test-user/.claude-ein",
			ENGRAM_DATA_DIR: "/home/test-user/.engram-ein",
			PATH: "/home/test-user/.claude-ein/bin:/usr/bin",
		});
		expect(claude.data.argv).toEqual([]);
	});

	test("resolves only trusted provider executables and reports missing executable", () => {
		expect(resolveLaunchExecutable("pi", {
			environment: { PATH: "/definitely-missing" },
		})).toBeNull();
		const state = stateFor();
		const created = createSessionRequest("pi", state);
		if (created.outcome !== "success") throw new Error("expected create intent");
		const result = buildLaunchPlan(state, created.data, {
			home: "/home/test-user",
			environment: { PATH: "/definitely-missing" },
		});
		expect(result.outcome).toBe("unavailable");
		expect(result.error).toEqual({ code: "executable-unavailable" });
	});

	test("executes through a spy with no shell, output logging, or writes", async () => {
		const state = stateFor({ repository: false, cwd: "/tmp/project;echo no" });
		const created = createSessionRequest("pi", state);
		if (created.outcome !== "success") throw new Error("expected create intent");
		const planned = buildLaunchPlan(state, created.data, {
			home: "/home/test-user",
			environment: { PATH: "/usr/bin" },
			resolveExecutable: () => "/trusted/pi",
		});
		if (planned.outcome !== "success") throw new Error("expected launch plan");
		const before = readdirSync(TEST_SESSIONS_DIR, { withFileTypes: true }).map((entry) => entry.name);
		const calls: unknown[] = [];
		const result = await executeLaunchPlan(planned.data, async (input) => {
			calls.push(input);
			return { kind: "exit", code: 0 };
		});
		expect(result).toMatchObject({
			provider: "pi",
			operation: "launch",
			outcome: "success",
		});
		if (result.outcome !== "success") throw new Error("expected launch success");
		expect(result.data).toEqual({ exitCode: 0 });
		expect(calls).toEqual([{
			executable: "/trusted/pi",
			argv: [],
			cwd: "/tmp/project;echo no",
			env: {
				PI_CODING_AGENT_DIR: "/home/test-user/.pi-ein/agent",
				EIN_PI_AGENT_HOME: "/home/test-user/.pi-ein/agent",
				ENGRAM_DATA_DIR: "/home/test-user/.engram-ein",
			},
			shell: false,
			signal: expect.any(AbortSignal),
		}]);
		expect(readdirSync(TEST_SESSIONS_DIR, { withFileTypes: true }).map((entry) => entry.name)).toEqual(before);
		expect(JSON.stringify(result)).not.toContain("stdout");
		expect(JSON.stringify(result)).not.toContain("stderr");
	});

	test("normalizes cancellation before exit and never reports executor errors", async () => {
		const state = stateFor();
		const created = createSessionRequest("pi", state);
		if (created.outcome !== "success") throw new Error("expected create intent");
		const planned = buildLaunchPlan(state, created.data, {
			home: "/home/test-user",
			environment: { PATH: "/usr/bin" },
			resolveExecutable: () => "/trusted/pi",
		});
		if (planned.outcome !== "success") throw new Error("expected launch plan");

		const preAborted = new AbortController();
		preAborted.abort();
		let calls = 0;
		const cancelledBeforeSpawn = await executeLaunchPlan(
			planned.data,
			async () => {
				calls += 1;
				return { kind: "exit", code: 0 };
			},
			preAborted.signal,
		);
		expect(cancelledBeforeSpawn.outcome).toBe("cancelled");
		expect(calls).toBe(0);

		const aborting = new AbortController();
		const cancelledDuringSpawn = await executeLaunchPlan(
			planned.data,
			async () => {
				aborting.abort();
				throw new Error("/private/secret stdout");
			},
			aborting.signal,
		);
		expect(cancelledDuringSpawn.outcome).toBe("cancelled");
		expect(JSON.stringify(cancelledDuringSpawn)).not.toContain("secret");
	});

	test("normalizes exit, signal, and spawn-error outcomes without private diagnostics", async () => {
		const state = stateFor();
		const created = createSessionRequest("claude", state);
		if (created.outcome !== "success") throw new Error("expected create intent");
		const planned = buildLaunchPlan(state, created.data, {
			home: "/home/test-user",
			environment: { PATH: "/usr/bin" },
			resolveExecutable: () => "/trusted/claude",
		});
		if (planned.outcome !== "success") throw new Error("expected launch plan");

		const exited = await executeLaunchPlan(planned.data, async () => ({ kind: "exit", code: 23 }));
		expect(exited).toMatchObject({
			outcome: "error",
			error: { code: "process-exit", exitCode: 23 },
		});
		const signalled = await executeLaunchPlan(planned.data, async () => ({ kind: "signal", signal: "SIGTERM" }));
		expect(signalled).toMatchObject({
			outcome: "error",
			error: { code: "process-signalled", signal: "SIGTERM" },
		});
		const spawnFailed = await executeLaunchPlan(planned.data, async () => {
			throw new Error("secret=/private/secret stderr");
		});
		expect(spawnFailed).toMatchObject({
			outcome: "unavailable",
			error: { code: "spawn-failed" },
		});
		for (const result of [exited, signalled, spawnFailed]) {
			expect(JSON.stringify(result)).not.toContain("secret");
			expect(JSON.stringify(result)).not.toContain("stderr");
		}
	});

	test("fails closed before resolution for stale bindings, missing home, and mutable plans", async () => {
		const state = stateFor();
		const created = createSessionRequest("pi", state);
		if (created.outcome !== "success") throw new Error("expected create intent");
		let resolved = 0;
		const stale = buildLaunchPlan(state, {
			...created.data,
			project: { ...created.data.project, gitStateRef: "git-v1:sha256:" + "c".repeat(64) },
		}, {
			resolveExecutable: () => {
				resolved += 1;
				return "/trusted/pi";
			},
			home: "/home/test-user",
		});
		expect(stale.outcome).toBe("error");
		expect(stale.error?.code).toBe("project-mismatch");
		expect(resolved).toBe(0);

		const missingHome = buildLaunchPlan(state, created.data, {
			home: "",
			resolveExecutable: () => "/trusted/pi",
		});
		expect(missingHome.outcome).toBe("unavailable");
		expect(missingHome.error?.code).toBe("runtime-unavailable");

		const planned = buildLaunchPlan(state, created.data, {
			home: "/home/test-user",
			resolveExecutable: () => "/trusted/pi",
		});
		if (planned.outcome !== "success") throw new Error("expected launch plan");
		const malicious = { ...planned.data, argv: ["; cat secret"] };
		let spawned = false;
		const invalid = await executeLaunchPlan(malicious, async () => {
			spawned = true;
			return { kind: "exit", code: 0 };
		});
		expect(invalid.outcome).toBe("error");
		expect(invalid.error?.code).toBe("invalid-request");
		expect(spawned).toBe(false);
	});

	test("normalizes abort-after-exit and unknown signal without leaking input", async () => {
		const state = stateFor();
		const created = createSessionRequest("pi", state);
		if (created.outcome !== "success") throw new Error("expected create intent");
		const planned = buildLaunchPlan(state, created.data, {
			home: "/home/test-user",
			resolveExecutable: () => "/trusted/pi",
		});
		if (planned.outcome !== "success") throw new Error("expected launch plan");
		const aborting = new AbortController();
		const cancelled = await executeLaunchPlan(planned.data, async () => {
			aborting.abort();
			return { kind: "exit", code: 0 };
		}, aborting.signal);
		expect(cancelled.outcome).toBe("cancelled");

		const unknownSignal = await executeLaunchPlan(planned.data, async () => ({
			kind: "signal",
			signal: "private signal /etc/passwd",
		}));
		expect(unknownSignal).toMatchObject({
			outcome: "error",
			error: { code: "process-signalled", signal: "SIGUNKNOWN" },
		});
	});

	test("rejects every mutated provider isolation value before invoking the executor", async () => {
		const state = stateFor();
		const cases = [
			{
				provider: "pi" as const,
				mutations: [
					["PI_CODING_AGENT_DIR", "/home/test-user/.pi-ein/agent-mutated"],
					["EIN_PI_AGENT_HOME", "/home/test-user/.pi-ein/other"],
					["ENGRAM_DATA_DIR", "/home/test-user/.engram-ein-mutated"],
				] as const,
			},
			{
				provider: "claude" as const,
				mutations: [
					["CLAUDE_CONFIG_DIR", "/home/test-user/.claude-ein-mutated"],
					["ENGRAM_DATA_DIR", "/home/test-user/.engram-ein-mutated"],
					["PATH", "/home/test-user/.claude-ein/bin:/usr/bin:/mutated"],
				] as const,
			},
		] as const;

		for (const testCase of cases) {
			for (const [key, value] of testCase.mutations) {
				const created = createSessionRequest(testCase.provider, state);
				if (created.outcome !== "success") throw new Error("expected create intent");
				const planned = buildLaunchPlan(state, created.data, {
					home: "/home/test-user",
					environment: { PATH: "/usr/bin" },
					resolveExecutable: () => `/trusted/${testCase.provider}`,
				});
				if (planned.outcome !== "success") throw new Error("expected launch plan");
				Object.assign(planned.data.env, { [key]: value });

				let spawned = false;
				const invalid = await executeLaunchPlan(planned.data, async () => {
					spawned = true;
					return { kind: "exit", code: 0 };
				});
				expect(invalid).toMatchObject({
					provider: testCase.provider,
					operation: "launch",
					outcome: "error",
					error: { code: "invalid-request" },
				});
				expect(spawned).toBe(false);
			}
		}
	});
});
