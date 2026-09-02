import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { installDeclaredPackages } from "../installer/src/core/deps.ts";
import { resolvePiInstallContext } from "../installer/src/core/paths.ts";
import {
  isPublishedPackageVersion,
  PI_HOST_SPEC,
  readInstalledPiPackageVersion,
  REQUIRED_PI_PACKAGES,
  REQUIRED_PI_PACKAGE_SPECS,
} from "../shared/contracts/runtime-compat.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PI_BINARY = join(ROOT, "node_modules", ".bin", "pi");

if (!existsSync(PI_BINARY)) throw new Error(`Pi latest no está instalado: ${PI_BINARY}`);

const hostProbe = Bun.spawnSync([PI_BINARY, "--version"], { stdout: "pipe", stderr: "pipe" });
const hostVersion = new TextDecoder().decode(hostProbe.stdout).trim();
if (hostProbe.exitCode !== 0 || !isPublishedPackageVersion(hostVersion)) {
  throw new Error(`El host ${PI_HOST_SPEC} no devuelve una versión publicada válida`);
}

const home = mkdtempSync(join(tmpdir(), "ein-pi-latest-"));
try {
  const context = resolvePiInstallContext(home);
  mkdirSync(context.agentDir, { recursive: true });
  writeFileSync(join(context.agentDir, "settings.json"), `${JSON.stringify({
    npmCommand: ["bun"],
    packages: REQUIRED_PI_PACKAGE_SPECS,
  }, null, 2)}\n`);

  const result = await installDeclaredPackages(context, {
    lookPath: (command) => command === "pi" ? PI_BINARY : null,
  });
  if (!result.ok) throw new Error(result.detail);

  const installed = REQUIRED_PI_PACKAGES.map(({ name }) => ({
    name,
    version: readInstalledPiPackageVersion(context.agentDir, name),
  }));
  const invalid = installed.filter(({ version }) => !isPublishedPackageVersion(version));
  if (invalid.length > 0) {
    throw new Error(`Extensiones latest sin versión válida: ${invalid.map(({ name }) => name).join(", ")}`);
  }

  // Installation alone does not prove compatibility with the current host.
  // Starting Pi's help path loads every declared extension without requiring
  // credentials or a model request; the flags prove the isolated package set,
  // rather than extensions from the developer's normal Pi home, was activated.
  const loadProbe = Bun.spawnSync([PI_BINARY, "--offline", "--help"], {
    cwd: home,
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: context.agentDir,
      EIN_PI_AGENT_HOME: context.agentDir,
      PI_OFFLINE: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const help = [loadProbe.stdout, loadProbe.stderr]
    .map((output) => new TextDecoder().decode(output))
    .join("\n");
  const missingFlags = ["--mcp-config", "--locale"].filter((flag) => !help.includes(flag));
  if (loadProbe.exitCode !== 0 || missingFlags.length > 0) {
    const detail = new TextDecoder().decode(loadProbe.stderr).trim().split("\n").at(-1);
    throw new Error(
      `Pi latest no pudo cargar las extensiones latest${missingFlags.length > 0 ? ` (faltan ${missingFlags.join(", ")})` : ""}${detail ? `: ${detail}` : ""}`,
    );
  }

  console.log(`Pi latest ${hostVersion}; extensiones latest instaladas y cargadas: ${installed.map(({ name, version }) => `${name}@${version}`).join(", ")}`);
} finally {
  rmSync(home, { recursive: true, force: true });
}
