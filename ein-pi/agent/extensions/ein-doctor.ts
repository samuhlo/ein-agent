import { existsSync, readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { commandName, loadBrand, slashCommand } from "./ein-brand";
import { t, tf } from "../lib/i18n/strings";
import { pick } from "../lib/lang";
import { PI_BUILTIN_TOOLS, formatDrift, verifyPiContract } from "../lib/pi-contract.ts";
import {
  countDoctorSkillFiles,
  doctorCheck as check,
  doctorWarn as warn,
  inspectCommonDoctor,
  readDoctorText as readIfExists,
  summarizeDoctorChecks,
  type DoctorCheckResult as CheckResult,
} from "../lib/doctor-core.ts";
import {
  AGENT_DIR,
  CONTEXT7_KEY_PATH,
  CORE_EXTENSIONS,
  LINEAR_KEY_PATH,
  LOCAL_SKILLS_DIR,
  DOWNLOADED_SKILLS_DIR,
} from "./ein-paths";

const execFileAsync = promisify(execFile);

async function cliExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync("/bin/zsh", ["-lc", `command -v ${cmd}`], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// doctor — diagnostico explicativo (async, incluye checks de CLI)
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

  const localSkills = countDoctorSkillFiles(LOCAL_SKILLS_DIR);
  const downloadedSkills = countDoctorSkillFiles(DOWNLOADED_SKILLS_DIR);

  const hasEngram = await cliExists("engram");
  const hasGh = await cliExists("gh");
  const hasLinearToken = Boolean(
    process.env.LINEAR_API_KEY || process.env.LINEAR_TOKEN || existsSync(LINEAR_KEY_PATH),
  );
  const hasContext7Key =
    existsSync(CONTEXT7_KEY_PATH) || Boolean(process.env.CONTEXT7_API_KEY);
  const hasMcp = existsSync(join(AGENT_DIR, "mcp.json"));
  const hasBackupAuto = existsSync(join(AGENT_DIR, "backups", "auto"));

  return `// 000. diagnostico ein

**Agente:** \`${brand.agentName}\`  |  **Autor:** \`${brand.author}\`  |  **Prefijo:** \`${brand.commandPrefix}\`

// 001. AGENTES (${agents.length})

${agents.map((a) => `- \`${a}\``).join("\n") || "- no instalados"}

// 002. CHAINS (${chains.length})

${chains.map((c) => `- \`${c}\``).join("\n") || "- no instaladas"}

// 003. EXTENSIONES (${extensions.length})

${extensions.map((e) => `- \`${e}\``).join("\n") || "- ninguna"}

// 004. SKILLS

- **locales:** ${localSkills}
- **descargadas:** ${downloadedSkills}

// 005. INTEGRACIONES

- **Engram CLI:** ${hasEngram ? "OK → `engram` disponible (estar configurado no prueba que se recupere ni se guarde)" : "FALTA → `engram` no disponible (configurado no prueba recuperación ni persistencia)"}
- **MCP config:** ${hasMcp ? "OK → \`mcp.json\` presente" : "FALTA → crea \`mcp.json\`"}
- **GitHub CLI:** ${hasGh ? "OK → \`gh\` disponible" : "FALTA → instala \`gh\` via brew"}
- **Linear API:** ${hasLinearToken ? "OK → token detectable en entorno o archivo" : "PENDIENTE → define \`LINEAR_API_KEY\` o \`LINEAR_TOKEN\`"}
- **Context7:** ${hasContext7Key ? "OK → key detectable" : `PENDIENTE → falta key en \`${CONTEXT7_KEY_PATH}\` o \`CONTEXT7_API_KEY\``}
- **Auto backup:** ${hasBackupAuto ? "OK → directorio de backup automatico presente" : "PENDIENTE → aun no se ha creado el primer backup automatico"}

// 006. LECTURA DIDACTICA

Ein es un workbench estructurado sobre Pi Coding Agent. El flujo principal es lenguaje natural.
Para trabajo serio usa la chain \`ein-sdd\` (scope → map → design → tasks → apply → verify → close).
Los comandos \`/ein:*\` son control manual y fallback, no la ruta principal.
Engram es un cuaderno opcional por proyecto; estar configurado no prueba recuperación ni persistencia.`;
}

// =============================================================================
// doctor output — smoke checks estaticos (sync, solo filesystem)
// =============================================================================

// Builtins de Pi: fuente única en lib/pi-contract.ts. Estaba replicado aquí y
// en el test de allowlists, que es justo la duplicación que abre agujeros.
const BUILTIN_TOOLS = new Set(PI_BUILTIN_TOOLS);

// Tools declaradas por los agentes DESPLEGADOS que Pi no puede resolver.
// Ignora rutas de proveedor (van a --extension) y nombres registrados por las
// extensiones de Ein, que el hijo hereda.
function unknownDeployedAgentTools(agentsDir: string, agentDir: string = AGENT_DIR): string[] {
  if (!existsSync(agentsDir)) return [];
  const extensionTools = new Set<string>();
  const extDir = join(agentDir, "extensions");
  if (existsSync(extDir)) {
    for (const file of readdirSync(extDir).filter((f) => f.endsWith(".ts"))) {
      const src = readIfExists(join(extDir, file));
      for (const m of src.matchAll(/registerTool\(\s*\{[\s\S]{0,200}?name:\s*"([a-z0-9_]+)"/g)) {
        if (m[1]) extensionTools.add(m[1]);
      }
    }
  }
  const unknown: string[] = [];
  for (const file of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
    const tools = readIfExists(join(agentsDir, file)).match(/^tools:\s*(.+)$/m)?.[1];
    if (!tools) continue;
    for (const tool of tools.split(",").map((t) => t.trim()).filter(Boolean)) {
      if (tool.includes("/") || tool.endsWith(".ts") || tool.endsWith(".js")) continue;
      if (BUILTIN_TOOLS.has(tool) || extensionTools.has(tool)) continue;
      unknown.push(`${file}:${tool}`);
    }
  }
  return unknown;
}

export function scoutStaticContract(
  agentsDir: string,
  launcherSource: string,
): { tools: boolean; extensions: boolean; compatibility: boolean } {
  const scout = readIfExists(join(agentsDir, "ein-scout.md"));
  return {
    tools: /^tools:\s*read, grep, find$/m.test(scout),
    extensions: /^extensions:\s*$/m.test(scout),
    // Static compatibility only: this is not evidence about an individual run.
    compatibility:
      launcherSource.includes("input.extensions !== undefined") &&
      launcherSource.includes('args.push("--no-extensions")'),
  };
}

export function doctorSmokeReport(
  agentDir: string = AGENT_DIR,
  cwd: string = process.cwd(),
): string {
  const agentsDir = join(agentDir, "agents");
  const chainsDir = join(agentDir, "chains");
  const common = inspectCommonDoctor({
    agentDir,
    linearCwd: cwd,
    localSkillsDir: join(agentDir, "skills", "local"),
    downloadedSkillsDir: join(agentDir, "skills", "downloaded"),
  });
  const hasLinearToken = Boolean(
    process.env.LINEAR_API_KEY || process.env.LINEAR_TOKEN || existsSync(LINEAR_KEY_PATH),
  );
  const langLibFile = join(agentDir, "lib", "lang.ts");
  const stringsLibFile = join(agentDir, "lib", "i18n", "strings.ts");

  const SDD_AGENTS = [
    "sdd-scope.md",
    "sdd-map.md",
    "sdd-design.md",
    "sdd-tasks.md",
    "sdd-apply.md",
    "sdd-verify.md",
    "sdd-close.md",
  ];
  const NON_SDD_AGENTS = ["ein-linear.md", "ein-git.md", "ein-scout.md"];
  const scoutContract = scoutStaticContract(
    agentsDir,
    readIfExists(
      join(agentDir, "npm", "node_modules", "pi-subagents", "src", "runs", "shared", "pi-args.ts"),
    ),
  );
  const unknownDeployedTools = unknownDeployedAgentTools(agentsDir, agentDir);
  const piContract = verifyPiContract();

  const checksAgents: CheckResult[] = [
    ...SDD_AGENTS.map((a) =>
      check(existsSync(join(agentsDir, a)), `agent ${a}`, "Agente SDD presente."),
    ),
    ...NON_SDD_AGENTS.map((a) =>
      check(
        existsSync(join(agentsDir, a)),
        `agent ${a}`,
        a === "ein-scout.md" ? "Agente de investigación read-only presente." : "Agente no-SDD presente.",
      ),
    ),
    check(scoutContract.tools, "ein-scout tools", "Scout declara exactamente read, grep, find."),
    check(scoutContract.extensions, "ein-scout extensions", "Scout declara campo `extensions:` definido y vacío."),
    warn(
      scoutContract.compatibility,
      "ein-scout static extension contract",
      "Compatibilidad estática actual con --no-extensions; no es una sonda ni recibo por ejecución.",
    ),
    check(
      existsSync(join(chainsDir, "ein-sdd.chain.md")),
      "chain ein-sdd",
      "Chain principal presente.",
    ),
    // `tools:` es una allowlist ESTRICTA: un nombre que Pi no registra hace que
    // el run salga ✗ AUNQUE el artefacto se escriba, y envenena el prompt del
    // hijo ("report this configuration error"). El test de repo lo blinda en
    // CI; esto audita lo DESPLEGADO, que es lo que corre — y que puede derivar
    // si alguien edita ~/.pi a mano.
    check(
      unknownDeployedTools.length === 0,
      "agent tools allowlist",
      unknownDeployedTools.length === 0
        ? "Toda tool declarada existe en Pi."
        : `Tools inexistentes: ${unknownDeployedTools.join(", ")}. Reinstala el template (ein update).`,
    ),
    // Contrato con Pi. Ein codifica supuestos sobre Pi (tools, hooks, métodos de
    // ExtensionAPI) y Pi se mueve rápido: sin esto, un `pi update` que renombre
    // algo se manifiesta como un run fallando de forma incomprensible. Aquí sale
    // por su nombre y antes. `unavailable` es WARN, no FAIL: sin Pi resoluble no
    // hay nada que afirmar, y fingir un veredicto sería peor que no darlo.
    piContract.status === "unavailable"
      ? warn(false, "contrato con Pi", `No verificable: ${piContract.reason}.`)
      : check(
          piContract.status === "ok",
          "contrato con Pi",
          piContract.status === "ok"
            ? `Pi ${piContract.surface.version ?? "?"}: tools, hooks y ExtensionAPI que Ein usa siguen existiendo.`
            : `Pi ${piContract.surface.version ?? "?"} ya NO ofrece lo que Ein declara — ${formatDrift(piContract.drift)}. Ein necesita adaptarse a esta versión de Pi.`,
        ),
  ];

  const checksExtensions: CheckResult[] = CORE_EXTENSIONS.map((e) =>
    check(
      existsSync(join(agentDir, "extensions", e)),
      `ext ${e}`,
      "Extension presente.",
    ),
  );

  const checksIntegrations: CheckResult[] = [
    warn(hasLinearToken, "linear token", "Token Linear detectable en entorno o archivo."),
    warn(
      existsSync(CONTEXT7_KEY_PATH) || Boolean(process.env.CONTEXT7_API_KEY),
      "context7 key",
      "Key Context7 detectable.",
    ),
    warn(
      existsSync(join(agentDir, "backups", "auto")),
      "backup auto",
      "Directorio de backup automatico presente.",
    ),
  ];

  const checksI18n: CheckResult[] = [
    check(existsSync(langLibFile), "lib/lang.ts", "Modulo de idioma presente."),
    check(
      existsSync(stringsLibFile),
      "lib/i18n/strings.ts",
      "Mapas de UI (es/en) presentes.",
    ),
  ];

  const groups: Array<{ title: string; checks: CheckResult[] }> = [
    { title: "// 011. CORE", checks: common.checks.core },
    { title: "// 012. PAQUETES PI", checks: common.checks.piPackages },
    { title: "// 013. MCP", checks: common.checks.mcp },
    { title: "// 014. AGENTES + CHAIN", checks: checksAgents },
    { title: "// 015. EXTENSIONES", checks: checksExtensions },
    { title: "// 016. SKILLS", checks: common.checks.skills },
    { title: "// 017. GUARDRAILS", checks: common.checks.guardrails },
    { title: "// 018. INTEGRACIONES", checks: checksIntegrations },
    { title: "// 019. I18N", checks: checksI18n },
    { title: "// 020. COHERENCIA", checks: common.checks.coherence },
  ];

  const summary = summarizeDoctorChecks(groups);

  const lines = [
    "// 010. doctor output",
    "",
    `resultado: ${summary.result}`,
    `fail: ${summary.fail}  |  warn: ${summary.warn}  |  total: ${summary.total}`,
    "",
  ];

  for (const group of groups) {
    lines.push(group.title);
    for (const item of group.checks) {
      lines.push(`- ${item.level} - ${item.name}: ${item.detail}`);
    }
    lines.push("");
  }

  lines.push("// 021. DECISION");
  if (summary.fail) {
    lines.push("accion: revisar FAIL antes de flujos de entrega o mutacion.");
  } else if (summary.warn) {
    lines.push("accion: sistema usable; resolver WARN para endurecer baseline.");
  } else {
    lines.push("accion: baseline tecnico estable.");
  }

  return lines.join("\n");
}

// =============================================================================
// [EXPORT] Registro en Pi
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
