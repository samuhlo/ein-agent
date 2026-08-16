// =============================================================================
// RUNTIME SESSION RESUME
// Resuming is the reason the launcher exists: continuing with one agent the work
// another left. These tests pin the two halves of it — resolving an opaque
// reference back to a live session, and the exact process plan that resumes it —
// plus the boundary that keeps a caller from turning `argv` into an injection.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  buildLaunchPlan,
  createRuntimeSessionAdapter,
  executeLaunchPlan,
  getRuntimeCapabilities,
  type LaunchPlan,
} from "../ein-pi/agent/lib/runtime-session-adapters.ts";

const PROJECT = "/tmp/ein-resume-project";
const STATE_REF = `git-v1:sha256:${"a".repeat(64)}`;

function projectState(cwd = PROJECT) {
  return {
    schemaVersion: 1 as const,
    identity: { cwd, repositoryRoot: cwd, quality: "current", reason: "read-success" },
    git: {
      repository: true,
      root: cwd,
      complete: true,
      stateRef: STATE_REF,
      dirty: false,
      changes: [],
      quality: "current",
      reason: "read-success",
    },
  };
}

// A Pi store: ~/.pi-ein/agent/sessions/<encoded>/<stamp>_<uuid>.jsonl, whose
// first line carries the id and the cwd.
function writePiSession(home: string, uuid: string, cwd: string): void {
  const dir = join(home, "sessions", "--project--");
  mkdirSync(dir, { recursive: true });
  const head = JSON.stringify({ type: "session", version: 3, id: uuid, cwd });
  writeFileSync(join(dir, `2026-08-11T10-00-00-000Z_${uuid}.jsonl`), `${head}\n`);
}

// A Claude store: <config>/projects/<encoded>/<uuid>.jsonl, whose records carry
// cwd and sessionId.
function writeClaudeSession(config: string, uuid: string, cwd: string, folder = "-project"): void {
  const dir = join(config, "projects", folder);
  mkdirSync(dir, { recursive: true });
  const head = JSON.stringify({ type: "user", cwd, sessionId: uuid, message: { role: "user", content: "hola" } });
  writeFileSync(join(dir, `${uuid}.jsonl`), `${head}\n`);
}

function reference(provider: "pi" | "claude", uuid: string): string {
  return `${provider}:v1:sha256:${createHash("sha256").update(uuid).digest("hex")}`;
}

const PI_UUID = "019fec0d-6ee0-7c8c-b791-032d7d0fa40c";
const CONVENTIONAL_PI_UUID = "119fec0d-6ee0-7c8c-b791-032d7d0fa40c";
const CLAUDE_UUID = "b1efcc53-4368-456f-9e74-fba3e9aada99";

let root = "";
let piHome = "";
let claudeConfig = "";
const originalEnv = { ...process.env };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ein-resume-"));
  piHome = join(root, ".pi-ein", "agent");
  claudeConfig = join(root, ".claude-ein");
  process.env.EIN_PI_AGENT_HOME = piHome;
  process.env.CLAUDE_CONFIG_DIR = claudeConfig;
  writePiSession(piHome, PI_UUID, PROJECT);
  writeClaudeSession(claudeConfig, CLAUDE_UUID, PROJECT);
});

afterEach(() => {
  process.env = { ...originalEnv };
  rmSync(root, { recursive: true, force: true });
});

describe("resolving an opaque reference", () => {
  test("a Pi reference resolves to a resume intent", () => {
    const result = createRuntimeSessionAdapter("pi").resume(projectState(), reference("pi", PI_UUID));
    expect(result.outcome).toBe("success");
    expect(result.data?.mode).toBe("resume");
  });

  test("a Claude reference resolves to a resume intent", () => {
    const result = createRuntimeSessionAdapter("claude").resume(projectState(), reference("claude", CLAUDE_UUID));
    expect(result.outcome).toBe("success");
    expect(result.data?.mode).toBe("resume");
  });

  test("a reference no live session hashes to is not found", () => {
    const orphan = `pi:v1:sha256:${"f".repeat(64)}`;
    const result = createRuntimeSessionAdapter("pi").resume(projectState(), orphan);
    expect(result.outcome).toBe("error");
    expect(result.error?.code).toBe("reference-not-found");
  });

  test("a Pi reference that exists only in the conventional home is not found", () => {
    writePiSession(join(root, ".pi", "agent"), CONVENTIONAL_PI_UUID, PROJECT);

    const conventional = createRuntimeSessionAdapter("pi").resume(
      projectState(),
      reference("pi", CONVENTIONAL_PI_UUID),
    );
    const isolated = createRuntimeSessionAdapter("pi").resume(
      projectState(),
      reference("pi", PI_UUID),
    );

    expect(conventional.error?.code).toBe("reference-not-found");
    expect(isolated.outcome).toBe("success");
  });

  test("another provider's reference is refused", () => {
    const result = createRuntimeSessionAdapter("pi").resume(projectState(), reference("claude", CLAUDE_UUID));
    expect(result.error?.code).toBe("provider-mismatch");
  });

  test("the private id never appears in the public result", () => {
    const result = createRuntimeSessionAdapter("pi").resume(projectState(), reference("pi", PI_UUID));
    const { data: _intent, ...publicFields } = result as Record<string, unknown>;
    expect(JSON.stringify(publicFields)).not.toContain(PI_UUID);
  });
});

describe("the resume launch plan", () => {
  test("Pi resumes with --session and the resolved uuid", () => {
    const adapter = createRuntimeSessionAdapter("pi");
    const intent = adapter.resume(projectState(), reference("pi", PI_UUID));
    const plan = buildLaunchPlan(projectState(), intent.data, {
      environment: { HOME: root, PATH: join(root, "bin") },
      resolveExecutable: () => join(root, "bin", "pi"),
    });
    expect(plan.outcome).toBe("success");
    expect(plan.data?.argv).toEqual(["--session", PI_UUID]);
    expect(plan.data?.shell).toBe(false);
  });

  test("Claude resumes with --resume and the resolved uuid", () => {
    const adapter = createRuntimeSessionAdapter("claude");
    const intent = adapter.resume(projectState(), reference("claude", CLAUDE_UUID));
    const plan = buildLaunchPlan(projectState(), intent.data, {
      environment: { HOME: root, PATH: join(root, "bin") },
      resolveExecutable: () => join(root, "bin", "claude"),
    });
    expect(plan.outcome).toBe("success");
    expect(plan.data?.argv).toEqual(["--resume", CLAUDE_UUID]);
  });

  test("creating a session still takes no arguments", () => {
    const adapter = createRuntimeSessionAdapter("pi");
    const intent = adapter.create(projectState());
    const plan = buildLaunchPlan(projectState(), intent.data, {
      environment: { HOME: root, PATH: join(root, "bin") },
      resolveExecutable: () => join(root, "bin", "pi"),
    });
    expect(plan.data?.argv).toEqual([]);
  });
});

describe("argv is the adapter's, never the caller's", () => {
  // Mutated in place on purpose: a spread copy would already be refused by the
  // environment-identity guard, which would leave the argv rule untested.
  function tamper(plan: LaunchPlan, argv: readonly string[]): LaunchPlan {
    (plan as { argv: readonly string[] }).argv = argv;
    return plan;
  }

  async function validPlan(): Promise<LaunchPlan> {
    const adapter = createRuntimeSessionAdapter("pi");
    const intent = adapter.resume(projectState(), reference("pi", PI_UUID));
    const plan = buildLaunchPlan(projectState(), intent.data, {
      environment: { HOME: root, PATH: join(root, "bin") },
      resolveExecutable: () => join(root, "bin", "pi"),
    });
    if (plan.outcome !== "success") throw new Error("fixture plan must build");
    return plan.data;
  }

  test("a fabricated session argument is refused", async () => {
    const executed = await executeLaunchPlan(
      tamper(await validPlan(), ["--session", "x; rm -rf /"]),
      () => ({ kind: "exit", code: 0 }),
    );
    expect(executed.outcome).toBe("error");
    expect(executed.error?.code).toBe("invalid-request");
  });

  test("an extra flag is refused", async () => {
    const executed = await executeLaunchPlan(
      tamper(await validPlan(), ["--session", PI_UUID, "--dangerously-skip-permissions"]),
      () => ({ kind: "exit", code: 0 }),
    );
    expect(executed.error?.code).toBe("invalid-request");
  });

  test("a different flag name is refused", async () => {
    const executed = await executeLaunchPlan(
      tamper(await validPlan(), ["--system-prompt", PI_UUID]),
      () => ({ kind: "exit", code: 0 }),
    );
    expect(executed.error?.code).toBe("invalid-request");
  });

  test("a copy of a valid plan is refused: the environment is bound to the object", async () => {
    const executed = await executeLaunchPlan({ ...(await validPlan()) }, () => ({ kind: "exit", code: 0 }));
    expect(executed.error?.code).toBe("invalid-request");
  });

  test("the declared plan runs with exactly its own argv", async () => {
    let seen: readonly string[] | undefined;
    const executed = await executeLaunchPlan(await validPlan(), (input) => {
      seen = input.argv;
      return { kind: "exit", code: 0 };
    });
    expect(executed.outcome).toBe("success");
    expect(seen).toEqual(["--session", PI_UUID]);
  });
});

describe("capability honesty", () => {
  test("both runtimes declare resume support", () => {
    for (const provider of ["pi", "claude"] as const) {
      const resume = getRuntimeCapabilities(provider).find((item) => item.operation === "resume");
      expect(resume?.support).toBe("supported");
    }
  });

  test("Claude declares list support now that its store is readable", () => {
    const list = getRuntimeCapabilities("claude").find((item) => item.operation === "list");
    expect(list?.support).toBe("supported");
  });
});
