// =============================================================================
// EIN INSTALLER — entry point
// CLI router + interactive TUI (no args). Subcommands wired incrementally per
// implementation phase.
// =============================================================================

import { runDoctorCommand } from "./cli/doctor.ts";
import { runInstall } from "./cli/install.ts";
import { runMenu } from "./cli/menu.ts";
import { runUpdate } from "./cli/update.ts";
import { runUninstall } from "./cli/uninstall.ts";
import { runRestore } from "./cli/restore.ts";
import { INSTALLER_VERSION } from "./core/version.ts";

function printHelp(): void {
  console.log("ein — instalador del workbench Ein sobre Pi");
  console.log("");
  console.log("uso: ein <comando>");
  console.log("");
  console.log("comandos:");
  console.log("  install      instala/actualiza Ein (checks + deploy + secrets)");
  console.log("  update       actualiza Ein y pi a la ultima version");
  console.log("  uninstall    elimina Ein (conserva secrets/auth.json)");
  console.log("  restore      restaura desde un backup (--pin/--unpin <nombre>)");
  console.log("  doctor       diagnostico del despliegue (sin lanzar pi)");
  console.log("  --version    version del instalador");
  console.log("");
  console.log("flags: --yes --dry-run --no-engram --no-secrets --no-linear");
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "install":
      return runInstall(rest);
    case "update":
      return runUpdate(rest);
    case "uninstall":
      return runUninstall(rest);
    case "restore":
      return runRestore(rest);
    case "doctor":
      return runDoctorCommand();
    case "--version":
    case "-v":
      console.log(`ein-installer ${INSTALLER_VERSION}`);
      return 0;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return 0;
    case undefined:
      // No args → interactive TUI menu.
      return runMenu();
    default:
      console.error(`comando desconocido: ${cmd}`);
      printHelp();
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
