// =============================================================================
// CLI: bootstrap runtime prompt (no-arg default)
// `ein-install` with no arguments installs. It asks one question — which
// runtime — because that is a real bootstrap decision. It does NOT offer the
// lifecycle actions: those live behind `ein`, and offering them twice is what
// forced two visual grammars for the same administration.
// =============================================================================

import * as p from "../tui/ui.ts";
import { playBanner } from "../tui/banner.ts";
import { gold } from "../tui/theme.ts";
import { runInstall, type InstallTarget } from "./install.ts";

type RuntimePromptOption = { value: InstallTarget; label: string; hint: string };
type RuntimePrompt = (options: {
  message: string;
  options: RuntimePromptOption[];
}) => Promise<unknown>;

export type RunBootstrapInstallOptions = {
  runtimePrompt?: RuntimePrompt;
  runInstall?: (args: string[], target: InstallTarget) => Promise<number>;
  playBanner?: () => Promise<void>;
  isCancel?: (value: unknown) => boolean;
  write?: (line: string) => void;
};

const RUNTIME_PROMPT_OPTIONS: RuntimePromptOption[] = [
  { value: "pi", label: gold("Pi"), hint: "solo Pi" },
  { value: "claude", label: gold("Claude Code"), hint: "solo Claude Code" },
  { value: "both", label: gold("Both"), hint: "Pi + Claude Code" },
];

export async function selectInstallTarget(
  prompt?: RuntimePrompt,
  isCancel: (value: unknown) => boolean = p.isCancel,
  message = "Que runtime quieres instalar?",
): Promise<InstallTarget | null> {
  const target = prompt
    ? await prompt({ message, options: RUNTIME_PROMPT_OPTIONS })
    : await p.select({ message, options: RUNTIME_PROMPT_OPTIONS });
  return isCancel(target) ? null : (target as InstallTarget);
}

export async function runBootstrapInstall(options: RunBootstrapInstallOptions = {}): Promise<number> {
  const isCancel = options.isCancel ?? p.isCancel;
  const install = options.runInstall ?? runInstall;
  const write = options.write ?? ((line: string) => { console.log(line); });

  // BLINDAJE -> Sin stdin interactivo, clack no recibe teclas y el prompt se
  // queda congelado (curl|bash en macOS: kqueue no puede poll /dev/tty). Decir
  // que falta el runtime es util; colgarse esperando una tecla no lo es.
  if (!process.stdin.isTTY) {
    write("ein-install: sin terminal no se puede preguntar por el runtime.");
    write("Pasalo explicito: ein-install install --runtime pi|claude|both");
    return 0;
  }

  await (options.playBanner ?? playBanner)();

  const target = await selectInstallTarget(options.runtimePrompt, isCancel);
  if (target === null) return 0;
  return install([], target);
}
