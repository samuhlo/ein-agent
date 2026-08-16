// =============================================================================
// BUNDLE TEMPLATE (host) — el camino de CI
// `bundle-template.ts` es fail-closed a propósito: sin el binario de la app de
// terminal no produce template, porque un template sin `bin/ein` es justo el
// fallo que se arregló en 0.50.2. Ese contrato lo satisface `build-all.ts`,
// que compila la app por target y le pasa EIN_APP_BINARY/EIN_APP_TARGET.
//
// CI solo necesita el smoke de empaquetado y el prerequisito de los tests, no
// los cuatro targets. Este script compila la app para la plataforma ANFITRIONA
// y llama al bundler con el contrato ya satisfecho.
// =============================================================================

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTerminalApp } from "./build-terminal-app.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

// Bun nombra sus targets `bun-<os>-<arch>`; el id del template usa `<os>-<arch>`.
function hostTarget(): { id: string; bunTarget: string; libc: "glibc" | null } {
	const os = process.platform === "darwin" ? "darwin" : "linux";
	const arch = process.arch === "arm64" ? "arm64" : "x64";
	const id = `${os}-${arch}`;
	return { id, bunTarget: `bun-${id}`, libc: os === "linux" ? "glibc" : null };
}

async function main(): Promise<void> {
	const target = hostTarget();
	const staging = mkdtempSync(join(tmpdir(), "ein-host-app-"));
	const artifact = join(staging, "ein");
	try {
		console.log(`/// compilando app de terminal para ${target.bunTarget}`);
		await buildTerminalApp({ bunTarget: target.bunTarget, libc: target.libc }, artifact);
		const proc = Bun.spawn(["bun", "run", join(HERE, "bundle-template.ts")], {
			cwd: ROOT,
			stdout: "inherit",
			stderr: "inherit",
			env: { ...process.env, EIN_APP_BINARY: artifact, EIN_APP_TARGET: target.id },
		});
		if ((await proc.exited) !== 0) throw new Error("bundle-template fallo");
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
