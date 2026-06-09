// =============================================================================
// CLI: restore
// Lists installer backups and restores the chosen one over ~/.pi/agent.
// =============================================================================

import * as p from "@clack/prompts";
import { listBackups, restoreBackup, snapshot } from "../core/backup.ts";
import { bold, gold } from "../tui/theme.ts";

export async function runRestore(args: string[]): Promise<number> {
  const yes = args.includes("--yes") || args.includes("-y");

  p.intro(bold(gold("Restaurar Ein")));

  const backups = listBackups();
  if (backups.length === 0) {
    p.log.info("No hay backups disponibles.");
    p.outro("Nada que restaurar.");
    return 0;
  }

  const choice = await p.select({
    message: "Elige un backup para restaurar",
    options: backups.map((b) => ({
      value: b.path,
      label: b.name,
      hint: b.mtime.toLocaleString(),
    })),
  });

  if (p.isCancel(choice)) {
    p.outro("Cancelado.");
    return 0;
  }

  if (!yes) {
    const ok = await p.confirm({ message: "Esto sobrescribira el estado actual de Ein. Continuar?" });
    if (p.isCancel(ok) || !ok) {
      p.outro("Cancelado.");
      return 0;
    }
  }

  // Snapshot current state before overwriting, so restore is itself reversible.
  const sBackup = p.spinner();
  sBackup.start("Backup del estado actual");
  const pre = snapshot("pre-restore");
  sBackup.stop(pre ? `Backup: ${pre}` : "Sin backup");

  const sRestore = p.spinner();
  sRestore.start("Restaurando");
  try {
    restoreBackup(choice as string);
    sRestore.stop("Restaurado.");
  } catch (error) {
    sRestore.stop("Fallo al restaurar.");
    p.log.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  p.outro("Restauracion completada. Ejecuta `ein doctor` para verificar.");
  return 0;
}
