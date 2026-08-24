// =============================================================================
// EIN INSTALLER — entry point
// CLI router + interactive TUI (no args). Subcommands wired incrementally per
// implementation phase.
// =============================================================================

import { runDoctorCommand } from "./cli/doctor.ts";
import { runInstall } from "./cli/install.ts";
import { runBootstrapInstall } from "./cli/runtime-prompt.ts";
import { runUpdate } from "./cli/update.ts";
import { runUninstall } from "./cli/uninstall.ts";
import { runRestore } from "./cli/restore.ts";
import { INSTALLER_VERSION, versionOutputLines } from "./core/version.ts";
import { deployTemplate, readBundledManifest } from "./core/deploy.ts";
import { detectPlatform } from "./core/platform.ts";
import { runUpdateContinuation } from "./core/child-continuation.ts";
import { normalizeTag, resolveReleaseContract } from "./core/release-resolver.ts";

// The bundled template version = installer version by build (bundle-template
// stamps package.json version), but read it from the embedded manifest so the
// probe catches a genuinely mismatched bundle; fall back to INSTALLER_VERSION.
async function bundledTemplateVersion(): Promise<string> {
  try {
    return (await readBundledManifest())?.templateVersion ?? INSTALLER_VERSION;
  } catch {
    return INSTALLER_VERSION;
  }
}

// `<binary> --version` — the update transaction probes this and needs BOTH the
// installer and template versions (binary-probe.ts parses two labeled lines).
async function printVersion(): Promise<number> {
  console.log(versionOutputLines(await bundledTemplateVersion()).join("\n"));
  return 0;
}

// `<binary> --ein-continuation=<txId> --ein-release=<tag>` — spawned by the
// updater on the freshly-swapped binary to confirm its identity matches the
// release before the template deploy / marker commit proceed. Emits the JSON
// ContinuationMessage the parent parses; never a human entry point.
async function runContinuationEntry(argv: string[]): Promise<number> {
  const txId = argv.find((a) => a.startsWith("--ein-continuation="))!.slice("--ein-continuation=".length);
  const releaseRaw =
    argv.find((a) => a.startsWith("--ein-release="))?.slice("--ein-release=".length) ??
    process.env.EIN_UPDATE_RELEASE_TAG ??
    "";
  const identity = { binaryVersion: INSTALLER_VERSION, templateVersion: await bundledTemplateVersion() };
  const tag = normalizeTag(releaseRaw);
  if (!tag.ok) {
    console.log(JSON.stringify({ txId, releaseTag: releaseRaw, ...identity, status: "failed", error: "invalid release tag" }));
    return 1;
  }
  const message = runUpdateContinuation({ txId, releaseTag: tag.value, identity });
  console.log(JSON.stringify(message));
  return message.status === "ok" ? 0 : 1;
}

// `<binary> --ein-deploy-template=<agentDir>` — spawned by the updater on the
// new binary to extract its embedded template into the agent dir.
async function runDeployTemplateEntry(): Promise<number> {
  try {
    await deployTemplate(detectPlatform());
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

type ReleaseContractArgs = {
  channel?: string;
  tag?: string;
  target: string;
};

function readReleaseContractArgs(args: readonly string[]): ReleaseContractArgs {
  let channel: string | undefined;
  let tag: string | undefined;
  let target = "pi";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--runtime") {
      target = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--release-channel" || arg === "--release-tag") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) throw new Error(`${arg} necesita un valor separado`);
      if (arg === "--release-channel") {
        if (channel !== undefined) throw new Error("--release-channel no puede repetirse");
        channel = value;
      } else {
        if (tag !== undefined) throw new Error("--release-tag no puede repetirse");
        tag = value;
      }
      index += 1;
      continue;
    }
    if (arg.startsWith("--release-channel=") || arg.startsWith("--release-tag=")) {
      throw new Error("El contrato release usa --release-channel/--release-tag con valores separados");
    }
  }
  return { channel, tag, target };
}

function runInstallWithReleaseAdmission(args: string[]): number | Promise<number> {
  let input: ReleaseContractArgs;
  try {
    input = readReleaseContractArgs(args);
  } catch (error) {
    console.error(`Error de contrato release: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const admitted = resolveReleaseContract(input.channel, input.tag, input.target, INSTALLER_VERSION);
  if (!admitted.ok) {
    console.error(`Error de contrato release: ${admitted.error.message}`);
    return 1;
  }
  return runInstall(args);
}

function printHelp(): void {
  console.log("ein-install — arranque y ciclo de vida local de Ein");
  console.log("");
  console.log("uso: ein-install [comando]");
  console.log("");
  console.log("sin comando: instala, preguntando solo el runtime.");
  console.log("`ein` es la puerta normal; estos verbos tambien responden desde ahi.");
  console.log("");
  console.log("comandos:");
  console.log("  install      instala/actualiza Ein (checks + deploy + secrets)");
  console.log("  update       actualiza Ein y pi a la última versión");
  console.log("  uninstall    mueve Ein a recuperación (--runtime pi|claude|both; conserva estado privado)");
  console.log("  restore      restaura desde un backup (--pin/--unpin <nombre>)");
  console.log("  doctor       diagnostico del despliegue (sin lanzar pi)");
  console.log("  --version    versión del instalador");
  console.log("");
  console.log("flags: --yes --dry-run --no-engram --no-secrets --no-linear --no-hypa --no-codegraph");
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const [cmd, ...rest] = argv;

  // Internal update-transaction entry points (spawned by the updater on the
  // candidate/new binary, never typed by a human). Matched by prefix because
  // they carry an inline value (`--flag=value`).
  if (argv.some((a) => a.startsWith("--ein-continuation="))) return runContinuationEntry(argv);
  const deployTpl = argv.find((a) => a.startsWith("--ein-deploy-template="));
  if (deployTpl) return runDeployTemplateEntry();

  switch (cmd) {
    case "install":
      return runInstallWithReleaseAdmission(rest);
    case "update":
      return runUpdate(rest);
    case "uninstall":
      return runUninstall(rest);
    case "restore":
      return runRestore(rest);
    case "doctor":
      return runDoctorCommand();
    case "--version":
    case "-v":
      return printVersion();
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return 0;
    case undefined:
      // No args → install, asking only for the runtime. The lifecycle actions
      // are `ein`'s, not a second menu here.
      return runBootstrapInstall();
    default:
      console.error(`comando desconocido: ${cmd}`);
      printHelp();
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
