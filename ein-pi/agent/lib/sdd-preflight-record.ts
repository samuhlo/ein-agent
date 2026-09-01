// =============================================================================
// [CORE] POSTURA DEL CAMBIO
// Cómo se conduce ESTE cambio: con qué exigencia de tests (TDD estricto o no) y
// con cuántas fases (el carril). Vive en el directorio del cambio, no en la
// memoria de una sesión.
//
// POR QUÉ EXISTE -> la decisión de TDD se guardaba en un Map indexado por la
// sesión de Pi. Dos consecuencias medidas: (1) el segundo cambio de una sesión
// larga heredaba en silencio la respuesta del primero, y (2) Claude no podía
// leerla, así que caía a `openspec/config.yaml` y arrancaba en estricto un
// cambio que en Pi se había declarado trivial. El manifiesto pide lo contrario
// en las dos: § 005 (el estado del cambio vive en disco) y § 003 (el puente
// entre runtimes es el disco, no la conversación).
//
// DOS FICHEROS, UN DUEÑO CADA UNO -> `preflight.json` guarda la postura de TDD,
// que es el hecho nuevo; el carril sigue en `lane.json`, que ya lo poseía. Este
// módulo los LEE juntos y no duplica ninguno: un segundo sitio que declare el
// carril sería justo la contradicción que § 009.7 marca como desviación.
//
// FAIL CLOSED -> ausente, ilegible o con un valor desconocido devuelve
// `undefined`: nadie lo ha decidido. Nunca un default disfrazado de decisión,
// porque quien lo consuma tiene que poder distinguir "se eligió off" de "no se
// eligió nada".
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
	inspectChangeLane,
	LANE_LABEL,
	laneSkips,
	writeChangeLane,
	type SddLane,
} from "./sdd-lane.ts";
import { isSafeChangeName, resolveActiveSelection, resolveChangesDir, selectedChange } from "./sdd-router.ts";
import type {
	PreflightAuthor,
	SddIntentRecord,
	SddIntentResolution,
	SddIntentRoute,
	SddIntentResolutionState,
	SddLaneOrigin,
} from "./sdd-intent-resolution.ts";

export type {
	PreflightAuthor,
	SddIntentRecord,
	SddIntentResolution,
	SddIntentRoute,
	SddLaneOrigin,
} from "./sdd-intent-resolution.ts";

/** La postura de TDD es binaria a nivel de cambio: se corrió el ciclo o no. */
export type TddStance = "off" | "strict";

export type SddPreflightRecord = Readonly<{
	tdd: TddStance;
	decidedBy: PreflightAuthor;
	/** ISO-8601. Sirve para explicar una postura vieja, no para caducarla. */
	decidedAt: string;
	/** Optional so every historical TDD-only record remains valid. */
	intent?: SddIntentRecord;
}>;

/** Lo que hay que saber de un cambio antes de trabajarlo. */
export type SddChangeStance = Readonly<{
	change: string;
	changeDir: string;
	/** `undefined` = nadie lo ha decidido todavía. */
	tdd: TddStance | undefined;
	decidedBy: PreflightAuthor | undefined;
	decidedAt: string | undefined;
	lane: SddLane;
	/** Provenance is absent only when no lane.json exists. */
	laneOrigin: SddLaneOrigin | undefined;
	/** Compatibility projection: true only for an authoritative declaration. */
	laneDeclared: boolean;
}>;

const STANCES: readonly TddStance[] = ["off", "strict"];
const AUTHORS: readonly PreflightAuthor[] = ["pi", "claude"];
const INTENT_RESOLUTIONS: readonly SddIntentResolution[] = ["confirmed", "automatic-small", "bypassed"];
const INTENT_ROUTES: readonly SddIntentRoute[] = ["normal", "small"];
const LANE_ORIGINS: readonly SddLaneOrigin[] = ["declared", "classified"];
const MATERIAL_KEY = /^sha256:[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeTddStance(value: unknown): TddStance | undefined {
	if (typeof value !== "string") return undefined;
	const token = value.trim().toLowerCase();
	return (STANCES as readonly string[]).includes(token) ? (token as TddStance) : undefined;
}

function normalizeAuthor(value: unknown): PreflightAuthor | undefined {
	if (typeof value !== "string") return undefined;
	const token = value.trim().toLowerCase();
	return (AUTHORS as readonly string[]).includes(token) ? (token as PreflightAuthor) : undefined;
}

function nonEmptyText(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyTextList(value: unknown, allowEmpty = false): value is string[] {
	return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(nonEmptyText);
}

function exactIsoDate(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try {
		return new Date(value).toISOString() === value;
	} catch {
		return false;
	}
}

function normalizeIntent(value: unknown): SddIntentRecord | undefined {
	if (!isRecord(value) || value.version !== 1) return undefined;
	const resolution = typeof value.resolution === "string" &&
		(INTENT_RESOLUTIONS as readonly string[]).includes(value.resolution)
		? value.resolution as SddIntentResolution
		: undefined;
	const route = typeof value.route === "string" &&
		(INTENT_ROUTES as readonly string[]).includes(value.route)
		? value.route as SddIntentRoute
		: undefined;
	const laneOrigin = typeof value.laneOrigin === "string" &&
		(LANE_ORIGINS as readonly string[]).includes(value.laneOrigin)
		? value.laneOrigin as SddLaneOrigin
		: undefined;
	const boundaries = isRecord(value.boundaries) ? value.boundaries : undefined;
	const resolvedBy = normalizeAuthor(value.resolvedBy);
	if (
		!resolution || !route || !laneOrigin || !nonEmptyText(value.summary) ||
		!nonEmptyText(value.objective) || !boundaries ||
		!nonEmptyTextList(boundaries.in, true) || !nonEmptyTextList(boundaries.out, true) ||
		(boundaries.in.length === 0 && boundaries.out.length === 0) ||
		!nonEmptyTextList(value.completionCriteria) ||
		typeof value.materialKey !== "string" || !MATERIAL_KEY.test(value.materialKey) ||
		!nonEmptyText(value.reason) || !resolvedBy || !exactIsoDate(value.resolvedAt) ||
		(resolution === "automatic-small" && route !== "small")
	) return undefined;
	return Object.freeze({
		version: 1,
		resolution,
		route,
		summary: value.summary,
		objective: value.objective,
		boundaries: Object.freeze({
			in: Object.freeze([...boundaries.in]),
			out: Object.freeze([...boundaries.out]),
		}),
		completionCriteria: Object.freeze([...value.completionCriteria]),
		materialKey: value.materialKey,
		laneOrigin,
		reason: value.reason,
		resolvedBy,
		resolvedAt: value.resolvedAt,
	});
}

export function preflightRecordPath(changeDir: string): string {
	return join(changeDir, "preflight.json");
}

/** Directorio de un cambio, con la misma raíz dual que usa el router. */
export function changeDirFor(cwd: string, change: string): string {
	return join(resolveChangesDir(cwd), change);
}

/**
 * El cambio activo, o `undefined`. Delega en el router: que "cuál es el cambio
 * activo" tenga una sola implementación es lo que impide que dos superficies
 * contesten distinto a la misma pregunta.
 */
export function resolveActiveChange(cwd: string): string | undefined {
	// Ante varios cambios abiertos no hay "el activo": devolver el primero era
	// contestar con el orden de `readdirSync` disfrazado de decisión.
	return selectedChange(resolveActiveSelection(cwd)) ?? undefined;
}

export function readPreflightRecord(changeDir: string): SddPreflightRecord | undefined {
	const path = preflightRecordPath(changeDir);
	if (!existsSync(path)) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
	if (!isRecord(parsed)) return undefined;
	const tdd = normalizeTddStance(parsed.tdd);
	if (!tdd) return undefined;
	const decidedAt = typeof parsed.decidedAt === "string" ? parsed.decidedAt : "";
	const intent = normalizeIntent(parsed.intent);
	return Object.freeze({
		tdd,
		decidedBy: normalizeAuthor(parsed.decidedBy) ?? "pi",
		decidedAt: Number.isNaN(Date.parse(decidedAt)) ? "" : decidedAt,
		...(intent ? { intent } : {}),
	});
}

export function writePreflightRecord(
	changeDir: string,
	input: { tdd: TddStance; decidedBy: PreflightAuthor; intent?: SddIntentRecord },
): SddPreflightRecord {
	const intent = input.intent ? normalizeIntent(input.intent) : undefined;
	if (input.intent && !intent) throw new TypeError("Invalid preflight intent record");
	const record: SddPreflightRecord = Object.freeze({
		tdd: input.tdd,
		decidedBy: input.decidedBy,
		decidedAt: new Date().toISOString(),
		...(intent ? { intent } : {}),
	});
	const path = preflightRecordPath(changeDir);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
	return record;
}

/**
 * Postura completa de un cambio. `undefined` cuando el cambio no existe o el
 * nombre no es seguro — leer fuera del directorio de cambios nunca es un error
 * recuperable, es una ruta que no se recorre.
 */
export function readChangeStance(cwd: string, change: string): SddChangeStance | undefined {
	if (!isSafeChangeName(change)) return undefined;
	const changeDir = changeDirFor(cwd, change);
	if (!existsSync(changeDir)) return undefined;
	const record = readPreflightRecord(changeDir);
	const laneState = inspectChangeLane(changeDir);
	const classifiedLane = record?.intent?.route === "small" ? "micro" : "standard";
	const laneOrigin: SddLaneOrigin | undefined = !laneState.exists
		? undefined
		: record?.intent?.laneOrigin === "classified" && laneState.valid && laneState.lane === classifiedLane
			? "classified"
			: "declared";
	return Object.freeze({
		change,
		changeDir,
		tdd: record?.tdd,
		decidedBy: record?.decidedBy,
		decidedAt: record?.decidedAt,
		lane: laneState.lane,
		laneOrigin,
		laneDeclared: laneOrigin === "declared",
	});
}

/** La postura del cambio activo, si hay uno. Atajo de las dos llamadas. */
export function readActiveChangeStance(cwd: string): SddChangeStance | undefined {
	const change = resolveActiveChange(cwd);
	return change ? readChangeStance(cwd, change) : undefined;
}

/**
 * Una línea para el status. Un TDD sin decidir se dibuja como tal: § 006 pide
 * que un estado desconocido se muestre como desconocido, no como su default.
 */
export function renderChangeStanceLine(stance: SddChangeStance | undefined): string {
	if (!stance) return "";
	const tdd = stance.tdd
		? `${stance.tdd}${stance.decidedBy ? ` (${stance.decidedBy})` : ""}`
		: "sin decidir";
	const lane = stance.laneOrigin === "declared"
		? stance.lane
		: stance.laneOrigin === "classified"
			? `${stance.lane} (clasificado)`
			: `${stance.lane} (por defecto)`;
	return `- Postura del cambio: TDD estricto=${tdd} · carril=${lane}`;
}

/**
 * Bloque inyectable para el runtime que va a trabajar el cambio. Vacío mientras
 * nadie haya decidido: sin decisión no hay nada que imponer, y el consumidor
 * debe caer a su regla de respaldo en vez de recibir una postura inventada.
 */
export function changeStanceDirective(stance: SddChangeStance | undefined): string {
	if (!stance?.tdd) return "";
	const lines = [`## SDD change stance (\`${stance.change}\`, authoritative)`];
	lines.push(
		stance.tdd === "strict"
			? "- Strict TDD: ON (forced) — follow RED → GREEN → TRIANGULATE → REFACTOR and record the evidence in `apply-progress.md`. This overrides `openspec/config.yaml` `strict_tdd`."
			: "- Strict TDD: OFF — do NOT run the RED/GREEN/TRIANGULATE/REFACTOR cycle; implement directly with minimal, focused changes. This overrides `openspec/config.yaml` `strict_tdd`. The independent `verify` phase still runs the real suite.",
	);
	if (stance.lane !== "standard") {
		const skipped = laneSkips(stance.lane).join(", ");
		lines.push(
			`- SDD lane: ${LANE_LABEL[stance.lane]} — this change skips ${skipped}. \`verify\` and \`close\` stay hard gates.`,
		);
	}
	lines.push(
		`- Decided by \`${stance.decidedBy ?? "pi"}\`${stance.decidedAt ? ` at ${stance.decidedAt}` : ""}. Do not re-ask the user; the decision is recorded in \`preflight.json\`.`,
	);
	return lines.join("\n");
}

export type SddIntentPersistenceResult =
	| Readonly<{ kind: "persisted"; record: SddPreflightRecord }>
	| Readonly<{ kind: "adopted"; record: SddPreflightRecord; intent: SddIntentRecord }>
	| Readonly<{ kind: "unpersisted"; reason: "missing-change" | "missing-tdd" }>;

export type SddPreflightStanceUpdate = Readonly<{
	tdd?: TddStance;
	declaredLane?: SddLane;
	author: PreflightAuthor;
	replaceTdd?: boolean;
}>;

export type SddPreflightStanceUpdateResult =
	| Readonly<{ kind: "updated"; record?: SddPreflightRecord }>
	| Readonly<{ kind: "tdd-conflict"; record: SddPreflightRecord }>;

/** Compatibility stance writes remain with the preflight record owner. */
export function updateSddPreflightStance(
	cwd: string,
	change: string,
	update: SddPreflightStanceUpdate,
): SddPreflightStanceUpdateResult {
	const changeDir = changeDirFor(cwd, change);
	if (!existsSync(changeDir)) return { kind: "updated" };
	const latest = readPreflightRecord(changeDir);
	if (update.tdd && latest?.tdd && !update.replaceTdd) {
		return { kind: "tdd-conflict", record: latest };
	}

	if (update.declaredLane) writeChangeLane(changeDir, update.declaredLane);
	const intent = latest?.intent && update.declaredLane
		? { ...latest.intent, laneOrigin: "declared" as const }
		: latest?.intent;
	if (!update.tdd && intent === latest?.intent) return { kind: "updated", record: latest };
	const tdd = update.tdd ?? latest?.tdd;
	const decidedBy = update.tdd ? update.author : latest?.decidedBy;
	if (!tdd || !decidedBy) return { kind: "updated", record: latest };

	return {
		kind: "updated",
		record: writePreflightRecord(changeDir, {
			tdd,
			decidedBy,
			...(intent ? { intent } : {}),
		}),
	};
}

/** Read-side projection consumed by the runtime-neutral intent coordinator. */
export function readSddIntentResolutionState(
	cwd: string,
	change: string,
): SddIntentResolutionState {
	const changeDir = changeDirFor(cwd, change);
	const intent = readPreflightRecord(changeDir)?.intent;
	const stance = readChangeStance(cwd, change);
	return {
		...(intent ? { intent } : {}),
		declaredLane: stance?.laneDeclared ? stance.lane : null,
	};
}

/**
 * Sole durable owner for intent resolution. It rereads immediately before the
 * write: a resolution that appeared since observation is adopted, never lost.
 */
export function persistSddIntentResolution(
	cwd: string,
	change: string,
	intent: SddIntentRecord,
	observedMaterialKey: string | undefined,
): SddIntentPersistenceResult {
	const changeDir = changeDirFor(cwd, change);
	if (!existsSync(changeDir)) return { kind: "unpersisted", reason: "missing-change" };
	const latest = readPreflightRecord(changeDir);
	if (!latest) return { kind: "unpersisted", reason: "missing-tdd" };
	if (latest.intent) {
		if (latest.intent.materialKey === intent.materialKey) {
			return { kind: "adopted", record: latest, intent: latest.intent };
		}
		if (observedMaterialKey === undefined || latest.intent.materialKey !== observedMaterialKey) {
			return { kind: "adopted", record: latest, intent: latest.intent };
		}
	}

	const lane = inspectChangeLane(changeDir);
	const previousClassifiedLane = latest.intent?.laneOrigin === "classified" &&
		lane.valid && lane.lane === (latest.intent.route === "small" ? "micro" : "standard");
	const laneIsDeclared = lane.exists && !previousClassifiedLane;
	const effectiveIntent: SddIntentRecord = laneIsDeclared
		? { ...intent, laneOrigin: "declared" }
		: intent;
	const record = writePreflightRecord(changeDir, {
		tdd: latest.tdd,
		decidedBy: latest.decidedBy,
		intent: effectiveIntent,
	});
	const classifiedLane = effectiveIntent.route === "small" ? "micro" : "standard";
	if (
		effectiveIntent.laneOrigin === "classified" &&
		(!lane.exists || (previousClassifiedLane && lane.lane !== classifiedLane))
	) {
		writeChangeLane(changeDir, classifiedLane);
	}
	return { kind: "persisted", record };
}
