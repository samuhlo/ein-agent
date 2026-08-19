// =============================================================================
// CLI: install
// Full flow: detect → check deps → install missing → deploy template →
// secrets wizard → context7 export → marker → doctor.
// =============================================================================

import * as p from "@clack/prompts";
import { INSTALLER_COMMAND, promoteCommandNames } from "../core/command-names.ts";
import piEinFish from "../../../pi-ein/pi-ein.fish" with { type: "text" };
import { describePlatform, detectPlatform, type Platform } from "../core/platform.ts";
import { run } from "../core/exec.ts";
import {
  checkDeps,
  installBun,
  installDeclaredPackages,
  installEngramDep,
  installGh,
  installCodegraph,
  installHypa,
  installPi,
  type DepStatus,
  type InstallStep,
} from "../core/deps.ts";
import { deployTemplate, type DeployOptions } from "../core/deploy.ts";
import { installFishLauncher } from "../core/launcher.ts";
import { restoreBackup, snapshot } from "../core/backup.ts";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  activeHome,
  derivePiInstallPaths,
  isValidInstallMarker,
  resolvePiInstallContext,
  type PiInstallContext,
} from "../core/paths.ts";
import { migrateLegacyPi } from "../core/pi-migration.ts";
import {
  ensureContext7Export,
  hasSecret,
  writeSecret,
  type SecretName,
} from "../core/secrets.ts";
import { INSTALLER_VERSION, writeMarker } from "../core/version.ts";
import { runDoctor } from "../core/verify.ts";
import { stageCcEinPayload, type CcEinPayloadStage } from "../core/cc-payload.ts";
import { renderReport } from "./doctor.ts";
import { playBanner } from "../tui/banner.ts";
import { bold, gold, levelMark } from "../tui/theme.ts";
import { frameBlank, frameBlock, frameField, frameTab } from "../tui/frame.ts";
import ccEinFish from "../../../cc-ein/cc-ein.fish" with { type: "text" };
import {
  createInstallPlan,
  renderInstallPlan,
  type InstallDependencyId,
  type InstallPlanEntryId,
  type InstallPlanInput,
  type InstallPlanV1,
  type InstallTarget,
  type PiOwnershipEvidence,
  type RuntimeInstallTarget,
} from "../core/install-plan.ts";
import {
  runtimeFailure,
  type InstallPlanExecutionHandler,
  type InstallPlanExecutionHandlers,
} from "../core/install-executor.ts";
import { executeInstallPlanJournaled, inspectInstallJournal, InstallJournalError } from "../core/install-journal.ts";

/** The one target selected by the menu or the direct installer default. */
export type { InstallTarget, RuntimeInstallTarget } from "../core/install-plan.ts";

export type InstallFlags = {
  yes: boolean;
  noEngram: boolean;
  noSecrets: boolean;
  noLinear: boolean;
  noHypa: boolean;
  noCodegraph: boolean;
  dryRun: boolean;
  runtime: InstallTarget;
};

export class InstallArgumentError extends Error {
  readonly code = "invalid-runtime";

  constructor(detail: string) {
    super(`Error de opción runtime: ${detail}. Usa --runtime pi|claude|both.`);
    this.name = "InstallArgumentError";
  }
}

export type RuntimeInstallResult = {
  target: RuntimeInstallTarget;
  ok: boolean;
  detail: string;
};

export type InstallResult = {
  target: InstallTarget;
  ok: boolean;
  results: RuntimeInstallResult[];
};

export type InstallTargetRunner = () => Promise<RuntimeInstallResult>;

/**
 * Dependencies for the small target orchestrator. Keeping runners injectable
 * makes ordering and failure aggregation testable without invoking Pi/Claude.
 */
export type InstallOrchestratorOptions = {
  prepareBun: () => Promise<InstallStep>;
  runners: Readonly<Record<RuntimeInstallTarget, InstallTargetRunner>>;
};

export type InstallCommandOptions = {
  observations?: Omit<InstallPlanInput, "target" | "flags" | "platform"> & { platform: Platform };
  playBanner?: () => Promise<void>;
  writePlan?: (plan: InstallPlanV1) => void;
  handlers?: InstallPlanExecutionHandlers;
};

function isInstallTarget(value: string): value is InstallTarget {
  return value === "pi" || value === "claude" || value === "both";
}

export function parseInstallFlags(args: string[]): InstallFlags {
  let runtime: InstallTarget = "pi";
  let runtimeSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--runtime") {
      if (runtimeSeen) throw new InstallArgumentError("--runtime no puede repetirse");
      runtimeSeen = true;
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new InstallArgumentError("--runtime necesita un valor separado");
      }
      if (!isInstallTarget(value)) {
        throw new InstallArgumentError(`valor no soportado: ${value}`);
      }
      runtime = value;
      index += 1;
      continue;
    }

    if (arg === "-r" || arg.startsWith("--runtime=")) {
      throw new InstallArgumentError("usa --runtime seguido de un valor separado");
    }
  }

  return {
    yes: args.includes("--yes") || args.includes("-y"),
    noEngram: args.includes("--no-engram"),
    noSecrets: args.includes("--no-secrets"),
    noLinear: args.includes("--no-linear"),
    noHypa: args.includes("--no-hypa"),
    noCodegraph: args.includes("--no-codegraph"),
    dryRun: args.includes("--dry-run"),
    runtime,
  };
}

async function confirm(message: string, flags: InstallFlags, fallback = true): Promise<boolean> {
  if (flags.yes) return fallback;
  const res = await p.confirm({ message });
  if (p.isCancel(res)) {
    p.cancel("Instalación cancelada.");
    process.exit(1);
  }
  return res;
}

async function maybeSecret(name: SecretName, label: string, flags: InstallFlags): Promise<void> {
  if (flags.noSecrets || flags.yes) return;
  if (hasSecret(name)) {
    p.log.info(`${label}: ya configurado, se mantiene.`);
    return;
  }
  const value = await p.password({ message: `${label} (enter para saltar)` });
  if (p.isCancel(value) || !value) return;
  const written = await writeSecret(name, value);
  if (written) p.log.success(`${label} guardado.`);
}

/** Resolve menu intent first, then direct CLI selection, then the Pi default. */
export function resolveInstallTarget(
  explicitMenuTarget: InstallTarget | undefined,
  parsedRuntime?: InstallTarget,
): InstallTarget {
  return explicitMenuTarget ?? parsedRuntime ?? "pi";
}

/** Return selected runtime paths in their required execution order. */
export function getInstallTargets(target: InstallTarget): RuntimeInstallTarget[] {
  return target === "both" ? ["pi", "claude"] : [target];
}

/**
 * Resolve/install Bun once for an installation, before any selected runner.
 * Pi and Claude both consume this prerequisite; target runners never repeat it.
 */
async function prepareSharedBun(deps: readonly DepStatus[], flags: InstallFlags): Promise<InstallStep> {
  if (deps.find((d) => d.id === "bun")?.present) {
    return { ok: true, detail: "bun ya presente" };
  }

  if (!(await confirm("Instalar bun?", flags))) {
    return { ok: false, detail: "bun es obligatorio." };
  }

  const spinner = p.spinner();
  spinner.start("Instalando bun");
  const result = await installBun();
  spinner.stop(result.detail);
  return result;
}

export async function orchestrateInstall(
  target: InstallTarget,
  options: InstallOrchestratorOptions,
): Promise<InstallResult> {
  const targets = getInstallTargets(target);
  let bun: InstallStep;
  try {
    // Deliberately one call outside the target loop: both must share it.
    bun = await options.prepareBun();
  } catch (error) {
    bun = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  if (!bun.ok) {
    const detail = `Bun no disponible: ${bun.detail}`;
    return {
      target,
      ok: false,
      results: targets.map((runtime) => ({ target: runtime, ok: false, detail })),
    };
  }

  const results: RuntimeInstallResult[] = [];
  for (const runtime of targets) {
    try {
      const result = await options.runners[runtime]();
      // Keep the aggregate contract trustworthy even if an injected runner
      // accidentally labels its result incorrectly.
      results.push(result.target === runtime ? result : { ...result, target: runtime });
    } catch (error) {
      results.push({
        target: runtime,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { target, ok: results.every((result) => result.ok), results };
}

export type PiInstallEffects = {
  resolveContext: () => PiInstallContext;
  migrateContext: () => PiInstallContext;
  exists: typeof existsSync;
  backup: typeof snapshot;
  spinner: typeof p.spinner;
  deploy: typeof deployTemplate;
  packages: typeof installDeclaredPackages;
  marker: typeof writeMarker;
  check: typeof checkDeps;
  doctor: typeof runDoctor;
  launcher: typeof installFishLauncher;
  promote: typeof promoteCommandNames;
};

export type PiInstallOptions = {
  platform: Platform;
  flags: InstallFlags;
  skipLinear: boolean;
  deps: readonly DepStatus[];
  agentDir: string;
  effects?: Partial<PiInstallEffects>;
};

type PiEntryId = Extract<InstallPlanEntryId, `pi.${string}`>;

export function createPiInstallHandlers({ platform, flags, skipLinear, deps, agentDir, effects: overrides = {} }: PiInstallOptions): { handlers: Record<PiEntryId, InstallPlanExecutionHandler>; detail: () => string } {
  const paths = derivePiInstallPaths();
  const effects: PiInstallEffects = { resolveContext: () => resolvePiInstallContext(paths), migrateContext: () => { if (isValidInstallMarker(paths.legacyMarker)) migrateLegacyPi(paths); return resolvePiInstallContext(paths); }, exists: existsSync, backup: snapshot, spinner: p.spinner, deploy: deployTemplate, packages: installDeclaredPackages, marker: writeMarker, check: checkDeps, doctor: runDoctor, launcher: installFishLauncher, promote: promoteCommandNames, ...overrides };
  const success = (): InstallStep => ({ ok: true, detail: "ok" });
  let piContext: PiInstallContext | undefined;
  let rollbackPath: string | null = null;
  let appHint = "usa `pi-ein app`";
  const context = (migrate = false): PiInstallContext => {
    piContext ??= migrate ? effects.migrateContext() : effects.resolveContext();
    if (piContext.agentDir !== agentDir) throw new Error("Pi install path changed after planning");
    return piContext;
  };
  const handlers: Record<PiEntryId, InstallPlanExecutionHandler> = {
  "pi.dependency.pi": async () => {
  const needPi = !deps.find((d) => d.id === "pi")?.present;

  if (needPi) {
    if (await confirm("Instalar pi (@earendil-works/pi-coding-agent)?", flags)) {
      const spinner = p.spinner();
      spinner.start("Instalando pi");
      const result = await installPi();
      spinner.stop(result.detail);
      if (!result.ok) return { ok: false, detail: "pi es obligatorio." };
    } else {
      return { ok: false, detail: "pi es obligatorio." };
    }
  }
  return success();
  },
  "pi.dependency.engram": async () => {
  const needEngram = !deps.find((d) => d.id === "engram")?.present;

  if (needEngram && !flags.noEngram) {
    if (await confirm("Instalar engram (memoria persistente)?", flags)) {
      const spinner = p.spinner();
      spinner.start("Instalando engram");
      const result = await installEngramDep(platform);
      spinner.stop(result.detail);
    }
  }
  return success();
  },
  "pi.dependency.gh": async () => {
  const needGh = !deps.find((d) => d.id === "gh")?.present;

  if (needGh && !flags.yes) {
    if (await confirm("Instalar gh (GitHub CLI)?", flags, false)) {
      const spinner = p.spinner();
      spinner.start("Instalando gh");
      const result = await installGh(platform);
      spinner.stop(result.detail);
    }
  }
  return success();
  },
  "pi.dependency.hypa": async () => {
  const needHypa = !deps.find((d) => d.id === "hypa")?.present;

  if (needHypa && !flags.noHypa && !flags.yes) {
    if (await confirm("Instalar hypa (compresión de salida)?", flags, false)) {
      const spinner = p.spinner();
      spinner.start("Instalando hypa");
      const result = await installHypa();
      spinner.stop(result.detail);
    }
  }
  return success();
  },
  "pi.dependency.codegraph": async () => {
  const needCodegraph = !deps.find((d) => d.id === "codegraph")?.present;

  if (needCodegraph && !flags.noCodegraph && !flags.yes) {
    if (await confirm("Instalar codegraph (grafo de código, exploración barata)?", flags, false)) {
      const spinner = p.spinner();
      spinner.start("Instalando codegraph");
      const result = await installCodegraph();
      spinner.stop(result.detail);
      if (result.ok) p.log.info("Actívalo por proyecto con `codegraph init` en la raíz del repo.");
    }
  }
  return success();
  },
  "pi.migrate-legacy": () => {
  try {
    context(true);
    return success();
  } catch (error) {
    return { ok: false, detail: `La migración de Pi falló; no se desplegará Ein: ${error instanceof Error ? error.message : String(error)}` };
  }
  },
  "pi.backup-current": async () => {
  const piContext = context();
  // BLINDAJE -> En reparacion/reinstall sobre arbol existente, snapshot
  // previo: el deploy borra los dirs del template antes de extraer, asi
  // que un fallo a mitad dejaria el arbol roto sin vuelta atras.
  if (effects.exists(piContext.agentDir)) {
    p.log.step("Backup previo del estado actual");
    let terminal = "Fallo el backup previo";
    try {
      const snap = await effects.backup("pre-install", { agentDir: piContext.agentDir, backupDir: piContext.backupDir });
      if ("ok" in snap && snap.ok === false) { p.log.error(terminal); return { ok: false }; }
      rollbackPath = snap.path;
      terminal = snap.path ? `Backup: ${snap.path}${snap.deduped ? " (sin cambios, reutilizado)" : ""}` : "Sin backup (nada que copiar)";
      p.log.info(terminal);
    } catch { p.log.error(terminal); return { ok: false }; }
  }
  return success();
  },
  "pi.deploy-template": async () => {
  const piContext = context();
  const spinner = p.spinner();
  spinner.start("Desplegando Ein en ~/.pi/agent");
  const deployOpts: DeployOptions = { skipLinear };
  try {
    const deployed = await effects.deploy(platform, deployOpts, piContext);
    spinner.stop(
      `Ein desplegado (engram: ${deployed.engramFound ? deployed.engramCommand : "no resuelto, usando PATH"})`,
    );
  } catch (error) {
    spinner.stop("Fallo el deploy.");
    p.log.error(error instanceof Error ? error.message : String(error));
    if (rollbackPath) {
      const rollbackSpinner = p.spinner();
      rollbackSpinner.start("Restaurando el backup previo (rollback automático)");
      try {
        await restoreBackup(rollbackPath, {
          agentDir: piContext.agentDir,
          backupDir: piContext.backupDir,
        });
        rollbackSpinner.stop("Estado anterior restaurado.");
      } catch (rollbackError) {
        rollbackSpinner.stop("Fallo el rollback.");
        p.log.error(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
        p.log.warn(`Restaura a mano con \`ein restore\` (backup: ${rollbackPath}).`);
      }
    }
    return { ok: false, detail: "El deploy falló; no se ha dejado el árbol a medias." };
  }
  return success();
  },
  "pi.configure-packages": async () => {
  const packagesSpinner = p.spinner();
  packagesSpinner.start("Instalando paquetes de Pi declarados");
  const packages = await effects.packages(context());
  packagesSpinner.stop(packages.detail);
  return success();
  },
  "pi.configure-secrets": async () => {
  if (!flags.noSecrets && !flags.yes) {
    p.log.step("Configuración de secrets (todo opcional)");
    await maybeSecret("context7", "Context7 API key", flags);
    if (!skipLinear) await maybeSecret("linear", "Linear API key", flags);
    await maybeSecret("minimax", "MiniMax API key", flags);
  }
  return success();
  },
  "pi.configure-context7-export": () => {
  if (!flags.noSecrets) {
    const exportResult = ensureContext7Export(platform);
    if (exportResult.changed) {
      p.log.success(`Export CONTEXT7_API_KEY anadido a ${exportResult.rc} (reinicia el shell).`);
    }
  }
  return success();
  },
  "pi.write-install-marker": () => {
  effects.marker("stable", context());
  return success();
  },
  "pi.verify-doctor": () => {
  const piContext = context();
  effects.check(platform);
  const report = effects.doctor(platform, piContext);
  p.log.message(renderReport(report));

  return report.result === "FAIL" ? { ok: false, detail: "Instalación con errores. Revisa los FAIL del doctor." } : success();
  },
  "pi.deploy-launcher": () => {
  try {
    const launcher = effects.launcher({
      home: context().home,
      name: "pi-ein.fish",
      content: piEinFish,
    });
    p.log.success(`${launcher.changed ? "Launcher" : "Launcher ya actualizado"}: ${launcher.path}`);
    return success();
  } catch (error) {
    return { ok: false, detail: `No se pudo instalar el launcher pi-ein: ${error instanceof Error ? error.message : String(error)}` };
  }
  },
  "pi.promote-commands": () => {
  // Both user-facing names, so a fresh install lands in the same layout an
  // update migrates to: `ein` is the app, `ein-install` is this binary.
  try {
    const selfPath = process.execPath;
    const promoted = effects.promote({
      binDir: context().localBinDir,
      selfPath,
      appArtifact: join(context().agentDir, "bin", "ein"),
    });
    if (promoted.app.written) appHint = "ejecuta `ein`";
    // La razón viaja al mensaje: descartarla fue lo que hizo indiagnosticable
    // un `app-artifact-missing` en la primera instalación real.
    p.log.success(
      promoted.app.written
        ? `Comandos: \`${INSTALLER_COMMAND}\` (instalador), \`ein\` (app)`
        : `Comandos: \`${INSTALLER_COMMAND}\` (instalador); app no desplegada: ${promoted.app.reason ?? "desconocido"}`,
    );
    if (!promoted.app.written) return { ok: false, detail: promoted.app.reason ?? "app artifact promotion failed" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    p.log.warn(`No se pudieron promover los comandos: ${detail}`);
    return { ok: false, detail };
  }
  return success();
  },
  };
  return { handlers, detail: () => `Ein listo. Para la aplicación, ${appHint}; para el agente, \`pi-ein\`.` };
}

export type ClaudeInstallOptions = {
  /** Active home used by the sync child and the EIN-owned launcher. */
  home?: string;
  /** Resolved Bun executable; the normal PATH name remains the fallback. */
  bunPath?: string;
  /** Injectable seams keep the runner deterministic in focused tests. */
  stagePayload?: () => Promise<CcEinPayloadStage>;
  execute?: typeof run;
  installLauncher?: typeof installFishLauncher;
};

/**
 * Run the staged Claude sync and install its launcher only after the child
 * reports success. The staged root is never used as a source fallback: the
 * child is invoked with that root as cwd and the stage is removed in finally.
 */
type ClaudeEntryId = Extract<InstallPlanEntryId, `claude.${string}`>;

function createClaudeInstallHandlers(options: ClaudeInstallOptions = {}): { handlers: Record<ClaudeEntryId, InstallPlanExecutionHandler> } {
  const home = options.home ?? activeHome();
  const stagePayload = options.stagePayload ?? (() => stageCcEinPayload());
  const execute = options.execute ?? run;
  const installLauncher = options.installLauncher ?? installFishLauncher;
  let staged: CcEinPayloadStage | undefined;
  const cleanup = (): void => { staged?.cleanup(); staged = undefined; };
  const handlers: Record<ClaudeEntryId, InstallPlanExecutionHandler> = {
    "claude.deploy-runtime": async () => { try { staged = await stagePayload(); const sync = await execute(options.bunPath ?? "bun", ["cc-ein/sync.ts"], { cwd: staged.root, env: { HOME: home, CC_EIN_HOME: join(home, ".claude-ein") }, extraPath: [join(home, ".bun", "bin")] }); if (!sync.ok) { const reason = [sync.stdout, sync.stderr].map((stream) => stream.trim()).filter(Boolean).join("\n") || `codigo ${sync.code}`; cleanup(); return { ok: false, detail: `La sincronizacion de Claude fallo: ${reason}` }; } const root = join(home, ".claude-ein"); mkdirSync(root, { recursive: true }); writeFileSync(join(root, ".ein-install.json"), `${JSON.stringify({ version: INSTALLER_VERSION, installedAt: new Date().toISOString(), channel: "stable" }, null, 2)}\n`); return { ok: true }; } catch (error) { cleanup(); return { ok: false, detail: error instanceof Error ? error.message : String(error) }; } },
    "claude.deploy-launcher": () => { try { const launcher = installLauncher({ home, name: "cc-ein.fish", content: ccEinFish }); p.log.success(`${launcher.changed ? "Launcher" : "Launcher ya actualizado"}: ${launcher.path}`); return { ok: true }; } catch (error) { return { ok: false, detail: error instanceof Error ? error.message : String(error) }; } finally { cleanup(); } },
  }; return { handlers };
}

export async function runClaudeInstall(options: ClaudeInstallOptions = {}): Promise<RuntimeInstallResult> {
  const handlers = createClaudeInstallHandlers(options);
  for (const id of ["claude.deploy-runtime", "claude.deploy-launcher"] as const) {
    const result = await handlers.handlers[id]();
    if (!result.ok) return { target: "claude", ok: false, detail: result.detail ?? "Claude installation failed" };
  }
  return { target: "claude", ok: true, detail: "Claude Code listo. Ejecuta `cc-ein` para empezar." };
}

function runtimeLabel(target: RuntimeInstallTarget): string {
  return target === "pi" ? "Pi" : "Claude Code";
}

function observePlan(platform: Platform, deps: readonly DepStatus[]): Omit<InstallPlanInput, "target" | "flags" | "platform"> & { platform: Platform } {
  const home = activeHome();
  const paths = derivePiInstallPaths(home);
  const isolated = isValidInstallMarker(paths.isolatedMarker);
  const legacy = isValidInstallMarker(paths.legacyMarker);
  const isolatedExists = existsSync(paths.isolatedAgentDir);
  let piOwnership: PiOwnershipEvidence = { status: "absent" };
  if (legacy && isolatedExists) piOwnership = { status: "ambiguous", reason: "legacy-destination-conflict" };
  else if (isolated) piOwnership = { status: "managed", layout: "isolated" };
  else if (legacy) piOwnership = { status: "managed", layout: "legacy" };
  else if (isolatedExists) piOwnership = { status: "ambiguous", reason: "unmarked-existing-target" };
  const context = resolvePiInstallContext(paths);
  const piAgentDir = legacy ? paths.isolatedAgentDir : context.agentDir;
  const present = (id: string): boolean => deps.find((dependency) => dependency.id === id)?.present ?? false;
  return {
    home,
    piAgentDir,
    piAgentDirExists: legacy ? existsSync(paths.legacyAgentDir) || isolatedExists : existsSync(piAgentDir),
    piOwnership,
    claudeConfigHome: join(home, ".claude-ein"),
    platform,
    dependencies: { bun: present("bun"), pi: present("pi"), engram: present("engram"), gh: present("gh"), hypa: present("hypa"), codegraph: present("codegraph") },
  };
}

export async function runInstall(args: string[], explicitMenuTarget?: InstallTarget, options: InstallCommandOptions = {}): Promise<number> {
  let flags: InstallFlags;
  try {
    flags = parseInstallFlags(args);
  } catch (error) {
    console.error(error instanceof InstallArgumentError ? error.message : String(error));
    return 1;
  }
  const target = resolveInstallTarget(explicitMenuTarget, flags.runtime);

  const platform: Platform = options.observations?.platform ?? detectPlatform();
  if (!flags.dryRun) {
    // El diario existe para detectar una transacción INTERRUMPIDA. Un diario
    // completo describe una instalación anterior terminada y no condiciona a la
    // siguiente: cuando lo hacía, `install` se negaba a repetirse y no quedaba
    // ninguna vía soportada para desplegar un binario recién construido.
    const home = options.observations?.home ?? activeHome(), status = inspectInstallJournal(home);
    if (status.status === "invalid" || status.status === "valid" && status.journal.state !== "complete") { console.error("Install recovery status: recovery-required"); return 1; }
  }

  const deps: DepStatus[] = options.observations
    ? (Object.keys(options.observations.dependencies) as InstallDependencyId[]).map((id) => ({ id, present: options.observations!.dependencies[id], path: null, required: id === "bun" || id === "pi", hint: "injected observation" }))
    : checkDeps(platform);
  const observations = options.observations ?? observePlan(platform, deps);
  const buildPlan = (skipLinear: boolean): InstallPlanV1 => createInstallPlan({ ...observations, platform: { os: observations.platform.os, arch: observations.platform.arch }, target, flags: { yes: flags.yes, noEngram: flags.noEngram, noSecrets: flags.noSecrets, noHypa: flags.noHypa, noCodegraph: flags.noCodegraph, skipLinear } });
  let skipLinear = true;
  let plan: InstallPlanV1;
  // Ownership admission precedes the only interactive input needed to finish a ready plan.
  if (target !== "claude" && observations.piOwnership.status === "ambiguous") {
    plan = buildPlan(skipLinear);
  } else {
    if (target !== "claude" && !flags.noLinear && !flags.yes && !flags.dryRun) {
      const teamMode = await p.confirm({ message: "¿Activar modo Team (Linear como board de issues)? Por defecto: Solo (OpenSpec + git, sin Linear).", initialValue: false });
      if (p.isCancel(teamMode)) { p.cancel("Instalación cancelada."); process.exit(1); }
      skipLinear = !teamMode;
    }
    plan = buildPlan(skipLinear);
  }
  await (options.playBanner ?? playBanner)(); p.intro(bold(gold("Instalador Ein")));
  // Misma ventana que el doctor, el banner y la app: una sola gramatica.
  p.log.message(frameBlock("instalar ein", describePlatform(platform), [
    frameBlank(),
    frameTab("dependencias"),
    ...deps.map((d) => frameField(d.id, d.present ? "presente" : "falta", levelMark(d.present ? "OK" : "FAIL"))),
    frameBlank(),
  ]));
  if (plan.status === "blocked") {
    (options.writePlan ?? ((value) => p.log.message(renderInstallPlan(value))))(plan);
    p.outro(flags.dryRun ? "Dry-run blocked. Resolve the reported blocker before installation." : "Instalación bloqueada. Resuelve el conflicto de ownership antes de continuar.");
    return 1;
  }
  if (target !== "claude") p.log.info(skipLinear ? "Modo Solo: OpenSpec + git, sin Linear. Actívalo cuando quieras con `/ein:mode team`." : "Modo Team: Linear como board de issues.");

  if (flags.dryRun) {
    (options.writePlan ?? ((value) => p.log.message(renderInstallPlan(value))))(plan);
    p.outro("Dry-run completado. Ejecuta `ein install` para aplicar.");
    return 0;
  }

  const pi = createPiInstallHandlers({ platform, flags, skipLinear, deps, agentDir: observations.piAgentDir });
  const claude = createClaudeInstallHandlers({ home: observations.home, bunPath: deps.find((dependency) => dependency.id === "bun")?.path ?? undefined });
  const available: InstallPlanExecutionHandlers = {
    "shared.dependency.bun": async () => { const result = await prepareSharedBun(deps, flags); return result.ok ? result : { ok: false, detail: `Bun no disponible: ${result.detail}` }; },
    ...pi.handlers,
    ...claude.handlers,
  };
  const handlers = options.handlers ?? Object.fromEntries(plan.inventory.map((entry) => [entry.id, available[entry.id]])) as InstallPlanExecutionHandlers;
  let execution;
  try { execution = await executeInstallPlanJournaled(plan, handlers); }
  catch (error) { console.error(error instanceof InstallJournalError ? error.message : "Install recovery status: journal-write-failed"); return 1; }
  const runtimes = [...new Set(plan.inventory.map((entry) => entry.runtime).filter((runtime): runtime is RuntimeInstallTarget => runtime !== "shared"))];
  const results: RuntimeInstallResult[] = runtimes.map((runtime) => {
    const failure = runtimeFailure(execution, runtime);
    return { target: runtime, ok: failure === undefined, detail: failure ?? (runtime === "pi" ? pi.detail() : "Claude Code listo. Ejecuta `cc-ein` para empezar.") };
  });
  const result: InstallResult = { target, ok: execution.ok, results };

  if (target === "both") {
    for (const runtimeResult of result.results) {
      p.log[runtimeResult.ok ? "success" : "error"](
        `${runtimeLabel(runtimeResult.target)}: ${runtimeResult.detail}`,
      );
    }
  }

  if (!result.ok) {
    p.outro("Instalación incompleta.");
    return 1;
  }

  if (target === "pi") {
    p.outro(result.results[0]?.detail ?? "Ein listo.");
  } else {
    p.outro("Ein listo en los runtimes seleccionados.");
  }
  return 0;
}
