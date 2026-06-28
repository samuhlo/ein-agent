// =============================================================================
// EIN AI
// Extensión principal de Ein: ensambla los módulos de lib/ (persona,
// guardrails, model-config, models-panel, sdd-preflight) y registra los
// hooks de sesión y los comandos /ein:*. La lógica vive en lib/; aquí solo
// se cablea.
// =============================================================================

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	ensureSddPreflight,
	gateTddForDelegation,
	getSddPreflightPreferences,
	installSddAssets,
	isSddPreflightTrigger,
	renderSddPreflightPrompt,
	sddGlobalAssetDriftCount,
	sddPreflightSessionKey,
	type SddPreflightPreferences,
} from "../lib/sdd-preflight.ts";
import {
	handleGitCommand,
	messageRequestsDelivery,
	readGitDeliveryMode,
} from "../lib/git-delivery.ts";
import {
	buildEinPrompt,
	handlePersonaCommand,
	readPersonaMode,
} from "../lib/persona.ts";
import {
	LANG_LABEL,
	artifactLanguageDirective,
	handleLangCommand,
	readArtifactLang,
	readChatLang,
} from "../lib/lang.ts";
import { t, tf } from "../lib/i18n/strings.ts";
import { handleTddCommand } from "../lib/tdd.ts";
import { handleModeCommand, readMode } from "../lib/mode.ts";
import {
	confirmCommand,
	confirmDelegatedDelivery,
} from "../lib/guardrails.ts";
import {
	SDD_AGENT_NAMES,
	SDD_AGENT_NAME_SET,
	applyPreset,
	applySavedModelConfig,
	modelConfigPath,
} from "../lib/model-config.ts";
import { handleModelsCommand } from "../lib/models-panel.ts";
import { humanizeAge, listRecentSessions } from "../lib/sessions";
import { lintChange, lintDesignArtifact, type ChangeLintReport } from "../lib/sdd-guardrails.ts";
import { listActiveChanges, resolveSddStatus } from "../lib/sdd-router.ts";
import { archiveChange } from "../lib/sdd-archive.ts";
import {
	codeConventionSkillBlock,
	migrateLegacyAtl,
	resolveSkillInjection,
} from "./ein-skill-registry.ts";
import { ensureEinGitignore } from "../lib/gitignore.ts";
import {
	einContextDirective,
	einMdCommitsBehind,
	handleInitCommand,
	readEinMd,
} from "../lib/project-context.ts";
import { AGENT_DIR } from "./ein-paths";

// ─── Detección de eventos de subagentes ──────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Intención de entrega del ÚLTIMO mensaje del usuario, por sesión. La fija el
// hook `input` y la lee el gate de entrega en `tool_call`: en modo git `auto`,
// si el usuario pidió commit/push/PR, no se le vuelve a preguntar. Se sobreescribe
// en cada mensaje (vale hasta el siguiente) → una entrega por iniciativa del
// agente, sin petición previa, sí dispara la confirmación.
const deliveryIntentBySession = new Map<string, boolean>();

function readStringPath(value: unknown, path: string[]): string | undefined {
	let current = value;
	for (const key of path) {
		if (!isRecord(current)) return undefined;
		current = current[key];
	}
	return typeof current === "string" ? current : undefined;
}

function readAgentStartNames(event: unknown): string[] {
	return [
		readStringPath(event, ["agentName"]),
		readStringPath(event, ["agent"]),
		readStringPath(event, ["name"]),
		readStringPath(event, ["agent", "name"]),
		readStringPath(event, ["subagent", "name"]),
	]
		.filter((value): value is string => value !== undefined)
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

function isSddAgentStartEvent(event: unknown): boolean {
	const candidates = readAgentStartNames(event);
	if (candidates.some((value) => SDD_AGENT_NAME_SET.has(value))) return true;

	const systemPrompt = readStringPath(event, ["systemPrompt"]) ?? "";
	return SDD_AGENT_NAMES.some((name) => {
		const phase = name.replace(/^sdd-/, "");
		return new RegExp(`\\bSDD ${phase} executor\\b`, "i").test(systemPrompt);
	});
}

function isNamedAgentStartEvent(event: unknown): boolean {
	return readAgentStartNames(event).length > 0;
}

function readAgentTask(event: unknown): string {
	const candidates = [
		readStringPath(event, ["task"]),
		readStringPath(event, ["prompt"]),
		readStringPath(event, ["userPrompt"]),
		readStringPath(event, ["input", "task"]),
		readStringPath(event, ["input", "prompt"]),
		readStringPath(event, ["message"]),
	].filter(
		(value): value is string =>
			typeof value === "string" && value.trim().length > 0,
	);
	if (candidates.length > 0) return candidates.join("\n");
	return readStringPath(event, ["systemPrompt"]) ?? "";
}

// Devuelve true si `name` es un directorio existente en openspec/changes/.
function changeDirExists(cwd: string, name: string): boolean {
	const base = join(cwd, "openspec", "changes", name);
	try {
		return statSync(base).isDirectory();
	} catch {
		return false;
	}
}

// Devuelve el design.md mas reciente bajo openspec/changes/<change>/, o null.
// Lo usa /ein:sdd-check cuando no se pasa una ruta explicita.
function findLatestDesign(cwd: string): string | null {
	const changesDir = join(cwd, "openspec", "changes");
	if (!existsSync(changesDir)) return null;
	let best: { path: string; mtimeMs: number } | null = null;
	let entries: string[] = [];
	try {
		entries = readdirSync(changesDir);
	} catch {
		return null;
	}
	for (const entry of entries) {
		const designPath = join(changesDir, entry, "design.md");
		try {
			const st = statSync(designPath);
			if (st.isFile() && (!best || st.mtimeMs > best.mtimeMs)) {
				best = { path: designPath, mtimeMs: st.mtimeMs };
			}
		} catch {
			// sin design.md en este change
		}
	}
	return best?.path ?? null;
}

// Formatea un ChangeLintReport como salida legible para el comando /ein:sdd-check.
// La herramienta ein_sdd_check sigue devolviendo JSON (contrato del orquestador).
function formatChangeLint(report: ChangeLintReport): string {
	const { change, errors, warnings, phases } = report;
	const present = phases.filter((p) => p.present);
	const total = phases.length;
	const presentCount = present.length;

	const lines: string[] = [
		`/// 000. SDD CHECK — ${change}`,
		"",
		`fases: ${presentCount}/${total} presentes  |  errores: ${errors}  |  warnings: ${warnings}`,
	];

	for (const { phase, present: isPresent, report: pr } of phases) {
		if (!isPresent) {
			lines.push(`■ ${phase} — MISSING`);
			continue;
		}
		const ok = pr!.errors === 0;
		const icon = ok ? "OK" : "ERRORS";
		const detail = pr!.lineCount > 0 ? `, ${pr!.lineCount} lineas` : "";
		lines.push(`■ ${phase} — ${icon} (presente${detail})`);
		if (pr!.issues.length > 0) {
			for (const i of pr!.issues) {
				lines.push(`  - ${i.level.toUpperCase()} [${i.code}]: ${i.message}`);
			}
		}
	}

	return lines.join("\n");
}

// ─── Extensión ────────────────────────────────────────────────────────────────

export default function einAi(pi: ExtensionAPI): void {
	function runSddPreflight(ctx: ExtensionContext): Promise<SddPreflightPreferences> {
		return ensureSddPreflight(ctx, {
			pi,
			installAssets: (cwd) => installSddAssets(cwd, false),
			applyModelConfig: async () => applySavedModelConfig(ctx),
		});
	}

	pi.on("session_start", async (_event, ctx) => {
		// Higiene del proyecto: un único bloque gestionado en .gitignore y
		// limpieza del antiguo .atl/ (ahora .pi/ein/atl/). Best-effort, no rompe.
		ensureEinGitignore(ctx.cwd);
		migrateLegacyAtl(ctx.cwd);
		try {
			const installResult = installSddAssets(ctx.cwd, false);
			const modelResult = await applySavedModelConfig(ctx);
			if (ctx.hasUI && modelResult.invalidPath) {
				ctx.ui.notify(
					tf(
						"ai.models.invalid",
						`Ein omitio la config de modelos: ${modelResult.invalidPath} no es JSON valido. Corrigelo o eliminalo y vuelve a ejecutar /ein:models.`,
						modelResult.invalidPath,
					),
					"warning",
				);
				return;
			}
			if (ctx.hasUI && modelResult.updated > 0) {
				ctx.ui.notify(
					tf(
						"ai.models.applied",
						`Config de modelos aplicada a ${modelResult.updated} agente(s). Assets SDD listos: ${installResult.agents} agente(s), ${installResult.chains} chain(s), ${installResult.support} soporte.`,
						modelResult.updated,
						installResult.agents,
						installResult.chains,
						installResult.support,
					),
					"info",
				);
			}
		} catch (error) {
			if (ctx.hasUI) {
				const message =
					error instanceof Error ? error.message : String(error);
				ctx.ui.notify(
					tf("ai.models.error", `Error al aplicar config de modelos: ${message}`, message),
					"warning",
				);
			}
		}
	});

	pi.on("input", async (event, ctx) => {
		// Intención de entrega del turno: ¿este mensaje pide commit/push/PR? La lee
		// el gate de entrega en `tool_call` (modo git `auto`). Se actualiza SIEMPRE,
		// también en mensajes sin SDD, y reemplaza la del turno anterior.
		if (typeof event.text === "string") {
			deliveryIntentBySession.set(
				sddPreflightSessionKey(ctx),
				messageRequestsDelivery(event.text),
			);
		}
		if (typeof event.text !== "string" || !isSddPreflightTrigger(event.text)) {
			return { action: "continue" };
		}
		await runSddPreflight(ctx);
		// El gate de TDD ya no vive aquí: se dispara en tool_call ante CUALQUIER
		// delegación que escriba código (sdd-apply directo o dentro de un chain),
		// no solo en el trigger SDD explícito. Así un cambio de código ad-hoc
		// también pregunta, y el flujo SDD explícito no pregunta dos veces.
		return { action: "continue" };
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const isSddAgent = isSddAgentStartEvent(event);
		const isNamedAgent = isNamedAgentStartEvent(event);
		if (isSddAgent && !getSddPreflightPreferences(ctx)) {
			await runSddPreflight(ctx);
		}
		const prefs = getSddPreflightPreferences(ctx);
		const startNames = readAgentStartNames(event);
		// Convenciones de codigo (comment/logging/file-naming): SOLO donde se
		// escribe codigo — el parent (trabajo inline) y sdd-apply. Inyectarlas en
		// delivery/linear/explore solo hacia que el modelo barato leyera 3 SKILL.md
		// inutiles (gasto de tokens) sin escribir codigo. Tambien gobierna si la
		// linea de Strict TDD entra en el preflight: solo donde hay RED/GREEN real.
		const writesCode = (!isNamedAgent && !isSddAgent) || startNames.includes("sdd-apply");
		const sddPrompt =
			prefs && (!isNamedAgent || isSddAgent)
				? `\n\n${renderSddPreflightPrompt(prefs, { includeTdd: writesCode })}`
				: "";
		const einPrompt = isNamedAgent || isSddAgent
			? ""
			: `\n\n${buildEinPrompt(readPersonaMode(ctx.cwd), readChatLang(), readMode(ctx.cwd))}`;
		// Deterministic skill injection: phase/named subagents receive exact
		// SKILL.md paths resolved from their task, not the parent model's discretion.
		let skillsPrompt = "";
		if (isNamedAgent || isSddAgent) {
			const block = resolveSkillInjection(ctx.cwd, readAgentTask(event));
			if (block) skillsPrompt = `\n\n${block}`;
		}
		// Idioma de artefactos: los agentes de delivery (PR/commits/Linear) reciben
		// la directiva autoritativa segun .pi/ein/lang.json (o el idioma de chat).
		let artifactPrompt = "";
		if (isNamedAgent && startNames.some((n) => n === "ein-git" || n === "ein-linear")) {
			artifactPrompt = `\n\n${artifactLanguageDirective(readArtifactLang(ctx.cwd))}`;
		}
		const conventions = writesCode ? codeConventionSkillBlock(ctx.cwd) : "";
		const conventionsPrompt = conventions ? `\n\n${conventions}` : "";
		// Contexto de proyecto (EIN.md): verdad de base para el parent y las fases
		// SDD; los agentes de delivery (PR/Linear) no lo necesitan.
		const wantsContext = !isNamedAgent || isSddAgent;
		const context = wantsContext ? einContextDirective(ctx.cwd) : "";
		const contextPrompt = context ? `\n\n${context}` : "";
		return {
			systemPrompt: `${event.systemPrompt}${einPrompt}${sddPrompt}${skillsPrompt}${artifactPrompt}${conventionsPrompt}${contextPrompt}`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		// Delegaciones con push: el usuario confirma aquí (sesión con UI) y se
		// emite el grant one-shot que el guard headless del subagente consume.
		if (event.toolName === "subagent") {
			// Gate de TDD ante una delegación que escribe código (sdd-apply directo
			// o dentro de un chain). En modo global "ask": si el orquestador clasificó
			// el cambio (hint tdd off/strict) se fija sin preguntar; si no, pregunta.
			// Así un mover/renombrar/config marcado off no interrumpe el flujo.
			await gateTddForDelegation(event.input, ctx);
			return confirmDelegatedDelivery(event.input, ctx, {
				mode: readGitDeliveryMode(ctx.cwd),
				userRequested:
					deliveryIntentBySession.get(sddPreflightSessionKey(ctx)) ?? false,
			});
		}
		if (event.toolName !== "bash") return undefined;
		if (!isRecord(event.input) || typeof event.input.command !== "string")
			return undefined;
		return confirmCommand(event.input.command, ctx);
	});

	pi.registerCommand("ein:ai:install-sdd", {
		description: t(
			"cmd.install-sdd.description",
			"Reinstalar o refrescar los agentes y chains SDD globales de Ein",
		),
		handler: async (args, ctx) => {
			const force = args.includes("--force");
			const result = installSddAssets(ctx.cwd, force);
			ctx.ui.notify(
				tf(
					"ai.sdd.installed",
					`Assets SDD: ${result.agents} agente(s), ${result.chains} chain(s), ${result.support} soporte disponibles (${result.installed} instalados, ${result.skipped} ya presentes).`,
					result.agents,
					result.chains,
					result.support,
					result.installed,
					result.skipped,
				),
				"info",
			);
		},
	});

	pi.registerCommand("ein:ai:sdd-preflight", {
		description: t(
			"cmd.sdd-preflight.description",
			"Ejecutar o reutilizar el preflight SDD para esta sesion de Pi",
		),
		handler: async (_args, ctx) => {
			await runSddPreflight(ctx);
		},
	});

	pi.registerCommand("ein:models", {
		description: t(
			"cmd.models.description",
			"Ver o configurar los modelos activos por agente en Ein",
		),
		handler: async (_args, ctx) => {
			await handleModelsCommand(ctx);
		},
	});

	pi.registerCommand("ein:models:full", {
		description: t(
			"cmd.models.full.description",
			"Preset full: orquestador + sdd-design → gpt-5.5, resto → MiniMax-M2.7",
		),
		handler: (_args, ctx) => {
			const msg = applyPreset(ctx.cwd, "full");
			ctx.ui.notify(msg, "info");
		},
	});

	pi.registerCommand("ein:models:lite", {
		description: t(
			"cmd.models.lite.description",
			"Preset lite: orquestador + sdd-design → MiniMax-M3, resto → MiniMax-M2.7",
		),
		handler: (_args, ctx) => {
			const msg = applyPreset(ctx.cwd, "lite");
			ctx.ui.notify(msg, "info");
		},
	});

	pi.registerCommand("ein:persona", {
		description: t(
			"cmd.persona.description",
			"Cambiar la persona de Ein entre samuhlo y neutral",
		),
		handler: async (_args, ctx) => {
			await handlePersonaCommand(ctx);
		},
	});

	pi.registerCommand("ein:lang", {
		description: t(
			"cmd.lang.description",
			"Ver o cambiar el idioma de Ein (conversación/UI y artefactos PR/commit/Linear)",
		),
		handler: async (_args, ctx) => {
			await handleLangCommand(ctx);
		},
	});

	pi.registerCommand("ein:tdd", {
		description: t(
			"cmd.tdd.description",
			"Ver o cambiar el modo de TDD estricto (auto/strict/off/ask)",
		),
		handler: async (_args, ctx) => {
			await handleTddCommand(ctx);
		},
	});

	pi.registerCommand("ein:git", {
		description: t(
			"cmd.git.description",
			"Ver o cambiar la confirmación de entrega git (auto/ask/off)",
		),
		handler: async (_args, ctx) => {
			await handleGitCommand(ctx);
		},
	});

	pi.registerCommand("ein:mode", {
		description: t(
			"cmd.mode.description",
			"Ver o cambiar el modo de trabajo (solo/team): Linear opcional",
		),
		handler: async (_args, ctx) => {
			await handleModeCommand(ctx);
		},
	});

	pi.registerCommand("ein:init", {
		description: t(
			"cmd.init.description",
			"Generar o refrescar EIN.md (contexto de proyecto: comandos, arquitectura, convenciones)",
		),
		handler: async (_args, ctx) => {
			await handleInitCommand(ctx);
		},
	});

	pi.registerCommand("ein:resume", {
		description: t(
			"cmd.resume.description",
			"Listar sesiones recientes con el comando para recuperarlas",
		),
		handler: async (_args, ctx) => {
			const sessions = listRecentSessions(8);
			const lines: string[] = [t("resume.title", "/// 000. SESIONES RECIENTES"), ""];
			if (!sessions.length) {
				lines.push(t("resume.none", "- No hay sesiones guardadas todavia."));
			} else {
				lines.push(
					t(
						"resume.shortcuts",
						"- Atajos: `pi -c` (continuar ultima) · `pi -r` (elegir sesion)",
					),
				);
				lines.push("");
				for (const s of sessions) {
					lines.push(`- ${s.project} (${humanizeAge(s.ageMs)})`);
					lines.push(`  pi --session ${s.id}`);
				}
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// ── SDD audit (canonical) / sdd-check (legacy alias) ──────────────────────
	async function handleSddAudit(args: string | string[], ctx: ExtensionContext) {
		const raw = typeof args === "string" ? args : Array.isArray(args) ? args.join(" ") : "";
		const arg = raw.trim();

		if (!arg) {
			const status = resolveSddStatus(ctx.cwd);
			if (!status.change) {
				ctx.ui.notify(
					"No hay cambio activo. Uso: /ein:sdd-audit <change>  |  /ein:sdd-audit <path-to-design.md>",
					"warning",
				);
				return;
			}
			const report = lintChange(ctx.cwd, status.change);
			ctx.ui.notify(formatChangeLint(report), report.errors ? "warning" : "info");
			return;
		}

		const candidatePath = arg.startsWith("/") ? arg : join(ctx.cwd, arg);
		if (existsSync(candidatePath)) {
			const report = lintDesignArtifact(readFileSync(candidatePath, "utf8"));
			const rel = candidatePath.startsWith(ctx.cwd)
				? candidatePath.slice(ctx.cwd.length + 1)
				: candidatePath;
			const status = report.errors
				? "FAIL"
				: report.warnings
					? "OK_WITH_WARNINGS"
					: "OK";
			const out: string[] = [
				"/// 000. SDD DESIGN CHECK",
				"",
				`design: ${rel}`,
				`resultado: ${status}  |  errores: ${report.errors}  |  warnings: ${report.warnings}  |  lineas: ${report.lineCount}`,
			];
			if (report.issues.length) {
				out.push("");
				for (const i of report.issues) {
					out.push(`- ${i.level.toUpperCase()} [${i.code}]: ${i.message}`);
				}
			} else {
				out.push("", "- Design limpio: secciones completas, tareas accionables, sin planificacion prohibida.");
			}
			ctx.ui.notify(out.join("\n"), report.errors ? "warning" : "info");
			return;
		}

		if (changeDirExists(ctx.cwd, arg)) {
			const report = lintChange(ctx.cwd, arg);
			ctx.ui.notify(formatChangeLint(report), report.errors ? "warning" : "info");
			return;
		}

		ctx.ui.notify(
			`No encontre '${arg}' como path ni como cambio en openspec/changes/. Uso: /ein:sdd-audit <change>  |  /ein:sdd-audit <path-to-design.md>`,
			"warning",
		);
	}

	pi.registerCommand("ein:sdd-audit", {
		description: t("cmd.sdd-audit.description", "Validate a change (all phases) or lint a design.md path"),
		handler: async (args, ctx) => handleSddAudit(args, ctx),
	});

	pi.registerCommand("ein:sdd-check", {
		description: t("cmd.sdd-check.description", "[legacy] Use /ein:sdd-audit"),
		handler: async (args, ctx) => handleSddAudit(args, ctx),
	});

	// ── Tool determinista: estado SDD (lo llama el ORQUESTADOR para enrutar) ──
	pi.registerTool({
		name: "ein_sdd_status",
		label: "Ein SDD Status",
		description:
			"Deterministic SDD state for the active change (or a named one): which phase artifacts exist, verify outcome, and the nextRecommended phase. Route the SDD flow by THIS, never by guessing. Reads only the filesystem.",
		parameters: {
			type: "object",
			properties: { change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." } },
		} as const,
		async execute(_id, params: { change?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const status = resolveSddStatus(ctx.cwd, params?.change);
			const active = listActiveChanges(ctx.cwd);
			return { content: [{ type: "text", text: JSON.stringify({ ...status, activeChanges: active }, null, 2) }], details: {} };
		},
	});

	// ── Tool determinista: gatekeeper de artefactos de un cambio ──
	pi.registerTool({
		name: "ein_sdd_check",
		label: "Ein SDD Check",
		description:
			"Deterministic gatekeeper: lint every present SDD artifact of a change (sections, required signals like verify's status line, placeholders, size). Run it AFTER each phase before advancing. Returns ok + per-phase issues. Reads only the filesystem.",
		parameters: {
			type: "object",
			properties: { change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." } },
		} as const,
		async execute(_id, params: { change?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change;
			if (!change) {
				return { content: [{ type: "text", text: JSON.stringify({ ok: false, reason: "no active change" }) }], details: {} };
			}
			return { content: [{ type: "text", text: JSON.stringify(lintChange(ctx.cwd, change), null, 2) }], details: {} };
		},
	});

	pi.registerCommand("ein:sdd-status", {
		description: t("cmd.sdd-status.description", "Estado SDD determinista del cambio activo (en qué fase va, qué toca)"),
		handler: async (_args, ctx) => {
			const s = resolveSddStatus(ctx.cwd);
			const active = listActiveChanges(ctx.cwd);
			const lines = ["/// 000. SDD STATUS", ""];
			if (!s.change) {
				lines.push("- " + t("sdd-status.none", "No hay cambios SDD activos en openspec/changes/."));
			} else {
				const done = (Object.keys(s.present) as (keyof typeof s.present)[])
					.filter((p) => s.present[p])
					.join(", ") || t("sdd-status.no-active", "ninguno");
				lines.push(`${t("sdd-status.change", "change")}: ${s.change}`);
				if (active.length > 1) lines.push(`${t("sdd-status.active", "active")}: ${active.join(", ")}`);
				lines.push(`${t("sdd-status.phases", "phases done")}: ${done}`);
				lines.push(`${t("sdd-status.apply", "apply")}: ${s.apply}`);
				lines.push(`${t("sdd-status.verify", "verify")}: ${s.verify}`);
				lines.push(`${t("sdd-status.next", "next")}: ${s.nextRecommended}`);
				if (s.blocked.length) {
					lines.push("");
					lines.push(`■ ${t("sdd-status.blocked", "blockers")}:`);
					for (const b of s.blocked) lines.push(`- ${b}`);
				}
			}
			ctx.ui.notify(lines.join("\n"), s.blocked.length ? "warning" : "info");
		},
	});

	// ── SDD close (canonical) / sdd-archive (legacy alias) ────────────────────
	async function handleSddClose(args: string | string[], ctx: ExtensionContext) {
		const change = (typeof args === "string" ? args : "").trim() || resolveSddStatus(ctx.cwd).change || "";
		if (!change) {
			ctx.ui.notify("Sin cambio que archivar. Uso: /ein:sdd-close <change>", "warning");
			return;
		}
		const r = archiveChange(ctx.cwd, change);
		ctx.ui.notify(
			r.ok
				? `Cambio '${change}' archivado en openspec/changes/archive/. openspec/changes/ queda limpio.`
				: `No se archivó '${change}': ${r.reason}`,
			r.ok ? "info" : "warning",
		);
	}

	pi.registerCommand("ein:sdd-close", {
		description: t("cmd.sdd-close.description", "Close a verified change: move openspec/changes/<x> to archive/"),
		handler: async (args, ctx) => handleSddClose(args, ctx),
	});

	pi.registerCommand("ein:sdd-archive", {
		description: t("cmd.sdd-archive.description", "[legacy] Use /ein:sdd-close"),
		handler: async (args, ctx) => handleSddClose(args, ctx),
	});

	pi.registerCommand("ein:status", {
		description: t(
			"cmd.status.description",
			"Ver estado del sistema Ein (agentes, chains, skills, proyecto)",
		),
		handler: async (_args, ctx) => {
			const agentsDir = join(AGENT_DIR, "agents");
			const chainsDir = join(AGENT_DIR, "chains");
			const skillsLocalDir = join(AGENT_DIR, "skills", "local");
			const skillsDownloadedDir = join(AGENT_DIR, "skills", "downloaded");
			const mcpFile = join(AGENT_DIR, "mcp.json");

			const agents = existsSync(agentsDir)
				? readdirSync(agentsDir).filter((f) => f.endsWith(".md")).sort()
				: [];
			const chains = existsSync(chainsDir)
				? readdirSync(chainsDir).filter((f) => f.endsWith(".chain.md")).sort()
				: [];

			function countDirs(dir: string): number {
				if (!existsSync(dir)) return 0;
				try {
					return readdirSync(dir).length;
				} catch {
					return 0;
				}
			}

			const localSkills = countDirs(skillsLocalDir);
			const downloadedSkills = countDirs(skillsDownloadedDir);
			const openspecConfigured = existsSync(join(ctx.cwd, "openspec", "config.yaml"));
			const staleDrift = sddGlobalAssetDriftCount();

			let mcpServers: string[] = [];
			if (existsSync(mcpFile)) {
				try {
					const cfg = JSON.parse(readFileSync(mcpFile, "utf8")) as {
						mcpServers?: Record<string, unknown>;
					};
					mcpServers = Object.keys(cfg.mcpServers ?? {});
				} catch {
					mcpServers = [];
				}
			}

			const lines: string[] = [];
			const chatLang = readChatLang();
			const artifactLang = readArtifactLang(ctx.cwd);
			lines.push("/// 000. EIN STATUS");
			lines.push(`${t("status.author", "autor")}: samuhlo`);
			lines.push(`${t("status.mode", "modo")}: ${readMode(ctx.cwd)}`);
			lines.push(`${t("status.persona", "persona")}: ${readPersonaMode(ctx.cwd)}`);
			lines.push(
				`${t("status.git", "entrega git")}: ${readGitDeliveryMode(ctx.cwd)}`,
			);
			lines.push(
				`${t("status.lang", "idioma")}: ${t("status.lang.chat", "conversación")}=${LANG_LABEL[chatLang]} · ${t("status.lang.artifacts", "artefactos")}=${LANG_LABEL[artifactLang]}`,
			);
			lines.push(
				`${t("status.state", "estado")}: ${staleDrift > 0 ? t("status.state.drift", "drift detectado") : t("status.state.ok", "operativo")}`,
			);
			lines.push("");

			lines.push(`■ 001. ${t("status.sdd", "SDD")}`);
			lines.push(`${t("status.agents", "agentes")}: ${agents.length}`);
			for (const a of agents) lines.push(`- ${a}`);
			lines.push(`${t("status.chains", "chains")}: ${chains.length}`);
			for (const c of chains) lines.push(`- ${c}`);
			{
				const s = resolveSddStatus(ctx.cwd);
				const active = listActiveChanges(ctx.cwd);
				if (!s.change) {
					lines.push(`${t("status.sdd.active", "active change")}: ${t("status.sdd.none", "none")}`);
				} else if (active.length === 1) {
					lines.push(`${t("status.sdd.active", "active change")}: ${s.change} · next: ${s.nextRecommended} · apply: ${s.apply} · verify: ${s.verify}`);
				} else {
					lines.push(tf("status.sdd.multi", "{0} active", active.length) + `: ${active.join(", ")} · next: ${s.nextRecommended}`);
				}
			}
			if (staleDrift > 0)
				lines.push(
					`drift: ${staleDrift} ${t("status.drift.files", "archivo(s) desincronizado(s)")} — /ein:ai:install-sdd --force ${t("status.drift.refresh", "para refrescar")}`,
				);
			lines.push("");

			lines.push(`■ 002. ${t("status.skills", "SKILLS")}`);
			lines.push(`${t("status.skills.local", "locales")}: ${localSkills}`);
			lines.push(`${t("status.skills.downloaded", "descargadas")}: ${downloadedSkills}`);
			lines.push("");

			lines.push(`■ 003. ${t("status.project", "PROYECTO")}`);
			const einMd = readEinMd(ctx.cwd);
			if (!einMd.exists) {
				lines.push(`EIN.md: ${t("status.einmd.absent", "ausente — /ein:init para generarlo")}`);
			} else {
				const behind = einMdCommitsBehind(ctx.cwd);
				const fresh =
					behind === undefined
						? t("status.einmd.present", "presente")
						: behind === 0
							? t("status.einmd.fresh", "al día")
							: tf("status.einmd.stale", `{0} commits atrás — /ein:init para refrescar`, behind);
				lines.push(`EIN.md: ${fresh}`);
			}
			lines.push(`openspec: ${openspecConfigured ? t("status.openspec.configured", "configurado") : t("status.openspec.unconfigured", "no configurado — /sdd-init para arrancar")}`);
			lines.push(`${t("status.model", "modelo")}: ${existsSync(modelConfigPath(ctx.cwd)) ? t("status.model.present", "config presente") : t("status.model.absent", "sin config local")}`);
			lines.push("");

			lines.push("■ 004. MCP");
			if (mcpServers.length > 0) {
				lines.push(`${t("status.mcp.servers", "servidores")}: ${mcpServers.join(", ")}`);
			} else {
				lines.push(`${t("status.mcp.servers", "servidores")}: ${t("status.mcp.none", "ninguno configurado")}`);
			}
			lines.push("");

			lines.push(`■ 005. ${t("status.diag", "DIAGNOSTICO")}`);
			lines.push(`- ${"/ein:doctor-output"} ${t("status.diag.output", "para smoke checks tecnicos")}`);
			lines.push(`- ${"/ein:doctor"} ${t("status.diag.doctor", "para diagnostico explicativo")}`);

			const level = staleDrift > 0 ? "warning" : "info";
			ctx.ui.notify(lines.join("\n"), level);
		},
	});

	pi.registerCommand("ein:help", {
		description: t(
			"cmd.help.description",
			"Ayuda del sistema Ein — usa 'full' para detalle completo",
		),
		handler: async (args, ctx) => {
			const mode = (Array.isArray(args) ? args.join(" ") : String(args ?? ""))
				.trim()
				.toLowerCase();
			const text =
				mode === "full"
					? t("help.full", "Ein listo. Autor: samuhlo. (i18n no disponible)")
					: t("help.short", "/// AYUDA EIN — autor: samuhlo");
			ctx.ui.notify(text, "info");
		},
	});
}
