// =============================================================================
// CLI: interactive menu (no-arg default)
// Banner + gold menu routing to the lifecycle commands.
// =============================================================================

import * as p from "@clack/prompts";
import { playBanner } from "../tui/banner.ts";
import { bold, gold, structure } from "../tui/theme.ts";
import { runInstall } from "./install.ts";
import { runDoctorCommand } from "./doctor.ts";
import { runUpdate } from "./update.ts";
import { runUninstall } from "./uninstall.ts";
import { runRestore } from "./restore.ts";

type Action = "install" | "doctor" | "update" | "uninstall" | "restore" | "quit";

export async function runMenu(): Promise<number> {
  // Sin stdin interactivo, el menu de clack no recibe teclas y se queda
  // congelado (p.ej. macOS via curl|bash: kqueue no puede hacer poll de
  // /dev/tty). Mejor avisar y salir limpio que colgarse.
  if (!process.stdin.isTTY) {
    console.log("ein: el menu interactivo necesita un terminal.");
    console.log("Ejecuta `ein` directamente, o un subcomando: ein install | doctor | update");
    return 0;
  }
  await playBanner();
  p.intro(bold(gold("Ein — gestor del workbench")));

  const action = await p.select({
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

  if (p.isCancel(action) || action === "quit") {
    p.outro("Hasta luego.");
    return 0;
  }

  switch (action as Action) {
    case "install":
      return runInstall([]);
    case "doctor":
      return runDoctorCommand();
    case "update":
      return runUpdate([]);
    case "uninstall":
      return runUninstall([]);
    case "restore":
      return runRestore([]);
    default:
      return 0;
  }
}
