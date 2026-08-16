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
import { concrete, danger, gold, levelMark } from "../tui/theme.ts";
import { frameBlank, frameBottom, frameDivider, frameField, frameHeader, frameTab, frameText, frameTop } from "../tui/frame.ts";
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
// terminal (■ ok · ▲ aviso · ✕ fallo), no verdes y rojos sueltos.
function glyph(level: string): string {
  return levelMark(level);
}

export function renderDoctorAdvisor(result: SharedConfigUpdateAdvisorResult): string {
  const semantic = renderAdvisorSemantics(result);
  const handoff = renderInstallerAdvisorHandoff(result.handoff);
  return handoff ? `${semantic}\n${handoff}` : semantic;
}

export function renderReport(report: DoctorReport): string {
  // Misma ventana que el banner de arranque y que la app: marco doble, pestanas
  // de seccion y lineas de puntos. El instalador es la primera cara que ve un
  // usuario nuevo; que hable el mismo idioma no es decoracion.
  const body: string[] = [];
  const verdict = report.fail
    ? "revisar FAIL antes de usar Ein."
    : report.warn
      ? "usable; resolver WARN para endurecer baseline."
      : "baseline estable.";

  body.push(frameBlank());
  body.push(frameField("RESULTADO", report.result, levelMark(report.result)));
  body.push(frameField("CHEQUEOS", `${report.total} total · ${report.warn} warn · ${report.fail} fail`));

  for (const group of report.groups) {
    body.push(frameBlank());
    body.push(frameTab(group.title));
    for (const check of group.checks) {
      body.push(frameField(check.name, check.detail, levelMark(check.level)));
    }
  }

  body.push(frameBlank());
  body.push(frameDivider());
  body.push(frameText(verdict, report.fail ? danger : report.warn ? gold : concrete));

  return [frameTop(), frameHeader("doctor ein", `v${INSTALLER_VERSION}`), frameDivider(), ...body, frameBottom()].join("\n");
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
