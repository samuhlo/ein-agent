// =============================================================================
// VERIFY (doctor)
// Filesystem + lookPath port of ein-doctor.ts smoke checks. Validates a
// deployed ~/.pi/agent without launching pi. Drives expected counts from
// template-manifest.json with hardcoded fallbacks for older binaries.
// =============================================================================

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Platform } from "./platform.ts";
import { lookPath } from "./exec.ts";
import { inspectNodeRuntime, inspectPiRuntime, resolveCodegraph, resolveHypa } from "./deps.ts";
import {
  doctorCheck as check,
  doctorWarn as warn,
  inspectCommonDoctor,
  summarizeDoctorChecks,
  type DoctorCheckGroup as SharedCheckGroup,
  type DoctorCheckLevel as SharedCheckLevel,
  type DoctorCheckResult as SharedCheckResult,
  type DoctorResult,
} from "../../../shared/ports/doctor.ts";
import { PI_HOST_VERSION, PI_NODE_MIN_VERSION } from "../../../shared/contracts/runtime-compat.ts";
import {
  defaultPiInstallContext,
  type PiInstallContext,
} from "./paths.ts";

export type CheckLevel = SharedCheckLevel;
export type CheckResult = SharedCheckResult;
export type CheckGroup = SharedCheckGroup;
export type DoctorReport = {
  groups: CheckGroup[];
  fail: number;
  warn: number;
  total: number;
  result: DoctorResult;
};

// Fallback lists when no template-manifest.json is deployed (installs made by
// older binaries, or a deploy that died before extracting it).
const SDD_AGENTS = ["sdd-scope.md", "sdd-map.md", "sdd-design.md", "sdd-tasks.md", "sdd-apply.md", "sdd-verify.md", "sdd-close.md"];
const NON_SDD_AGENTS = ["ein-linear.md", "ein-git.md", "ein-scout.md", "ein-cleaner.md", "ein-architect.md"];
const FALLBACK_CHAINS = ["ein-sdd.chain.md"];

export type TemplateManifest = {
  templateVersion?: string;
  agents?: string[];
  chains?: string[];
  extensions?: string[];
  terminalApp?: { path: string; target: string; mode: string; sha256: string };
};

// Bundle ships template-manifest.json describing exactly what it contains;
// doctor validates against it (manifest-driven) so a release adding/renaming
// an agent doesn't require touching this file.
const DEFAULT_AGENT_DIR = defaultPiInstallContext().agentDir;

export function loadTemplateManifest(agentDir: string = DEFAULT_AGENT_DIR): TemplateManifest | null {
  const path = join(agentDir, "template-manifest.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as TemplateManifest;
  } catch {
    return null;
  }
}

// Source of truth: extensions-manifest.json. Hardcoded fallback covers older
// binaries and mid-deployment failures.
function loadCoreExtensions(agentDir = DEFAULT_AGENT_DIR): string[] {
  const manifestPath = join(agentDir, "extensions-manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as { core?: unknown };
      if (Array.isArray(parsed.core)) return parsed.core as string[];
    } catch {
      // fall through to hardcoded list
    }
  }
  return [
    "ein-ai.ts",
    "ein-banner.ts",
    "ein-brand.ts",
    "ein-doctor.ts",
    "ein-linear.ts",
    "ein-paths.ts",
    "ein-skill-maintenance.ts",
    "ein-skill-registry.ts",
    "sdd-init.ts",
  ];
}

export function runDoctor(
  platform: Platform,
  context: PiInstallContext = defaultPiInstallContext(),
): DoctorReport {
  const { agentDir } = context;
  const agentsDir = join(agentDir, "agents");
  const chainsDir = join(agentDir, "chains");
  const common = inspectCommonDoctor({
    agentDir,
    linearCwd: context.home,
    localSkillsDir: context.localSkillsDir,
    downloadedSkillsDir: context.downloadedSkillsDir,
  });
  const extraPath = [context.bunBinDir, context.localBinDir];

  const checksCore: CheckResult[] = [
    ...common.checks.core,
    check(
      existsSync(join(agentDir, "extensions-manifest.json")),
      "extensions-manifest.json",
      "Manifiesto de extensiones presente.",
    ),
  ];

  const checksMcp: CheckResult[] = [
    ...common.checks.mcp,
    check(
      Boolean(common.evidence.engramCommand) &&
        !common.evidence.engramCommand?.includes("{{"),
      "engram command",
      "Ruta de engram resuelta (sin tokens sin templar).",
    ),
  ];

  const manifest = loadTemplateManifest(agentDir);
  const expectedAgents = manifest?.agents?.length ? manifest.agents : [...SDD_AGENTS, ...NON_SDD_AGENTS];
  const expectedChains = manifest?.chains?.length ? manifest.chains : FALLBACK_CHAINS;

  const checksAgents: CheckResult[] = [
    ...expectedAgents.map((a) =>
      check(
        existsSync(join(agentsDir, a)),
        `agent ${a}`,
        a.startsWith("sdd-")
          ? "Agente SDD presente."
          : a === "ein-scout.md"
            ? "Agente de investigación read-only presente."
            : "Agente no-SDD presente.",
      ),
    ),
    ...expectedChains.map((c) => check(existsSync(join(chainsDir, c)), `chain ${c}`, "Chain presente.")),
  ];

  const checksExtensions: CheckResult[] = loadCoreExtensions(agentDir).map((e) =>
    check(existsSync(join(agentDir, "extensions", e)), `ext ${e}`, "Extension presente."),
  );

  const checksCoherence: CheckResult[] = [
    check(existsSync(join(agentDir, "bin", "ein")) && (statSync(join(agentDir, "bin", "ein")).mode & 0o111) !== 0, "terminal app", "bin/ein precompilado y ejecutable."),
    ...common.checks.coherence,
  ];

  const hasEngramBin = lookPath("engram", extraPath) !== null;
  const hasGh = lookPath("gh", extraPath) !== null;
  const hasBun = lookPath("bun", extraPath) !== null;
  const nodeRuntime = inspectNodeRuntime(extraPath);
  const piRuntime = inspectPiRuntime(extraPath);
  const optionalPath = [...extraPath, context.miseShimDir];
  const hasHypa = resolveHypa(optionalPath) !== null;
  const hasLinearToken = Boolean(
    process.env.LINEAR_API_KEY || process.env.LINEAR_TOKEN ||
      existsSync(join(context.secretsDir, "linear-api-key")),
  );
  const hasContext7 =
    existsSync(join(context.secretsDir, "context7-api-key")) || Boolean(process.env.CONTEXT7_API_KEY);

  const checksRuntime: CheckResult[] = [
    check(hasBun, "bun", "Runtime bun disponible en PATH."),
    check(
      nodeRuntime.compatible,
      "node",
      nodeRuntime.version
        ? `Node ${nodeRuntime.version} detectado; Pi requiere ${PI_NODE_MIN_VERSION} o posterior.`
        : `Node no resoluble; Pi requiere ${PI_NODE_MIN_VERSION} o posterior.`,
    ),
    check(
      piRuntime.compatible,
      "pi",
      piRuntime.version
        ? `Pi ${piRuntime.version} detectado; Ein requiere ${PI_HOST_VERSION}.`
        : `Pi no resoluble; Ein requiere ${PI_HOST_VERSION}.`,
    ),
    warn(hasEngramBin, "engram cli", "CLI engram disponible (memoria)."),
    warn(hasGh, "gh cli", "GitHub CLI disponible (entrega)."),
    warn(hasHypa, "hypa cli", "Compresión de salida disponible; /ein:hypa la activa."),
    warn(
      resolveCodegraph(optionalPath) !== null,
      "codegraph cli",
      "Grafo de código disponible; `codegraph init` por proyecto lo activa.",
    ),
  ];

  const checksIntegrations: CheckResult[] = [
    warn(hasLinearToken, "linear token", "Token Linear detectable en entorno o archivo."),
    warn(hasContext7, "context7 key", "Key Context7 detectable."),
  ];

  void platform;

  const groups: CheckGroup[] = [
    { title: "CORE", checks: checksCore },
    { title: "PAQUETES PI", checks: common.checks.piPackages },
    { title: "MCP", checks: checksMcp },
    { title: "AGENTES + CHAIN", checks: checksAgents },
    { title: "EXTENSIONES", checks: checksExtensions },
    { title: "SKILLS", checks: common.checks.skills },
    { title: "GUARDRAILS", checks: common.checks.guardrails },
    { title: "COHERENCIA", checks: checksCoherence },
    { title: "RUNTIME", checks: checksRuntime },
    { title: "INTEGRACIONES", checks: checksIntegrations },
  ];

  return { groups, ...summarizeDoctorChecks(groups) };
}
