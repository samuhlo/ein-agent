import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createUninstallPlan, renderUninstallPlan, UNINSTALL_ASSETS } from "../installer/src/core/uninstall-plan.ts";
import { executeUninstallPlan, inspectUninstallRecovery } from "../installer/src/core/uninstall-recovery.ts";

const roots: string[] = [];
const makeHome = (): string => { const home = mkdtempSync(join(tmpdir(), "ein-uninstall-")); roots.push(home); return home; };
const file = (path: string, value = "managed"): void => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
const marker = JSON.stringify({ version: "1.0.0", installedAt: new Date(0).toISOString(), channel: "stable" });
function seed(): { home: string; binDir: string } {
  const home = makeHome(), binDir = join(home, ".local/bin"), put = (path: string, value?: string): void => file(join(home, path), value);
  for (const path of [".pi-ein/agent/app.ts", ".pi-ein/agent/ein-mode.json", ".pi-ein/agent/agents/ein-git.md", ".config/fish/functions/pi-ein.fish", ".local/bin/ein", ".local/bin/ein-install", ".claude-ein/CLAUDE.md", ".claude-ein/settings.json", ".claude-ein/agents/ein-git.md", ".claude-ein/commands/ein/handoff.md", ".config/fish/functions/cc-ein.fish"]) put(path);
  put(".pi-ein/agent/.ein-install.json", marker); put(".claude-ein/.ein-install.json", marker);
  for (const [path, value] of [[".pi-ein/agent/auth.json", "AUTH"], [".pi-ein/agent/sessions/session.json", "SESSION"], [".pi-ein/agent/backups/installer/backup.tar.gz", "BACKUP"], [".pi-ein/agent/skills/user/SKILL.md", "FOREIGN"], [".claude-ein/agents/mine.md", "FOREIGN"], [".claude-ein/commands/ein/mine.md", "FOREIGN"], [".claude-ein/history.jsonl", "HISTORY"], [".claude-ein/sessions/session.json", "SESSION"], [".engram-ein/store", "MEMORY"], [".engram-ein/store", "MEMORY"], [".config/opencode-secrets/token", "SECRET"]] as const) put(path, value);
  return { home, binDir };
}
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("simple uninstall plan", () => {
  test("isolates Pi, Claude, and Both targets", () => {
    const fixture = seed(), plan = (target: "pi" | "claude" | "both") => createUninstallPlan({ ...fixture, target });
    expect(plan("pi").entries.every(({ runtime }) => runtime === "pi")).toBe(true); expect(plan("claude").entries.every(({ runtime }) => runtime === "claude")).toBe(true); expect(new Set(plan("both").entries.map(({ runtime }) => runtime))).toEqual(new Set(["pi", "claude"]));
  });
  test("requires each selected runtime marker before allowing writes", () => {
    const fixture = seed(); rmSync(join(fixture.home, ".claude-ein/.ein-install.json")); const plan = createUninstallPlan({ ...fixture, target: "both" });
    expect(plan.status).toBe("blocked"); expect(plan.blockers[0]?.runtime).toBe("claude"); expect(() => executeUninstallPlan(plan, { ...fixture, target: "both" })).toThrow("blocked"); expect(existsSync(join(fixture.home, ".pi-ein/agent/app.ts"))).toBe(true);
  });
  test("uses an explicit allowlist without private or obsolete dashboard paths", () => {
    const paths = [...UNINSTALL_ASSETS.pi, ...UNINSTALL_ASSETS.claude];
    expect(paths).toContain(".pi-ein/agent/app.ts"); expect(paths).toContain(".pi-ein/agent/ein-mode.json"); expect(paths).toContain(".claude-ein/.ein-install.json"); expect(paths).not.toContain(".claude-ein/agents/mine.md"); expect(paths.join("\n")).not.toMatch(/auth|session|history|secret|backup|engram|dashboard|\.credentials/i);
  });
  test("renders a redacted dry-run and the real CLI performs zero writes", () => {
    const fixture = seed(), rendered = renderUninstallPlan(createUninstallPlan({ ...fixture, target: "pi" }));
    expect(rendered).toContain("Uninstall (pi): READY"); expect(rendered).not.toContain(fixture.home); expect(rendered).not.toMatch(/auth|session|secret|backup|engram/i);
    const process = Bun.spawnSync(["bun", join(import.meta.dir, "../installer/src/main.ts"), "uninstall", "--yes", "--runtime", "pi", "--dry-run"], { env: { ...Bun.env, HOME: fixture.home }, stdout: "pipe", stderr: "pipe" });
    expect(process.exitCode).toBe(0); expect(new TextDecoder().decode(process.stdout)).toContain("zero writes"); expect(existsSync(join(fixture.home, ".pi-ein/agent/app.ts"))).toBe(true); expect(existsSync(join(fixture.home, ".ein-installer"))).toBe(false);
  });
});

describe("recoverable uninstall", () => {
  test("moves selected assets to one private recovery directory", () => {
    const fixture = seed(), result = executeUninstallPlan(createUninstallPlan({ ...fixture, target: "pi" }), { ...fixture, target: "pi", transactionId: () => "transaction-pi" });
    expect(result.status).toBe("complete"); expect(existsSync(join(fixture.home, ".pi-ein/agent/app.ts"))).toBe(false); expect(existsSync(join(fixture.binDir, "ein"))).toBe(false); expect(existsSync(join(fixture.binDir, "ein-install"))).toBe(false); expect(existsSync(join(fixture.home, ".claude-ein/CLAUDE.md"))).toBe(true); expect(readFileSync(join(fixture.home, ".pi-ein/agent/auth.json"), "utf8")).toBe("AUTH"); expect(readFileSync(join(fixture.home, ".pi-ein/agent/skills/user/SKILL.md"), "utf8")).toBe("FOREIGN");
    const manifestPath = join(result.recoveryDirectory!, "manifest.json"), manifest = readFileSync(manifestPath, "utf8");
    expect(statSync(result.recoveryDirectory!).mode & 0o077).toBe(0); expect(statSync(manifestPath).mode & 0o077).toBe(0); expect(manifest).not.toContain(fixture.home); expect(manifest).not.toMatch(/auth|session|history|secret|backup|engram/i);
  });
  test("rolls ordinary move failures back in reverse order", () => {
    const fixture = seed(), plan = createUninstallPlan({ ...fixture, target: "both" }), selected = plan.entries.filter(({ state }) => state === "selected");
    const result = executeUninstallPlan(plan, { ...fixture, target: "both", transactionId: () => "transaction-rollback", fault: (point) => { if (point === `move:${selected[1]!.id}`) throw new Error("disk failure"); } });
    expect(result.status).toBe("rolled-back"); expect(result.moved).toEqual([]); expect(existsSync(selected[0]!.destination)).toBe(true); expect(inspectUninstallRecovery(fixture.home)).toEqual({ status: "clear" });
  });
  test("blocks reentry when rollback is incomplete and reports its location", () => {
    const fixture = seed(), plan = createUninstallPlan({ ...fixture, target: "both" }), selected = plan.entries.filter(({ state }) => state === "selected");
    const result = executeUninstallPlan(plan, { ...fixture, target: "both", transactionId: () => "transaction-incomplete", fault: (point) => { if (point === `move:${selected[1]!.id}` || point === `rollback:${selected[0]!.id}`) throw new Error("disk failure"); } });
    expect(result.status).toBe("recovery-required"); expect(inspectUninstallRecovery(fixture.home)).toEqual({ status: "blocked", recoveryDirectory: result.recoveryDirectory! }); expect(executeUninstallPlan(plan, { ...fixture, target: "both" }).status).toBe("recovery-required"); expect(readdirSync(join(fixture.home, ".ein-installer/uninstall-recovery"))).toEqual(["transaction-incomplete"]);
  });
  test("real main uninstalls Claude while preserving Pi and foreign siblings", () => {
    const fixture = seed(), process = Bun.spawnSync(["bun", join(import.meta.dir, "../installer/src/main.ts"), "uninstall", "--yes", "--runtime", "claude"], { env: { ...Bun.env, HOME: fixture.home }, stdout: "pipe", stderr: "pipe" });
    expect(process.exitCode).toBe(0); expect(existsSync(join(fixture.home, ".claude-ein/CLAUDE.md"))).toBe(false); expect(readFileSync(join(fixture.home, ".claude-ein/agents/mine.md"), "utf8")).toBe("FOREIGN"); expect(readFileSync(join(fixture.home, ".claude-ein/history.jsonl"), "utf8")).toBe("HISTORY"); expect(existsSync(join(fixture.home, ".pi-ein/agent/app.ts"))).toBe(true);
  });
});
