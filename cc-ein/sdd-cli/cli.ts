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
//   cc-ein-sdd close  <change> [--force]   archiva un cambio verificado
// =============================================================================

import {
	resolveSddStatus,
	resolveSddPlanPreview,
	formatSddPlanPreview,
	sddStatusBlockers,
	formatBudget,
	listActiveChanges,
	type SddChangeStatus,
} from "../../ein-pi/agent/lib/sdd-router.ts";
import { lintChange, type ChangeLintReport } from "../../ein-pi/agent/lib/sdd-guardrails.ts";
import { closeChange } from "../../ein-pi/agent/lib/sdd-close.ts";
import {
	evaluateDeniedCommand,
	commandRequiresConfirmation,
	commandIsExplicitlyAllowed,
} from "../../ein-pi/agent/lib/guardrails.ts";
import { readGitBaseline, renderWorkingTreeLine } from "../../ein-pi/agent/lib/git-baseline.ts";
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

// ── Dispatch ────────────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);
const force = rest.includes("--force");
const change = rest.find((a) => !a.startsWith("--"));

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
	const result = closeChange(cwd, target, { force });
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

// Guardado tras `import.meta.main`: los tests importan este módulo para
// llamar a `resolveGuardDecision()` directamente (sin subproceso), y sin este
// guard el dispatch correría con el argv del test runner y mataría el proceso.
if (import.meta.main) {
	switch (cmd) {
		case "status": statusCmd(); break;
		case "check": checkCmd(); break;
		case "close": closeCmd(); break;
		case "guard": await guardCmd(); break;
		default:
			console.log("cc-ein-sdd <status|check|close> [change] [--force]  |  guard (hook)");
			process.exit(1);
	}
}
