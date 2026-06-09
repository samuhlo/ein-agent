// =============================================================================
// VERIFY (doctor)
// Pure filesystem + lookPath port of ein-doctor.ts's smoke checks. Validates a
// deployed ~/.pi/agent without launching pi. Mirrors the in-pi doctor's
// canonical expectations: 8 extensions, 7 agents, 1 chain, brand triplet,
// ENGRAM_DATA_DIR containing .engram-pi.
// =============================================================================

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Platform } from "./platform.ts";
import { lookPath } from "./exec.ts";
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

const SDD_AGENTS = ["sdd-init.md", "sdd-explore.md", "sdd-design.md", "sdd-apply.md", "sdd-verify.md"];
const DELIVERY_AGENTS = ["ein-linear.md", "ein-github.md"];
const CORE_EXTENSIONS = [
  "ein-ai.ts",
  "ein-banner.ts",
  "ein-brand.ts",
  "ein-doctor.ts",
  "ein-linear.ts",
  "ein-paths.ts",
  "ein-skill-registry.ts",
  "sdd-init.ts",
];

export function runDoctor(platform: Platform): DoctorReport {
  const brandFile = join(AGENT_DIR, "brand.json");
  const settingsFile = join(AGENT_DIR, "settings.json");
  const mcpFile = join(AGENT_DIR, "mcp.json");
  const einAiFile = join(AGENT_DIR, "extensions", "ein-ai.ts");
  const agentsDir = join(AGENT_DIR, "agents");
  const chainsDir = join(AGENT_DIR, "chains");

  const brand = parseJson(brandFile);
  const settings = parseJson(settingsFile);
  const mcp = parseJson(mcpFile);

  const einAiRaw = readIfExists(einAiFile);
  const mcpServers = (mcp.value.mcpServers as Record<string, unknown>) ?? {};
  const engramServer = mcpServers.engram as Record<string, unknown> | undefined;
  const engramEnv = (engramServer?.environment as Record<string, unknown>) ?? {};

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
  ];

  const checksAgents: CheckResult[] = [
    ...SDD_AGENTS.map((a) => check(existsSync(join(agentsDir, a)), `agent ${a}`, "Agente SDD presente.")),
    ...DELIVERY_AGENTS.map((a) => check(existsSync(join(agentsDir, a)), `agent ${a}`, "Agente de entrega presente.")),
    check(existsSync(join(chainsDir, "ein-sdd.chain.md")), "chain ein-sdd", "Chain principal presente."),
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
    check(einAiRaw.includes("git\\s+reset\\s+--hard"), "guardrails git reset", "Bloqueo de git reset --hard activo."),
    check(einAiRaw.includes("DENIED_BASH_PATTERNS"), "guardrails bash deny", "Lista de comandos bash denegados activa."),
    check(einAiRaw.includes("CONFIRM_BASH_PATTERNS"), "guardrails bash confirm", "Lista de confirmacion de comandos activa."),
  ];

  const hasEngramBin = lookPath("engram", extraPath) !== null;
  const hasGh = lookPath("gh", extraPath) !== null;
  const hasBun = lookPath("bun", extraPath) !== null;
  const hasPi = lookPath("pi", extraPath) !== null;
  const hasLinearToken = Boolean(
    process.env.LINEAR_API_KEY || process.env.LINEAR_TOKEN || existsSync(LINEAR_KEY_PATH),
  );
  const hasContext7 = existsSync(CONTEXT7_KEY_PATH) || Boolean(process.env.CONTEXT7_API_KEY);

  const checksRuntime: CheckResult[] = [
    check(hasBun, "bun", "Runtime bun disponible en PATH."),
    check(hasPi, "pi", "Binario pi disponible (bun install -g @earendil-works/pi-coding-agent)."),
    warn(hasEngramBin, "engram cli", "CLI engram disponible (memoria)."),
    warn(hasGh, "gh cli", "GitHub CLI disponible (entrega)."),
  ];

  const checksIntegrations: CheckResult[] = [
    warn(hasLinearToken, "linear token", "Token Linear detectable en entorno o archivo."),
    warn(hasContext7, "context7 key", "Key Context7 detectable."),
  ];

  void platform;

  const groups: CheckGroup[] = [
    { title: "CORE", checks: checksCore },
    { title: "MCP", checks: checksMcp },
    { title: "AGENTES + CHAIN", checks: checksAgents },
    { title: "EXTENSIONES", checks: checksExtensions },
    { title: "SKILLS", checks: checksSkills },
    { title: "GUARDRAILS", checks: checksGuardrails },
    { title: "RUNTIME", checks: checksRuntime },
    { title: "INTEGRACIONES", checks: checksIntegrations },
  ];

  const flat = groups.flatMap((g) => g.checks);
  const fail = flat.filter((c) => c.level === "FAIL").length;
  const warnCount = flat.filter((c) => c.level === "WARN").length;
  const result = fail ? "FAIL" : warnCount ? "OK_WITH_WARNINGS" : "OK";

  return { groups, fail, warn: warnCount, total: flat.length, result };
}
