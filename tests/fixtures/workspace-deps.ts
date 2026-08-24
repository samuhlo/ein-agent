// =============================================================================
// [CORE] GUARDIÁN DE DEPENDENCIAS DEL WORKSPACE
//
// POR QUÉ -> este repo tiene DOS instalaciones (`/` e `/installer`) y la suite
// necesita las dos: varios tests lanzan `bun run` dentro de `installer/`. Sin
// `installer/node_modules` salían 16-19 rojos que parecían tests rotos, y no lo
// estaban. CI instala las dos (`ci.yml`), así que allí pasaban: el fallo solo
// existía en local y nadie lo había escrito en ninguna parte.
//
// Módulo PURO: entra la raíz, sale la lista de lo que falta. La E/S de avisar y
// cortar vive en el preload.
// =============================================================================

import { existsSync } from "node:fs";
import { join } from "node:path";

/** Instalaciones que la suite necesita, con el comando que las arregla. */
export const WORKSPACE_INSTALLS: readonly { deps: string; fix: string }[] = [
	{ deps: "node_modules", fix: "bun install" },
	{ deps: join("installer", "node_modules"), fix: "cd installer && bun install" },
];

export function missingWorkspaceDeps(root: string): readonly { deps: string; fix: string }[] {
	return WORKSPACE_INSTALLS.filter((install) => !existsSync(join(root, install.deps)));
}

/** El aviso que lee una persona: qué falta y qué escribir para arreglarlo. */
export function missingDepsMessage(missing: readonly { deps: string; fix: string }[]): string {
	if (missing.length === 0) return "";
	const lines = [
		"",
		"  Faltan dependencias y la suite daría rojos que no son tuyos.",
		"",
		...missing.map((install) => `    ${install.deps} → ${install.fix}`),
		"",
		"  Este repo tiene dos instalaciones: la raíz y la del instalador.",
		"",
	];
	return lines.join("\n");
}
