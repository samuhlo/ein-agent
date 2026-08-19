// =============================================================================
// TESTS: explicit cc-ein-sdd OpenSpec synchronization contract (group 003)
// =============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SDD_CLI_PATH = join(ROOT, "cc-ein", "sdd-cli", "cli.ts");

type CliRun = { status: number | null; stdout: string; stderr: string };

function runSddCli(cwd: string, args: string[], input = ""): CliRun {
  const result = spawnSync(process.execPath, [SDD_CLI_PATH, ...args], {
    cwd,
    input,
    encoding: "utf8",
    env: { ...process.env, CC_EIN_NO_GIT_INIT: "1" },
  });
  return {
    status: result.status,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

function makeOpenSpecFixture(change: string): string {
  const cwd = mkdtempSync(join(tmpdir(), "core-parity-sync-"));
  mkdirSync(join(cwd, "openspec", "changes", change, "specs", "alpha"), { recursive: true });
  mkdirSync(join(cwd, "openspec", "changes", change, "specs", "zeta"), { recursive: true });
  mkdirSync(join(cwd, "openspec", "specs", "alpha"), { recursive: true });
  mkdirSync(join(cwd, "openspec", "specs", "zeta"), { recursive: true });
  writeFileSync(join(cwd, "openspec", "changes", change, "specs", "alpha", "spec.md"), deltaFor("alpha", "alpha-added"));
  writeFileSync(join(cwd, "openspec", "changes", change, "specs", "zeta", "spec.md"), deltaFor("zeta", "zeta-added"));
  writeFileSync(join(cwd, "openspec", "specs", "alpha", "spec.md"), baseFor("alpha"));
  writeFileSync(join(cwd, "openspec", "specs", "zeta", "spec.md"), baseFor("zeta"));
  return cwd;
}

function deltaFor(domain: string, scenarioId: string): string {
  return [
    "# OpenSpec Delta",
    "format: openspec-delta/v1",
    `domain: ${domain}`,
    "",
    "## ADDED",
    `### Scenario: ${scenarioId}`,
    `title: ${scenarioId}`,
    `requirement: The system MUST retain ${scenarioId}`,
    "Given: an input",
    "When: it runs",
    "Then: it succeeds",
    "",
  ].join("\n");
}

function baseFor(domain: string, scenarioId?: string): string {
  const lines = [
    "# OpenSpec Specification",
    "format: openspec-spec/v1",
    `domain: ${domain}`,
    "",
  ];
  if (scenarioId) {
    lines.push(
      `## Scenario: ${scenarioId}`,
      `title: ${scenarioId}`,
      `requirement: The system MUST retain ${scenarioId}`,
      "Given: an input",
      "When: it runs",
      "Then: it succeeds",
      "",
    );
  }
  return lines.join("\n");
}

function parseCliJson(run: CliRun): Record<string, unknown> {
  expect(run.stderr).toBe("");
  expect(run.stdout.endsWith("\n")).toBe(true);
  const parsed = JSON.parse(run.stdout) as Record<string, unknown>;
  expect(Object.keys(parsed)).toEqual([
    "command",
    "change",
    "ok",
    "outcome",
    "canonicalChanged",
    "domains",
    "report",
    "code",
    "message",
  ]);
  return parsed;
}

const RECONCILIATION_PROFILE = "scope-only-out-of-flow";
const RECONCILIATION_REASON = "Delivery predated the SDD lifecycle rollout.";

function makeReconciliationFixture(change: string): { cwd: string; source: string; evidencePath: string } {
  const cwd = mkdtempSync(join(tmpdir(), "core-parity-close-"));
  const source = join(cwd, "openspec", "changes", change);
  mkdirSync(source, { recursive: true });
  const summary = [
    "# Out-of-flow reconciliation",
    "Delivery occurred outside SDD.",
    "Excluded lifecycle artifacts: map.md, design.md, tasks.md, apply-progress.md, verify-report.md.",
    "## Repository verification",
    "- claude-cli",
    "## Successor changes",
    "None.",
    "",
  ].join("\n");
  writeFileSync(join(source, "scope.md"), "# Historical scope\n");
  writeFileSync(join(source, "summary.md"), summary);
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "tests@example.invalid"], { cwd });
  execFileSync("git", ["config", "user.name", "Ein tests"], { cwd });
  execFileSync("git", ["add", "."], { cwd });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd });
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const identity = {
    head: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    capturedAt: "2026-01-01T00:00:00.000Z",
  };
  const evidence = {
    format: "ein-out-of-flow-reconciliation/v1",
    profile: RECONCILIATION_PROFILE,
    change,
    auditReason: RECONCILIATION_REASON,
    createdAt: "2026-01-01T00:10:00.000Z",
    summary: {
      path: "summary.md",
      sha256: createHash("sha256").update(summary).digest("hex"),
      bytes: Buffer.byteLength(summary, "utf8"),
    },
    repositoryState: identity,
    repositoryChecks: [{
      id: "claude-cli",
      performed: "bun test tests/core-parity-openspec.test.ts",
      outcome: "pass",
      completedAt: "2026-01-01T00:05:00.000Z",
      evidenceRef: "ci://run/claude#close",
      repositoryState: identity,
    }],
  };
  writeFileSync(join(source, "out-of-flow-reconciliation.json"), JSON.stringify(evidence));
  return { cwd, source, evidencePath: `openspec/changes/${change}/out-of-flow-reconciliation.json` };
}

describe("cc-ein-sdd close reconciliation flags", () => {
  test("translates explicit profile, canonical evidence, and reason into shared close success", () => {
    const fixture = makeReconciliationFixture("claude-close-success");
    try {
      const run = runSddCli(fixture.cwd, [
        "close",
        "claude-close-success",
        "--reconciliation-profile", RECONCILIATION_PROFILE,
        "--reconciliation-evidence", fixture.evidencePath,
        "--reason", RECONCILIATION_REASON,
      ]);
      expect(run.status).toBe(0);
      expect(run.stderr).toBe("");
      expect(run.stdout).toContain("claude-close-success archived");
      expect(existsSync(fixture.source)).toBe(false);
      expect(existsSync(join(fixture.cwd, "openspec", "changes", "archive", "claude-close-success"))).toBe(true);
    } finally {
      rmSync(fixture.cwd, { recursive: true, force: true });
    }
  });

  test("preserves shared blocker reporting and failure exit for reason mismatch and mixed mode", () => {
    for (const [change, extraArgs, blocker] of [
      ["claude-close-reason", ["--reason", "Different audit reason"], "reconciliation-audit-reason-mismatch"],
      ["claude-close-mixed", ["--reason", RECONCILIATION_REASON, "--force"], "reconciliation-mixed-mode"],
    ] as const) {
      const fixture = makeReconciliationFixture(change);
      try {
        const run = runSddCli(fixture.cwd, [
          "close", change,
          "--reconciliation-profile", RECONCILIATION_PROFILE,
          "--reconciliation-evidence", fixture.evidencePath,
          ...extraArgs,
        ]);
        expect(run.status).toBe(1);
        expect(run.stdout).toContain(`[${blocker}]`);
        expect(existsSync(fixture.source)).toBe(true);
      } finally {
        rmSync(fixture.cwd, { recursive: true, force: true });
      }
    }
  });

  test("rejects a non-canonical evidence request through the shared blocker contract", () => {
    const fixture = makeReconciliationFixture("claude-close-path");
    try {
      const run = runSddCli(fixture.cwd, [
        "close", "claude-close-path",
        "--reconciliation-profile", RECONCILIATION_PROFILE,
        "--reconciliation-evidence", "copied-evidence.json",
        "--reason", RECONCILIATION_REASON,
      ]);
      expect(run.status).toBe(1);
      expect(run.stdout).toContain("[reconciliation-evidence-path-invalid]");
      expect(existsSync(fixture.source)).toBe(true);
    } finally {
      rmSync(fixture.cwd, { recursive: true, force: true });
    }
  });

  test("check remains non-archival and keeps its existing report/exit behavior", () => {
    const fixture = makeReconciliationFixture("claude-check-only");
    try {
      const run = runSddCli(fixture.cwd, ["check", "claude-check-only"]);
      expect(run.status).toBe(1);
      expect(run.stdout).toContain("sdd check — claude-check-only");
      expect(run.stdout).toContain("errors:");
      expect(existsSync(fixture.source)).toBe(true);
      expect(existsSync(join(fixture.cwd, "openspec", "changes", "archive", "claude-check-only"))).toBe(false);
    } finally {
      rmSync(fixture.cwd, { recursive: true, force: true });
    }
  });
});

describe("cc-ein-sdd sync <change>", () => {
  test("synchronizes with stable JSON, sorted domains, and idempotence", () => {
    const cwd = makeOpenSpecFixture("sync-contract");
    try {
      const first = runSddCli(cwd, ["sync", "sync-contract"]);
      expect(first.status).toBe(0);
      expect(first.stdout).toBe(JSON.stringify({
        command: "sync",
        change: "sync-contract",
        ok: true,
        outcome: "synchronized",
        canonicalChanged: true,
        domains: ["alpha", "zeta"],
        report: "openspec/changes/sync-contract/sync-report.md",
        code: null,
        message: null,
      }) + "\n");

      const second = runSddCli(cwd, ["sync", "sync-contract"]);
      expect(second.status).toBe(0);
      expect(second.stdout).toBe(JSON.stringify({
        command: "sync",
        change: "sync-contract",
        ok: true,
        outcome: "synchronized",
        canonicalChanged: false,
        domains: ["alpha", "zeta"],
        report: "openspec/changes/sync-contract/sync-report.md",
        code: null,
        message: null,
      }) + "\n");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("reports conflict without changing canonical bytes", () => {
    const cwd = mkdtempSync(join(tmpdir(), "core-parity-conflict-"));
    try {
      const change = "conflict-contract";
      mkdirSync(join(cwd, "openspec", "changes", change, "specs", "alpha"), { recursive: true });
      mkdirSync(join(cwd, "openspec", "specs", "alpha"), { recursive: true });
      writeFileSync(join(cwd, "openspec", "changes", change, "specs", "alpha", "spec.md"), deltaFor("alpha", "same"));
      const canonicalPath = join(cwd, "openspec", "specs", "alpha", "spec.md");
      const canonical = baseFor("alpha", "same");
      writeFileSync(canonicalPath, canonical);

      const result = runSddCli(cwd, ["sync", change]);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe(JSON.stringify({
        command: "sync",
        change,
        ok: false,
        outcome: "conflict",
        canonicalChanged: false,
        domains: ["alpha"],
        report: `openspec/changes/${change}/sync-report.md`,
        code: "OPENSPEC_CONFLICT",
        message: "canonical OpenSpec bytes were not changed",
      }) + "\n");
      expect(readFileSync(canonicalPath, "utf8")).toBe(canonical);
      expect(existsSync(join(cwd, "openspec", "changes", change, "sync-report.md"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("maps malformed, missing, unsafe, operational, and usage outcomes", () => {
    const malformed = mkdtempSync(join(tmpdir(), "core-parity-malformed-"));
    try {
      mkdirSync(join(malformed, "openspec", "changes", "bad", "specs", "alpha"), { recursive: true });
      writeFileSync(join(malformed, "openspec", "changes", "bad", "specs", "alpha", "spec.md"), "not OpenSpec\n");
      const result = runSddCli(malformed, ["sync", "bad"]);
      expect(result.status).toBe(3);
      expect(parseCliJson(result)).toMatchObject({ command: "sync", change: "bad", ok: false, outcome: "malformed", canonicalChanged: false, domains: [], report: null, code: "MALFORMED_OPENSPEC" });
    } finally {
      rmSync(malformed, { recursive: true, force: true });
    }

    const missing = mkdtempSync(join(tmpdir(), "core-parity-missing-"));
    try {
      mkdirSync(join(missing, "openspec", "changes"), { recursive: true });
      const result = runSddCli(missing, ["sync", "missing"]);
      expect(result.status).toBe(3);
      expect(parseCliJson(result)).toMatchObject({ command: "sync", change: "missing", ok: false, outcome: "malformed", code: "CHANGE_NOT_FOUND", message: expect.any(String) });
    } finally {
      rmSync(missing, { recursive: true, force: true });
    }

    const unsafe = mkdtempSync(join(tmpdir(), "core-parity-unsafe-"));
    try {
      const result = runSddCli(unsafe, ["sync", "../escape"]);
      expect(result.status).toBe(3);
      expect(parseCliJson(result)).toMatchObject({ command: "sync", change: "../escape", ok: false, outcome: "malformed", canonicalChanged: false, domains: [], report: null, code: "UNSAFE_CHANGE_NAME" });
    } finally {
      rmSync(unsafe, { recursive: true, force: true });
    }

    const operational = mkdtempSync(join(tmpdir(), "core-parity-operational-"));
    try {
      mkdirSync(join(operational, "openspec", "changes", "broken"), { recursive: true });
      writeFileSync(join(operational, "openspec", "changes", "broken", "specs"), "not a directory");
      const result = runSddCli(operational, ["sync", "broken"]);
      expect(result.status).toBe(4);
      const output = parseCliJson(result);
      expect(output).toMatchObject({ command: "sync", change: "broken", ok: false, outcome: "operational_failure", canonicalChanged: false, domains: [], report: null, code: "OPERATIONAL_ERROR" });
      expect(output.message).not.toContain(operational);
    } finally {
      rmSync(operational, { recursive: true, force: true });
    }

    const usage = runSddCli(mkdtempSync(join(tmpdir(), "core-parity-usage-")), ["sync"]);
    expect(usage.status).toBe(64);
    expect(usage.stdout).toBe(JSON.stringify({ command: "sync", change: null, ok: false, outcome: "usage", canonicalChanged: false, domains: [], report: null, code: "USAGE", message: "usage: cc-ein-sdd sync <change>" }) + "\n");
    expect(usage.stderr).toBe("");
  });

  test("status, check, close, and guard do not implicitly synchronize", () => {
    const cwd = makeOpenSpecFixture("no-implicit-sync");
    const canonicalPath = join(cwd, "openspec", "specs", "alpha", "spec.md");
    const canonical = readFileSync(canonicalPath);
    try {
      for (const args of [["status", "no-implicit-sync"], ["check", "no-implicit-sync"], ["close", "no-implicit-sync"]]) {
        runSddCli(cwd, args);
        expect(readFileSync(canonicalPath)).toEqual(canonical);
        expect(existsSync(join(cwd, "openspec", "changes", "no-implicit-sync", "sync-report.md"))).toBe(false);
      }
      const guard = runSddCli(cwd, ["guard"], JSON.stringify({ tool_input: { command: "git status" } }));
      expect(guard.stderr).toBe("");
      expect(readFileSync(canonicalPath)).toEqual(canonical);
      expect(existsSync(join(cwd, "openspec", "changes", "no-implicit-sync", "sync-report.md"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
