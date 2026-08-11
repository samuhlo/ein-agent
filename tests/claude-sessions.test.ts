// =============================================================================
// CLAUDE CODE SESSION STORE
// Claude keeps transcripts under <config>/projects/<encoded-cwd>/<uuid>.jsonl.
// That folder name is lossy — every non-alphanumeric character becomes `-`, so
// `01_Proyectos` and `01-Proyectos` collide. These tests pin the rule that
// membership is decided by the `cwd` inside the transcript, never by the name.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLAUDE_HEAD_SCAN_BYTES,
  encodeClaudeProjectDir,
  resolveClaudeHome,
  scanClaudeProjectSessions,
} from "../ein-pi/agent/lib/claude-sessions.ts";

let root = "";
let config = "";
const touched = ["CLAUDE_CONFIG_DIR"] as const;
const saved = new Map<string, string | undefined>();

function writeSession(
  folder: string,
  uuid: string,
  cwd: string,
  options: { mtimeMs?: number; preamble?: string } = {},
): string {
  const dir = join(config, "projects", folder);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${uuid}.jsonl`);
  const lines = [
    JSON.stringify({ type: "mode", mode: "normal", sessionId: uuid }),
    options.preamble ?? JSON.stringify({ type: "permission-mode", permissionMode: "default" }),
    JSON.stringify({
      type: "user",
      cwd,
      sessionId: uuid,
      gitBranch: "main",
      message: { role: "user", content: "arregla el instalador" },
    }),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`);
  if (options.mtimeMs !== undefined) {
    utimesSync(path, new Date(options.mtimeMs), new Date(options.mtimeMs));
  }
  return path;
}

beforeEach(() => {
  for (const key of touched) saved.set(key, process.env[key]);
  root = mkdtempSync(join(tmpdir(), "ein-claude-sessions-"));
  config = join(root, ".claude-ein");
  process.env.CLAUDE_CONFIG_DIR = config;
});

afterEach(() => {
  for (const key of touched) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
});

describe("resolving the isolated Claude home", () => {
  test("an explicit CLAUDE_CONFIG_DIR wins", () => {
    expect(resolveClaudeHome({ env: { CLAUDE_CONFIG_DIR: "/declared" }, home: "/home/x", exists: () => true }))
      .toBe("/declared");
  });

  test("the isolated home is used when nothing was declared", () => {
    const resolved = resolveClaudeHome({
      env: {},
      home: "/home/x",
      exists: (path) => path === "/home/x/.claude-ein",
    });
    expect(resolved).toBe("/home/x/.claude-ein");
  });

  test("vanilla ~/.claude is never assumed: those sessions are not Ein's", () => {
    const resolved = resolveClaudeHome({
      env: {},
      home: "/home/x",
      exists: (path) => path === "/home/x/.claude",
    });
    expect(resolved).toBeUndefined();
  });
});

describe("scanning the store", () => {
  test("a session of this project is found with its id and age", () => {
    writeSession("-p", "b1efcc53-4368-456f-9e74-fba3e9aada99", "/work/app", { mtimeMs: 1_700_000_000_000 });
    const scan = scanClaudeProjectSessions({ cwd: "/work/app" });
    expect(scan.store).toBe("present");
    expect(scan.matches).toHaveLength(1);
    expect(scan.matches[0]?.id).toBe("b1efcc53-4368-456f-9e74-fba3e9aada99");
    expect(scan.matches[0]?.mtimeMs).toBe(1_700_000_000_000);
  });

  test("a lossy folder collision does not leak another project's sessions", () => {
    // Both cwds encode to the same folder name; only one belongs to the scope.
    const folder = encodeClaudeProjectDir("/work/01_Proyectos/app");
    expect(folder).toBe(encodeClaudeProjectDir("/work/01-Proyectos/app"));
    writeSession(folder, "aaaaaaaa-0000-4000-8000-000000000001", "/work/01_Proyectos/app");
    writeSession(folder, "bbbbbbbb-0000-4000-8000-000000000002", "/work/01-Proyectos/app");

    const scan = scanClaudeProjectSessions({ cwd: "/work/01_Proyectos/app" });
    expect(scan.matches.map((match) => match.id)).toEqual(["aaaaaaaa-0000-4000-8000-000000000001"]);
  });

  test("sessions come back newest first", () => {
    writeSession("-p", "aaaaaaaa-0000-4000-8000-000000000001", "/work/app", { mtimeMs: 1_000 });
    writeSession("-p", "bbbbbbbb-0000-4000-8000-000000000002", "/work/app", { mtimeMs: 9_000 });
    const scan = scanClaudeProjectSessions({ cwd: "/work/app" });
    expect(scan.matches.map((match) => match.mtimeMs)).toEqual([9_000, 1_000]);
  });

  test("a repository scope accepts sessions from subdirectories", () => {
    writeSession("-p", "aaaaaaaa-0000-4000-8000-000000000001", "/work/app/packages/api");
    const scan = scanClaudeProjectSessions({ cwd: "/work/app", repositoryRoot: "/work/app" });
    expect(scan.matches).toHaveLength(1);
  });

  test("an absent store is declared absent, not empty", () => {
    rmSync(config, { recursive: true, force: true });
    const scan = scanClaudeProjectSessions({ cwd: "/work/app" });
    expect(scan.store).toBe("absent");
    expect(scan.matches).toHaveLength(0);
  });

  test("an existing store with no matching project is present and empty", () => {
    writeSession("-other", "aaaaaaaa-0000-4000-8000-000000000001", "/somewhere/else");
    const scan = scanClaudeProjectSessions({ cwd: "/work/app" });
    expect(scan.store).toBe("present");
    expect(scan.matches).toHaveLength(0);
  });

  test("the head read is bounded: a huge preamble never hides the whole file", () => {
    const preamble = JSON.stringify({ type: "file-history-snapshot", blob: "x".repeat(CLAUDE_HEAD_SCAN_BYTES * 2) });
    writeSession("-p", "aaaaaaaa-0000-4000-8000-000000000001", "/work/app", { preamble });
    const scan = scanClaudeProjectSessions({ cwd: "/work/app" });
    // The cwd record sits past the cap, so the file is skipped rather than the
    // reader growing unbounded to find it.
    expect(scan.matches).toHaveLength(0);
    expect(scan.store).toBe("present");
  });

  test("a corrupt transcript is skipped instead of taking the scan down", () => {
    const dir = join(config, "projects", "-p");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cccccccc-0000-4000-8000-000000000003.jsonl"), "{not json\n");
    writeSession("-p", "aaaaaaaa-0000-4000-8000-000000000001", "/work/app");
    const scan = scanClaudeProjectSessions({ cwd: "/work/app" });
    expect(scan.matches).toHaveLength(1);
  });

  test("the limit is bounded to the same cap as Pi", () => {
    for (let index = 0; index < 25; index++) {
      writeSession("-p", `aaaaaaaa-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`, "/work/app");
    }
    expect(scanClaudeProjectSessions({ cwd: "/work/app" }, 100).matches.length).toBe(20);
    expect(scanClaudeProjectSessions({ cwd: "/work/app" }, 3).matches.length).toBe(3);
  });
});
