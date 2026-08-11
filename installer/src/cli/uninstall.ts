// =============================================================================
// CLI: uninstall
// Backup → remove Ein-owned content from ~/.pi/agent. Preserves auth.json,
// sessions/, backups/ and the secrets dir. Optionally removes engram data.
// =============================================================================

import * as p from "@clack/prompts";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { removeAppPackage, type AppPackagePaths } from "../core/app-package-lifecycle.ts";
import { snapshot } from "../core/backup.ts";
import { APP_COMMAND } from "../core/command-names.ts";
import { parseInstallFlags, type InstallTarget, type RuntimeInstallTarget } from "./install.ts";
import { activeHome, AGENT_DIR, ENGRAM_DIR } from "../core/paths.ts";
import { bold, gold } from "../tui/theme.ts";

// Top-level entries que el installer despliega y por tanto posee. auth.json,
// sessions/, backups/, npm/, runtime dirs y secrets quedan fuera a proposito.
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

export type RuntimeUninstallResult = Readonly<{ target: RuntimeInstallTarget; ok: boolean; detail: string }>;

export function uninstallAppPackages(
  target: InstallTarget,
  options: Readonly<{
    home?: string;
    binDir?: string;
    remove?: (paths: AppPackagePaths) => number;
  }> = {},
): RuntimeUninstallResult[] {
  const home = options.home ?? activeHome();
  const remove = options.remove ?? removeAppPackage;
  const targets: RuntimeInstallTarget[] = target === "both" ? ["pi", "claude"] : [target];
  return targets.map((runtime) => {
    try {
      let removed = 0;
      if (runtime === "pi") {
        removed += remove({ root: options.binDir ?? dirname(process.execPath), commands: [APP_COMMAND] });
      } else {
        removed += remove({ root: join(home, ".claude-ein", "bin"), commands: ["ein-app"] });
        removed += remove({ root: join(home, ".config", "fish", "functions"), commands: ["cc-ein.fish"], package: false });
      }
      return { target: runtime, ok: true, detail: `${removed} entradas de app eliminadas` };
    } catch (error) {
      return { target: runtime, ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  });
}

export async function runUninstall(args: string[]): Promise<number> {
  const yes = args.includes("--yes") || args.includes("-y");
  let target: InstallTarget;
  try {
    target = parseInstallFlags(args).runtime;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const includesPi = target !== "claude";
  const appPackage = { root: dirname(process.execPath), commands: [APP_COMMAND] } as const;

  p.intro(bold(gold("Desinstalar Ein")));

  p.log.warn("Se eliminara solo contenido propiedad de Ein; se conservan sesiones y datos runtime ajenos.");

  if (!yes) {
    const ok = await p.confirm({ message: "Continuar con la desinstalación?" });
    if (p.isCancel(ok) || !ok) {
      p.outro("Cancelado.");
      return 0;
    }
  }

  let backupPath: string | null = null;
  if (includesPi && existsSync(AGENT_DIR)) {
    const sBackup = p.spinner();
    sBackup.start("Creando backup antes de borrar");
    const backup = await snapshot("pre-uninstall", { appPackage });
    backupPath = backup.path;
    sBackup.stop(backupPath ? `Backup: ${backupPath}` : "Sin backup");
  }

  let removed = 0;
  if (includesPi) {
    for (const name of EIN_OWNED) {
      const path = join(AGENT_DIR, name);
      if (existsSync(path)) {
        rmSync(path, { recursive: true, force: true });
        removed++;
      }
    }
  }
  const results = uninstallAppPackages(target);
  for (const result of results) p.log[result.ok ? "success" : "error"](`${result.target}: ${result.detail}`);
  if (includesPi) p.log.info(`Eliminadas ${removed} entradas del agente Pi.`);

  if (includesPi && existsSync(ENGRAM_DIR)) {
    const removeEngram = yes
      ? false
      : await p.confirm({
          message: `Eliminar también la base de datos de memoria (${ENGRAM_DIR})?`,
          initialValue: false,
        });
    if (!p.isCancel(removeEngram) && removeEngram) {
      rmSync(ENGRAM_DIR, { recursive: true, force: true });
      p.log.success("Datos de engram eliminados.");
    }
  }

  const ok = results.every((result) => result.ok);
  p.outro(ok ? `Ein desinstalado. Backup en ${backupPath ?? "(ninguno)"}.` : "Desinstalación incompleta.");
  return ok ? 0 : 1;
}
