import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { redactMcpText, type McpCard } from "./mcp-card.ts";
import { scoutEvidenceStatus, type ScoutReport, type ScoutFanout } from "./scout-contract.ts";

export type ScoutReceipt = {
  status: "complete" | "partial" | "rejected" | "unavailable";
  findings: number;
  references: number;
  uncertainties: string[];
  recovery: string;
};

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export function acceptedScoutReceipt(report: ScoutReport | ScoutFanout): ScoutReceipt {
  const reports = "branches" in report ? report.branches.map((branch) => branch.report) : [report];
  const status = scoutEvidenceStatus(report);
  return {
    status,
    findings: reports.reduce((count, item) => count + item.findings.length, 0),
    references: reports.reduce((count, item) => count + item.references.length, 0),
    uncertainties: [...reports.flatMap((item) => item.uncertainties.filter((gap) => gap.level !== "none").map((gap) => gap.statement)), ...("dropped" in report ? report.dropped : [])],
    recovery: status === "partial"
      ? "Use the accepted findings and references now. This partial result is accepted, not a failed attempt. Recover only material gaps with bounded read-only reads within the original authorized roots and remaining budget; preserve prior agreements. Do not repeat the whole scout or request a restart."
      : "Use the accepted findings and references; do not rediscover this evidence.",
  };
}

export function rejectedScoutReceipt(reason: string, failures: number, unavailable = false): ScoutReceipt {
  return {
    status: unavailable ? "unavailable" : "rejected",
    findings: 0,
    references: 0,
    uncertainties: [reason],
    recovery: unavailable
      ? "Scout runtime unavailable: do not relaunch this turn. Preserve the original runner details and report the cause. Continue only bounded read-only recovery within the original authorized roots and remaining budget."
      : `${failures >= 2 ? "Two scout citation/format failures: do not launch a third scout or ask the user to repair the harness. " : "Do not repeat the whole investigation. "}Inspect the original result and existing session/artifact pointers preserved in tool details first. Recover only missing evidence through bounded read-only reads within the original authorized roots and remaining budget. Declare unresolved gaps; preserve prior agreements. This exception permits no writes, scope expansion, or session restart.`,
  };
}

export function scoutReceipt(details: unknown): ScoutReceipt | undefined {
  if (!record(details) || !record(details.einScoutEvidence)) return;
  const value = details.einScoutEvidence;
  if (!["complete", "partial", "rejected", "unavailable"].includes(String(value.status)) || !Number.isInteger(value.findings) || !Number.isInteger(value.references) || !Array.isArray(value.uncertainties) || !value.uncertainties.every((gap) => typeof gap === "string") || typeof value.recovery !== "string") return;
  return value as ScoutReceipt;
}

export function scoutResultDetails(details: unknown, receipt: ScoutReceipt, runnerContent: unknown): Record<string, unknown> {
  // RECOVERY -> Keep the runner's original output and artifact pointers in the session record.
  return { ...(record(details) ? details : { runnerDetails: details }), einScoutRunnerContent: record(details) && "einScoutRunnerContent" in details ? details.einScoutRunnerContent : runnerContent, einScoutEvidence: receipt };
}

export function renderScoutCard(card: McpCard, width: number, theme: Pick<Theme, "fg" | "bold">): string[] {
  const receipt = scoutReceipt(card.result?.details);
  const labels = { complete: "Evidencia validada", partial: "Evidencia parcial", rejected: "Informe rechazado", unavailable: "Investigación no disponible" };
  const lines = [receipt ? labels[receipt.status] : "Ejecución terminada · evidencia sin validar"];
  if (receipt && receipt.findings > 0) lines.push(`${receipt.findings} hallazgos · ${receipt.references} referencias`);
  if (receipt && card.expanded) lines.push(...receipt.uncertainties.map(redactMcpText));
  if (receipt?.uncertainties.length && !card.expanded) lines.push(`${card.expandHint} · detalles`);
  return new Text(`${theme.fg("dim", "ein · ")}${theme.fg("toolTitle", "Investigación")}\n${lines.join("\n")}`, 0, 0).render(width);
}
