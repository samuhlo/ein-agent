// =============================================================================
// TESTS: el avance de la instalación
// Un instalador que solo enseña la línea que está corriendo obliga a adivinar
// cuánto falta. El plan ya existe antes de empezar (`createInstallPlan`), así
// que lo que faltaba era contarlo.
//
// El fallo típico de un indicador de progreso es SILENCIOSO: no rompe nada, solo
// miente — un paso que se queda «corriendo» porque su evento no llegó, o un
// contador que suma los pasos que ni se van a ejecutar. Eso es lo que se fija.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { executeInstallPlan, type InstallPlanExecutionHandlers } from "../installer/src/core/install-executor.ts";
import {
  createInstallPlan,
  type InstallPlanEntryId,
  type InstallPlanInput,
  type InstallPlanV1,
} from "../installer/src/core/install-plan.ts";
import { createProgressView } from "../installer/src/tui/progress-view.ts";
import {
  advanceProgress,
  progressLines,
  startProgress,
  type InstallProgressEvent,
} from "../installer/src/tui/progress.ts";

const HOME = "/synthetic/home";

function input(target: InstallPlanInput["target"], patch: Partial<InstallPlanInput> = {}): InstallPlanInput {
  return {
    target,
    home: HOME,
    piAgentDir: join(HOME, ".pi-ein", "agent"),
    piAgentDirExists: false,
    piOwnership: { status: "absent" },
    claudeConfigHome: join(HOME, ".claude-ein"),
    platform: { os: "darwin", arch: "arm64" },
    dependencies: { bun: false, pi: false, engram: false, gh: true, hypa: false, codegraph: false },
    flags: { yes: false, noEngram: false, noSecrets: false, noHypa: false, noCodegraph: false, skipLinear: true },
    ...patch,
  };
}

const ok = () => ({ ok: true as const, detail: "ok" });
function handlersFor(plan: InstallPlanV1, over: Partial<Record<InstallPlanEntryId, () => unknown>> = {}) {
  return Object.fromEntries(
    plan.inventory.map((entry) => [entry.id, over[entry.id] ?? ok]),
  ) as InstallPlanExecutionHandlers;
}

const runnable = (plan: InstallPlanV1) =>
  plan.inventory.filter((entry) => entry.state === "selected" || entry.state === "conditional");

// ─── el ejecutor cuenta lo que hace ──────────────────────────────────────────

describe("el ejecutor cuenta lo que hace", () => {
  test("abre y cierra cada paso que ejecuta, en el orden del plan", async () => {
    const plan = createInstallPlan(input("claude"));
    const seen: InstallProgressEvent[] = [];
    await executeInstallPlan(plan, handlersFor(plan), (event) => { seen.push(event); });

    const started = seen.filter((event) => event.kind === "start").map((event) => event.id);
    const finished = seen.filter((event) => event.kind === "done").map((event) => event.id);
    expect(started).toEqual(runnable(plan).map((entry) => entry.id));
    expect(finished).toEqual(started);
  });

  test("ningún paso se queda abierto: cada start tiene su cierre", async () => {
    const plan = createInstallPlan(input("pi"));
    const open = new Set<string>();
    await executeInstallPlan(plan, handlersFor(plan), (event) => {
      if (event.kind === "start") open.add(event.id);
      if (event.kind === "done") open.delete(event.id);
    });
    expect([...open]).toEqual([]);
  });

  test("un paso que falla se cierra como fallo, no se queda corriendo", async () => {
    const plan = createInstallPlan(input("claude"));
    const seen: InstallProgressEvent[] = [];
    await executeInstallPlan(
      plan,
      handlersFor(plan, { "claude.deploy-runtime": () => ({ ok: false, detail: "boom" }) }),
      (event) => { seen.push(event); },
    );
    const done = seen.find((event) => event.kind === "done" && event.id === "claude.deploy-runtime");
    expect(done).toMatchObject({ kind: "done", ok: false });
  });

  test("tras un fallo, lo que ya no se va a ejecutar se declara, no se calla", async () => {
    const plan = createInstallPlan(input("claude"));
    const seen: InstallProgressEvent[] = [];
    await executeInstallPlan(
      plan,
      handlersFor(plan, { "claude.deploy-runtime": () => ({ ok: false, detail: "boom" }) }),
      (event) => { seen.push(event); },
    );
    const abandoned = seen.filter((event) => event.kind === "abandoned").map((event) => event.id);
    expect(abandoned).toContain("claude.deploy-launcher");
  });

  test("sin oyente, el ejecutor se comporta exactamente igual", async () => {
    const plan = createInstallPlan(input("claude"));
    const quiet = await executeInstallPlan(plan, handlersFor(plan));
    const loud = await executeInstallPlan(plan, handlersFor(plan), () => undefined);
    expect(quiet).toEqual(loud);
  });
});

// ─── el contador no miente ───────────────────────────────────────────────────

describe("el avance que se pinta", () => {
  const plan = createInstallPlan(input("pi"));

  test("el total cuenta los pasos que se van a ejecutar, no el inventario entero", () => {
    const model = startProgress(plan);
    expect(model.total).toBe(runnable(plan).length);
    expect(model.total).toBeLessThan(plan.inventory.length);
    expect(model.done).toBe(0);
  });

  test("los pendientes se ven desde el principio: para eso existe el plan", () => {
    const model = startProgress(plan);
    const lines = progressLines(model);
    // Cabecera, aire, y una fila por paso — todas desde el primer fotograma.
    expect(lines).toHaveLength(2 + model.total);
    expect(lines.slice(2).every((line) => line.includes("pendiente"))).toBe(true);
  });

  test("solo un paso corre a la vez", () => {
    let model = startProgress(plan);
    model = advanceProgress(model, { kind: "start", id: "shared.dependency.bun" });
    model = advanceProgress(model, { kind: "start", id: "pi.dependency.pi" });
    expect(Object.values(model.status).filter((state) => state === "running")).toHaveLength(1);
  });

  test("el contador sube al cerrar, no al abrir", () => {
    let model = startProgress(plan);
    model = advanceProgress(model, { kind: "start", id: "shared.dependency.bun" });
    expect(model.done).toBe(0);
    model = advanceProgress(model, { kind: "done", id: "shared.dependency.bun", ok: true });
    expect(model.done).toBe(1);
  });

  test("un fallo suma al contador pero no se pinta como logrado", () => {
    let model = startProgress(plan);
    model = advanceProgress(model, { kind: "start", id: "shared.dependency.bun" });
    model = advanceProgress(model, { kind: "done", id: "shared.dependency.bun", ok: false, detail: "sin bun" });
    expect(model.done).toBe(1);
    expect(model.status["shared.dependency.bun"]).toBe("failed");
    expect(progressLines(model).join("\n")).toContain("sin bun");
  });

  test("el contador nunca pasa del total, pase lo que pase con los eventos", () => {
    let model = startProgress(plan);
    for (const entry of plan.inventory) {
      model = advanceProgress(model, { kind: "done", id: entry.id, ok: true });
      model = advanceProgress(model, { kind: "done", id: entry.id, ok: true });
    }
    expect(model.done).toBeLessThanOrEqual(model.total);
  });

  test("un evento de un paso que no está en el plan no descuadra nada", () => {
    const model = advanceProgress(startProgress(plan), {
      kind: "done", id: "claude.deploy-launcher" as InstallPlanEntryId, ok: true,
    });
    expect(model.done).toBe(0);
    expect(model.total).toBe(runnable(plan).length);
  });

  test("las líneas no desbordan el ancho del terminal", () => {
    let model = startProgress(plan);
    model = advanceProgress(model, { kind: "start", id: "pi.deploy-template" });
    model = advanceProgress(model, { kind: "done", id: "pi.deploy-template", ok: true, detail: "x".repeat(400) });
    for (const line of progressLines(model, 76)) {
      expect([...line.replace(/\x1b\[[0-9;]*m/g, "")].length).toBeLessThanOrEqual(76);
    }
  });
});

// ─── la pantalla que lo pinta ────────────────────────────────────────────────
// Repintar en un terminal es reescribir sobre lo ya escrito. Sin TTY eso no
// existe: `curl | bash` recibe un fichero, no una pantalla, y ahí un repintado
// deja basura de escapes en el log.

describe("la pantalla del avance", () => {
  const plan = createInstallPlan(input("claude"));
  const io = (isTTY: boolean) => {
    let out = "";
    return { io: { write: (text: string) => { out += text; }, isTTY, columns: 80 }, out: () => out };
  };

  test("con terminal, repinta en sitio: la salida no crece sin fin", () => {
    const sink = io(true);
    const view = createProgressView(plan, sink.io);
    for (const entry of runnable(plan)) {
      view.progress({ kind: "start", id: entry.id });
      view.progress({ kind: "done", id: entry.id, ok: true, detail: "ok" });
    }
    view.finish();
    // Cada repintado sube el cursor: sin eso, cada evento apilaría la lista otra
    // vez y el terminal acabaría con veinte copias.
    expect(sink.out()).toContain("\u001b[");
    const rendered = sink.out().split("\n").filter((line) => line.includes("bun") || line.includes("claude"));
    expect(rendered.length).toBeGreaterThan(0);
  });

  test("sin terminal no repinta: una línea por paso cerrado y ni un escape", () => {
    const sink = io(false);
    const view = createProgressView(plan, sink.io);
    for (const entry of runnable(plan)) {
      view.progress({ kind: "start", id: entry.id });
      view.progress({ kind: "done", id: entry.id, ok: true, detail: "listo" });
    }
    view.finish();
    expect(sink.out()).not.toContain("\u001b[");
    const lines = sink.out().split("\n").filter(Boolean);
    expect(lines).toHaveLength(runnable(plan).length);
  });

  test("su spinner no pinta por su cuenta: alimenta la fila que corre", () => {
    const sink = io(false);
    const view = createProgressView(plan, sink.io);
    const first = runnable(plan)[0]!;
    view.progress({ kind: "start", id: first.id });
    const spinner = view.spinner();
    spinner.start("Instalando bun");
    // Nada se ha escrito todavía: el paso sigue corriendo.
    expect(sink.out()).toBe("");
    spinner.stop("v1.3.14");
    view.progress({ kind: "done", id: first.id, ok: true });
    expect(sink.out()).toContain("v1.3.14");
  });
});
