import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { commandName, slashCommand } from "./ein-brand";
import { t, tf } from "../lib/i18n/strings";
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
  output?: string;
  expectedSkills?: string;
};

const registrySchema = {
  type: "object",
  properties: {
    source: { type: "string", description: "local | downloaded | project | all" },
    query: { type: "string", description: "Search term over skill name/description." },
    task: { type: "string", description: "Concrete task text used for skill resolution/digestion." },
    stack: { type: "string", description: "node | frontend | fullstack | unknown" },
    limit: { type: "number", description: "Max number of results." },
    output: { type: "string", description: "Agent output text to audit against expected skills." },
    expectedSkills: { type: "string", description: "Comma-separated expected skill keys or names." },
  },
} as const;

const ATL_DIR = ".atl";
const REGISTRY_MD = "skill-registry.md";
const CACHE_JSON = ".skill-registry.cache.json";

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

interface CacheData {
  version: number;
  entries: SkillEntry[];
  scannedDirs: string[];
  generatedAt: number;
  youngestMtime: number;
}

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

function newestMtime(dir: string): number {
  let newest = 0;
  try {
    const files = collectSkillFiles(dir);
    for (const f of files) {
      try {
        const mtime = statSync(f).mtimeMs;
        if (mtime > newest) newest = mtime;
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }
  return newest;
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

  // Deduplicate: project wins over user by key
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

// Detect Context7-routed technologies mentioned in the task. Deduped by query.
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

// Full Context7 section for the digest output.
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

function normalizeTokens(text: string): string[] {
  return text.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function feedbackReport(output: string, expected: string[], registry: SkillEntry[]): string {
  const lowerOutput = output.toLowerCase();
  const lines = [
    "/// 000. SKILL FEEDBACK",
    `- **Skills esperadas:** ${expected.length}`,
    "",
  ];

  if (!expected.length) {
    lines.push("- No se definieron skills esperadas. Pasa `expectedSkills` para auditar aplicacion.");
    return lines.join("\n");
  }

  for (const token of expected) {
    const entry = registry.find((item) => item.key === token || item.name.toLowerCase() === token);
    const candidates = [token];
    if (entry) {
      candidates.push(entry.key.toLowerCase(), entry.name.toLowerCase());
      for (const trigger of entry.triggers) candidates.push(trigger.toLowerCase());
    }
    const found = candidates.some((candidate) => lowerOutput.includes(candidate));
    lines.push(`- **${token}** -> ${found ? "Applied (signal found)" : "Missing signal"}`);
  }

  lines.push("");
  lines.push("■ 001. RECOMENDACION");
  lines.push("- Si hay `Missing signal`, exige que el subagente explique explicitamente que regla de la skill aplico y que riesgo evito.");
  lines.push("- Para tareas criticas, combinar este feedback con verify real (tests/build/lint/typecheck).");
  return lines.join("\n");
}

function getAtlDir(cwd: string): string {
  return join(cwd, ATL_DIR);
}

function ensureAtlDir(cwd: string): string {
  const dir = getAtlDir(cwd);
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort
  }
  return dir;
}

function writeGitignoreEntry(cwd: string): void {
  const giPath = join(cwd, ".gitignore");
  const header = "# Local Pi runtime state";
  const marker = ".atl/";
  try {
    const existing = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
    const lines = existing.split("\n");
    const hasHeader = lines.some((l) => l.trim() === header);
    const hasMarker = lines.some((l) => l.trim() === marker);
    if (!hasMarker) {
      const base = existing.trim() ? existing.trimEnd() : "";
      const parts: string[] = [];
      if (base) parts.push(base);
      if (!hasHeader) parts.push(header);
      parts.push(marker);
      writeFileSync(giPath, parts.join("\n") + "\n", "utf8");
    }
  } catch {
    // best-effort
  }
}

function writeRegistryMd(cwd: string, entries: SkillEntry[]): void {
  const atlDir = ensureAtlDir(cwd);
  const mdPath = join(atlDir, REGISTRY_MD);

  const allDirs = [
    ...PROJECT_SKILL_DIRS.map((d) => join(cwd, d)),
    ...USER_SKILL_DIRS.map((d) => d),
  ].filter((d) => {
    try { return statSync(d).isDirectory(); } catch { return false; }
  });

  const sourcesScanned = allDirs.map((d) => relative(cwd, d));

  const tableRows = entries.map((e) => {
    const trigger = e.triggers.slice(0, 3).join(", ");
    return `| ${e.name} | ${trigger || "—"} | ${e.description.slice(0, 60)} | ${e.scope} | \`${e.path}\` |`;
  }).join("\n");

  const md = [
    "# Skill Registry",
    "",
    "## Sources Scanned",
    allDirs.length ? sourcesScanned.map((d) => `- \`${d}\``).join("\n") : "_None found._",
    "",
    "## Contract",
    "**`SKILL.md` is the source of truth.** Every skill directory must contain a `SKILL.md` file that defines name, description, and rules. All other files are secondary.",
    "",
    "## Index",
    "",
    "| Skill | Trigger | Description | Scope | Path |",
    "| --- | --- | --- | --- | --- |",
    tableRows || "| — | — | — | — | — |",
  ].join("\n");

  try {
    writeFileSync(mdPath, md, "utf8");
  } catch {
    // best-effort
  }
}

function readCache(cwd: string): CacheData | null {
  const cachePath = join(getAtlDir(cwd), CACHE_JSON);
  try {
    const raw = readFileSync(cachePath, "utf8");
    return JSON.parse(raw) as CacheData;
  } catch {
    return null;
  }
}

function writeCache(cwd: string, entries: SkillEntry[], scannedDirs: string[]): void {
  const atlDir = ensureAtlDir(cwd);
  const cachePath = join(atlDir, CACHE_JSON);

  let youngestMtime = 0;
  for (const entry of entries) {
    try {
      const m = statSync(entry.path).mtimeMs;
      if (m > youngestMtime) youngestMtime = m;
    } catch {
      // skip
    }
  }

  const data: CacheData = {
    version: 1,
    entries,
    scannedDirs,
    generatedAt: Date.now(),
    youngestMtime,
  };

  try {
    writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf8");
  } catch {
    // best-effort
  }
}

function buildScopedRegistry(cwd: string): SkillEntry[] {
  return loadRegistry(cwd);
}

function needsRegeneration(cwd: string, cache: CacheData): boolean {
  if (!cache || cache.version !== 1) return true;

  const allDirs = [
    ...PROJECT_SKILL_DIRS.map((d) => join(cwd, d)),
    ...USER_SKILL_DIRS,
  ];

  for (const dir of allDirs) {
    const mtime = newestMtime(dir);
    if (mtime > cache.youngestMtime) return true;
  }

  return false;
}

function refreshRegistry(cwd: string): SkillEntry[] {
  const atlDir = ensureAtlDir(cwd);
  const mdPath = join(atlDir, REGISTRY_MD);

  const allDirs = [
    ...PROJECT_SKILL_DIRS.map((d) => join(cwd, d)),
    ...USER_SKILL_DIRS,
  ];

  const entries = loadRegistry(cwd);
  writeRegistryMd(cwd, entries);

  const scannedDirs = allDirs
    .map((d) => relative(cwd, d))
    .filter((d) => {
      try { return statSync(join(cwd, d)).isDirectory(); } catch { return false; }
    });

  writeCache(cwd, entries, scannedDirs);
  return entries;
}

function getOrCreateRegistry(cwd: string): SkillEntry[] {
  const cached = readCache(cwd);
  if (cached && !needsRegeneration(cwd, cached)) {
    return cached.entries;
  }
  return refreshRegistry(cwd);
}

// Deterministic skill injection for subagents.
// Called by the orchestrator (ein-ai before_agent_start) so phase agents
// Convenciones de casa que SIEMPRE aplican al escribir/editar codigo, sin
// depender de la relevancia. Se inyectan aparte (codeConventionSkillBlock),
// asi que se excluyen de la resolucion por relevancia para no duplicar.
const CODE_CONVENTION_KEYS = ["comment-style", "logging-style", "file-naming"];

// Bloque always-on: paths de las convenciones de codigo a cargar siempre que
// se vaya a escribir o editar codigo. Lo inyecta ein-ai tanto en el parent
// como en los subagentes. Devuelve "" si no hay ninguna instalada.
export function codeConventionSkillBlock(cwd: string): string {
  let registry: SkillEntry[] = [];
  try {
    registry = getOrCreateRegistry(cwd);
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

// receive exact SKILL.md paths instead of relying on the parent model to ask.
export function resolveSkillInjection(cwd: string, task: string, limit = 6): string {
  const cleanTask = (task ?? "").trim();
  if (!cleanTask) return "";
  let registry: SkillEntry[] = [];
  try {
    registry = getOrCreateRegistry(cwd);
  } catch {
    registry = [];
  }
  const resolved = resolveSkills(registry, cleanTask, undefined, limit).filter(
    (skill) => !CODE_CONVENTION_KEYS.includes(skill.key),
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
      const registry = getOrCreateRegistry(cwd);
      const filtered = filteredRegistry(registry, params);
      const limit = Math.max(1, Math.min(params.limit ?? filtered.length, 100));
      const output = formatRegistry(filtered.slice(0, limit), params.source ?? "all", filtered.length);
      return { content: [{ type: "text", text: output }], details: { total: filtered.length } };
    },
  });

  pi.registerTool({
    name: "ein_skill_feedback",
    label: "Ein Skill Feedback",
    description: "Audit whether expected skill signals are present in an agent output.",
    parameters: registrySchema,
    async execute(_id, params: RegistryParams, ctx: any) {
      const output = (params.output ?? "").trim();
      if (!output) throw new Error("output is required");
      const expected = normalizeTokens(params.expectedSkills ?? "");
      const cwd = ctx?.cwd ?? process.cwd();
      const report = feedbackReport(output, expected, getOrCreateRegistry(cwd));
      return { content: [{ type: "text", text: report }], details: { expected: expected.length } };
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
      const registry = getOrCreateRegistry(cwd);
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
      const registry = getOrCreateRegistry(cwd);
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
    pi.sendUserMessage(`Usa \`ein_skill_registry\`, luego \`ein_skill_resolve\` y \`ein_skill_digest\` para esta tarea: ${task}. El digest incluye, para tecnologias sin skill curada, instruccion de Context7 (resolve-library-id + query-docs) que debes ejecutar para traer docs frescas. Devuelve un resumen didactico en el idioma de la conversacion.`);
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

  pi.registerCommand("skill-registry:refresh", {
    description: t(
      "cmd.skill-registry.refresh.description",
      "Fuerza regeneracion de .atl/skill-registry.md desde cero",
    ),
    handler: async (_args: string, ctx: any) => {
      const cwd = ctx?.cwd ?? process.cwd();
      try {
        const entries = refreshRegistry(cwd);
        writeGitignoreEntry(cwd);
        const count = entries.length;
        ctx.ui?.notify?.(`Registry refreshed: ${count} skills indexed.`, "info");
      } catch (e: any) {
        ctx.ui?.notify?.(`Refresh failed: ${e?.message ?? "unknown error"}`, "error");
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const cwd = ctx?.cwd ?? process.cwd();
    try {
      refreshRegistry(cwd);
      writeGitignoreEntry(cwd);
    } catch (e: any) {
      try {
        ctx.ui?.notify?.(`Warning: could not write skill registry: ${e?.message ?? "unknown"}`, "warning");
      } catch {
        // best-effort
      }
    }
  });
}