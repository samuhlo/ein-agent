// =============================================================================
// CLI: uninstall
// Backup → remove Ein-owned content from ~/.pi/agent. Preserves auth.json,
// sessions/, backups/ and the secrets dir. Optionally removes engram data.
// =============================================================================

import * as p from "@clack/prompts";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { snapshot } from "../core/backup.ts";
import { AGENT_DIR, ENGRAM_DIR } from "../core/paths.ts";
import { bold, gold } from "../tui/theme.ts";

// Top-level entries the installer deploys and therefore owns. auth.json,
// sessions/, backups/, npm/, runtime dirs and secrets are intentionally absent.
const EIN_OWNED = [
  "AGENTS.md",
  "brand.json",
  "models.json",
  "mcp.json",
  "settings.json",
  "template-manifest.json",
  "extensions-manifest.json",
  ".ein-install.json",
  "agents",
  "assets",
  "chains",
  "docs",
  "extensions",
  "lib",
  "prompts",
  "skills",
];

export async function runUninstall(args: string[]): Promise<number> {
  const yes = args.includes("--yes") || args.includes("-y");

  p.intro(bold(gold("Desinstalar Ein")));

  if (!existsSync(AGENT_DIR)) {
    p.log.info(`No hay nada que desinstalar (${AGENT_DIR} no existe).`);
    p.outro("Listo.");
    return 0;
  }

  p.log.warn("Se eliminara el contenido de Ein. Se conservan auth.json, sessions/, backups/ y tus secrets.");

  if (!yes) {
    const ok = await p.confirm({ message: "Continuar con la desinstalacion?" });
    if (p.isCancel(ok) || !ok) {
      p.outro("Cancelado.");
      return 0;
    }
  }

  // 1. Backup first.
  const sBackup = p.spinner();
  sBackup.start("Creando backup antes de borrar");
  const backup = await snapshot("pre-uninstall");
  const backupPath = backup.path;
  sBackup.stop(backupPath ? `Backup: ${backupPath}` : "Sin backup");

  // 2. Remove Ein-owned entries.
  const sRemove = p.spinner();
  sRemove.start("Eliminando contenido de Ein");
  let removed = 0;
  for (const name of EIN_OWNED) {
    const path = join(AGENT_DIR, name);
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
      removed++;
    }
  }
  sRemove.stop(`Eliminadas ${removed} entradas de Ein.`);

  // 3. Optionally remove engram data.
  if (existsSync(ENGRAM_DIR)) {
    const removeEngram = yes
      ? false
      : await p.confirm({
          message: `Eliminar tambien la base de datos de memoria (${ENGRAM_DIR})?`,
          initialValue: false,
        });
    if (!p.isCancel(removeEngram) && removeEngram) {
      rmSync(ENGRAM_DIR, { recursive: true, force: true });
      p.log.success("Datos de engram eliminados.");
    }
  }

  p.outro(`Ein desinstalado. Backup en ${backupPath ?? "(ninguno)"}.`);
  return 0;
}
