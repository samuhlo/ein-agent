import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { selectDashboardBinary } from "../../../ein-pi/agent/launcher/dashboard-selector.ts";
import { validateDashboardRelease, type DashboardRelease, type DashboardTarget } from "../../../ein-pi/agent/lib/dashboard-package.ts";
import { verifyCandidateInput } from "../../scripts/dashboard-candidate-input.ts";
import { targetById } from "../../../spikes/opentui-solid-packaging/src/targets.ts";
import { APP_COMMAND, INSTALLER_COMMAND } from "./command-names.ts";
export const DASHBOARD_PACKAGE_DIR = ".ein-dashboard";
export const LEGACY_APP_NAME = "ein-app-legacy";
export type PromotionPorts = Readonly<{
  compile: (entrypoint: string, output: string) => void;
  copy: (from: string, to: string) => void;
  write: (path: string, data: string, mode: number) => void;
  rename: (from: string, to: string) => void;
  validate: (root: string, target: DashboardTarget) => Promise<DashboardRelease | undefined>;
}>;
export type AppPromotion = Readonly<{
  packaged: boolean;
  installerWritten: boolean;
  appPath: string;
  releasePath?: string;
  rollback: () => void;
  commit: () => void;
}>;
export type AppPromotionOptions = Readonly<{
  binDir: string;
  selfPath?: string;
  agentDir: string;
  platform: string;
  arch: string;
  appName?: string;
  appSource?: string;
  seedRoot?: string;
  releaseId?: string;
  ports?: Partial<PromotionPorts>;
}>;
const sha256 = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
function restore(path: string, backup: string | undefined): void {
  rmSync(path, { recursive: true, force: true });
  if (backup && existsSync(backup)) renameSync(backup, path);
}
/** Promotes either the legacy app or one target-bound package and retains undo until commit. */
export async function promotePiAppPackage(options: AppPromotionOptions): Promise<AppPromotion> {
  const ports: PromotionPorts = {
    compile: (entrypoint, output) => execFileSync("bun", ["build", "--compile", entrypoint, "--outfile", output], { stdio: "ignore" }),
    copy: copyFileSync,
    write: (path, data, mode) => writeFileSync(path, data, { mode }),
    rename: renameSync,
    validate: validateDashboardRelease,
    ...options.ports,
  };
  mkdirSync(options.binDir, { recursive: true });
  const installerPath = join(options.binDir, INSTALLER_COMMAND);
  const installerWritten = options.selfPath !== undefined && options.selfPath !== installerPath;
  if (options.selfPath !== undefined && options.selfPath !== installerPath) {
    ports.copy(options.selfPath, installerPath);
    chmodSync(installerPath, 0o755);
  }

  const appName = options.appName ?? APP_COMMAND;
  const appPath = join(options.binDir, appName);
  const appSource = options.appSource ?? join(options.agentDir, "app.ts");
  if (!existsSync(appSource)) throw new Error("app-source-missing");
  const packageRoot = join(options.binDir, DASHBOARD_PACKAGE_DIR);
  const seedRoot = options.seedRoot ?? join(options.agentDir, "ein", "runtime-seed", "dashboard", "v1");
  const id = options.releaseId ?? `r-${Date.now()}-${randomUUID()}`;
  const stagingRoot = join(packageRoot, `.staging-${id}`);
  const appStaging = join(options.binDir, `.${appName}.staging-${id}`);
  const appBackup = existsSync(appPath) ? join(options.binDir, `.${appName}.backup-${id}`) : undefined;
  let releasePath: string | undefined;
  let pointerBackup: string | undefined;
  let appSwitched = false;
  let pointerSwitched = false;

  const rollback = (): void => {
    if (pointerSwitched) restore(join(packageRoot, "current.json"), pointerBackup);
    if (appSwitched) restore(appPath, appBackup);
    if (releasePath) rmSync(releasePath, { recursive: true, force: true });
    rmSync(stagingRoot, { recursive: true, force: true });
    rmSync(appStaging, { force: true });
  };
  const commit = (): void => {
    if (appBackup) rmSync(appBackup, { force: true });
    if (pointerBackup) rmSync(pointerBackup, { force: true });
    rmSync(stagingRoot, { recursive: true, force: true });
  };

  try {
    if (!existsSync(seedRoot)) {
      ports.compile(appSource, appStaging);
      chmodSync(appStaging, 0o755);
      if (appBackup) ports.copy(appPath, appBackup);
      appSwitched = true;
      ports.rename(appStaging, appPath);
      return { packaged: false, installerWritten, appPath, rollback, commit };
    }

    const target = targetById(`${options.platform}-${options.arch}`);
    const seedPackage = join(seedRoot, "packages", target.id);
    const inventoryPath = join(seedPackage, "candidate-inventory.json");
    const inventoryValue = JSON.parse(readFileSync(inventoryPath, "utf8")) as { artifact?: { filename?: string } };
    const candidatePath = join(seedPackage, inventoryValue.artifact?.filename ?? "invalid");
    const verified = verifyCandidateInput({ target, candidateBinary: candidatePath, candidateInventory: inventoryPath });
    const stagedRelease = join(stagingRoot, "releases", id);
    mkdirSync(stagedRelease, { recursive: true });
    const legacyPath = join(stagedRelease, LEGACY_APP_NAME);
    ports.compile(appSource, legacyPath);
    chmodSync(legacyPath, 0o755);
    const stagedCandidate = join(stagedRelease, verified.inventory.artifact.filename);
    ports.copy(candidatePath, stagedCandidate);
    chmodSync(stagedCandidate, 0o755);
    const artifact = (path: string) => ({ filename: path.slice(path.lastIndexOf("/") + 1), sha256: sha256(path), bytes: lstatSync(path).size, mode: "0755" as const });
    const manifest = { format: "ein-dashboard-release/v1", release: id, target: target.id, legacy: artifact(legacyPath), candidate: artifact(stagedCandidate) } as const;
    ports.write(join(stagedRelease, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, 0o644);
    ports.write(join(stagingRoot, "current.json"), `${JSON.stringify({ format: "ein-dashboard-current/v1", release: id }, null, 2)}\n`, 0o644);

    const selectorSource = join(stagingRoot, "selector-main.ts");
    const seededSelector = join(seedRoot, "selector", "launcher", "dashboard-selector.ts");
    const finalLegacy = join(packageRoot, "releases", id, LEGACY_APP_NAME);
    ports.write(selectorSource, [
      `import { launchDashboard, spawnInherited } from ${JSON.stringify(seededSelector)};`,
      `const code = await launchDashboard({ argv: process.argv.slice(2), cwd: process.cwd(), packageRoot: ${JSON.stringify(packageRoot)}, legacyBinary: ${JSON.stringify(finalLegacy)}, ports: { platform: process.platform, arch: process.arch, stdinTTY: Boolean(process.stdin.isTTY), stdoutTTY: Boolean(process.stdout.isTTY), spawn: spawnInherited } });`,
      "process.exit(code);\n",
    ].join("\n"), 0o644);
    ports.compile(selectorSource, appStaging);
    chmodSync(appStaging, 0o755);
    const selected = await ports.validate(stagingRoot, target.id);
    if (!selected || selected.legacy !== legacyPath || selected.candidate !== stagedCandidate) throw new Error("staged dashboard package validation failed");
    const fixturePorts = { platform: options.platform, arch: options.arch, stdinTTY: true, stdoutTTY: true, validate: ports.validate };
    if (await selectDashboardBinary({ argv: ["--once"], cwd: options.agentDir, packageRoot: stagingRoot, legacyBinary: "invalid", ports: fixturePorts }) !== legacyPath
      || await selectDashboardBinary({ argv: [], cwd: options.agentDir, packageRoot: stagingRoot, legacyBinary: "invalid", ports: fixturePorts }) !== stagedCandidate) {
      throw new Error("staged dashboard selector fixture validation failed");
    }

    mkdirSync(join(packageRoot, "releases"), { recursive: true });
    const finalRelease = join(packageRoot, "releases", id);
    if (existsSync(finalRelease)) throw new Error(`dashboard release already exists: ${id}`);
    releasePath = finalRelease;
    ports.rename(stagedRelease, releasePath);
    if (appBackup) ports.copy(appPath, appBackup);
    appSwitched = true;
    ports.rename(appStaging, appPath);
    const currentPath = join(packageRoot, "current.json");
    if (existsSync(currentPath)) {
      pointerBackup = join(packageRoot, `.current.backup-${id}`);
      ports.copy(currentPath, pointerBackup);
    }
    pointerSwitched = true;
    ports.rename(join(stagingRoot, "current.json"), currentPath);
    return { packaged: true, installerWritten, appPath, releasePath, rollback, commit };
  } catch (error) {
    rollback();
    throw error;
  }
}
