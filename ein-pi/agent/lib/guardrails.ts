// =============================================================================
// GUARDRAILS
// Política de seguridad de Ein para comandos bash: patrones denegados
// (destructivos, sin apelación) y patrones que exigen confirmación
// interactiva del usuario antes de ejecutarse.
//
// Los subagentes corren headless (sin UI), así que la confirmación de un
// push delegado ocurre en la sesión padre al llamar al tool `subagent`:
// el usuario aprueba ahí y se emite un grant (TTL corto, scope por cwd, usos
// acotados) que el guard headless consume al ejecutar el push real.
//
// Que la delegación SEA una entrega se decide por el agente destino, no por la
// redacción de la task: ein-git existe para entregar. La prosa quedó como red
// secundaria para un push escondido en otro agente.
// =============================================================================

import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
	ExtensionContext,
	ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import {
	collectDelegationAgentNames,
	collectDelegationTaskTexts,
} from "./delegation-shape.ts";
import type { GitDeliveryMode } from "./git-delivery.ts";
import { stripNegatedDelivery } from "./git-delivery.ts";
import { pick } from "./lang.ts";

const DENIED_BASH_PATTERNS: RegExp[] = [
	/\brm\s+-rf\s+(?:\/|~|\$HOME|\.\.?)(?:\s|$)/,
	/\bgit\s+reset\s+--hard\b/,
	/\bgit\s+clean\b(?=[^\n]*(?:-[^\n]*f|--force))(?=[^\n]*(?:-[^\n]*d|--directories))/,
	/\bgit\s+push\b(?=[^\n]*\s--force(?:-with-lease)?\b)/,
	/\bchmod\s+-R\s+777\b/,
	/\bchown\s+-R\b/,
];

const CONFIRM_BASH_PATTERNS: RegExp[] = [
	/\bgit\s+push\b/,
	/\bgit\s+rebase\b/,
	/\bgit\s+branch\s+-D\b/,
	/\bnpm\s+publish\b/,
	/\bpi\s+remove\b/,
];

// Agentes cuya RAZÓN DE SER es la entrega. Delegarles algo ES una entrega: no
// hay que deducirlo de la prosa. Antes el gate solo miraba el texto de la task
// y fallaba-cerrado por un adjetivo — "push the branch" acuñaba el grant y
// "push current branch" no, con el mismo significado. El resultado era un
// callejón sin salida: ein-git headless bloqueado y el padre sin forma de
// arreglarlo salvo adivinar otra redacción.
const DELIVERY_AGENTS = new Set(["ein-git"]);

// Sustantivo de entrega, opcionalmente precedido de determinante y adjetivos
// ("the branch", "current branch", "the already-created local commit"). El
// límite de 3 palabras evita cruzar media frase.
const DELIVERY_OBJECT =
	"(?:[\\w'-]+\\s+){0,3}(?:branch|rama|commits?|changes?|cambios|tags?|it|todo|everything)";

// Frases (en la task de delegación, lenguaje natural) que implican que el
// subagente acabará ejecutando un comando guardado tipo `git push`. Es la RED
// SECUNDARIA: cubre un push escondido en un agente que no sea de entrega (p. ej.
// `sdd-apply` con bash). Para los agentes de entrega decide DELIVERY_AGENTS.
// "push" a secas sigue sin bastar: emitir un grant ante "implementa push
// notifications" abriría una ventana en la que cualquier `git push` headless
// pasaría sin confirmación.
const DELEGATED_DELIVERY_PATTERNS: RegExp[] = [
	/\bgit\s+push\b/i,
	/\bpush(?:ea|éa|ealo|éalo|ear)\b/i,
	/\bhaz\s+(?:el\s+|un\s+)?push\b/i,
	new RegExp(`\\bpush\\s+${DELIVERY_OBJECT}\\b`, "i"),
	/\bpush\s+(?:to|a|hacia)\s+(?:origin|remote|remoto|github|upstream|main|master)\b/i,
	/\b(?:branch|rama|commits?|cambios)\b[^.,;\n]{0,30}?\bpush\b/i,
	/^\s*(?:git\s+)?push\s*[!.]*\s*$/i,
	/\bsube\s+(?:la\s+)?rama\b/i,
	// "publica" a secas NO: en una task puede ser "publica la documentación", y
	// el grant también abre `npm publish`. Se exige objeto de entrega.
	new RegExp(`\\bpublica(?:lo|los)?\\s+${DELIVERY_OBJECT}\\b`, "i"),
	/\babre\s+(?:un\s+|el\s+|la\s+)?(?:pr|pull\s+request)\b/i,
	/\bopen\s+(?:a\s+|the\s+)?(?:pr|pull\s+request)\b/i,
	/\b(?:update|actualiza)\s+(?:existing\s+|el\s+)?(?:pr|pull\s+request)\b/i,
];

// TTL corto a propósito: cubre el arranque del subagente y poco más.
const DELIVERY_GRANT_TTL_MS = 10 * 60 * 1000;

function einConfigHome(): string {
	return process.env.EIN_PI_CONFIG_HOME ?? join(homedir(), ".pi", "ein");
}

export function deliveryGrantPath(): string {
	return join(einConfigHome(), "delivery-grant.json");
}

// Usos por grant. Una entrega real puede ejecutar más de un comando guardado en
// el MISMO run (push de rama + push de tags en una release), y el subagente
// puede reintentar tras un fallo transitorio. Con un único uso, el segundo
// comando legítimo moría bloqueado. Acotado y con TTL: no es una ventana
// abierta, son los intentos de un encargo ya autorizado.
const DELIVERY_GRANT_MAX_USES = 3;

export function grantDelegatedDelivery(cwd: string): void {
	const path = deliveryGrantPath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		`${JSON.stringify({
			cwd,
			expiresAt: Date.now() + DELIVERY_GRANT_TTL_MS,
			remainingUses: DELIVERY_GRANT_MAX_USES,
		})}\n`,
	);
}

// Consume un uso. El grant se BORRA al agotarse, caducar o venir corrupto —
// nunca sobrevive inválido. Mientras le queden usos dentro del TTL, se
// reescribe con uno menos.
export function consumeDelegatedDelivery(cwd: string): boolean {
	const path = deliveryGrantPath();
	if (!existsSync(path)) return false;
	let grant: unknown;
	try {
		grant = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		grant = undefined;
	}
	if (typeof grant !== "object" || grant === null) {
		rmSync(path, { force: true });
		return false;
	}
	const { cwd: grantCwd, expiresAt, remainingUses } = grant as {
		cwd?: unknown;
		expiresAt?: unknown;
		remainingUses?: unknown;
	};
	const valid =
		grantCwd === cwd &&
		typeof expiresAt === "number" &&
		Date.now() <= expiresAt;
	if (!valid) {
		rmSync(path, { force: true });
		return false;
	}
	// `remainingUses` ausente = grant de un formato anterior: vale por un uso.
	const left = typeof remainingUses === "number" ? remainingUses - 1 : 0;
	if (left <= 0) {
		rmSync(path, { force: true });
	} else {
		writeFileSync(path, `${JSON.stringify({ cwd: grantCwd, expiresAt, remainingUses: left })}\n`);
	}
	return true;
}

function truncatePreview(text: string, max: number): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

export function evaluateDeniedCommand(
	command: string,
): ToolCallEventResult | undefined {
	for (const pattern of DENIED_BASH_PATTERNS) {
		if (pattern.test(command)) {
			return {
				block: true,
				reason:
					"Ein safety policy blocked a destructive shell command. Ask the user for an explicit safer plan.",
			};
		}
	}
	return undefined;
}

export function commandRequiresConfirmation(command: string): boolean {
	return CONFIRM_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

// ─── Allowlist explícita para el guard de cc-ein (grupo 001) ────────────────
// Optimización de permisos de Claude Code, NO una capa de seguridad: esta
// función solo responde "¿está explícitamente permitido?" para un comando ya
// evaluado por deny/confirm (la precedencia deny→confirm→allow vive en el
// guard, grupo 003). Pura, sin I/O, sin estado — Pi runtime no la consume.

// Metacaracteres que delegan la ejecución a otro proceso o redirigen su
// salida: si aparecen en cualquier parte del comando, el comando entero queda
// fuera del alcance de esta allowlist (no podemos verificar qué corre).
const UNSAFE_METACHAR_PATTERN = /[`<>]|\$\(/;

// Separadores de segmento de shell. Cada segmento se evalúa de forma
// independiente: un segmento seguro (p. ej. `git add .`) NO abona seguridad a
// los segmentos vecinos (p. ej. `git push`), así que no basta con que UNO
// case con el patrón — todos deben hacerlo.
const COMMAND_SEGMENT_SPLIT_PATTERN = /&&|\|\||[|;\n]/;

// Letras de flags cortos bloqueadas por subcomando. Un bundle como `-rd` se
// escanea letra a letra, no como literal: `-r -d` y `-rd` deben rechazarse
// igual, y una regex de lookahead no distingue "contiene la letra d" de
// "contiene la subcadena -d" dentro de un bundle mayor.
const BLOCKED_SHORT_FLAG_LETTERS: Record<string, Set<string>> = {
	branch: new Set(["d", "D", "m", "M", "f"]),
	commit: new Set(["e", "i"]),
	add: new Set(["p", "i", "e"]),
};

// Flags largos bloqueados por subcomando (además del escaneo de letras
// cortas). `branch`: borran o mueven la rama. `commit`: reescriben historia o
// abren edición interactiva. `add`: entran en modo interactivo/parcial.
const BLOCKED_LONG_FLAGS: Record<string, Set<string>> = {
	branch: new Set(["--delete", "--move", "--force", "--edit-description"]),
	commit: new Set(["--amend", "--no-verify", "--edit", "--interactive"]),
	add: new Set(["--patch", "--interactive", "--edit"]),
};

// Subcomandos que no mutan nada: cualquier flag es seguro.
const READ_ONLY_SUBCOMMANDS = new Set(["status", "diff", "log"]);

// `git commit` sin fuente de mensaje abre un editor interactivo y cuelga una
// llamada headless. Se exige uno de estos flags de mensaje no interactivo.
const COMMIT_MESSAGE_FLAG_PATTERN = /^(-m|--message(=.*)?|-F|--file(=.*)?|-C|--reuse-message(=.*)?)$/;

// ¿Este token de flag corto (p. ej. `-rd`) contiene alguna letra bloqueada
// para el subcomando dado? Escaneo letra a letra, sin lookahead.
function shortFlagBundleHasBlockedLetter(token: string, subcommand: string): boolean {
	const blocked = BLOCKED_SHORT_FLAG_LETTERS[subcommand];
	if (!blocked) return false;
	if (!/^-[A-Za-z]+$/.test(token)) return false;
	for (const letter of token.slice(1)) {
		if (blocked.has(letter)) return true;
	}
	return false;
}

function longFlagIsBlocked(token: string, subcommand: string): boolean {
	const blocked = BLOCKED_LONG_FLAGS[subcommand];
	if (!blocked) return false;
	// Acepta `--amend` y `--message=x` (compara solo la parte antes del `=`).
	const bare = token.split("=")[0];
	return blocked.has(bare) || blocked.has(token);
}

// ¿Este único segmento (ya recortado, sin operadores) es un comando git
// explícitamente seguro? Evalúa el subcomando y luego cada token de flag.
function segmentIsExplicitlyAllowed(segment: string): boolean {
	const tokens = segment.split(/\s+/).filter(Boolean);
	if (tokens.length < 2 || tokens[0] !== "git") return false;

	const subcommand = tokens[1];
	const rest = tokens.slice(2);

	if (READ_ONLY_SUBCOMMANDS.has(subcommand)) return true;

	if (subcommand === "branch") {
		for (const token of rest) {
			if (!token.startsWith("-")) continue;
			if (longFlagIsBlocked(token, "branch")) return false;
			if (shortFlagBundleHasBlockedLetter(token, "branch")) return false;
		}
		return true;
	}

	if (subcommand === "commit") {
		let hasMessageSource = false;
		for (const token of rest) {
			if (!token.startsWith("-")) continue;
			if (longFlagIsBlocked(token, "commit")) return false;
			if (shortFlagBundleHasBlockedLetter(token, "commit")) return false;
			if (COMMIT_MESSAGE_FLAG_PATTERN.test(token)) hasMessageSource = true;
		}
		// Sin fuente de mensaje: `git commit` a secas abriría el editor.
		return hasMessageSource;
	}

	if (subcommand === "add") {
		for (const token of rest) {
			if (!token.startsWith("-")) continue;
			if (longFlagIsBlocked(token, "add")) return false;
			if (shortFlagBundleHasBlockedLetter(token, "add")) return false;
		}
		return true;
	}

	return false;
}

// ¿Se puede promover el comando entero a `allow` sin pasar por confirmación?
// Requiere: sin metacaracteres de sustitución/redirección, y que TODOS los
// segmentos operator-separated sean, cada uno, explícitamente seguros.
export function commandIsExplicitlyAllowed(command: string): boolean {
	if (UNSAFE_METACHAR_PATTERN.test(command)) return false;

	const segments = command
		.split(COMMAND_SEGMENT_SPLIT_PATTERN)
		.map((segment) => segment.trim())
		.filter(Boolean);

	if (segments.length === 0) return false;

	return segments.every(segmentIsExplicitlyAllowed);
}

export async function confirmCommand(
	command: string,
	ctx: ExtensionContext,
): Promise<ToolCallEventResult | undefined> {
	const denied = evaluateDeniedCommand(command);
	if (denied) return denied;
	if (!commandRequiresConfirmation(command)) return undefined;
	if (!ctx.hasUI) {
		if (consumeDelegatedDelivery(ctx.cwd)) return undefined;
		// Precisión deliberada: el bloqueo es POR FALTA DE GRANT, no por
		// configuración ausente. Con el mensaje genérico anterior el subagente
		// concluía "no existe .pi/ein/git.json" — un fichero que sí existía y
		// estaba en `auto` — y el padre acababa recomendando abrir sesión nueva,
		// que no arregla nada.
		return {
			block: true,
			reason:
				"Ein delivery gate: no active delivery grant for this working directory (the guarded command needs one; this is NOT a missing or misconfigured .pi/ein/git.json). The grant is minted by the parent session when it delegates the delivery. Do not retry and do not inspect the git config: return a single report to the parent so it can confirm with the user and re-delegate.",
		};
	}
	const preview = truncatePreview(command, 180);
	const approved = await ctx.ui.confirm(
		pick("¿Permitir comando protegido?", "Allow guarded command?"),
		preview,
	);
	if (approved) return undefined;
	return {
		block: true,
		reason:
			"Ein safety policy blocked the command because it was not confirmed.",
	};
}

// ─── Confirmación de entrega delegada (tool `subagent`) ──────────────────────

// Textos de task y nombres de agente del input del tool `subagent`. La forma la
// resuelve `delegation-shape.ts` (workflowScript + formas legacy); aquí solo se
// decide qué significan.
function collectDelegationTexts(input: unknown): string[] {
	return collectDelegationTaskTexts(input);
}

export function collectDelegationAgents(input: unknown): string[] {
	return collectDelegationAgentNames(input);
}

// ¿Esta delegación es una entrega? Determinista primero (el agente destino),
// prosa después. El orden importa: el agente es un hecho, el texto una pista.
export function delegationIsDelivery(input: unknown): boolean {
	if (collectDelegationAgents(input).some((a) => DELIVERY_AGENTS.has(a)))
		return true;
	return collectDelegationTexts(input).some(taskRequestsGuardedDelivery);
}

export function taskRequestsGuardedDelivery(text: string): boolean {
	// Negación POR VERBO, no por texto: se eliminan solo los verbos negados y
	// se evalúa lo que queda afirmado. "haz commit pero sin push" → false, pero
	// "abre PR pero no hagas merge" → true (el PR sigue pedido). Una negación
	// suelta ya no cancela una entrega legítima del mismo texto — eso bloqueaba
	// el push headless y forzaba el retry-loop de re-delegación.
	const affirmative = stripNegatedDelivery(text);
	return DELEGATED_DELIVERY_PATTERNS.some((pattern) => pattern.test(affirmative));
}

export interface DeliveryGateOptions {
	// Modo de confirmación de entrega (.pi/ein/git.json). auto/ask/off.
	mode: GitDeliveryMode;
	// ¿El último mensaje del usuario pidió explícitamente la entrega? En modo
	// `auto` esto salta la confirmación (ya la autorizó al pedirla).
	userRequested: boolean;
}

export async function confirmDelegatedDelivery(
	input: unknown,
	ctx: ExtensionContext,
	options: DeliveryGateOptions,
): Promise<ToolCallEventResult | undefined> {
	if (!delegationIsDelivery(input)) return undefined;
	const texts = collectDelegationTexts(input);
	// Política de confirmación. El grant se EMITE siempre que dejemos
	// pasar la entrega (auto-autorizada, off o aprobada): el ein-git headless lo
	// necesita para su `git push`. Solo cambia si mostramos el ui.confirm o no.
	// off → nunca preguntar. auto → no preguntar si el usuario la pidió.
	if (
		options.mode === "off" ||
		(options.mode === "auto" && options.userRequested)
	) {
		grantDelegatedDelivery(ctx.cwd);
		return undefined;
	}
	// Sin UI no podemos confirmar aquí; el guard de bash del subagente decide.
	if (!ctx.hasUI) return undefined;
	const preview = truncatePreview(texts.join(" | "), 180);
	const approved = await ctx.ui.confirm(
		pick(
			"¿Autorizar push delegado al subagente?",
			"Authorize delegated push to the subagent?",
		),
		preview,
	);
	if (!approved) {
		return {
			block: true,
			reason:
				"El usuario no autorizó la entrega delegada (push). Pregunta qué quiere hacer antes de reintentar.",
		};
	}
	grantDelegatedDelivery(ctx.cwd);
	return undefined;
}
