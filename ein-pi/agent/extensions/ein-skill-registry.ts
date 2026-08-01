import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { commandName, slashCommand } from "./ein-brand";
import { t, tf } from "../lib/i18n/strings";
import { pick } from "../lib/lang";
import { readMode } from "../lib/mode";
import { AGENT_DIR, DOWNLOADED_SKILLS_DIR, LOCAL_SKILLS_DIR } from "./ein-paths";

type SkillScope = "project" | "user";

type SkillSource = "local" | "downloaded" | "project";

type SkillEntry = {
  key: string;
  name: string;
  source: SkillSource;
  scope: SkillScope;
  path: string;
  description: string;
  stackTags: string[];
  triggers: string[];
};

type RegistryParams = {
  source?: SkillSource | "all";
  query?: string;
  task?: string;
  stack?: "node" | "frontend" | "fullstack" | "unknown";
  limit?: number;
};

const registrySchema = {
  type: "object",
  properties: {
    source: { type: "string", description: "local | downloaded | project | all" },
    query: { type: "string", description: "Search term over skill name/description." },
    task: { type: "string", description: "Concrete task text used for skill resolution/digestion." },
    stack: { type: "string", description: "node | frontend | fullstack | unknown" },
    limit: { type: "number", description: "Max number of results." },
  },
} as const;

const PROJECT_SKILL_DIRS = [
  "skills",
  ".claude/skills",
  ".gemini/skills",
  ".cursor/skills",
  ".github/skills",
  ".codex/skills",
  ".qwen/skills",
  ".kiro/skills",
  ".pi/skills",
  ".agent/skills",
  ".agents/skills",
  ".atl/skills",
];

const USER_SKILL_DIRS = [
  join(AGENT_DIR, "skills"),
  LOCAL_SKILLS_DIR,
  DOWNLOADED_SKILLS_DIR,
  join(homedir(), ".cache/cline/skills"),
  join(homedir(), ".cache/coze/skills"),
];

function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "No description.";
  const dot = clean.indexOf(".");
  return dot > 0 ? clean.slice(0, dot + 1) : clean.slice(0, 180);
}

function lineAfterPrefix(lines: string[], prefix: string): string {
  const line = lines.find((item) => item.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!line) return "";
  return line.slice(prefix.length).trim();
}

function yamlBlockAfterKey(lines: string[], key: string): string {
  const lowerKey = `${key.toLowerCase()}:`;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    if (!raw.toLowerCase().startsWith(lowerKey)) continue;
    const inline = raw.slice(lowerKey.length).trim();
    if (inline && inline !== ">" && inline !== "|") return inline;

    const block: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j] ?? "";
      if (!next.trim()) {
        if (block.length) break;
        continue;
      }
      if (/^[A-Za-z0-9_-]+:\s*/.test(next)) break;
      block.push(next.replace(/^\s+/, "").trim());
    }
    return block.join(" ").replace(/\s+/g, " ").trim();
  }
  return "";
}

function collectSkillFiles(root: string): string[] {
  const files: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(root);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = `${root}/${entry}`;
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...collectSkillFiles(fullPath));
      continue;
    }
    if (entry === "SKILL.md") files.push(fullPath);
  }
  return files;
}

function inferStackTags(content: string): string[] {
  const lower = content.toLowerCase();
  const tags: string[] = [];
  if (/node|typescript|javascript|hono|drizzle|postgres|api|server|auth|db/.test(lower)) tags.push("node");
  if (/nuxt|vue|react|vite|tailwind|gsap|tresjs|ui|ux|design/.test(lower)) tags.push("frontend");
  if (/github|linear|workflow|delivery/.test(lower)) tags.push("workflow");
  if (/design|ui|ux|accessibility|seo|performance/.test(lower)) tags.push("frontend");
  return [...new Set(tags)];
}

function inferTriggers(content: string): string[] {
  const lower = content.toLowerCase();
  const triggers: string[] = [];
  const candidates = [
    "postgresql", "nuxt", "vue", "react", "github", "linear",
    "animation", "gsap", "accessibility", "performance", "seo", "obsidian",
    "logging", "comment", "naming", "kebab", "readme", "refactor",
    "architecture", "design", "pattern",
  ];
  for (const candidate of candidates) {
    if (lower.includes(candidate)) triggers.push(candidate);
  }
  return triggers;
}

function parseSkill(skillPath: string, source: SkillSource, scope: SkillScope): SkillEntry {
  const content = readFileSync(skillPath, "utf8");
  const lines = content.split("\n");
  const nameFromFrontmatter = lineAfterPrefix(lines, "name:");
  const descriptionFromFrontmatter = yamlBlockAfterKey(lines, "description") || lineAfterPrefix(lines, "description:");
  const titleLine = lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() ?? "";
  const name = nameFromFrontmatter || titleLine || basename(dirname(skillPath));
  const description = descriptionFromFrontmatter || firstSentence(content.replace(/[#>*`]/g, " "));
  return {
    key: basename(dirname(skillPath)).toLowerCase(),
    name,
    source,
    scope,
    path: skillPath,
    description,
    stackTags: inferStackTags(content),
    triggers: inferTriggers(content),
  };
}

function loadRegistry(cwd: string): SkillEntry[] {
  const projectDirs = PROJECT_SKILL_DIRS.map((d) => join(cwd, d));
  const userDirs = USER_SKILL_DIRS;

  const projectEntries: SkillEntry[] = [];
  for (const dir of projectDirs) {
    for (const path of collectSkillFiles(dir)) {
      projectEntries.push(parseSkill(path, "project", "project"));
    }
  }

  const userEntries: SkillEntry[] = [];
  for (const dir of userDirs) {
    for (const path of collectSkillFiles(dir)) {
      const source: SkillSource = dir.includes("downloaded") ? "downloaded" : "local";
      userEntries.push(parseSkill(path, source, "user"));
    }
  }

  const merged = [...projectEntries, ...userEntries];

  // Deduplicate: project wins over user by key.
  // Reason -> a repo skill is the author's chosen truth for that repo; a
  // same-named global skill is only a fallback when no project skill exists.
  const seen = new Map<string, SkillEntry>();
  for (const entry of merged) {
    if (!seen.has(entry.key)) {
      seen.set(entry.key, entry);
    } else {
      const existing = seen.get(entry.key)!;
      if (existing.scope !== "project" && entry.scope === "project") {
        seen.set(entry.key, entry);
      }
    }
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function filteredRegistry(registry: SkillEntry[], params: RegistryParams): SkillEntry[] {
  const query = (params.query ?? "").toLowerCase().trim();
  const source = params.source ?? "all";
  const stack = params.stack ?? "unknown";

  let result = registry;
  if (source !== "all") result = result.filter((entry) => entry.source === source);
  if (query) {
    result = result.filter((entry) => {
      const haystack = `${entry.name} ${entry.description} ${entry.triggers.join(" ")} ${entry.stackTags.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  if (stack !== "unknown" && stack !== "fullstack") {
    result = result.filter((entry) => entry.stackTags.includes(stack) || entry.stackTags.includes("workflow"));
  }
  return result;
}

function detectStackFromTask(task: string): "node" | "frontend" | "fullstack" | "unknown" {
  const lower = task.toLowerCase();
  const frontend = /nuxt|vue|react|vite|tailwind|gsap|tresjs|frontend|ui|ux/.test(lower);
  const backend = /node|typescript|javascript|hono|drizzle|postgres|api|server|auth|db/.test(lower);
  if (frontend && backend) return "fullstack";
  if (frontend) return "frontend";
  if (backend) return "node";
  return "unknown";
}

function scoreSkill(entry: SkillEntry, task: string, stack: "node" | "frontend" | "fullstack" | "unknown"): number {
  const lowerTask = task.toLowerCase();
  let score = 0;
  if (stack !== "unknown" && entry.stackTags.includes(stack)) score += 5;
  if (entry.stackTags.includes("workflow")) score += 1;
  for (const trigger of entry.triggers) {
    if (lowerTask.includes(trigger)) score += 3;
  }
  const nameLower = entry.name.toLowerCase();
  if (lowerTask.includes(nameLower)) score += 6;
  if (lowerTask.includes(entry.key)) score += 4;
  return score;
}

function resolveSkills(registry: SkillEntry[], task: string, explicitStack?: "node" | "frontend" | "fullstack" | "unknown", limit = 8): SkillEntry[] {
  const stack = explicitStack && explicitStack !== "unknown" ? explicitStack : detectStackFromTask(task);
  const scored = registry
    .map((entry) => ({ entry, score: scoreSkill(entry, task, stack) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));

  const unique = new Map<string, SkillEntry>();
  for (const item of scored) {
    if (!unique.has(item.entry.key)) unique.set(item.entry.key, item.entry);
    if (unique.size >= limit) break;
  }
  return [...unique.values()];
}

const STACK_PROFILE_PATH = join(AGENT_DIR, "skills", "stack-profile.json");

// Map of detection-keyword -> Context7 library query, read from the stack
// profile. These are technologies deliberately NOT given a curated skill; the
// model pulls fresh docs from Context7 on demand instead.
function loadContext7Map(): Record<string, string> {
  try {
    const raw = JSON.parse(readFileSync(STACK_PROFILE_PATH, "utf8")) as { context7?: unknown };
    const map = raw.context7;
    if (map && typeof map === "object" && !Array.isArray(map)) {
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
        if (typeof value === "string") out[key.toLowerCase()] = value;
      }
      return out;
    }
  } catch {
    // no profile / parse error -> no Context7 routing
  }
  return {};
}

// Detect Context7-routed technologies mentioned in the task.
// BLINDAJE -> dedupe by query (not by tech key) because two synonyms in the
// stack profile can map to the same library, and we only want one
// resolve-library-id call per library per task.
function detectContext7(task: string): Array<{ tech: string; query: string }> {
  const lower = task.toLowerCase();
  const map = loadContext7Map();
  const seen = new Set<string>();
  const out: Array<{ tech: string; query: string }> = [];
  for (const [tech, query] of Object.entries(map)) {
    const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(lower) && !seen.has(query)) {
      seen.add(query);
      out.push({ tech, query });
    }
  }
  return out;
}

// Renders the "techs sin skill curada" block; only called from digestSkillGuidelines.
function context7Section(task: string): string[] {
  const libs = detectContext7(task);
  if (!libs.length) return [];
  return [
    "",
    "■ 003. CONTEXT7 (techs sin skill curada)",
    "Estas tecnologias no tienen skill en el stack. Trae docs frescas on-demand:",
    ...libs.map((l) => `  - ${l.tech} -> resolve-library-id "${l.query}" -> query-docs (solo el topic de la tarea)`),
    "- No vuelques toda la doc: pide el topic concreto y aplica solo lo relevante.",
  ];
}

function digestSkillGuidelines(skills: SkillEntry[], task: string, stack: string): string {
  const c7 = context7Section(task);

  if (!skills.length) {
    const base = [
      "/// 000. SKILL DIGEST",
      `- **Task:** ${task || "(no task provided)"}`,
      `- **Stack:** ${stack}`,
    ];
    if (!c7.length) {
      base.push("- No se encontraron skills con buena senal. Usa skill manual o refina la tarea.");
      return base.join("\n");
    }
    return [...base, ...c7].join("\n");
  }

  const header = [
    "/// 000. SKILL DIGEST",
    `- **Task:** ${task || "(no task provided)"}`,
    `- **Stack:** ${stack}`,
    "",
  ];

  const paths = skills.map((s) => s.path);

  const protocol = [
    "",
    "■ 001. SKILL.md PATHS TO LOAD",
    "Carga estos archivos antes de trabajar en la tarea:",
    ...paths.map((p) => `  - ${p}`),
    "",
    "■ 002. PROTOCOLO",
    "- Para cada skill cargada, lee SKILL.md y aplica sus reglas.",
    "- Si una skill no tiene sentido para la tarea, documenta por que la descartas.",
    "- Cuando edites codigo, explica en la salida que reglas seguiste y que riesgo evitaste.",
  ];

  return [...header, ...protocol, ...c7].join("\n");
}

function formatRegistry(entries: SkillEntry[], source: string, totalFiltered: number): string {
  const localCount = entries.filter((item) => item.source === "local").length;
  const downloadedCount = entries.filter((item) => item.source === "downloaded").length;
  const projectCount = entries.filter((item) => item.source === "project").length;
  const lines = [
    "/// 000. SKILL REGISTRY",
    `- **Fuente:** ${source}`,
    `- **Total real:** ${totalFiltered}`,
    `- **Mostrando:** ${entries.length} (project: ${projectCount}, local: ${localCount}, downloaded: ${downloadedCount})`,
    "",
  ];

  for (const entry of entries) {
    lines.push(`- **${entry.name}** [${entry.source}/${entry.scope}] -> \`${entry.key}\` | tags: ${entry.stackTags.join(", ") || "none"}`);
  }
  return lines.join("\n");
}


// House conventions that ALWAYS apply when writing or editing code, regardless
// of relevance. Injected separately via codeConventionSkillBlock, so they are
// excluded from relevance resolution to avoid duplication.
const CODE_CONVENTION_KEYS = ["comment-style", "logging-style", "file-naming"];

// GUARD -> Skills que solo tienen sentido en modo Team (Linear activo). En Solo,
// linear-workflow puntúa alto por sus tags (nuxt/github) y se colaba en el
// scope aunque Linear esté dormido. Se excluye salvo en Team.
const TEAM_ONLY_SKILL_KEYS = ["linear-workflow"];

// ¿Esta skill puede inyectarse en el modo activo? Las de Team solo en Team.
export function skillAllowedInMode(key: string, mode: "solo" | "team"): boolean {
  return mode === "team" || !TEAM_ONLY_SKILL_KEYS.includes(key);
}

// Always-on block: paths of the code conventions to load whenever code is
// about to be written or edited. Injected by ein-ai into both the parent and
// subagents. Returns "" if none are installed.
export function codeConventionSkillBlock(cwd: string): string {
  let registry: SkillEntry[] = [];
  try {
    registry = loadRegistry(cwd);
  } catch {
    return "";
  }
  const byKey = new Map(registry.map((entry) => [entry.key, entry]));
  const paths = CODE_CONVENTION_KEYS.map((key) => byKey.get(key)?.path).filter(
    (p): p is string => typeof p === "string",
  );
  if (!paths.length) return "";
  return [
    "## Code conventions (mandatory house style)",
    "Before writing or editing ANY code, read and follow these convention skills — not optional:",
    ...paths.map((p) => `- ${p}`),
    "Apply comment-style to comments, logging-style to runtime logs, and file-naming (kebab-case) to any new or renamed file.",
  ].join("\n");
}

// Deterministic skill injection for subagents.
// Called by the orchestrator (ein-ai before_agent_start) so phase/named
// agents receive exact SKILL.md paths instead of relying on the parent
// model to ask. Convention skills are filtered out (see CODE_CONVENTION_KEYS).
export function resolveSkillInjection(cwd: string, task: string, limit = 6): string {
  const cleanTask = (task ?? "").trim();
  if (!cleanTask) return "";
  let registry: SkillEntry[] = [];
  try {
    registry = loadRegistry(cwd);
  } catch {
    registry = [];
  }
  const mode = readMode(cwd);
  const resolved = resolveSkills(registry, cleanTask, undefined, limit).filter(
    (skill) =>
      !CODE_CONVENTION_KEYS.includes(skill.key) &&
      skillAllowedInMode(skill.key, mode),
  );
  const c7 = detectContext7(cleanTask);
  if (!resolved.length && !c7.length) return "";

  const parts: string[] = [];
  if (resolved.length) {
    parts.push(
      "## Skills to load before work",
      "",
      "Read these exact SKILL.md files before reading, writing, reviewing, testing, or creating artifacts:",
      ...resolved.map((skill) => `- ${skill.path}`),
      "",
      "For each skill, apply its rules; if one does not fit the task, note why you skip it.",
    );
  }
  if (c7.length) {
    if (parts.length) parts.push("");
    parts.push(
      "## Context7 (no curated skill)",
      "These technologies have no curated skill. Fetch fresh docs via Context7 (resolve-library-id then query-docs) for the task topic before using them:",
      ...c7.map((l) => `- ${l.tech} -> ${l.query}`),
    );
  }
  return parts.join("\n");
}

export default function einSkillRegistry(pi: ExtensionAPI) {

  pi.registerTool({
    name: "ein_skill_registry",
    label: "Ein Skill Registry",
    description: "List and search Pi skills from project/user folders with inferred metadata.",
    parameters: registrySchema,
    async execute(_id, params: RegistryParams, ctx: any) {
      const cwd = ctx?.cwd ?? process.cwd();
      const registry = loadRegistry(cwd);
      const filtered = filteredRegistry(registry, params);
      const limit = Math.max(1, Math.min(params.limit ?? filtered.length, 100));
      const output = formatRegistry(filtered.slice(0, limit), params.source ?? "all", filtered.length);
      return { content: [{ type: "text", text: output }], details: { total: filtered.length } };
    },
  });

  pi.registerTool({
    name: "ein_skill_resolve",
    label: "Ein Skill Resolve",
    description: "Resolve the most relevant skills for a concrete task and stack.",
    parameters: registrySchema,
    async execute(_id, params: RegistryParams, ctx: any) {
      const task = (params.task ?? params.query ?? "").trim();
      if (!task) throw new Error("task or query is required");
      const cwd = ctx?.cwd ?? process.cwd();
      const registry = loadRegistry(cwd);
      const resolved = resolveSkills(registry, task, params.stack ?? "unknown", Math.max(1, Math.min(params.limit ?? 8, 20)));
      const stack = params.stack && params.stack !== "unknown" ? params.stack : detectStackFromTask(task);

      const lines = [
        "/// 000. SKILL RESOLVE",
        `- **Task:** ${task}`,
        `- **Stack detectado:** ${stack}`,
        `- **Skills sugeridas:** ${resolved.length}`,
        "",
      ];

      for (const skill of resolved) {
        lines.push(`- **${skill.name}** -> \`${skill.key}\` (${skill.source}/${skill.scope})`);
      }

      if (!resolved.length) lines.push("- No hay coincidencias fuertes. Refina el task o especifica stack.");
      return { content: [{ type: "text", text: lines.join("\n") }], details: { stack, count: resolved.length } };
    },
  });

  pi.registerTool({
    name: "ein_skill_digest",
    label: "Ein Skill Digest",
    description: "Return exact SKILL.md paths to load before work, plus concise protocol.",
    parameters: registrySchema,
    async execute(_id, params: RegistryParams, ctx: any) {
      const task = (params.task ?? params.query ?? "").trim();
      if (!task) throw new Error("task or query is required");
      const stack = params.stack && params.stack !== "unknown" ? params.stack : detectStackFromTask(task);
      const cwd = ctx?.cwd ?? process.cwd();
      const registry = loadRegistry(cwd);
      const resolved = resolveSkills(registry, task, stack, Math.max(1, Math.min(params.limit ?? 6, 12)));
      const digest = digestSkillGuidelines(resolved, task, stack);
      return { content: [{ type: "text", text: digest }], details: { stack, count: resolved.length } };
    },
  });

  const skillsHandler = async (args: string, ctx: any) => {
    const task = args?.trim() || "sin tarea";
    if (!ctx.isIdle()) {
      ctx.ui.notify(
        tf(
          "busy.retry",
          `El agente esta ocupado. Vuelve a lanzar ${slashCommand("skills")} cuando termine.`,
          slashCommand("skills"),
        ),
        "warning",
      );
      return;
    }
    if (task === "sin tarea") {
      ctx.ui.notify(
        tf(
          "skills.advisor.tip",
          `Tip: usa ${slashCommand("skills")} <tarea> para obtener resolve+digest utiles para tu caso.`,
          slashCommand("skills"),
        ),
        "info",
      );
    }
    pi.sendUserMessage(
      pick(
        `Usa \`ein_skill_registry\`, luego \`ein_skill_resolve\` y \`ein_skill_digest\` para esta tarea: ${task}. El digest incluye, para tecnologias sin skill curada, instruccion de Context7 (resolve-library-id + query-docs) que debes ejecutar para traer docs frescas. Devuelve un resumen didactico en español.`,
        `Use \`ein_skill_registry\`, then \`ein_skill_resolve\` and \`ein_skill_digest\` for this task: ${task}. For technologies without a curated skill, the digest includes a Context7 instruction (resolve-library-id + query-docs) you must run to fetch fresh docs. Return a teaching summary in English.`,
      ),
    );
  };

  pi.registerCommand(commandName("skills:advisor"), {
    description: t(
      "cmd.skills.advisor.description",
      "Muestra inventario y resolucion de skills para una tarea",
    ),
    handler: skillsHandler,
  });

  pi.registerCommand("skill-registry", {
    description: tf(
      "cmd.skill-registry.legacy.description",
      `[legacy] Usa ${slashCommand("skills:advisor")}`,
      slashCommand("skills:advisor"),
    ),
    handler: skillsHandler,
  });

}