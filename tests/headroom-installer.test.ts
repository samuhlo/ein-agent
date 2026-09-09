import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chooseHeadroom, HEADROOM_INSTALL_NOTICE, installHeadroom, refreshHeadroom } from "../installer/src/core/headroom.ts";
import { parseInstallFlags, runInstall } from "../installer/src/cli/install.ts";
import { parseCliFlags } from "../installer/src/cli/update.ts";
import { createInstallPlan } from "../installer/src/core/install-plan.ts";
import type { InstallPlanExecutionHandlers } from "../installer/src/core/install-executor.ts";
import { inspectManagedHeadroom, maintainHeadroom, HEADROOM_PYTHON, HEADROOM_RELEASE, headroomHomeForAgent } from "../shared/ports/headroom.ts";
import { headroomServiceHome } from "../ein-pi/agent/lib/headroom-service.ts";

const roots: string[] = [];
const temp = () => { const root = mkdtempSync(join(realpathSync(tmpdir()), "ein-headroom-installer-")); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test("installer and runtime share a dependency home outside the agent snapshot tree", () => {
  const root = temp(), agent = join(root, ".pi-ein/agent");
  expect(headroomHomeForAgent(`${agent}/`)).toBe(`${agent}.headroom`);
  expect(headroomServiceHome({ EIN_PI_AGENT_HOME: agent })).toBe(headroomHomeForAgent(agent));
  expect(headroomServiceHome({ PI_CODING_AGENT_DIR: agent })).toBe(headroomHomeForAgent(agent));
  expect(headroomServiceHome({ EIN_PI_AGENT_HOME: agent, EIN_HEADROOM_SERVICE_DIR: join(root, "custom") })).toBe(join(root, "custom"));
  expect(() => headroomHomeForAgent("relative")).toThrow();
});

test("recommended is still opt-in: --yes, dry-run and cancellation never select it", async () => {
  const dir = temp(); let prompts = 0;
  const options = { interactive: true, present: () => false, confirm: async (text: string) => { prompts++; expect(text).toContain("420 MiB"); expect(text).toContain("recomendado"); return false; } };
  for (const flags of [{ yes: true, dryRun: false }, { yes: false, dryRun: true }, { yes: false, dryRun: false, noHeadroom: true }]) expect((await chooseHeadroom(flags, dir, options)).selected).toBe(false);
  expect(prompts).toBe(0);
  expect((await chooseHeadroom({ yes: false, dryRun: false }, dir, options)).selected).toBe(false); expect(prompts).toBe(1);
  expect((await chooseHeadroom({ yes: false, dryRun: false }, dir, { ...options, confirm: async () => true })).selected).toBe(true);
  expect((await chooseHeadroom({ yes: true, dryRun: true, headroom: true }, dir, options)).selected).toBe(true); expect(prompts).toBe(1);
  expect(HEADROOM_INSTALL_NOTICE).toContain("datos");
});

test("public flags keep selector parsing intact and reject contradictory choices", () => {
  expect(parseInstallFlags(["--yes", "--headroom"]).headroom).toBe(true);
  expect(parseInstallFlags(["--no-hypa"]).noHeadroom).toBe(true);
  expect(parseInstallFlags(["--headroom", "--no-hypa"]).noHeadroom).toBeUndefined();
  expect(() => parseInstallFlags(["--headroom", "--no-headroom"])).toThrow();
  expect(parseCliFlags(["--yes", "--no-headroom", "--channel", "alpha"])).toMatchObject({ selectorArgs: [], noHeadroom: true, channel: "alpha" });
});

function managed(dir: string, version = HEADROOM_RELEASE, python = HEADROOM_PYTHON) {
  const home = headroomHomeForAgent(dir), target = join(home, "versions", "fixture"); mkdirSync(join(target, "venv/bin"), { recursive: true });
  writeFileSync(join(target, "venv/bin/headroom"), "fixture", { mode: 0o755 });
  writeFileSync(join(target, "verified.json"), JSON.stringify({ service: version, pass: true, results: [{ pass: true }, { pass: true }, { pass: true }] }));
  writeFileSync(join(target, "selected-version.txt"), version);
  writeFileSync(join(target, "installation.json"), JSON.stringify({ version, python, profile: "ein-verified-v1" }));
  symlinkSync(target, join(home, "active")); return home;
}

test("update never installs an unchosen tool or downgrades a newer version", async () => {
  let calls = 0; const deps = { findUv: () => "/fixture/uv", maintain: async () => { calls++; return "installed"; } };
  expect((await refreshHeadroom(temp(), deps)).ok).toBe(true); expect(calls).toBe(0);
  const newer = join(temp(), "agent"); managed(newer, "99.0.0"); expect((await refreshHeadroom(newer, deps)).detail).toContain("no se rebaja"); expect(calls).toBe(0);
  const older = join(temp(), "agent"); managed(older, "0.36.0"); expect((await refreshHeadroom(older, deps)).ok).toBe(true); expect(calls).toBe(1);
});

test("the same verified Python profile does not allocate another environment", async () => {
  const dir = join(temp(), "agent"), home = managed(dir);
  expect(inspectManagedHeadroom(home)?.python).toBe("3.14");
  expect(await maintainHeadroom("update", HEADROOM_RELEASE, { ...process.env, EIN_HEADROOM_SERVICE_DIR: home, PATH: "" })).toContain("no se crea otra copia");
});

test("bootstrap uses private uv without shell changes, then the shared verifier", async () => {
  const dir = join(temp(), "agent"); const commands: string[] = []; let installed = false;
  const result = await installHeadroom(dir, { findUv: () => null, run: async (cmd, args, options) => {
    commands.push(cmd);
    if (cmd === "sh") { expect(options?.env?.UV_NO_MODIFY_PATH).toBe("1"); expect(options?.env?.UV_UNMANAGED_INSTALL).toBe(join(headroomHomeForAgent(dir), "tools")); mkdirSync(join(headroomHomeForAgent(dir), "tools"), { recursive: true }); writeFileSync(join(headroomHomeForAgent(dir), "tools/uv"), "fixture"); }
    return { ok: true, code: 0, stdout: "", stderr: "" };
  }, maintain: async (command, version, env) => { installed = true; expect(command).toBe("update"); expect(version).toBe(HEADROOM_RELEASE); expect(env?.EIN_HEADROOM_SERVICE_DIR).toBe(headroomHomeForAgent(dir)); return "verified"; } });
  expect(result.ok).toBe(true); expect(installed).toBe(true); expect(commands).toEqual(["curl", "sh"]);
});

function fixture() {
  const home = temp(); const observations = { home, piAgentDir: join(home, ".pi-ein/agent"), piAgentDirExists: false, piOwnership: { status: "absent" as const }, claudeConfigHome: join(home, ".claude-ein"), dependencies: { bun: true, pi: true, claude: true, engram: false, gh: false, hypa: false, codegraph: false }, platform: { os: "darwin" as const, arch: "arm64" as const, distro: "unknown" as const, packageManager: "brew" as const, shell: "unknown" as const, shellRc: join(home, ".profile"), home } };
  const plan = createInstallPlan({ ...observations, platform: { os: "darwin", arch: "arm64" }, target: "pi", flags: { yes: true, noEngram: false, noSecrets: true, noHypa: false, noCodegraph: false, skipLinear: true } });
  return { home, observations, plan };
}

test("core journal remains valid; optional install runs only after successful verification", async () => {
  for (const failCore of [false, true]) {
    const { observations, plan } = fixture(); const events: string[] = [];
    const handlers = Object.fromEntries(plan.inventory.map(({ id }) => [id, () => { events.push(id); return { ok: !(failCore && id === "pi.configure-packages") }; }])) as InstallPlanExecutionHandlers;
    const code = await runInstall(["--yes", "--no-secrets", "--headroom"], undefined, { observations, playBanner: async () => {}, handlers,
      headroom: { install: async () => { events.push("headroom"); return { ok: false, detail: "fixture optional failure" }; } },
    });
    expect(code).toBe(failCore ? 1 : 0);
    if (failCore) expect(events).not.toContain("headroom"); else expect(events.indexOf("headroom")).toBeGreaterThan(events.indexOf("pi.verify-doctor"));
  }
});

test("--dry-run --headroom never calls provisioning or writes an install journal", async () => {
  const { home, observations } = fixture(); let calls = 0;
  const code = await runInstall(["--yes", "--dry-run", "--headroom"], undefined, { observations, playBanner: async () => {}, writePlan: () => {}, headroom: { install: async () => { calls++; return { ok: true, detail: "unexpected" }; } } });
  expect(code).toBe(0); expect(calls).toBe(0); expect(existsSync(join(home, ".ein-installer"))).toBe(false); expect(existsSync(headroomHomeForAgent(observations.piAgentDir))).toBe(false);
});
