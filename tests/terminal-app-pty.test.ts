import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isContinueBriefTransportSafe, runContinueInPty, type ContinuePtyOptions } from "../ein-pi/agent/lib/terminal-continue-transport.ts";
import type { LaunchOutcome } from "../ein-pi/agent/lib/terminal-app-controller.ts";
import { productionContinue, productionLaunch } from "../ein-pi/agent/surfaces/terminal-app-entrypoint.ts";
import { createPiPrelaunchCoordinator } from "../ein-pi/agent/lib/pi-prelaunch-update.ts";
import {
  EIN_SDD_SESSION_BINDING_ENV_KEY,
  parseSessionBindingLaunchMetadataV1,
} from "../ein-pi/agent/lib/sdd-session-binding.ts";

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

function start(scenario: "quit" | "unavailable" | "handoff" | "continue-pi" | "continue-claude"): PtyRun {
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
      XDG_CONFIG_HOME: join(import.meta.dir, "fixtures", "empty-config"),
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
	test("one shared preparation precedes direct and continuity Pi handoffs", async () => {
		const root = mkdtempSync(join(tmpdir(), "ein-terminal-prelaunch-"));
		const bin = join(root, "bin");
		const originalHome = process.env.HOME;
		const originalPath = process.env.PATH;
		mkdirSync(bin);
		writeFileSync(join(bin, "pi"), "#!/bin/sh\nexit 0\n");
		chmodSync(join(bin, "pi"), 0o755);
		process.env.HOME = root;
		process.env.PATH = bin;

		try {
			const events: string[] = [];
			const preparation = createPiPrelaunchCoordinator({
				run: async ({ argv }) => {
					events.push(`prepare:${argv.join(" ")}`);
					return { code: 0, stdout: "" };
				},
			});
			expect(await productionLaunch(root, "pi", undefined, undefined, preparation)).toEqual({ kind: "exited", code: 0 });
			expect(await productionContinue(root, "pi", "brief", undefined, async () => {
				events.push("continue");
				return { kind: "exited", code: 0 };
			}, preparation)).toEqual({ kind: "exited", code: 0 });
			expect(events).toEqual(["prepare:update --all --no-approve", "continue"]);
		} finally {
			if (originalHome === undefined) delete process.env.HOME;
			else process.env.HOME = originalHome;
			if (originalPath === undefined) delete process.env.PATH;
			else process.env.PATH = originalPath;
			rmSync(root, { recursive: true, force: true });
		}
	});

  test("binding metadata reaches only validated Pi create before the separate brief", async () => {
    const root = mkdtempSync(join(tmpdir(), "ein-terminal-binding-"));
    const project = join(root, "project");
    const cwd = join(root, "linked-project");
    const focusedChange = "active-binding-change";
    const bin = join(project, "bin");
    const originalHome = process.env.HOME;
    const originalPath = process.env.PATH;
    mkdirSync(join(project, "openspec", "changes", focusedChange), { recursive: true });
    mkdirSync(bin);
    symlinkSync(project, cwd, "dir");
    writeFileSync(join(bin, "pi"), "#!/bin/sh\nexit 0\n");
    writeFileSync(join(bin, "claude"), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, "pi"), 0o755);
    chmodSync(join(bin, "claude"), 0o755);
    process.env.HOME = project;
    process.env.PATH = bin;

    try {
      const observations: string[] = [];
      const launches: ContinuePtyOptions[] = [];
      const run = async (options: ContinuePtyOptions): Promise<LaunchOutcome> => {
        launches.push(options);
        observations.push(options.env?.[EIN_SDD_SESSION_BINDING_ENV_KEY] ? "child-metadata" : "child-unbound");
        observations.push(`brief:${options.brief}`);
        return { kind: "exited", code: 0 };
      };

      expect(await productionContinue(cwd, "pi", "continuity-only", focusedChange, run)).toEqual({ kind: "exited", code: 0 });
      const piLaunch = launches[0]!;
      expect(piLaunch.command).toEqual([join(bin, "pi")]);
      expect(piLaunch.cwd).toBe(realpathSync(project));
      const bindingMetadata = piLaunch.env?.[EIN_SDD_SESSION_BINDING_ENV_KEY];
      expect(bindingMetadata).toBeDefined();
      expect(parseSessionBindingLaunchMetadataV1(bindingMetadata ?? "")).toEqual({
        version: 1,
        change: focusedChange,
        projectCwd: realpathSync(project),
      });
      expect(piLaunch.brief).toBe("continuity-only");
      expect(piLaunch.brief).not.toContain(focusedChange);
      expect(observations).toEqual(["child-metadata", "brief:continuity-only"]);

      expect(await productionContinue(cwd, "pi", "fresh", undefined, run)).toEqual({ kind: "exited", code: 0 });
      expect(launches[1]!.env?.[EIN_SDD_SESSION_BINDING_ENV_KEY]).toBeUndefined();

      expect(await productionContinue(cwd, "claude", "provider-isolated", focusedChange, run)).toEqual({ kind: "exited", code: 0 });
      expect(launches[2]!.env?.[EIN_SDD_SESSION_BINDING_ENV_KEY]).toBeUndefined();
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("binding validation refuses stale and unsafe requested Pi focus without spawning", async () => {
    let launches = 0;
    const run = async (): Promise<LaunchOutcome> => {
      launches += 1;
      return { kind: "exited", code: 0 };
    };

    for (const focusedChange of ["already-closed-change", "../unsafe-change"]) {
      const outcome = await productionContinue(
        join(import.meta.dir, ".."),
        "pi",
        "continuity-only",
        focusedChange,
        run,
      );
      expect(outcome.kind).toBe("unavailable");
    }
    expect(launches).toBe(0);
  });

  test("binding intent reaches focused direct create and continue-as-new, but not picked resume", () => {
    const source = readFileSync(
      join(import.meta.dir, "..", "ein-pi", "agent", "surfaces", "terminal-app-entrypoint.ts"),
      "utf8",
    );
		expect(source).toContain("productionLaunch(cwd, provider, reference, focusedChange, prelaunch)");
		expect(source).toContain("productionLaunchPlan(cwd, provider, reference, focusedChange);");
		expect(source).toContain("productionLaunchPlan(cwd, provider, undefined, focusedChange)");
	});

  test("Continue brief validation preserves multiline Unicode and rejects paste termination", () => {
    expect(isContinueBriefTransportSafe("first line\nsegunda línea 漢字")).toBe(true);
    expect(isContinueBriefTransportSafe("safe\n\u001b[201~injected")).toBe(false);
  });

  test("destination spawn accepts provider-specific environment without a brief variable", () => {
    const source = readFileSync(join(import.meta.dir, "..", "ein-pi", "agent", "lib", "terminal-continue-transport.ts"), "utf8");
    expect(source).toContain("env: spawnEnvironment(options)");
    // El destino hereda el entorno pero nunca la configuración del OTRO runtime:
    // spawnear `pi` sin PI_CODING_AGENT_DIR arrancaba Pi vanilla en vez de Ein.
    expect(source).toContain("delete environment.CLAUDE_CONFIG_DIR");
    expect(source).toContain("delete environment.PI_CODING_AGENT_DIR");
    expect(String(runContinueInPty)).not.toMatch(/env[^\n]*brief|brief[^\n]*env/);
  });

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

  test("runtime execution begins after release and returns to a quittable dashboard", async () => {
    const run = start("handoff");
    try {
      await run.waitFor("ein-agent");
      run.write("p");
      await run.waitFor("code 7");
      const output = run.output();
      expect(output).toContain("HANDOFF:pi:new");
      expect(output.indexOf(ALT_LEAVE)).toBeLessThan(output.indexOf("HANDOFF:pi:new"));
      run.write("q");
      expect(await exitWithin(run)).toBe(0);
      expect(occurrences(run.output(), ALT_ENTER)).toBe(2);
      expect(occurrences(run.output(), ALT_LEAVE)).toBe(2);
    } finally {
      await run.close();
    }
  });

  test("queues the first live message until the provider attaches input and leaves the child interactive", async () => {
    for (const [provider, key, code] of [["pi", "P", 6], ["claude", "C", 8]] as const) {
      const run = start(`continue-${provider}`);
      try {
        await run.waitFor("ein-agent");
        run.write(key);
        await run.waitFor(`DELIVERED:${provider}`);
        expect(run.output()).not.toContain("PRIVATE-BRIEF-CANARY");
        run.write("x");
        await run.waitFor(`code ${code}`);
        run.write("q");
        expect(await exitWithin(run)).toBe(0);
        expect(occurrences(run.output(), ALT_ENTER)).toBe(2);
        expect(occurrences(run.output(), ALT_LEAVE)).toBe(2);
      } finally {
        await run.close();
      }
    }
  });
});
