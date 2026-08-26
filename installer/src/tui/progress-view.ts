// =============================================================================
// PROGRESS VIEW — el avance de la instalación, línea a línea
// La mitad impura de `progress.ts`: mantiene el modelo y escribe. La composición
// sigue siendo pura y se testea aparte.
//
// APPEND-ONLY, y esto es lo importante. La primera versión repintaba la lista
// entera subiendo el cursor tantas filas como había pintado. Pero la pantalla no
// es suya: trece puntos de `install.ts` escriben durante los handlers —el
// informe completo del doctor entre ellos—, y cada uno de esos writes invalida
// la cuenta de filas. El siguiente repintado sube a ciegas y deja trozos de
// lista pegados encima de lo que hubiera debajo.
//
// Así que aquí no se sube el cursor NUNCA. Una línea por paso al cerrarse, con
// su posición en el plan, y mientras corre un indicador que vive en SU propia
// línea y se reescribe con retorno de carro: un `\r` no puede pisar lo que
// escribió otro. Sin TTY ni siquiera eso — `curl | bash` recibe un fichero.
// =============================================================================

import type { InstallPlanEntryId, InstallPlanV1 } from "../core/install-plan.ts";
import type { InstallPlanProgress, InstallPlanProgressEvent } from "../core/install-executor.ts";
import { advanceProgress, startProgress, stepLabel, stepMark, type InstallProgressModel } from "./progress.ts";
import { concrete, gold, structure } from "./theme.ts";
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

const INDENT = "    ";
const LABEL_W = 26;

/** Un detalle larguísimo se recorta: la línea nunca decide el ancho. */
function clip(text: string, room: number): string {
  return room <= 0 ? "" : [...text].slice(0, room).join("");
}

export function createProgressView(plan: InstallPlanV1, io: ProgressIO): ProgressView {
  let model: InstallProgressModel = startProgress(plan);
  let announced = false;
  let running: InstallPlanEntryId | undefined;
  /** Hay un indicador vivo ocupando la línea actual, sin cerrar con salto. */
  let openLine = false;

  const counter = (): string => `${String(model.done).padStart(String(model.total).length)}/${model.total}`;

  const announce = (): void => {
    if (announced) return;
    announced = true;
    io.write(`\n  ${gold("//")} ${structure("001. instalando")}   ${concrete(`${model.total} pasos`)}\n\n`);
  };

  /** El indicador vivo: se reescribe sobre sí mismo, nunca sobre otra fila. */
  const live = (detail: string): void => {
    if (!io.isTTY || !running) return;
    const label = stepLabel(running).padEnd(LABEL_W);
    const room = io.columns - INDENT.length - LABEL_W - 2;
    io.write(`\r\x1b[2K${INDENT}${gold("▸")} ${concrete(label)}${structure(clip(detail, room))}`);
    openLine = true;
  };

  const settle = (id: InstallPlanEntryId, fallback: string): void => {
    const status = model.status[id] ?? "pending";
    const detail = model.detail[id] ?? fallback;
    const label = stepLabel(id).padEnd(LABEL_W);
    const head = io.isTTY && openLine ? "\r\x1b[2K" : "";
    openLine = false;
    const room = io.columns - INDENT.length - LABEL_W - counter().length - 5;
    io.write(`${head}${INDENT}${stepMark(status)} ${label}${structure(counter())}  ${structure(clip(detail, room))}\n`);
  };

  const progress: InstallPlanProgress = (event: InstallPlanProgressEvent) => {
    announce();
    if (event.kind === "start") {
      running = event.id;
      model = advanceProgress(model, event);
      live("");
      return;
    }
    model = advanceProgress(model, event);
    running = undefined;
    settle(event.id, event.kind === "abandoned" ? "no ejecutado" : "");
  };

  return Object.freeze({
    progress,
    spinner: (): Spinner => ({
      start: (message: string) => {
        if (!running) return;
        model = advanceProgress(model, { kind: "live", id: running, detail: message.toLowerCase() });
        live(message.toLowerCase());
      },
      stop: (message?: string) => {
        if (!running || !message) return;
        model = advanceProgress(model, { kind: "live", id: running, detail: message });
        live(message);
      },
    }),
    finish: () => {
      if (openLine) { io.write("\n"); openLine = false; }
    },
  });
}
