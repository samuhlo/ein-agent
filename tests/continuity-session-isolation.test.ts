import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanProjectSessions } from "../ein-pi/agent/lib/sessions.ts";

test("session recovery never guesses vanilla Pi and honors the explicit isolated override", () => {
  const home = mkdtempSync(join(tmpdir(), "ein-session-isolation-")), cwd = join(home, "project"); mkdirSync(cwd);
  const session = (root: string, id: string) => { const dir = join(root, "sessions", "project"); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `${id}.jsonl`), `${JSON.stringify({ type: "session", id, cwd })}\n`); };
  try {
    session(join(home, ".pi", "agent"), "vanilla-private");
    const probe = { home, env: {}, exists: existsSync };
    expect(scanProjectSessions({ cwd }, 10, probe)).toMatchObject({ store: "absent", matches: [] });
    session(join(home, ".pi-ein", "agent"), "isolated");
    expect(scanProjectSessions({ cwd }, 10, probe).matches.map((item) => item.id)).toEqual(["isolated"]);
    const explicit = join(home, "explicit-agent"); session(explicit, "override");
    expect(scanProjectSessions({ cwd }, 10, { ...probe, env: { EIN_PI_AGENT_HOME: explicit } }).matches.map((item) => item.id)).toEqual(["override"]);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
