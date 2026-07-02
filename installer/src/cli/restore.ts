// =============================================================================
// CLI: restore
// Lists installer backups and restores the chosen one over ~/.pi/agent.
// Also manages pins: `ein restore --pin <nombre>` / `--unpin <nombre>` protege
// o libera un backup frente a la poda automatica.
// =============================================================================

import * as p from "@clack/prompts";
import { listBackups, restoreBackup, setPinned, snapshot } from "../core/backup.ts";
import { bold, gold } from "../tui/theme.ts";

function findByName(name: string) {
  return listBackups().find((b) => b.name === name || b.name.startsWith(name)) ?? null;
}

export async function runRestore(args: string[]): Promise<number> {
  const yes = args.includes("--yes") || args.includes("-y");

  // Pin management short-circuit: no restore flow involved.
  const pinIdx = args.indexOf("--pin");
  const unpinIdx = args.indexOf("--unpin");
  if (pinIdx !== -1 || unpinIdx !== -1) {
    const idx = pinIdx !== -1 ? pinIdx : unpinIdx;
    const name = args[idx + 1];
    if (!name) {
      console.error("uso: ein restore --pin|--unpin <nombre-de-backup>");
      return 1;
    }
    const entry = findByName(name);
    if (!entry) {
      console.error(`backup no encontrado: ${name}`);
      return 1;
    }
    setPinned(entry.path, pinIdx !== -1);
    console.log(pinIdx !== -1 ? `Pinned: ${entry.name} (la poda no lo tocara).` : `Unpinned: ${entry.name}.`);
    return 0;
  }

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
      label: b.pinned ? `${b.name} [pin]` : b.name,
      hint: `${b.mtime.toLocaleString()}${b.kind === "dir" ? " · formato antiguo" : ""}`,
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
  const pre = await snapshot("pre-restore");
  sBackup.stop(
    pre.path ? `Backup: ${pre.path}${pre.deduped ? " (sin cambios, reutilizado)" : ""}` : "Sin backup",
  );

  const sRestore = p.spinner();
  sRestore.start("Restaurando");
  try {
    await restoreBackup(choice as string);
    sRestore.stop("Restaurado.");
  } catch (error) {
    sRestore.stop("Fallo al restaurar.");
    p.log.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  p.outro("Restauracion completada. Ejecuta `ein doctor` para verificar.");
  return 0;
}
