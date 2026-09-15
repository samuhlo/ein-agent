import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const subagentConfigDir = join(context.agentDir, "extensions/subagent");
  mkdirSync(subagentConfigDir, { recursive: true });
  const bundledConfig = readFileSync(join(ROOT, "ein-pi/agent/extensions/subagent/config.json"), "utf8");
  if (Object.hasOwn(JSON.parse(bundledConfig), "modelExclusions")) {
    throw new Error("La configuración empaquetada conserva modelExclusions, retirada por pi-subagents");
  }
  writeFileSync(join(subagentConfigDir, "config.json"), bundledConfig);
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
  if (loadProbe.exitCode !== 0 || missingFlags.length > 0 || /Failed to load extension|Failed to load subagent config/i.test(help)) {
    const detail = new TextDecoder().decode(loadProbe.stderr).trim().split("\n").at(-1);
    throw new Error(
      `Pi latest no pudo cargar las extensiones latest${missingFlags.length > 0 ? ` (faltan ${missingFlags.join(", ")})` : ""}${detail ? `: ${detail}` : ""}`,
    );
  }

  const widgetProbe = Bun.spawnSync(["bun", join(ROOT, "tooling/verify-subagent-widget-runtime.ts"), join(context.agentDir, "npm/node_modules/pi-subagents")], {
    cwd: home,
    env: { ...process.env, PI_CODING_AGENT_DIR: context.agentDir, NODE_PATH: join(ROOT, "node_modules"), PI_OFFLINE: "1" },
    stdout: "pipe", stderr: "pipe",
  });
  if (widgetProbe.exitCode !== 0) throw new Error(new TextDecoder().decode(widgetProbe.stderr));
  console.log(new TextDecoder().decode(widgetProbe.stdout).trim());

  const animationProbe = Bun.spawnSync(["bun", join(ROOT, "tooling/verify-subagent-widget-animation.ts"), join(context.agentDir, "npm/node_modules/pi-subagents")], {
    cwd: home, env: { ...process.env, NODE_PATH: join(ROOT, "node_modules"), PI_OFFLINE: "1" }, stdout: "pipe", stderr: "pipe",
  });
  if (animationProbe.exitCode !== 0) throw new Error(new TextDecoder().decode(animationProbe.stderr));
  console.log(new TextDecoder().decode(animationProbe.stdout).trim());

  const transcriptProbe = Bun.spawnSync(["bun", join(ROOT, "tooling/verify-terminal-transcript-runtime.ts"), join(context.agentDir, "npm/node_modules/pi-subagents")], {
    cwd: home,
    env: { ...process.env, NODE_PATH: join(ROOT, "node_modules"), PI_OFFLINE: "1" },
    stdout: "pipe", stderr: "pipe",
  });
  if (transcriptProbe.exitCode !== 0) throw new Error(new TextDecoder().decode(transcriptProbe.stderr));
  console.log(new TextDecoder().decode(transcriptProbe.stdout).trim());

  const discoveryProbe = Bun.spawnSync(["bun", join(ROOT, "tooling/verify-agent-discovery-isolation.ts"), join(context.agentDir, "npm/node_modules/pi-subagents")], {
    cwd: home,
    env: { ...process.env, NODE_PATH: join(ROOT, "node_modules"), PI_OFFLINE: "1" },
    stdout: "pipe", stderr: "pipe",
  });
  if (discoveryProbe.exitCode !== 0) throw new Error(new TextDecoder().decode(discoveryProbe.stderr));
  console.log(new TextDecoder().decode(discoveryProbe.stdout).trim());

  const childToolsProbe = Bun.spawnSync(["bun", join(ROOT, "tooling/verify-child-tools-runtime.ts"), join(context.agentDir, "npm/node_modules/pi-subagents")], {
    cwd: home, env: { ...process.env, NODE_PATH: join(ROOT, "node_modules"), PI_OFFLINE: "1" }, stdout: "pipe", stderr: "pipe",
  });
  if (childToolsProbe.exitCode !== 0) throw new Error(new TextDecoder().decode(childToolsProbe.stderr));
  console.log(new TextDecoder().decode(childToolsProbe.stdout).trim());

  const nativeCardsProbe = Bun.spawnSync(["bun", join(ROOT, "tooling/verify-native-cards-runtime.ts")], {
    cwd: home, env: { ...process.env, NODE_PATH: join(ROOT, "node_modules"), PI_OFFLINE: "1" },
    stdout: "pipe", stderr: "pipe",
  });
  if (nativeCardsProbe.exitCode !== 0) throw new Error(new TextDecoder().decode(nativeCardsProbe.stderr));
  console.log(new TextDecoder().decode(nativeCardsProbe.stdout).trim());

  const mcpCardsProbe = Bun.spawnSync(["bun", join(ROOT, "tooling/verify-mcp-cards-runtime.ts"), join(context.agentDir, "npm/node_modules/pi-mcp-adapter")], {
    cwd: home,
    env: { ...process.env, NODE_PATH: join(ROOT, "node_modules"), PI_OFFLINE: "1" },
    stdout: "pipe", stderr: "pipe",
  });
  if (mcpCardsProbe.exitCode !== 0) throw new Error(new TextDecoder().decode(mcpCardsProbe.stderr));
  console.log(new TextDecoder().decode(mcpCardsProbe.stdout).trim());

  console.log(`Pi latest ${hostVersion}; extensiones latest instaladas y cargadas: ${installed.map(({ name, version }) => `${name}@${version}`).join(", ")}`);
} finally {
  rmSync(home, { recursive: true, force: true });
}
