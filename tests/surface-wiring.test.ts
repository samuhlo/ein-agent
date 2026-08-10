import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import type { CleanerFindingV1 } from "../ein-pi/agent/lib/cleaner-read-only-audit.ts";
import { projectProjectState, type ProjectStateV1 } from "../ein-pi/agent/lib/project-state.ts";
import { canonicalArea, serializeLedger } from "../ein-pi/agent/lib/reviewed-area-ledger.ts";
import { readWorkspaceLedger } from "../ein-pi/agent/lib/reviewed-area-ledger-store.ts";
import {
  CLEANER_BOUNDED_MUTATION_VERSION,
  type CleanerBoundedMutationRequestV1,
  type CleanerMutationDeclarationV1,
} from "../ein-pi/agent/lib/cleaner-bounded-mutations.ts";
import {
  CLEANER_REQUEST_VERSION,
  CLEANER_RESULT_VERSION,
  MAX_CLEANER_REQUEST_BYTES,
  createAuthorityMutationAdapters,
  createAuthorityReadAdapters,
  parseCleanerRequest,
  runCleanerRequest,
  runSurfaceRunner,
  type SurfaceRunnerAdapters,
} from "../ein-pi/agent/surfaces/surface-runner.ts";
import {
  CLAUDE_SURFACE_RUNNER_NAME,
  SURFACE_RUNNER_SOURCE,
  compileClaudeSurfaceRunnerPayload,
} from "../cc-ein/sync.ts";

function request(capability: "cleaner.audit" | "cleaner.mutate" | "cleaner.complete", input: Record<string, unknown> = {}) {
  return JSON.stringify({ version: CLEANER_REQUEST_VERSION, capability, input });
}

function adapters(calls: string[]): SurfaceRunnerAdapters {
  return {
    authorityReads: {
      audit: (input) => {
        calls.push(`audit:${String(input.marker ?? "")}`);
        return { status: "processed", reason: "audit-processed", payload: { mode: "read-only" } };
      },
      complete: (input) => {
        calls.push(`complete:${String(input.marker ?? "")}`);
        return { status: "processed", reason: "completion-assessed", payload: { complete: false } };
      },
    },
    mutationWriter: {
      mutate: (input) => {
        calls.push(`mutate:${String(input.marker ?? "")}`);
        return { status: "processed", reason: "verification-required", payload: { writes: 1 } };
      },
    },
    workbench: {
      invoke: async () => 0,
    },
  };
}

const STATE_REF = `git-v1:sha256:${"a".repeat(64)}`;
const STALE_STATE_REF = `git-v1:sha256:${"b".repeat(64)}`;
const EVIDENCE_REFERENCE = `review-evidence-v1:${"1".repeat(32)}`;
const EVIDENCE_DIGEST = `sha256:${"2".repeat(64)}`;
const REVIEWER_REFERENCE = `reviewer-v1:sha256:${"3".repeat(64)}`;

function authorityState(stateRef: string): ProjectStateV1 {
  return {
    schemaVersion: 1,
    identity: { cwd: "/project", repositoryRoot: "/project", quality: "current", reason: "read-success" },
    openspec: { quality: "current", reason: "read-success", activeChanges: [], selection: "none", provenance: "none", artifacts: [], blockers: [], verify: "absent", verifyStale: false },
    ein: { quality: "current", reason: "read-success", path: "/project/EIN.md", curated: { present: true, complete: true }, auto: { present: true } },
    git: { quality: "current", reason: "read-success", repository: true, root: "/project", dirty: false, complete: true, changes: [], stateRef },
    verification: { quality: "absent", reason: "not-found", reportedOutcome: "absent", effectiveOutcome: "absent", freshness: "unavailable", currentStateRef: stateRef },
    runtimes: {
      pi: { provider: "pi", availability: "not-provided", quality: "absent", reason: "not-provided", capabilities: [], references: [], errors: [] },
      claude: { provider: "claude", availability: "not-provided", quality: "absent", reason: "not-provided", capabilities: [], references: [], errors: [] },
    },
  };
}

function authorityAuditInput(stateRef = STATE_REF, evidence: Record<string, unknown> = { status: "unavailable" }) {
  const area = canonicalArea([{ kind: "file", path: "src/entry.ts" }]);
  return {
    area,
    input: {
      cwd: "/project",
      ledger: {
        schemaVersion: 1,
        records: [{
          area,
          status: "reviewed",
          evidence: { kind: "human-review", reference: EVIDENCE_REFERENCE, digest: EVIDENCE_DIGEST, reviewerRef: REVIEWER_REFERENCE },
          git: { stateRef },
        }],
      },
      assessments: [{ areaId: area.id, evidence }] as Array<{
        areaId: string;
        evidence: Record<string, unknown>;
        transition?: Record<string, unknown>;
      }>,
    },
  };
}

describe("shared surface runner contract", () => {
  test("protocol dispatches each supported cleaner capability through its explicit adapter", async () => {
    const calls: string[] = [];
    const deps = adapters(calls);

    const results = await Promise.all([
      runCleanerRequest(request("cleaner.audit", { marker: "a" }), deps),
      runCleanerRequest(request("cleaner.mutate", { marker: "m" }), deps),
      runCleanerRequest(request("cleaner.complete", { marker: "c" }), deps),
    ]);

    expect(calls).toEqual(["audit:a", "mutate:m", "complete:c"]);
    expect(results.map(({ version, capability, status, reason }) => ({ version, capability, status, reason }))).toEqual([
      { version: CLEANER_RESULT_VERSION, capability: "cleaner.audit", status: "processed", reason: "audit-processed" },
      { version: CLEANER_RESULT_VERSION, capability: "cleaner.mutate", status: "processed", reason: "verification-required" },
      { version: CLEANER_RESULT_VERSION, capability: "cleaner.complete", status: "processed", reason: "completion-assessed" },
    ]);
  });

  test("request validation rejects unknown keys and unsupported capabilities without invoking adapters", async () => {
    const calls: string[] = [];
    const deps = adapters(calls);
    const invalid = [
      JSON.stringify({ version: CLEANER_REQUEST_VERSION, capability: "cleaner.audit", input: {}, authority: true }),
      JSON.stringify({ version: CLEANER_REQUEST_VERSION, capability: "cleaner.erase", input: {} }),
      JSON.stringify({ version: "cleaner-surface-request/v2", capability: "cleaner.audit", input: {} }),
      `{"version":"${CLEANER_REQUEST_VERSION}","capability":"cleaner.audit","input":{"__proto__":{"privileged":true}}}`,
    ];

    const results = await Promise.all(invalid.map((raw) => runCleanerRequest(raw, deps)));

    expect(calls).toEqual([]);
    expect(results.every((result) => result.status === "usage-error")).toBe(true);
    expect(results.map((result) => result.reason)).toEqual([
      "unknown-request-key",
      "unsupported-capability",
      "unsupported-version",
      "unsafe-request-key",
    ]);
  });

  test("request parsing fails closed for malformed and oversized JSON", () => {
    const malformed = parseCleanerRequest("{not-json");
    const oversized = parseCleanerRequest("x".repeat(MAX_CLEANER_REQUEST_BYTES + 1));

    expect(malformed).toEqual({ ok: false, reason: "malformed-json" });
    expect(oversized).toEqual({ ok: false, reason: "request-too-large" });
  });

  test("protocol runner entrypoint keeps workbench invocation separate from cleaner JSON", async () => {
    const calls: string[] = [];
    const deps = adapters(calls);
    deps.workbench.invoke = async (args) => {
      calls.push(`workbench:${args.join(",")}`);
      return 64;
    };

    const workbench = await runSurfaceRunner(["workbench", "--project", "/tmp/example"], deps);
    const unsupported = await runSurfaceRunner(["other"], deps);

    expect(workbench).toEqual({ kind: "workbench", exitCode: 64 });
    expect(unsupported).toEqual({ kind: "activation-failure", reason: "unsupported-activation" });
    expect(calls).toEqual(["workbench:--project,/tmp/example"]);
  });

  test("diagnostic normalization bounds adapter failures and invalid status or reason", async () => {
    const privateFailure = adapters([]);
    privateFailure.authorityReads.audit = () => {
      throw new Error("\u001b[31m/private/home/project/secret.ts\u001b[0m\n" + "x".repeat(500));
    };
    const invalidResult = adapters([]);
    invalidResult.authorityReads.audit = () => ({ status: "success" as "processed", reason: "Raw /private/path" });

    const thrown = await runCleanerRequest(request("cleaner.audit"), privateFailure);
    const invalid = await runCleanerRequest(request("cleaner.audit"), invalidResult);

    expect(thrown).toEqual({
      version: CLEANER_RESULT_VERSION,
      capability: "cleaner.audit",
      status: "unavailable",
      reason: "adapter-failed",
      diagnostic: "Surface adapter failed",
    });
    expect(invalid).toEqual({
      version: CLEANER_RESULT_VERSION,
      capability: "cleaner.audit",
      status: "unavailable",
      reason: "invalid-adapter-result",
      diagnostic: "Surface adapter returned an invalid result",
    });
    expect(JSON.stringify([thrown, invalid])).not.toContain("private");
    expect(JSON.stringify([thrown, invalid]).length).toBeLessThan(512);
  });

  test("diagnostic failures remain equivalent and fail closed across cleaner capability branches", async () => {
    let workbenchCalls = 0;
    const fail = () => {
      throw new Error("internal path /private/project/file.ts");
    };
    const deps: SurfaceRunnerAdapters = {
      authorityReads: { audit: fail, complete: fail },
      mutationWriter: { mutate: fail },
      workbench: { invoke: () => ++workbenchCalls },
    };

    const results = await Promise.all([
      runCleanerRequest(request("cleaner.audit"), deps),
      runCleanerRequest(request("cleaner.mutate"), deps),
      runCleanerRequest(request("cleaner.complete"), deps),
    ]);

    expect(results.map(({ status, reason, diagnostic }) => ({ status, reason, diagnostic }))).toEqual([
      { status: "unavailable", reason: "adapter-failed", diagnostic: "Surface adapter failed" },
      { status: "unavailable", reason: "adapter-failed", diagnostic: "Surface adapter failed" },
      { status: "unavailable", reason: "adapter-failed", diagnostic: "Surface adapter failed" },
    ]);
    expect(workbenchCalls).toBe(0);
    expect(JSON.stringify(results)).not.toContain("private");
  });
});

// Group 2: production authority assembly recomputes B/G state for every audit.
describe("authority-owned audit read adapters", () => {
  test("authority audit keeps unavailable evidence unresolved without manufacturing verification", () => {
    const fixture = authorityAuditInput();
    const reads: string[] = [];
    const adapter = createAuthorityReadAdapters({
      readProjectState: (request) => {
        reads.push(request.cwd);
        return authorityState(STATE_REF);
      },
    });

    const result = adapter.audit(fixture.input);

    expect(reads).toEqual(["/project"]);
    expect(result).toMatchObject({
      status: "processed",
      reason: "audit-processed",
      payload: { version: "cleaner-audit-report/v1", mode: "read-only", appliedChanges: 0 },
    });
    expect((result as { payload: { findings: unknown[] } }).payload.findings[0]).toMatchObject({
      classification: "unresolved-question",
      g: { outcome: "unavailable", freshness: "unavailable", reason: "evidence-unavailable" },
      evidence: { status: "unavailable" },
      applied: false,
    });
  });

  test("authority audit recomputes stale ledger findings against the fresh project state", () => {
    const fixture = authorityAuditInput(STALE_STATE_REF, {
      status: "verified",
      reference: EVIDENCE_REFERENCE,
      digest: EVIDENCE_DIGEST,
      reviewerRef: REVIEWER_REFERENCE,
      areaId: "placeholder",
      stateRef: STALE_STATE_REF,
    });
    fixture.input.assessments[0]!.evidence.areaId = fixture.area.id;
    fixture.input.assessments[0]!.transition = {
      fromStateRef: STALE_STATE_REF,
      toStateRef: STATE_REF,
      complete: true,
      changes: [{ kind: "modified", path: "src/entry.ts" }],
    };
    const adapter = createAuthorityReadAdapters({ readProjectState: () => authorityState(STATE_REF) });

    const result = adapter.audit(fixture.input);

    expect((result as { payload: { findings: unknown[] } }).payload.findings[0]).toMatchObject({
      classification: "unresolved-question",
      g: { outcome: "stale", freshness: "stale", reason: "relevant-git-change" },
      applied: false,
    });
  });

  test("authority audit never treats a ledger evidence reference or mismatched resolution as verified", () => {
    const fixture = authorityAuditInput(STATE_REF, {
      status: "verified",
      reference: `review-evidence-v1:${"9".repeat(32)}`,
      digest: EVIDENCE_DIGEST,
      reviewerRef: REVIEWER_REFERENCE,
      areaId: "placeholder",
      stateRef: STATE_REF,
    });
    fixture.input.assessments[0]!.evidence.areaId = fixture.area.id;
    const adapter = createAuthorityReadAdapters({ readProjectState: () => authorityState(STATE_REF) });

    const result = adapter.audit(fixture.input);

    expect((result as { payload: { findings: unknown[] } }).payload.findings[0]).toMatchObject({
      classification: "unresolved-question",
      g: { outcome: "unknown", freshness: "unknown", reason: "evidence-mismatch" },
      evidence: { status: "verified" },
      applied: false,
    });
  });

  test("authority audit admits only matching verified evidence and rereads authority on every invocation", () => {
    const fixture = authorityAuditInput(STATE_REF, {
      status: "verified",
      reference: EVIDENCE_REFERENCE,
      digest: EVIDENCE_DIGEST,
      reviewerRef: REVIEWER_REFERENCE,
      areaId: "placeholder",
      stateRef: STATE_REF,
    });
    fixture.input.assessments[0]!.evidence.areaId = fixture.area.id;
    let reads = 0;
    const adapter = createAuthorityReadAdapters({ readProjectState: () => {
      reads += 1;
      return authorityState(STATE_REF);
    } });

    const first = adapter.audit(fixture.input);
    const second = adapter.audit(fixture.input);

    expect(reads).toBe(2);
    for (const result of [first, second]) {
      expect((result as { payload: { findings: unknown[] } }).payload.findings[0]).toMatchObject({
        classification: "observed-fact",
        severity: "info",
        confidence: "high",
        g: { outcome: "reviewed", freshness: "current", reason: "exact-git-binding" },
        evidence: { status: "verified", reference: EVIDENCE_REFERENCE, digest: EVIDENCE_DIGEST },
        applied: false,
      });
    }
  });
});

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function mutationFixture(options: { evidence?: Record<string, unknown>; writerThrows?: boolean; ledgerUnavailable?: boolean } = {}) {
  const audit = authorityAuditInput(STATE_REF, options.evidence ?? {
    status: "verified",
    reference: EVIDENCE_REFERENCE,
    digest: EVIDENCE_DIGEST,
    reviewerRef: REVIEWER_REFERENCE,
    areaId: "placeholder",
    stateRef: STATE_REF,
  });
  audit.input.assessments[0]!.evidence.areaId = audit.area.id;
  const readAdapter = createAuthorityReadAdapters({ readProjectState: () => authorityState(STATE_REF) });
  const auditResult = readAdapter.audit(audit.input) as { payload: { findings: CleanerFindingV1[] } };
  const finding = auditResult.payload.findings[0]!;
  const before = new TextEncoder().encode("prefix old suffix\n");
  const after = new TextEncoder().encode("prefix new suffix\n");
  const declaration = {
    version: "cleaner-declaration-v1",
    changeId: "surface-wiring",
    phase: "apply",
    areaId: audit.area.id,
    targetPath: "src/entry.ts",
    affectedSeam: "surface-cleanup",
    operation: { kind: "exact-replacement", before: "old", after: "new" },
    actorRef: `actor-v1:sha256:${"4".repeat(64)}`,
    reviewerRef: REVIEWER_REFERENCE,
    behaviorPreserved: true,
    expected: { stateRef: STATE_REF, beforeDigest: digest(before), afterDigest: digest(after) },
    verification: { commands: ["bun test tests/surface-wiring.test.ts --test-name-pattern mutate"] },
  } satisfies CleanerMutationDeclarationV1;
  const mutationRequest = {
    version: CLEANER_BOUNDED_MUTATION_VERSION,
    findingId: finding.id,
    declaration,
  } satisfies CleanerBoundedMutationRequestV1;
  let currentState = STATE_REF;
  let currentBytes = new Uint8Array(before);
  let writes = 0;
  let projectReads = 0;
  const assembled = createAuthorityMutationAdapters({
    readProjectState: () => {
      projectReads += 1;
      return authorityState(currentState);
    },
    readLedger: () => options.ledgerUnavailable
      ? { status: "unavailable", reason: "unreadable" }
      : { status: "valid", ledger: audit.input.ledger as never, digest: `sha256:${"5".repeat(64)}` },
    readTarget: () => ({ bytes: new Uint8Array(currentBytes), digest: digest(currentBytes), kind: "regular" }),
    writeTarget: (_root, _path, bytes) => {
      writes += 1;
      currentBytes = new Uint8Array(bytes);
      currentState = STALE_STATE_REF;
      if (options.writerThrows) throw new Error("indeterminate writer");
    },
  });
  return { finding, declaration, mutationRequest, audit, assembled, get writes() { return writes; }, get projectReads() { return projectReads; } };
}

// Group 3: mutation and completion are separate authority decisions.
describe("authority-owned mutate and complete adapters", () => {
  test("mutate recomputes the selected finding and performs one bounded write", () => {
    const fixture = mutationFixture();
    const result = fixture.assembled.mutationWriter.mutate({
      cwd: "/project",
      areaId: fixture.audit.area.id,
      evidence: fixture.audit.input.assessments[0]!.evidence,
      request: fixture.mutationRequest,
    });
    expect(result).toMatchObject({
      status: "processed", reason: "verification-required",
      payload: { status: "verification-required", transition: { observedStateRef: STATE_REF, resultingStateRef: STALE_STATE_REF } },
    });
    expect(fixture.writes).toBe(1);
    expect(fixture.projectReads).toBeGreaterThanOrEqual(4);
  });

  test("mutate blocks unavailable and stale authority before any write", () => {
    const unavailable = mutationFixture({ evidence: { status: "unavailable" } });
    const unavailableResult = unavailable.assembled.mutationWriter.mutate({
      cwd: "/project", areaId: unavailable.audit.area.id, evidence: { status: "unavailable" }, request: unavailable.mutationRequest,
    });
    expect(unavailableResult).toMatchObject({ status: "processed", payload: { status: "blocked" } });
    expect(unavailable.writes).toBe(0);

    const stale = mutationFixture();
    const staleRequest = { ...stale.mutationRequest, declaration: { ...stale.declaration, expected: { ...stale.declaration.expected, stateRef: STALE_STATE_REF } } };
    const staleResult = stale.assembled.mutationWriter.mutate({
      cwd: "/project", areaId: stale.audit.area.id, evidence: stale.audit.input.assessments[0]!.evidence, request: staleRequest,
    });
    expect(staleResult).toMatchObject({ status: "processed", payload: { status: "blocked", reason: "state-stale" } });
    expect(stale.writes).toBe(0);

    const unknownLedger = mutationFixture({ ledgerUnavailable: true });
    const unknownResult = unknownLedger.assembled.mutationWriter.mutate({
      cwd: "/project", areaId: unknownLedger.audit.area.id,
      evidence: unknownLedger.audit.input.assessments[0]!.evidence, request: unknownLedger.mutationRequest,
    });
    expect(unknownResult).toMatchObject({ status: "processed", payload: { status: "blocked", reason: "evidence-unavailable" } });
    expect(unknownLedger.writes).toBe(0);
  });

  test("mutate preserves an indeterminate single write as mutation-uncertain", () => {
    const fixture = mutationFixture({ writerThrows: true });
    const result = fixture.assembled.mutationWriter.mutate({
      cwd: "/project", areaId: fixture.audit.area.id, evidence: fixture.audit.input.assessments[0]!.evidence, request: fixture.mutationRequest,
    });
    expect(result).toMatchObject({ status: "processed", reason: "writer-failed", payload: { status: "mutation-uncertain", reason: "writer-failed" } });
    expect(fixture.writes).toBe(1);
  });

  test("complete rereads B and router authority without invoking mutation", () => {
    const fixture = mutationFixture();
    const completionState = authorityState(STALE_STATE_REF);
    completionState.verification = {
      quality: "current", reason: "read-success", reportedOutcome: "pass", effectiveOutcome: "pass", freshness: "current",
      currentStateRef: STALE_STATE_REF, observedStateRef: STALE_STATE_REF,
    };
    let completionReads = 0;
    const completion = createAuthorityMutationAdapters({ readProjectState: () => { completionReads += 1; return completionState; } });
    const result = completion.authorityReads.complete({
      cwd: "/project", selectedChange: "surface-wiring",
      transition: {
        version: "cleaner-state-transition-v1", findingId: fixture.finding.id, areaId: fixture.audit.area.id,
        targetPath: "src/entry.ts", observedStateRef: STATE_REF, resultingStateRef: STALE_STATE_REF,
        beforeDigest: fixture.declaration.expected.beforeDigest, afterDigest: fixture.declaration.expected.afterDigest,
      },
      verification: {
        version: "cleaner-verification-record-v1", outcome: "passed", actorRef: fixture.declaration.actorRef,
        commands: fixture.declaration.verification.commands, stateRef: STALE_STATE_REF,
      },
    });
    expect(result).toMatchObject({ status: "processed", reason: "verification-passed", payload: { status: "complete" } });
    expect(completionReads).toBe(1);
    expect(fixture.writes).toBe(0);
  });

  test("complete keeps missing or stale verification separate and verification-required", () => {
    const fixture = mutationFixture();
    const state = authorityState(STALE_STATE_REF);
    state.verification = {
      quality: "stale", reason: "stale-source", reportedOutcome: "pass", effectiveOutcome: "pass", freshness: "stale",
      currentStateRef: STALE_STATE_REF, observedStateRef: STATE_REF,
    };
    const completion = createAuthorityMutationAdapters({ readProjectState: () => state });
    const transition = {
      version: "cleaner-state-transition-v1", findingId: fixture.finding.id, areaId: fixture.audit.area.id,
      targetPath: "src/entry.ts", observedStateRef: STATE_REF, resultingStateRef: STALE_STATE_REF,
      beforeDigest: fixture.declaration.expected.beforeDigest, afterDigest: fixture.declaration.expected.afterDigest,
    };
    const stale = completion.authorityReads.complete({
      cwd: "/project", selectedChange: "surface-wiring", transition,
      verification: { version: "cleaner-verification-record-v1", outcome: "passed", actorRef: fixture.declaration.actorRef, commands: fixture.declaration.verification.commands, stateRef: STALE_STATE_REF },
    });
    const missing = completion.authorityReads.complete({ cwd: "/project", selectedChange: "surface-wiring", transition, verification: null });

    expect(stale).toMatchObject({ status: "processed", reason: "verification-stale", payload: { status: "verification-required" } });
    expect(missing).toMatchObject({ status: "processed", payload: { status: "verification-required" } });
    expect(fixture.writes).toBe(0);
  });
});

const PI_LAUNCHER_SOURCE = join(import.meta.dir, "..", "pi-ein", "pi-ein.fish");

type PiLauncherFixture = Readonly<{
  home: string;
  runnerPath: string;
  invoke: (args: readonly string[], stubExitCode?: number) => Readonly<{ exitCode: number; stdout: string; stderr: string; call: string[] }>;
  removeRunner: () => void;
  cleanup: () => void;
}>;

function piLauncherFixture(): PiLauncherFixture {
  const home = mkdtempSync(join(tmpdir(), "ein-pi-launcher-"));
  const binDir = join(home, "bin");
  const functionDir = join(home, ".config", "fish", "functions");
  const runnerPath = join(home, ".pi-ein", "agent", "surfaces", "surface-runner.ts");
  const launcherPath = join(functionDir, "pi-ein.fish");
  const callLog = join(home, "call.log");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(functionDir, { recursive: true });
  mkdirSync(join(runnerPath, ".."), { recursive: true });
  copyFileSync(PI_LAUNCHER_SOURCE, launcherPath);
  writeFileSync(runnerPath, "// shipped runner fixture\n");

  for (const command of ["pi", "bun"] as const) {
    writeFileSync(join(binDir, command), [
      "#!/bin/sh",
      `printf '%s\\n' '${command}' > \"$EIN_CALL_LOG\"`,
      "printf '%s\\n' \"$PI_CODING_AGENT_DIR\" \"$EIN_PI_AGENT_HOME\" >> \"$EIN_CALL_LOG\"",
      "for arg in \"$@\"; do printf '%s\\n' \"$arg\" >> \"$EIN_CALL_LOG\"; done",
      "exit \"${EIN_STUB_EXIT:-0}\"",
      "",
    ].join("\n"), { mode: 0o755 });
  }

  return {
    home,
    runnerPath,
    invoke(args, stubExitCode = 0) {
      rmSync(callLog, { force: true });
      const result = spawnSync("fish", ["-c", 'source "$EIN_LAUNCHER"; pi-ein $argv', "--", ...args], {
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
          EIN_CALL_LOG: callLog,
          EIN_LAUNCHER: launcherPath,
          EIN_STUB_EXIT: String(stubExitCode),
        },
      });
      return {
        exitCode: result.status ?? 1,
        stdout: result.stdout,
        stderr: result.stderr,
        call: Bun.file(callLog).size > 0
          ? readFileSync(callLog, "utf8").trimEnd().split("\n")
          : [],
      };
    },
    removeRunner: () => rmSync(runnerPath, { force: true }),
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

// Group 5: the Pi launcher owns only exact reserved namespaces.
describe("Pi pi-ein launcher adapter", () => {
  test("Pi dispatches cleaner audit, mutate, complete and workbench to the installed runner", () => {
    const fixture = piLauncherFixture();
    try {
      for (const args of [
        ["cleaner", "audit"],
        ["cleaner", "mutate"],
        ["cleaner", "complete"],
        ["workbench", "--project", "/tmp/example"],
      ]) {
        const result = fixture.invoke(args);
        expect(result.exitCode).toBe(0);
        expect(result.call).toEqual([
          "bun",
          join(fixture.home, ".pi-ein", "agent"),
          join(fixture.home, ".pi-ein", "agent"),
          fixture.runnerPath,
          ...args,
        ]);
        expect(`${result.stdout}${result.stderr}`).not.toContain(PI_LAUNCHER_SOURCE);
      }
    } finally {
      fixture.cleanup();
    }
  });

  test("Pi reserved activation preserves the shipped runner exit without falling through to pi", () => {
    const fixture = piLauncherFixture();
    try {
      const result = fixture.invoke(["workbench"], 64);
      expect(result.exitCode).toBe(64);
      expect(result.call[0]).toBe("bun");
      expect(result.call).not.toContain("pi");
    } finally {
      fixture.cleanup();
    }
  });

  test("Pi forwards malformed cleaner requests unchanged to shared runner validation", () => {
    const fixture = piLauncherFixture();
    try {
      const result = fixture.invoke(["cleaner", "{not-json"]);
      expect(result.exitCode).toBe(0);
      expect(result.call.slice(3)).toEqual([fixture.runnerPath, "cleaner", "{not-json"]);
    } finally {
      fixture.cleanup();
    }
  });

  test("pi-ein passthrough preserves every unrelated first argument and isolated environment", () => {
    const fixture = piLauncherFixture();
    try {
      for (const args of [[], ["--help"], ["cleaner-extra", "audit"], ["workbench-extra"], ["chat", "hello"]]) {
        const result = fixture.invoke(args);
        expect(result.exitCode).toBe(0);
        expect(result.call).toEqual([
          "pi",
          join(fixture.home, ".pi-ein", "agent"),
          join(fixture.home, ".pi-ein", "agent"),
          ...args,
        ]);
      }
    } finally {
      fixture.cleanup();
    }
  });

  test("Pi activation fails with a bounded diagnostic when the shipped runner is missing", () => {
    const fixture = piLauncherFixture();
    try {
      fixture.removeRunner();
      const result = fixture.invoke(["cleaner", "audit"]);
      expect(result.exitCode).toBe(69);
      expect(result.call).toEqual([]);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("pi-ein: surface runner unavailable");
      expect(result.stderr).not.toContain(fixture.home);
      expect(result.stderr.length).toBeLessThan(128);
    } finally {
      fixture.cleanup();
    }
  });
});

const CLAUDE_LAUNCHER_SOURCE = join(import.meta.dir, "..", "cc-ein", "cc-ein.fish");

describe("Claude runner sync payload", () => {
  test("Claude sync compiles the canonical shared runner closure into the isolated payload", () => {
    const root = mkdtempSync(join(tmpdir(), "ein-claude-payload-"));
    const destination = join(root, "bin", CLAUDE_SURFACE_RUNNER_NAME);
    const calls: string[][] = [];
    try {
      compileClaudeSurfaceRunnerPayload({
        destination,
        compile: (source, output) => {
          calls.push([source, output]);
          writeFileSync(output, `compiled:${readFileSync(source, "utf8").match(/cleaner-surface-request\/v1/)?.[0]}`);
        },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe(SURFACE_RUNNER_SOURCE);
      expect(readFileSync(destination, "utf8")).toBe(`compiled:${CLEANER_REQUEST_VERSION}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Claude sync fails closed when compilation produces no payload and removes a stale runner", () => {
    const root = mkdtempSync(join(tmpdir(), "ein-claude-payload-"));
    const destination = join(root, "bin", CLAUDE_SURFACE_RUNNER_NAME);
    mkdirSync(join(destination, ".."), { recursive: true });
    writeFileSync(destination, "stale-runner");
    try {
      expect(() => compileClaudeSurfaceRunnerPayload({ destination, compile: () => undefined }))
        .toThrow("SURFACE_RUNNER_PAYLOAD_MISSING");
      expect(existsSync(destination)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Claude sync fails closed on compile failure without retaining a stale runner", () => {
    const root = mkdtempSync(join(tmpdir(), "ein-claude-payload-"));
    const destination = join(root, "bin", CLAUDE_SURFACE_RUNNER_NAME);
    mkdirSync(join(destination, ".."), { recursive: true });
    writeFileSync(destination, "stale-runner");
    try {
      expect(() => compileClaudeSurfaceRunnerPayload({
        destination,
        compile: () => { throw new Error("compiler unavailable"); },
      })).toThrow("SURFACE_RUNNER_COMPILE_FAILED");
      expect(existsSync(destination)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Claude sync treats payload promotion failure as required and leaves no runnable artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "ein-claude-payload-"));
    const destination = join(root, "bin", CLAUDE_SURFACE_RUNNER_NAME);
    try {
      expect(() => compileClaudeSurfaceRunnerPayload({
        destination,
        compile: (_source, output) => writeFileSync(output, "compiled-runner"),
        install: () => { throw new Error("destination unavailable"); },
      })).toThrow("SURFACE_RUNNER_PAYLOAD_INSTALL_FAILED");
      expect(existsSync(destination)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

type ClaudeLauncherFixture = Readonly<{
  home: string;
  runnerPath: string;
  invoke: (args: readonly string[], stubExitCode?: number) => Readonly<{ exitCode: number; stdout: string; stderr: string; call: string[] }>;
  removeRunner: () => void;
  cleanup: () => void;
}>;

function claudeLauncherFixture(): ClaudeLauncherFixture {
  const home = mkdtempSync(join(tmpdir(), "ein-claude-launcher-"));
  const binDir = join(home, "bin");
  const functionDir = join(home, ".config", "fish", "functions");
  const runnerPath = join(home, ".claude-ein", "bin", CLAUDE_SURFACE_RUNNER_NAME);
  const launcherPath = join(functionDir, "cc-ein.fish");
  const callLog = join(home, "call.log");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(functionDir, { recursive: true });
  mkdirSync(join(runnerPath, ".."), { recursive: true });
  copyFileSync(CLAUDE_LAUNCHER_SOURCE, launcherPath);

  for (const command of ["claude", runnerPath] as const) {
    writeFileSync(command === "claude" ? join(binDir, command) : command, [
      "#!/bin/sh",
      `printf '%s\\n' '${command === "claude" ? "claude" : "runner"}' > \"$EIN_CALL_LOG\"`,
      "printf '%s\\n' \"$CLAUDE_CONFIG_DIR\" >> \"$EIN_CALL_LOG\"",
      "for arg in \"$@\"; do printf '%s\\n' \"$arg\" >> \"$EIN_CALL_LOG\"; done",
      "exit \"${EIN_STUB_EXIT:-0}\"",
      "",
    ].join("\n"), { mode: 0o755 });
  }

  return {
    home,
    runnerPath,
    invoke(args, stubExitCode = 0) {
      rmSync(callLog, { force: true });
      const result = spawnSync("fish", ["-c", 'source "$EIN_LAUNCHER"; cc-ein $argv', "--", ...args], {
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
          EIN_CALL_LOG: callLog,
          EIN_LAUNCHER: launcherPath,
          EIN_STUB_EXIT: String(stubExitCode),
        },
      });
      return {
        exitCode: result.status ?? 1,
        stdout: result.stdout,
        stderr: result.stderr,
        call: existsSync(callLog) ? readFileSync(callLog, "utf8").trimEnd().split("\n") : [],
      };
    },
    removeRunner: () => rmSync(runnerPath, { force: true }),
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

describe("Claude cc-ein launcher adapter", () => {
  test("Claude dispatches cleaner and workbench to the compiled payload with isolated config", () => {
    const fixture = claudeLauncherFixture();
    try {
      for (const args of [["cleaner", "audit"], ["cleaner", "mutate"], ["cleaner", "complete"], ["workbench", "--project", "/tmp/example"]]) {
        const result = fixture.invoke(args);
        expect(result.exitCode).toBe(0);
        expect(result.call).toEqual(["runner", join(fixture.home, ".claude-ein"), ...args]);
        expect(`${result.stdout}${result.stderr}`).not.toContain(CLAUDE_LAUNCHER_SOURCE);
      }
    } finally {
      fixture.cleanup();
    }
  });

  test("Claude preserves unrelated passthrough arguments and isolated config", () => {
    const fixture = claudeLauncherFixture();
    try {
      for (const args of [[], ["--help"], ["cleaner-extra", "audit"], ["workbench-extra"], ["chat", "hello"]]) {
        const result = fixture.invoke(args);
        expect(result.exitCode).toBe(0);
        expect(result.call).toEqual(["claude", join(fixture.home, ".claude-ein"), ...args]);
      }
    } finally {
      fixture.cleanup();
    }
  });

  test("Claude reserved activation preserves payload exit and fails boundedly when payload is absent", () => {
    const fixture = claudeLauncherFixture();
    try {
      const failed = fixture.invoke(["workbench"], 64);
      expect(failed.exitCode).toBe(64);
      expect(failed.call[0]).toBe("runner");

      fixture.removeRunner();
      const missing = fixture.invoke(["cleaner", "audit"]);
      expect(missing.exitCode).toBe(69);
      expect(missing.call).toEqual([]);
      expect(missing.stdout).toBe("");
      expect(missing.stderr.trim()).toBe("cc-ein: surface runner unavailable");
      expect(missing.stderr).not.toContain(fixture.home);
    } finally {
      fixture.cleanup();
    }
  });
});

// Group 7: execute copied deployment closures through the real Fish launchers.
type InstalledRuntime = "pi" | "claude";

function installedSurfaceFixture(runtime: InstalledRuntime) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `ein-installed-${runtime}-`)));
  const home = join(root, "home");
  const project = join(root, "project");
  const binDir = join(root, "bin");
  const functionDir = join(home, ".config", "fish", "functions");
  const sourceAgent = join(import.meta.dir, "..", "ein-pi", "agent");
  const isolatedRoot = join(home, runtime === "pi" ? ".pi-ein" : ".claude-ein");
  const installedAgent = join(isolatedRoot, "agent");
  const launcherName = runtime === "pi" ? "pi-ein" : "cc-ein";
  const launcherSource = runtime === "pi" ? PI_LAUNCHER_SOURCE : CLAUDE_LAUNCHER_SOURCE;
  const launcherPath = join(functionDir, `${launcherName}.fish`);
  const vanillaHome = join(home, runtime === "pi" ? ".pi" : ".claude");
  const vanillaMarker = join(vanillaHome, "untouched");
  mkdirSync(functionDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(project, { recursive: true });
  mkdirSync(vanillaHome, { recursive: true });
  writeFileSync(vanillaMarker, "vanilla-home\n");
  copyFileSync(launcherSource, launcherPath);
  cpSync(sourceAgent, installedAgent, { recursive: true });

  const runnerPath = runtime === "pi"
    ? join(installedAgent, "surfaces", "surface-runner.ts")
    : join(isolatedRoot, "bin", CLAUDE_SURFACE_RUNNER_NAME);
  if (runtime === "claude") {
    mkdirSync(join(runnerPath, ".."), { recursive: true });
    writeFileSync(runnerPath, '#!/bin/sh\nexec bun "$CLAUDE_CONFIG_DIR/agent/surfaces/surface-runner.ts" "$@"\n', { mode: 0o755 });
  }
  const vanillaExecutable = runtime === "pi" ? "pi" : "claude";
  writeFileSync(join(binDir, vanillaExecutable), "#!/bin/sh\nprintf 'vanilla:%s\\n' \"$*\"\n", { mode: 0o755 });

  return {
    home,
    project,
    runnerPath,
    invoke(args: readonly string[]) {
      return spawnSync("fish", ["-c", `source \"$EIN_LAUNCHER\"; ${launcherName} $argv`, "--", ...args], {
        cwd: project,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
          EIN_LAUNCHER: launcherPath,
        },
      });
    },
    assertVanillaUntouched() {
      expect(readFileSync(vanillaMarker, "utf8")).toBe("vanilla-home\n");
      expect(existsSync(join(vanillaHome, "agent"))).toBe(false);
      expect(existsSync(join(vanillaHome, "sessions"))).toBe(false);
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function parseInstalledResult(result: ReturnType<ReturnType<typeof installedSurfaceFixture>["invoke"]>) {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout) as {
    status: string;
    reason: string;
    payload?: Record<string, unknown>;
  };
}

function initializeMutationProject(project: string) {
  mkdirSync(join(project, "src"), { recursive: true });
  mkdirSync(join(project, "openspec"), { recursive: true });
  writeFileSync(join(project, "src", "entry.ts"), "prefix old suffix\n");
  writeFileSync(join(project, ".gitignore"), "openspec/reviewed-area-ledger.json\n");
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "Ein Test",
    GIT_AUTHOR_EMAIL: "ein@example.invalid",
    GIT_COMMITTER_NAME: "Ein Test",
    GIT_COMMITTER_EMAIL: "ein@example.invalid",
    GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  };
  for (const args of [["init", "-q"], ["add", "."], ["commit", "-q", "-m", "fixture"]]) {
    const git = spawnSync("git", args, { cwd: project, encoding: "utf8", env: gitEnv });
    expect(git.status).toBe(0);
  }

  const state = projectProjectState({ cwd: project, selectedChange: "surface-wiring" });
  const stateRef = state.git.stateRef;
  expect(stateRef).toMatch(/^git-v1:sha256:[0-9a-f]{64}$/);
  // toMatch proves it at runtime but does not narrow the optional away.
  if (!stateRef) throw new Error("expected a git state ref");
  const area = canonicalArea([{ kind: "file", path: "src/entry.ts" }]);
  const evidence = {
    status: "verified",
    reference: EVIDENCE_REFERENCE,
    digest: EVIDENCE_DIGEST,
    reviewerRef: REVIEWER_REFERENCE,
    areaId: area.id,
    stateRef,
  };
  const ledger = {
    schemaVersion: 1,
    records: [{
      area,
      status: "reviewed",
      evidence: { kind: "human-review", reference: EVIDENCE_REFERENCE, digest: EVIDENCE_DIGEST, reviewerRef: REVIEWER_REFERENCE },
      git: { stateRef },
    }],
  };
  writeFileSync(join(project, "openspec", "reviewed-area-ledger.json"), serializeLedger(ledger));
  expect(readWorkspaceLedger(project)).toMatchObject({ status: "valid" });
  expect(projectProjectState({ cwd: project, selectedChange: "surface-wiring" }).git.stateRef).toBe(stateRef);
  const audit = createAuthorityReadAdapters().audit({ cwd: project, ledger, assessments: [{ areaId: area.id, evidence }] }) as {
    payload: { findings: CleanerFindingV1[] };
  };
  const finding = audit.payload.findings[0]!;
  const before = new TextEncoder().encode("prefix old suffix\n");
  const after = new TextEncoder().encode("prefix new suffix\n");
  const declaration = {
    version: "cleaner-declaration-v1",
    changeId: "surface-wiring",
    phase: "apply",
    areaId: area.id,
    targetPath: "src/entry.ts",
    affectedSeam: "installed-surface",
    operation: { kind: "exact-replacement", before: "old", after: "new" },
    actorRef: `actor-v1:sha256:${"4".repeat(64)}`,
    reviewerRef: REVIEWER_REFERENCE,
    behaviorPreserved: true,
    expected: { stateRef, beforeDigest: digest(before), afterDigest: digest(after) },
    verification: { commands: ["bun test tests/surface-wiring.test.ts"] },
  } satisfies CleanerMutationDeclarationV1;
  return {
    area,
    evidence,
    mutation: request("cleaner.mutate", {
      cwd: project,
      areaId: area.id,
      evidence,
      request: { version: CLEANER_BOUNDED_MUTATION_VERSION, findingId: finding.id, declaration },
    }),
  };
}

describe("installed surface seam and isolation", () => {
  test("real Pi and Claude deployments reject malformed cleaner input and preserve workbench non-TTY behavior", () => {
    for (const runtime of ["pi", "claude"] as const) {
      const fixture = installedSurfaceFixture(runtime);
      try {
        const malformed = fixture.invoke(["cleaner", "{not-json"]);
        expect(malformed.status).toBe(64);
        expect(JSON.parse(malformed.stdout)).toEqual({
          version: CLEANER_RESULT_VERSION,
          capability: "unknown",
          status: "usage-error",
          reason: "malformed-json",
        });
        expect(malformed.stderr).toBe("");

        const workbench = fixture.invoke(["workbench"]);
        expect(workbench.status).toBe(2);
        expect(workbench.stdout).toContain("Workbench requires TTY stdin and stdout");
        fixture.assertVanillaUntouched();
      } finally {
        fixture.cleanup();
      }
    }
  });

  test("installed audit is parity-safe while unsafe, oversized, missing, and passthrough activation fail closed", () => {
    const fixtures = (["pi", "claude"] as const).map(installedSurfaceFixture);
    try {
      const area = canonicalArea([{ kind: "file", path: "src/entry.ts" }]);
      const auditInput = {
        cwd: fixtures[0]!.project,
        ledger: {
          schemaVersion: 1,
          records: [{
            area,
            status: "reviewed",
            evidence: { kind: "human-review", reference: EVIDENCE_REFERENCE, digest: EVIDENCE_DIGEST, reviewerRef: REVIEWER_REFERENCE },
            git: { stateRef: STATE_REF },
          }],
        },
        assessments: [{ areaId: area.id, evidence: { status: "unavailable" } }],
      };
      const normalized = fixtures.map((fixture) => {
        auditInput.cwd = fixture.project;
        const result = fixture.invoke(["cleaner", request("cleaner.audit", auditInput)]);
        expect(result.status).toBe(0);
        const parsed = parseInstalledResult(result);
        expect(parsed).toMatchObject({
          status: "processed",
          reason: "audit-processed",
          payload: { version: "cleaner-audit-report/v1", mode: "read-only", appliedChanges: 0 },
        });
        return { status: parsed.status, reason: parsed.reason, payload: parsed.payload };
      });
      expect(normalized[0]).toEqual(normalized[1]);

      for (const fixture of fixtures) {
        const unsafe = fixture.invoke(["cleaner", `{"version":"${CLEANER_REQUEST_VERSION}","capability":"cleaner.audit","input":{"constructor":{}}}`]);
        expect(unsafe.status).toBe(64);
        expect(parseInstalledResult(unsafe)).toMatchObject({ status: "usage-error", reason: "unsafe-request-key" });

        const oversized = fixture.invoke(["cleaner", "x".repeat(MAX_CLEANER_REQUEST_BYTES + 1)]);
        expect(oversized.status).toBe(64);
        expect(parseInstalledResult(oversized)).toMatchObject({ status: "usage-error", reason: "request-too-large" });

        const passthrough = fixture.invoke(["chat", "hello"]);
        expect(passthrough.status).toBe(0);
        expect(passthrough.stdout.trim()).toBe("vanilla:chat hello");
        fixture.assertVanillaUntouched();

        rmSync(fixture.runnerPath, { force: true });
        const missing = fixture.invoke(["cleaner", request("cleaner.audit", auditInput)]);
        expect(missing.status).toBe(69);
        expect(missing.stderr).toContain("surface runner unavailable");
        expect(missing.stderr).not.toContain(fixture.home);
      }
    } finally {
      for (const fixture of fixtures) fixture.cleanup();
    }
  });

  test("installed mutate writes once, complete stays separate, and symlink or writer failures remain safe", () => {
    for (const runtime of ["pi", "claude"] as const) {
      const valid = installedSurfaceFixture(runtime);
      try {
        const seam = initializeMutationProject(valid.project);
        const mutation = valid.invoke(["cleaner", seam.mutation]);
        expect(mutation.status).toBe(0);
        const applied = parseInstalledResult(mutation);
        expect(applied).toMatchObject({ status: "processed", reason: "verification-required", payload: { status: "verification-required" } });
        expect(readFileSync(join(valid.project, "src", "entry.ts"), "utf8")).toBe("prefix new suffix\n");

        const transition = (applied.payload as { transition: Record<string, unknown> }).transition;
        const completion = valid.invoke(["cleaner", request("cleaner.complete", {
          cwd: valid.project,
          selectedChange: "surface-wiring",
          transition,
          verification: null,
        })]);
        expect(completion.status).toBe(0);
        expect(parseInstalledResult(completion)).toMatchObject({ status: "processed", payload: { status: "verification-required" } });
        valid.assertVanillaUntouched();
      } finally {
        valid.cleanup();
      }

      const symlink = installedSurfaceFixture(runtime);
      try {
        const seam = initializeMutationProject(symlink.project);
        const target = join(symlink.project, "src", "entry.ts");
        const outside = join(symlink.home, "outside.ts");
        writeFileSync(outside, "outside-safe\n");
        rmSync(target);
        symlinkSync(outside, target);
        const rejected = symlink.invoke(["cleaner", seam.mutation]);
        expect(rejected.status).toBe(0);
        expect(parseInstalledResult(rejected)).toMatchObject({ status: "processed", payload: { status: "blocked" } });
        expect(readFileSync(outside, "utf8")).toBe("outside-safe\n");
        symlink.assertVanillaUntouched();
      } finally {
        symlink.cleanup();
      }

      const writerFailure = installedSurfaceFixture(runtime);
      try {
        const seam = initializeMutationProject(writerFailure.project);
        const target = join(writerFailure.project, "src", "entry.ts");
        chmodSync(target, 0o444);
        const failed = writerFailure.invoke(["cleaner", seam.mutation]);
        expect(failed.status).toBe(0);
        expect(parseInstalledResult(failed)).toMatchObject({ status: "processed", reason: "writer-failed", payload: { status: "mutation-uncertain" } });
        expect(readFileSync(target, "utf8")).toBe("prefix old suffix\n");
        writerFailure.assertVanillaUntouched();
      } finally {
        writerFailure.cleanup();
      }
    }
  });
});
