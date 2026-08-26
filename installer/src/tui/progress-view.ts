// =============================================================================
// PROGRESS VIEW — la pantalla del avance
// La mitad impura de `progress.ts`: mantiene el modelo, decide cuándo repintar y
// escribe. La composición sigue siendo pura y se testea aparte.
//
// Repintar es reescribir sobre lo ya escrito, y eso solo existe en un terminal.
// Sin TTY —`curl | bash` recibe un fichero, no una pantalla— un repintado deja
// basura de escapes en el log, así que ahí se escribe una línea por paso cerrado
// y se acabó.
//
// El spinner que expone NO pinta: alimenta la fila que corre. Los handlers ya
// escribían su propia etiqueta («Desplegando Ein en ~/.pi/agent») y esa etiqueta
// es exactamente el detalle vivo que la lista quiere enseñar; lo que sobraba era
// que la pintara por su cuenta y compitiera con la lista.
// =============================================================================

import type { InstallPlanEntryId, InstallPlanV1 } from "../core/install-plan.ts";
import type { InstallPlanProgress, InstallPlanProgressEvent } from "../core/install-executor.ts";
import { advanceProgress, progressLines, startProgress, stepLabel, type InstallProgressModel } from "./progress.ts";
import type { Spinner } from "./prompt.ts";

export type ProgressIO = Readonly<{
  write: (text: string) => void;
  isTTY: boolean;
  columns: number;
}>;

export function productionProgressIO(): ProgressIO {
  return {
    write: (text) => { process.stdout.write(text); },
    isTTY: Boolean(process.stdout.isTTY),
    columns: process.stdout.columns ?? 80,
  };
}

export type ProgressView = Readonly<{
  progress: InstallPlanProgress;
  /** Mismo contrato que `p.spinner`, para los puntos de llamada que ya existen. */
  spinner: () => Spinner;
  finish: () => void;
}>;

export function createProgressView(plan: InstallPlanV1, io: ProgressIO): ProgressView {
  let model: InstallProgressModel = startProgress(plan);
  let painted = 0;
  let running: InstallPlanEntryId | undefined;

  const repaint = (): void => {
    if (!io.isTTY) return;
    const lines = progressLines(model, io.columns);
    // Subir hasta la primera fila ya escrita y borrarla: sin esto cada evento
    // apilaría la lista entera otra vez.
    const up = painted > 0 ? `\x1b[${painted}A` : "";
    io.write(`${up}${lines.map((line) => `\x1b[2K${line}`).join("\n")}\n`);
    painted = lines.length;
  };

  const live = (detail: string): void => {
    if (!running) return;
    model = advanceProgress(model, { kind: "live", id: running, detail });
    repaint();
  };

  const progress: InstallPlanProgress = (event: InstallPlanProgressEvent) => {
    if (event.kind === "start") running = event.id;
    model = advanceProgress(model, event);
    if (io.isTTY) {
      repaint();
      return;
    }
    // Sin terminal: una línea por paso cerrado, sin color ni escapes.
    if (event.kind === "start") return;
    const detail = event.kind === "done" ? model.detail[event.id] ?? "" : "no ejecutado";
    io.write(`    ${stepLabel(event.id)}${detail ? `  ${detail}` : ""}\n`);
  };

  return Object.freeze({
    progress,
    spinner: (): Spinner => ({
      start: (message: string) => { live(message.toLowerCase()); },
      stop: (message?: string) => { if (message) live(message); },
    }),
    finish: () => { repaint(); },
  });
}
