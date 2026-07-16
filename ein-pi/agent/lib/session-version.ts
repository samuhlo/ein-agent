// =============================================================================
// SESSION VERSION — nudge de sesión obsoleta
// `ein update` cambia la plantilla EN DISCO, pero una sesión Pi viva sigue con
// lo que cargó al arrancar (agentes, orchestrator.md, preflight/config corren
// una vez por sesión). Continuar la misma sesión tras un update deja un estado
// mezclado y confuso. Este módulo detecta el cambio de versión instalada durante
// la sesión para avisar de reiniciar. Puro y testeable.
// =============================================================================

import { existsSync, readFileSync } from "node:fs";

// Lee la versión del install marker (`~/.pi/agent/.ein-install.json`). v1 y v2
// del marker llevan `version`. null si falta/roto (runs de fuente/dev).
export function readInstalledVersion(markerPath: string): string | null {
	try {
		if (!existsSync(markerPath)) return null;
		const parsed = JSON.parse(readFileSync(markerPath, "utf8")) as { version?: unknown };
		return typeof parsed.version === "string" ? parsed.version : null;
	} catch {
		return null;
	}
}

// Decide si avisar: solo cuando hay dos versiones conocidas y DISTINTAS, y no se
// avisó ya. Sin versión de arranque o actual (dev), o iguales → no molesta.
export function staleSessionNudge(input: {
	startVersion: string | null;
	currentVersion: string | null;
	alreadyNudged: boolean;
}): { nudge: boolean; version: string | null } {
	const { startVersion, currentVersion, alreadyNudged } = input;
	if (alreadyNudged || !startVersion || !currentVersion || startVersion === currentVersion) {
		return { nudge: false, version: currentVersion };
	}
	return { nudge: true, version: currentVersion };
}
