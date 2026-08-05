// =============================================================================
// TESTS: explicit cc-ein-sdd OpenSpec synchronization contract (group 003)
// =============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
