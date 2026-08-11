// =============================================================================
// UNIFIED SESSION LIST
// One list, both runtimes, newest first — the point of the launcher being above
// the agents rather than beside them. A runtime whose store cannot be read must
// say so: "no sessions" and "never looked" are different answers.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectRuntimeSessions } from "../ein-pi/agent/lib/runtime-sessions.ts";
import { sessionReferenceFor } from "../ein-pi/agent/lib/runtime-session-adapters.ts";

const PROJECT = "/work/app";
let root = "";
const saved = new Map<string, string | undefined>();
const touched = ["EIN_PI_AGENT_HOME", "CLAUDE_CONFIG_DIR"] as const;

function writePi(uuid: string, text: string, mtimeMs: number): void {
  const dir = join(root, ".pi-ein", "agent", "sessions", "--work-app--");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `2026-08-11T10-00-00-000Z_${uuid}.jsonl`);
  writeFileSync(path, [
    JSON.stringify({ type: "session", version: 3, id: uuid, cwd: PROJECT }),
    JSON.stringify({ message: { role: "user", content: [{ type: "text", text }] } }),
    "",
  ].join("\n"));
  utimesSync(path, new Date(mtimeMs), new Date(mtimeMs));
}

function writeClaude(uuid: string, text: string, mtimeMs: number): void {
  const dir = join(root, ".claude-ein", "projects", "-work-app");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${uuid}.jsonl`);
  writeFileSync(path, [
    JSON.stringify({ type: "user", cwd: PROJECT, sessionId: uuid, message: { role: "user", content: text } }),
    "",
  ].join("\n"));
  utimesSync(path, new Date(mtimeMs), new Date(mtimeMs));
}

const PI_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const CLAUDE_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const PI_C = "cccccccc-0000-4000-8000-00000000000c";

beforeEach(() => {
  for (const key of touched) saved.set(key, process.env[key]);
  root = mkdtempSync(join(tmpdir(), "ein-unified-sessions-"));
  process.env.EIN_PI_AGENT_HOME = join(root, ".pi-ein", "agent");
  process.env.CLAUDE_CONFIG_DIR = join(root, ".claude-ein");
});

afterEach(() => {
  for (const key of touched) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
});

describe("one list for both runtimes", () => {
  test("sessions interleave by recency, not by runtime", () => {
    writePi(PI_A, "el más viejo", 1_000);
    writeClaude(CLAUDE_B, "el de en medio", 5_000);
    writePi(PI_C, "el más nuevo", 9_000);

    const result = collectRuntimeSessions({ cwd: PROJECT }, { now: 9_000 });
    expect(result.entries.map((entry) => entry.provider)).toEqual(["pi", "claude", "pi"]);
    expect(result.entries.map((entry) => entry.lastAction))
      .toEqual(["el más nuevo", "el de en medio", "el más viejo"]);
  });

  test("each entry carries the reference the adapter will resolve", () => {
    writePi(PI_A, "hola", 1_000);
    const [entry] = collectRuntimeSessions({ cwd: PROJECT }).entries;
    expect(entry?.reference).toBe(sessionReferenceFor("pi", PI_A));
  });

  test("age is relative and human", () => {
    writePi(PI_A, "hola", 0);
    const [entry] = collectRuntimeSessions({ cwd: PROJECT }, { now: 2 * 60 * 60 * 1000 }).entries;
    expect(entry?.age).toBe("2h");
  });

  test("an unreadable phrase is left unknown, not invented", () => {
    const dir = join(root, ".pi-ein", "agent", "sessions", "--work-app--");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `2026-08-11T10-00-00-000Z_${PI_A}.jsonl`),
      `${JSON.stringify({ type: "session", version: 3, id: PI_A, cwd: PROJECT })}\n`,
    );
    const [entry] = collectRuntimeSessions({ cwd: PROJECT }).entries;
    expect(entry?.lastAction).toBeUndefined();
  });

  test("the list is bounded", () => {
    for (let index = 0; index < 12; index++) {
      writePi(`aaaaaaaa-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`, `t${index}`, 1_000 + index);
    }
    expect(collectRuntimeSessions({ cwd: PROJECT }, { limit: 4 }).entries).toHaveLength(4);
  });
});

describe("declaring what could not be read", () => {
  test("a runtime with no store is named, not silently empty", () => {
    writePi(PI_A, "hola", 1_000);
    rmSync(join(root, ".claude-ein"), { recursive: true, force: true });

    const result = collectRuntimeSessions({ cwd: PROJECT });
    expect(result.entries).toHaveLength(1);
    expect(result.unavailable.map((item) => item.provider)).toEqual(["claude"]);
  });

  test("a store that exists but holds nothing for this project is not unavailable", () => {
    mkdirSync(join(root, ".claude-ein", "projects"), { recursive: true });
    writePi(PI_A, "hola", 1_000);

    const result = collectRuntimeSessions({ cwd: PROJECT });
    expect(result.unavailable).toHaveLength(0);
    expect(result.entries).toHaveLength(1);
  });

  test("both stores missing yields no entries and two declarations", () => {
    rmSync(root, { recursive: true, force: true });
    const result = collectRuntimeSessions({ cwd: PROJECT });
    expect(result.entries).toHaveLength(0);
    expect(result.unavailable.map((item) => item.provider).sort()).toEqual(["claude", "pi"]);
  });
});
