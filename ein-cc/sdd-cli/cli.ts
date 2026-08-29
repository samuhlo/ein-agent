#!/usr/bin/env bun
// =============================================================================
// ein-cc-sdd — CLI determinista del flujo SDD para Claude Code
// -----------------------------------------------------------------------------
// Reusa el MISMO motor determinista que Pi a través de `shared/ports/sdd.ts`:
// resolveSddStatus/Next, lintChange, closeChange. Los agentes de ein-cc
// lo llaman por Bash en vez de las tools `ein_sdd_*` de Pi. Solo lee/mueve el
// filesystem — cero IA, cero adivinación.
//
//   ein-cc-sdd status [change]     estado + nextRecommended (rutea por `next:`)
//   ein-cc-sdd check  [change]     gatekeeper: linta cada artefacto presente
//   ein-cc-sdd close  <change> [--force] [reconciliation flags]   archiva un cambio verificado
//   ein-cc-sdd sync   <change>     sincroniza el delta OpenSpec explícito
//   ein-cc-sdd delta  [change] --domain <d> < ops.json   escribe el delta de
//                                 comportamiento desde operaciones estructuradas
//   ein-cc-sdd summary [change] < summary.md  escribe summary.md desde stdin,
//                                 canal determinista para el cierre
//   ein-cc-sdd settings [--hook]   ajustes del proyecto → directivas
//   ein-cc-sdd preflight [change] [--tdd off|strict] [--lane micro|standard] [--force]
//                                 lee o fija la postura del cambio (TDD + carril)
// =============================================================================

import {
	changeStanceDirective,
	closeChange,
	commandIsExplicitlyAllowed,
	commandRequiresConfirmation,
	evaluateDeniedCommand,
	formatSddPlanPreview,
	isSafeChangeName,
	LANE_LABEL,
	laneSkips,
	lintChange,
	listActiveChanges,
	normalizeLane,
	normalizeTddStance,
	readActiveChangeStance,
	readChangeStance,
	readChangeLane,
	readGitBaseline,
	readPreflightRecord,
	renderChangeStanceLine,
	renderProjectDirectives,
	renderWorkingTreeLine,
	resolveActiveSelection,
	resolveProjectDirectives,
	resolveSddIntentPreflight,
	resolveSddPlanPreview,
	resolveSddStatus,
	summarizeProjectDirectives,
	type SddIntentPreflightInput,
	type SddIntentPreflightOutcome,
	updateSddPreflightStance,
	writeChangeLane,
	writeOpenSpecDelta,
	writeSddSummary,
} from "../../shared/ports/sdd.ts";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { formatSddCheck, formatSddStatus } from "./presentation.ts";
import { runSyncCommand, type SyncCliResponse } from "./sync-command.ts";

const cwd = process.cwd();

// ── Guard (hook PreToolUse) ──────────────────────────────────────────────────
// Lee el JSON del hook por stdin y emite la decisión de permiso de Claude Code.
// Reusa los MISMOS patrones que el guardrail de Pi (evaluateDeniedCommand /
// commandRequiresConfirmation): destructivos → deny; git push/rebase/branch -D/
// publish → ask (confirmación nativa de CC, sin la maquinaria de grants de Pi).
export type GuardDecision = "deny" | "ask" | "allow";

function emitDecision(decision: GuardDecision, reason: string): void {
	process.stdout.write(JSON.stringify({
		hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason },
	}));
}

// El estado SDD es advisory: se lee DESPUÉS de decidir y solo enriquece el
// texto de la razón. No crea una cuarta decisión ni bloquea nada por "sin
// cambio activo" — ese gate fue descartado explícitamente en el design
// (decisión 1A). Cualquier fallo al leer el estado degrada a texto vacío, no
// a excepción: la razón sigue siendo válida sin el matiz de SDD.
function sddAdvisoryNote(cwd: string): string {
	try {
		const status = resolveSddStatus(cwd);
		if (!status.change) return " [sdd: sin cambio activo]";
		return ` [sdd: ${status.change} · fase ${status.currentPhase}]`;
	} catch {
		return "";
	}
}

// Precedencia FIJA deny → confirm → allow → none. Deny y confirm ganan sobre
// allow siempre: "git add . && git push" no puede auto-aprobarse porque el
// segmento `add` matchea el allowlist — el `push` de al lado debe seguir
// pidiendo confirmación nativa. No consumimos delivery-grant aquí (decisión
// 1D): ese mecanismo es de Pi, ein-cc nunca lo lee ni lo escribe, así que un
// grant dejado por otro harness no puede colar un `allow`.
export function resolveGuardDecision(
	rawInput: string,
	cwd: string,
): { decision: GuardDecision; reason: string } | null {
	let command = "";
	try {
		const input = JSON.parse(rawInput) as { tool_input?: { command?: string } };
		command = input?.tool_input?.command ?? "";
	} catch {
		return null; // JSON malformado → degrada abierto, sin decisión ni log.
	}
	if (!command) return null;

	const denied = evaluateDeniedCommand(command);
	if (denied) {
		return {
			decision: "deny",
			reason: `${denied.reason ?? "Ein safety policy blocked a destructive command."}${sddAdvisoryNote(cwd)}`,
		};
	}
	if (commandRequiresConfirmation(command)) {
		return {
			decision: "ask",
			reason: `Ein: comando protegido (git push / rebase / branch -D / npm publish). Confirma antes de ejecutar.${sddAdvisoryNote(cwd)}`,
		};
	}
	if (commandIsExplicitlyAllowed(command)) {
		return {
			decision: "allow",
			reason: `Ein: comando en la allowlist explícita (solo lectura o mutación local segura).${sddAdvisoryNote(cwd)}`,
		};
	}
	return null; // sin match → Claude Code sigue su flujo de permisos normal.
}

async function guardCmd(): Promise<void> {
	const raw = await Bun.stdin.text();
	const result = resolveGuardDecision(raw, cwd);
	if (result) emitDecision(result.decision, result.reason);
}

// Resolución del cambio sobre el que actúa un subcomando. Un solo sitio, porque
// seis subcomandos hacían `?? resolveSddStatus(dir).change ?? ""` y heredaban la
// misma elección implícita.
//
// Ante varios cambios abiertos NO elige: estos subcomandos escriben, y un
// comando que elige y avisa es un comando cuyo aviso se lee después de escribir.
export function resolveCommandChange(
	dir: string,
	requested: string | undefined,
	command: string,
): { ok: true; change: string } | { ok: false; text: string; exitCode: 1 } {
	const selection = resolveActiveSelection(dir, requested);
	if (selection.kind === "ambiguous") {
		return {
			ok: false,
			exitCode: 1,
			text: `// sdd ${command} — hay ${selection.candidates.length} cambios activos y ninguno elegido: ${selection.candidates.join(", ")}.\n// Indica cuál: ein-cc-sdd ${command} <change>`,
		};
	}
	if (selection.kind === "none") {
		return { ok: false, exitCode: 1, text: `// sdd ${command} — no active change in openspec/changes/.` };
	}
	return { ok: true, change: selection.change };
}

// Carril del cambio. Lo declara el HUMANO: no existe señal determinista antes
// de planificar, así que el sistema no lo adivina. Sin argumento, informa.
export function runLaneCommand(dir: string, args: readonly string[]): { text: string; exitCode: 0 | 1 } {
	const positional = args.filter((arg) => !arg.startsWith("--"));
	const requested = positional.map(normalizeLane).find((lane) => lane !== undefined);
	const resolved = resolveCommandChange(dir, positional.find((arg) => normalizeLane(arg) === undefined), "lane");
	if (!resolved.ok) return { text: resolved.text, exitCode: resolved.exitCode };
	const name = resolved.change;
	if (!isSafeChangeName(name)) return { text: `// sdd lane — invalid change name: ${JSON.stringify(name)}.`, exitCode: 1 };

	const changeDir = join(dir, "openspec", "changes", name);
	if (!existsSync(changeDir)) return { text: `// sdd lane — '${name}' does not exist.`, exitCode: 1 };

	if (requested) writeChangeLane(changeDir, requested);
	const lane = readChangeLane(changeDir);
	const skipped = laneSkips(lane);
	const detail = skipped.length ? ` Skips: ${skipped.join(", ")}. Verify and close stay hard gates.` : "";
	return { text: `// sdd lane — '${name}': ${LANE_LABEL[lane]}.${detail}`, exitCode: 0 };
}

function laneCmd(args: readonly string[]): void {
	const { text, exitCode } = runLaneCommand(cwd, args);
	console.log(text);
	if (exitCode !== 0) process.exit(exitCode);
}

export function runClaudeIntentPreflight(
	dir: string,
	input: Omit<SddIntentPreflightInput, "resolvedBy">,
): Promise<SddIntentPreflightOutcome> {
	const ctx = {
		cwd: dir,
		hasUI: false,
		sessionManager: { getSessionId: () => `claude:${dir}` },
	} as Parameters<typeof resolveSddIntentPreflight>[0];
	return resolveSddIntentPreflight(ctx, { ...input, resolvedBy: "claude" });
}

export async function runClaudePreflightCommand(
	dir: string,
	args: readonly string[],
	intentInput: Omit<SddIntentPreflightInput, "resolvedBy">,
): Promise<{ intent: SddIntentPreflightOutcome; text: string; exitCode: 0 | 1 }> {
	// Intent must settle or expose its pending route before legacy stance flags run.
	const intent = await runClaudeIntentPreflight(dir, intentInput);
	const stance = runPreflightCommand(dir, args);
	const intentText = intent.kind === "pending"
		? intent.interaction.text
		: intent.kind === "resolved" && intent.interaction?.kind === "small"
			? intent.interaction.lines[0]
			: "";
	return {
		intent,
		...stance,
		text: [intentText, stance.text].filter((part) => part.length > 0).join("\n"),
	};
}

// Compatibilidad de postura: los flags legacy siguen vigentes, pero toda
// escritura pasa por el propietario compartido. Un lane explícito es declarado.
export function runPreflightCommand(
	dir: string,
	args: readonly string[],
): { text: string; exitCode: 0 | 1 } {
	const flag = (name: string): string | undefined => {
		const index = args.indexOf(name);
		return index >= 0 ? args[index + 1] : undefined;
	};
	const force = args.includes("--force");
	const positional = args.filter((arg, index) => {
		if (arg.startsWith("--")) return false;
		const previous = args[index - 1];
		return previous !== "--tdd" && previous !== "--lane";
	});
	const resolvedChange = resolveCommandChange(dir, positional[0], "preflight");
	if (!resolvedChange.ok) return { text: resolvedChange.text, exitCode: resolvedChange.exitCode };
	const name = resolvedChange.change;

	const stance = readChangeStance(dir, name);
	if (!stance) return { text: `// sdd preflight — '${name}' does not exist or is not a valid change name.`, exitCode: 1 };

	const rawTdd = flag("--tdd");
	const requestedTdd = rawTdd === undefined ? undefined : normalizeTddStance(rawTdd);
	if (rawTdd !== undefined && !requestedTdd) {
		return { text: `// sdd preflight — unknown TDD stance ${JSON.stringify(rawTdd)}; use 'off' or 'strict'.`, exitCode: 1 };
	}
	if (requestedTdd && stance.tdd && !force) {
		return {
			text: `// sdd preflight — '${name}' already decided: TDD ${stance.tdd} (by ${stance.decidedBy ?? "pi"}). Pass --force to replace it.`,
			exitCode: 1,
		};
	}

	const rawLane = flag("--lane");
	const requestedLane = rawLane === undefined ? undefined : normalizeLane(rawLane);
	if (rawLane !== undefined && !requestedLane) {
		return { text: `// sdd preflight — unknown lane ${JSON.stringify(rawLane)}; use 'micro' or 'standard'.`, exitCode: 1 };
	}
	if (requestedTdd || requestedLane) {
		const update = updateSddPreflightStance(dir, name, {
			...(requestedTdd ? { tdd: requestedTdd } : {}),
			...(requestedLane ? { declaredLane: requestedLane } : {}),
			author: "claude",
			replaceTdd: force,
		});
		if (update.kind === "tdd-conflict") {
			return {
				text: `// sdd preflight — '${name}' already decided: TDD ${update.record.tdd} (by ${update.record.decidedBy}). Pass --force to replace it.`,
				exitCode: 1,
			};
		}
	}

	const current = readChangeStance(dir, name);
	const directive = changeStanceDirective(current);
	const text = [`// sdd preflight — '${name}'`, renderChangeStanceLine(current), directive]
		.filter((part) => part.length > 0)
		.join("\n");
	return { text, exitCode: 0 };
}

function preflightIntentInput(dir: string, args: readonly string[]): Omit<SddIntentPreflightInput, "resolvedBy"> | undefined {
	const positional = args.filter((arg, index) => {
		if (arg.startsWith("--")) return false;
		const previous = args[index - 1];
		return previous !== "--tdd" && previous !== "--lane";
	});
	const selected = resolveCommandChange(dir, positional[0], "preflight");
	if (!selected.ok) return undefined;
	const record = readPreflightRecord(join(dir, "openspec", "changes", selected.change));
	const existing = record?.intent;
	return {
		change: selected.change,
		evidence: {
			activation: "unknown",
			declaredLane: null,
			bounded: "unknown",
			mechanical: "unknown",
			documentationOrTextOnly: "unknown",
			introducesBehavior: "unknown",
			securityRisk: "unknown",
			persistentDataRisk: "unknown",
			destructiveActionRisk: "unknown",
			bypassRequested: false,
		},
		summary: existing?.summary ?? `Resolve intent for ${selected.change}.`,
		...(existing
			? {
				material: {
					objective: existing.objective,
					boundaries: existing.boundaries,
					completionCriteria: existing.completionCriteria,
				},
			}
			: {}),
		materialEvidence: existing ? "sufficient" : "uncertain",
	};
}

export async function runClaudePreflightInputCommand(
	dir: string,
	args: readonly string[],
	rawInput: string,
): Promise<{ intent?: SddIntentPreflightOutcome; text: string; exitCode: 0 | 1 }> {
	const fallback = preflightIntentInput(dir, args);
	if (!fallback) return runPreflightCommand(dir, args);
	let input = fallback;
	if (rawInput.trim().length > 0) {
		try {
			const parsed: unknown = JSON.parse(rawInput);
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new TypeError("object expected");
			input = { ...(parsed as Omit<SddIntentPreflightInput, "resolvedBy">), change: fallback.change };
		} catch {
			return {
				text: "// sdd preflight — invalid intent JSON on stdin.",
				exitCode: 1,
			};
		}
	}
	try {
		return await runClaudePreflightCommand(dir, args, input);
	} catch {
		return {
			text: "// sdd preflight — invalid or incomplete intent evidence on stdin.",
			exitCode: 1,
		};
	}
}

async function preflightCmd(args: readonly string[]): Promise<void> {
	const rawInput = process.stdin.isTTY ? "" : await Bun.stdin.text();
	const result = await runClaudePreflightInputCommand(cwd, args, rawInput);
	console.log(result.text);
	if (result.exitCode !== 0) process.exit(result.exitCode);
}

// Delta de comportamiento desde operaciones estructuradas por stdin. Llama a la
// MISMA función que la tool de Pi: sin esto, un cambio con delta empezado en
// Claude no podía cerrarse, porque el agente tenía prohibido escribir el
// markdown a mano y la herramienta que debía usar no existía aquí.
export function runDeltaCommand(
	dir: string,
	args: readonly string[],
	rawStdin: string,
): { text: string; exitCode: 0 | 1 } {
	const domainIndex = args.indexOf("--domain");
	const domain = domainIndex >= 0 ? (args[domainIndex + 1] ?? "") : "";
	const resolvedDelta = resolveCommandChange(dir, args.find((arg) => !arg.startsWith("--") && arg !== domain), "delta");
	if (!resolvedDelta.ok) return { text: resolvedDelta.text, exitCode: resolvedDelta.exitCode };
	const change = resolvedDelta.change;

	let operations: unknown[];
	try {
		const parsed: unknown = JSON.parse(rawStdin);
		// Se acepta el array suelto o envuelto en `{ operations: [...] }`: el
		// agente escribe JSON a mano y ambas formas son naturales.
		operations = Array.isArray(parsed)
			? parsed
			: Array.isArray((parsed as { operations?: unknown })?.operations)
				? (parsed as { operations: unknown[] }).operations
				: [];
	} catch {
		return { text: "// openspec delta — stdin is not valid JSON. Pass the operations array (or { operations: [...] }).", exitCode: 1 };
	}

	const result = writeOpenSpecDelta({ cwd: dir, change, domain, operations });
	if (!result.ok) {
		const text = result.code === "malformed"
			? `// openspec delta — REJECTED, nothing written: ${result.reason}. Fix the operations and retry; the delta is validated with the SAME grammar as sync.`
			: `// openspec delta — ${result.reason}.`;
		return { text, exitCode: 1 };
	}
	return {
		text: `// openspec delta — '${result.change}': wrote openspec/changes/${result.change}/specs/${result.domain}/spec.md (${result.operations} operation(s), validated). Do NOT also write the 'spec_delta: none' declaration: the delta IS the declaration.`,
		exitCode: 0,
	};
}

async function deltaCmd(args: readonly string[]): Promise<void> {
	const { text, exitCode } = runDeltaCommand(cwd, args, await Bun.stdin.text());
	console.log(text);
	if (exitCode !== 0) process.exit(exitCode);
}

// Persistencia de `summary.md` por stdin. Espejo exacto de `runDeltaCommand`:
// una negativa a `Write` deja de ser terminal, porque existe un canal que no es
// "crear un fichero por iniciativa propia". No garantiza que el agente lo
// invoque (eso no es comprobable de forma determinista) — solo que, si lo
// invoca, la escritura queda gateada como el resto del ciclo de vida.
export function runSummaryCommand(
	dir: string,
	args: readonly string[],
	rawStdin: string,
): { text: string; exitCode: 0 | 1 } {
	const resolvedSummary = resolveCommandChange(dir, args.find((arg) => !arg.startsWith("--")), "summary");
	if (!resolvedSummary.ok) return { text: resolvedSummary.text, exitCode: resolvedSummary.exitCode };
	const change = resolvedSummary.change;
	const content = rawStdin;

	if (content.trim().length === 0) {
		return { text: "// sdd summary — stdin is empty. Pass the summary.md content on stdin.", exitCode: 1 };
	}

	const result = writeSddSummary({ cwd: dir, change, content });
	if (!result.ok) {
		return { text: `// sdd summary — ${result.reason}.`, exitCode: 1 };
	}
	return {
		text: `// sdd summary — '${result.change}': wrote openspec/changes/${result.change}/summary.md.`,
		exitCode: 0,
	};
}

async function summaryCmd(args: readonly string[]): Promise<void> {
	const { text, exitCode } = runSummaryCommand(cwd, args, await Bun.stdin.text());
	console.log(text);
	if (exitCode !== 0) process.exit(exitCode);
}

// Ajustes del proyecto → directivas. `--hook` emite el sobre de SessionStart
// (lo llama settings.json); sin flag imprime el bloque en claro, que es lo que
// un agente lee por Bash y lo que un humano quiere ver.
export function buildSettingsBlock(dir: string): string {
	const project = renderProjectDirectives(resolveProjectDirectives(dir, "claude"));
	// La postura del cambio va DESPUÉS y dice explícitamente que sobrescribe: un
	// ajuste de proyecto describe el default, y una decisión tomada sobre este
	// cambio concreto es más específica que el default.
	const stance = changeStanceDirective(readActiveChangeStance(dir));
	return stance ? `${project}\n\n${stance}` : project;
}

function settingsCmd(args: readonly string[]): void {
	const block = buildSettingsBlock(cwd);
	if (!args.includes("--hook")) {
		console.log(block);
		return;
	}
	process.stdout.write(JSON.stringify({
		hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: block },
	}));
}

// ── Dispatch ────────────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);
const force = rest.includes("--force");
// Every documented command takes the optional change as its first positional
// argument. Flag values must never be reinterpreted as a change name.
const change = rest[0] && !rest[0].startsWith("--") ? rest[0] : undefined;

function flagValue(args: readonly string[], flag: string): string | undefined {
	const index = args.indexOf(flag);
	const value = index >= 0 ? args[index + 1] : undefined;
	return value && !value.startsWith("--") ? value : undefined;
}

// Best-effort git init: solo cuando el directorio ya tiene artefactos SDD
// (`openspec/changes/`) — no queremos inicializar git en cualquier carpeta
// donde alguien corra `status` por curiosidad. `EIN_CC_NO_GIT_INIT`/`CI`
// permiten opt-out explícito (entornos de CI que no quieren un repo git
// espontáneo). Un fallo de `git init` (binario ausente, destino no
// escribible) se reporta como texto, nunca como excepción propagada: el
// bootstrap es una ayuda, no un requisito para que `status` funcione.
function bootstrapRepoIfNeeded(cwd: string): string | null {
	if (readGitBaseline(cwd).isRepo) return null;
	if (!existsSync(join(cwd, "openspec", "changes"))) return null;
	if (process.env.EIN_CC_NO_GIT_INIT || process.env.CI) return null;
	try {
		execFileSync("git", ["init"], { cwd, stdio: "ignore", timeout: 5_000 });
		return null;
	} catch (err) {
		return err instanceof Error ? err.message : String(err);
	}
}

// Separada de `statusCmd` (que solo hace I/O) para poder testear el texto
// sin depender de `process.argv`/`console.log` — mismo patrón que
// `resolveGuardDecision` en el guard.
export function buildStatusOutput(cwd: string, change?: string): string {
	const initFailure = bootstrapRepoIfNeeded(cwd);

	const status = resolveSddStatus(cwd, change);
	const active = listActiveChanges(cwd);
	let text = formatSddStatus(status, active);
	if (status.nextRecommended === "apply" && status.change) {
		const block = formatSddPlanPreview(resolveSddPlanPreview(cwd, status.change));
		if (block) text += `\n\n${block}`;
	}

	// Único canal del aviso de working tree en todo el harness (ver
	// git-baseline.ts): ni el guard ni sync.ts repiten este texto.
	const baseline = readGitBaseline(cwd);
	const workingTreeLine = renderWorkingTreeLine(baseline);
	if (workingTreeLine) {
		text += `\n\n${workingTreeLine}`;
	} else if (initFailure) {
		text += `\n\n- repo: none (git init failed — ${initFailure})`;
	}

	// El status contesta "dónde estoy", y los ajustes son parte de esa respuesta:
	// llegar a un proyecto sin saber si exige TDD es llegar a ciegas.
	const settings = summarizeProjectDirectives(resolveProjectDirectives(cwd, "claude"));
	if (settings) text += `\n${settings}`;
	// Y la postura de ESTE cambio, que puede contradecir el ajuste de arriba.
	const stanceLine = renderChangeStanceLine(
		change ? readChangeStance(cwd, change) : readActiveChangeStance(cwd),
	);
	if (stanceLine) text += `\n${stanceLine}`;

	return text;
}

function statusCmd() {
	console.log(buildStatusOutput(cwd, change));
}

function checkCmd() {
	const resolved = resolveCommandChange(cwd, change, "check");
	if (!resolved.ok) {
		console.log(resolved.text);
		process.exit(1);
	}
	const target = resolved.change;
	const report = lintChange(cwd, target);
	console.log(formatSddCheck(report));
	if (report.errors > 0) process.exit(1);
}

function closeCmd() {
	const resolved = resolveCommandChange(cwd, change, "close");
	if (!resolved.ok) {
		console.log(resolved.text);
		process.exit(1);
	}
	const target = resolved.change;
	const result = closeChange(cwd, target, {
		force,
		reconciliationProfile: flagValue(rest, "--reconciliation-profile"),
		reconciliationEvidencePath: flagValue(rest, "--reconciliation-evidence"),
		legacyReason: flagValue(rest, "--reason"),
	});
	if (result.ok) {
		console.log(`// sdd close — ${target} archived → ${result.to}`);
		return;
	}
	const lines = [`// sdd close — ${target} NOT archived`, ""];
	for (const b of result.blockers ?? []) lines.push(`- [${b.code}] ${b.message}`);
	if (!result.blockers?.length && result.reason) lines.push(`- ${result.reason}`);
	console.log(lines.join("\n"));
	process.exit(1);
}

// ── Explicit OpenSpec synchronization ───────────────────────────────────────
function emitSyncResponse(response: SyncCliResponse, exitCode: number): void {
	process.stdout.write(`${JSON.stringify(response)}\n`);
	process.exitCode = exitCode;
}

async function syncCmd(args: readonly string[]): Promise<void> {
	const result = await runSyncCommand(cwd, args);
	emitSyncResponse(result.response, result.exitCode);
}

// Guardado tras `import.meta.main`: los tests importan este módulo para
// llamar a `resolveGuardDecision()` directamente (sin subproceso), y sin este
// guard el dispatch correría con el argv del test runner y mataría el proceso.
if (import.meta.main) {
	switch (cmd) {
		case "status": statusCmd(); break;
		case "check": checkCmd(); break;
		case "close": closeCmd(); break;
		case "guard": await guardCmd(); break;
		case "settings": settingsCmd(rest); break;
		case "lane": laneCmd(rest); break;
		case "preflight": await preflightCmd(rest); break;
		case "delta": await deltaCmd(rest); break;
		case "summary": await summaryCmd(rest); break;
		case "sync": await syncCmd(rest); break;
		default:
			console.log("ein-cc-sdd <status|check|sync> [change]  |  close <change> [--force] [--reconciliation-profile <profile>] [--reconciliation-evidence <path>] [--reason <reason>]  |  guard (hook)  |  settings [--hook]  |  lane [change] [micro|standard]  |  preflight [change] [--tdd off|strict] [--lane micro|standard] [--force]  |  delta [change] --domain <domain> < operations.json  |  summary [change] < summary.md");
			process.exit(1);
	}
}
