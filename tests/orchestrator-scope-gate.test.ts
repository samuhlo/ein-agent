// =============================================================================
// TESTS: orchestrator-scope-gate contract
// Verifica que orchestrator.md contiene:
//   - Sección "Scope Gate Contract"
//   - Límite hard de 3 ramas para fan-out
//   - NO usa context:fresh por defecto para map normal
//   - SCOPE PACKET como requisito antes de invocar sdd-map
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ORCH_MD = join(
  import.meta.dir,
  "../runtime/assets/orchestrator.md",
);
const content = readFileSync(ORCH_MD, "utf8");
const SCOUT_MD = join(import.meta.dir, "../runtime/agents/ein-scout.md");
const scout = readFileSync(SCOUT_MD, "utf8");

function expectAll(text: string, terms: string[]) {
  for (const term of terms) expect(text).toContain(term);
}

describe("orchestrator.md Scope Gate Contract", () => {
  test("contiene la Scope Gate", () => {
    expect(content).toContain("Scope Gate");
  });

  test("contiene límite hard de 3 ramas para fan-out", () => {
    expect(content.toLowerCase()).toContain("3");
    expect(content.toLowerCase()).toMatch(/máximo 3|hard limit.*3|max 3 branch|max.*3.*rama/);
  });

  test("SCOPE PACKET como requisito antes de invocar sdd-map", () => {
    expect(content).toContain("SCOPE PACKET");
    expect(content).toContain("sdd-map");
  });

  test("webfetch NO en tools de sdd-map en la tabla", () => {
    const sddMapRow = content
      .split("\n")
      .find((l) => l.includes("sdd-map") && l.includes("|"));
    expect(sddMapRow).toBeDefined();
    expect(sddMapRow).not.toContain("webfetch");
  });

  test("context:fresh reservado para auditorías/review, no para map normal", () => {
    // La regla debe asociar fresh a trabajo adversarial: audit/incident/review.
    expect(content.toLowerCase()).toMatch(/fresh[^\n]*(audit|incident|review)/);
  });

  test("define el RESEARCH PACKET con entradas acotadas y ceilings exactos", () => {
    expectAll(content, [
      "RESEARCH PACKET",
      "concrete question",
      "allowed repository roots",
      "optional specific memory query",
      "optional bounded documentation topics",
      "max_reads: 20",
      "max_output_bytes: 12288",
      "max_runtime_ms: 300000",
    ]);
  });

  test("reserva la síntesis de decisiones para el parent", () => {
    expectAll(content, [
      "Parent synthesis intent",
      "severity classification",
      "bounded alternatives",
      "optional candidate slices",
    ]);
  });

  test("mantiene la intención de síntesis fuera del reporte cerrado del scout", () => {
    expect(scout).toContain("not top-level scout report fields");
    expect(scout).toContain("exactly the existing `ein-scout-report/v1` fields");
    expect(scout).toContain("`severity`, `alternatives`, or `candidate_slices`");
  });

  test("el routing pre-scope no selecciona sdd-map", () => {
    expect(content).toContain("Pre-scope routing must not select `sdd-map`");
    expect(content).toContain("`sdd-map` remains behind the bounded scope gate");
  });
});
