// REGLA (leer antes de añadir un consumidor de `tool_result` de subagente):
//
// Todo código que derive estado a partir del payload de un evento
// `pi.on("tool_result")` disparado por una delegación a subagente (`event.content`
// / `event.details`) MUST estar declarado en `ENVELOPE_CONSUMER_INVENTORY`, con su
// modo de fallo si el lanzamiento va a background sin que nadie lo observe:
//
//   silent-incorrect-state — el sistema queda en un estado falso y nadie se
//     entera (MUST forzar una protección: `ensureParticipantForeground` o
//     equivalente).
//   loud-wasteful          — falla ruidosamente, pero el trabajo ya se pagó
//     (SHOULD forzar foreground).
//   safe-degradation       — no dispara; otra puerta (evidencia en disco, UI)
//     da el veredicto real (MAY quedarse sin protección, pero debe declararse).
//
// `tests/subagent-envelope-contract.test.ts` audita el handler real
// (`ein-pi/agent/extensions/internal/ein-delegation-results.ts`,
// `pi.on("tool_result")`) contra este
// inventario: un consumidor no declarado, o una protección declarada que
// desaparece de la fuente, pone el test en rojo. Añadir un consumidor sin
// editar este fichero no compila el guardarraíl — ese es el punto.
//
// ESPECÍFICO DE PI (R4, `openspec/specs/surface-wiring/spec.md`): esta regla
// existe porque Pi intercepta resultados de subagente vía `pi.on("tool_result")`.
// Claude no tiene ese hook (los hooks generados son
// `PreToolUse`/`PostToolUse`/`SessionStart`/…, ninguno de resultado de subagente
// — `ein-cc/sync.ts:518-537`); no hay nada que auditar ahí, y no se finge
// paridad.
//
// LO QUE ESTE MÓDULO NO CUBRE (`// 007`, no vender cobertura que no existe):
// no previene "el tercer consumidor" en general. Previene dos cosas concretas:
// (a) un consumidor nuevo, no declarado, sobre la superficie `pi.on("tool_result")`
// de `ein-delegation-results.ts`; (b) una protección declarada que desaparece
// de la fuente. Es
// mundo cerrado sobre un único handler: un consumidor cableado por otra vía (otro
// hook, o que reciba el texto del envelope indirectamente) se escapa.
//
// CONDICIÓN DE RETIRADA: cuando `ENVELOPE_CONSUMER_INVENTORY` quede vacío —
// ningún código deriva estado de un payload de `tool_result` — este módulo, su
// test y esta nota se borran juntos.

export type EnvelopeFailureMode = "silent-incorrect-state" | "loud-wasteful" | "safe-degradation";

export type EnvelopeProtection = "foreground-forced" | "scout-launch-normalized" | "none";

export interface EnvelopeConsumerEntry {
	readonly failureMode: EnvelopeFailureMode;
	readonly protection: EnvelopeProtection;
	readonly note: string;
}

// Inventario declarado de los cuatro consumidores reales de
// `ein-delegation-results.ts`. `ein-continuity.ts:81` queda fuera con criterio:
// solo lee
// `event.isError` para tools mutadoras, nunca deriva estado del payload de un
// subagente.
export const ENVELOPE_CONSUMER_INVENTORY: Readonly<Record<string, EnvelopeConsumerEntry>> = {
	completeSddParticipantCall: {
		failureMode: "silent-incorrect-state",
		protection: "foreground-forced",
		note: "sin payload terminal el pasaje de participante no avanza y sdd-verify queda inalcanzable",
	},
	acceptTrackedScoutResult: {
		failureMode: "safe-degradation",
		protection: "scout-launch-normalized",
		note: "una cita irrecuperable descarta esa cita, no el reporte; en fan-out, una rama caída no arrastra a sus hermanas",
	},
	participantResultIsUnrecognized: {
		failureMode: "safe-degradation",
		protection: "none",
		note: "canario de deriva, solo avisa por UI",
	},
	originalError: {
		failureMode: "safe-degradation",
		protection: "none",
		note: "reconciliación de fallo de fase; el veredicto real lo da ein_sdd_check sobre el artefacto en disco",
	},
};

export interface EnvelopeContractSources {
	readonly sddPreflight: string;
	readonly scoutContract: string;
}

// Palabras reservadas que el escaneo de llamadas debe ignorar: `if(...)` puede
// contener `event.details` en una llamada anidada dentro de su condición, sin
// que `if` en sí sea un consumidor.
const CONTROL_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "return", "typeof"]);

/** Extrae el cuerpo (con llaves) del callback de `pi.on("tool_result", ...)`. */
export function extractToolResultHandlerBody(source: string): string {
	const marker = 'pi.on("tool_result"';
	const markerIndex = source.indexOf(marker);
	if (markerIndex === -1) {
		throw new Error('subagent-envelope-contract: no se encontró pi.on("tool_result" en la fuente dada');
	}
	const arrowIndex = source.indexOf("=>", markerIndex);
	const braceStart = arrowIndex === -1 ? -1 : source.indexOf("{", arrowIndex);
	if (braceStart === -1) {
		throw new Error('subagent-envelope-contract: no se pudo delimitar el cuerpo de pi.on("tool_result", ...)');
	}
	let depth = 0;
	for (let i = braceStart; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) return source.slice(braceStart, i + 1);
		}
	}
	throw new Error('subagent-envelope-contract: llave sin cerrar en el cuerpo de pi.on("tool_result", ...)');
}

/**
 * Detecta, dentro del cuerpo de un handler `tool_result`, el conjunto de
 * identificadores que derivan estado de `event.content` / `event.details`.
 *
 * Dos formas:
 *   1. Llamada de función con `event.content`/`event.details` entre sus
 *      argumentos (balanceo de paréntesis, no una regex ingenua de un nivel):
 *      el id es el nombre de la función.
 *   2. Acceso directo como receptor (`event.content.map(...)`), no como
 *      argumento de una llamada: el id es el nombre de la variable a la que se
 *      asigna (`const originalError = event.content...`).
 */
export function findEnvelopeConsumers(handlerBody: string): Set<string> {
	const consumers = new Set<string>();

	const callRegex = /([A-Za-z_$][\w$]*)\(/g;
	let match: RegExpExecArray | null = callRegex.exec(handlerBody);
	while (match !== null) {
		const name = match[1];
		if (!CONTROL_KEYWORDS.has(name)) {
			const openIndex = match.index + name.length;
			let depth = 0;
			let closeIndex = -1;
			for (let i = openIndex; i < handlerBody.length; i++) {
				if (handlerBody[i] === "(") depth++;
				else if (handlerBody[i] === ")") {
					depth--;
					if (depth === 0) {
						closeIndex = i;
						break;
					}
				}
			}
			if (closeIndex !== -1) {
				const args = handlerBody.slice(openIndex + 1, closeIndex);
				if (/event\.(content|details)\b/.test(args)) consumers.add(name);
			}
		}
		match = callRegex.exec(handlerBody);
	}

	const receiverRegex = /const\s+([A-Za-z_$][\w$]*)\s*=\s*event\.(?:content|details)\b/g;
	match = receiverRegex.exec(handlerBody);
	while (match !== null) {
		consumers.add(match[1]);
		match = receiverRegex.exec(handlerBody);
	}

	return consumers;
}

/** Extrae el cuerpo (con llaves) de una `function nombre(...) { ... }` con nombre exacto. */
export function extractNamedFunctionBody(source: string, functionName: string): string {
	const signature = new RegExp(`function\\s+${functionName}\\s*\\(`);
	const match = signature.exec(source);
	if (!match) return "";
	const braceStart = source.indexOf("{", match.index);
	if (braceStart === -1) return "";
	let depth = 0;
	for (let i = braceStart; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) return source.slice(braceStart, i + 1);
		}
	}
	return "";
}

const PROTECTION_CHECKS: Record<Exclude<EnvelopeProtection, "none">, (sources: EnvelopeContractSources) => boolean> = {
	"foreground-forced": (sources) => {
		const body = extractNamedFunctionBody(sources.sddPreflight, "ensureParticipantForeground");
		return body.includes("input.async = false") && body.includes("input.foregroundOnly = true");
	},
	"scout-launch-normalized": (sources) => {
		const body = extractNamedFunctionBody(sources.scoutContract, "normalizeScoutLaunch");
		return (body.match(/async:\s*false/g) ?? []).length >= 2;
	},
};

export interface EnvelopeAuditFinding {
	readonly consumer: string;
	readonly reason: string;
}

export interface EnvelopeAuditResult {
	readonly ok: boolean;
	readonly findings: readonly EnvelopeAuditFinding[];
}

/**
 * R2: un consumidor `silent-incorrect-state` MUST declarar una protección
 * distinta de `none`, y esa protección MUST estar presente en la fuente dada.
 */
export function auditEnvelopeConsumers(inventory: Readonly<Record<string, EnvelopeConsumerEntry>>, sources: EnvelopeContractSources): EnvelopeAuditResult {
	const findings: EnvelopeAuditFinding[] = [];
	for (const [name, entry] of Object.entries(inventory)) {
		if (entry.failureMode !== "silent-incorrect-state") continue;
		if (entry.protection === "none") {
			findings.push({ consumer: name, reason: "clasificado silent-incorrect-state pero declara protección none (R2)" });
			continue;
		}
		const check = PROTECTION_CHECKS[entry.protection];
		if (!check(sources)) {
			findings.push({ consumer: name, reason: `protección declarada "${entry.protection}" no encontrada en la fuente (R2)` });
		}
	}
	return { ok: findings.length === 0, findings };
}
