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
  installHypa,
  installPi,
} from "../core/deps.ts";
import { deployTemplate, readBundledManifest, type DeployOptions } from "../core/deploy.ts";
import { restoreBackup, snapshot } from "../core/backup.ts";
import { existsSync } from "node:fs";
import { AGENT_DIR } from "../core/paths.ts";
import {
  ensureContext7Export,
  hasSecret,
  writeSecret,
  type SecretName,
} from "../core/secrets.ts";
import { writeMarker } from "../core/version.ts";
import { runDoctor } from "../core/verify.ts";
import { renderReport } from "./doctor.ts";
import { playBanner } from "../tui/banner.ts";
import { bold, gold } from "../tui/theme.ts";

export type InstallFlags = {
  yes: boolean;
  noEngram: boolean;
  noSecrets: boolean;
  noLinear: boolean;
  noHypa: boolean;
  dryRun: boolean;
};

export function parseInstallFlags(args: string[]): InstallFlags {
  return {
    yes: args.includes("--yes") || args.includes("-y"),
    noEngram: args.includes("--no-engram"),
    noSecrets: args.includes("--no-secrets"),
    noLinear: args.includes("--no-linear"),
    noHypa: args.includes("--no-hypa"),
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

export async function runInstall(args: string[]): Promise<number> {
  const flags = parseInstallFlags(args);
  const platform: Platform = detectPlatform();

  await playBanner();
  p.intro(bold(gold("Instalador Ein")));
  p.log.info(`Plataforma: ${describePlatform(platform)}`);

  // Modo Solo por defecto (OpenSpec + git + EIN.md, sin Linear); Team (Linear
  // como board) es opt-in. La eleccion persiste como default global;
  // ein-linear queda instalado en ambos casos y se alterna con `/ein:mode`.
  let skipLinear = true;
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

  let deps = checkDeps(platform);
  const depLines = deps.map(
    (d) => `  ${d.present ? "✓" : "✗"} ${d.id.padEnd(8)} ${d.present ? (d.path ?? "") : `(falta) ${d.hint}`}`,
  );
  p.log.message(["Dependencias:", ...depLines].join("\n"));

  // Dry-run: show the full plan (deps to install, deploy target, template
  // contents, remaining steps) and exit without touching anything.
  if (flags.dryRun) {
    const manifest = await readBundledManifest();
    const missing = deps.filter((d) => !d.present).map((d) => d.id);
    const lines = [
      "Plan (dry-run, no se ejecuta nada):",
      `  1. Dependencias a instalar: ${missing.length ? missing.join(", ") : "ninguna (todo presente)"}`,
      existsSync(AGENT_DIR)
        ? `  2. Backup previo de ${AGENT_DIR} (tar.gz, dedup, conserva 5)`
        : "  2. Sin backup previo (instalacion nueva)",
      `  3. Deploy del template en ${AGENT_DIR}`,
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

  const needBun = !deps.find((d) => d.id === "bun")?.present;
  const needPi = !deps.find((d) => d.id === "pi")?.present;

  if (needBun) {
    if (await confirm("Instalar bun?", flags)) {
      const s = p.spinner();
      s.start("Instalando bun");
      const r = await installBun();
      s.stop(r.detail);
      if (!r.ok) return fail("bun es obligatorio.");
    } else {
      return fail("bun es obligatorio.");
    }
  }

  if (needPi) {
    if (await confirm("Instalar pi (@earendil-works/pi-coding-agent)?", flags)) {
      const s = p.spinner();
      s.start("Instalando pi");
      const r = await installPi();
      s.stop(r.detail);
      if (!r.ok) return fail("pi es obligatorio.");
    } else {
      return fail("pi es obligatorio.");
    }
  }

  const needEngram = !deps.find((d) => d.id === "engram")?.present;
  if (needEngram && !flags.noEngram) {
    if (await confirm("Instalar engram (memoria persistente)?", flags)) {
      const s = p.spinner();
      s.start("Instalando engram");
      const r = await installEngramDep(platform);
      s.stop(r.detail);
    }
  }

  const needGh = !deps.find((d) => d.id === "gh")?.present;
  if (needGh && !flags.yes) {
    if (await confirm("Instalar gh (GitHub CLI)?", flags, false)) {
      const s = p.spinner();
      s.start("Instalando gh");
      const r = await installGh(platform);
      s.stop(r.detail);
    }
  }

  const needHypa = !deps.find((d) => d.id === "hypa")?.present;
  if (needHypa && !flags.noHypa && !flags.yes) {
    if (await confirm("Instalar hypa (compresión de salida)?", flags, false)) {
      const s = p.spinner();
      s.start("Instalando hypa");
      const r = await installHypa();
      s.stop(r.detail);
    }
  }

  // BLINDAJE -> En reparacion/reinstall sobre arbol existente, snapshot
  // previo: el deploy borra los dirs del template antes de extraer, asi
  // que un fallo a mitad dejaria el arbol roto sin vuelta atras.
  let rollbackPath: string | null = null;
  if (existsSync(AGENT_DIR)) {
    const sSnap = p.spinner();
    sSnap.start("Backup previo del estado actual");
    const snap = await snapshot("pre-install");
    rollbackPath = snap.path;
    sSnap.stop(
      snap.path
        ? `Backup: ${snap.path}${snap.deduped ? " (sin cambios, reutilizado)" : ""}`
        : "Sin backup (nada que copiar)",
    );
  }

  const s = p.spinner();
  s.start("Desplegando Ein en ~/.pi/agent");
  const deployOpts: DeployOptions = { skipLinear };
  let deployed;
  try {
    deployed = await deployTemplate(platform, deployOpts);
  } catch (error) {
    s.stop("Fallo el deploy.");
    p.log.error(error instanceof Error ? error.message : String(error));
    if (rollbackPath) {
      const sRb = p.spinner();
      sRb.start("Restaurando el backup previo (rollback automatico)");
      try {
        await restoreBackup(rollbackPath);
        sRb.stop("Estado anterior restaurado.");
      } catch (rbError) {
        sRb.stop("Fallo el rollback.");
        p.log.error(rbError instanceof Error ? rbError.message : String(rbError));
        p.log.warn(`Restaura a mano con \`ein restore\` (backup: ${rollbackPath}).`);
      }
    }
    return fail("El deploy fallo; no se ha dejado el arbol a medias.");
  }
  s.stop(
    `Ein desplegado (engram: ${deployed.engramFound ? deployed.engramCommand : "no resuelto, usando PATH"})`,
  );

  const sPkgs = p.spinner();
  sPkgs.start("Instalando paquetes de Pi declarados");
  const pkgs = await installDeclaredPackages();
  sPkgs.stop(pkgs.detail);

  if (!flags.noSecrets && !flags.yes) {
    p.log.step("Configuracion de secrets (todo opcional)");
    await maybeSecret("context7", "Context7 API key", flags);
    if (!skipLinear) await maybeSecret("linear", "Linear API key", flags);
    await maybeSecret("minimax", "MiniMax API key", flags);
  }

  if (!flags.noSecrets) {
    const exp = ensureContext7Export(platform);
    if (exp.changed) p.log.success(`Export CONTEXT7_API_KEY anadido a ${exp.rc} (reinicia el shell).`);
  }

  writeMarker();

  deps = checkDeps(platform);
  const report = runDoctor(platform);
  p.log.message(renderReport(report));

  if (report.result === "FAIL") {
    p.outro("Instalacion con errores. Revisa los FAIL del doctor.");
    return 1;
  }
  p.outro("Ein listo. Ejecuta `pi` para empezar (reinicia el shell si pi no esta en PATH).");
  return 0;
}

function fail(message: string): number {
  p.log.error(message);
  p.outro("Instalacion incompleta.");
  return 1;
}
