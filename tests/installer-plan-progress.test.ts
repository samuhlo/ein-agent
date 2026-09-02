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

  test("un aviso opcional no bloquea la instalación y llega como aviso a la pantalla", async () => {
    const plan = createInstallPlan(input("pi"));
    const seen: InstallProgressEvent[] = [];
    const result = await executeInstallPlan(
      plan,
      handlersFor(plan, {
        "pi.dependency.hypa": () => ({ ok: true, warning: true, detail: "opcional no instalado" }),
      }),
      (event) => { seen.push(event); },
    );
    expect(result.ok).toBe(true);
    expect(seen.find((event) => event.kind === "done" && event.id === "pi.dependency.hypa"))
      .toMatchObject({ ok: true, warning: true, detail: "opcional no instalado" });
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

  test("el modelo conoce el plan entero desde el principio", () => {
    const model = startProgress(plan);
    // La lista ya no se pinta arriba —la pantalla es append-only—, pero el
    // modelo sigue sabiendo qué viene: de ahí sale el total del contador.
    expect(model.steps).toHaveLength(model.total);
    expect(Object.values(model.status).every((state) => state === "pending")).toBe(true);
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
    expect(model.detail["shared.dependency.bun"]).toBe("sin bun");
  });

  test("un aviso suma al contador pero no se pinta como logrado", () => {
    let model = startProgress(plan);
    model = advanceProgress(model, { kind: "start", id: "pi.dependency.hypa" });
    model = advanceProgress(model, {
      kind: "done",
      id: "pi.dependency.hypa",
      ok: true,
      warning: true,
      detail: "opcional no instalado",
    });
    expect(model.done).toBe(1);
    expect(model.status["pi.dependency.hypa"]).toBe("warning");
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

  test("un detalle larguísimo se recorta: la línea no desborda el terminal", () => {
    let out = "";
    const view = createProgressView(plan, { write: (text) => { out += text; }, isTTY: false, columns: 76 });
    const first = runnable(plan)[0]!;
    view.progress({ kind: "start", id: first.id });
    view.progress({ kind: "done", id: first.id, ok: true, detail: "x".repeat(400) });
    view.finish();
    for (const line of out.split("\n")) {
      expect([...line.replace(/\x1b\[[0-9;]*m/g, "")].length).toBeLessThanOrEqual(76);
    }
  });
});

// ─── la pantalla que lo pinta ────────────────────────────────────────────────
// LA REGRESIÓN QUE ESTO CIERRA: la lista se repintaba en sitio subiendo el
// cursor tantas filas como había pintado. Pero la pantalla no es suya — trece
// puntos de `install.ts` escriben durante los handlers, el informe entero del
// doctor incluido. Cada uno de esos writes invalida la cuenta de filas, así que
// el siguiente repintado sube a ciegas y deja trozos de lista pegados encima de
// lo que hubiera debajo.
//
// La forma correcta en un terminal compartido es APPEND-ONLY: una línea por paso
// al cerrarse, y nunca mover el cursor a una fila anterior.

describe("la pantalla del avance", () => {
  const plan = createInstallPlan(input("claude"));
  const io = (isTTY: boolean) => {
    let out = "";
    return { io: { write: (text: string) => { out += text; }, isTTY, columns: 80 }, out: () => out };
  };
  const CURSOR_UP = /\u001b\[\d*A/;

  test("nunca sube el cursor: la pantalla no es suya", () => {
    for (const isTTY of [true, false]) {
      const sink = io(isTTY);
      const view = createProgressView(plan, sink.io);
      for (const entry of runnable(plan)) {
        view.progress({ kind: "start", id: entry.id });
        const spinner = view.spinner();
        spinner.start("trabajando");
        spinner.stop("ok");
        view.progress({ kind: "done", id: entry.id, ok: true, detail: "ok" });
      }
      view.finish();
      expect(sink.out()).not.toMatch(CURSOR_UP);
    }
  });

  test("una línea por paso cerrado, en el orden en que se cierran", () => {
    const sink = io(false);
    const view = createProgressView(plan, sink.io);
    for (const entry of runnable(plan)) {
      view.progress({ kind: "start", id: entry.id });
      view.progress({ kind: "done", id: entry.id, ok: true, detail: "listo" });
    }
    view.finish();
    const settled = sink.out().split("\n").filter((line) => line.includes("listo"));
    expect(settled).toHaveLength(runnable(plan).length);
  });

  test("cada línea cerrada lleva su posición en el plan", () => {
    const sink = io(false);
    const view = createProgressView(plan, sink.io);
    const total = runnable(plan).length;
    const first = runnable(plan)[0]!;
    view.progress({ kind: "start", id: first.id });
    view.progress({ kind: "done", id: first.id, ok: true, detail: "ok" });
    expect(sink.out()).toContain(`1/${total}`);
  });

  test("la cabecera anuncia el total una sola vez", () => {
    const sink = io(false);
    const view = createProgressView(plan, sink.io);
    for (const entry of runnable(plan)) {
      view.progress({ kind: "start", id: entry.id });
      view.progress({ kind: "done", id: entry.id, ok: true });
    }
    view.finish();
    const heads = sink.out().split("\n").filter((line) => line.includes("instalando"));
    expect(heads).toHaveLength(1);
  });

  test("sin terminal no hay ni un escape: `curl | bash` recibe un fichero", () => {
    const sink = io(false);
    const view = createProgressView(plan, sink.io);
    const first = runnable(plan)[0]!;
    view.progress({ kind: "start", id: first.id });
    view.spinner().start("trabajando");
    view.progress({ kind: "done", id: first.id, ok: true, detail: "ok" });
    view.finish();
    expect(sink.out()).not.toContain("\u001b[");
  });

  test("con terminal el indicador vivo se queda en SU línea y la cierra el resultado", () => {
    const sink = io(true);
    const view = createProgressView(plan, sink.io);
    const first = runnable(plan)[0]!;
    view.progress({ kind: "start", id: first.id });
    view.spinner().start("desplegando");
    // Se reescribe sobre sí mismo con retorno de carro, nunca sobre la fila de
    // arriba: un `\r` no puede pisar lo que escribió otro.
    expect(sink.out()).toContain("\r");
    expect(sink.out()).not.toMatch(CURSOR_UP);
    view.progress({ kind: "done", id: first.id, ok: true, detail: "ok" });
    const lines = sink.out().split("\n").filter((line) => line.includes("ok"));
    expect(lines.length).toBeGreaterThan(0);
  });

  test("un paso abandonado también deja su línea, no desaparece", () => {
    const sink = io(false);
    const view = createProgressView(plan, sink.io);
    const [first, second] = runnable(plan);
    view.progress({ kind: "start", id: first!.id });
    view.progress({ kind: "done", id: first!.id, ok: false, detail: "reventó" });
    view.progress({ kind: "abandoned", id: second!.id });
    view.finish();
    expect(sink.out()).toContain("reventó");
    expect(sink.out()).toContain("no ejecutado");
  });
});
