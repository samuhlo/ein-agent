import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { UninstallPlan, UninstallPlanInput } from "./uninstall-plan.ts";

type RecoveryEntry = { id: string; path: string; status: "pending" | "moved" | "restored" };
type RecoveryManifest = { schemaVersion: 1; transactionId: string; target: UninstallPlan["target"]; state: "incomplete" | "complete" | "rolled-back"; entries: RecoveryEntry[] };
export type UninstallResult = Readonly<{ status: "complete" | "rolled-back" | "recovery-required"; moved: readonly string[]; absent: readonly string[]; recoveryDirectory?: string }>;
export type UninstallRecoveryOptions = Readonly<UninstallPlanInput & { transactionId?: () => string; fault?: (point: string) => void }>;
export type UninstallRecoveryStatus = Readonly<{ status: "clear" }> | Readonly<{ status: "blocked"; recoveryDirectory: string }>;

const recoveryBase = (home: string): string => join(home, ".ein-installer", "uninstall-recovery");
const publish = (path: string, manifest: RecoveryManifest): void => writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

function pruneEmptyRuntimeDirectories(home: string, target: UninstallPlan["target"]): void {
  const directories = [
    ...(target === "claude" ? [] : [join(home, ".pi-ein", "agent", "skills"), join(home, ".pi-ein", "agent", "themes")]),
    ...(target === "pi" ? [] : [join(home, ".claude-ein", "commands", "ein"), join(home, ".claude-ein", "commands"), join(home, ".claude-ein", "agents"), join(home, ".claude-ein", "assets"), join(home, ".claude-ein", "bin"), join(home, ".claude-ein", "skills"), join(home, ".claude-ein")]),
  ];
  for (const directory of directories) {
    try { rmdirSync(directory); }
    catch {
      // CORTE -> la recuperación ya está sellada; una carpeta no vacía o protegida no invalida la desinstalación.
    }
  }
}

function readManifest(path: string): RecoveryManifest {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object") throw new Error("invalid manifest");
  const manifest = value as RecoveryManifest;
  if (manifest.schemaVersion !== 1 || !["pi", "claude", "both"].includes(manifest.target) || !["incomplete", "complete", "rolled-back"].includes(manifest.state) || !Array.isArray(manifest.entries)) throw new Error("invalid manifest");
  return manifest;
}

export function inspectUninstallRecovery(home: string): UninstallRecoveryStatus {
  const base = recoveryBase(home);
  let directories;
  try { directories = readdirSync(base, { withFileTypes: true }); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? { status: "clear" } : { status: "blocked", recoveryDirectory: base }; }
  for (const entry of directories) {
    const root = join(base, entry.name);
    try { if (!entry.isDirectory() || readManifest(join(root, "manifest.json")).state === "incomplete") return { status: "blocked", recoveryDirectory: root }; }
    catch { return { status: "blocked", recoveryDirectory: root }; }
  }
  return { status: "clear" };
}

export function executeUninstallPlan(plan: UninstallPlan, options: UninstallRecoveryOptions): UninstallResult {
  if (plan.status !== "ready" || plan.target !== options.target) throw new Error("Uninstall is blocked");
  const existing = inspectUninstallRecovery(options.home);
  if (existing.status === "blocked") return { status: "recovery-required", moved: [], absent: [], recoveryDirectory: existing.recoveryDirectory };
  const selected = plan.entries.filter(({ state }) => state === "selected");
  const absent = plan.entries.filter(({ state }) => state === "absent").map(({ id }) => id);
  if (!selected.length) return { status: "complete", moved: [], absent };

  const transactionId = (options.transactionId ?? (() => `${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}-${randomUUID().slice(0, 8)}`))();
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(transactionId)) throw new Error("Invalid uninstall transaction id");
  const base = recoveryBase(options.home), root = join(base, transactionId), manifestPath = join(root, "manifest.json");
  mkdirSync(base, { recursive: true, mode: 0o700 });
  mkdirSync(root, { mode: 0o700 });
  let manifest: RecoveryManifest = { schemaVersion: 1, transactionId, target: plan.target, state: "incomplete", entries: selected.map(({ id, path }) => ({ id, path, status: "pending" })) };
  const moved: typeof selected[number][] = [];

  try {
    publish(manifestPath, manifest);
    for (const entry of selected) {
      options.fault?.(`move:${entry.id}`);
      const recovery = join(root, "files", entry.path);
      mkdirSync(dirname(recovery), { recursive: true, mode: 0o700 });
      renameSync(entry.destination, recovery);
      moved.push(entry);
      manifest.entries.find(({ id }) => id === entry.id)!.status = "moved";
      publish(manifestPath, manifest);
    }
    manifest = { ...manifest, state: "complete" };
    publish(manifestPath, manifest);
    pruneEmptyRuntimeDirectories(options.home, plan.target);
    return { status: "complete", moved: moved.map(({ id }) => id), absent, recoveryDirectory: root };
  } catch {
    let incomplete = false;
    for (const entry of [...moved].reverse()) try {
      options.fault?.(`rollback:${entry.id}`);
      renameSync(join(root, "files", entry.path), entry.destination);
      manifest.entries.find(({ id }) => id === entry.id)!.status = "restored";
    } catch { incomplete = true; }
    manifest = { ...manifest, state: incomplete ? "incomplete" : "rolled-back" };
    try { publish(manifestPath, manifest); } catch { incomplete = true; }
    const remaining = incomplete ? moved.filter(({ id }) => manifest.entries.find((item) => item.id === id)?.status === "moved").map(({ id }) => id) : [];
    return { status: incomplete ? "recovery-required" : "rolled-back", moved: remaining, absent, recoveryDirectory: root };
  }
}
