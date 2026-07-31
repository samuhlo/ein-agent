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
const scout = read("agents/ein-scout.md");
const einAi = readFileSync(join(AGENT_DIR, "extensions/ein-ai.ts"), "utf8");

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

  test("sdd-map: bash solo para queries codegraph read-only (contrato acotado)", () => {
    expect(sddMap).toMatch(/^tools:.*bash/m);
    expect(sddMap).toMatch(/Bash exists for EXACTLY ONE purpose/);
    expect(sddMap).toMatch(/codegraph explore\|callers\|callees/);
    expect(sddMap).toMatch(/contract violation/);
  });

  test("orchestrator prohíbe output/outputMode al delegar fases directo (sandbox trap)", () => {
    expect(orch).toMatch(/do NOT pass `output`\/`outputMode` when delegating a phase directly/);
    expect(orch).toMatch(/resolves inside the runner's `\.pi-subagents\/` sandbox/);
  });

  test("orchestrator conserva el fallback de último recurso (transcript → parent-fallback)", () => {
    expect(orch.toLowerCase()).toMatch(/do not poll the filesystem|not poll the filesystem in a wait loop/);
    // Con el envelope de retorno ahora compacto, el contenido completo ya no
    // vive en `_output.md` (= envelope): la recuperación de última instancia
    // usa el transcript completo del hijo.
    expect(orch).toContain("_transcript.jsonl");
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
  // El workaround de acceptance se colapsó a un párrafo: el hook inyecta
  // acceptance:none para planning + apply no-conductual, así que el parent no
  // pasa nada. El prompt ya no explica la lección (el hook la subsume).
  const acceptanceBlock = orch.slice(orch.indexOf("Acceptance & turn-budget"));

  test("el lead documenta la auto-inyección de acceptance:none para planning", () => {
    expect(acceptanceBlock).toContain('acceptance: { level: "none" }');
    expect(acceptanceBlock).toContain("hook now injects");
    expect(acceptanceBlock).toContain("pass NEITHER");
    for (const phase of ["sdd-scope", "sdd-map", "sdd-design", "sdd-tasks", "sdd-close"]) {
      expect(acceptanceBlock).toContain(phase);
    }
  });

  test("sdd-apply ejecuta; sdd-verify es el gate; verified sigue como override", () => {
    expect(acceptanceBlock).toContain("EXECUTES the masticated plan");
    expect(acceptanceBlock).toContain("sdd-verify");
    expect(acceptanceBlock).toContain('level: "verified"');
  });

  test("el hook cubre el apply no-conductual — sin bullet mecánico ni tests-added en el prompt", () => {
    expect(acceptanceBlock).toContain("non-behavioral `sdd-apply`");
    // La lección del 'reason' mecánico y tests-added la subsume el hook.
    expect(acceptanceBlock).not.toContain("tests-added");
    expect(acceptanceBlock).not.toContain('reason: "mechanical apply');
  });

  test("deja sdd-verify en auto (verificar ya es su trabajo)", () => {
    expect(acceptanceBlock).toContain("leave `sdd-verify` on auto");
  });

  test("sdd-apply distingue none normal de verified explícito y conserva sdd-verify", () => {
    const apply = read("agents/sdd-apply.md");
    const acceptance = apply.slice(
      apply.indexOf("## Runtime Acceptance Verification"),
      apply.indexOf("## Ad-hoc apply"),
    );

    expect(acceptance).toContain("runtime injects `acceptance: none`");
    expect(acceptance).toMatch(/Do \*\*not\*\* create or claim an `acceptance-report`/);
    expect(acceptance).toMatch(/do not claim the run was verified/i);
    expect(acceptance).toContain("Only an explicit `acceptance: { level: \"verified\", verify: [...] }`");
    expect(acceptance).toMatch(/RUNNER freshly re-executes the declared verification commands/);
    expect(acceptance).toMatch(/End with the fenced `acceptance-report` block/);
    expect(acceptance).toMatch(/Return `status: blocked`/);
    expect(acceptance).toMatch(/independent `sdd-verify`.*final freshness authority/);
  });

  test("el loop se rutea por ein_sdd_status/ein_sdd_check, nunca por el veredicto", () => {
    expect(orch).toMatch(/NEVER route the SDD loop by the acceptance verdict/);
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

describe("P5: foto de fase para reconciliar, sin ampliar el input del subagent", () => {
  test("recuerda la foto antes de delegar y reconcilia después", () => {
    expect(einAi).toContain("before: snapshotPhaseArtifacts(cwd, phase)");
    expect(einAi).toContain("reconcilePhaseFailure(ctx.cwd, snapshot.phase, snapshot.before)");
    // El ledger de procedencia se retiró: la delegación no mints receipts ni observa coste.
    expect(einAi).not.toContain("beginDelegationObservation");
    expect(einAi).not.toContain("observeDelegationResult");
    // El hook nunca amplía el input del subagent con campos de flujo/coste.
    expect(einAi).not.toMatch(/(?:event\.input|input)\.(?:output|outputMode|flowId|runId|changeId)\s*=/);
  });
});

describe("P5.5: scout queda fuera del runtime de fases", () => {
  test("las siete fases conservan su orden exacto", () => {
    expect(PHASE_AGENTS).toEqual([
      "sdd-scope.md", "sdd-map.md", "sdd-design.md", "sdd-tasks.md", "sdd-apply.md", "sdd-verify.md", "sdd-close.md",
    ]);
  });

  test("su contrato no recibe herramientas ni responsabilidades de fase", () => {
    expect(scout).toMatch(/^tools: read, grep, find$/m);
    expect(scout).not.toMatch(/^tools:.*(?:write|edit|bash|subagent)/m);
    expect(PHASE_AGENTS).not.toContain("ein-scout.md");
    expect(einAi).not.toMatch(/phaseForAgent\([^)]*ein-scout|ein-scout[^\n]{0,120}(?:reconcile|PHASE_ORDER)/i);
  });
});

describe("P6: fricción de runtime conocida", () => {
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
