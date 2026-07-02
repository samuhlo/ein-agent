// =============================================================================
// CLI: update
// Backup → redeploy bundled template (preserves user state) → update pi →
// re-template → doctor. Notes if a newer installer binary is available.
// =============================================================================

import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { detectPlatform } from "../core/platform.ts";
import { restoreBackup, snapshot } from "../core/backup.ts";
import { deployTemplate, readBundledManifest } from "../core/deploy.ts";
import { installDeclaredPackages, installPi } from "../core/deps.ts";
import { runDoctor } from "../core/verify.ts";
import { readMarker, writeMarker, latestInstallerTag, INSTALLER_VERSION } from "../core/version.ts";
import { renderReport } from "./doctor.ts";
import { AGENT_DIR } from "../core/paths.ts";
import { bold, gold } from "../tui/theme.ts";

export async function runUpdate(args: string[]): Promise<number> {
  const yes = args.includes("--yes") || args.includes("-y");
  const platform = detectPlatform();

  p.intro(bold(gold("Actualizar Ein")));

  if (!existsSync(AGENT_DIR)) {
    p.log.error(`Ein no esta desplegado (${AGENT_DIR}). Ejecuta \`ein install\`.`);
    p.outro("Nada que actualizar.");
    return 1;
  }

  const marker = readMarker();
  p.log.info(`Instalado: ${marker?.version ?? "desconocido"}  |  binario: ${INSTALLER_VERSION}`);

  // Dry-run: show what would happen and exit without touching anything.
  if (args.includes("--dry-run")) {
    const manifest = await readBundledManifest();
    const lines = [
      "Plan (dry-run, no se ejecuta nada):",
      `  1. Backup previo de ${AGENT_DIR} (tar.gz, dedup, conserva 5)`,
      `  2. Redeploy del template en ${AGENT_DIR} (estado de usuario intacto)`,
      manifest
        ? `     template v${manifest.templateVersion}: ${manifest.agents?.length ?? 0} agentes, ${manifest.chains?.length ?? 0} chains, ${manifest.extensions?.length ?? 0} extensiones`
        : "     (template sin manifest: binario antiguo)",
      "  3. Actualizacion de pi (con confirmacion)",
      "  4. Verificacion de paquetes Pi declarados",
      "  5. Doctor de verificacion",
    ];
    p.log.message(lines.join("\n"));
    p.outro("Dry-run completado. Ejecuta `ein update` para aplicar.");
    return 0;
  }

  // 1. Backup before touching anything.
  const sBackup = p.spinner();
  sBackup.start("Creando backup");
  const backup = await snapshot("pre-update");
  sBackup.stop(
    backup.path
      ? `Backup: ${backup.path}${backup.deduped ? " (sin cambios, reutilizado)" : ""}${backup.pruned.length ? ` · podados ${backup.pruned.length} antiguos` : ""}`
      : "Sin backup (nada que copiar)",
  );

  // 2. Redeploy bundled template. User state (auth.json, secrets, sessions) is
  // not in the tarball, so it survives untouched. If the deploy dies mid-way
  // (it wipes template dirs before extracting), roll back to the backup.
  const sDeploy = p.spinner();
  sDeploy.start("Redesplegando template Ein");
  let deployed;
  try {
    deployed = await deployTemplate(platform);
  } catch (error) {
    sDeploy.stop("Fallo el redeploy.");
    p.log.error(error instanceof Error ? error.message : String(error));
    if (backup.path) {
      const sRb = p.spinner();
      sRb.start("Restaurando el backup previo (rollback automatico)");
      try {
        await restoreBackup(backup.path);
        sRb.stop("Estado anterior restaurado.");
      } catch (rbError) {
        sRb.stop("Fallo el rollback.");
        p.log.error(rbError instanceof Error ? rbError.message : String(rbError));
        p.log.warn(`Restaura a mano con \`ein restore\` (backup: ${backup.path}).`);
      }
    }
    p.outro("Actualizacion abortada; el estado anterior se ha restaurado.");
    return 1;
  }
  sDeploy.stop(`Template actualizado (engram: ${deployed.engramFound ? deployed.engramCommand : "PATH"})`);

  // 3. Update pi to latest.
  if (yes || (await confirmUpdate())) {
    const sPi = p.spinner();
    sPi.start("Actualizando pi a la ultima version");
    const r = await installPi();
    sPi.stop(r.detail);
  }

  // 3b. Ensure declared Pi extension packages are installed.
  const sPkgs = p.spinner();
  sPkgs.start("Verificando paquetes de Pi declarados");
  const pkgs = await installDeclaredPackages();
  sPkgs.stop(pkgs.detail);

  // 4. Refresh marker.
  writeMarker(marker?.channel ?? "stable");

  // 5. Doctor.
  const report = runDoctor(platform);
  p.log.message(renderReport(report));

  // 6. Note newer installer binary if available.
  const latest = await latestInstallerTag();
  if (latest && !latest.includes(INSTALLER_VERSION)) {
    p.log.warn(`Hay un instalador mas nuevo disponible: ${latest}. Reinstala con curl|bash para actualizar el binario.`);
  }

  p.outro(report.result === "FAIL" ? "Actualizacion con errores." : "Ein actualizado.");
  return report.result === "FAIL" ? 1 : 0;
}

async function confirmUpdate(): Promise<boolean> {
  const res = await p.confirm({ message: "Actualizar pi (@earendil-works/pi-coding-agent)?" });
  if (p.isCancel(res)) return false;
  return res;
}
