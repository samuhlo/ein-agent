import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MemoryCandidate, MemoryReceipt, MemoryType } from "./memory-contract.ts";

/**
 * Los tipos que el validador acepta. Exportado porque el ESQUEMA que se le
 * enseña al modelo tiene que anunciar exactamente estos: cuando el anuncio y la
 * validación se separan, el modelo manda algo plausible y el guardado se cae en
 * silencio como `no_candidate` — que es lo que pasó 374 veces.
 */
export const MEMORY_CANDIDATE_TYPES = [
	"decision", "architecture", "bugfix", "pattern", "config", "discovery", "learning",
] as const satisfies readonly MemoryType[];

const MEMORY_TYPES = new Set<MemoryType>(MEMORY_CANDIDATE_TYPES);

/**
 * Contrato del candidato, en forma de JSON Schema, para que el runtime se lo
 * ENSEÑE al modelo en la propia herramienta. Antes se declaraba como
 * `{ type: "object" }` a secas y ningún prompt nombraba los campos: se le pedía
 * adivinar cuatro nombres exactos.
 *
 * Vive aquí, junto al validador que lo comprueba, y no en la extensión que lo
 * registra: un esquema lejos de su validador es dos verdades que se separan.
 */
export const MEMORY_CANDIDATE_SCHEMA = {
	type: "object",
	description:
		"Optional notebook candidate, saved only after the phase artifact passes its gate. Offer one when the phase produced a durable lesson — a decision and why, an architectural constraint, a bug's real cause, a discovery worth not rediscovering. Skip it for routine progress: OpenSpec already holds the full record.",
	properties: {
		type: {
			type: "string",
			enum: MEMORY_CANDIDATE_TYPES,
			description: "What kind of lesson this is.",
		},
		stableId: {
			type: "string",
			description: "Stable slug identifying the lesson across revisions (e.g. `engram-single-store`). Reusing it updates the same note instead of duplicating it.",
		},
		title: {
			type: "string",
			description: "One line, max 160 chars, naming the lesson.",
		},
		summary: {
			type: "string",
			description: "What was learned, max 1200 chars. Prose, not a diff or a command log — pasted output is rejected as noise.",
		},
		rationale: {
			type: "string",
			description: "Optional. Why it was decided this way.",
		},
		evidence: {
			type: "string",
			description: "Optional. What proves it (a measurement, a count, a file).",
		},
	},
	required: ["type", "stableId", "title", "summary"],
} as const;
const SAVE_PHASES = {
	scope: "scope", map: "map", design: "design", tasks: "tasks",
	apply: "apply-progress", verify: "verify-report", close: "close",
} as const;
type SavePhase = keyof typeof SAVE_PHASES;

export type SafeMemoryReceipt = {
	status: MemoryReceipt["status"]; reason: MemoryReceipt["reason"]; key: string;
	projectHash?: string; topic?: string; count?: number; bytes?: number;
	durationMs: number; timestamp: string; digest?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function optionalText(value: unknown, maxLength = 600): string | undefined {
	return typeof value === "string" && value.length <= maxLength ? value : undefined;
}
function receipt(status: MemoryReceipt["status"], reason: MemoryReceipt["reason"]): MemoryReceipt {
	return { operation: "save", status, reason, durationMs: 0, timestamp: new Date().toISOString() };
}

export function buildPhaseMemoryCandidate(change: string, phase: unknown, input: unknown): MemoryCandidate | undefined {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(change) || typeof phase !== "string" || !(phase in SAVE_PHASES) || !isRecord(input)) return undefined;
	const type = optionalText(input.type, 32);
	const stableId = optionalText(input.stableId, 160);
	const title = optionalText(input.title, 160);
	const summary = optionalText(input.summary, 1_200);
	if (!type || !MEMORY_TYPES.has(type as MemoryType) || !stableId || !title || !summary) return undefined;
	return {
		type: type as MemoryType, stableId, title, summary,
		...(optionalText(input.rationale) ? { rationale: optionalText(input.rationale) } : {}),
		...(optionalText(input.evidence) ? { evidence: optionalText(input.evidence) } : {}),
		change, phase: SAVE_PHASES[phase as SavePhase],
	};
}

export function buildCloseMemoryCandidate(change: string): MemoryCandidate {
	return {
		type: "learning", stableId: `${change}-close`, title: `Closed SDD change ${change}`,
		summary: `OpenSpec archived the verified SDD change ${change}. Its summary is the durable record.`,
		change, phase: "close",
	};
}

export function safeMemoryReceipt(value: MemoryReceipt, key: string): SafeMemoryReceipt {
	return {
		status: value.status, reason: value.reason, key,
		...(value.projectHash ? { projectHash: value.projectHash } : {}),
		...(value.topic ? { topic: value.topic } : {}),
		...(value.count !== undefined ? { count: value.count } : {}),
		...(value.bytes !== undefined ? { bytes: value.bytes } : {}),
		durationMs: value.durationMs, timestamp: value.timestamp,
		...(value.digest ? { digest: value.digest } : {}),
	};
}

export async function saveAfterArtifactGate(input: {
	artifactClean: boolean; change: string; phase: unknown; candidate: unknown; enabled: boolean;
	save(candidate: MemoryCandidate): Promise<{ receipt: MemoryReceipt }>;
}): Promise<SafeMemoryReceipt> {
	const key = `sdd:${input.change}:${typeof input.phase === "string" ? input.phase : "invalid"}`;
	if (!input.artifactClean) return safeMemoryReceipt(receipt("skipped", "artifact_gate_failed"), key);
	const candidate = buildPhaseMemoryCandidate(input.change, input.phase, input.candidate);
	if (!candidate) return safeMemoryReceipt(receipt("skipped", "no_candidate"), key);
	if (!input.enabled) return safeMemoryReceipt(receipt("skipped", "memory_disabled"), key);
	try {
		return safeMemoryReceipt((await input.save(candidate)).receipt, key);
	} catch {
		return safeMemoryReceipt(receipt("failed", "spawn_error"), key);
	}
}

export function appendMemoryReceipt(changeDir: string, value: SafeMemoryReceipt): void {
	try {
		appendFileSync(join(changeDir, "memory-receipts.jsonl"), `${JSON.stringify(value)}\n`, "utf8");
	} catch {
		// BLINDAJE -> observability cannot turn a successful gate or archive into a failure.
	}
}

export function hasSuccessfulMemoryReceipt(changeDir: string, topic: string, digest: string): boolean {
	try {
		return readFileSync(join(changeDir, "memory-receipts.jsonl"), "utf8").split("\n").filter(Boolean).some((line) => {
			try {
				const value = JSON.parse(line) as Partial<SafeMemoryReceipt>;
				return value.status === "saved" && value.reason === "acknowledged" && value.topic === topic && value.digest === digest;
			} catch { return false; }
		});
	} catch { return false; }
}
