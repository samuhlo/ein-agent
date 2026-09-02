// =============================================================================
// EIN AI
// Extensión principal de Ein: ensambla los módulos de lib/ (persona,
// guardrails, model-config, models-panel, sdd-preflight) y registra los
// hooks de sesión y los comandos /ein:*. La lógica vive en lib/; aquí solo
// se cablea.
// =============================================================================

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	ensureApplyAcceptance,
	ensureApplyTurnBudget,
	ensurePhaseRuntime,
	ensureDelegationAcceptance,
	ensureParticipantForeground,
	isSddParticipantMarker,
	ensurePlanningAcceptance,
	ensureSddPreflight,
	gateTddForDelegation,
	getSddPreflightPreferences,
	getSddSessionMemory,
	installSddAssets,
	isSddPreflightTrigger,
	renderMemoryAdvisory,
	renderSddPreflightPrompt,
	sddGlobalAssetDriftCount,
	sddPreflightSessionKey,
	type SddPreflightPreferences,
} from "../lib/sdd-preflight.ts";
import { bootstrapOpenSpecConfig } from "../lib/openspec-config-bootstrap.ts";
import { collectDelegationItems, delegationShapeIsUnrecognized } from "../lib/delegation-shape.ts";
import {
	type DeliveryIntent,
	deliveryIntentActive,
	nextDeliveryIntent,
	readGitDeliveryMode,
} from "../lib/git-delivery.ts";
import { buildEinPrompt, readPersonaMode } from "../lib/persona.ts";
import {
	LANG_LABEL,
	artifactLanguageDirective,
	readArtifactLang,
	readChatLang,
} from "../lib/lang.ts";
import { t, tf } from "../lib/i18n/strings.ts";
import { maybeWrapBashInput } from "../lib/hypa.ts";
import { runOnboarding } from "../lib/onboarding.ts";
import {
	codegraphDirective,
	offerCodegraphInit,
	shouldOfferCodegraphInit,
} from "../lib/codegraph.ts";
import { readLinearIntegration } from "../lib/linear-integration.ts";
import {
	confirmCommand,
	confirmDelegatedDelivery,
} from "../lib/guardrails.ts";
import {
	formatReconciliation,
	reconcilePhaseFailure,
	resolveDelegationPhase,
	snapshotPhaseArtifacts,
	type PhaseSnapshot,
} from "../lib/sdd-reconcile.ts";
import { applySavedModelConfig, modelConfigPath } from "../lib/model-config.ts";
import { registerAdvisoryTools } from "./internal/ein-advisory-tools.ts";
import { registerGeneralCommands } from "./internal/ein-general-commands.ts";
import { canonicalSpecPrompt } from "./internal/ein-canonical-spec-context.ts";
import {
	isNamedAgentStartEvent,
	isRecord,
	isSddAgentStartEvent,
	readAgentStartNames,
	readAgentTask,
	readExplicitSddChange,
	recognizePiParticipantTerminal,
} from "./internal/ein-pi-event-contracts.ts";
import { createPiIntentGate } from "./internal/ein-pi-intent-gate.ts";
import { registerOpenSpecWriteTools } from "./internal/ein-openspec-write-tools.ts";
import {
	memoryLifecycleForSession,
} from "./internal/ein-sdd-memory.ts";
import { registerSddLifecycleTools } from "./internal/ein-sdd-lifecycle-tools.ts";
import { registerSddChangeSettings } from "./internal/ein-sdd-change-settings.ts";
import { registerSddReadSurface } from "./internal/ein-sdd-read-surface.ts";
import { createEinToolRegistrar } from "./internal/ein-tool-registration.ts";
import type { SddPhase } from "../lib/sdd-guardrails.ts";
import { resolveActiveChange } from "../lib/sdd-preflight-record.ts";
import { aggregateSddBudget, formatBudget, listActiveChangeSummaries, resolveSddNext, sddNextHandoff } from "../lib/sdd-router.ts";
import {
	codeConventionSkillBlock,
	resolveSkillInjection,
} from "./ein-skill-registry.ts";
import { ensureEinGitignore } from "../lib/gitignore.ts";
import {
	einContextDirective,
	einMdCommitsBehind,
	readEinMd,
} from "../lib/project-context.ts";
import { AGENT_DIR } from "./ein-paths";
import { readInstalledVersion, staleSessionNudge } from "../lib/session-version";
import { evaluateStaging } from "../lib/git-staging.ts";
import { acceptTrackedScoutResult, normalizeScoutLaunch, type ScoutTracking } from "../lib/scout-contract.ts";
import {
	clearAgentControlSession,
	internalAgentRoutingDirective,
	readAgentControlStatus,
	routeAgentControl,
	type EinInternalAgent,
} from "../lib/agent-controls.ts";
import { admitSddParticipantCall, clearSddParticipantSession, completeSddParticipantCall, getSddParticipantCall, participantResultIsUnrecognized, sddParticipantCallsAreTracked, type SddParticipant } from "../lib/sdd-participants.ts";

// ─── Detección de eventos de subagentes ──────────────────────────────────────

const deliveryIntentBySession = new Map<string, DeliveryIntent>();

// Foto del artefacto de fase justo ANTES de delegar, por toolCallId. La lee el
// hook `tool_result` para distinguir "la fase no se hizo" de "el runner falló
// por algo ajeno al trabajo". Sin la foto no se reconcilia nada: un artefacto
// preexistente no puede rescatar un run que no escribió nada.
const phaseSnapshotByToolCall = new Map<
	string,
	{ phase: SddPhase; before: PhaseSnapshot }
>();

const scoutTracking: ScoutTracking = new Map();

// Sesiones ya avisadas del drift de forma. Un aviso por sesión: el problema es
// del runtime instalado, no de la delegación concreta, y repetirlo en cada
// llamada solo taparía el resto.
const shapeDriftWarned = new Set<string>();

// Espejo del canario de admisión, del lado de la RECOGIDA (A-3): si Ein deja de
// reconocer la forma del resultado de un participante rastreado, avisa una vez
// por sesión en vez de perder la evidencia en silencio.
const participantResultDriftWarned = new Set<string>();
function warnParticipantResultDrift(ctx: ExtensionContext): void {
	const key = sddPreflightSessionKey(ctx);
	if (participantResultDriftWarned.has(key)) return;
	participantResultDriftWarned.add(key);
	ctx.ui.notify(
		t(
			"ai.delegation.participant-result-drift",
			"Ein no reconoce la forma del resultado de este participante SDD: la evidencia no se registra. Actualiza Ein (`ein update`).",
		),
		"warning",
	);
}

function rememberPhaseSnapshot(
	toolCallId: string,
	input: unknown,
	cwd: string,
): void {
	const phase = resolveDelegationPhase(input);
	if (!phase) return;
	phaseSnapshotByToolCall.set(toolCallId, {
		phase,
		before: snapshotPhaseArtifacts(cwd, phase),
	});
}
// Versión instalada al arrancar cada sesión + sesiones ya avisadas: si `ein
// update` corre a mitad de sesión, esta sigue con la plantilla vieja → nudge de
// reinicio (una vez).
const sessionStartVersion = new Map<string, string | null>();
const staleSessionNudged = new Set<string>();

// ─── Extensión ────────────────────────────────────────────────────────────────

export default function einAi(pi: ExtensionAPI): void {
	const intentGate = createPiIntentGate();

	async function runSddPreflight(ctx: ExtensionContext): Promise<SddPreflightPreferences> {
		const preferences = await ensureSddPreflight(ctx, {
			pi,
			memoryLifecycle: memoryLifecycleForSession(ctx),
			installAssets: (cwd) => installSddAssets(cwd, false),
			applyModelConfig: async () => applySavedModelConfig(ctx),
		});
		bootstrapOpenSpecConfig(ctx.cwd);
		return preferences;
	}

	function continueAfterPiIntent(ctx: ExtensionContext, change: string | undefined): void {
		if (!change) return;
		const handoff = sddNextHandoff(resolveSddNext(ctx.cwd, change));
		if (handoff) pi.sendUserMessage(handoff);
	}

	pi.on("session_start", async (_event, ctx) => {
		// Higiene del proyecto: un único bloque gestionado en .gitignore.
		// Best-effort, no rompe.
		ensureEinGitignore(ctx.cwd);
		// Codegraph: en un proyecto sin índice la directiva nunca se activaba y
		// no había forma de salir de ahí. Se ofrece UNA vez por proyecto —
		// aceptes o no, no se vuelve a preguntar; `/ein:codegraph` sigue estando.
		if (ctx.hasUI && shouldOfferCodegraphInit(ctx.cwd)) {
			try {
				await offerCodegraphInit(ctx);
			} catch {
				// Una oferta que falla no puede impedir que arranque la sesión.
			}
		}
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
		// Onboarding first-run: si faltan esenciales (persona/lang/tdd/hypa/EIN.md)
		// el wizard los resuelve. No-op sin UI o si ya está todo configurado.
		await runOnboarding(ctx);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		scoutTracking.clear();
		const sessionKey = sddPreflightSessionKey(ctx);
		intentGate.clearPiIntentGate(ctx);
		clearAgentControlSession(sessionKey);
		clearSddParticipantSession(sessionKey);
	});

	pi.on("input", async (event, ctx) => {
		// R6 residual risk closed: a cancelled or dead scout never reaches
		// `acceptTrackedScoutResult`, so its `pending` entry would otherwise survive
		// until `session_shutdown` and permanently block every later scout launch.
		// R7 forces `async: false` on every normalized launch, so a legitimate scout
		// cannot outlive the turn that launched it — clearing here is exactly the
		// contract's own boundary ("one scout per turn"), not an approximation.
		scoutTracking.clear();
		// Intención de entrega: ¿este mensaje pide commit/push/PR? La lee el gate de
		// entrega en `tool_call` (modo git `auto`). Se evalúa SIEMPRE, también en
		// mensajes sin SDD; un mensaje neutro la conserva en vez de pisarla.
		if (typeof event.text === "string") {
			const key = sddPreflightSessionKey(ctx);
			deliveryIntentBySession.set(
				key,
				nextDeliveryIntent(deliveryIntentBySession.get(key), event.text),
			);
		}
		if (typeof event.text !== "string") return { action: "continue" };
		const explicitSdd = isSddPreflightTrigger(event.text);
		if (explicitSdd) await runSddPreflight(ctx);
		const intent = await intentGate.runPiIntentPreflight(event.text, ctx);
		if (intent === "pending") return { action: "handled" };
		if (intent === "resolved") continueAfterPiIntent(ctx, resolveActiveChange(ctx.cwd));
		return { action: "continue" };
	});

	pi.on("before_agent_start", async (event, ctx) => {
		await intentGate.adoptPiIntentGate(ctx);
		const isSddAgent = isSddAgentStartEvent(event);
		const isNamedAgent = isNamedAgentStartEvent(event);
		const prefs = getSddPreflightPreferences(ctx);
		const startNames = readAgentStartNames(event);
		// Memoria a granularidad de SESIÓN, no de fase: solo el parent recibe el
		// snapshot de sesión (recuperado en el preflight). Los agentes de fase leen
		// sus inputs del disco; el parent les pasa el contexto que necesiten. Antes
		// se hacía una búsqueda Engram + inyección POR FASE — coste por fase y
		// superficie de fallo para un modelo barato, sin más valor que la sesión.
		const memoryPrompt = renderMemoryAdvisory(
			!isNamedAgent && !isSddAgent ? getSddSessionMemory(ctx) : undefined,
		);
		// Convenciones de codigo (comment/logging/file-naming): SOLO donde se
		// escribe codigo — el parent (trabajo inline) y sdd-apply. Inyectarlas en
		// delivery/linear/map solo hacia que el modelo barato leyera 3 SKILL.md
		// inutiles (gasto de tokens) sin escribir codigo. Tambien gobierna si la
		// linea de Strict TDD entra en el preflight: solo donde hay RED/GREEN real.
		const isParent = !isNamedAgent && !isSddAgent;
		// `ein-scout` es un investigador de solo lectura, aislado al repo y con
		// `inheritSkills: false`: declara explícitamente que NO usa skills. Inyectarle
		// paths de SKILL.md (absolutos, fuera del repo) sólo produce "Skills not found"
		// y una ejecución degradada. Se excluye de toda inyección de skills.
		const isScout = startNames.includes("ein-scout");
		// Nudge de sesión obsoleta: solo la sesión padre interactiva. Registra la
		// versión al primer turno; si cambia después (un `ein update` a mitad de
		// sesión), avisa una vez de reiniciar — esta sesión no cargará la plantilla
		// nueva hasta un Pi fresco.
		if (isParent && ctx.hasUI) {
			const sessKey = sddPreflightSessionKey(ctx);
			const current = readInstalledVersion(join(AGENT_DIR, ".ein-install.json"));
			if (!sessionStartVersion.has(sessKey)) {
				sessionStartVersion.set(sessKey, current);
			} else {
				const decision = staleSessionNudge({
					startVersion: sessionStartVersion.get(sessKey) ?? null,
					currentVersion: current,
					alreadyNudged: staleSessionNudged.has(sessKey),
				});
				if (decision.nudge) {
					staleSessionNudged.add(sessKey);
					ctx.ui.notify(
						`Ein se actualizó a v${decision.version} durante esta sesión — sigue con la plantilla anterior. Reinicia Pi (o abre una sesión nueva) para cargar los cambios.`,
						"warning",
					);
				}
			}
		}
		const writesCode = isParent || startNames.includes("sdd-apply");
		const sddPrompt =
			prefs && (!isNamedAgent || isSddAgent)
				? `\n\n${renderSddPreflightPrompt(prefs, { includeTdd: writesCode, includeBaseline: isParent })}`
				: "";
		const einPrompt = isNamedAgent || isSddAgent
			? ""
			: `\n\n${buildEinPrompt(readPersonaMode(ctx.cwd), readChatLang(), readLinearIntegration(ctx.cwd))}\n\n${internalAgentRoutingDirective()}`;
		// Inyección determinista de skills: subagentes de fase/nombrados reciben
		// paths exactos de SKILL.md resueltos desde su task, no a criterio del
		// modelo padre (evita que el padre "invente" qué skills existen).
		let skillsPrompt = "";
		if ((isNamedAgent || isSddAgent) && !isScout) {
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
		const canonicalAgent = startNames.includes("sdd-scope")
			? "sdd-scope"
			: startNames.includes("sdd-design")
				? "sdd-design"
				: undefined;
		const canonicalSpecContext = canonicalAgent
			? canonicalSpecPrompt(ctx.cwd, canonicalAgent, readAgentTask(event), readExplicitSddChange(event))
			: "";
		// Codegraph: mismo público que EIN.md (parent + fases SDD). La directiva
		// es "" salvo binario + índice presentes — sin codegraph, cero tokens.
		const codegraph = wantsContext ? codegraphDirective(ctx.cwd) : "";
		const codegraphPrompt = codegraph ? `\n\n${codegraph}` : "";
		return {
			systemPrompt: `${event.systemPrompt}${einPrompt}${sddPrompt}${memoryPrompt ? `\n\n${memoryPrompt}` : ""}${skillsPrompt}${artifactPrompt}${conventionsPrompt}${contextPrompt}${canonicalSpecContext}${codegraphPrompt}${intentGate.piIntentGateDirective(ctx)}`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		await intentGate.adoptPiIntentGate(ctx);
		const intentBlock = intentGate.piIntentToolBlockReason(ctx, event.toolName);
		if (intentBlock) return { block: true, reason: intentBlock };
		// Delegaciones con push: el usuario confirma aquí (sesión con UI) y se
		// emite el grant one-shot que el guard headless del subagente consume.
		if (event.toolName === "subagent") {
			// Scout is deliberately handled before any SDD/delivery behavior.
			const scoutLaunch = normalizeScoutLaunch(event.input, event.toolCallId, scoutTracking);
			if (scoutLaunch) {
				Object.assign(event.input as Record<string, unknown>, scoutLaunch);
				return undefined;
			}
			const items = collectDelegationItems(event.input);
			for (const item of items) {
				if ((item.agent !== "ein-cleaner" && item.agent !== "ein-architect") || !item.task) continue;
				if (items.filter((candidate) => (candidate.agent === "ein-cleaner" || candidate.agent === "ein-architect") && isSddParticipantMarker(candidate.task)).length > 1) {
					return { block: true, reason: "SDD participants must run sequentially, one delegation at a time." };
				}
				try {
					const blocker = admitSddParticipantCall(ctx.cwd, sddPreflightSessionKey(ctx), event.toolCallId, item.agent as SddParticipant, item.task);
					if (blocker) return { block: true, reason: blocker };
				} catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
			}
			// R1: un participante lanzado en background nunca trae su resultado
			// terminal por el `tool_result` de su propia llamada (`// 002 A-1`).
			// Se fuerza foreground, sobrescribiendo un `async` explícito: un
			// participante inobservable no debe admitirse.
			ensureParticipantForeground(event.input);
			// Canario de drift: si Ein no reconoce ni un child, TODOS los gates de
			// abajo son no-ops silenciosos (es lo que pasó al mover la ejecución a
			// `workflowScript`). Se avisa una vez y se sigue: no se bloquea trabajo
			// por una forma que puede ser legítima (agente/task construidos en runtime).
			if (ctx.hasUI && delegationShapeIsUnrecognized(event.input)) {
				const driftKey = sddPreflightSessionKey(ctx);
				if (!shapeDriftWarned.has(driftKey)) {
					shapeDriftWarned.add(driftKey);
					ctx.ui.notify(
						t(
							"ai.delegation.shape-drift",
							"Ein no reconoce la forma de esta delegación: los gates de entrega y TDD no se aplican. Si el runtime de subagentes se acaba de actualizar, actualiza Ein (`ein update`).",
						),
						"warning",
					);
				}
			}
			// Fases de planificación (scope/map/design/tasks/close): inyecta
			// `acceptance: none` determinista si el orquestador no lo pasó. Sin esto
			// el runner infiere un nivel con forma de código y rechaza en falso un
			// artefacto documental que `ein_sdd_check` ya valida.
			ensurePlanningAcceptance(event.input);
			// Apply ejecuta: por defecto `acceptance: none` (sdd-verify es el gate) y
			// un `turnBudget` backstop contra thrashing. El orquestador puede pasar
			// `acceptance`/`turnBudget` explícitos y se respetan.
			ensureApplyAcceptance(event.input);
			ensureApplyTurnBudget(event.input);
			// Runtime por agente desde la tabla, no desde la memoria del padre.
			// Un maxRuntimeMs explícito del orquestador siempre gana.
			ensurePhaseRuntime(event.input);
			// Backstop universal: cualquier otra delegación (ein-git, ein-scout,
			// ein-linear, sdd-verify, workflows mixtos) también sale con
			// `acceptance: none` si el orquestador no pasó uno explícito. Sin esto
			// el runner INFIERE el contrato de la redacción de la tarea y rechaza
			// trabajo terminado por no emitir un `acceptance-report` con su forma.
			ensureDelegationAcceptance(event.input);
			// Gate de TDD ante una delegación que escribe código (sdd-apply directo
			// o dentro de un chain). En modo global "ask": si el orquestador clasificó
			// el cambio (hint tdd off/strict) se fija sin preguntar; si no, pregunta.
			// Así un mover/renombrar/config marcado off no interrumpe el flujo.
			await gateTddForDelegation(event.input, ctx);
			// Foto del artefacto de fase ANTES de delegar. Si el run acaba en ✗, el
			// hook `tool_result` compara y decide si la fase se hizo igualmente.
			rememberPhaseSnapshot(event.toolCallId, event.input, ctx.cwd);
			return confirmDelegatedDelivery(event.input, ctx, {
				mode: readGitDeliveryMode(ctx.cwd),
				userRequested: deliveryIntentActive(
					deliveryIntentBySession.get(sddPreflightSessionKey(ctx)),
				),
			});
		}
		if (event.toolName !== "bash") return undefined;
		if (!isRecord(event.input) || typeof event.input.command !== "string")
			return undefined;
		// GUARD primero sobre el comando ORIGINAL; solo si pasa se envuelve con
		// Hypa. Mutar después preserva la política de seguridad sin evaluarla
		// sobre un comando ya reescrito.
		const guard = await confirmCommand(event.input.command, ctx);
		if (guard) return guard;
		// Pathspec cerrado: un commit contiene lo que se decidió entregar, no lo
		// que hubiera en el árbol. Bloquea el staging a granel y el arrastre de
		// untracked ajenos. Determinista y sin confirmación: la salida es nombrar
		// las rutas, que es exactamente lo que debería hacerse.
		const staging = evaluateStaging(ctx.cwd, event.input.command);
		if (staging.kind === "blocked") return { block: true, reason: staging.reason };
		maybeWrapBashInput(event.input as { command: string }, ctx.cwd);
		return undefined;
	});

	// El artefacto manda sobre el veredicto del runner. Un ✗ puede venir de algo
	// que no dice nada del trabajo (tool ausente en la allowlist, respuesta final
	// vacía, timeout en la lectura final) con la fase YA entregada. Sin esto el
	// orquestador repetía una fase completa y pagaba dos veces.
	pi.on("tool_result", (event, ctx) => {
		// A participant result must arrive on its own foreground `subagent` call.
		// `subagent_wait` and every other delivery shape are unavailable evidence,
		// not a reason to leave the coordinator call in flight.
		if (event.toolName === "subagent_wait") {
			if (ctx.hasUI && participantResultIsUnrecognized({ toolName: event.toolName, details: event.details, hasTrackedCalls: sddParticipantCallsAreTracked() })) warnParticipantResultDrift(ctx);
			const tracked = getSddParticipantCall(event.toolCallId);
			if (tracked) completeSddParticipantCall(ctx.cwd, sddPreflightSessionKey(ctx), event.toolCallId, { status: "unavailable", reason: "background participant delivery is unsupported" });
			return undefined;
		}
		if (event.toolName !== "subagent") {
			const tracked = getSddParticipantCall(event.toolCallId);
			if (tracked) completeSddParticipantCall(ctx.cwd, sddPreflightSessionKey(ctx), event.toolCallId, { status: "unavailable", reason: "unsupported participant delivery" });
			return undefined;
		}
		if (ctx.hasUI && participantResultIsUnrecognized({ toolName: event.toolName, details: event.details, hasTrackedCalls: sddParticipantCallsAreTracked() })) warnParticipantResultDrift(ctx);
		const tracked = getSddParticipantCall(event.toolCallId);
		if (tracked) {
			const terminal = recognizePiParticipantTerminal({
				toolName: event.toolName,
				isError: event.isError,
				details: event.details,
				agent: tracked.unit,
				task: tracked.task,
			});
			completeSddParticipantCall(ctx.cwd, sddPreflightSessionKey(ctx), event.toolCallId, terminal);
		}
		try {
			const report = acceptTrackedScoutResult(scoutTracking, event.toolCallId, event.details, event.isError, ctx.cwd);
			if (report) return { isError: false, content: [{ type: "text", text: JSON.stringify(report) }] };
		} catch (error) {
			return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "ein-scout contract: validation failed" }] };
		}
		// Se libera SIEMPRE, falle o no: si solo se borrase en la rama de fallo,
		// cada delegación exitosa dejaría su foto ahí para toda la sesión.
		const snapshot = phaseSnapshotByToolCall.get(event.toolCallId);
		phaseSnapshotByToolCall.delete(event.toolCallId);
		if (!snapshot) return undefined;
		if (!event.isError) return undefined;
		const result = reconcilePhaseFailure(ctx.cwd, snapshot.phase, snapshot.before);
		if (!result.reconciled) return undefined;
		const originalError = event.content
			.map((part) => (part.type === "text" ? part.text : ""))
			.join("\n");
		return {
			isError: false,
			content: [
				{ type: "text", text: formatReconciliation(result, originalError) },
			],
		};
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

	const registerAgentControl = (agent: EinInternalAgent): void => {
		pi.registerCommand(`ein:${agent}`, {
			description: `Route an explicit ${agent} request or set this session's automatic participation (on/off/status)`,
			handler: async (args, ctx) => {
				const result = routeAgentControl(ctx.cwd, sddPreflightSessionKey(ctx), agent, String(args ?? ""));
				if (result.kind === "request") {
					pi.sendUserMessage(result.prompt);
					return;
				}
				if (result.kind === "usage") {
					ctx.ui.notify(result.message, "warning");
					return;
				}
				ctx.ui.notify(
					`${agent}: ${result.status.enabled ? "on" : "off"} (${result.status.source}); automatic SDD participation only`,
					"info",
				);
			},
		});
	};
	registerAgentControl("cleaner");
	registerAgentControl("architect");

	const registerEinTool = createEinToolRegistrar(pi);

	registerAdvisoryTools(registerEinTool);

	registerGeneralCommands(pi);

	registerSddReadSurface(pi, registerEinTool);

	registerSddChangeSettings(registerEinTool);

	registerOpenSpecWriteTools(registerEinTool);

	registerSddLifecycleTools(pi, registerEinTool);

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
			lines.push("// 000. ein status");
			lines.push(`${t("status.author", "autor")}: samuhlo`);
			lines.push(`${t("status.linear", "linear")}: ${readLinearIntegration(ctx.cwd)}`);
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

			lines.push(`// 001. ${t("status.sdd", "SDD")}`);
			lines.push(`${t("status.agents", "agentes")}: ${agents.length}`);
			for (const a of agents) lines.push(`- ${a}`);
			lines.push(`${t("status.chains", "chains")}: ${chains.length}`);
			for (const c of chains) lines.push(`- ${c}`);
			{
				const summaries = listActiveChangeSummaries(ctx.cwd);
				const budget = aggregateSddBudget(summaries);
				if (summaries.length === 0) {
					lines.push(`${t("status.sdd.active", "active change")}: ${t("status.sdd.none", "none")}`);
				} else {
					lines.push(tf("status.sdd.multi", "{0} active", summaries.length));
					for (const summary of summaries.slice(0, 8)) {
						lines.push(`- ${summary.change}: phase=${summary.currentPhase} · next=${summary.nextRecommended} · ready=${summary.tasks.ready} · blocked=${summary.tasks.blocked} · budget=${formatBudget(summary.budget)}`);
					}
					if (summaries.length > 8) lines.push(`- … ${summaries.length - 8} more`);
					if (budget.changesWithBudget > 0) {
						lines.push(`${t("status.sdd.budget-total", "budget total")}: allocated=${budget.allocated ?? "unknown"} · consumed=${budget.consumed ?? "unknown"}`);
					}
				}
			}
			if (staleDrift > 0)
				lines.push(
					`drift: ${staleDrift} ${t("status.drift.files", "archivo(s) desincronizado(s)")} — /ein:ai:install-sdd --force ${t("status.drift.refresh", "para refrescar")}`,
				);
			lines.push("");

			lines.push(`// 002. ${t("status.skills", "SKILLS")}`);
			lines.push(`${t("status.skills.local", "locales")}: ${localSkills}`);
			lines.push(`${t("status.skills.downloaded", "descargadas")}: ${downloadedSkills}`);
			lines.push("");

			lines.push(`// 003. ${t("status.project", "PROYECTO")}`);
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
			lines.push(`openspec: ${openspecConfigured ? t("status.openspec.configured", "configurado") : t("status.openspec.unconfigured", "no configurado — ejecuta el preflight SDD para arrancar")}`);
			lines.push(`${t("status.model", "modelo")}: ${existsSync(modelConfigPath(ctx.cwd)) ? t("status.model.present", "config presente") : t("status.model.absent", "sin config local")}`);
			lines.push("");

			lines.push("// 004. MCP");
			if (mcpServers.length > 0) {
				lines.push(`${t("status.mcp.servers", "servidores")}: ${mcpServers.join(", ")}`);
			} else {
				lines.push(`${t("status.mcp.servers", "servidores")}: ${t("status.mcp.none", "ninguno configurado")}`);
			}
			lines.push("");

			lines.push(`// 005. ${t("status.diag", "DIAGNOSTICO")}`);
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
					: t("help.short", "// ayuda ein — autor: samuhlo");
			ctx.ui.notify(text, "info");
		},
	});
}
