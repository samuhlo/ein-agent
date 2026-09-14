import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const packageRoot = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Usage: bun tooling/verify-child-tools-runtime.ts <pi-subagents directory>");
const { resolvePiLaunchToolPlan } = await import(pathToFileURL(join(packageRoot, "src/runs/shared/child-tool-plan.ts")).href);
const hostAvailableBuiltins = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const input = { agentName: "sdd-apply", tools: ["read", "write", "powershell", "ein_sdd_task_progress"], hostAvailableBuiltins };
const plan = resolvePiLaunchToolPlan(input);
assert(plan.effectiveToolAllowlist.includes("ein_sdd_task_progress"), "launch dropped progress provider's tool");
assert(!plan.effectiveToolAllowlist.includes("powershell"), "unavailable native tool admitted");
assert(!resolvePiLaunchToolPlan({ ...input, excludeTools: ["ein_sdd_task_progress"] }).effectiveToolAllowlist.includes("ein_sdd_task_progress"));
assert.deepEqual(resolvePiLaunchToolPlan({ ...input, capabilityCeiling: { version: 1, allowedTools: ["read"], denyExtensions: false, sources: ["probe"] } }).effectiveToolAllowlist, ["read"]);
const root = resolve(import.meta.dir, "..");
const staging = mkdtempSync(join(tmpdir(), "ein-child-tools-"));
try {
  const payload = join(staging, "payload"); const project = join(staging, "project"); const home = join(staging, "home");
  mkdirSync(project); mkdirSync(home);
  for (const args of [["init", "-q"], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "--allow-empty", "-qm", "fixture"]]) {
    const git = Bun.spawnSync(["git", ...args], { cwd: project }); assert.equal(git.exitCode, 0, git.stderr.toString());
  }
  cpSync(join(root, "ein-pi/agent"), payload, { recursive: true });
  cpSync(join(root, "runtime/agents"), join(payload, "agents"), { recursive: true });
  // OVERLAY -> El despliegue instala implementaciones compartidas, no los facades del checkout.
  for (const dir of ["sdd", "contracts"]) cpSync(join(root, "shared", dir), join(payload, "lib"), { recursive: true });
  const result = Bun.spawnSync([process.execPath, join(root, "tests/fixtures/phase-child-probe.ts"), payload, project, home, packageRoot], {
    cwd: project, env: { ...process.env, NODE_PATH: join(root, "node_modules"), PI_CODING_AGENT_DIR: home, EIN_PI_AGENT_HOME: home, PI_OFFLINE: "1" },
    timeout: 30000,
  });
  assert.equal(result.exitCode, 0, result.stderr.toString());
  const phases = JSON.parse(result.stdout.toString());
  assert.equal(phases.find((phase: { role: string }) => phase.role === "apply").progress.counts.done, 1);
  console.log("Native child launch: all seven phase menus retain declared tools; progress start/complete persists; exclusions, ceilings and missing native tools remain enforced.");
} finally { rmSync(staging, { recursive: true, force: true }); }
