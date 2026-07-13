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
const CORE = join(import.meta.dir, "../ein-pi/core");
// Contenido portable (agents/, AGENTS.md) vive en core/; el runtime Pi
// (assets/, lib/, extensions/) sigue en agent/.
const read = (p: string) =>
	readFileSync(join(p.startsWith("agents/") || p === "AGENTS.md" ? CORE : AGENT_DIR, p), "utf8");

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
  // Contrato v2: map escribe su ÚNICO artefacto él mismo (write tool), como el
  // resto de fases. El baile output/file-only quedó retirado: un output
  // relativo en pi-subagents resuelve dentro del sandbox .pi-subagents/, nunca
  // en el repo, y forzaba el parent-fallback en CADA map.
  test("sdd-map tiene write tool y contrato de artefacto propio", () => {
    expect(sddMap).toMatch(/^tools:.*write/m);
    expect(sddMap).toContain("Artifact Persistence Contract");
    expect(sddMap).toMatch(/write your artifact yourself/i);
  });

  test("sdd-map acota el write a su artefacto: nunca código ni sandbox", () => {
    expect(sddMap).toContain("MUST NOT write code");
    expect(sddMap).toMatch(/EXACTLY ONE file|ONLY file you are allowed to write/);
    expect(sddMap.toLowerCase()).toContain("sandbox");
  });

  test("orchestrator prohíbe output/outputMode al delegar fases directo (sandbox trap)", () => {
    expect(orch).toMatch(/do NOT pass `output`\/`outputMode` when delegating a phase directly/);
    expect(orch).toMatch(/resolves inside the runner's `\.pi-subagents\/` sandbox/);
  });

  test("orchestrator conserva el fallback de último recurso (envelope → parent-fallback)", () => {
    expect(orch.toLowerCase()).toMatch(/do not poll the filesystem|not poll the filesystem in a wait loop/);
    expect(orch).toContain("_output.md");
    expect(orch).toContain("authored_by: parent-fallback");
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

describe("P4: runtime y tamaño del apply estricto", () => {
  test("guía maxRuntimeMs generoso para apply TDD-estricto (evita timeout mid-cycle)", () => {
    expect(orch).toMatch(/maxRuntimeMs[^\n]*1800000/);
    expect(orch).toMatch(/strict-TDD[^\n]*(SLOW|minimum|multi-group)/i);
  });
  test("un tasks.md con demasiados grupos es un smell de scoping, no de runtime", () => {
    expect(orch).toMatch(/scop(ed|ing)[^\n]*(too big|smell)/i);
  });
  test("fases de planificación que leen código llevan runtime ≥600s (revisiones incluidas)", () => {
    expect(orch).toMatch(/Planning-phase runtime/);
    expect(orch).toMatch(/600000/);
  });
});

describe("P5: fricción de runtime conocida", () => {
  test("orchestrator advierte del shell compuesto en ctx_batch_execute (bash -c)", () => {
    expect(orch).toMatch(/ctx_batch_execute/);
    expect(orch).toMatch(/bash -c/);
    expect(orch).toMatch(/compound shell breaks|syntax error near unexpected token/i);
  });
  test("sdd-apply marca checkboxes de tasks.md en AMBOS modos (strict incluido)", () => {
    const apply = read("agents/sdd-apply.md");
    expect(apply).toMatch(/Task Checkboxes \(both modes\)/);
    expect(apply).toMatch(/strict AND standard/);
  });
});
