#!/usr/bin/env bun
// =============================================================================
// cc-ein-sdd — CLI determinista del flujo SDD para Claude Code
// -----------------------------------------------------------------------------
// Reusa el MISMO core determinista que Pi (`ein-pi/agent/lib`, TS puro sin API
// de Pi): resolveSddStatus/Next, lintChange, closeChange. Los agentes de cc-ein
// lo llaman por Bash en vez de las tools `ein_sdd_*` de Pi. Solo lee/mueve el
// filesystem — cero IA, cero adivinación.
//
//   cc-ein-sdd status [change]     estado + nextRecommended (rutea por `next:`)
//   cc-ein-sdd check  [change]     gatekeeper: linta cada artefacto presente
//   cc-ein-sdd close  <change> [--force] [reconciliation flags]   archiva un cambio verificado
//   cc-ein-sdd sync   <change>     sincroniza el delta OpenSpec explícito
//   cc-ein-sdd delta  [change] --domain <d> < ops.json   escribe el delta de
//                                 comportamiento desde operaciones estructuradas
//   cc-ein-sdd settings [--hook]   ajustes del proyecto → directivas
// =============================================================================

import {
	resolveSddStatus,
	resolveSddPlanPreview,
	formatSddPlanPreview,
	sddStatusBlockers,
	formatBudget,
	listActiveChanges,
	isSafeChangeName,
	type SddChangeStatus,
} from "../../ein-pi/agent/lib/sdd-router.ts";
import { lintChange, type ChangeLintReport } from "../../ein-pi/agent/lib/sdd-guardrails.ts";
import { collectSddRemedies, formatSddRemedies } from "../../ein-pi/agent/lib/sdd-remedies.ts";
import { closeChange } from "../../ein-pi/agent/lib/sdd-close.ts";
import { writeOpenSpecDelta } from "../../ein-pi/agent/lib/openspec-delta-write.ts";
import { synchronizeOpenSpecFilesystem } from "../../ein-pi/agent/lib/openspec-spec-sync-fs.ts";
import {
	evaluateDeniedCommand,
	commandRequiresConfirmation,
	commandIsExplicitlyAllowed,
} from "../../ein-pi/agent/lib/guardrails.ts";
import { readGitBaseline, renderWorkingTreeLine } from "../../ein-pi/agent/lib/git-baseline.ts";
import {
	renderProjectDirectives,
	resolveProjectDirectives,
	summarizeProjectDirectives,
} from "../../ein-pi/agent/lib/project-directives.ts";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();

// ── Formatters (reimplementados sin i18n; strings inglesas, mismos campos) ──

function formatStatus(status: SddChangeStatus, active: string[]): string {
	const lines = ["/// 000. SDD STATUS", ""];
	if (!status.change) {
		lines.push("- No active SDD changes in openspec/changes/.");
		lines.push("- OpenSpec is the canonical full record.");
		return lines.join("\n");
	}
	const present = status.artifacts.present.map((a) => `${a.phase}(${a.file})`).join(", ") || "none";
	const missing = status.artifacts.missing.map((a) => `${a.phase}(${a.file})`).join(", ") || "none";
	lines.push(`change: ${status.change}`);
	if (active.length > 1) lines.push(`active: ${active.join(", ")}`);
	lines.push(`current phase: ${status.currentPhase}`);
	lines.push(`next: ${status.nextRecommended}`);
	lines.push(`artifacts present: ${present}`);
	lines.push(`artifacts missing: ${missing}`);
	lines.push(`apply: ${status.apply}`);
	lines.push(`verify: ${status.verify}`);
	lines.push(
		`tasks: status=${status.tasks.status ?? "absent"} · ready=${status.tasks.counts.ready} · blocked=${status.tasks.counts.blocked} · pending=${status.tasks.counts.pending} · done=${status.tasks.counts.done}`,
	);
	if (status.tasks.nextPending) lines.push(`next pending: ${status.tasks.nextPending.id} ${status.tasks.nextPending.title}`);
	if (status.tasks.blockedBy) lines.push(`blocked_by: ${status.tasks.blockedBy}`);
	lines.push(`budget: ${formatBudget(status.budget)}`);

	const blockers = sddStatusBlockers({
		blocked: status.blocked,
		taskProblems: status.tasks.problems,
		budgetProblems: status.budget.problems,
	});
	if (blockers.length) {
		lines.push("", "■ blockers:");
		for (const b of blockers) lines.push(`- ${b}`);
	}
	// Un bloqueo que no dice cómo salir obliga a interpretar, y un ejecutor
	// barato interpreta mal. El remedio se calcula del mismo estado.
	const remedies = formatSddRemedies(collectSddRemedies(status, "claude"));
	if (remedies) lines.push("", remedies);
	return lines.join("\n");
}

function formatCheck(report: ChangeLintReport): string {
	const { change, errors, warnings, phases } = report;
	const present = phases.filter((p) => p.present).length;
	const lines = [
		`/// 000. SDD CHECK — ${change}`,
		"",
		`phases: ${present}/${phases.length} present  |  errors: ${errors}  |  warnings: ${warnings}`,
	];
	if (report.issues.length > 0) {
		lines.push("", "■ consistency:");
		for (const i of report.issues) lines.push(`  - ${i.level.toUpperCase()} [${i.code}]: ${i.message}`);
	}
	for (const { phase, present: isPresent, report: pr } of phases) {
		if (!isPresent) {
			lines.push(`■ ${phase} — MISSING`);
			continue;
		}
		const ok = pr!.errors === 0;
		const detail = pr!.lineCount > 0 ? `, ${pr!.lineCount} lines` : "";
		lines.push(`■ ${phase} — ${ok ? "OK" : "ERRORS"} (present${detail})`);
		for (const i of pr!.issues) lines.push(`  - ${i.level.toUpperCase()} [${i.code}]: ${i.message}`);
	}
	return lines.join("\n");
}

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
// 1D): ese mecanismo es de Pi, cc-ein nunca lo lee ni lo escribe, así que un
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
	const change = args.find((arg) => !arg.startsWith("--") && arg !== domain)
		?? resolveSddStatus(dir).change
		?? "";

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
		return { text: "/// OPENSPEC DELTA — stdin is not valid JSON. Pass the operations array (or { operations: [...] }).", exitCode: 1 };
	}

	const result = writeOpenSpecDelta({ cwd: dir, change, domain, operations });
	if (!result.ok) {
		const text = result.code === "malformed"
			? `/// OPENSPEC DELTA — REJECTED, nothing written: ${result.reason}. Fix the operations and retry; the delta is validated with the SAME grammar as sync.`
			: `/// OPENSPEC DELTA — ${result.reason}.`;
		return { text, exitCode: 1 };
	}
	return {
		text: `/// OPENSPEC DELTA — '${result.change}': wrote openspec/changes/${result.change}/specs/${result.domain}/spec.md (${result.operations} operation(s), validated). Do NOT also write the 'spec_delta: none' declaration: the delta IS the declaration.`,
		exitCode: 0,
	};
}

async function deltaCmd(args: readonly string[]): Promise<void> {
	const { text, exitCode } = runDeltaCommand(cwd, args, await Bun.stdin.text());
	console.log(text);
	if (exitCode !== 0) process.exit(exitCode);
}

// Ajustes del proyecto → directivas. `--hook` emite el sobre de SessionStart
// (lo llama settings.json); sin flag imprime el bloque en claro, que es lo que
// un agente lee por Bash y lo que un humano quiere ver.
export function buildSettingsBlock(dir: string): string {
	return renderProjectDirectives(resolveProjectDirectives(dir, "claude"));
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
// donde alguien corra `status` por curiosidad. `CC_EIN_NO_GIT_INIT`/`CI`
// permiten opt-out explícito (entornos de CI que no quieren un repo git
// espontáneo). Un fallo de `git init` (binario ausente, destino no
// escribible) se reporta como texto, nunca como excepción propagada: el
// bootstrap es una ayuda, no un requisito para que `status` funcione.
function bootstrapRepoIfNeeded(cwd: string): string | null {
	if (readGitBaseline(cwd).isRepo) return null;
	if (!existsSync(join(cwd, "openspec", "changes"))) return null;
	if (process.env.CC_EIN_NO_GIT_INIT || process.env.CI) return null;
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
	let text = formatStatus(status, active);
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

	return text;
}

function statusCmd() {
	console.log(buildStatusOutput(cwd, change));
}

function checkCmd() {
	const target = change ?? resolveSddStatus(cwd).change;
	if (!target) {
		console.log("/// SDD CHECK — no active change in openspec/changes/.");
		process.exit(1);
	}
	const report = lintChange(cwd, target);
	console.log(formatCheck(report));
	if (report.errors > 0) process.exit(1);
}

function closeCmd() {
	const target = change ?? resolveSddStatus(cwd).change;
	if (!target) {
		console.log("/// SDD CLOSE — no active change to close.");
		process.exit(1);
	}
	const result = closeChange(cwd, target, {
		force,
		reconciliationProfile: flagValue(rest, "--reconciliation-profile"),
		reconciliationEvidencePath: flagValue(rest, "--reconciliation-evidence"),
		legacyReason: flagValue(rest, "--reason"),
	});
	if (result.ok) {
		console.log(`/// SDD CLOSE — ${target} archived → ${result.to}`);
		return;
	}
	const lines = [`/// SDD CLOSE — ${target} NOT archived`, ""];
	for (const b of result.blockers ?? []) lines.push(`- [${b.code}] ${b.message}`);
	if (!result.blockers?.length && result.reason) lines.push(`- ${result.reason}`);
	console.log(lines.join("\n"));
	process.exit(1);
}

// ── Explicit OpenSpec synchronization ───────────────────────────────────────
// The filesystem synchronizer remains the only implementation of planning,
// writes, conflict handling, idempotence, and rollback. This adapter only maps
// its result/error to Claude's stable JSON + exit contract.
type SyncCliOutcome = "synchronized" | "conflict" | "malformed" | "operational_failure" | "usage";
type SyncCliResponse = {
	command: "sync";
	change: string | null;
	ok: boolean;
	outcome: SyncCliOutcome;
	canonicalChanged: boolean;
	domains: string[];
	report: string | null;
	code: string | null;
	message: string | null;
};

function syncResponse(
	response: Omit<SyncCliResponse, "command">,
): SyncCliResponse {
	return { command: "sync", ...response };
}

function emitSyncResponse(response: SyncCliResponse, exitCode: number): void {
	process.stdout.write(`${JSON.stringify(response)}\n`);
	process.exitCode = exitCode;
}

function normalizedSyncDiagnostic(error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	const root = cwd.replaceAll("\\", "/");
	const repositoryRoot = root.endsWith("/") ? root.slice(0, -1) : root;
	return raw
		.replaceAll("\\", "/")
		.replaceAll(repositoryRoot, ".")
		.replace(/\s+/g, " ")
		.trim() || "OpenSpec synchronization failed";
}

const OPEN_SPEC_PARSE_CODES = [
	"invalid-header",
	"invalid-format",
	"invalid-domain",
	"unexpected-blank-line",
	"invalid-scenario-id",
	"invalid-scenario-field",
	"duplicate-scenario-id",
	"invalid-operation",
	"invalid-operation-order",
	"invalid-removal-reason",
	"unexpected-content",
	"empty-operation",
	"invalid-requirement",
];

function isMalformedSyncDiagnostic(diagnostic: string): boolean {
	return OPEN_SPEC_PARSE_CODES.some((code) => diagnostic.includes(code)) ||
		/invalid delta path|duplicate (?:delta|base) domain|domain does not match canonical path/.test(diagnostic);
}

function syncErrorResponse(changeName: string, error: unknown): { response: SyncCliResponse; exitCode: number } {
	if (!isSafeChangeName(changeName)) {
		return {
			response: syncResponse({
				change: changeName,
				ok: false,
				outcome: "malformed",
				canonicalChanged: false,
				domains: [],
				report: null,
				code: "UNSAFE_CHANGE_NAME",
				message: "change name must be a safe repository-relative segment",
			}),
			exitCode: 3,
		};
	}
	if (!existsSync(join(cwd, "openspec", "changes", changeName))) {
		return {
			response: syncResponse({
				change: changeName,
				ok: false,
				outcome: "malformed",
				canonicalChanged: false,
				domains: [],
				report: null,
				code: "CHANGE_NOT_FOUND",
				message: `change '${changeName}' was not found in openspec/changes`,
			}),
			exitCode: 3,
		};
	}

	const diagnostic = normalizedSyncDiagnostic(error);
	if (isMalformedSyncDiagnostic(diagnostic)) {
		return {
			response: syncResponse({
				change: changeName,
				ok: false,
				outcome: "malformed",
				canonicalChanged: false,
				domains: [],
				report: null,
				code: "MALFORMED_OPENSPEC",
				message: `malformed OpenSpec input: ${diagnostic}`,
			}),
			exitCode: 3,
		};
	}
	return {
		response: syncResponse({
			change: changeName,
			ok: false,
			outcome: "operational_failure",
			canonicalChanged: false,
			domains: [],
			report: null,
			code: "OPERATIONAL_ERROR",
			message: diagnostic,
		}),
		exitCode: 4,
	};
}

async function syncCmd(args: string[]): Promise<void> {
	if (args.length !== 1) {
		emitSyncResponse(syncResponse({
			change: null,
			ok: false,
			outcome: "usage",
			canonicalChanged: false,
			domains: [],
			report: null,
			code: "USAGE",
			message: "usage: cc-ein-sdd sync <change>",
		}), 64);
		return;
	}
	const changeName = args[0]!;
	try {
		const result = await synchronizeOpenSpecFilesystem(cwd, changeName);
		const domains = result.plan.domains
			.map((domain) => domain.domain)
			.sort((left, right) => left.localeCompare(right, "en"));
		const synchronized = !result.changed || result.plan.state === "synchronized";
		const canonicalChanged = result.changed && result.plan.state === "synchronized" &&
			result.plan.domains.some((domain) => domain.before !== domain.after);
		if (!synchronized) {
			emitSyncResponse(syncResponse({
				change: changeName,
				ok: false,
				outcome: "conflict",
				canonicalChanged: false,
				domains,
				report: `openspec/changes/${changeName}/sync-report.md`,
				code: "OPENSPEC_CONFLICT",
				message: "canonical OpenSpec bytes were not changed",
			}), 2);
			return;
		}
		emitSyncResponse(syncResponse({
			change: changeName,
			ok: true,
			outcome: "synchronized",
			canonicalChanged,
			domains,
			report: `openspec/changes/${changeName}/sync-report.md`,
			code: null,
			message: null,
		}), 0);
	} catch (error) {
		const failure = syncErrorResponse(changeName, error);
		emitSyncResponse(failure.response, failure.exitCode);
	}
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
		case "delta": await deltaCmd(rest); break;
		case "sync": await syncCmd(rest); break;
		default:
			console.log("cc-ein-sdd <status|check|sync> [change]  |  close <change> [--force] [--reconciliation-profile <profile>] [--reconciliation-evidence <path>] [--reason <reason>]  |  guard (hook)  |  settings [--hook]  |  delta [change] --domain <domain> < operations.json");
			process.exit(1);
	}
}
