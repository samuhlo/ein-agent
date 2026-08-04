#!/usr/bin/env bun
// =============================================================================
// pi-ein MIGRATE — mueve la instalación EIN de ~/.pi/agent a ~/.pi-ein/agent
// -----------------------------------------------------------------------------
// Deja `pi` como Pi vanilla y `pi-ein` (aislado vía PI_CODING_AGENT_DIR) como la
// edición EIN. Conserva login (auth.json), sesiones e historial (se mueven con
// el dir). Hace un backup .tar.gz antes de mover. Idempotente y reversible.
//
//   bun pi-ein/migrate.ts          # migra (con backup)
//   bun pi-ein/migrate.ts --dry    # enseña qué haría, sin tocar nada
// =============================================================================

import { existsSync, mkdirSync, readdirSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const SRC = join(HOME, ".pi", "agent");
const DEST_ROOT = join(HOME, ".pi-ein");
const DEST = join(DEST_ROOT, "agent");
const DRY = process.argv.includes("--dry");

console.log(`\npi-ein migrate: ~/.pi/agent → ~/.pi-ein/agent${DRY ? "  (DRY RUN)" : ""}\n`);

if (!existsSync(SRC)) {
	console.log("  ~/.pi/agent no existe: nada que migrar (¿ya migrado, o Pi-EIN sin instalar?).");
	process.exit(0);
}
if (existsSync(DEST) && readdirSync(DEST).length > 0) {
	console.log(`  ⚠ ${DEST} ya existe y no está vacío: parece ya migrado. Abortando para no pisar.`);
	process.exit(1);
}

// Backup por seguridad (reversible aunque el move fallara a medias).
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backup = join(HOME, ".pi", `agent-premigrate-${stamp}.tar.gz`);
if (!DRY) {
	execFileSync("tar", ["-czf", backup, "-C", join(HOME, ".pi"), "agent"], { stdio: "ignore" });
}
console.log(`  backup: ${backup}`);

// Move (mismo filesystem bajo $HOME → rename atómico).
if (!DRY) {
	mkdirSync(DEST_ROOT, { recursive: true });
	renameSync(SRC, DEST);
}
console.log(`  movido: ~/.pi/agent → ~/.pi-ein/agent (login, sesiones e historial incluidos)`);

// El template bakea rutas ABSOLUTAS al desplegar (extensions/prompts/skills en
// settings.json). Tras el move quedan apuntando al viejo ~/.pi/agent → hay que
// reescribirlas al nuevo dir. Solo settings.json (el config vivo); las
// sessions/*.jsonl son historial (no se tocan) y cualquier cache es regenerable.
const settingsPath = join(DEST, "settings.json");
if (existsSync(settingsPath)) {
	const before = readFileSync(settingsPath, "utf8");
	const after = before.split(SRC).join(DEST);
	const n = before.split(SRC).length - 1;
	if (!DRY && n > 0) writeFileSync(settingsPath, after);
	console.log(`  settings.json: ${n} rutas absolutas reescritas ~/.pi/agent → ~/.pi-ein/agent`);
}

console.log(`\n✓ Migrado. Ahora:`);
console.log(`  · pi-ein   → tu EIN (aislado, con tu login y sesiones)`);
console.log(`  · pi       → Pi vanilla (creará un ~/.pi/agent limpio al arrancar)`);
console.log(`  Reversión: mv ~/.pi-ein/agent ~/.pi/agent  (o restaura el .tar.gz)\n`);
