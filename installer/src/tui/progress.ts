// =============================================================================
// PROGRESS — el avance de la instalación, con el plan a la vista
// Un instalador que solo enseña la línea que está corriendo obliga a adivinar
// cuánto falta. El plan ya se calcula ANTES de tocar nada (`createInstallPlan`,
// que además es lo que alimenta el journal), así que el dato existía: lo que
// faltaba era enseñarlo.
//
// Los pendientes se pintan desde el primer fotograma, apagados. Eso es lo que
// convierte un log en una lista: se lee de un golpe cuánto queda.
//
// Módulo PURO: entran plan y eventos, salen líneas. Sin fs, sin escritura, sin
// reloj. El fallo típico de un indicador de progreso es silencioso —no rompe
// nada, solo miente—, y esa clase de fallo solo se caza con un test.
// =============================================================================

import type { InstallPlanProgressEvent } from "../core/install-executor.ts";
import type { InstallPlanEntryId, InstallPlanV1 } from "../core/install-plan.ts";
import { concrete, danger, gold, structure, visibleWidth, MARK } from "./theme.ts";

// Una sola definición: la emite el ejecutor, la consume esta pantalla.
// `live` es de la PANTALLA, no del ejecutor: el detalle que va cambiando
// mientras un paso corre. El ejecutor no sabe nada de él.
export type InstallProgressEvent =
  | InstallPlanProgressEvent
  | Readonly<{ kind: "live"; id: InstallPlanEntryId; detail: string }>;

export type StepStatus = "pending" | "running" | "ok" | "failed" | "abandoned";

export type InstallProgressModel = Readonly<{
  /** Los pasos que el plan va a ejecutar, en su orden inmutable. */
  steps: readonly InstallPlanEntryId[];
  status: Readonly<Record<string, StepStatus>>;
  detail: Readonly<Record<string, string>>;
  done: number;
  total: number;
}>;

// Etiquetas humanas. El id del plan es un contrato de datos (lo lee el journal),
// no una cadena para enseñar: `pi.configure-context7-export` no es una frase.
const LABEL: Readonly<Record<InstallPlanEntryId, string>> = Object.freeze({
  "shared.dependency.bun": "bun",
  "pi.dependency.pi": "pi",
  "pi.dependency.engram": "engram",
  "pi.dependency.gh": "gh",
  "pi.dependency.hypa": "hypa",
  "pi.dependency.codegraph": "codegraph",
  "pi.migrate-legacy": "migrar instalación previa",
  "pi.backup-current": "backup del estado actual",
  "pi.deploy-template": "desplegar ein",
  "pi.configure-packages": "paquetes del agente",
  "pi.configure-secrets": "secrets",
  "pi.configure-context7-export": "export de context7",
  "pi.write-install-marker": "marcar la instalación",
  "pi.verify-doctor": "doctor",
  "pi.deploy-launcher": "launcher pi-ein",
  "pi.promote-commands": "comandos en el PATH",
  "claude.deploy-runtime": "desplegar claude code",
  "claude.deploy-launcher": "launcher cc-ein",
});

/** La etiqueta humana de un paso. El id del plan es dato, no frase. */
export function stepLabel(id: InstallPlanEntryId): string {
  return LABEL[id] ?? id;
}

const LABEL_W = 26;
const BAR_W = 14;

/** El plan tal y como se va a ejecutar: solo lo que el ejecutor recorre. */
export function startProgress(plan: InstallPlanV1): InstallProgressModel {
  const steps = plan.inventory
    .filter((entry) => entry.state === "selected" || entry.state === "conditional")
    .map((entry) => entry.id);
  return Object.freeze({
    steps: Object.freeze(steps),
    status: Object.freeze(Object.fromEntries(steps.map((id) => [id, "pending" as StepStatus]))),
    detail: Object.freeze({}),
    done: 0,
    total: steps.length,
  });
}

/**
 * Un evento avanza el modelo. Reglas que sostienen la honestidad del contador:
 * solo un paso corre a la vez, el contador sube al CERRAR (no al abrir), un paso
 * ya cerrado no vuelve a contar, y un evento de un paso que no está en el plan
 * se ignora entero en vez de descuadrar el total.
 */
export function advanceProgress(
  model: InstallProgressModel,
  event: InstallProgressEvent,
): InstallProgressModel {
  if (!(event.id in model.status)) return model;
  const current = model.status[event.id];
  if (current === undefined) return model;

  if (event.kind === "live") {
    return Object.freeze({ ...model, detail: Object.freeze({ ...model.detail, [event.id]: event.detail }) });
  }

  if (event.kind === "start") {
    if (current !== "pending") return model;
    // Cerrar cualquier otro «corriendo»: si su cierre se perdió, la pantalla no
    // puede quedarse enseñando dos pasos vivos a la vez.
    const status: Record<string, StepStatus> = Object.fromEntries(
      model.steps.map((id): [string, StepStatus] => [
        id,
        id === event.id ? "running" : model.status[id] === "running" ? "pending" : model.status[id]!,
      ]),
    );
    return Object.freeze({ ...model, status: Object.freeze(status) });
  }

  const settled = current === "ok" || current === "failed" || current === "abandoned";
  const next: StepStatus = event.kind === "abandoned" ? "abandoned" : event.ok ? "ok" : "failed";
  const status = Object.freeze({ ...model.status, [event.id]: next });
  const detail = event.kind === "done" && event.detail
    ? Object.freeze({ ...model.detail, [event.id]: event.detail })
    : model.detail;
  // `abandoned` no es trabajo hecho: declara que no se hará, así que no suma.
  const counts = !settled && event.kind === "done";
  return Object.freeze({
    ...model,
    status,
    detail,
    done: Math.min(model.total, model.done + (counts ? 1 : 0)),
  });
}

const GLYPH_FOR: Readonly<Record<StepStatus, string>> = Object.freeze({
  pending: MARK.idle,
  running: "▸",
  ok: MARK.ok,
  failed: MARK.fail,
  abandoned: MARK.idle,
});

function paintStep(status: StepStatus, glyph: string): string {
  if (status === "failed") return danger(glyph);
  if (status === "running") return gold(glyph);
  if (status === "ok") return concrete(glyph);
  return structure(glyph);
}

function clip(text: string, room: number): string {
  return room <= 0 ? "" : [...text].slice(0, room).join("");
}

/**
 * La cabecera con su barra y su contador, y una fila por paso. Los pendientes
 * apagados: son la parte que dice cuánto falta.
 */
export function progressLines(model: InstallProgressModel, width = 80): readonly string[] {
  const filled = model.total === 0 ? BAR_W : Math.round((model.done / model.total) * BAR_W);
  const head = `  ${gold("//")} ${structure("001. instalando")}    ${gold("▏".repeat(filled))}${structure("▏".repeat(BAR_W - filled))}   ${concrete(`${model.done} / ${model.total}`)}`;

  const rows = model.steps.map((id) => {
    const status = model.status[id] ?? "pending";
    const label = LABEL[id];
    const body = status === "running" || status === "failed" ? concrete(label) : structure(label);
    const pad = " ".repeat(Math.max(1, LABEL_W - visibleWidth(label)));
    const room = width - 4 - 2 - LABEL_W - 1;
    const tail = model.detail[id] ?? (status === "pending" ? "pendiente" : "");
    return `    ${paintStep(status, GLYPH_FOR[status])} ${body}${pad}${structure(clip(tail, room))}`;
  });

  return Object.freeze([head, "", ...rows]);
}
