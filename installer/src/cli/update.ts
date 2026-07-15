import * as p from "@clack/prompts";
import { detectPlatform, type Platform } from "../core/platform.ts";
import { installDeclaredPackages, installPi, type InstallStep } from "../core/deps.ts";
import { AGENT_DIR, INSTALL_MARKER } from "../core/paths.ts";
import { parseSelector } from "../core/release-resolver.ts";
import type { ReleaseSelector, UpdateOutcome } from "../core/release-types.ts";
import { recoverPendingTransaction, runUpdateTransaction } from "../core/transaction.ts";
import { defaultUpdateCaps, type UpdateCaps } from "../core/update-caps.ts";
import { bold, gold } from "../tui/theme.ts";
import { renderOutcome } from "./result.ts";

export type UpdateFlags = {
  selectorArgs: string[];
  dryRun: boolean;
  yes: boolean;
};

export type UpdateRunDependencies = {
  caps?: UpdateCaps;
  platform?: Pick<Platform, "os" | "arch">;
  agentDir?: string;
  markerPath?: string;
  journalPath?: string;
  destinationPath?: string;
  interactive?: boolean;
  write?: (line: string) => void;
  // pi (the underlying agent) is a package-manager-owned artifact outside the
  // transactional Ein-binary update; these hooks let it refresh alongside and
  // keep tests off the network. Defaults hit bun/pi for real.
  updatePi?: () => Promise<InstallStep>;
  syncPiPackages?: () => Promise<InstallStep>;
  confirmPiUpdate?: () => Promise<boolean>;
};

export function parseCliFlags(args: string[]): UpdateFlags {
  const selectorArgs: string[] = [];
  let dryRun = false;
  let yes = false;
  for (const arg of args) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--yes" || arg === "-y") yes = true;
    else selectorArgs.push(arg);
  }
  return { selectorArgs, dryRun, yes };
}

function failed(selector: ReleaseSelector | undefined, stage: Extract<UpdateOutcome, { type: "failed" }>["stage"], message: string): UpdateOutcome {
  return { type: "failed", stage, message, ...(selector ? { selector } : {}) };
}

/** Keeps dispatch and menu callers on the existing async numeric exit-code contract. */
export async function runUpdate(args: string[], dependencies: UpdateRunDependencies = {}): Promise<number> {
  const caps = dependencies.caps ?? defaultUpdateCaps();
  const flags = parseCliFlags(args);
  const write = dependencies.write ?? ((line: string) => p.log.message(line));
  if (dependencies.interactive !== false) p.intro(bold(gold("Actualizar Ein")));

  const recovery = await recoverPendingTransaction({ caps, journalPath: dependencies.journalPath });
  const selector = parseSelector(flags.selectorArgs);
  let outcome: UpdateOutcome;
  if (!recovery.ok) {
    outcome = failed(selector.ok ? selector.value : undefined, recovery.error.stage, recovery.error.message);
  } else if (!selector.ok) {
    outcome = failed(undefined, selector.error.stage, selector.error.message);
  } else {
    outcome = await runUpdateTransaction({
      caps,
      selector: selector.value,
      platform: dependencies.platform ?? detectPlatform(),
      agentDir: dependencies.agentDir ?? AGENT_DIR,
      markerPath: dependencies.markerPath ?? INSTALL_MARKER,
      journalPath: dependencies.journalPath,
      destinationPath: dependencies.destinationPath ?? process.execPath,
      dryRun: flags.dryRun,
    });
  }

  const rendered = renderOutcome(outcome);
  for (const line of rendered.lines) write(line);

  // The transactional updater above only owns the Ein binary + template +
  // marker. pi (@earendil-works/pi-coding-agent) is installed via bun and was
  // refreshed by the pre-transactional `ein update`; keep that promise (menu
  // and help still say "Ein y pi") by refreshing it after a successful,
  // non-dry-run update. Best-effort: never turns a good update into a failure.
  if (rendered.exitCode === 0 && !flags.dryRun) {
    await refreshPi(flags, dependencies, write);
  }

  if (dependencies.interactive !== false) {
    p.outro(rendered.exitCode === 0 ? "Actualizacion finalizada." : "Actualizacion no aplicada.");
  }
  return rendered.exitCode;
}

/** Refreshes pi and the declared Pi packages after the Ein binary transaction. */
async function refreshPi(
  flags: UpdateFlags,
  dependencies: UpdateRunDependencies,
  write: (line: string) => void,
): Promise<void> {
  const interactive = dependencies.interactive !== false;
  const wantPi = flags.yes
    ? true
    : dependencies.confirmPiUpdate
      ? await dependencies.confirmPiUpdate()
      : interactive
        ? await confirmPiUpdate()
        : false;
  if (!wantPi) return;

  const updatePi = dependencies.updatePi ?? installPi;
  const syncPackages = dependencies.syncPiPackages ?? installDeclaredPackages;

  const piSpinner = interactive ? p.spinner() : null;
  piSpinner?.start("Actualizando pi a la ultima version");
  const pi = await updatePi();
  piSpinner?.stop(pi.detail);
  if (!interactive) write(pi.detail);

  const pkgSpinner = interactive ? p.spinner() : null;
  pkgSpinner?.start("Verificando paquetes de Pi declarados");
  const pkgs = await syncPackages();
  pkgSpinner?.stop(pkgs.detail);
  if (!interactive) write(pkgs.detail);
}

async function confirmPiUpdate(): Promise<boolean> {
  const response = await p.confirm({ message: "Actualizar pi (@earendil-works/pi-coding-agent)?" });
  return p.isCancel(response) ? false : response;
}

export async function confirmUpdate(): Promise<boolean> {
  const response = await p.confirm({ message: "Continuar con la actualizacion verificada?" });
  return p.isCancel(response) ? false : response;
}
