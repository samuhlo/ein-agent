// =============================================================================
// TESTS: orchestrator-scope-gate contract
// Verifica que orchestrator.md contiene:
//   - Sección "Scope Gate Contract"
//   - Límite hard de 3 ramas para fan-out
//   - NO usa context:fresh por defecto para explore normal
//   - SCOPE PACKET como requisito antes de invocar sdd-explore
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ORCH_MD = join(
  import.meta.dir,
  "../ein-pi/agent/assets/orchestrator.md",
);
const content = readFileSync(ORCH_MD, "utf8");

describe("orchestrator.md Scope Gate Contract", () => {
  test("contiene la Scope Gate", () => {
    expect(content).toContain("Scope Gate");
  });

  test("contiene límite hard de 3 ramas para fan-out", () => {
    expect(content.toLowerCase()).toContain("3");
    expect(content.toLowerCase()).toMatch(/máximo 3|hard limit.*3|max 3 branch|max.*3.*rama/);
  });

  test("SCOPE PACKET como requisito antes de invocar sdd-explore", () => {
    expect(content).toContain("SCOPE PACKET");
    expect(content).toContain("sdd-explore");
  });

  test("webfetch NO en tools de sdd-explore en la tabla", () => {
    const sddExploreRow = content
      .split("\n")
      .find((l) => l.includes("sdd-explore") && l.includes("|"));
    expect(sddExploreRow).toBeDefined();
    expect(sddExploreRow).not.toContain("webfetch");
  });

  test("context:fresh reservado para auditorías/review, no para explore normal", () => {
    // La regla debe asociar fresh a trabajo adversarial: audit/incident/review.
    expect(content.toLowerCase()).toMatch(/fresh[^\n]*(audit|incident|review)/);
  });
});
