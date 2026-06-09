// =============================================================================
// CLI: doctor
// Renders the verify report. Plain rendering for now; gold theming arrives in
// the TUI phase. Exit code reflects result (0 ok/warn, 1 fail).
// =============================================================================

import { detectPlatform } from "../core/platform.ts";
import { runDoctor, type DoctorReport } from "../core/verify.ts";
import { AGENT_DIR } from "../core/paths.ts";
import { existsSync } from "node:fs";

const GLYPH: Record<string, string> = { OK: "✓", WARN: "!", FAIL: "✗" };

export function renderReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push("/// DOCTOR EIN");
  lines.push("");
  lines.push(`resultado: ${report.result}`);
  lines.push(`fail: ${report.fail}  |  warn: ${report.warn}  |  total: ${report.total}`);
  lines.push("");
  for (const group of report.groups) {
    lines.push(`■ ${group.title}`);
    for (const c of group.checks) {
      lines.push(`  ${GLYPH[c.level] ?? "?"} ${c.level.padEnd(4)} ${c.name}: ${c.detail}`);
    }
    lines.push("");
  }
  lines.push("■ DECISION");
  if (report.fail) {
    lines.push("  revisar FAIL antes de usar Ein.");
  } else if (report.warn) {
    lines.push("  usable; resolver WARN para endurecer baseline.");
  } else {
    lines.push("  baseline estable.");
  }
  return lines.join("\n");
}

export function runDoctorCommand(): number {
  if (!existsSync(AGENT_DIR)) {
    console.log(`Ein no esta desplegado: no existe ${AGENT_DIR}.`);
    console.log("Ejecuta `ein install` primero.");
    return 1;
  }
  const platform = detectPlatform();
  const report = runDoctor(platform);
  console.log(renderReport(report));
  return report.result === "FAIL" ? 1 : 0;
}
