// =============================================================================
// PROMPT — la interacción del instalador, en la gramática de Ein
// La otra mitad de `report.ts`. Con solo la salida reescrita quedaba lo peor de
// los dos mundos: el instalador contaba las cosas en su estilo y luego abría un
// menú con el canalón `│ ◆` de otro producto. Un menú es lo más visible que
// tiene un instalador, así que es justo lo que no puede ir en gramática ajena.
//
// El contrato imita al de `@clack/prompts` (cancelar devuelve un símbolo que
// `isCancel` reconoce) para que los puntos de llamada no tengan que cambiar de
// forma, solo de importación.
//
// La fila con foco es una BANDA de fondo, no un borde ni un cursor invertido.
// =============================================================================

import { GLYPH, band, concrete, gold, structure, visibleWidth } from "./theme.ts";

export const CANCEL = Symbol("ein.cancel");

/** Guarda de tipo, no un booleano suelto: los puntos de llamada estrechan con ella. */
export function isCancel(value: unknown): value is typeof CANCEL {
  return value === CANCEL;
}

const INDENT = "  ";
const ROW_INDENT = "    ";

function write(text: string): void {
  process.stdout.write(text);
}

function question(message: string): void {
  write(`\n${INDENT}${gold("//")} ${structure(message.toLowerCase())}\n\n`);
}

/** Ancho de la banda: el terminal, acotado para que no se estire sin fin. */
function bandWidth(): number {
  const columns = process.stdout.columns;
  return Math.max(40, Math.min(Number.isFinite(columns) ? columns - 2 : 76, 100));
}

export type SelectOption<T> = Readonly<{ value: T; label: string; hint?: string }>;

type KeyHandler = (key: string) => boolean | void;

/**
 * Lee pulsaciones en crudo hasta que el handler devuelve `true`. Devolver el
 * terminal a su estado anterior es obligatorio incluso si algo revienta: dejar
 * el tty en raw mode se lleva por delante la shell del usuario.
 */
async function readKeys(handler: KeyHandler): Promise<void> {
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw === true;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  try {
    await new Promise<void>((resolve) => {
      const onData = (chunk: string): void => {
        if (handler(chunk) === true) {
          stdin.off("data", onData);
          resolve();
        }
      };
      stdin.on("data", onData);
    });
  } finally {
    if (stdin.isTTY) stdin.setRawMode(wasRaw);
    stdin.pause();
  }
}

function renderOptions<T>(options: readonly SelectOption<T>[], cursor: number, width: number, first: boolean): void {
  if (!first) write(`\x1b[${options.length}A`);
  for (const [index, option] of options.entries()) {
    const active = index === cursor;
    const bar = active ? gold(GLYPH.rule) : structure(GLYPH.rule);
    const label = active ? concrete(option.label) : structure(option.label);
    const hint = option.hint ? `  ${structure(option.hint)}` : "";
    const row = `${ROW_INDENT}${bar} ${label}${hint}`;
    const pad = " ".repeat(Math.max(0, width - visibleWidth(row)));
    write(`\x1b[2K${active ? band(`${row}${pad}`) : row}\n`);
  }
}

export async function select<T>(opts: {
  message: string;
  options: readonly SelectOption<T>[];
  initialValue?: T;
}): Promise<T | typeof CANCEL> {
  const { message, options } = opts;
  if (options.length === 0) return CANCEL;

  const width = bandWidth();
  let cursor = Math.max(0, options.findIndex((option) => option.value === opts.initialValue));

  question(message);
  renderOptions(options, cursor, width, true);

  let cancelled = false;
  await readKeys((key) => {
    if (key === "\x03" || key === "\x1b" || key === "q") {
      cancelled = true;
      return true;
    }
    if (key === "\r" || key === "\n") return true;
    if (key === "\x1b[A" || key === "k") cursor = (cursor - 1 + options.length) % options.length;
    else if (key === "\x1b[B" || key === "j") cursor = (cursor + 1) % options.length;
    else return;
    renderOptions(options, cursor, width, false);
  });

  write("\n");
  return cancelled ? CANCEL : options[cursor].value;
}

export async function confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean | typeof CANCEL> {
  const result = await select<boolean>({
    message: opts.message,
    initialValue: opts.initialValue ?? true,
    options: [
      { value: true, label: "sí" },
      { value: false, label: "no" },
    ],
  });
  return result;
}

/** Entrada oculta. No se hace eco de nada: ni asteriscos, que filtran longitud. */
export async function password(opts: { message: string }): Promise<string | typeof CANCEL> {
  question(opts.message);
  write(`${ROW_INDENT}${gold(GLYPH.focus)} `);

  let value = "";
  let cancelled = false;
  await readKeys((key) => {
    if (key === "\x03" || key === "\x1b") {
      cancelled = true;
      return true;
    }
    if (key === "\r" || key === "\n") return true;
    if (key === "\x7f") {
      value = value.slice(0, -1);
      return;
    }
    // Se descartan las secuencias de control: una flecha no es un carácter.
    if (!key.startsWith("\x1b") && key >= " ") value += key;
  });

  write("\n\n");
  return cancelled ? CANCEL : value;
}

export type Spinner = Readonly<{ start(message: string): void; stop(message?: string): void }>;

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Indicador de trabajo. Un solo carácter animado y el texto en minúscula: es
 * estado vivo, y el estado vivo es diminuto (STYLE.md // 002, regla 10).
 */
export function spinner(): Spinner {
  let timer: ReturnType<typeof setInterval> | undefined;
  let frame = 0;
  let label = "";

  const paint = (): void => {
    write(`\r\x1b[2K${ROW_INDENT}${gold(FRAMES[frame])} ${structure(label)}`);
    frame = (frame + 1) % FRAMES.length;
  };

  return {
    start(message: string): void {
      label = message.toLowerCase();
      if (!process.stdout.isTTY) {
        write(`${ROW_INDENT}${structure(label)}\n`);
        return;
      }
      paint();
      timer = setInterval(paint, 90);
    },
    stop(message?: string): void {
      if (timer) clearInterval(timer);
      timer = undefined;
      const done = (message ?? label).toLowerCase();
      if (!process.stdout.isTTY) {
        if (message) write(`${ROW_INDENT}${structure(done)}\n`);
        return;
      }
      write(`\r\x1b[2K${ROW_INDENT}${structure(`${GLYPH.sep} ${done}`)}\n`);
    },
  };
}
