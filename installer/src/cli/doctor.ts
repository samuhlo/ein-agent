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
import { MARK, concrete, danger, gold, levelMark, structure, visibleWidth } from "../tui/theme.ts";
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
/** Ancho útil de la sección, para alinear el recuento de cada grupo. */
const REPORT_W = 62;

/**
 * Fila etiqueta/valor en columna. Una etiqueta más larga que la columna NO se
 * pega a su valor: baja el valor a su propia línea. Antes se rellenaba con
 * `max(1, …)`, así que `sdd-verify sin support colgante` y su detalle salían
 * pegados y la rejilla se rompía justo en las filas más largas.
 */
function row(label: string, value: string, mark?: string): string {
  const head = label.toLowerCase();
  const used = visibleWidth(head);
  const head4 = `    ${mark ?? " "} ${structure(head)}`;
  if (!value) return head4;
  if (used + 2 > LABEL_W) return `${head4}\n${" ".repeat(6 + 2)}${concrete(value)}`;
  return `${head4}${" ".repeat(LABEL_W - used)}${concrete(value)}`;
}

/** Recuento de un grupo: `14 ✓`, o lo que no está verde. */
function tally(checks: readonly { level: string }[]): string {
  const ok = checks.filter((check) => check.level === "OK").length;
  const warn = checks.filter((check) => check.level === "WARN").length;
  const fail = checks.filter((check) => check.level === "FAIL").length;
  const parts = [`${ok} ${MARK.ok}`];
  if (warn) parts.push(warn === 1 ? "1 aviso" : `${warn} avisos`);
  if (fail) parts.push(fail === 1 ? "1 fallo" : `${fail} fallos`);
  return parts.join(" · ");
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
  lines.push("");

  // Un grupo entero en verde cabe en una línea: su recuento. El detalle de un
  // chequeo que pasa repetía su etiqueta —«sdd-verify sin support colgante» y
  // «sdd-verify no referencia una guía de support global inexistente» dicen lo
  // mismo—, así que catorce ✓ ocupaban catorce líneas para no informar de nada.
  // Se despliega SOLO lo que no está verde, que es lo que traes que mirar.
  for (const [index, group] of report.groups.entries()) {
    const title = `${String(index + 1).padStart(3, "0")}. ${group.title.toLowerCase()}`;
    const count = tally(group.checks);
    const head = `  ${gold("//")} ${structure(title)}`;
    const gap = Math.max(2, REPORT_W - visibleWidth(title) - 5 - visibleWidth(count));
    lines.push(`${head}${" ".repeat(gap)}${structure(count)}`);

    const problems = group.checks.filter((check) => check.level !== "OK");
    if (problems.length === 0) continue;
    lines.push("");
    for (const check of problems) lines.push(row(check.name, check.detail, levelMark(check.level)));
    lines.push("");
  }

  lines.push("");
  lines.push(`  ${(report.fail ? danger : report.warn ? gold : concrete)(verdict)}`);
  lines.push(`  ${structure(`doctor ein · v${INSTALLER_VERSION}`)}`);

  // Un grupo con problemas cierra con su propio hueco, y el veredicto abre con
  // el suyo: sin colapsar, el informe se abre por la mitad justo donde hay algo
  // que leer. El aire separa; el doble aire despista.
  return lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n");
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
