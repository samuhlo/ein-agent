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
import { concrete, danger, gold, levelMark, structure, visibleWidth } from "../tui/theme.ts";
import { INSTALLER_VERSION } from "../core/version.ts";
import { evaluateSharedConfigUpdateAdvisor, renderAdvisorSemantics, type AdvisorInput, type SharedConfigUpdateAdvisorResult } from "../../../ein-pi/agent/lib/shared-config-update-advisor.ts";


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

// Marcador y color salen del tema compartido: mismo vocabulario que la app de
// terminal (✓ ok · ! aviso · ✕ fallo), no verdes y rojos sueltos.
function glyph(level: string): string {
  return levelMark(level);
}

const LABEL_W = 30;

/** Fila etiqueta/valor: columna con sangría fija, sin puntos hasta el valor. */
function row(label: string, value: string, mark?: string): string {
  const head = label.toLowerCase();
  const pad = " ".repeat(Math.max(1, LABEL_W - visibleWidth(head)));
  return `    ${mark ?? " "} ${structure(head)}${pad}${concrete(value)}`;
}

export function renderDoctorAdvisor(result: SharedConfigUpdateAdvisorResult): string {
  const semantic = renderAdvisorSemantics(result);
  const handoff = renderInstallerAdvisorHandoff(result.handoff);
  return handoff ? `${semantic}\n${handoff}` : semantic;
}

export function renderReport(report: DoctorReport): string {
  // Mismo idioma que la sesión y el launcher, sin marco: el instalador es la
  // primera cara que ve un usuario nuevo, y que hable como el producto no es
  // decoración. Cada grupo abre su `// NNN.` y sus chequeos van en columna.
  const lines: string[] = [];
  const verdict = report.fail
    ? "revisa los fallos antes de usar ein."
    : report.warn
      ? "usable; resuelve los avisos para endurecer la baseline."
      : "baseline estable.";

  lines.push("");
  lines.push(row("resultado", report.result, levelMark(report.result)));
  lines.push(row("chequeos", `${report.total} total · ${report.warn} aviso · ${report.fail} fallo`));

  for (const [index, group] of report.groups.entries()) {
    lines.push("");
    lines.push(`  ${gold("//")} ${structure(`${String(index + 1).padStart(3, "0")}. ${group.title.toLowerCase()}`)}`);
    lines.push("");
    for (const check of group.checks) {
      lines.push(row(check.name, check.detail, levelMark(check.level)));
    }
  }

  lines.push("");
  lines.push(`  ${(report.fail ? danger : report.warn ? gold : concrete)(verdict)}`);
  lines.push(`  ${structure(`doctor ein · v${INSTALLER_VERSION}`)}`);

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
    log(`Ein no está desplegado: no existe ${AGENT_DIR}.`);
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
