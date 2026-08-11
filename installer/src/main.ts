// =============================================================================
// EIN INSTALLER — entry point
// CLI router + interactive TUI (no args). Subcommands wired incrementally per
// implementation phase.
// =============================================================================

import { runDoctorCommand } from "./cli/doctor.ts";
import { runInstall } from "./cli/install.ts";
import { runMenu } from "./cli/menu.ts";
import { runUpdate } from "./cli/update.ts";
import { runUninstall } from "./cli/uninstall.ts";
import { runRestore } from "./cli/restore.ts";
import { INSTALLER_VERSION, versionOutputLines } from "./core/version.ts";
import { deployTemplate, readBundledManifest } from "./core/deploy.ts";
import { detectPlatform } from "./core/platform.ts";
import { runUpdateContinuation } from "./core/child-continuation.ts";
import { normalizeTag } from "./core/release-resolver.ts";

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

function printHelp(): void {
  console.log("ein — instalador del workbench Ein sobre Pi");
  console.log("");
  console.log("uso: ein <comando>");
  console.log("");
  console.log("comandos:");
  console.log("  install      instala/actualiza Ein (checks + deploy + secrets)");
  console.log("  update       actualiza Ein y pi a la última versión");
  console.log("  uninstall    elimina Ein (conserva secrets/auth.json; --runtime pi|claude|both)");
  console.log("  restore      restaura desde un backup (--pin/--unpin <nombre>)");
  console.log("  doctor       diagnostico del despliegue (sin lanzar pi)");
  console.log("  --version    versión del instalador");
  console.log("");
  console.log("flags: --yes --runtime pi|claude|both --dry-run --no-engram --no-secrets --no-linear --no-hypa --no-codegraph");
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
      return runInstall(rest);
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
      // No args → interactive TUI menu.
      return runMenu();
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
