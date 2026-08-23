import * as p from "../tui/ui.ts";
import { dirname, join } from "node:path";
import { INSTALLER_COMMAND, promoteCommandNames } from "../core/command-names.ts";
import { detectPlatform, type Platform } from "../core/platform.ts";
import { installDeclaredPackages, installPi, refreshExternalTools, type InstallStep } from "../core/deps.ts";
import { AGENT_DIR, INSTALL_MARKER } from "../core/paths.ts";
import { parseSelector } from "../core/release-resolver.ts";
import type { ReleaseSelector, UpdateOutcome } from "../core/release-types.ts";
import { readReleaseChannelPreference } from "../core/release-channel-preference.ts";
import { recoverPendingTransaction, runUpdateTransaction } from "../core/transaction.ts";
import { defaultUpdateCaps, type UpdateCaps } from "../core/update-caps.ts";
import { readInstallerUpdateEvidence, type InstallerUpdateReadEvidence } from "../core/update-advisor-read.ts";
import { bold, gold } from "../tui/theme.ts";
import { renderOutcome } from "./result.ts";

export type UpdateFlags = {
  selectorArgs: string[];
  dryRun: boolean;
  yes: boolean;
};

export type UpdateRunDependencies = {
  caps?: UpdateCaps;
  platform?: Pick<Platform, "os" | "arch">;
  agentDir?: string;
  markerPath?: string;
  journalPath?: string;
  destinationPath?: string;
  installationPath?: string;
  readAdvisor?: () => Promise<InstallerUpdateReadEvidence>;
  interactive?: boolean;
  write?: (line: string) => void;
  // pi (the underlying agent) is a package-manager-owned artifact outside the
  // transactional Ein-binary update; these hooks let it refresh alongside and
  // keep tests off the network. Defaults hit bun/pi for real.
  updatePi?: () => Promise<InstallStep>;
  syncPiPackages?: () => Promise<InstallStep>;
  confirmPiUpdate?: () => Promise<boolean>;
  // Deps externas opcionales (engram/hypa/codegraph): binarios fuera de la
  // transacción de Ein que envejecen en silencio. Este hook las refresca tras un
  // update exitoso; el default refresca las presentes de verdad.
  refreshExternalTools?: () => Promise<InstallStep[]>;
  promote?: typeof promoteCommandNames;
};

export function parseCliFlags(args: string[]): UpdateFlags {
  const selectorArgs: string[] = [];
  let dryRun = false;
  let yes = false;
  for (const arg of args) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--yes" || arg === "-y") yes = true;
    else selectorArgs.push(arg);
  }
  return { selectorArgs, dryRun, yes };
}

function failed(selector: ReleaseSelector | undefined, stage: Extract<UpdateOutcome, { type: "failed" }>["stage"], message: string): UpdateOutcome {
  return { type: "failed", stage, message, ...(selector ? { selector } : {}) };
}

/** Keeps dispatch and menu callers on the existing async numeric exit-code contract. */
export async function runUpdate(args: string[], dependencies: UpdateRunDependencies = {}): Promise<number> {
  const caps = dependencies.caps ?? defaultUpdateCaps();
  const flags = parseCliFlags(args);
  const write = dependencies.write ?? ((line: string) => p.log.message(line));
  if (dependencies.interactive !== false) p.intro("actualizar ein y pi");

  const markerPath = dependencies.markerPath ?? INSTALL_MARKER;
  const installationPath = dependencies.installationPath ?? dependencies.agentDir ?? dirname(markerPath);
  const preference = readReleaseChannelPreference(installationPath);
  const selector = parseSelector(flags.selectorArgs);
  let outcome: UpdateOutcome;
  if (preference.status === "unavailable") {
    outcome = failed(
      selector.ok ? selector.value : undefined,
      "resolving",
      `Release channel preference unavailable: ${preference.reason}`,
    );
  } else {
    const recovery = await recoverPendingTransaction({ caps, journalPath: dependencies.journalPath });
    if (!recovery.ok) {
      outcome = failed(selector.ok ? selector.value : undefined, recovery.error.stage, recovery.error.message);
    } else if (!selector.ok) {
      outcome = failed(undefined, selector.error.stage, selector.error.message);
    } else {
      outcome = await runUpdateTransaction({
        caps,
        selector: selector.value,
        channel: preference.channel,
        platform: dependencies.platform ?? detectPlatform(),
        agentDir: dependencies.agentDir ?? AGENT_DIR,
        markerPath,
        journalPath: dependencies.journalPath,
        destinationPath: dependencies.destinationPath ?? process.execPath,
        dryRun: flags.dryRun,
      });
    }
  }

  const releaseForAdvisor = outcome.release?.release;
  const readAdvisor = dependencies.readAdvisor ?? (() => readInstallerUpdateEvidence({
    caps,
    markerPath,
    installationPath,
    readRelease: async () => releaseForAdvisor
      ? { ok: true, value: releaseForAdvisor }
      : { ok: false, error: "update-release-unavailable" },
  }));
  let advisor: InstallerUpdateReadEvidence | undefined;
  try {
    advisor = await readAdvisor();
  } catch {
    // Advisor evidence is informational and must never change the update exit code.
  }
  const rendered = renderOutcome(outcome, advisor);
  for (const line of rendered.lines) write(line);

  // The transactional updater above only owns the Ein binary + template +
  // marker. pi (@earendil-works/pi-coding-agent) is installed via bun and was
  // refreshed by the pre-transactional `ein update`; keep that promise (menu
  // and help still say "Ein y pi") by refreshing it after a successful,
  // non-dry-run update. Best-effort: never turns a good update into a failure.
  if (rendered.exitCode === 0 && !flags.dryRun) {
    await refreshPi(flags, dependencies, write);
    // `ein` is the terminal app and `ein-install` is this binary. Promoting on
    // every successful update is what migrates a machine still on the old
    // layout, where `ein` was the installer, in a single step.
    promoteCommands(dependencies, write);
  }

  if (dependencies.interactive !== false) {
    p.outro(rendered.exitCode === 0 ? "Actualización finalizada." : "Actualización no aplicada.");
  }
  return rendered.exitCode;
}

/** Best-effort: a naming problem must never turn a good update into a failure. */
function promoteCommands(
  dependencies: { agentDir?: string; destinationPath?: string; promote?: typeof promoteCommandNames },
  write: (line: string) => void,
): boolean {
  try {
    const selfPath = dependencies.destinationPath ?? process.execPath;
    const result = (dependencies.promote ?? promoteCommandNames)({
      binDir: dirname(selfPath),
      selfPath,
      appArtifact: join(dependencies.agentDir ?? AGENT_DIR, "bin", "ein"),
    });
    if (result.installer.written) write(`Instalador disponible como \`${INSTALLER_COMMAND}\`.`);
    write(result.app.written
      ? "App de terminal disponible como `ein`."
      : `App de terminal no desplegada (${result.app.reason ?? "desconocido"}); usa \`pi-ein app\`.`);
    return result.app.written;
  } catch (error) {
    write(`No se pudieron promover los comandos: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/** Refreshes pi and the declared Pi packages after the Ein binary transaction. */
async function refreshPi(
  flags: UpdateFlags,
  dependencies: UpdateRunDependencies,
  write: (line: string) => void,
): Promise<void> {
  const interactive = dependencies.interactive !== false;
  const wantPi = flags.yes
    ? true
    : dependencies.confirmPiUpdate
      ? await dependencies.confirmPiUpdate()
      : interactive
        ? await confirmPiUpdate()
        : false;
  if (!wantPi) return;

  const updatePi = dependencies.updatePi ?? installPi;
  const syncPackages = dependencies.syncPiPackages ?? installDeclaredPackages;

  const piSpinner = interactive ? p.spinner() : null;
  piSpinner?.start("Actualizando pi a la última versión");
  const pi = await updatePi();
  piSpinner?.stop(pi.detail);
  if (!interactive) write(pi.detail);

  const pkgSpinner = interactive ? p.spinner() : null;
  pkgSpinner?.start("Verificando paquetes de Pi declarados");
  const pkgs = await syncPackages();
  pkgSpinner?.stop(pkgs.detail);
  if (!interactive) write(pkgs.detail);

  // Bajo la misma confirmación que pi: las deps externas presentes forman parte
  // de "actualizar el toolchain". Gatearlo aquí (no fuera) mantiene los tests de
  // update sin red — un update que no confirma no toca binarios reales.
  await refreshExternalDeps(dependencies, write);
}

/**
 * Refresca las deps externas presentes (engram/hypa/codegraph) tras un update
 * exitoso. Best-effort y sin confirmación aparte: son herramientas que el
 * usuario ya tiene y que envejecen en silencio porque la transacción de Ein no
 * las gestiona. Un fallo de red conserva la versión actual y nunca tumba el
 * update.
 */
async function refreshExternalDeps(
  dependencies: UpdateRunDependencies,
  write: (line: string) => void,
): Promise<void> {
  const interactive = dependencies.interactive !== false;
  const refresh = dependencies.refreshExternalTools
    ?? (() => refreshExternalTools(detectPlatform()));
  const spinner = interactive ? p.spinner() : null;
  spinner?.start("Actualizando herramientas externas (engram, hypa, codegraph)");
  let steps: InstallStep[];
  try {
    steps = await refresh();
  } catch {
    spinner?.stop("Herramientas externas: no se pudieron revisar");
    if (!interactive) write("herramientas externas: no se pudieron revisar");
    return;
  }
  // Un fallo aquí no tumba el update, pero tampoco se disfraza de línea normal:
  // una herramienta que no se actualizó tiene que leerse como tal.
  const failures = steps.filter((step) => !step.ok);
  spinner?.stop(
    failures.length === 0
      ? "Herramientas externas revisadas"
      : `Herramientas externas: ${failures.length} sin actualizar`,
  );
  for (const step of steps) {
    if (!interactive) write(step.detail);
    else if (step.ok) p.log.message(step.detail);
    else p.log.warn(step.detail);
  }
}

async function confirmPiUpdate(): Promise<boolean> {
  const response = await p.confirm({ message: "Actualizar pi y las herramientas externas presentes (engram/hypa/codegraph)?" });
  return p.isCancel(response) ? false : response;
}

export async function confirmUpdate(): Promise<boolean> {
  const response = await p.confirm({ message: "Continuar con la actualización verificada?" });
  return p.isCancel(response) ? false : response;
}
