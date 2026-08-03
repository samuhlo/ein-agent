#!/usr/bin/env bun
// =============================================================================
// pi-ein MIGRATE — mueve la instalación EIN de ~/.pi/agent a ~/.pi-ein/agent
// -----------------------------------------------------------------------------
// The installer and this explicit migration command share the same guarded
// migration seam. Vanilla or malformed-marker Pi state is never moved.
// =============================================================================

import { existsSync } from "node:fs";
import {
  derivePiInstallPaths,
  isValidInstallMarker,
} from "../installer/src/core/paths.ts";
import { migrateLegacyPi } from "../installer/src/core/pi-migration.ts";

const paths = derivePiInstallPaths();
const dryRun = process.argv.includes("--dry");

console.log(`\npi-ein migrate: ~/.pi/agent → ~/.pi-ein/agent${dryRun ? "  (DRY RUN)" : ""}\n`);

if (!existsSync(paths.legacyAgentDir)) {
  console.log("  ~/.pi/agent no existe: nada que migrar (¿ya migrado, o Pi-EIN sin instalar?).");
  process.exit(0);
}
if (!isValidInstallMarker(paths.legacyMarker)) {
  console.log("  ~/.pi/agent no tiene un marcador EIN valido: se conserva sin cambios.");
  process.exit(0);
}

try {
  const result = migrateLegacyPi(paths, { dryRun });
  console.log(`  backup: ${result.backupPath}`);
  if (dryRun) {
    console.log("  movido: ~/.pi/agent → ~/.pi-ein/agent (DRY RUN, sin cambios)");
    process.exit(0);
  }

  console.log("  movido: ~/.pi/agent → ~/.pi-ein/agent (login, sesiones e historial incluidos)");
  console.log("\n✓ Migrado. Ahora:");
  console.log("  · pi-ein   → tu EIN (aislado, con tu login y sesiones)");
  console.log("  · pi       → Pi vanilla (creará un ~/.pi/agent limpio al arrancar)");
  console.log("  Reversión: mv ~/.pi-ein/agent ~/.pi/agent  (o restaura el .tar.gz)\n");
} catch (error) {
  console.error(`  ⚠ migración fallida: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
