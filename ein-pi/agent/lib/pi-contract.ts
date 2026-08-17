// =============================================================================
// CONTRATO CON PI
// =============================================================================
// Ein codifica supuestos sobre Pi por todas partes: nombres de tools builtin en
// las allowlists de los agentes, hooks de extensión, métodos de `ExtensionAPI`,
// campos del input de delegación. Pi se mueve rápido (0.80.x) y ninguno de esos
// supuestos estaba comprobado en ningún sitio: cada `pi update` era una ruleta.
//
// Ya pasó, y salió caro: los siete agentes SDD declaraban la tool `glob`, que
// Pi no registra. El runner convertía la ausencia en un error AL CERRAR, así que
// tres fases salían ✗ con sus artefactos correctos. ~120k tokens en reintentos
// falsos por un nombre.
//
// Este módulo hace explícito lo que Ein NECESITA de Pi y permite contrastarlo
// contra la instalación real. Dos capas, porque los fallos vienen de dos lados:
//
//   1. DERIVA DE EIN (se valida en CI, sin Pi instalado): si Ein empieza a usar
//      un hook o un método que no está declarado aquí, el test lo caza. El
//      contrato deja de ser una lista que se pudre y pasa a ser una que falla.
//   2. DERIVA DE PI (se valida contra la instalación): si un `pi update` quita
//      o renombra algo que Ein usa, `ein doctor` lo dice ANTES de que un run
//      falle de forma incomprensible.
//
// Este fichero NO importa nada de Pi: los tests corren en CI sin Pi instalado
// (ver no-pi-package-imports.test.ts). La superficie real se OBSERVA leyendo los
// ficheros de la instalación, no importándolos.
// =============================================================================

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";

// Builtins de Pi. FUENTE ÚNICA: la replicaban por su cuenta el doctor y el test
// de allowlists, que es la misma clase de duplicación que ya abrió un agujero en
// la validación de OpenSpec. Origen: `dist/core/tools/index.js` → `allToolNames`.
// `glob` NO existe: el equivalente es `find`.
export const PI_BUILTIN_TOOLS: readonly string[] = ["read", "bash", "edit", "write", "grep", "find", "ls"];

// Hooks de extensión que Ein registra con `pi.on(...)`.
export const PI_HOOKS: readonly string[] = [
	"agent_end",
	"agent_settled",
	"before_agent_start",
	"input",
	"session_before_compact",
	"session_start",
	"session_shutdown",
	"tool_call",
	"tool_execution_end",
	"tool_result",
	"turn_end",
];

// Métodos de `ExtensionAPI` que Ein invoca.
export const PI_EXTENSION_API: readonly string[] = [
	"getAllTools",
	"getCommands",
	"on",
	"registerCommand",
	"registerShortcut",
	"registerTool",
	"sendUserMessage",
];

export type PiSurface = {
	root: string;
	version: string | null;
	tools: string[];
	hooks: string[];
	extensionApi: string[];
};

export type ContractDrift = {
	missingTools: string[];
	missingHooks: string[];
	missingExtensionApi: string[];
};

export function driftIsEmpty(drift: ContractDrift): boolean {
	return drift.missingTools.length === 0 && drift.missingHooks.length === 0 && drift.missingExtensionApi.length === 0;
}

// Puro: qué declara Ein que la superficie observada NO ofrece. La dirección
// importa — que Pi tenga cosas que Ein no usa es normal y no es deriva.
export function compareWithSurface(surface: PiSurface): ContractDrift {
	const has = (list: readonly string[], name: string) => list.includes(name);
	return {
		missingTools: PI_BUILTIN_TOOLS.filter((tool) => !has(surface.tools, tool)),
		missingHooks: PI_HOOKS.filter((hook) => !has(surface.hooks, hook)),
		missingExtensionApi: PI_EXTENSION_API.filter((method) => !has(surface.extensionApi, method)),
	};
}

export function formatDrift(drift: ContractDrift): string {
	const parts: string[] = [];
	if (drift.missingTools.length > 0) parts.push(`tools ausentes: ${drift.missingTools.join(", ")}`);
	if (drift.missingHooks.length > 0) parts.push(`hooks ausentes: ${drift.missingHooks.join(", ")}`);
	if (drift.missingExtensionApi.length > 0) parts.push(`métodos ausentes: ${drift.missingExtensionApi.join(", ")}`);
	return parts.join(" · ");
}

// Raíz del paquete de Pi instalado. `EIN_PI_ROOT` es la costura de test; si no,
// se resuelve desde el binario `pi` del PATH siguiendo el symlink, que es como
// está instalado de verdad (bun -g deja un enlace a dist/).
export function resolvePiRoot(env: NodeJS.ProcessEnv = process.env): string | null {
	const override = env.EIN_PI_ROOT?.trim();
	if (override) return existsSync(override) ? override : null;
	for (const dir of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
		const candidate = join(dir, "pi");
		if (!existsSync(candidate)) continue;
		try {
			// dist/cli.js → dist → raíz del paquete.
			let current = dirname(realpathSync(candidate));
			for (let depth = 0; depth < 4; depth += 1) {
				if (existsSync(join(current, "package.json"))) return current;
				current = dirname(current);
			}
		} catch {
			// enlace roto: se sigue buscando
		}
	}
	return null;
}

function readIfPresent(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

// Observa la superficie REAL leyendo los ficheros de la instalación. No se
// importa Pi a propósito: importarlo ataría la suite a tenerlo instalado, y CI
// no lo tiene. Leer el `.d.ts` es menos elegante y mucho más portable.
export function observePiSurface(root: string): PiSurface | null {
	const types = readIfPresent(join(root, "dist", "core", "extensions", "types.d.ts"));
	const tools = readIfPresent(join(root, "dist", "core", "tools", "index.js"));
	if (!types && !tools) return null;
	let version: string | null = null;
	try {
		version = (JSON.parse(readIfPresent(join(root, "package.json"))) as { version?: string }).version ?? null;
	} catch {
		version = null;
	}
	const hooks = [...types.matchAll(/on\(event:\s*"([a-z_]+)"/g)].map((match) => match[1] as string);
	// Métodos declarados en la interfaz: `nombre(` o `nombre<` al inicio de línea.
	const extensionApi = [...types.matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9]*)\s*[(<]/gm)].map((match) => match[1] as string);
	const declaredTools = tools.match(/allToolNames\s*=\s*new Set\(\[([^\]]*)\]\)/)?.[1] ?? "";
	const toolNames = [...declaredTools.matchAll(/"([a-z_]+)"/g)].map((match) => match[1] as string);
	return {
		root,
		version,
		tools: [...new Set(toolNames)],
		hooks: [...new Set(hooks)],
		extensionApi: [...new Set(extensionApi)],
	};
}

export type ContractCheck =
	| { status: "ok"; surface: PiSurface }
	| { status: "drift"; surface: PiSurface; drift: ContractDrift }
	| { status: "unavailable"; reason: string };

// Contrasta el contrato contra la instalación. `unavailable` NO es un fallo:
// sin Pi resoluble no hay nada que afirmar, y fingir un veredicto sería peor que
// no darlo.
export function verifyPiContract(env: NodeJS.ProcessEnv = process.env): ContractCheck {
	const root = resolvePiRoot(env);
	if (!root) return { status: "unavailable", reason: "no se encontró la instalación de Pi" };
	const surface = observePiSurface(root);
	if (!surface) return { status: "unavailable", reason: `no se pudo leer la superficie de Pi en ${root}` };
	const drift = compareWithSurface(surface);
	return driftIsEmpty(drift) ? { status: "ok", surface } : { status: "drift", surface, drift };
}
