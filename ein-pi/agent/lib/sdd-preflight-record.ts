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
	LANE_LABEL,
	laneConfigPath,
	laneSkips,
	readChangeLane,
	type SddLane,
} from "./sdd-lane.ts";
import { isSafeChangeName, resolveActiveSelection, resolveChangesDir, selectedChange } from "./sdd-router.ts";

/** La postura de TDD es binaria a nivel de cambio: se corrió el ciclo o no. */
export type TddStance = "off" | "strict";

/** Qué runtime tomó la decisión. Se guarda para que el status pueda decirlo. */
export type PreflightAuthor = "pi" | "claude";

export type SddPreflightRecord = Readonly<{
	tdd: TddStance;
	decidedBy: PreflightAuthor;
	/** ISO-8601. Sirve para explicar una postura vieja, no para caducarla. */
	decidedAt: string;
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
	/** ¿El carril está DECLARADO, o es solo el `standard` por defecto? */
	laneDeclared: boolean;
}>;

const STANCES: readonly TddStance[] = ["off", "strict"];
const AUTHORS: readonly PreflightAuthor[] = ["pi", "claude"];

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
	return Object.freeze({
		tdd,
		decidedBy: normalizeAuthor(parsed.decidedBy) ?? "pi",
		decidedAt: Number.isNaN(Date.parse(decidedAt)) ? "" : decidedAt,
	});
}

export function writePreflightRecord(
	changeDir: string,
	input: { tdd: TddStance; decidedBy: PreflightAuthor },
): SddPreflightRecord {
	const record: SddPreflightRecord = Object.freeze({
		tdd: input.tdd,
		decidedBy: input.decidedBy,
		decidedAt: new Date().toISOString(),
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
	return Object.freeze({
		change,
		changeDir,
		tdd: record?.tdd,
		decidedBy: record?.decidedBy,
		decidedAt: record?.decidedAt,
		lane: readChangeLane(changeDir),
		laneDeclared: existsSync(laneConfigPath(changeDir)),
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
	const lane = stance.laneDeclared ? stance.lane : `${stance.lane} (por defecto)`;
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
