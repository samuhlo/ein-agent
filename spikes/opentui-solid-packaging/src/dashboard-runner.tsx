import { createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core";
import { render } from "@opentui/solid";
import type {
  TerminalAppController,
  TerminalAppControllerPorts,
} from "../../../ein-pi/agent/lib/terminal-app-controller.ts";
import { translateOpenTuiKey } from "./dashboard-key";
import { DashboardRoot } from "./dashboard-root";

export type DashboardRenderer = Readonly<{
  destroy: () => void;
  keyInput: Readonly<{
    on: (event: "keypress", listener: (key: KeyEvent) => void) => unknown;
    off: (event: "keypress", listener: (key: KeyEvent) => void) => unknown;
  }>;
}>;

export type DashboardRunnerAdapters = Readonly<{
  createRenderer: () => Promise<DashboardRenderer>;
  mount: (controller: TerminalAppController, renderer: DashboardRenderer) => Promise<void>;
}>;

type Generation = Readonly<{
  id: number;
  renderer: DashboardRenderer;
  onKey: (key: KeyEvent) => void;
}>;

export function productionDashboardAdapters(): DashboardRunnerAdapters {
  return {
    createRenderer: () => createCliRenderer({
      screenMode: "alternate-screen",
      clearOnShutdown: true,
      exitOnCtrlC: false,
      useKittyKeyboard: null,
      consoleMode: "disabled",
    }),
    mount: async (controller, renderer) => {
      await render(
        () => <DashboardRoot controller={controller} />,
        renderer as CliRenderer,
      );
    },
  };
}

export async function runDashboardCandidate(
  createController: (lifecycle: TerminalAppControllerPorts["lifecycle"]) => TerminalAppController,
  adapters: DashboardRunnerAdapters = productionDashboardAdapters(),
): Promise<number> {
  let active: Generation | undefined;
  let generation = 0;
  let finished = false;
  let settle: (code: number) => void = () => undefined;
  const result = new Promise<number>((resolve) => { settle = resolve; });

  const destroy = (): void => {
    const owned = active;
    active = undefined;
    if (!owned) return;
    owned.renderer.keyInput.off("keypress", owned.onKey);
    owned.renderer.destroy();
  };

  const finish = (code: number): void => {
    if (finished) return;
    finished = true;
    generation += 1;
    destroy();
    settle(code);
  };

  let controller: TerminalAppController;
  const start = async (): Promise<void> => {
    const id = ++generation;
    destroy();
    const renderer = await adapters.createRenderer();
    if (finished || id !== generation) {
      renderer.destroy();
      return;
    }
    const onKey = (event: KeyEvent): void => {
      const key = translateOpenTuiKey(event);
      if (key === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      controller.dispatch({ kind: "key", key });
    };
    active = { id, renderer, onKey };
    renderer.keyInput.on("keypress", onKey);
    try {
      await adapters.mount(controller, renderer);
    } catch (error) {
      if (active?.id === id) destroy();
      throw error;
    }
  };

  try {
    controller = createController({
      release: destroy,
      resume: () => { void start().catch(() => finish(1)); },
      exit: finish,
    });
    await start();
  } catch {
    finish(1);
  }
  return result;
}
