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

import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { DOMAIN_ID_PATTERN } from "./openspec-spec-contract.ts";
import { buildOpenSpecDelta, parseOpenSpecDelta, type OpenSpecDeltaOperation } from "./openspec-spec-parser.ts";
import { isSafeChangeName } from "./sdd-routing-core.ts";

export type DeltaWriteRequest = Readonly<{
	cwd: string;
	change: string;
	domain: string;
	operations: readonly unknown[];
	revision?: Readonly<{
		expectedSha256: string;
		scenarioIds: readonly string[];
	}>;
}>;

export type DeltaWriteResult =
	| Readonly<{
			ok: true;
			change: string;
			domain: string;
			path: string;
			operations: number;
			changed: boolean;
			sha256: string;
			revisedScenarioIds: readonly string[];
	  }>
	| Readonly<{
			ok: false;
			code:
				| "no-change"
				| "invalid-change"
				| "invalid-domain"
				| "no-operations"
				| "malformed"
				| "revision-required"
				| "invalid-revision"
				| "stale-delta"
				| "existing-delta-invalid"
				| "revision-out-of-scope"
				| "write-locked"
				| "write-failed";
			reason: string;
	  }>;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function operationId(operation: OpenSpecDeltaOperation): string {
	return operation.kind === "REMOVED" ? operation.scenarioId : operation.scenario.id;
}

function changedScenarioIds(
	before: readonly OpenSpecDeltaOperation[],
	after: readonly OpenSpecDeltaOperation[],
): string[] {
	const previous = new Map(before.map((operation) => [operationId(operation), JSON.stringify(operation)]));
	const next = new Map(after.map((operation) => [operationId(operation), JSON.stringify(operation)]));
	return [...new Set([...previous.keys(), ...next.keys()])]
		.filter((id) => previous.get(id) !== next.get(id))
		.sort();
}

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
	const lockPath = `${path}.lock`;
	try {
		mkdirSync(dirname(path), { recursive: true });
		mkdirSync(lockPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			return { ok: false, code: "write-locked", reason: "another delta writer is already changing this domain" };
		}
		return { ok: false, code: "write-failed", reason: error instanceof Error ? error.message : String(error) };
	}

	try {
		let previous: string | null = null;
		try {
			if (existsSync(path)) previous = readFileSync(path, "utf8");
		} catch (error) {
			return { ok: false, code: "write-failed", reason: error instanceof Error ? error.message : String(error) };
		}

		const nextSha256 = sha256(built.value.contents);
		if (previous === built.value.contents) {
			return { ok: true, change, domain, path, operations: operations.length, changed: false, sha256: nextSha256, revisedScenarioIds: [] };
		}

		let revisedScenarioIds: string[] = [];
		if (previous !== null) {
			if (!request.revision) {
				return { ok: false, code: "revision-required", reason: "an existing delta can change only with revision.expectedSha256 and revision.scenarioIds" };
			}
			const authorized = [...new Set(request.revision.scenarioIds)].sort();
			if (!SHA256_PATTERN.test(request.revision.expectedSha256) || authorized.length === 0 || authorized.some((id) => !DOMAIN_ID_PATTERN.test(id))) {
				return { ok: false, code: "invalid-revision", reason: "revision needs a lowercase SHA-256 digest and at least one kebab-case scenario ID" };
			}
			if (sha256(previous) !== request.revision.expectedSha256) {
				return { ok: false, code: "stale-delta", reason: "the persisted delta no longer matches revision.expectedSha256; read and reassess the current file" };
			}
			const parsedPrevious = parseOpenSpecDelta(previous);
			if (!parsedPrevious.ok) {
				return { ok: false, code: "existing-delta-invalid", reason: "the persisted delta is invalid and cannot use the bounded revision path" };
			}
			revisedScenarioIds = changedScenarioIds(parsedPrevious.value.operations, operations);
			const unauthorized = revisedScenarioIds.filter((id) => !authorized.includes(id));
			if (unauthorized.length > 0) {
				return { ok: false, code: "revision-out-of-scope", reason: `revision changes undeclared scenario IDs: ${unauthorized.join(", ")}` };
			}
		} else if (request.revision) {
			return { ok: false, code: "invalid-revision", reason: "revision authority was supplied but no persisted delta exists" };
		}

		const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
		try {
			const mode = previous === null ? 0o644 : lstatSync(path).mode;
			writeFileSync(temporary, built.value.contents, { flag: "wx", mode });
			renameSync(temporary, path);
		} catch (error) {
			try {
				rmSync(temporary, { force: true });
			} catch {
				// The original write error is the useful failure; cleanup is best effort.
			}
			return { ok: false, code: "write-failed", reason: error instanceof Error ? error.message : String(error) };
		}

		return { ok: true, change, domain, path, operations: operations.length, changed: true, sha256: nextSha256, revisedScenarioIds };
	} finally {
		try {
			rmdirSync(lockPath);
		} catch {
			// A later call reports a retained lock instead of guessing that it is stale.
		}
	}
}
