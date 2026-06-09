// =============================================================================
// CLI: interactive menu (no-arg default)
// Banner + gold menu routing to the lifecycle commands.
// =============================================================================

import * as p from "@clack/prompts";
import { playBanner } from "../tui/banner.ts";
import { bold, gold, goldDim } from "../tui/theme.ts";
import { runInstall } from "./install.ts";
import { runDoctorCommand } from "./doctor.ts";

type Action = "install" | "doctor" | "update" | "uninstall" | "restore" | "quit";

export async function runMenu(): Promise<number> {
  await playBanner();
  p.intro(bold(gold("Ein — gestor del workbench")));

  const action = await p.select({
    message: "Que quieres hacer?",
    options: [
      { value: "install", label: gold("Install"), hint: "instalar o reparar Ein" },
      { value: "doctor", label: gold("Doctor"), hint: "diagnostico del despliegue" },
      { value: "update", label: goldDim("Update"), hint: "actualizar Ein y pi" },
      { value: "uninstall", label: goldDim("Uninstall"), hint: "eliminar Ein" },
      { value: "restore", label: goldDim("Restore"), hint: "restaurar backup" },
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
    case "uninstall":
    case "restore":
      p.outro(`'${action}' aun no disponible (Fase 5).`);
      return 0;
    default:
      return 0;
  }
}
