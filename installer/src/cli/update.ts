import * as p from "../tui/ui.ts";
import { dirname, join } from "node:path";
import { INSTALLER_COMMAND, promoteCommandNames } from "../core/command-names.ts";
import { detectPlatform, type Platform } from "../core/platform.ts";
import { installDeclaredPackages, installPi, refreshExternalTools, type InstallStep } from "../core/deps.ts";
import { AGENT_DIR, INSTALL_MARKER } from "../core/paths.ts";
import { parseSelector } from "../core/release-resolver.ts";
import { isReleaseChannel, type ReleaseChannel, type ReleaseSelector, type UpdateOutcome } from "../core/release-types.ts";
import { readReleaseChannelPreference, writeReleaseChannelPreference } from "../core/release-channel-preference.ts";
import { recoverPendingTransaction, runUpdateTransaction } from "../core/transaction.ts";
import { defaultUpdateCaps, type UpdateCaps } from "../core/update-caps.ts";
import { readInstallerUpdateEvidence, type InstallerUpdateReadEvidence } from "../core/update-advisor-read.ts";
import { spawnContinuation } from "../core/child-continuation.ts";
import { bold, gold } from "../tui/theme.ts";
import { EXIT_FAILED, renderOutcome } from "./result.ts";

export type UpdateFlags = {
  selectorArgs: string[];
  dryRun: boolean;
  yes: boolean;
  channel?: ReleaseChannel;
  error?: string;
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
  // transactional Ein-binary update; these hooks let it resolve npm latest
  // alongside Ein and keep tests off the network. Defaults hit bun/pi for real.
  updatePi?: () => Promise<InstallStep>;
  syncPiPackages?: () => Promise<InstallStep>;
  confirmExternalToolsUpdate?: () => Promise<boolean>;
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
  let channel: ReleaseChannel | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--yes" || arg === "-y") yes = true;
    else if (arg === "--channel") {
      if (channel !== undefined) return { selectorArgs, dryRun, yes, channel, error: "--channel no puede repetirse" };
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        return { selectorArgs, dryRun, yes, error: "--channel necesita un valor separado" };
      }
      if (!isReleaseChannel(value)) {
        return { selectorArgs, dryRun, yes, error: `canal no soportado: ${value}` };
      }
      channel = value;
      index += 1;
    } else if (arg.startsWith("--channel=")) {
      return { selectorArgs, dryRun, yes, channel, error: "--channel usa un valor separado: --channel alpha|stable" };
    } else selectorArgs.push(arg);
  }
  return { selectorArgs, dryRun, yes, ...(channel ? { channel } : {}) };
}

function failed(selector: ReleaseSelector | undefined, stage: Extract<UpdateOutcome, { type: "failed" }>["stage"], message: string): UpdateOutcome {
  return { type: "failed", stage, message, ...(selector ? { selector } : {}) };
}

export async function runUpdate(args: string[], dependencies: UpdateRunDependencies = {}): Promise<number> {
  const caps = dependencies.caps ?? defaultUpdateCaps();
  const flags = parseCliFlags(args);
  const write = dependencies.write ?? ((line: string) => p.log.message(line));
  if (dependencies.interactive !== false) p.intro("actualizar ein y pi");

  const markerPath = dependencies.markerPath ?? INSTALL_MARKER;
  const installationPath = dependencies.installationPath ?? dependencies.agentDir ?? dirname(markerPath);
  const destinationPath = dependencies.destinationPath ?? process.execPath;
  const preference = readReleaseChannelPreference(installationPath);
  const selector = parseSelector(flags.selectorArgs);
  const effectiveChannel = flags.channel ?? (preference.status === "unavailable" ? undefined : preference.channel);
  let outcome: UpdateOutcome;
  let persistedChannel = false;
  let channelPersistenceError: string | undefined;
  if (flags.error) {
    outcome = failed(selector.ok ? selector.value : undefined, "resolving", flags.error);
  } else if (!effectiveChannel) {
    outcome = failed(
      selector.ok ? selector.value : undefined,
      "resolving",
      `Release channel preference unavailable: ${preference.status === "unavailable" ? preference.reason : "effective-channel-unavailable"}`,
    );
  } else {
    const recovery = await recoverPendingTransaction({
      caps,
      journalPath: dependencies.journalPath,
      finalizeCommitted: async (journal) => (await spawnContinuation({
        candidatePath: destinationPath,
        txId: journal.txId,
        releaseTag: journal.target,
        caps,
        runtimeSurfaces: "commit",
      })).ok,
    });
    if (!recovery.ok) {
      outcome = failed(selector.ok ? selector.value : undefined, recovery.error.stage, recovery.error.message);
    } else if (!selector.ok) {
      outcome = failed(undefined, selector.error.stage, selector.error.message);
    } else {
      outcome = await runUpdateTransaction({
        caps,
        selector: selector.value,
        channel: effectiveChannel,
        platform: dependencies.platform ?? detectPlatform(),
        agentDir: dependencies.agentDir ?? AGENT_DIR,
        markerPath,
        journalPath: dependencies.journalPath,
        destinationPath,
        dryRun: flags.dryRun,
      });
    }
  }

  if (
    flags.channel
    && !flags.dryRun
    && (outcome.type === "updated" || outcome.type === "already-current")
  ) {
    const written = writeReleaseChannelPreference(installationPath, flags.channel);
    if (written.status === "explicit" && written.channel === flags.channel) {
      persistedChannel = true;
    } else {
      const updateState = outcome.type === "updated" ? "se actualizó" : "ya estaba actualizado";
      channelPersistenceError = `Ein ${updateState}, pero no se pudo guardar el canal ${flags.channel}; la preferencia anterior sigue vigente.`;
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
    if (flags.channel) advisor = projectExplicitChannel(advisor, flags.channel, persistedChannel);
  } catch {
    // Advisor evidence is informational and must never change the update exit code.
  }
  const baseRendered = renderOutcome(outcome, advisor);
  const rendered = channelPersistenceError
    ? {
      lines: [
        ...baseRendered.lines.filter((line) => line !== "Actualización completada." && line !== "Ya está actualizado."),
        channelPersistenceError,
      ],
      exitCode: EXIT_FAILED,
    }
    : baseRendered;

  // The transaction above owns the Ein binary + template + marker. Pi and its
  // declared extensions are package-manager artifacts: resolve their moving
  // latest tags after every successful, non-dry-run Ein update.
  let runtimeLatest = true;
  if (rendered.exitCode === 0 && !flags.dryRun) {
    runtimeLatest = await refreshPi(flags, dependencies, write);
    // `ein` is the terminal app and `ein-install` is this binary. Promoting on
    // every successful update is what migrates a machine still on the old
    // layout, where `ein` was the installer, in a single step.
    promoteCommands(dependencies, write);
  }
  const finalRendered = runtimeLatest
    ? rendered
    : {
      lines: [
        ...rendered.lines.filter((line) => line !== "Actualización completada." && line !== "Ya está actualizado."),
        "Ein se actualizó, pero Pi o sus extensiones no alcanzaron npm latest.",
      ],
      exitCode: EXIT_FAILED,
    };
  for (const line of finalRendered.lines) write(line);

  if (dependencies.interactive !== false) {
    p.outro(finalRendered.exitCode === 0 ? "Actualización finalizada." : runtimeLatest ? "Actualización no aplicada." : "Actualización incompleta: resuelve Pi latest y repite.");
  }
  return finalRendered.exitCode;
}

function projectExplicitChannel(
  evidence: InstallerUpdateReadEvidence,
  channel: ReleaseChannel,
  persisted: boolean,
): InstallerUpdateReadEvidence {
  const release = evidence.release.status === "valid"
    ? { ...evidence.release, freshness: channel === "alpha" ? "unknown" as const : "current" as const }
    : evidence.release;
  const freshness = evidence.release.status === "valid"
    ? channel === "alpha"
      ? { status: "unknown" as const, reason: "alpha-expiration-evidence-unavailable" }
      : { status: "unknown" as const, reason: "publication-evidence-unavailable" }
    : evidence.freshness;
  return Object.freeze({
    ...evidence,
    release,
    freshness,
    effectiveChannel: channel,
    preference: persisted ? { status: "explicit" as const, channel } : evidence.preference,
  });
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
      : `App de terminal no desplegada (${result.app.reason ?? "desconocido"}); usa \`ein-pi app\`.`);
    return result.app.written;
  } catch (error) {
    write(`No se pudieron promover los comandos: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/** Refreshes pi and its declared extensions after the Ein binary transaction. */
async function refreshPi(
  flags: UpdateFlags,
  dependencies: UpdateRunDependencies,
  write: (line: string) => void,
): Promise<boolean> {
  const interactive = dependencies.interactive !== false;
  const updatePi = dependencies.updatePi ?? installPi;
  const syncPackages = dependencies.syncPiPackages ?? installDeclaredPackages;

  const piSpinner = interactive ? p.spinner() : null;
  piSpinner?.start("Actualizando pi desde npm latest");
  let pi: InstallStep;
  try {
    pi = await updatePi();
  } catch {
    pi = { ok: false, detail: "pi latest: la actualización lanzó un error" };
  }
  piSpinner?.stop(pi.ok ? pi.detail : "Pi latest no actualizado");
  if (!interactive) write(pi.detail);
  else if (!pi.ok) p.log.warn(pi.detail);

  const pkgSpinner = interactive ? p.spinner() : null;
  pkgSpinner?.start("Verificando paquetes de Pi declarados");
  let pkgs: InstallStep;
  try {
    pkgs = await syncPackages();
  } catch {
    pkgs = { ok: false, detail: "extensiones Pi latest: la actualización lanzó un error" };
  }
  pkgSpinner?.stop(pkgs.ok ? pkgs.detail : "Extensiones Pi latest no actualizadas");
  if (!interactive) write(pkgs.detail);
  else if (!pkgs.ok) p.log.warn(pkgs.detail);

  const refreshExternal = flags.yes
    ? true
    : dependencies.confirmExternalToolsUpdate
      ? await dependencies.confirmExternalToolsUpdate()
      : interactive
        ? await confirmExternalToolsUpdate()
        : false;
  if (refreshExternal) await refreshExternalDeps(dependencies, write);
  return pi.ok && pkgs.ok;
}

/**
 * Refresca, con confirmación salvo `--yes`, las herramientas externas presentes
 * (engram/hypa/codegraph) tras un update exitoso. Un fallo de red conserva su
 * versión actual y nunca tumba el update; no forman parte del runtime Pi que
 * Ein declara y verifica contra npm latest.
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

async function confirmExternalToolsUpdate(): Promise<boolean> {
  const response = await p.confirm({ message: "Actualizar también las herramientas externas presentes (engram/hypa/codegraph)?" });
  return p.isCancel(response) ? false : response;
}

export async function confirmUpdate(): Promise<boolean> {
  const response = await p.confirm({ message: "Continuar con la actualización verificada?" });
  return p.isCancel(response) ? false : response;
}
