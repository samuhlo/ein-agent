// =============================================================================
// SDD ASSETS
// Copia los ficheros de los agentes SDD (agents/, chains/, support/) desde el
// paquete a `~/.pi/agent`, y cuenta el drift (instalado ≠ empaquetado) para que
// `/ein:status` avise. Es puro filesystem: sin estado de sesión ni preferencias.
// =============================================================================

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_DIR } from "../extensions/ein-paths";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ASSETS_DIR = join(PACKAGE_ROOT, "assets");

function copyDirectoryFiles(
	sourceDir: string,
	targetDir: string,
	force: boolean,
): { copied: number; skipped: number } {
	if (!existsSync(sourceDir)) return { copied: 0, skipped: 0 };
	mkdirSync(targetDir, { recursive: true });
	let copied = 0;
	let skipped = 0;
	for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
		const sourcePath = join(sourceDir, entry.name);
		const targetPath = join(targetDir, entry.name);
		if (entry.isDirectory()) {
			const child = copyDirectoryFiles(sourcePath, targetPath, force);
			copied += child.copied;
			skipped += child.skipped;
			continue;
		}
		if (!entry.isFile()) continue;
		if (!force && existsSync(targetPath)) {
			skipped += 1;
			continue;
		}
		writeFileSync(targetPath, readFileSync(sourcePath));
		copied += 1;
	}
	return { copied, skipped };
}

export function installSddAssets(
	_cwd: string,
	force: boolean,
): { agents: number; chains: number; support: number; skipped: number; installed: number } {
	const agents = copyDirectoryFiles(join(ASSETS_DIR, "agents"), join(AGENT_DIR, "agents"), force);
	const chains = copyDirectoryFiles(join(ASSETS_DIR, "chains"), join(AGENT_DIR, "chains"), force);
	const support = copyDirectoryFiles(join(ASSETS_DIR, "support"), join(AGENT_DIR, "ein", "support"), force);
	return {
		agents: agents.copied + agents.skipped,
		chains: chains.copied + chains.skipped,
		support: support.copied + support.skipped,
		skipped: agents.skipped + chains.skipped + support.skipped,
		installed: agents.copied + chains.copied + support.copied,
	};
}

// Cuenta archivos de assets/ (agents, chains) que faltan o difieren de la copia
// instalada en AGENT_DIR. Usado por /ein:status para detectar drift.
export function sddGlobalAssetDriftCount(): number {
	let stale = 0;
	for (const subdir of ["agents", "chains"] as const) {
		const assetDir = join(ASSETS_DIR, subdir);
		if (!existsSync(assetDir)) continue;
		for (const entry of readdirSync(assetDir, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const installedPath = join(AGENT_DIR, subdir, entry.name);
			try {
				if (!existsSync(installedPath)) {
					stale += 1;
					continue;
				}
				if (readFileSync(join(assetDir, entry.name), "utf8") !== readFileSync(installedPath, "utf8")) {
					stale += 1;
				}
			} catch {
				stale += 1;
			}
		}
	}
	return stale;
}
