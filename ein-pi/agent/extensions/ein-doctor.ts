import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { commandName, loadBrand, slashCommand } from "./ein-brand";
import {
  AGENT_DIR,
  CONTEXT7_KEY_PATH,
  CORE_EXTENSIONS,
  ENGRAM_DIR,
  LINEAR_KEY_PATH,
  LOCAL_SKILLS_DIR,
  DOWNLOADED_SKILLS_DIR,
} from "./ein-paths";

const execFileAsync = promisify(execFile);

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
    let stat;
    try {
      stat = statSync(p);
    } catch {
      continue;
    }
    if (stat.isDirectory()) count += countSkillFiles(p);
    if (entry === "SKILL.md") count += 1;
  }
  return count;
}

async function cliExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync("/bin/zsh", ["-lc", `command -v ${cmd}`], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function readIfExists(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

// =============================================================================
// DOCTOR — diagnostico explicativo (async, incluye checks de CLI)
// =============================================================================

async function doctorReport(): Promise<string> {
  const brand = loadBrand();
  const agentsDir = join(AGENT_DIR, "agents");
  const chainsDir = join(AGENT_DIR, "chains");
  const extensionsDir = join(AGENT_DIR, "extensions");

  const agents = existsSync(agentsDir)
    ? readdirSync(agentsDir).filter((f) => f.endsWith(".md")).sort()
    : [];
  const chains = existsSync(chainsDir)
    ? readdirSync(chainsDir).filter((f) => f.endsWith(".chain.md")).sort()
    : [];
  const extensions = existsSync(extensionsDir)
    ? readdirSync(extensionsDir).filter((f) => f.endsWith(".ts")).sort()
    : [];

  const localSkills = countSkillFiles(LOCAL_SKILLS_DIR);
  const downloadedSkills = countSkillFiles(DOWNLOADED_SKILLS_DIR);

  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(readFileSync(join(AGENT_DIR, "settings.json"), "utf8")) as Record<string, unknown>;
  } catch { /* ignore */ }

  const hasEngram = await cliExists("engram");
  const hasGh = await cliExists("gh");
  const hasLinearToken = Boolean(
    process.env.LINEAR_API_KEY || process.env.LINEAR_TOKEN || existsSync(LINEAR_KEY_PATH),
  );
  const packages = (settings.packages as unknown[] | undefined) ?? [];
  const hasAskUserQuestion = packages.includes("npm:@juicesharp/rpiv-ask-user-question");
  const hasContext7Key =
    existsSync(CONTEXT7_KEY_PATH) || Boolean(process.env.CONTEXT7_API_KEY);
  const hasMcp = existsSync(join(AGENT_DIR, "mcp.json"));
  const hasBackupAuto = existsSync(join(AGENT_DIR, "backups", "auto"));

  return `/// 000. DIAGNOSTICO EIN

**Agente:** \`${brand.agentName}\`  |  **Autor:** \`${brand.author}\`  |  **Prefijo:** \`${brand.commandPrefix}\`

■ 001. AGENTES (${agents.length})

${agents.map((a) => `- \`${a}\``).join("\n") || "- no instalados"}

■ 002. CHAINS (${chains.length})

${chains.map((c) => `- \`${c}\``).join("\n") || "- no instaladas"}

■ 003. EXTENSIONES (${extensions.length})

${extensions.map((e) => `- \`${e}\``).join("\n") || "- ninguna"}

■ 004. SKILLS

- **locales:** ${localSkills}
- **descargadas:** ${downloadedSkills}

■ 005. INTEGRACIONES

- **Engram CLI:** ${hasEngram ? `OK → \`engram\` disponible (DB: \`${ENGRAM_DIR}\`)` : "FALTA → instala \`engram\` via brew"}
- **MCP config:** ${hasMcp ? "OK → \`mcp.json\` presente" : "FALTA → crea \`mcp.json\`"}
- **GitHub CLI:** ${hasGh ? "OK → \`gh\` disponible" : "FALTA → instala \`gh\` via brew"}
- **Linear API:** ${hasLinearToken ? "OK → token detectable en entorno o archivo" : "PENDIENTE → define \`LINEAR_API_KEY\` o \`LINEAR_TOKEN\`"}
- **Context7:** ${hasContext7Key ? "OK → key detectable" : `PENDIENTE → falta key en \`${CONTEXT7_KEY_PATH}\` o \`CONTEXT7_API_KEY\``}
- **Auto backup:** ${hasBackupAuto ? "OK → directorio de backup automatico presente" : "PENDIENTE → aun no se ha creado el primer backup automatico"}

■ 006. LECTURA DIDACTICA

Ein es un workbench estructurado sobre Pi Coding Agent. El flujo principal es lenguaje natural.
Para trabajo serio usa la chain \`ein-sdd\` (init → explore → design → apply → verify).
Los comandos \`/ein:*\` son control manual y fallback, no la ruta principal.
La memoria persiste en Engram (\`${ENGRAM_DIR}\`), separada del resto de agentes.`;
}

// =============================================================================
// DOCTOR OUTPUT — smoke checks estaticos (sync, solo filesystem)
// =============================================================================

type CheckLevel = "OK" | "WARN" | "FAIL";
type CheckResult = { name: string; detail: string; level: CheckLevel };

function check(pass: boolean, name: string, detail: string): CheckResult {
  return { name, detail, level: pass ? "OK" : "FAIL" };
}

function warn(pass: boolean, name: string, detail: string): CheckResult {
  return { name, detail, level: pass ? "OK" : "WARN" };
}

function doctorSmokeReport(): string {
  const brandFile = join(AGENT_DIR, "brand.json");
  const settingsFile = join(AGENT_DIR, "settings.json");
  const mcpFile = join(AGENT_DIR, "mcp.json");
  const einAiFile = join(AGENT_DIR, "extensions", "ein-ai.ts");
  const agentsDir = join(AGENT_DIR, "agents");
  const chainsDir = join(AGENT_DIR, "chains");

  let brand: Record<string, unknown> = {};
  let brandParseOk = false;
  let settings: Record<string, unknown> = {};
  let settingsParseOk = false;
  let mcpCfg: Record<string, unknown> = {};
  let mcpParseOk = false;

  try {
    brand = JSON.parse(readFileSync(brandFile, "utf8")) as Record<string, unknown>;
    brandParseOk = true;
  } catch {
    brandParseOk = false;
  }

  try {
    settings = JSON.parse(readFileSync(settingsFile, "utf8")) as Record<string, unknown>;
    settingsParseOk = true;
  } catch {
    settingsParseOk = false;
  }

  try {
    mcpCfg = JSON.parse(readFileSync(mcpFile, "utf8")) as Record<string, unknown>;
    mcpParseOk = true;
  } catch {
    mcpParseOk = false;
  }

  const einAiRaw = readIfExists(einAiFile);
  const mcpServers = (mcpCfg.mcpServers as Record<string, unknown>) ?? {};
  const engramServer = mcpServers.engram as Record<string, unknown> | undefined;
  const engramEnv = (engramServer?.environment as Record<string, unknown>) ?? {};

  const localSkillsCount = countSkillFiles(LOCAL_SKILLS_DIR);
  const downloadedSkillsCount = countSkillFiles(DOWNLOADED_SKILLS_DIR);
  const hasLinearToken = Boolean(
    process.env.LINEAR_API_KEY || process.env.LINEAR_TOKEN || existsSync(LINEAR_KEY_PATH),
  );
  const packages = (settings.packages as unknown[] | undefined) ?? [];
  const hasAskUserQuestion = packages.includes("npm:@juicesharp/rpiv-ask-user-question");

  const checksCore: CheckResult[] = [
    check(existsSync(brandFile), "brand.json", "Archivo de marca presente."),
    check(brandParseOk, "brand.json parse", "JSON de marca valido."),
    check(String(brand.agentName ?? "") === "Ein", "brand.agentName", "Nombre canonico: Ein."),
    check(String(brand.commandPrefix ?? "") === "ein", "brand.commandPrefix", "Prefijo canonico: ein."),
    check(String(brand.author ?? "") === "samuhlo", "brand.author", "Autor canonico: samuhlo."),
    check(existsSync(settingsFile), "settings.json", "Config Pi presente."),
    check(settingsParseOk, "settings.json parse", "JSON de settings valido."),
    check(
      Boolean((settings.enabledModels as unknown[] | undefined)?.length),
      "enabledModels",
      "Hay modelos habilitados.",
    ),
    check(
      settings.enableSkillCommands === true,
      "enableSkillCommands",
      "Comandos /skill:* activos.",
    ),
  ];

  const checksMcp: CheckResult[] = [
    check(existsSync(mcpFile), "mcp.json", "Archivo MCP presente."),
    check(mcpParseOk, "mcp.json parse", "JSON MCP valido."),
    check("engram" in mcpServers, "mcp engram", "Servidor Engram configurado."),
    check(
      String(engramEnv.ENGRAM_DATA_DIR ?? "").includes(".engram-pi"),
      "engram data dir",
      "Engram apunta a DB Pi (~/.engram-pi).",
    ),
    check("context7" in mcpServers, "mcp context7", "Servidor Context7 configurado."),
    check(
      packages.includes("npm:pi-mcp-adapter"),
      "mcp adapter",
      "pi-mcp-adapter declarado (proxy MCP, ahorro de contexto).",
    ),
  ];

  const SDD_AGENTS = [
    "sdd-init.md",
    "sdd-explore.md",
    "sdd-design.md",
    "sdd-apply.md",
    "sdd-verify.md",
  ];
  const DELIVERY_AGENTS = ["ein-linear.md", "ein-github.md"];

  const checksAgents: CheckResult[] = [
    ...SDD_AGENTS.map((a) =>
      check(existsSync(join(agentsDir, a)), `agent ${a}`, "Agente SDD presente."),
    ),
    ...DELIVERY_AGENTS.map((a) =>
      check(existsSync(join(agentsDir, a)), `agent ${a}`, "Agente de entrega presente."),
    ),
    check(
      existsSync(join(chainsDir, "ein-sdd.chain.md")),
      "chain ein-sdd",
      "Chain principal presente.",
    ),
  ];

  const checksExtensions: CheckResult[] = CORE_EXTENSIONS.map((e) =>
    check(
      existsSync(join(AGENT_DIR, "extensions", e)),
      `ext ${e}`,
      "Extension presente.",
    ),
  );

  const checksSkills: CheckResult[] = [
    check(localSkillsCount > 0, "skills local", `Skills locales: ${localSkillsCount}.`),
    check(
      downloadedSkillsCount > 0,
      "skills downloaded",
      `Skills descargadas: ${downloadedSkillsCount}.`,
    ),
    warn(localSkillsCount >= 5, "skills local threshold", "Cantidad local saludable (>=5)."),
    warn(
      downloadedSkillsCount >= 20,
      "skills downloaded threshold",
      "Cantidad descargada saludable (>=20).",
    ),
  ];

  const checksGuardrails: CheckResult[] = [
    check(
      einAiRaw.includes("git\\s+reset\\s+--hard"),
      "guardrails git reset",
      "Bloqueo de git reset --hard activo.",
    ),
    check(
      einAiRaw.includes("DENIED_BASH_PATTERNS"),
      "guardrails bash deny",
      "Lista de comandos bash denegados activa.",
    ),
    check(
      einAiRaw.includes("CONFIRM_BASH_PATTERNS"),
      "guardrails bash confirm",
      "Lista de confirmacion de comandos activa.",
    ),
  ];

  const checksIntegrations: CheckResult[] = [
    warn(hasLinearToken, "linear token", "Token Linear detectable en entorno o archivo."),
    warn(
      existsSync(CONTEXT7_KEY_PATH) || Boolean(process.env.CONTEXT7_API_KEY),
      "context7 key",
      "Key Context7 detectable.",
    ),
    warn(
      existsSync(join(AGENT_DIR, "backups", "auto")),
      "backup auto",
      "Directorio de backup automatico presente.",
    ),
    check(
      hasAskUserQuestion,
      "ask-user-question",
      "Paquete ask-user-question declarado en settings.",
    ),
  ];

  const groups: Array<{ title: string; checks: CheckResult[] }> = [
    { title: "■ 011. CORE", checks: checksCore },
    { title: "■ 012. MCP", checks: checksMcp },
    { title: "■ 013. AGENTES + CHAIN", checks: checksAgents },
    { title: "■ 014. EXTENSIONES", checks: checksExtensions },
    { title: "■ 015. SKILLS", checks: checksSkills },
    { title: "■ 016. GUARDRAILS", checks: checksGuardrails },
    { title: "■ 017. INTEGRACIONES", checks: checksIntegrations },
  ];

  const flat = groups.flatMap((g) => g.checks);
  const failCount = flat.filter((c) => c.level === "FAIL").length;
  const warnCount = flat.filter((c) => c.level === "WARN").length;
  const result: string = failCount ? "FAIL" : warnCount ? "OK_WITH_WARNINGS" : "OK";

  const lines = [
    "/// 010. DOCTOR OUTPUT",
    "",
    `resultado: ${result}`,
    `fail: ${failCount}  |  warn: ${warnCount}  |  total: ${flat.length}`,
    "",
  ];

  for (const group of groups) {
    lines.push(group.title);
    for (const item of group.checks) {
      lines.push(`- ${item.level} - ${item.name}: ${item.detail}`);
    }
    lines.push("");
  }

  lines.push("■ 018. DECISION");
  if (failCount) {
    lines.push("accion: revisar FAIL antes de flujos de entrega o mutacion.");
  } else if (warnCount) {
    lines.push("accion: sistema usable; resolver WARN para endurecer baseline.");
  } else {
    lines.push("accion: baseline tecnico estable.");
  }

  return lines.join("\n");
}

// =============================================================================
// EXPORT
// =============================================================================

export default function einDoctor(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ein_pi_doctor",
    label: "Ein Doctor",
    description:
      "Diagnostico de modelos, agentes, chains, skills, MCP e integraciones de Ein.",
    parameters: { type: "object", properties: {} } as const,
    async execute() {
      return {
        content: [{ type: "text", text: await doctorReport() }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "ein_pi_doctor_output",
    label: "Ein Doctor Output",
    description:
      "Smoke checks estaticos: core, MCP, agentes, extensiones, skills, guardrails e integraciones.",
    parameters: { type: "object", properties: {} } as const,
    async execute() {
      return {
        content: [{ type: "text", text: doctorSmokeReport() }],
        details: {},
      };
    },
  });

  pi.registerCommand(commandName("doctor"), {
    description:
      "Diagnostico completo del sistema Ein (agentes, MCP, skills, integraciones)",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          `El agente esta ocupado. Lanza ${slashCommand("doctor")} cuando termine.`,
          "warning",
        );
        return;
      }
      const brand = loadBrand();
      pi.sendUserMessage(
        `Llama a \`ein_pi_doctor\` y explica el resultado de ${brand.agentName} en modo didactico.`,
      );
    },
  });

  pi.registerCommand(commandName("doctor-output"), {
    description: "Smoke checks tecnicos del sistema Ein (OK / OK_WITH_WARNINGS / FAIL)",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          `El agente esta ocupado. Lanza ${slashCommand("doctor-output")} cuando termine.`,
          "warning",
        );
        return;
      }
      pi.sendUserMessage(
        "Llama a `ein_pi_doctor_output` y muestra el resultado global (OK/OK_WITH_WARNINGS/FAIL) seguido de los FAIL y WARN mas relevantes.",
      );
    },
  });
}
