// =============================================================================
// [CORE] SDD SUMMARY WRITE
// Escribe `summary.md` de la fase `close` (openspec/changes/<change>/summary.md)
// desde contenido ya generado por el agente.
//
// Vive aquí, y no dentro de una tool de Pi, por el mismo motivo que
// `openspec-delta-write.ts`: los dos runtimes lo necesitan. En Pi `write` ya
// funciona; en Claude un agente puede rehusar `Write` en un fichero `.md` por
// interpretarlo como "report file" no solicitado — visto dos veces en la misma
// sesión, incluso con la orden explícita del coordinador. Esto no arregla esa
// negativa (no es comprobable de forma determinista); le da una salida que no
// depende de que el modelo venza su propia política.
//
// FAIL CLOSED -> valida el nombre del cambio, que exista en disco y que el
// contenido no esté vacío antes de tocar el filesystem.
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { isSafeChangeName } from "./sdd-routing-core.ts";

export type SummaryWriteRequest = Readonly<{
	cwd: string;
	change: string;
	content: string;
}>;

export type SummaryWriteResult =
	| Readonly<{ ok: true; change: string; path: string }>
	| Readonly<{
			ok: false;
			code: "no-change" | "invalid-change" | "empty-content" | "write-failed";
			reason: string;
	  }>;

export function writeSddSummary(request: SummaryWriteRequest): SummaryWriteResult {
	const { cwd, change, content } = request;

	if (!change) return { ok: false, code: "no-change", reason: "no active change" };
	if (!isSafeChangeName(change)) {
		return { ok: false, code: "invalid-change", reason: `invalid change name: ${JSON.stringify(change)}` };
	}

	const changeDir = join(cwd, "openspec", "changes", change);
	if (!existsSync(changeDir)) {
		return { ok: false, code: "no-change", reason: `change '${change}' does not exist in openspec/changes` };
	}
	if (content.trim().length === 0) {
		return { ok: false, code: "empty-content", reason: "summary content is empty" };
	}

	const path = join(changeDir, "summary.md");
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	} catch (error) {
		return { ok: false, code: "write-failed", reason: error instanceof Error ? error.message : String(error) };
	}

	return { ok: true, change, path };
}
