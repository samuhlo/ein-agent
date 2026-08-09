// =============================================================================
// CLI: doctor
// Render del reporte de verify. Exit code 0 ok/warn, 1 fail.
// =============================================================================

import { detectPlatform } from "../core/platform.ts";
import { runDoctor, type DoctorReport } from "../core/verify.ts";
import { AGENT_DIR } from "../core/paths.ts";
import { defaultUpdateCaps, type UpdateCaps } from "../core/update-caps.ts";
import { readInstallerUpdateEvidence, type InstallerUpdateReadEvidence } from "../core/update-advisor-read.ts";
import { existsSync } from "node:fs";
import { bold, gold, structure, rgb } from "../tui/theme.ts";
import { evaluateSharedConfigUpdateAdvisor, renderAdvisorSemantics, type AdvisorInput, type SharedConfigUpdateAdvisorResult } from "../../../ein-pi/agent/lib/shared-config-update-advisor.ts";

const GLYPH: Record<string, string> = { OK: "✓", WARN: "!", FAIL: "✗" };

type InstallerAdvisorAction = "install" | "update" | "repair" | "configure";
export type InstallerAdvisorHandoff = Readonly<{
  owner: "installer";
  action: InstallerAdvisorAction;
  actionId: string;
  performed: false;
}>;

function safeActionId(value: unknown): string {
  return typeof value === "string" && /^installer\.(install|update|repair|configure)$/.test(value) ? value : "installer.unknown";
}

function safeAction(value: unknown): InstallerAdvisorAction {
  return typeof value === "string" && ["install", "update", "repair", "configure"].includes(value)
    ? value as InstallerAdvisorAction
    : "configure";
}

/** Handoff solo de presentación; aquí no hay menú, proceso ni dueño de mutación. */
export function renderInstallerAdvisorHandoff(handoff: InstallerAdvisorHandoff | undefined): string | null {
  if (!handoff || handoff.owner !== "installer" || handoff.performed !== false) return null;
  return `Siguiente paso: ${safeAction(handoff.action)} mediante installer (${safeActionId(handoff.actionId)}); performed: false.`;
}

function glyph(level: string): string {
  const g = GLYPH[level] ?? "?";
  if (level === "OK") return rgb(120, 200, 120, g);
  if (level === "WARN") return rgb(230, 200, 90, g);
  if (level === "FAIL") return rgb(230, 110, 110, g);
  return g;
}

export function renderDoctorAdvisor(result: SharedConfigUpdateAdvisorResult): string {
  const semantic = renderAdvisorSemantics(result);
  const handoff = renderInstallerAdvisorHandoff(result.handoff);
  return handoff ? `${semantic}\n${handoff}` : semantic;
}

export function renderReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(bold(gold("/// DOCTOR EIN")));
  lines.push("");
  lines.push(`resultado: ${bold(gold(report.result))}`);
  lines.push(`fail: ${report.fail}  |  warn: ${report.warn}  |  total: ${report.total}`);
  lines.push("");
  for (const group of report.groups) {
    lines.push(structure(`■ ${group.title}`));
    for (const c of group.checks) {
      lines.push(`  ${glyph(c.level)} ${c.level.padEnd(4)} ${c.name}: ${c.detail}`);
    }
    lines.push("");
  }
  lines.push(structure("■ DECISION"));
  if (report.fail) {
    lines.push("  revisar FAIL antes de usar Ein.");
  } else if (report.warn) {
    lines.push("  usable; resolver WARN para endurecer baseline.");
  } else {
    lines.push("  baseline estable.");
  }
  return lines.join("\n");
}

export type DoctorCommandDependencies = Readonly<{
  exists?: () => boolean;
  detectPlatform?: typeof detectPlatform;
  runDoctor?: typeof runDoctor;
  caps?: Pick<UpdateCaps, "fs" | "http">;
  readAdvisor?: () => Promise<InstallerUpdateReadEvidence>;
  log?: (line: string) => void;
}>;

function advisorInput(evidence: InstallerUpdateReadEvidence): AdvisorInput {
  return {
    update: {
      installed: evidence.installed,
      release: evidence.release,
      owner: evidence.owner,
      capability: evidence.capability,
    },
  };
}

export async function runDoctorCommand(options: DoctorCommandDependencies = {}): Promise<number> {
  const exists = options.exists ?? (() => existsSync(AGENT_DIR));
  const log = options.log ?? ((line: string) => console.log(line));
  if (!exists()) {
    log(`Ein no esta desplegado: no existe ${AGENT_DIR}.`);
    log("Ejecuta `ein install` primero.");
    return 1;
  }
  const platform = (options.detectPlatform ?? detectPlatform)();
  const report = (options.runDoctor ?? runDoctor)(platform);
  const caps = options.caps ?? defaultUpdateCaps();
  const readAdvisor = options.readAdvisor ?? (() => readInstallerUpdateEvidence({ caps }));
  let result: SharedConfigUpdateAdvisorResult;
  try {
    result = evaluateSharedConfigUpdateAdvisor(advisorInput(await readAdvisor()));
  } catch {
    result = evaluateSharedConfigUpdateAdvisor({ update: {} });
  }
  log(`${renderReport(report)}\n${renderDoctorAdvisor(result)}`);
  return report.result === "FAIL" ? 1 : 0;
}
