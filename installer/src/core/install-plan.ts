import { isAbsolute, normalize, resolve } from "node:path";

export type InstallTarget = "pi" | "claude" | "both";
export type RuntimeInstallTarget = Exclude<InstallTarget, "both">;
export type InstallPlanRuntime = "shared" | RuntimeInstallTarget;
export type InstallPlanAction =
  | "ensure-dependency" | "migrate" | "backup" | "deploy" | "configure"
  | "promote-command" | "write-marker" | "verify";
export type InstallPlanState = "selected" | "conditional" | "satisfied" | "skipped" | "blocked";
export type InstallDependencyId = "bun" | "pi" | "engram" | "gh" | "hypa" | "codegraph";
export const INSTALL_PLAN_ENTRY_IDS = [
  "shared.dependency.bun", "pi.dependency.pi", "pi.dependency.engram", "pi.dependency.gh", "pi.dependency.hypa", "pi.dependency.codegraph",
  "pi.migrate-legacy", "pi.backup-current", "pi.deploy-template", "pi.configure-packages", "pi.configure-secrets",
  "pi.configure-context7-export", "pi.write-install-marker", "pi.verify-doctor", "pi.deploy-launcher", "pi.promote-commands",
  "claude.deploy-runtime", "claude.deploy-launcher",
] as const;
export type InstallPlanEntryId = typeof INSTALL_PLAN_ENTRY_IDS[number];
export const PI_INSTALL_PLAN_ENTRY_IDS = INSTALL_PLAN_ENTRY_IDS.slice(1, 16), CLAUDE_INSTALL_PLAN_ENTRY_IDS = INSTALL_PLAN_ENTRY_IDS.slice(16);
type EntryContract = readonly [InstallPlanRuntime, InstallPlanAction, readonly string[]];
export const INSTALL_PLAN_ENTRY_CONTRACTS = {
  "shared.dependency.bun": ["shared", "ensure-dependency", ["external:selected", "external:satisfied"]], "pi.dependency.pi": ["pi", "ensure-dependency", ["external:selected", "external:satisfied"]],
  "pi.dependency.engram": ["pi", "ensure-dependency", ["external:selected", "external:conditional", "external:satisfied", "external:skipped"]], "pi.dependency.gh": ["pi", "ensure-dependency", ["external:conditional", "external:satisfied", "external:skipped"]],
  "pi.dependency.hypa": ["pi", "ensure-dependency", ["external:conditional", "external:satisfied", "external:skipped"]], "pi.dependency.codegraph": ["pi", "ensure-dependency", ["external:conditional", "external:satisfied", "external:skipped"]],
  "pi.migrate-legacy": ["pi", "migrate", ["installer:selected", "installer:skipped", "unknown:blocked"]], "pi.backup-current": ["pi", "backup", ["installer:conditional", "unknown:conditional"]],
  "pi.deploy-template": ["pi", "deploy", ["installer:selected", "unknown:selected"]], "pi.configure-packages": ["pi", "configure", ["installer:selected", "unknown:selected"]],
  "pi.configure-secrets": ["pi", "configure", ["installer:conditional", "installer:skipped"]], "pi.configure-context7-export": ["pi", "configure", ["installer:conditional", "installer:skipped"]],
  "pi.write-install-marker": ["pi", "write-marker", ["installer:selected", "unknown:selected"]], "pi.verify-doctor": ["pi", "verify", ["installer:selected", "unknown:selected"]],
  "pi.deploy-launcher": ["pi", "deploy", ["installer:selected", "unknown:selected"]], "pi.promote-commands": ["pi", "promote-command", ["installer:conditional", "unknown:conditional"]],
  "claude.deploy-runtime": ["claude", "deploy", ["installer:selected"]], "claude.deploy-launcher": ["claude", "deploy", ["installer:selected"]],
} as const satisfies Record<InstallPlanEntryId, EntryContract>;
export type PiOwnershipEvidence =
  | { status: "absent" }
  | { status: "managed"; layout: "isolated" | "legacy" }
  | { status: "ambiguous"; reason: "legacy-destination-conflict" | "unmarked-existing-target" };
export type InstallPlanBlocker = Readonly<{ code: "pi-ownership-ambiguous"; reason: "Pi ownership cannot be proven safely" }>;

export type InstallPlanInput = {
  target: InstallTarget;
  home: string;
  piAgentDir: string;
  piAgentDirExists: boolean;
  piOwnership: PiOwnershipEvidence;
  claudeConfigHome: string;
  platform: { os: "darwin" | "linux"; arch: "arm64" | "x64" };
  dependencies: Readonly<Record<InstallDependencyId, boolean>>;
  flags: { yes: boolean; noEngram: boolean; noSecrets: boolean; noHypa: boolean; noCodegraph: boolean; skipLinear: boolean };
};

export type ManagedInstallEntry = Readonly<{
  id: InstallPlanEntryId;
  runtime: InstallPlanRuntime;
  action: InstallPlanAction;
  state: InstallPlanState;
  destination?: string;
  ownership: "installer" | "external" | "unknown";
  reason: string;
}>;

export type InstallPlanV1 = Readonly<{
  schemaVersion: 1;
  target: InstallTarget;
  home: string;
  claudeConfigHome: string;
  platform: Readonly<{ os: "darwin" | "linux"; arch: "arm64" | "x64" }>;
  status: "ready" | "blocked";
  blockers: readonly InstallPlanBlocker[];
  inventory: readonly ManagedInstallEntry[];
}>;

export class InstallPlanInputError extends Error {
  readonly code: "invalid-shape" | "invalid-target" | "invalid-platform" | "invalid-path" | "invalid-dependencies" | "invalid-ownership" | "invalid-flags";
  constructor(code: InstallPlanInputError["code"]) { super(`Install plan input rejected: ${code}`); this.name = "InstallPlanInputError"; this.code = code; }
}

export class InstallPlanValidationError extends Error {
  readonly code = "invalid-plan";
  constructor() { super("Install plan rejected: invalid-plan"); this.name = "InstallPlanValidationError"; }
}

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).sort().join() === [...keys].sort().join();
}

const publicString = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
const safePath = (path: unknown): path is string => publicString(path) && isAbsolute(path) && normalize(path) === path && resolve(path) === path;
/** Validate the complete public plan output without reconstructing private planner inputs. */
export function validateInstallPlan(plan: unknown): asserts plan is InstallPlanV1 {
  try {
    if (!exact(plan, ["schemaVersion", "target", "home", "claudeConfigHome", "platform", "status", "blockers", "inventory"]) || plan.schemaVersion !== 1 || !["pi", "claude", "both"].includes(plan.target as string) || !["ready", "blocked"].includes(plan.status as string) || !safePath(plan.home) || !safePath(plan.claudeConfigHome)) throw 0;
    if (!exact(plan.platform, ["os", "arch"]) || !["darwin", "linux"].includes(plan.platform.os as string) || !["arm64", "x64"].includes(plan.platform.arch as string) || !Array.isArray(plan.blockers) || !Array.isArray(plan.inventory)) throw 0;
    const target = plan.target as InstallTarget;
    const expected = ["shared.dependency.bun", ...(target === "claude" ? [] : PI_INSTALL_PLAN_ENTRY_IDS), ...(target === "pi" ? [] : CLAUDE_INSTALL_PLAN_ENTRY_IDS)];
    if (plan.inventory.length !== expected.length) throw 0;
    for (let index = 0; index < expected.length; index += 1) {
      const entry = plan.inventory[index];
      if (!exact(entry, entry && typeof entry === "object" && "destination" in entry ? ["id", "runtime", "action", "state", "destination", "ownership", "reason"] : ["id", "runtime", "action", "state", "ownership", "reason"]) || entry.id !== expected[index] || !INSTALL_PLAN_ENTRY_IDS.includes(entry.id as InstallPlanEntryId) || !["selected", "conditional", "satisfied", "skipped", "blocked"].includes(entry.state as string) || !["installer", "external", "unknown"].includes(entry.ownership as string) || !publicString(entry.reason) || ("destination" in entry && !safePath(entry.destination))) throw 0;
      const id = entry.id as InstallPlanEntryId;
      const [runtime, action, allowed] = INSTALL_PLAN_ENTRY_CONTRACTS[id];
      const destination = !id.includes("dependency.") && id !== "pi.configure-secrets" && id !== "pi.configure-context7-export";
      if (entry.runtime !== runtime || entry.action !== action || !allowed.includes(`${entry.ownership}:${entry.state}` as never) || ("destination" in entry) !== destination) throw 0;
    }
    const migration = plan.inventory.find((entry) => entry.id === "pi.migrate-legacy");
    const blocked = plan.status === "blocked";
    if (blocked !== (migration?.state === "blocked") || plan.inventory.some((entry) => entry.state === "blocked" && entry.id !== "pi.migrate-legacy") || (blocked && target === "claude") || plan.blockers.length !== (blocked ? 1 : 0)) throw 0;
    if (blocked && (!exact(plan.blockers[0], ["code", "reason"]) || plan.blockers[0].code !== "pi-ownership-ambiguous" || plan.blockers[0].reason !== "Pi ownership cannot be proven safely")) throw 0;
  } catch { throw new InstallPlanValidationError(); }
}

function validateInput(input: InstallPlanInput): void {
  const value = input as unknown;
  if (!exact(value, ["target", "home", "piAgentDir", "piAgentDirExists", "piOwnership", "claudeConfigHome", "platform", "dependencies", "flags"])) throw new InstallPlanInputError("invalid-shape");
  if (typeof value.target !== "string" || !["pi", "claude", "both"].includes(value.target)) throw new InstallPlanInputError("invalid-target");
  if (!exact(value.platform, ["os", "arch"]) || typeof value.platform.os !== "string" || typeof value.platform.arch !== "string" || !["darwin", "linux"].includes(value.platform.os) || !["arm64", "x64"].includes(value.platform.arch)) throw new InstallPlanInputError("invalid-platform");
  if (![value.home, value.piAgentDir, value.claudeConfigHome].every(safePath) || typeof value.piAgentDirExists !== "boolean") throw new InstallPlanInputError("invalid-path");
  const dependencyKeys: InstallDependencyId[] = ["bun", "pi", "engram", "gh", "hypa", "codegraph"];
  const dependencies = value.dependencies;
  if (!exact(dependencies, dependencyKeys) || dependencyKeys.some((key) => typeof dependencies[key] !== "boolean")) throw new InstallPlanInputError("invalid-dependencies");
  const owner = value.piOwnership;
  const validOwner = exact(owner, ["status"]) && owner.status === "absent" || exact(owner, ["status", "layout"]) && owner.status === "managed" && (owner.layout === "isolated" || owner.layout === "legacy") || exact(owner, ["status", "reason"]) && owner.status === "ambiguous" && (owner.reason === "legacy-destination-conflict" || owner.reason === "unmarked-existing-target");
  if (!validOwner) throw new InstallPlanInputError("invalid-ownership");
  const flagKeys = ["yes", "noEngram", "noSecrets", "noHypa", "noCodegraph", "skipLinear"];
  const flags = value.flags;
  if (!exact(flags, flagKeys) || flagKeys.some((key) => typeof flags[key] !== "boolean")) throw new InstallPlanInputError("invalid-flags");
}

function dependency(input: InstallPlanInput, id: InstallDependencyId, runtime: InstallPlanRuntime, disabled = false): ManagedInstallEntry {
  const present = input.dependencies[id];
  const optional = id !== "bun" && id !== "pi";
  const state: InstallPlanState = present ? "satisfied" : disabled ? "skipped" : optional && !input.flags.yes ? "conditional" : "selected";
  return { id: `${runtime}.dependency.${id}` as InstallPlanEntryId, runtime, action: "ensure-dependency", state, ownership: "external", reason: present ? `${id} already available` : disabled ? `${id} disabled by flags` : optional && !input.flags.yes ? `${id} requires confirmation` : `${id} required by selected work` };
}

function piEntries(input: InstallPlanInput): ManagedInstallEntry[] {
  const ownership = input.piOwnership.status === "ambiguous" ? "unknown" : "installer";
  const migrationState: InstallPlanState = input.piOwnership.status === "ambiguous" ? "blocked" : input.piOwnership.status === "managed" && input.piOwnership.layout === "legacy" ? "selected" : "skipped";
  return [
    dependency(input, "pi", "pi"),
    dependency(input, "engram", "pi", input.flags.noEngram),
    dependency(input, "gh", "pi", input.flags.yes),
    dependency(input, "hypa", "pi", input.flags.noHypa || input.flags.yes),
    dependency(input, "codegraph", "pi", input.flags.noCodegraph || input.flags.yes),
    { id: "pi.migrate-legacy", runtime: "pi", action: "migrate", state: migrationState, destination: input.piAgentDir, ownership, reason: input.piOwnership.status === "ambiguous" ? input.piOwnership.reason : migrationState === "selected" ? "managed legacy install must move before deploy" : "no managed legacy install observed" },
    { id: "pi.backup-current", runtime: "pi", action: "backup", state: "conditional", destination: input.piAgentDir, ownership, reason: input.piAgentDirExists ? "existing target is snapshotted before deploy" : "target existence is rechecked before deploy" },
    { id: "pi.deploy-template", runtime: "pi", action: "deploy", state: "selected", destination: input.piAgentDir, ownership, reason: `deploy managed Pi template with Linear integration ${input.flags.skipLinear ? "off" : "on"} and preserve user state` },
    { id: "pi.configure-packages", runtime: "pi", action: "configure", state: "selected", destination: input.piAgentDir, ownership, reason: "install packages declared by the deployed Pi settings" },
    { id: "pi.configure-secrets", runtime: "pi", action: "configure", state: input.flags.noSecrets || input.flags.yes ? "skipped" : "conditional", ownership: "installer", reason: input.flags.noSecrets ? "secret configuration disabled by flags" : input.flags.yes ? "non-interactive install skips secret prompts" : "optional secret prompts require user input" },
    { id: "pi.configure-context7-export", runtime: "pi", action: "configure", state: input.flags.noSecrets ? "skipped" : "conditional", ownership: "installer", reason: input.flags.noSecrets ? "shell export disabled with secrets" : "shell export changes only when absent" },
    { id: "pi.write-install-marker", runtime: "pi", action: "write-marker", state: "selected", destination: input.piAgentDir, ownership, reason: "record successful managed template deployment" },
    { id: "pi.verify-doctor", runtime: "pi", action: "verify", state: "selected", destination: input.piAgentDir, ownership, reason: "verify dependencies and deployed Pi state" },
    { id: "pi.deploy-launcher", runtime: "pi", action: "deploy", state: "selected", destination: input.home, ownership: "installer", reason: "install the Pi Fish launcher" },
    { id: "pi.promote-commands", runtime: "pi", action: "promote-command", state: "conditional", destination: input.piAgentDir, ownership: "installer", reason: "promote commands when executable and app source permit" },
  ];
}

function claudeEntries(input: InstallPlanInput): ManagedInstallEntry[] {
  return [
    { id: "claude.deploy-runtime", runtime: "claude", action: "deploy", state: "selected", destination: input.claudeConfigHome, ownership: "installer", reason: "sync the staged managed Claude runtime" },
    { id: "claude.deploy-launcher", runtime: "claude", action: "deploy", state: "selected", destination: input.home, ownership: "installer", reason: "install the Claude Fish launcher after sync" },
  ];
}

export function createInstallPlan(input: InstallPlanInput): InstallPlanV1 {
  validateInput(input);
  const inventory = [dependency(input, "bun", "shared")];
  if (input.target !== "claude") inventory.push(...piEntries(input));
  if (input.target !== "pi") inventory.push(...claudeEntries(input));
  for (const entry of inventory) Object.freeze(entry);
  const blocked = input.target !== "claude" && input.piOwnership.status === "ambiguous";
  const blockers: InstallPlanBlocker[] = blocked ? [{ code: "pi-ownership-ambiguous", reason: "Pi ownership cannot be proven safely" }] : [];
  for (const blocker of blockers) Object.freeze(blocker);
  const plan = Object.freeze({ schemaVersion: 1 as const, target: input.target, home: input.home, claudeConfigHome: input.claudeConfigHome, platform: Object.freeze({ os: input.platform.os, arch: input.platform.arch }), status: blocked ? "blocked" as const : "ready" as const, blockers: Object.freeze(blockers), inventory: Object.freeze(inventory) }); validateInstallPlan(plan); return plan;
}

export function renderInstallPlan(plan: InstallPlanV1): string {
  return [`Install plan v${plan.schemaVersion} (${plan.target}, read-only): ${plan.status.toUpperCase()}`, ...plan.blockers.map((blocker) => `  BLOCKER [${blocker.code}]: ${blocker.reason}`), ...plan.inventory.map((entry, index) => `  ${index + 1}. [${entry.state}] ${entry.id}: ${entry.reason}`)].join("\n");
}

export function serializeInstallPlan(plan: InstallPlanV1): string {
  return JSON.stringify(plan, null, 2);
}
