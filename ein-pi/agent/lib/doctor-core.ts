import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { inspectLinearIntegration } from "./linear-integration.ts";
import { ENGRAM_STORE_DIRNAME } from "./memory-contract.ts";
import {
  isPublishedPackageVersion,
  readInstalledPiPackageVersion,
  REQUIRED_PI_PACKAGES,
} from "./runtime-compat.ts";
import {
  evaluatePiHostTree,
  resolvePiHostRoot,
  type EvaluatePiHostTreeDeps,
  type ResolvePiHostRootDeps,
} from "./pi-host-tree.ts";

export type DoctorCheckLevel = "OK" | "WARN" | "FAIL";
export type DoctorCheckResult = {
  name: string;
  detail: string;
  level: DoctorCheckLevel;
};
export type DoctorCheckGroup = { title: string; checks: DoctorCheckResult[] };
export type DoctorResult = "OK" | "OK_WITH_WARNINGS" | "FAIL";
export type DoctorSummary = {
  fail: number;
  warn: number;
  total: number;
  result: DoctorResult;
};

export function doctorCheck(
  pass: boolean,
  name: string,
  detail: string,
): DoctorCheckResult {
  return { name, detail, level: pass ? "OK" : "FAIL" };
}

export function doctorWarn(
  pass: boolean,
  name: string,
  detail: string,
): DoctorCheckResult {
  return { name, detail, level: pass ? "OK" : "WARN" };
}

export function readDoctorText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function readDoctorJson(path: string): {
  ok: boolean;
  value: Record<string, unknown>;
} {
  try {
    return {
      ok: true,
      value: JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>,
    };
  } catch {
    return { ok: false, value: {} };
  }
}

export function countDoctorSkillFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return count;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    try {
      if (statSync(path).isDirectory()) count += countDoctorSkillFiles(path);
      if (entry === "SKILL.md") count += 1;
    } catch {
      // Una entrada inaccesible no invalida el resto del inventario.
    }
  }
  return count;
}

export type CommonDoctorInspection = {
  checks: {
    core: DoctorCheckResult[];
    piPackages: DoctorCheckResult[];
    piHostTree: DoctorCheckResult[];
    mcp: DoctorCheckResult[];
    skills: DoctorCheckResult[];
    guardrails: DoctorCheckResult[];
    coherence: DoctorCheckResult[];
  };
  evidence: { engramCommand: string | null };
};

// GUARD -> agentDir es el runtime aislado de Ein (extensiones), no el root de
// instalación del host Pi. El ancla por defecto es el propio bundle en
// ejecución (process.argv[1]); una búsqueda mínima en PATH es el segundo
// intento. Ambos son inyectables para test.
function findPiOnPath(): string | null {
  const pathDirs = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const dir of pathDirs) {
    const candidate = join(dir, "pi");
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // no encontrado en este directorio, sigue
    }
  }
  return null;
}

export function inspectCommonDoctor(input: {
  agentDir: string;
  linearCwd: string;
  localSkillsDir: string;
  downloadedSkillsDir: string;
  piHostAnchor?: string | null;
  piHostRootDeps?: ResolvePiHostRootDeps;
  piHostTreeDeps?: EvaluatePiHostTreeDeps;
}): CommonDoctorInspection {
  const { agentDir } = input;
  const brandFile = join(agentDir, "brand.json");
  const settingsFile = join(agentDir, "settings.json");
  const mcpFile = join(agentDir, "mcp.json");
  const agentsDir = join(agentDir, "agents");

  const brand = readDoctorJson(brandFile);
  const settings = readDoctorJson(settingsFile);
  const mcp = readDoctorJson(mcpFile);
  const mcpServers = (mcp.value.mcpServers as Record<string, unknown>) ?? {};
  const engramServer = mcpServers.engram as Record<string, unknown> | undefined;
  const engramEnv =
    (engramServer?.environment as Record<string, unknown>) ?? {};
  const settingsPackages = Array.isArray(settings.value.packages)
    ? settings.value.packages.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const enabledModels = Array.isArray(settings.value.enabledModels)
    ? settings.value.enabledModels.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const localSkills = countDoctorSkillFiles(input.localSkillsDir);
  const downloadedSkills = countDoctorSkillFiles(input.downloadedSkillsDir);

  const guardrailsRaw = readDoctorText(join(agentDir, "lib", "guardrails.ts"));
  const preflightRaw = readDoctorText(
    join(agentDir, "lib", "sdd-preflight.ts"),
  );
  const einGitRaw = readDoctorText(join(agentsDir, "ein-git.md"));
  const sddApplyRaw = readDoctorText(join(agentsDir, "sdd-apply.md"));
  const sddVerifyRaw = readDoctorText(join(agentsDir, "sdd-verify.md"));
  const orchestratorRaw = readDoctorText(
    join(agentDir, "assets", "orchestrator.md"),
  );
  const agentPromptRaw = readDoctorText(
    join(agentDir, "extensions", "internal", "ein-agent-prompt-hook.ts"),
  );
  const sddReadSurfaceRaw = readDoctorText(
    join(agentDir, "extensions", "internal", "ein-sdd-read-surface.ts"),
  );
  const personaRaw = readDoctorText(join(agentDir, "lib", "persona.ts"));
  const linearInspection = inspectLinearIntegration(input.linearCwd, agentDir);
  const piHostAnchor = input.piHostAnchor !== undefined
    ? input.piHostAnchor
    : (process.argv[1] ?? findPiOnPath());
  const piHostRoot = resolvePiHostRoot(piHostAnchor, input.piHostRootDeps);
  const piHostTreeVerdict = evaluatePiHostTree(piHostRoot, input.piHostTreeDeps);
  const hasDynamicLinearPrompt =
    agentPromptRaw.includes("buildEinPrompt(") &&
    agentPromptRaw.includes("readLinearIntegration(ctx.cwd)");

  return {
    checks: {
      core: [
        doctorCheck(
          existsSync(brandFile),
          "brand.json",
          "Archivo de marca presente.",
        ),
        doctorCheck(brand.ok, "brand.json parse", "JSON de marca válido."),
        doctorCheck(
          String(brand.value.agentName ?? "") === "Ein",
          "brand.agentName",
          "Nombre canónico: Ein.",
        ),
        doctorCheck(
          String(brand.value.commandPrefix ?? "") === "ein",
          "brand.commandPrefix",
          "Prefijo canónico: ein.",
        ),
        doctorCheck(
          String(brand.value.author ?? "") === "samuhlo",
          "brand.author",
          "Autor canónico: samuhlo.",
        ),
        doctorCheck(
          existsSync(settingsFile),
          "settings.json",
          "Config Pi presente.",
        ),
        doctorCheck(
          settings.ok,
          "settings.json parse",
          "JSON de settings válido.",
        ),
        doctorWarn(
          enabledModels.length > 0,
          "enabledModels",
          enabledModels.length > 0
            ? "Hay modelos habilitados."
            : "Elige al menos un modelo antes de iniciar tu primera sesión.",
        ),
        doctorCheck(
          settings.value.enableSkillCommands === true,
          "enableSkillCommands",
          "Comandos /skill:* activos.",
        ),
      ],
      piPackages: REQUIRED_PI_PACKAGES.map(({ name, spec }) => {
        const installed = readInstalledPiPackageVersion(agentDir, name);
        return doctorCheck(
          settingsPackages.includes(spec) && isPublishedPackageVersion(installed),
          `pi package ${name}`,
          installed
            ? `Declaración ${spec}; instalada ${installed}.`
            : `Declaración ${spec}; paquete no instalado en el runtime aislado.`,
        );
      }),
      // Grupo separado de piPackages a propósito: piPackages son las
      // extensiones que Ein declara (agentDir/npm/...); este es el árbol
      // interno @earendil-works del host Pi ya instalado, otro root. Fundir
      // ambos reproduciría el incidente: un doctor viendo verde donde el
      // otro root está roto.
      piHostTree: piHostTreeVerdict.coherent
        ? [doctorCheck(true, "pi host tree", "Árbol interno @earendil-works del host coherente.")]
        : piHostTreeVerdict.failures.map((f) =>
            doctorCheck(
              false,
              `pi host tree ${f.package}`,
              `${f.reason} (requerido ${f.requiredRange ?? "?"}, instalado ${f.installedVersion ?? "?"}) -> ${f.repairCommand}`,
            ),
          ),
      mcp: [
        doctorCheck(existsSync(mcpFile), "mcp.json", "Archivo MCP presente."),
        doctorCheck(mcp.ok, "mcp.json parse", "JSON MCP válido."),
        doctorCheck(
          "engram" in mcpServers,
          "mcp engram",
          "Servidor Engram configurado.",
        ),
        doctorCheck(
          String(engramEnv.ENGRAM_DATA_DIR ?? "").includes(
            ENGRAM_STORE_DIRNAME,
          ),
          "engram data dir",
          `Engram apunta al cuaderno de Ein (~/${ENGRAM_STORE_DIRNAME}).`,
        ),
        doctorCheck(
          "context7" in mcpServers,
          "mcp context7",
          "Servidor Context7 configurado.",
        ),
      ],
      skills: [
        doctorCheck(
          localSkills > 0,
          "skills local",
          `Skills locales: ${localSkills}.`,
        ),
        doctorCheck(
          downloadedSkills > 0,
          "skills downloaded",
          `Skills descargadas: ${downloadedSkills}.`,
        ),
        doctorWarn(
          localSkills >= 5,
          "skills local threshold",
          "Cantidad local saludable (>=5).",
        ),
        doctorWarn(
          downloadedSkills >= 20,
          "skills downloaded threshold",
          "Cantidad descargada saludable (>=20).",
        ),
      ],
      guardrails: [
        doctorCheck(
          guardrailsRaw.includes("git\\s+reset\\s+--hard"),
          "guardrails git reset",
          "Bloqueo de git reset --hard activo.",
        ),
        doctorCheck(
          guardrailsRaw.includes("DENIED_BASH_PATTERNS"),
          "guardrails bash deny",
          "Lista de comandos bash denegados activa.",
        ),
        doctorCheck(
          guardrailsRaw.includes("CONFIRM_BASH_PATTERNS"),
          "guardrails bash confirm",
          "Lista de confirmación de comandos activa.",
        ),
      ],
      coherence: [
        doctorCheck(
          einGitRaw.includes("Review Workload Gate"),
          "review workload gate",
          "ein-git documenta el gate de carga de revisión.",
        ),
        doctorCheck(
          !preflightRaw.includes("task/workload forecasts conflict"),
          "preflight sin forecast muerto",
          "La preflight ya no referencia un forecast que ninguna fase genera.",
        ),
        doctorCheck(
          preflightRaw.includes("Review Workload Guard"),
          "preflight inyecta guard",
          "La preflight inyecta la regla determinista de Review Workload Guard.",
        ),
        doctorCheck(
          orchestratorRaw.includes("Review Workload Guard"),
          "orchestrator coordina guard",
          "El orchestrator coordina el guard (reenvío de budget + ask).",
        ),
        doctorCheck(
          !sddApplyRaw.includes("global EIN strict-TDD support guidance"),
          "sdd-apply sin support colgante",
          "sdd-apply no referencia una guía de support global inexistente.",
        ),
        doctorCheck(
          !sddVerifyRaw.includes(
            "global EIN strict-TDD verification support guidance",
          ),
          "sdd-verify sin support colgante",
          "sdd-verify no referencia una guía de support global inexistente.",
        ),
        doctorCheck(
          orchestratorRaw.includes("Plan Gate"),
          "orchestrator plan gate",
          "El orchestrator exige plan + confirmación antes de mutaciones ambiguas/bulk.",
        ),
        doctorCheck(
          orchestratorRaw.includes("Exploration hygiene"),
          "orchestrator exploration hygiene",
          "El orchestrator excluye node_modules/dist/etc. de find/grep/glob.",
        ),
        doctorCheck(
          orchestratorRaw.includes("Assessment & valuation"),
          "orchestrator valuation read-only",
          "Una valoración no dispara build/test pesados por defecto.",
        ),
        doctorCheck(
          existsSync(join(agentDir, "lib", "linear-integration.ts")),
          "linear integration module",
          "lib/linear-integration.ts presente.",
        ),
        doctorCheck(
          hasDynamicLinearPrompt,
          "linear dynamic prompt",
          "ein-ai obtiene Linear y lo entrega a buildEinPrompt.",
        ),
        doctorCheck(
          personaRaw.includes("linearDirective(linear)"),
          "linear prompt directive",
          "buildEinPrompt incorpora la directiva Linear dinámica.",
        ),
        doctorCheck(
          linearInspection.status === "valid",
          "linear integration evidence",
          `Estado Linear ${linearInspection.status} desde ${linearInspection.source} (${linearInspection.reason}).`,
        ),
        doctorCheck(
          existsSync(join(agentDir, "lib", "sdd-router.ts")) &&
            sddReadSurfaceRaw.includes("ein_sdd_status"),
          "sdd router cableado",
          "Router determinista (sdd-router + tool ein_sdd_status) presente.",
        ),
        doctorCheck(
          existsSync(join(agentDir, "agents", "sdd-close.md")) &&
            orchestratorRaw.includes("ein_sdd_check"),
          "sdd gatekeeper + close",
          "Gatekeeper (ein_sdd_check) y fase close cableados.",
        ),
      ],
    },
    evidence: {
      engramCommand:
        typeof engramServer?.command === "string" ? engramServer.command : null,
    },
  };
}

export function summarizeDoctorChecks(
  groups: readonly DoctorCheckGroup[],
): DoctorSummary {
  const checks = groups.flatMap((group) => group.checks);
  const fail = checks.filter((item) => item.level === "FAIL").length;
  const warn = checks.filter((item) => item.level === "WARN").length;
  return {
    fail,
    warn,
    total: checks.length,
    result: fail ? "FAIL" : warn ? "OK_WITH_WARNINGS" : "OK",
  };
}
