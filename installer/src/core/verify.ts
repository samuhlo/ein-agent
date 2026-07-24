// =============================================================================
// VERIFY (doctor)
// Filesystem + lookPath port of ein-doctor.ts smoke checks. Validates a
// deployed ~/.pi/agent without launching pi. Drives expected counts from
// template-manifest.json with hardcoded fallbacks for older binaries.
// =============================================================================

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Platform } from "./platform.ts";
import { lookPath } from "./exec.ts";
import { resolveCodegraph, resolveHypa } from "./deps.ts";
import {
  AGENT_DIR,
  BUN_BIN_DIR,
  CONTEXT7_KEY_PATH,
  DOWNLOADED_SKILLS_DIR,
  LINEAR_KEY_PATH,
  LOCAL_BIN_DIR,
  LOCAL_SKILLS_DIR,
} from "./paths.ts";

export type CheckLevel = "OK" | "WARN" | "FAIL";
export type CheckResult = { name: string; detail: string; level: CheckLevel };
export type CheckGroup = { title: string; checks: CheckResult[] };
export type DoctorReport = {
  groups: CheckGroup[];
  fail: number;
  warn: number;
  total: number;
  result: "OK" | "OK_WITH_WARNINGS" | "FAIL";
};

function check(pass: boolean, name: string, detail: string): CheckResult {
  return { name, detail, level: pass ? "OK" : "FAIL" };
}

function warn(pass: boolean, name: string, detail: string): CheckResult {
  return { name, detail, level: pass ? "OK" : "WARN" };
}

function countSkillFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return count;
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) count += countSkillFiles(p);
    if (entry === "SKILL.md") count += 1;
  }
  return count;
}

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function parseJson(path: string): { ok: boolean; value: Record<string, unknown> } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown> };
  } catch {
    return { ok: false, value: {} };
  }
}

// Fallback lists when no template-manifest.json is deployed (installs made by
// older binaries, or a deploy that died before extracting it).
const SDD_AGENTS = ["sdd-scope.md", "sdd-map.md", "sdd-design.md", "sdd-tasks.md", "sdd-apply.md", "sdd-verify.md", "sdd-close.md"];
const DELIVERY_AGENTS = ["ein-linear.md", "ein-git.md"];
const FALLBACK_CHAINS = ["ein-sdd.chain.md"];

export type TemplateManifest = {
  templateVersion?: string;
  agents?: string[];
  chains?: string[];
  extensions?: string[];
};

// Bundle ships template-manifest.json describing exactly what it contains;
// doctor validates against it (manifest-driven) so a release adding/renaming
// an agent doesn't require touching this file.
export function loadTemplateManifest(agentDir: string = AGENT_DIR): TemplateManifest | null {
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
function loadCoreExtensions(): string[] {
  const manifestPath = join(AGENT_DIR, "extensions-manifest.json");
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

const CORE_EXTENSIONS = loadCoreExtensions();

export function runDoctor(platform: Platform): DoctorReport {
  const brandFile = join(AGENT_DIR, "brand.json");
  const settingsFile = join(AGENT_DIR, "settings.json");
  const mcpFile = join(AGENT_DIR, "mcp.json");
  const guardrailsFile = join(AGENT_DIR, "lib", "guardrails.ts");
  const agentsDir = join(AGENT_DIR, "agents");
  const chainsDir = join(AGENT_DIR, "chains");

  const brand = parseJson(brandFile);
  const settings = parseJson(settingsFile);
  const mcp = parseJson(mcpFile);

  // Los patrones de guardrails viven en lib/guardrails.ts desde el refactor P2.
  const guardrailsRaw = readIfExists(guardrailsFile);
  // Coherencia: ficheros donde historicamente quedaban referencias colgantes.
  const preflightRaw = readIfExists(join(AGENT_DIR, "lib", "sdd-preflight.ts"));
  const einGitRaw = readIfExists(join(agentsDir, "ein-git.md"));
  const sddApplyRaw = readIfExists(join(agentsDir, "sdd-apply.md"));
  const sddVerifyRaw = readIfExists(join(agentsDir, "sdd-verify.md"));
  const orchestratorRaw = readIfExists(join(AGENT_DIR, "assets", "orchestrator.md"));
  const mcpServers = (mcp.value.mcpServers as Record<string, unknown>) ?? {};
  const engramServer = mcpServers.engram as Record<string, unknown> | undefined;
  const engramEnv = (engramServer?.environment as Record<string, unknown>) ?? {};
  const settingsPackages = (settings.value.packages as unknown[] | undefined) ?? [];

  const localSkills = countSkillFiles(LOCAL_SKILLS_DIR);
  const downloadedSkills = countSkillFiles(DOWNLOADED_SKILLS_DIR);
  const extraPath = [BUN_BIN_DIR, LOCAL_BIN_DIR];

  const checksCore: CheckResult[] = [
    check(existsSync(brandFile), "brand.json", "Archivo de marca presente."),
    check(brand.ok, "brand.json parse", "JSON de marca valido."),
    check(String(brand.value.agentName ?? "") === "Ein", "brand.agentName", "Nombre canonico: Ein."),
    check(String(brand.value.commandPrefix ?? "") === "ein", "brand.commandPrefix", "Prefijo canonico: ein."),
    check(String(brand.value.author ?? "") === "samuhlo", "brand.author", "Autor canonico: samuhlo."),
    check(existsSync(settingsFile), "settings.json", "Config Pi presente."),
    check(settings.ok, "settings.json parse", "JSON de settings valido."),
    check(
      Boolean((settings.value.enabledModels as unknown[] | undefined)?.length),
      "enabledModels",
      "Hay modelos habilitados.",
    ),
    check(settings.value.enableSkillCommands === true, "enableSkillCommands", "Comandos /skill:* activos."),
    check(
      existsSync(join(AGENT_DIR, "extensions-manifest.json")),
      "extensions-manifest.json",
      "Manifiesto de extensiones presente.",
    ),
  ];

  const checksMcp: CheckResult[] = [
    check(existsSync(mcpFile), "mcp.json", "Archivo MCP presente."),
    check(mcp.ok, "mcp.json parse", "JSON MCP valido."),
    check("engram" in mcpServers, "mcp engram", "Servidor Engram configurado."),
    check(
      String(engramEnv.ENGRAM_DATA_DIR ?? "").includes(".engram-pi"),
      "engram data dir",
      "Engram apunta a DB Pi (~/.engram-pi).",
    ),
    check(
      String(engramServer?.command ?? "").length > 0 &&
        !String(engramServer?.command ?? "").includes("{{"),
      "engram command",
      "Ruta de engram resuelta (sin tokens sin templar).",
    ),
    check("context7" in mcpServers, "mcp context7", "Servidor Context7 configurado."),
    check(
      settingsPackages.includes("npm:pi-mcp-adapter"),
      "mcp adapter",
      "pi-mcp-adapter declarado (proxy MCP, ahorro de contexto).",
    ),
  ];

  const manifest = loadTemplateManifest();
  const expectedAgents = manifest?.agents?.length ? manifest.agents : [...SDD_AGENTS, ...DELIVERY_AGENTS];
  const expectedChains = manifest?.chains?.length ? manifest.chains : FALLBACK_CHAINS;

  const checksAgents: CheckResult[] = [
    ...expectedAgents.map((a) =>
      check(
        existsSync(join(agentsDir, a)),
        `agent ${a}`,
        a.startsWith("sdd-") ? "Agente SDD presente." : "Agente de entrega presente.",
      ),
    ),
    ...expectedChains.map((c) => check(existsSync(join(chainsDir, c)), `chain ${c}`, "Chain presente.")),
  ];

  const checksExtensions: CheckResult[] = CORE_EXTENSIONS.map((e) =>
    check(existsSync(join(AGENT_DIR, "extensions", e)), `ext ${e}`, "Extension presente."),
  );

  const checksSkills: CheckResult[] = [
    check(localSkills > 0, "skills local", `Skills locales: ${localSkills}.`),
    check(downloadedSkills > 0, "skills downloaded", `Skills descargadas: ${downloadedSkills}.`),
    warn(localSkills >= 5, "skills local threshold", "Cantidad local saludable (>=5)."),
    warn(downloadedSkills >= 20, "skills downloaded threshold", "Cantidad descargada saludable (>=20)."),
  ];

  const checksGuardrails: CheckResult[] = [
    check(guardrailsRaw.includes("git\\s+reset\\s+--hard"), "guardrails git reset", "Bloqueo de git reset --hard activo."),
    check(guardrailsRaw.includes("DENIED_BASH_PATTERNS"), "guardrails bash deny", "Lista de comandos bash denegados activa."),
    check(guardrailsRaw.includes("CONFIRM_BASH_PATTERNS"), "guardrails bash confirm", "Lista de confirmacion de comandos activa."),
  ];

  // Coherencia: referencias colgantes / desajustes que deja un deploy stale
  // o un refactor a medias.
  const checksCoherence: CheckResult[] = [
    check(einGitRaw.includes("Review Workload Gate"), "review workload gate", "ein-git documenta el gate de carga de revision."),
    check(!preflightRaw.includes("task/workload forecasts conflict"), "preflight sin forecast muerto", "La preflight ya no referencia un forecast que ninguna fase genera."),
    check(preflightRaw.includes("Review Workload Guard"), "preflight inyecta guard", "La preflight inyecta la regla determinista de Review Workload Guard."),
    check(orchestratorRaw.includes("Review Workload Guard"), "orchestrator coordina guard", "El orchestrator coordina el guard (reenvio de budget + ask)."),
    check(!sddApplyRaw.includes("global EIN strict-TDD support guidance"), "sdd-apply sin support colgante", "sdd-apply no referencia una guia de support global inexistente."),
    check(!sddVerifyRaw.includes("global EIN strict-TDD verification support guidance"), "sdd-verify sin support colgante", "sdd-verify no referencia una guia de support global inexistente."),
    check(orchestratorRaw.includes("Plan Gate"), "orchestrator plan gate", "El orchestrator exige plan + confirmacion antes de mutaciones ambiguas/bulk."),
    check(orchestratorRaw.includes("Exploration hygiene"), "orchestrator exploration hygiene", "El orchestrator excluye node_modules/dist/etc. de find/grep/glob."),
    check(orchestratorRaw.includes("Assessment & valuation"), "orchestrator valuation read-only", "Una valoracion no dispara build/test pesados por defecto."),
    check(existsSync(join(AGENT_DIR, "lib", "mode.ts")), "work mode module", "lib/mode.ts presente (modo solo/team)."),
    check(orchestratorRaw.toLowerCase().includes("work mode") && orchestratorRaw.includes("solo"), "orchestrator mode-aware", "El orchestrator es consciente del modo (solo/team); Linear condicional."),
    check(existsSync(join(AGENT_DIR, "lib", "sdd-router.ts")) && readIfExists(join(AGENT_DIR, "extensions", "ein-ai.ts")).includes("ein_sdd_status"), "sdd router cableado", "Router determinista (sdd-router + tool ein_sdd_status) presente."),
    check(existsSync(join(AGENT_DIR, "agents", "sdd-close.md")) && orchestratorRaw.includes("ein_sdd_check"), "sdd gatekeeper + close", "Gatekeeper (ein_sdd_check) y fase close cableados."),
  ];

  const hasEngramBin = lookPath("engram", extraPath) !== null;
  const hasGh = lookPath("gh", extraPath) !== null;
  const hasBun = lookPath("bun", extraPath) !== null;
  const hasPi = lookPath("pi", extraPath) !== null;
  const hasHypa = resolveHypa() !== null;
  const hasLinearToken = Boolean(
    process.env.LINEAR_API_KEY || process.env.LINEAR_TOKEN || existsSync(LINEAR_KEY_PATH),
  );
  const hasContext7 = existsSync(CONTEXT7_KEY_PATH) || Boolean(process.env.CONTEXT7_API_KEY);

  const checksRuntime: CheckResult[] = [
    check(hasBun, "bun", "Runtime bun disponible en PATH."),
    check(hasPi, "pi", "Binario pi disponible (bun install -g @earendil-works/pi-coding-agent)."),
    warn(hasEngramBin, "engram cli", "CLI engram disponible (memoria)."),
    warn(hasGh, "gh cli", "GitHub CLI disponible (entrega)."),
    warn(hasHypa, "hypa cli", "Compresión de salida disponible; /ein:hypa la activa."),
    warn(
      resolveCodegraph() !== null,
      "codegraph cli",
      "Grafo de código disponible; `codegraph init` por proyecto lo activa.",
    ),
  ];

  const checksIntegrations: CheckResult[] = [
    warn(hasLinearToken, "linear token", "Token Linear detectable en entorno o archivo."),
    warn(hasContext7, "context7 key", "Key Context7 detectable."),
    check(
      settingsPackages.includes("npm:@juicesharp/rpiv-ask-user-question"),
      "ask-user-question",
      "Paquete ask-user-question declarado en settings.",
    ),
  ];

  void platform;

  const groups: CheckGroup[] = [
    { title: "CORE", checks: checksCore },
    { title: "MCP", checks: checksMcp },
    { title: "AGENTES + CHAIN", checks: checksAgents },
    { title: "EXTENSIONES", checks: checksExtensions },
    { title: "SKILLS", checks: checksSkills },
    { title: "GUARDRAILS", checks: checksGuardrails },
    { title: "COHERENCIA", checks: checksCoherence },
    { title: "RUNTIME", checks: checksRuntime },
    { title: "INTEGRACIONES", checks: checksIntegrations },
  ];

  const flat = groups.flatMap((g) => g.checks);
  const fail = flat.filter((c) => c.level === "FAIL").length;
  const warnCount = flat.filter((c) => c.level === "WARN").length;
  const result = fail ? "FAIL" : warnCount ? "OK_WITH_WARNINGS" : "OK";

  return { groups, fail, warn: warnCount, total: flat.length, result };
}
