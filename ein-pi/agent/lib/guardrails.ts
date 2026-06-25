// =============================================================================
// GUARDRAILS
// Política de seguridad de Ein para comandos bash: patrones denegados
// (destructivos, sin apelación) y patrones que exigen confirmación
// interactiva del usuario antes de ejecutarse.
//
// Los subagentes corren headless (sin UI), así que la confirmación de un
// push delegado ocurre en la sesión padre al llamar al tool `subagent`:
// el usuario aprueba ahí y se emite un grant one-shot con TTL corto que el
// guard headless consume cuando el subagente ejecuta el push real.
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
import type { GitDeliveryMode } from "./git-delivery.ts";
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

// Frases (en la task de delegación, lenguaje natural) que implican que el
// subagente acabará ejecutando un comando guardado tipo `git push`.
const DELEGATED_DELIVERY_PATTERNS: RegExp[] = [
	/\bgit\s+push\b/i,
	/\bpush\b/i,
	/\bsube\s+(?:la\s+)?rama\b/i,
];

// TTL corto a propósito: cubre el arranque del subagente y poco más.
const DELIVERY_GRANT_TTL_MS = 10 * 60 * 1000;

function einConfigHome(): string {
	return process.env.EIN_PI_CONFIG_HOME ?? join(homedir(), ".pi", "ein");
}

export function deliveryGrantPath(): string {
	return join(einConfigHome(), "delivery-grant.json");
}

export function grantDelegatedDelivery(cwd: string): void {
	const path = deliveryGrantPath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		`${JSON.stringify({ cwd, expiresAt: Date.now() + DELIVERY_GRANT_TTL_MS })}\n`,
	);
}

// One-shot: leerlo lo consume siempre, sea válido o no, para que un grant
// corrupto o caducado no sobreviva a varios intentos.
export function consumeDelegatedDelivery(cwd: string): boolean {
	const path = deliveryGrantPath();
	if (!existsSync(path)) return false;
	let grant: unknown;
	try {
		grant = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		grant = undefined;
	}
	rmSync(path, { force: true });
	if (typeof grant !== "object" || grant === null) return false;
	const { cwd: grantCwd, expiresAt } = grant as {
		cwd?: unknown;
		expiresAt?: unknown;
	};
	return (
		grantCwd === cwd &&
		typeof expiresAt === "number" &&
		Date.now() <= expiresAt
	);
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

export async function confirmCommand(
	command: string,
	ctx: ExtensionContext,
): Promise<ToolCallEventResult | undefined> {
	const denied = evaluateDeniedCommand(command);
	if (denied) return denied;
	if (!commandRequiresConfirmation(command)) return undefined;
	if (!ctx.hasUI) {
		if (consumeDelegatedDelivery(ctx.cwd)) return undefined;
		return {
			block: true,
			reason:
				"Ein safety policy requires interactive confirmation before this command. Do not retry: return a single report to the parent session so it can confirm with the user and re-delegate with an approved delivery grant.",
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Extrae los textos de task del input del tool `subagent`: modo single
// (`task`), parallel (`tasks[].task`) y chain (`steps[].task`).
function collectDelegationTexts(input: unknown): string[] {
	if (!isRecord(input)) return [];
	const texts: string[] = [];
	if (typeof input.task === "string") texts.push(input.task);
	for (const key of ["tasks", "steps"]) {
		const items = input[key];
		if (!Array.isArray(items)) continue;
		for (const item of items) {
			if (isRecord(item) && typeof item.task === "string")
				texts.push(item.task);
		}
	}
	return texts;
}

export function taskRequestsGuardedDelivery(text: string): boolean {
	return DELEGATED_DELIVERY_PATTERNS.some((pattern) => pattern.test(text));
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
	// Sin UI no podemos confirmar aquí; el guard de bash del subagente decide.
	if (!ctx.hasUI) return undefined;
	const texts = collectDelegationTexts(input);
	if (!texts.some(taskRequestsGuardedDelivery)) return undefined;
	// Política de confirmación. El grant one-shot se EMITE siempre que dejemos
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
