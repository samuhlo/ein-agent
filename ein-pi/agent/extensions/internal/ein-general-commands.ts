// =============================================================================
// EIN GENERAL COMMANDS
// Registers human-facing configuration, session recovery, and accounting
// commands independently from SDD workflow tools and runtime hooks.
// =============================================================================

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { handleCodegraphCommand } from "../../lib/codegraph.ts";
import { handleGitCommand } from "../../lib/git-delivery.ts";
import { handleHypaCommand } from "../../lib/hypa.ts";
import { t } from "../../lib/i18n/strings.ts";
import { handleLangCommand } from "../../lib/lang.ts";
import { handleLinearIntegrationCommand } from "../../lib/linear-integration.ts";
import { handleOnboardCommand } from "../../lib/onboarding.ts";
import { handlePersonaCommand } from "../../lib/persona.ts";
import { handleInitCommand } from "../../lib/project-context.ts";
import type { Coverage, Known, Slice, Stat, Total } from "../../lib/session-accounting.ts";
import { readAccountingReport } from "../../lib/session-accounting-store.ts";
import { humanizeAge, listRecentSessions } from "../../lib/sessions.ts";
import { handleTddCommand } from "../../lib/tdd.ts";
import { handleModelsCommand } from "./models-panel.ts";

function formatCoverage(coverage: Coverage): string {
	return `[${coverage.status}, ${coverage.attributed}/${coverage.total}]`;
}

function formatKnown(known: Known<string | number>): string {
	return known.status === "known" ? String(known.value) : "unknown";
}

function formatTotal(label: string, total: Total): string {
	if (total.status === "unknown") {
		return `- ${label}: unknown ${formatCoverage(total.coverage)}`;
	}
	return `- ${label}: ${total.value} ${formatCoverage(total.coverage)}`;
}

function formatStat(label: string, stat: Stat): string {
	if (stat.status === "unknown") {
		return `- ${label}: unknown ${formatCoverage(stat.coverage)}`;
	}
	return `- ${label}: mean=${stat.mean.toFixed(2)} p95=${stat.p95} max=${stat.max} n=${stat.n} ${formatCoverage(stat.coverage)}`;
}

function formatSlice(title: string, slice: Slice): string[] {
	return [
		`${title} (runs=${slice.runs})`,
		formatTotal("coste", slice.cost),
		formatTotal("tokens de salida", slice.outputTokens),
		formatStat("pico prompt", slice.peakPromptTokens),
		formatStat("pico secuencia", slice.peakSequenceTokens),
		formatStat("turnos por run", slice.turnsPerRun),
		`- fallos: ${slice.outcomes.failures.count} (indeterminado ${slice.outcomes.failures.undetermined}) ${formatCoverage(slice.outcomes.failures.coverage)}`,
		`- fallback de modelo: ${slice.outcomes.modelFallbacks.count} (indeterminado ${slice.outcomes.modelFallbacks.undetermined}) ${formatCoverage(slice.outcomes.modelFallbacks.coverage)}`,
		`- reruns de proceso: ${slice.outcomes.processReruns.count} (indeterminado ${slice.outcomes.processReruns.undetermined}, maxRunIndex ${formatKnown(slice.outcomes.maxRunIndex)}) ${formatCoverage(slice.outcomes.processReruns.coverage)}`,
		`- canales: transcript=${slice.channels.transcript} artifact=${slice.channels.artifact} sin-atribuir=${slice.channels.unattributed}`,
	];
}

function formatApplyPacketReadiness(report: ReturnType<typeof readAccountingReport>["applyPackets"]): string[] {
	const rate = report.executableRate.status === "known"
		? `${(report.executableRate.value * 100).toFixed(1)}%`
		: "unknown";
	const latest = report.latestObservedAt.status === "known" ? report.latestObservedAt.value : "unknown";
	return [
		t("accounting.apply-packets", "-- apply packet readiness --"),
		`- observed=${report.observed} malformed=${report.malformed} latest=${latest}`,
		`- executable=${report.byStatus.executable} incomplete=${report.byStatus.incomplete} rejected=${report.byStatus.rejected} unavailable=${report.byStatus.unavailable}`,
		`- executableRate=${rate} distinctPackets=${report.distinctExecutablePackets} distinctChanges=${report.distinctChanges}`,
		`- currentExecutableStreak=${report.currentExecutableStreak} acrossChanges=${report.currentStreakDistinctChanges}`,
	];
}

function formatNamedSlices<T extends Slice>(
	kind: "model" | "agent",
	entries: readonly T[],
	nameOf: (entry: T) => string | null,
): string[] {
	return entries.flatMap((entry) => [
		"",
		...formatSlice(`-- ${kind}: ${nameOf(entry) ?? "unattributed"} --`, entry),
	]);
}

/** Register commands that configure or inspect Ein outside the SDD flow. */
export function registerGeneralCommands(pi: ExtensionAPI): void {
	pi.registerCommand("ein:models", {
		description: t(
			"cmd.models.description",
			"Ver o configurar los modelos activos por agente en Ein",
		),
		handler: async (_args, ctx) => {
			await handleModelsCommand(pi, ctx);
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

	pi.registerCommand("ein:hypa", {
		description: t(
			"cmd.hypa.description",
			"Ver o cambiar la compresión de salida de comandos con Hypa (auto/on/off)",
		),
		handler: async (_args, ctx) => {
			await handleHypaCommand(ctx);
		},
	});

	pi.registerCommand("ein:codegraph", {
		description: t(
			"cmd.codegraph.description",
			"Ver o cambiar el grafo de código (codegraph) del proyecto (auto/off)",
		),
		handler: async (_args, ctx) => {
			await handleCodegraphCommand(ctx);
		},
	});

	pi.registerCommand("ein:onboard", {
		description: t(
			"cmd.onboard.description",
			"Reconfigurar los esenciales del proyecto (persona, idioma, TDD, Hypa, EIN.md)",
		),
		handler: async (_args, ctx) => {
			await handleOnboardCommand(ctx);
		},
	});

	pi.registerCommand("ein:linear", {
		description: t(
			"cmd.linear.description",
			"Encender o apagar la integración opcional con Linear",
		),
		handler: async (_args, ctx) => {
			await handleLinearIntegrationCommand(ctx);
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
			const lines: string[] = [
				t("resume.title", "// 000. sesiones recientes"),
				"",
			];
			if (!sessions.length) {
				lines.push(t("resume.none", "- No hay sesiones guardadas todavia."));
			} else {
				lines.push(t(
					"resume.shortcuts",
					"- Atajos: `pi -c` (continuar ultima) · `pi -r` (elegir sesion)",
				));
				lines.push("");
				for (const session of sessions) {
					lines.push(`- ${session.project} (${humanizeAge(session.ageMs)})`);
					lines.push(`  pi --session ${session.id}`);
				}
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("ein:accounting", {
		description: t(
			"cmd.accounting.description",
			"Ver readiness de packets y coste medido de las sesiones de Ein",
		),
		handler: async (_args, ctx) => {
			const report = readAccountingReport();
			if (report.store === "absent") {
				ctx.ui.notify(t(
					"accounting.absent",
					"// 000. accounting\n\n- No hay directorio de sesiones todavia.",
				), "info");
				return;
			}
			const snapshot = report.snapshot;
			const lines: string[] = [
				t("accounting.title", "// 000. accounting"),
				"",
				t("accounting.snapshot", "-- snapshot --"),
				`- generatedAt: ${snapshot.generatedAt}`,
				`- corpus: ${formatKnown(snapshot.corpusFrom)} .. ${formatKnown(snapshot.corpusTo)}`,
				`- sessions=${formatKnown(snapshot.sessions)} transcripts=${formatKnown(snapshot.transcripts)} artifacts=${formatKnown(snapshot.artifacts)}`,
				`- corruptFiles=${snapshot.corruptFiles} missingFiles=${snapshot.missingFiles}`,
				`- runsAttributed=${snapshot.runsAttributed} runsUnattributable=${snapshot.runsUnattributable}`,
				`- discovery: scanned=${snapshot.discovery.scanned} skipped=${snapshot.discovery.skipped} scanLimitExceeded=${snapshot.discovery.scanLimitExceeded}`,
				"",
				...formatApplyPacketReadiness(report.applyPackets),
				"",
				...formatSlice(t("accounting.overall", "-- overall --"), report.overall),
				"",
				...formatSlice(t("accounting.parent", "-- parent --"), report.partition.parent),
				"",
				...formatSlice(t("accounting.subagent", "-- subagent --"), report.partition.subagent),
				...formatNamedSlices("model", report.byModel, (entry) => entry.model),
				...formatNamedSlices("agent", report.byAgent, (entry) => entry.agent),
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
