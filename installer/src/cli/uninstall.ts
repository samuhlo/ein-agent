// =============================================================================
// CLI: uninstall
// Move known Ein-owned assets to private recovery. Runtime state stays in place.
// =============================================================================

import * as p from "@clack/prompts";
import { dirname, relative } from "node:path";
import { activeHome } from "../core/paths.ts";
import { createUninstallPlan, renderUninstallPlan } from "../core/uninstall-plan.ts";
import { executeUninstallPlan, inspectUninstallRecovery } from "../core/uninstall-recovery.ts";
import { parseInstallFlags, type InstallTarget } from "./install.ts";
import { bold, gold } from "../tui/theme.ts";

export async function runUninstall(args: string[], explicitTarget?: InstallTarget): Promise<number> {
  const yes = args.includes("--yes") || args.includes("-y");
  let target: InstallTarget; try { target = explicitTarget ?? parseInstallFlags(args).runtime; } catch (error) { console.error(error instanceof Error ? error.message : String(error)); return 1; }
  const home = activeHome(), binDir = dirname(process.execPath), dryRun = args.includes("--dry-run");

  p.intro(bold(gold("Desinstalar Ein")));
  const pending = inspectUninstallRecovery(home);
  if (pending.status === "blocked") {
    p.outro(`Uninstall blocked: inspect or move ~/${relative(home, pending.recoveryDirectory)} before retrying.`);
    return 1;
  }
  const plan = createUninstallPlan({ home, target, binDir });
  if (dryRun || plan.status === "blocked") { p.log.message(renderUninstallPlan(plan)); p.outro(plan.status === "blocked" ? "Uninstall blocked: the selected runtime marker is missing or invalid." : "Dry-run completed with zero writes."); return plan.status === "blocked" ? 1 : 0; }
  p.log.warn(`Se moverá solo contenido de Ein para ${target}; auth, sesiones, historial, secrets, memoria y backups se conservan.`);

  if (!yes) {
    const ok = await p.confirm({ message: "Continuar con la desinstalación?" });
    if (p.isCancel(ok) || !ok) {
      p.outro("Cancelado.");
      return 0;
    }
  }

  const sRemove = p.spinner();
  sRemove.start("Moving Ein files to private recovery");
  try {
    const result = executeUninstallPlan(plan, { home, target, binDir });
    sRemove.stop(`${result.moved.length} moved; ${result.absent.length} absent.`);
    const recovery = result.recoveryDirectory ? `~/${relative(home, result.recoveryDirectory)}` : "none";
    p.outro(result.status === "complete" ? `Ein uninstalled. Recovery: ${recovery}` : result.status === "rolled-back" ? `Uninstall failed; all moves were rolled back. Recovery: ${recovery}` : `Uninstall incomplete. Recover files from ${recovery} before retrying.`);
    return result.status === "complete" ? 0 : 1;
  } catch (error) {
    sRemove.stop("Uninstall failed before files could be moved safely.");
    p.outro(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
