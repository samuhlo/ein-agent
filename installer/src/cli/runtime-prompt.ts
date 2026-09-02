// =============================================================================
// CLI: bootstrap runtime prompt (no-arg default)
// `ein-install` with no arguments installs Ein. Pi is always the core; the one
// question only decides whether to add Claude Code. It does NOT offer the
// lifecycle actions: those live behind `ein`, and offering them twice is what
// forced two visual grammars for the same administration.
// =============================================================================

import * as p from "../tui/ui.ts";
import { playBanner } from "../tui/banner.ts";
import { RUNTIME_PROMPT_OPTIONS, type RuntimePromptOption } from "./runtime-options.ts";
import { runInstall, type InstallSelection } from "./install.ts";
type RuntimePrompt = (options: {
  message: string;
  options: readonly RuntimePromptOption[];
}) => Promise<unknown>;

export type RunBootstrapInstallOptions = {
  runtimePrompt?: RuntimePrompt;
  runInstall?: (args: string[], target: InstallSelection) => Promise<number>;
  playBanner?: () => Promise<void>;
  isCancel?: (value: unknown) => boolean;
  write?: (line: string) => void;
};

export async function selectInstallTarget(
  prompt?: RuntimePrompt,
  isCancel: (value: unknown) => boolean = p.isCancel,
  message = "Quieres añadir Claude Code como complemento?",
): Promise<InstallSelection | null> {
  const target = prompt
    ? await prompt({ message, options: RUNTIME_PROMPT_OPTIONS })
    : await p.select({ message, options: RUNTIME_PROMPT_OPTIONS });
  return isCancel(target) ? null : (target as InstallSelection);
}

export async function runBootstrapInstall(options: RunBootstrapInstallOptions = {}): Promise<number> {
  const isCancel = options.isCancel ?? p.isCancel;
  const install = options.runInstall ?? runInstall;
  const write = options.write ?? ((line: string) => { console.log(line); });

  // BLINDAJE -> Sin stdin interactivo, clack no recibe teclas y el prompt se
  // queda congelado (curl|bash en macOS: kqueue no puede poll /dev/tty). Decir
  // que falta el runtime es util; colgarse esperando una tecla no lo es.
  if (!process.stdin.isTTY) {
    write("ein-install: sin terminal no se puede preguntar si quieres añadir Claude Code.");
    write("Pásalo explícito: ein-install install --runtime pi|both");
    return 0;
  }

  await (options.playBanner ?? playBanner)();

  const target = await selectInstallTarget(options.runtimePrompt, isCancel);
  if (target === null) return 0;
  return install([], target);
}
