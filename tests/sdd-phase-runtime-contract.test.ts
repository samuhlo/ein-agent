// =============================================================================
// TESTS: sdd-phase-runtime-contract
// Verifica los contratos de runtime de las fases SDD frente a pi-subagents:
//   P1 — persistencia de map.md: sdd-map no escribe su artefacto; lo persiste
//        el runner (chain `outputMode: file-only` o el parent en modo fase a
//        fase). Sin instrucciones contradictorias de escritura.
//   P2 — fail-fast: ningún agente de fase se bloquea en asks de supervisor/
//        intercom (no-interactivo = las replies no llegan mid-run).
//   P3 — acceptance: el orchestrator pasa `acceptance: none` explícito en fases
//        de planificación y nunca rutea el loop por el veredicto de acceptance.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT_DIR = join(import.meta.dir, "../ein-pi/agent");
const read = (rel: string) => readFileSync(join(AGENT_DIR, rel), "utf8");

const orch = read("assets/orchestrator.md");
const sddMap = read("agents/sdd-map.md");

const PHASE_AGENTS = [
  "sdd-scope.md",
  "sdd-map.md",
  "sdd-design.md",
  "sdd-tasks.md",
  "sdd-apply.md",
  "sdd-verify.md",
  "sdd-close.md",
];

describe("P1: contrato de persistencia de map.md", () => {
  test("sdd-map NO contiene la instrucción contradictoria de escribir map.md", () => {
    expect(sddMap).not.toContain("Write map notes to");
  });

  test("sdd-map declara el Artifact Persistence Contract", () => {
    expect(sddMap).toContain("Artifact Persistence Contract");
    expect(sddMap).toContain("outputMode: file-only");
  });

  test("sdd-map trata la falta de write tool como intencional, no como bloqueo", () => {
    expect(sddMap.toLowerCase()).toContain("intentional, not a blocker");
  });

  test("orchestrator ordena pasar output + file-only al delegar sdd-map directo", () => {
    expect(orch).toContain('outputMode: "file-only"');
    expect(orch).toMatch(/sdd-map[^\n]*NO write tool/);
  });

  test("orchestrator prohíbe polling/re-run cuando falta el artefacto: se persiste desde el envelope", () => {
    expect(orch.toLowerCase()).toMatch(/do not poll the filesystem|not poll the filesystem in a wait loop/);
    expect(orch).toContain("_output.md");
  });
});

describe("P2: fail-fast en vez de asks de supervisor", () => {
  for (const agent of PHASE_AGENTS) {
    test(`${agent} prohíbe bloquearse en asks de supervisor/intercom`, () => {
      const content = read(`agents/${agent}`);
      expect(content).toContain("Never block on supervisor/intercom asks");
      expect(content).toContain("status: blocked");
    });
  }

  test("orchestrator desconfía de asks tardíos y verifica realidad antes de actuar", () => {
    expect(orch).toContain("Intercom asks");
    expect(orch.toLowerCase()).toMatch(/stale/);
    expect(orch).toMatch(/NEVER redo a phase[^\n]*stale ask/);
  });
});

describe("P3: veredictos de acceptance de pi-subagents", () => {
  test("orchestrator exige acceptance none explícito en fases de planificación", () => {
    expect(orch).toContain('acceptance: { level: "none"');
    // Todas las fases de planificación aparecen en la regla.
    const acceptanceBlock = orch.slice(orch.indexOf("Acceptance verdicts"));
    for (const phase of ["sdd-scope", "sdd-map", "sdd-design", "sdd-tasks", "sdd-close"]) {
      expect(acceptanceBlock).toContain(phase);
    }
  });

  test("sdd-apply se delega con verificación runtime (level verified + verify commands)", () => {
    const acceptanceBlock = orch.slice(orch.indexOf("Acceptance verdicts"));
    expect(acceptanceBlock).toContain('level: "verified"');
    expect(acceptanceBlock).toMatch(/verify: \[\{ id: "tests"/);
    // Los comandos salen de la config real del proyecto, no inventados.
    expect(acceptanceBlock).toContain("testing.runner");
    // Nunca un build de producción en el acceptance del apply.
    expect(acceptanceBlock).toMatch(/NEVER a production build/);
  });

  test("los applies mecánicos llevan acceptance none (verified/checked exigen tests-added)", () => {
    const acceptanceBlock = orch.slice(orch.indexOf("Acceptance verdicts"));
    expect(acceptanceBlock).toMatch(/mechanical[^\n]*non-behavioral/i);
    expect(acceptanceBlock).toContain('reason: "mechanical apply');
    expect(acceptanceBlock).toContain("tests-added");
  });

  test("sdd-verify mantiene acceptance en auto (verificar ya es su trabajo)", () => {
    const acceptanceBlock = orch.slice(orch.indexOf("Acceptance verdicts"));
    expect(acceptanceBlock).toContain("sdd-verify");
    expect(acceptanceBlock.toLowerCase()).toContain("auto");
  });

  test("sdd-apply conoce el contrato de verificación runtime y prohíbe amañarlo", () => {
    const apply = read("agents/sdd-apply.md");
    expect(apply).toContain("Runtime Acceptance Verification");
    expect(apply).toContain("acceptance-report");
    expect(apply.toLowerCase()).toMatch(/do not game it/);
  });

  test("el loop se rutea por ein_sdd_status/ein_sdd_check, nunca por el veredicto", () => {
    expect(orch).toMatch(/NEVER route the SDD loop by the acceptance verdict/);
  });

  test("documenta que .chain.md no puede llevar acceptance", () => {
    expect(orch).toMatch(/\.chain\.md[^\n]*cannot carry `acceptance`/);
  });
});
