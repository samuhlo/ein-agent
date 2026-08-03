// =============================================================================
// CLI: install
// Full flow: detect → check deps → install missing → deploy template →
// secrets wizard → context7 export → marker → doctor.
// =============================================================================

import * as p from "@clack/prompts";
import { describePlatform, detectPlatform, type Platform } from "../core/platform.ts";
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
import type { DeployOptions } from "../core/deploy.ts";
import { restoreBackup, snapshot } from "../core/backup.ts";
import { existsSync } from "node:fs";
import {
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
import { writeMarker } from "../core/version.ts";
import { playBanner } from "../tui/banner.ts";
import { bold, gold } from "../tui/theme.ts";

export type InstallFlags = {
  yes: boolean;
  noEngram: boolean;
  noSecrets: boolean;
  noLinear: boolean;
  noHypa: boolean;
  noCodegraph: boolean;
  dryRun: boolean;
};

/** The one target selected by the menu or the direct installer default. */
export type InstallTarget = "pi" | "claude" | "both";
export type RuntimeInstallTarget = Exclude<InstallTarget, "both">;

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

export function parseInstallFlags(args: string[]): InstallFlags {
  return {
    yes: args.includes("--yes") || args.includes("-y"),
    noEngram: args.includes("--no-engram"),
    noSecrets: args.includes("--no-secrets"),
    noLinear: args.includes("--no-linear"),
    noHypa: args.includes("--no-hypa"),
    noCodegraph: args.includes("--no-codegraph"),
    dryRun: args.includes("--dry-run"),
  };
}

async function confirm(message: string, flags: InstallFlags, fallback = true): Promise<boolean> {
  if (flags.yes) return fallback;
  const res = await p.confirm({ message });
  if (p.isCancel(res)) {
    p.cancel("Instalacion cancelada.");
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

/** Return selected runtime paths in their required execution order. */
export function getInstallTargets(target: InstallTarget): RuntimeInstallTarget[] {
  return target === "both" ? ["pi", "claude"] : [target];
}

/**
 * Resolve/install Bun once for an installation, before any selected runner.
 * Pi and Claude both consume this prerequisite; target runners never repeat it.
 */
export async function prepareSharedBun(deps: readonly DepStatus[], flags: InstallFlags): Promise<InstallStep> {
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

/**
 * Run selected targets exactly once and retain each result independently.
 * A failed target is not a transaction-wide abort: later targets still run.
 */
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

type PiInstallOptions = {
  platform: Platform;
  flags: InstallFlags;
  skipLinear: boolean;
  deps: readonly DepStatus[];
};

async function runPiInstall({ platform, flags, skipLinear, deps }: PiInstallOptions): Promise<RuntimeInstallResult> {
  const failure = (detail: string): RuntimeInstallResult => ({ target: "pi", ok: false, detail });
  const needPi = !deps.find((d) => d.id === "pi")?.present;

  if (needPi) {
    if (await confirm("Instalar pi (@earendil-works/pi-coding-agent)?", flags)) {
      const spinner = p.spinner();
      spinner.start("Instalando pi");
      const result = await installPi();
      spinner.stop(result.detail);
      if (!result.ok) return failure("pi es obligatorio.");
    } else {
      return failure("pi es obligatorio.");
    }
  }

  const needEngram = !deps.find((d) => d.id === "engram")?.present;
  if (needEngram && !flags.noEngram) {
    if (await confirm("Instalar engram (memoria persistente)?", flags)) {
      const spinner = p.spinner();
      spinner.start("Instalando engram");
      const result = await installEngramDep(platform);
      spinner.stop(result.detail);
    }
  }

  const needGh = !deps.find((d) => d.id === "gh")?.present;
  if (needGh && !flags.yes) {
    if (await confirm("Instalar gh (GitHub CLI)?", flags, false)) {
      const spinner = p.spinner();
      spinner.start("Instalando gh");
      const result = await installGh(platform);
      spinner.stop(result.detail);
    }
  }

  const needHypa = !deps.find((d) => d.id === "hypa")?.present;
  if (needHypa && !flags.noHypa && !flags.yes) {
    if (await confirm("Instalar hypa (compresión de salida)?", flags, false)) {
      const spinner = p.spinner();
      spinner.start("Instalando hypa");
      const result = await installHypa();
      spinner.stop(result.detail);
    }
  }

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

  // Migration gating must happen before final target resolution. In particular,
  // do not let a module-import AGENT_DIR point deployment back at legacy after a
  // successful move.
  let piContext: PiInstallContext;
  try {
    const piPaths = derivePiInstallPaths();
    if (isValidInstallMarker(piPaths.legacyMarker)) migrateLegacyPi(piPaths);
    piContext = resolvePiInstallContext(piPaths);
  } catch (error) {
    return failure(
      `La migracion de Pi fallo; no se desplegara Ein: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // BLINDAJE -> En reparacion/reinstall sobre arbol existente, snapshot
  // previo: el deploy borra los dirs del template antes de extraer, asi
  // que un fallo a mitad dejaria el arbol roto sin vuelta atras.
  let rollbackPath: string | null = null;
  if (existsSync(piContext.agentDir)) {
    const spinner = p.spinner();
    spinner.start("Backup previo del estado actual");
    const snap = await snapshot("pre-install", {
      agentDir: piContext.agentDir,
      backupDir: piContext.backupDir,
    });
    rollbackPath = snap.path;
    spinner.stop(
      snap.path
        ? `Backup: ${snap.path}${snap.deduped ? " (sin cambios, reutilizado)" : ""}`
        : "Sin backup (nada que copiar)",
    );
  }

  const spinner = p.spinner();
  spinner.start("Desplegando Ein en ~/.pi/agent");
  const deployOpts: DeployOptions = { skipLinear };
  let deployed;
  try {
    const { deployTemplate } = await import("../core/deploy.ts");
    deployed = await deployTemplate(platform, deployOpts, piContext);
  } catch (error) {
    spinner.stop("Fallo el deploy.");
    p.log.error(error instanceof Error ? error.message : String(error));
    if (rollbackPath) {
      const rollbackSpinner = p.spinner();
      rollbackSpinner.start("Restaurando el backup previo (rollback automatico)");
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
    return failure("El deploy fallo; no se ha dejado el arbol a medias.");
  }
  spinner.stop(
    `Ein desplegado (engram: ${deployed.engramFound ? deployed.engramCommand : "no resuelto, usando PATH"})`,
  );

  const packagesSpinner = p.spinner();
  packagesSpinner.start("Instalando paquetes de Pi declarados");
  const packages = await installDeclaredPackages(piContext);
  packagesSpinner.stop(packages.detail);

  if (!flags.noSecrets && !flags.yes) {
    p.log.step("Configuracion de secrets (todo opcional)");
    await maybeSecret("context7", "Context7 API key", flags);
    if (!skipLinear) await maybeSecret("linear", "Linear API key", flags);
    await maybeSecret("minimax", "MiniMax API key", flags);
  }

  if (!flags.noSecrets) {
    const exportResult = ensureContext7Export(platform);
    if (exportResult.changed) {
      p.log.success(`Export CONTEXT7_API_KEY anadido a ${exportResult.rc} (reinicia el shell).`);
    }
  }

  writeMarker("stable", piContext);
  checkDeps(platform);
  const [{ runDoctor }, { renderReport }] = await Promise.all([
    import("../core/verify.ts"),
    import("./doctor.ts"),
  ]);
  const report = runDoctor(platform, piContext);
  p.log.message(renderReport(report));

  if (report.result === "FAIL") {
    return failure("Instalacion con errores. Revisa los FAIL del doctor.");
  }

  return { target: "pi", ok: true, detail: "Ein listo. Ejecuta `pi` para empezar (reinicia el shell si pi no esta en PATH)." };
}

/**
 * Claude payload/sync support is supplied by the later runtime slice. Keep B's
 * target contract callable without importing that future implementation.
 */
export async function runClaudeInstall(): Promise<RuntimeInstallResult> {
  return {
    target: "claude",
    ok: false,
    detail: "Claude Code no disponible: el payload y la sincronizacion se habilitan en una slice posterior.",
  };
}

function runtimeLabel(target: RuntimeInstallTarget): string {
  return target === "pi" ? "Pi" : "Claude Code";
}

export async function runInstall(args: string[], target: InstallTarget = "pi"): Promise<number> {
  const flags = parseInstallFlags(args);
  const platform: Platform = detectPlatform();

  await playBanner();
  p.intro(bold(gold("Instalador Ein")));
  p.log.info(`Plataforma: ${describePlatform(platform)}`);

  // Modo Solo por defecto (OpenSpec + git + EIN.md, sin Linear); Team (Linear
  // como board) es opt-in. La eleccion persiste como default global;
  // ein-linear queda instalado en ambos casos y se alterna con `/ein:mode`.
  let skipLinear = true;
  if (target !== "claude") {
    if (!flags.noLinear && !flags.yes && !flags.dryRun) {
      const teamMode = await p.confirm({
        message: "¿Activar modo Team (Linear como board de issues)? Por defecto: Solo (OpenSpec + git, sin Linear).",
        initialValue: false,
      });
      if (p.isCancel(teamMode)) { p.cancel("Instalacion cancelada."); process.exit(1); }
      skipLinear = !teamMode;
    }
    p.log.info(
      skipLinear
        ? "Modo Solo: OpenSpec + git, sin Linear. Actívalo cuando quieras con `/ein:mode team`."
        : "Modo Team: Linear como board de issues.",
    );
  }

  const deps = checkDeps(platform);
  const depLines = deps.map(
    (d) => `  ${d.present ? "✓" : "✗"} ${d.id.padEnd(8)} ${d.present ? (d.path ?? "") : `(falta) ${d.hint}`}`,
  );
  p.log.message(["Dependencias:", ...depLines].join("\n"));

  // Dry-run: show the full plan (deps to install, deploy target, template
  // contents, remaining steps) and exit without touching anything.
  if (flags.dryRun) {
    const { readBundledManifest } = await import("../core/deploy.ts");
    const manifest = await readBundledManifest();
    const dryRunContext = resolvePiInstallContext();
    const missing = deps.filter((d) => !d.present).map((d) => d.id);
    const lines = [
      "Plan (dry-run, no se ejecuta nada):",
      `  1. Dependencias a instalar: ${missing.length ? missing.join(", ") : "ninguna (todo presente)"}`,
      existsSync(dryRunContext.agentDir)
        ? `  2. Backup previo de ${dryRunContext.agentDir} (tar.gz, dedup, conserva 5)`
        : "  2. Sin backup previo (instalacion nueva)",
      `  3. Deploy del template en ${dryRunContext.agentDir}`,
      manifest
        ? `     template v${manifest.templateVersion}: ${manifest.agents?.length ?? 0} agentes, ${manifest.chains?.length ?? 0} chains, ${manifest.extensions?.length ?? 0} extensiones`
        : "     (template sin manifest: binario antiguo)",
      "  4. Instalacion de paquetes Pi declarados en settings.json",
      flags.noSecrets ? "  5. Secrets: omitidos (--no-secrets)" : "  5. Wizard de secrets (opcional)",
      "  6. Doctor de verificacion",
    ];
    p.log.message(lines.join("\n"));
    p.outro("Dry-run completado. Ejecuta `ein install` para aplicar.");
    return 0;
  }

  const result = await orchestrateInstall(target, {
    prepareBun: () => prepareSharedBun(deps, flags),
    runners: {
      pi: () => runPiInstall({ platform, flags, skipLinear, deps }),
      claude: () => runClaudeInstall(),
    },
  });

  if (target === "both") {
    for (const runtimeResult of result.results) {
      p.log[runtimeResult.ok ? "success" : "error"](
        `${runtimeLabel(runtimeResult.target)}: ${runtimeResult.detail}`,
      );
    }
  }

  if (!result.ok) {
    p.outro("Instalacion incompleta.");
    return 1;
  }

  if (target === "pi") {
    p.outro(result.results[0]?.detail ?? "Ein listo.");
  } else {
    p.outro("Ein listo en los runtimes seleccionados.");
  }
  return 0;
}
