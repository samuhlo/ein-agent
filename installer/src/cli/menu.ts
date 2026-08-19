// =============================================================================
// CLI: interactive menu (no-arg default)
// Banner + gold menu routing to the lifecycle commands.
// =============================================================================

import * as p from "../tui/ui.ts";
import { playBanner } from "../tui/banner.ts";
import { bold, gold, structure } from "../tui/theme.ts";
import { runInstall, type InstallTarget } from "./install.ts";
import { runDoctorCommand } from "./doctor.ts";
import { runUpdate } from "./update.ts";
import { runUninstall } from "./uninstall.ts";
import { runRestore } from "./restore.ts";

type Action = "install" | "doctor" | "update" | "uninstall" | "restore" | "quit";
type RuntimePromptOption = { value: InstallTarget; label: string; hint: string };
type RuntimePrompt = (options: {
  message: string;
  options: RuntimePromptOption[];
}) => Promise<unknown>;

export type RunMenuOptions = {
  actionPrompt?: () => Promise<unknown>;
  runtimePrompt?: RuntimePrompt;
  runInstall?: (args: string[], target: InstallTarget) => Promise<number>;
  runUninstall?: (args: string[], target: InstallTarget) => Promise<number>;
  playBanner?: () => Promise<void>;
  isCancel?: (value: unknown) => boolean;
};

const RUNTIME_PROMPT_OPTIONS: RuntimePromptOption[] = [
  { value: "pi", label: gold("Pi"), hint: "solo Pi" },
  { value: "claude", label: gold("Claude Code"), hint: "solo Claude Code" },
  { value: "both", label: gold("Both"), hint: "Pi + Claude Code" },
];

export async function selectInstallTarget(
  prompt?: RuntimePrompt,
  isCancel: (value: unknown) => boolean = p.isCancel,
  message = "Que runtime quieres instalar?",
): Promise<InstallTarget | null> {
  const target = prompt
    ? await prompt({ message, options: RUNTIME_PROMPT_OPTIONS })
    : await p.select({ message, options: RUNTIME_PROMPT_OPTIONS });
  return isCancel(target) ? null : (target as InstallTarget);
}

export async function runMenu(options: RunMenuOptions = {}): Promise<number> {
  const isCancel = options.isCancel ?? p.isCancel;
  const install = options.runInstall ?? runInstall;

  // BLINDAJE -> Sin stdin interactivo, clack no recibe teclas y el menu se
  // queda congelado (curl|bash en macOS: kqueue no puede poll /dev/tty).
  // Mejor avisar y salir limpio que colgarse.
  if (!process.stdin.isTTY) {
    console.log("ein: el menu interactivo necesita un terminal.");
    console.log("Ejecuta `ein` directamente, o un subcomando: ein install | doctor | update");
    return 0;
  }
  await (options.playBanner ?? playBanner)();
  p.intro("gestor del workbench");

  const action = options.actionPrompt
    ? await options.actionPrompt()
    : await p.select({
        message: "Que quieres hacer?",
        options: [
          { value: "install", label: gold("Install"), hint: "instalar o reparar Ein" },
          { value: "doctor", label: gold("Doctor"), hint: "diagnostico del despliegue" },
          { value: "update", label: gold("Update"), hint: "actualizar Ein y pi" },
          { value: "uninstall", label: structure("Uninstall"), hint: "eliminar Ein" },
          { value: "restore", label: structure("Restore"), hint: "restaurar backup" },
          { value: "quit", label: "Salir", hint: "" },
        ],
      });

  if (isCancel(action) || action === "quit") {
    p.outro("Hasta luego.");
    return 0;
  }

  switch (action as Action) {
    case "install": {
      const target = await selectInstallTarget(options.runtimePrompt, isCancel);
      if (target === null) {
        p.outro("Hasta luego.");
        return 0;
      }
      return install([], target);
    }
    case "doctor":
      return runDoctorCommand();
    case "update":
      return runUpdate([]);
    case "uninstall":
      { const target = await selectInstallTarget(options.runtimePrompt, isCancel, "Que runtime quieres desinstalar?"); if (target === null) return 0; return (options.runUninstall ?? runUninstall)([], target); }
    case "restore":
      return runRestore([]);
    default:
      return 0;
  }
}
