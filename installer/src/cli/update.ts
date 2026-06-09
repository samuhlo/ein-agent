// =============================================================================
// CLI: update
// Backup → redeploy bundled template (preserves user state) → update pi →
// re-template → doctor. Notes if a newer installer binary is available.
// =============================================================================

import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { detectPlatform } from "../core/platform.ts";
import { snapshot } from "../core/backup.ts";
import { deployTemplate } from "../core/deploy.ts";
import { installPi } from "../core/deps.ts";
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

  // 1. Backup before touching anything.
  const sBackup = p.spinner();
  sBackup.start("Creando backup");
  const backupPath = snapshot("pre-update");
  sBackup.stop(backupPath ? `Backup: ${backupPath}` : "Sin backup (nada que copiar)");

  // 2. Redeploy bundled template. User state (auth.json, secrets, sessions) is
  // not in the tarball, so it survives untouched.
  const sDeploy = p.spinner();
  sDeploy.start("Redesplegando template Ein");
  const deployed = await deployTemplate(platform);
  sDeploy.stop(`Template actualizado (engram: ${deployed.engramFound ? deployed.engramCommand : "PATH"})`);

  // 3. Update pi to latest.
  if (yes || (await confirmUpdate())) {
    const sPi = p.spinner();
    sPi.start("Actualizando pi a la ultima version");
    const r = await installPi();
    sPi.stop(r.detail);
  }

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
