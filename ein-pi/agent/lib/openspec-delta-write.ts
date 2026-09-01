// =============================================================================
// [CORE] OPENSPEC DELTA WRITE
// Escribe el delta de comportamiento de un cambio
// (openspec/changes/<change>/specs/<domain>/spec.md) desde operaciones
// ESTRUCTURADAS, nunca desde markdown escrito a mano.
//
// Vive aquí, y no dentro de la tool de Pi, porque los dos runtimes lo
// necesitan: sin él, un cambio con delta de comportamiento empezado en Claude
// no puede cerrarse, y el agente recibía la orden de usar una herramienta que
// en Claude no existía.
//
// FAIL CLOSED -> serializa, RE-PARSEA con la gramática estricta y solo entonces
// escribe. Un delta malformado se rechaza aquí, sin dejar nada en disco, en vez
// de reventar el sync en el cierre.
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { DOMAIN_ID_PATTERN } from "./openspec-spec-contract.ts";
import { buildOpenSpecDelta, type OpenSpecDeltaOperation } from "./openspec-spec-parser.ts";
import { isSafeChangeName } from "./sdd-routing-core.ts";

export type DeltaWriteRequest = Readonly<{
	cwd: string;
	change: string;
	domain: string;
	operations: readonly unknown[];
}>;

export type DeltaWriteResult =
	| Readonly<{ ok: true; change: string; domain: string; path: string; operations: number }>
	| Readonly<{
			ok: false;
			code: "no-change" | "invalid-change" | "invalid-domain" | "no-operations" | "malformed" | "write-failed";
			reason: string;
	  }>;

/**
 * Normaliza una operación cruda a la forma que espera el serializador. Un
 * `kind` desconocido se conserva tal cual en vez de corregirse: la gramática es
 * la única autoridad sobre el formato, y hacerlo pasar por ADDED escondería el
 * error del autor hasta el cierre.
 */
function normalizeOperation(raw: unknown): OpenSpecDeltaOperation {
	const op = (raw ?? {}) as Record<string, unknown>;
	if (op.kind === "REMOVED") {
		return { kind: "REMOVED", scenarioId: String(op.scenarioId ?? ""), reason: String(op.reason ?? "") };
	}
	const scenario = (op.scenario ?? {}) as Record<string, unknown>;
	return {
		kind: op.kind === "MODIFIED" ? "MODIFIED" : (op.kind as "ADDED"),
		scenario: {
			id: String(scenario.id ?? ""),
			title: String(scenario.title ?? ""),
			requirement: String(scenario.requirement ?? ""),
			given: String(scenario.given ?? ""),
			when: String(scenario.when ?? ""),
			then: String(scenario.then ?? ""),
		},
	};
}

export function writeOpenSpecDelta(request: DeltaWriteRequest): DeltaWriteResult {
	const { cwd, change, domain } = request;

	if (!change) return { ok: false, code: "no-change", reason: "no active change" };
	if (!isSafeChangeName(change)) {
		return { ok: false, code: "invalid-change", reason: `invalid change name: ${JSON.stringify(change)}` };
	}
	if (!DOMAIN_ID_PATTERN.test(domain)) {
		return { ok: false, code: "invalid-domain", reason: `domain must be kebab-case: ${JSON.stringify(domain)}` };
	}
	if (request.operations.length === 0) {
		return { ok: false, code: "no-operations", reason: "no operations supplied" };
	}

	const operations = request.operations.map(normalizeOperation);
	const built = buildOpenSpecDelta({ domain, operations });
	if (!built.ok) {
		const first = built.errors[0];
		return {
			ok: false,
			code: "malformed",
			reason: first ? `${first.code} (line ${first.line}): ${first.message}` : "invalid format",
		};
	}

	const path = join(cwd, "openspec", "changes", change, "specs", domain, "spec.md");
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, built.value.contents);
	} catch (error) {
		return { ok: false, code: "write-failed", reason: error instanceof Error ? error.message : String(error) };
	}

	return { ok: true, change, domain, path, operations: operations.length };
}
