import { stdin, stdout } from "node:process";

import type { RuntimeProvider } from "./runtime-session-adapters.ts";
import type { LaunchOutcome } from "./terminal-app-controller.ts";

const READY = "\u001b[?2004h";
const PASTE_START = "\u001b[200~";
const PASTE_END = "\u001b[201~";
const UNSAFE_BRIEF_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u;

export function isContinueBriefTransportSafe(brief: string): boolean {
  return !UNSAFE_BRIEF_CONTROL.test(brief);
}

export type ContinuePtyOptions = Readonly<{
  cwd: string;
  provider: RuntimeProvider;
  brief: string;
  command?: readonly string[];
  env?: NodeJS.ProcessEnv;
}>;

/**
 * DECSET 2004 queues delivery until the provider installs and runs its input handler.
 */
export async function runContinueInPty(options: ContinuePtyOptions): Promise<LaunchOutcome> {
  if (!isContinueBriefTransportSafe(options.brief)) throw new Error("unsafe Continue brief");
  let secret = options.brief;
  let tail = "";
  let delivered = false;
  const decoder = new TextDecoder();
  let terminal: Bun.Terminal;

  const forward = (chunk: Buffer | string): void => { terminal.write(chunk); };
  const resize = (): void => { terminal.resize(stdout.columns || 80, stdout.rows || 24); };
  terminal = new Bun.Terminal({
    cols: stdout.columns || 80,
    rows: stdout.rows || 24,
    data: (_terminal, bytes) => {
      const text = decoder.decode(bytes, { stream: true });
      if (!delivered) {
        const observed = tail + text;
        if (observed.includes(READY)) {
          delivered = true;
          terminal.write(`${PASTE_START}${secret}${PASTE_END}\r`);
          secret = "";
        }
        tail = observed.slice(-(READY.length - 1));
      }
      stdout.write(bytes);
    },
  });

  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.on("data", forward);
  stdout.on("resize", resize);
  try {
    let child: ReturnType<typeof Bun.spawn>;
    try {
      child = Bun.spawn([...(options.command ?? [options.provider])], { cwd: options.cwd, env: options.env, terminal });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { kind: "unavailable", reason: "executable-unavailable" };
      }
      throw error;
    }
    return { kind: "exited", code: await child.exited };
  } finally {
    secret = "";
    stdin.off("data", forward);
    stdout.off("resize", resize);
    stdin.setRawMode?.(false);
    stdin.pause();
    terminal.close();
  }
}
