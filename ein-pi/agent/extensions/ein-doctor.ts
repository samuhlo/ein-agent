import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { commandName, loadBrand, slashCommand } from "./ein-brand";
import { t, tf } from "../lib/i18n/strings";
import { pick } from "../lib/lang";
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
Para trabajo serio usa la chain \`ein-sdd\` (scope → map → design → tasks → apply → verify → close).
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
  const guardrailsFile = join(AGENT_DIR, "lib", "guardrails.ts");
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

  const guardrailsRaw = readIfExists(guardrailsFile);
  // Coherencia: ficheros donde viven las referencias que historicamente
  // quedaban colgando (forecast muerto, support inexistente, straggler marca).
  const preflightRaw = readIfExists(join(AGENT_DIR, "lib", "sdd-preflight.ts"));
  const einGitRaw = readIfExists(join(agentsDir, "ein-git.md"));
  const sddApplyRaw = readIfExists(join(agentsDir, "sdd-apply.md"));
  const sddVerifyRaw = readIfExists(join(agentsDir, "sdd-verify.md"));
  const orchestratorRaw = readIfExists(join(AGENT_DIR, "assets", "orchestrator.md"));
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
  const hasI18nPkg = packages.includes("npm:@juicesharp/rpiv-i18n");
  const hasContextMode = packages.includes("npm:context-mode");
  const langLibFile = join(AGENT_DIR, "lib", "lang.ts");
  const stringsLibFile = join(AGENT_DIR, "lib", "i18n", "strings.ts");

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
    "sdd-scope.md",
    "sdd-map.md",
    "sdd-design.md",
    "sdd-tasks.md",
    "sdd-apply.md",
    "sdd-verify.md",
    "sdd-close.md",
  ];
  const DELIVERY_AGENTS = ["ein-linear.md", "ein-git.md"];

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
      guardrailsRaw.includes("git\\s+reset\\s+--hard"),
      "guardrails git reset",
      "Bloqueo de git reset --hard activo.",
    ),
    check(
      guardrailsRaw.includes("DENIED_BASH_PATTERNS"),
      "guardrails bash deny",
      "Lista de comandos bash denegados activa.",
    ),
    check(
      guardrailsRaw.includes("CONFIRM_BASH_PATTERNS"),
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
    warn(
      hasContextMode,
      "context-mode",
      "Paquete context-mode declarado (sandbox de salidas + continuidad de sesion).",
    ),
  ];

  const checksI18n: CheckResult[] = [
    warn(
      hasI18nPkg,
      "i18n package",
      "Paquete @juicesharp/rpiv-i18n declarado en settings.packages.",
    ),
    check(existsSync(langLibFile), "lib/lang.ts", "Modulo de idioma presente."),
    check(
      existsSync(stringsLibFile),
      "lib/i18n/strings.ts",
      "Mapas de UI (es/en) presentes.",
    ),
  ];

  // Coherencia: detecta referencias colgantes y desajustes que un deploy stale
  // o un refactor a medias dejan atras (la clase de bug que se repitio varias
  // veces: prompts/codigo apuntando a artefactos o mecanismos inexistentes).
  const checksCoherence: CheckResult[] = [
    check(
      !preflightRaw.includes("Gentle AI"),
      "marca sin straggler",
      "La preflight no contiene el nombre antiguo 'Gentle AI'.",
    ),
    check(
      einGitRaw.includes("Review Workload Gate"),
      "review workload gate",
      "ein-git documenta el gate de carga de revision.",
    ),
    check(
      !preflightRaw.includes("task/workload forecasts conflict"),
      "preflight sin forecast muerto",
      "La preflight ya no referencia un 'workload forecast' que ninguna fase genera.",
    ),
    check(
      preflightRaw.includes("Review Workload Guard"),
      "preflight inyecta guard",
      "La preflight inyecta la regla determinista de Review Workload Guard.",
    ),
    check(
      orchestratorRaw.includes("Review Workload Guard"),
      "orchestrator coordina guard",
      "El orchestrator coordina el guard (reenvio de budget + ask).",
    ),
    check(
      !sddApplyRaw.includes("global EIN strict-TDD support guidance"),
      "sdd-apply sin support colgante",
      "sdd-apply no referencia una guia de support global inexistente.",
    ),
    check(
      !sddVerifyRaw.includes("global EIN strict-TDD verification support guidance"),
      "sdd-verify sin support colgante",
      "sdd-verify no referencia una guia de support global inexistente.",
    ),
    check(
      orchestratorRaw.includes("Plan Gate"),
      "orchestrator plan gate",
      "El orchestrator exige plan + confirmacion antes de mutaciones ambiguas/bulk.",
    ),
    check(
      orchestratorRaw.includes("Exploration hygiene"),
      "orchestrator exploration hygiene",
      "El orchestrator excluye node_modules/dist/etc. de find/grep/glob.",
    ),
    check(
      orchestratorRaw.includes("Assessment & valuation"),
      "orchestrator valuation read-only",
      "Una valoracion no dispara build/test pesados por defecto.",
    ),
    check(
      existsSync(join(AGENT_DIR, "lib", "mode.ts")),
      "work mode module",
      "lib/mode.ts presente (modo solo/team).",
    ),
    check(
      orchestratorRaw.toLowerCase().includes("work mode") &&
        orchestratorRaw.includes("solo"),
      "orchestrator mode-aware",
      "El orchestrator es consciente del modo (solo/team); Linear es condicional.",
    ),
    check(
      existsSync(join(AGENT_DIR, "lib", "sdd-router.ts")) &&
        readIfExists(join(AGENT_DIR, "extensions", "ein-ai.ts")).includes("ein_sdd_status"),
      "sdd router cableado",
      "Router determinista (lib/sdd-router.ts + tool ein_sdd_status) presente.",
    ),
    check(
      existsSync(join(AGENT_DIR, "agents", "sdd-close.md")) &&
        orchestratorRaw.includes("ein_sdd_check"),
      "sdd gatekeeper + close",
      "Gatekeeper (ein_sdd_check) y fase close cableados.",
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
    { title: "■ 018. I18N", checks: checksI18n },
    { title: "■ 019. COHERENCIA", checks: checksCoherence },
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

  lines.push("■ 020. DECISION");
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
    description: t(
      "cmd.doctor.description",
      "Diagnostico explicativo del sistema Ein",
    ),
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          tf(
            "busy.retry",
            `El agente esta ocupado. Reintenta ${slashCommand("doctor")} cuando termine.`,
            slashCommand("doctor"),
          ),
          "warning",
        );
        return;
      }
      const brand = loadBrand();
      pi.sendUserMessage(
        pick(
          `Llama a \`ein_pi_doctor\` y explica el resultado de ${brand.agentName} en modo didactico, en español.`,
          `Call \`ein_pi_doctor\` and explain ${brand.agentName}'s result in teaching mode, in English.`,
        ),
      );
    },
  });

  pi.registerCommand(commandName("doctor-output"), {
    description: t(
      "cmd.doctor-output.description",
      "Smoke checks tecnicos del sistema Ein (OK / OK_WITH_WARNINGS / FAIL)",
    ),
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          tf(
            "busy.retry",
            `El agente esta ocupado. Reintenta ${slashCommand("doctor-output")} cuando termine.`,
            slashCommand("doctor-output"),
          ),
          "warning",
        );
        return;
      }
      pi.sendUserMessage(
        pick(
          "Llama a `ein_pi_doctor_output` y muestra, en español, el resultado global (OK/OK_WITH_WARNINGS/FAIL) seguido de los FAIL y WARN mas relevantes.",
          "Call `ein_pi_doctor_output` and show, in English, the global result (OK/OK_WITH_WARNINGS/FAIL) followed by the most relevant FAIL and WARN.",
        ),
      );
    },
  });
}
