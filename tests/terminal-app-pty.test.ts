import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const DRIVER = join(import.meta.dir, "fixtures", "terminal-app-pty-driver.ts");
const ALT_ENTER = "\u001b[?1049h";
const ALT_LEAVE = "\u001b[?1049l";

type PtyRun = {
  output: () => string;
  waitFor: (text: string) => Promise<void>;
  write: (text: string) => void;
  exited: Promise<number>;
  close: () => Promise<void>;
};

function start(scenario: "quit" | "unavailable" | "handoff"): PtyRun {
  let output = "";
  const listeners = new Set<() => void>();
  const terminal = new Bun.Terminal({
    data: (_terminal, bytes) => {
      output += new TextDecoder().decode(bytes);
      for (const listener of listeners) listener();
    },
  });
  const child = Bun.spawn([process.execPath, DRIVER, scenario], {
    cwd: join(import.meta.dir, ".."),
    env: {
      ...process.env,
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      NO_COLOR: "1",
      TERM: "xterm-256color",
    },
    terminal,
  });

  return {
    output: () => output,
    waitFor: (text) => new Promise<void>((resolve, reject) => {
      const check = (): void => {
        if (!output.includes(text)) return;
        clearTimeout(timer);
        listeners.delete(check);
        resolve();
      };
      const timer = setTimeout(() => {
        listeners.delete(check);
        reject(new Error(`PTY output did not contain ${JSON.stringify(text)}:\n${output}`));
      }, 2_000);
      listeners.add(check);
      check();
    }),
    write: (text) => { terminal.write(text); },
    exited: child.exited,
    close: async () => {
      if (child.exitCode === null) child.kill("SIGTERM");
      await child.exited;
      terminal.close();
    },
  };
}

async function exitWithin(run: PtyRun): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run.exited,
      new Promise<number>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`PTY process did not exit:\n${run.output()}`)), 2_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe("terminal app real PTY lifecycle", () => {
  test("quit restores the main screen and exits zero", async () => {
    const run = start("quit");
    try {
      await run.waitFor("ein-agent");
      run.write("q");
      expect(await exitWithin(run)).toBe(0);
      expect(occurrences(run.output(), ALT_ENTER)).toBe(1);
      expect(occurrences(run.output(), ALT_LEAVE)).toBe(1);
    } finally {
      await run.close();
    }
  });

  test("an unavailable runtime releases, resumes, reports status, and can quit", async () => {
    const run = start("unavailable");
    try {
      await run.waitFor("ein-agent");
      run.write("p");
      await run.waitFor("pty-unavailable");
      run.write("q");
      expect(await exitWithin(run)).toBe(0);
      expect(occurrences(run.output(), ALT_ENTER)).toBe(2);
      expect(occurrences(run.output(), ALT_LEAVE)).toBe(2);
    } finally {
      await run.close();
    }
  });

  test("runtime execution begins after release and its exit code propagates", async () => {
    const run = start("handoff");
    try {
      await run.waitFor("ein-agent");
      run.write("p");
      expect(await exitWithin(run)).toBe(7);
      const output = run.output();
      expect(output).toContain("HANDOFF:pi:new");
      expect(output.indexOf(ALT_LEAVE)).toBeLessThan(output.indexOf("HANDOFF:pi:new"));
      expect(occurrences(output, ALT_ENTER)).toBe(1);
      expect(occurrences(output, ALT_LEAVE)).toBe(1);
    } finally {
      await run.close();
    }
  });
});
