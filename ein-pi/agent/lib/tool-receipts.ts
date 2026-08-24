// =============================================================================
// [CORE] RECIBOS DE HERRAMIENTA — LO QUE LEE UNA PERSONA
//
// POR QUÉ -> el texto que devuelve una tool tiene DOS PÚBLICOS confundidos en
// uno: el modelo, que necesita los hechos para enrutar, y el humano, que
// necesita saber qué acaba de pasar. Pi permite separarlos sin perder nada: el
// `content` sigue yendo ÍNTEGRO al modelo y `renderResult` decide qué se pinta.
//
// Dos niveles, una sola voz:
//   line   -> una frase corta, siempre visible.
//   detail -> el bloque del expandido. TAMPOCO es el volcado técnico: antes el
//             humano elegía entre no ver nada o ver JSON.
//
// Reglas de voz, fijadas en tests y no a gusto: castellano llano, cero
// identificadores de código, el número con su unidad en palabras, la
// consecuencia antes que el dato, y el siguiente paso cuando lo hay.
//
// FAIL CLOSED -> un `details` con otra forma produce "no se pudo leer el
// resultado", nunca una frase inventada. Ningún recibo lanza.
//
// Módulo PURO: entra el `details` de la tool, sale texto. Sin Pi, sin UI.
// =============================================================================

import { GLYPH } from "./chrome.ts";

export type ToolReceipt = Readonly<{
	/** Siempre visible. Máximo 60 caracteres: convive con otras líneas a 80 columnas. */
	line: string;
	detail: readonly string[];
	/** true -> se pinta como problema y no como trámite. */
	bad: boolean;
}>;

export const TOOL_LABELS: Readonly<Record<string, string>> = {
	ein_sdd_status: "Estado",
	ein_sdd_check: "Revisión del plan",
	ein_sdd_preflight: "Cómo se trabaja este cambio",
	ein_sdd_lane: "Carril",
	ein_sdd_close: "Cierre",
	ein_sdd_participants: "Participantes",
	ein_openspec_sync: "Contratos",
	ein_openspec_delta_write: "Cambio de contrato",
	ein_review_forecast: "Tamaño de la PR",
	ein_cleaner_audit: "Auditoría del código",
	ein_cleaner_evidence: "Evidencia del código",
	ein_cleaner_active_evidence: "Evidencia en caliente",
	ein_cleaner_improve_admit: "Mejora propuesta",
	ein_cleaner_improve_apply: "Mejora aplicada",
	ein_cleaner_improve_complete: "Mejora verificada",
	ein_architect_evidence: "Lectura de arquitectura",
	ein_architect_plan_bind: "Plan de arquitectura",
	ein_architect_validate: "Validación de arquitectura",
};

// ─── Cocina común ────────────────────────────────────────────────────────────

const PHASE_ES: Readonly<Record<string, string>> = {
	scope: "alcance",
	map: "mapa",
	design: "diseño",
	tasks: "tareas",
	apply: "aplicar",
	verify: "verificar",
	close: "cierre",
};

const AGENT_ES: Readonly<Record<string, string>> = {
	"ein-cleaner": "el limpiador",
	"ein-architect": "el arquitecto",
};

function meta(parts: readonly string[]): string {
	return parts.filter((part) => part.length > 0).join(` ${GLYPH.sep} `);
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function list(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

/** CORTE -> la forma no es la esperada: se dice, no se adivina. */
function unreadable(): ToolReceipt {
	return {
		line: "no se pudo leer el resultado",
		detail: [
			"La herramienta respondió con una forma que este resumen no reconoce.",
			"El resultado completo sí llegó al modelo, así que el trabajo sigue.",
		],
		bad: true,
	};
}

function receipt(line: string, detail: readonly string[], bad = false): ToolReceipt {
	return { line, detail, bad };
}

// ─── Un recibo por herramienta ───────────────────────────────────────────────

function statusReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !isRecord(details.status)) return unreadable();
	const status = details.status;
	const change = str(status.change);
	if (!change) {
		return receipt("sin cambio activo", [
			"No hay ningún cambio abierto ahora mismo.",
			"El siguiente paso sería abrir uno con su alcance.",
		]);
	}

	const tasks = isRecord(status.tasks) ? status.tasks : {};
	const total = list(tasks.items).length;
	const done = isRecord(tasks.counts) ? (num(tasks.counts.done) ?? 0) : 0;
	const blockers = list(status.blocked).length;
	const phase = PHASE_ES[String(status.nextRecommended)] ?? String(status.nextRecommended);

	const parts = [`siguiente: ${phase}`];
	if (total > 0) parts.push(`${done} de ${total} tareas`);
	if (blockers > 0) parts.push(plural(blockers, "bloqueo", "bloqueos"));

	const detail = [`El cambio «${change}» va por la fase de ${phase}.`];
	if (total > 0) detail.push(`Lleva ${done} de ${total} tareas hechas.`);
	if (blockers > 0) detail.push(`Hay ${plural(blockers, "cosa que lo bloquea", "cosas que lo bloquean")}: hasta resolverlas no avanza.`);
	else detail.push("Nada lo bloquea.");

	return receipt(meta(parts), detail, blockers > 0);
}

function checkReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || num(details.errors) === null) return unreadable();
	const errors = num(details.errors) ?? 0;
	const warnings = num(details.warnings) ?? 0;

	if (errors > 0) {
		const parts = [plural(errors, "error", "errores")];
		if (warnings > 0) parts.push(plural(warnings, "aviso", "avisos"));
		return receipt(meta(parts), [
			"El plan del cambio no pasa la revisión.",
			`Hay ${plural(errors, "cosa que hay que corregir", "cosas que hay que corregir")} antes de seguir.`,
		], true);
	}

	const present = list(details.phases).filter((entry) => isRecord(entry) && entry.present === true).length;
	const line = warnings > 0
		? meta([`${plural(present, "fase revisada", "fases revisadas")}`, plural(warnings, "aviso", "avisos")])
		: `${plural(present, "fase revisada", "fases revisadas")}, sin problemas`;
	const detail = [`Los documentos del cambio están completos en ${plural(present, "fase", "fases")}.`];
	if (warnings > 0) detail.push("Hay avisos: no bloquean, pero conviene mirarlos.");
	return receipt(line, detail);
}

function preflightReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !str(details.lane)) return unreadable();
	const lane = details.lane === "micro" ? "versión corta" : "siete fases";
	const tdd = details.tdd === "strict" ? "pruebas primero" : details.tdd === "off" ? "sin pruebas primero" : "sin decidir";

	const detail = [
		details.tdd === "strict"
			? "Se escribe una prueba que falla antes de tocar el código."
			: details.tdd === "off"
				? "El código va primero y las pruebas después."
				: "Todavía nadie ha decidido si las pruebas van primero.",
		details.lane === "micro"
			? "El cambio va por el camino corto: se saltan el mapa y la lista de tareas."
			: "El cambio recorre las siete fases completas.",
	];
	return receipt(meta([tdd, lane]), detail, details.tdd == null);
}

function laneReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !str(details.lane)) return unreadable();
	const skipped = list(details.skipped).length;
	if (details.lane === "micro") {
		return receipt(`versión corta ${GLYPH.sep} se saltan ${plural(skipped, "fase", "fases")}`, [
			"El cambio va por el camino corto.",
			"Verificar y cerrar siguen siendo obligatorios: eso no se salta nunca.",
		]);
	}
	return receipt("siete fases", ["El cambio recorre el camino completo, sin saltarse ninguna fase."]);
}

function closeReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || typeof details.ok !== "boolean") return unreadable();
	if (details.ok) {
		return receipt("cambio archivado", [
			"El cambio queda cerrado y guardado con todos sus documentos.",
			"A partir de aquí forma parte del historial, no del trabajo en curso.",
		]);
	}
	const reason = str(details.reason) ?? "no se dijo el motivo";
	return receipt(`no se pudo cerrar: ${reason}`.slice(0, 60), [
		"El cierre se ha detenido y el cambio sigue abierto.",
		`Motivo: ${reason}.`,
		"Hay que resolver eso y volver a intentarlo.",
	], true);
}

function participantsReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !str(details.status)) return unreadable();
	const status = String(details.status);

	if (status === "blocked") {
		const blocker = str(details.blocker) ?? "falta información";
		return receipt("revisión bloqueada", [
			"Nadie puede revisar el trabajo todavía.",
			`Motivo: ${blocker}.`,
		], true);
	}
	if (status === "unavailable") {
		return receipt("sin revisores disponibles", ["Esta vez no hay nadie que revise después de aplicar."]);
	}
	if (status === "complete") {
		return receipt("revisión terminada", ["Los revisores ya han pasado por el trabajo."]);
	}

	const next = isRecord(details.next) ? AGENT_ES[String(details.next.agent)] ?? null : null;
	if (!next) return receipt("revisión preparada", ["Hay revisión preparada para después de aplicar."]);
	return receipt(`después de aplicar revisa ${next}`, [
		`Cuando termine de aplicarse el cambio, ${next} lo revisa.`,
		`Tiene ${plural(list(details.slices).length, "trozo", "trozos")} de trabajo asignados.`,
	]);
}

function syncReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !str(details.state)) return unreadable();
	if (details.state === "conflict") {
		return receipt("conflicto en los contratos", [
			"Dos versiones del mismo contrato no coinciden.",
			"Hay que resolverlo a mano antes de cerrar el cambio.",
		], true);
	}
	const domains = list(details.domains).length;
	if (details.changed !== true || domains === 0) {
		return receipt("los contratos ya estaban al día", ["No hizo falta cambiar nada: ya coincidían."]);
	}
	return receipt(`${plural(domains, "contrato actualizado", "contratos actualizados")}`, [
		`Se ha puesto al día ${plural(domains, "contrato", "contratos")} con lo que hace ahora el código.`,
	]);
}

function deltaWriteReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || num(details.operations) === null) return unreadable();
	const operations = num(details.operations) ?? 0;
	const domain = str(details.domain) ?? "un contrato";
	return receipt(`${plural(operations, "escenario escrito", "escenarios escritos")}`, [
		`Se ha escrito lo que este cambio altera del contrato «${domain}».`,
		"Es la parte del comportamiento que queda comprometida por escrito.",
	]);
}

function forecastReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || num(details.production) === null) return unreadable();
	if (details.ok !== true) {
		return receipt("no se pudo medir el tamaño", ["No se ha podido leer el estado del repositorio para medir el cambio."], true);
	}
	const production = num(details.production) ?? 0;
	const tests = num(details.tests) ?? 0;
	const budget = num(details.budget) ?? 0;
	const over = details.overBudget === true;

	const line = `${plural(production, "línea", "líneas")} de producción, ${over ? "se pasa del presupuesto" : "dentro del presupuesto"}`;
	const detail = [
		`El cambio toca ${plural(production, "línea", "líneas")} de código de producción.`,
		`Las ${plural(tests, "línea", "líneas")} de pruebas no cuentan para el presupuesto.`,
		over
			? `El límite para una sola revisión es de ${budget}, así que conviene partir el trabajo en varias.`
			: `El límite para una sola revisión es de ${budget}, así que cabe entera.`,
	];
	return receipt(line, detail, over);
}

function cleanerAuditReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !Array.isArray(details.assessments)) return unreadable();
	const assessments = details.assessments;
	if (assessments.length === 0) {
		return receipt("sin hallazgos", ["Se ha mirado el código y no hay nada que corregir."]);
	}
	const blocking = assessments.filter(
		(entry) => isRecord(entry) && isRecord(entry.evaluation) && entry.evaluation.severity === "error",
	).length;

	const line = blocking > 0
		? `${plural(assessments.length, "hallazgo", "hallazgos")}, ${blocking === 1 ? "1 bloquea" : `${blocking} bloquean`}`
		: `${plural(assessments.length, "hallazgo", "hallazgos")}, ninguno bloquea`;
	const detail = [
		`La revisión del código ha encontrado ${plural(assessments.length, "cosa", "cosas")}.`,
		blocking > 0
			? `${plural(blocking, "es grave", "son graves")} y conviene arreglarlas antes de seguir.`
			: "Ninguna es grave: se pueden anotar y seguir.",
	];
	return receipt(line, detail, blocking > 0);
}

function cleanerEvidenceReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !str(details.areaId)) return unreadable();
	return receipt("medidas tomadas del código", [
		"Se han recogido las medidas del área que toca este cambio.",
		"Son datos calculados, no opiniones del modelo.",
	]);
}

function cleanerActiveEvidenceReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !str(details.areaId)) return unreadable();
	return receipt("medidas de pruebas y cobertura", [
		"Se ha preparado o leído la medición de pruebas del área.",
		"Sirve para saber qué parte del código está realmente cubierta.",
	]);
}

function improveAdmitReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !str(details.status)) return unreadable();
	if (details.status === "admitted") {
		return receipt("mejora admitida", [
			"La mejora propuesta cumple los límites y puede aplicarse.",
			"Solo puede tocar el trozo declarado, nada más.",
		]);
	}
	return receipt("mejora rechazada", [
		"La mejora no cumple los límites y no se va a aplicar.",
		"Es el comportamiento correcto: ante la duda, no se toca el código.",
	], true);
}

function improveApplyReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !str(details.status)) return unreadable();
	if (details.status === "verification-required") {
		return receipt("mejora aplicada, falta verificarla", [
			"El cambio ya está escrito en el fichero.",
			"Todavía no cuenta como bueno: hace falta comprobar que nada se rompió.",
		]);
	}
	if (details.status === "blocked") {
		return receipt("mejora no aplicada", ["No se ha tocado el código: la mejora no pasó los límites."], true);
	}
	return receipt("resultado de la mejora incierto", [
		"No se puede afirmar que el fichero quedara como debía.",
		"Ante la duda se marca como incierto en vez de darlo por bueno.",
	], true);
}

function improveCompleteReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !str(details.status)) return unreadable();
	if (details.status === "complete") {
		return receipt("mejora verificada", [
			"La mejora está aplicada y comprobada.",
			"Se ha verificado que no rompió nada.",
		]);
	}
	return receipt("mejora aplicada, falta verificarla", [
		"El cambio está escrito pero aún no se ha podido dar por bueno.",
		"Hasta que la comprobación pase, no cuenta como terminado.",
	], true);
}

function architectEvidenceReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !isRecord(details.repository)) return unreadable();
	const files = num(details.repository.files) ?? list(details.files).length;
	const modules = list(details.modules).length;
	return receipt(`${plural(files, "fichero leído", "ficheros leídos")}, ${plural(modules, "módulo", "módulos")}`, [
		`Se ha leído el código de ${plural(files, "fichero", "ficheros")} para entender cómo está montado.`,
		"Es una lectura: no se ha modificado nada.",
	]);
}

function architectPlanBindReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || !isRecord(details.binding)) return unreadable();
	return receipt("plan atado a lo que se leyó", [
		"El plan queda ligado a la lectura del código que lo justifica.",
		"Si el código cambia, el plan deja de valer y hay que rehacerlo.",
	]);
}

function architectValidateReceipt(details: unknown): ToolReceipt {
	if (!isRecord(details) || typeof details.valid !== "boolean") return unreadable();
	if (details.valid) {
		return receipt("plan válido", ["El plan encaja con el código que se leyó."]);
	}
	return receipt("plan no válido", [
		"El plan no encaja con el código que se leyó.",
		"Aplicarlo tal cual daría un resultado que nadie ha comprobado.",
	], true);
}

// ─── Registro ────────────────────────────────────────────────────────────────

export const TOOL_RECEIPTS: Readonly<Record<string, (details: unknown) => ToolReceipt>> = {
	ein_sdd_status: statusReceipt,
	ein_sdd_check: checkReceipt,
	ein_sdd_preflight: preflightReceipt,
	ein_sdd_lane: laneReceipt,
	ein_sdd_close: closeReceipt,
	ein_sdd_participants: participantsReceipt,
	ein_openspec_sync: syncReceipt,
	ein_openspec_delta_write: deltaWriteReceipt,
	ein_review_forecast: forecastReceipt,
	ein_cleaner_audit: cleanerAuditReceipt,
	ein_cleaner_evidence: cleanerEvidenceReceipt,
	ein_cleaner_active_evidence: cleanerActiveEvidenceReceipt,
	ein_cleaner_improve_admit: improveAdmitReceipt,
	ein_cleaner_improve_apply: improveApplyReceipt,
	ein_cleaner_improve_complete: improveCompleteReceipt,
	ein_architect_evidence: architectEvidenceReceipt,
	ein_architect_plan_bind: architectPlanBindReceipt,
	ein_architect_validate: architectValidateReceipt,
};

/**
 * [CORE] RECIBO DE UNA HERRAMIENTA
 * ---------------------------------------------------------
 * BLINDAJE -> una herramienta desconocida o un fallo al redactar devuelven el
 * recibo de "no se pudo leer", nunca una excepción: esto corre dentro del
 * pintado de la interfaz.
 */
export function receiptFor(tool: string, details: unknown): ToolReceipt {
	const write = TOOL_RECEIPTS[tool];
	if (!write) return unreadable();
	try {
		return write(details);
	} catch {
		return unreadable();
	}
}
