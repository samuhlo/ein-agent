#!/usr/bin/env bun
// =============================================================================
// cc-ein SYNC — compilador core → Claude Code (adaptador aislado)
// -----------------------------------------------------------------------------
// Despliega el cerebro de EIN a un CLAUDE_CONFIG_DIR propio (~/.claude-ein) sin
// tocar tu ~/.claude. Fuente única de verdad: `ein-pi/core` (agentes + skills)
// se traducen/copian; lo específico de Claude Code (CLAUDE.md, settings.json,
// hooks) vive en `cc-ein/`. Idempotente: se puede re-ejecutar siempre.
//
//   bun cc-ein/sync.ts            # despliega
//   bun cc-ein/sync.ts --dry      # enseña qué haría, sin escribir
// =============================================================================

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  lstatSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { resolveEngramDataDir } from "../ein-pi/agent/lib/memory-contract.ts";

const REPO = join(import.meta.dir, "..");
const CORE = join(REPO, "ein-pi", "core");
const CC = import.meta.dir; // cc-ein/
const DEST = process.env.CC_EIN_HOME ?? join(homedir(), ".claude-ein");
const MAIN = join(homedir(), ".claude");
const DRY = process.argv.includes("--dry");
const PROVENANCE =
  "<!-- GENERATED: source=ein-pi/core/AGENTS.md adapter=cc-ein/CLAUDE.adapter.md; DO NOT EDIT -->";
const ADAPTATION_START = "<!-- ein:claude-adaptation:start -->";
const ADAPTATION_END = "<!-- ein:claude-adaptation:end -->";
const HARNESS_START = "<!-- ein:harness-discipline:start -->";
const HARNESS_END = "<!-- ein:harness-discipline:end -->";
export const SURFACE_RUNNER_SOURCE = join(REPO, "ein-pi", "agent", "surfaces", "surface-runner.ts");
export const CLAUDE_SURFACE_RUNNER_NAME = "ein-surface-runner";
export const CLAUDE_CONTINUITY_RUNNER_NAME = "ein-continuity";
export const CLAUDE_CONTINUITY_RUNNER_SOURCE = join(REPO, "cc-ein", "continuity-runner.ts");

const log = (s: string) => console.log(DRY ? `  [dry] ${s}` : `  ${s}`);

export type ClaudeRoute = { model: string; effort?: string };
export type ClaudeParityDeferral = { status: "deferred-until-pi-acceptance"; reason: "Cleaner/Architect Claude parity begins after packaged Pi acceptance" };
export const CLAUDE_PARITY_DEFERRALS: Readonly<Record<string, ClaudeParityDeferral>> = Object.freeze({
  "ein-cleaner": { status: "deferred-until-pi-acceptance", reason: "Cleaner/Architect Claude parity begins after packaged Pi acceptance" },
  "ein-architect": { status: "deferred-until-pi-acceptance", reason: "Cleaner/Architect Claude parity begins after packaged Pi acceptance" },
});

export type ClaudeSurface = {
  coordinator: string;
  agents: Record<string, string>;
};

export type CompileOptions = {
  canonicalPath?: string;
  adapterPath?: string;
  agentsDir?: string;
  generatedPath?: string;
  routing?: Record<string, ClaudeRoute>;
  parityDeferrals?: Record<string, ClaudeParityDeferral>;
};

/** A stable, machine-readable parity failure. */
export class ParityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ParityError";
    this.code = code;
  }
}

function parity(code: string, message: string): ParityError {
  return new ParityError(code, message);
}

function normalize(text: string): string {
  return `${text.replace(/\r\n?/g, "\n").replace(/\n+$/g, "")}\n`;
}

function sourceLabel(path: string, root?: string): string {
  if (root) return relative(root, path).replaceAll("\\", "/");
  return relative(REPO, path).replaceAll("\\", "/") || basename(path);
}

function lineColumn(text: string, index: number): string {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  const lastBreak = before.lastIndexOf("\n");
  return `line ${line}, column ${index - lastBreak}`;
}

// Pi tool name -> Claude Code tool name. `find` -> Glob (búsqueda de ficheros CC).
// linear_* son tools de un MCP de Linear: se prefijan mcp__linear__ (opt-in Team).
const EXACT_TOOL_MAP: Record<string, string> = {
  read: "Read",
  grep: "Grep",
  find: "Glob",
  edit: "Edit",
  write: "Write",
  bash: "Bash",
  ein_openspec_delta_write: "Bash",
};

function translateTool(raw: string, source: string, agent: string): string {
  const exact = EXACT_TOOL_MAP[raw];
  if (exact) return exact;
  if (raw.startsWith("linear_") && raw.length > "linear_".length) {
    return `mcp__linear__${raw}`;
  }
  throw parity(
    "PARITY_UNKNOWN_TOOL",
    `source ${source}, agent ${agent}, tool ${raw}`,
  );
}

function translateTools(piTools: string, source: string, agent: string): string {
  const out: string[] = [];
  for (const raw of piTools.split(",").map((tool) => tool.trim()).filter(Boolean)) {
    const translated = translateTool(raw, source, agent);
    if (!out.includes(translated)) out.push(translated);
  }
  return out.join(", ");
}

// The adapter note deliberately contains no Pi-only marker or runtime token.
// Runtime-specific source references are translated by the scoped registries below.
const CC_NOTE = [
  "> **cc-ein (Claude Code):** corres en Claude Code, no en Pi. El flujo SDD se conduce con `cc-ein-sdd status|check|close` (por Bash). Las referencias de runtime específicas de Pi que puedan aparecer en una fuente canónica no aplican aquí; usa las herramientas y el coordinador de Claude. Sigue vigente: si te bloqueas, devuelve `status: blocked` con la causa concreta. Escribe tu artefacto de fase en `openspec/changes/<change>/`.",
  ">",
  "> `.pi/ein/` es la configuración **del proyecto**, no del runtime de Pi: los dos runtimes leen los mismos ficheros. Sus valores llegan ya resueltos en el bloque `## Project settings` que se inyecta al arrancar la sesión (`cc-ein-sdd settings` los vuelve a imprimir cuando haga falta).",
  "",
].join("\n");

const RUNTIME_TOKEN_RULES: ReadonlyArray<{
  source: string;
  token: string;
  replacement: string;
}> = [
  {
    // Antes traducía a la prosa "the OpenSpec delta writer": un nombre sin nada
    // detrás. El agente recibía la orden de usarlo Y la prohibición de escribir
    // el markdown a mano, así que un cambio con delta de comportamiento
    // empezado en Claude no podía cerrarse.
    source: "agents/sdd-scope.md",
    token: "ein_openspec_delta_write",
    replacement: "cc-ein-sdd delta",
  },
  {
    source: "agents/ein-git.md",
    token: "ein_review_forecast",
    replacement: "the review-size forecast",
  },
  {
    source: "agents/sdd-apply.md",
    token: "ein_sdd_status",
    replacement: "cc-ein-sdd status",
  },
  {
    source: "agents/sdd-apply.md",
    token: "ein_sdd_check",
    replacement: "cc-ein-sdd check",
  },
  {
    // La postura del cambio (TDD + carril) es el mismo fichero en los dos
    // runtimes; solo cambia el mando que lo lee.
    source: "agents/sdd-apply.md",
    token: "ein_sdd_preflight",
    replacement: "cc-ein-sdd preflight",
  },
];

const RUNTIME_MARKERS: Readonly<Record<string, string>> = {
  "pi-runtime": "",
  "pi-intercom": "",
  "claude-runtime": "",
};

// These are exact, boundary-aware legacy signatures from the current Pi
// inventory. They are translations, not a wildcard exemption for arbitrary
// prose. Unknown signatures remain rejected by the final residual check.
type LegacyTranslation = {
  sources: readonly string[];
  signature: string;
  replacement: string;
};

// Las rutas bajo `.pi/ein/` ya no se traducen: son configuración del proyecto,
// compartida por los dos runtimes, y reescribirlas rompía su significado.
const LEGACY_TRANSLATIONS: ReadonlyArray<LegacyTranslation> = [
  {
    sources: ["AGENTS.md", "agents/ein-git.md", "agents/ein-linear.md", "agents/sdd-verify.md"],
    signature: "pi-subagents",
    replacement: "Task delegation",
  },
  {
    sources: ["agents/sdd-apply.md", "agents/sdd-verify.md"],
    signature: "acceptance-report",
    replacement: "phase acceptance report",
  },
  { sources: ["agents/sdd-apply.md"], signature: "intercomBridge.mode", replacement: "claudeCoordinationBridge.mode" },
  { sources: ["AGENTS.md", "agents/sdd-apply.md"], signature: "contact_supervisor", replacement: "parent_coordinator_request" },
  { sources: ["AGENTS.md"], signature: "ask_user_question", replacement: "AskUserQuestion" },
  {
    sources: [
      "agents/sdd-scope.md",
      "agents/sdd-map.md",
      "agents/sdd-design.md",
      "agents/sdd-tasks.md",
      "agents/sdd-apply.md",
      "agents/sdd-verify.md",
      "agents/sdd-close.md",
    ],
    signature: "supervisor/intercom asks",
    replacement: "parent-coordinator requests",
  },
  { sources: ["agents/sdd-apply.md"], signature: "intercom bridge", replacement: "Claude coordination bridge" },
  { sources: ["agents/sdd-apply.md"], signature: "`intercom`", replacement: "`Claude coordination bridge`" },
];

function ruleApplies(rule: LegacyTranslation, source: string): boolean {
  return rule.sources.includes(source);
}

function replaceScopedLegacy(text: string, source: string): string {
  let output = text;
  const rules = LEGACY_TRANSLATIONS
    .filter((rule) => ruleApplies(rule, source))
    .sort((a, b) => b.signature.length - a.signature.length);
  for (const rule of rules) output = output.replaceAll(rule.signature, rule.replacement);
  return output;
}

function markerReplacement(id: string, source: string, text: string, index: number): string {
  if (!(id in RUNTIME_MARKERS)) {
    throw parity(
      "PARITY_UNTRANSLATED_TOKEN",
      `source ${source}, ${lineColumn(text, index)}, runtime marker ${id}`,
    );
  }
  return RUNTIME_MARKERS[id];
}

function translateRuntimeMarkers(text: string, source: string): string {
  const marker = /<!--[ \t]*ein:runtime-ref\b([^>]*)-->/g;
  return text.replace(marker, (full, attributes: string, offset: number) => {
    const id =
      attributes.match(/\bid\s*=\s*["']([^"']+)["']/)?.[1] ??
      attributes.match(/^\s*:\s*([A-Za-z0-9_-]+)/)?.[1];
    if (!id) {
      throw parity(
        "PARITY_UNTRANSLATED_TOKEN",
        `source ${source}, ${lineColumn(text, offset)}, runtime marker without registered id`,
      );
    }
    return markerReplacement(id, source, text, offset);
  });
}

function translateRuntimeTokens(text: string, source: string): string {
  const tokenPattern = /(?<![A-Za-z0-9_])ein_[A-Za-z0-9_]+(?![A-Za-z0-9_])/g;
  return text.replace(tokenPattern, (token, offset: number) => {
    const rule = RUNTIME_TOKEN_RULES.find(
      (candidate) => candidate.source === source && candidate.token === token,
    );
    if (!rule) {
      throw parity(
        "PARITY_UNTRANSLATED_TOKEN",
        `source ${source}, ${lineColumn(text, offset)}, token ${token}`,
      );
    }
    return rule.replacement;
  });
}

function assertNoUntranslated(text: string, source: string): void {
  const token = text.match(/(?<![A-Za-z0-9_])ein_[A-Za-z0-9_]+(?![A-Za-z0-9_])/);
  if (token?.index !== undefined) {
    throw parity(
      "PARITY_UNTRANSLATED_TOKEN",
      `source ${source}, ${lineColumn(text, token.index)}, token ${token[0]} remains in output`,
    );
  }
  if (/<!--[ \t]*ein:runtime-ref\b/.test(text)) {
    throw parity("PARITY_UNTRANSLATED_TOKEN", `source ${source}, unresolved runtime marker remains in output`);
  }
  // `.pi/ein/` NO está aquí a propósito: no es un token del runtime de Pi, es
  // el directorio de configuración DEL PROYECTO, y los dos runtimes leen el
  // mismo. Traducirlo (como se hacía) convertía una ruta local del proyecto en
  // una ruta de la instalación que nadie creaba ni leía.
  for (const signature of [
    "pi-subagents",
    "acceptance-report",
    "intercom",
    "supervisor",
    "completionGuard",
    "turnBudget",
  ]) {
    if (text.includes(signature)) {
      throw parity(
        "PARITY_UNTRANSLATED_TOKEN",
        `source ${source}, legacy runtime signature ${signature} remains in output`,
      );
    }
  }
}

function translateBody(body: string, source: string): string {
  const normalized = normalize(body);
  const withMarkers = translateRuntimeMarkers(normalized, source);
  const withTokens = translateRuntimeTokens(withMarkers, source);
  const translated = replaceScopedLegacy(withTokens, source);
  assertNoUntranslated(translated, source);
  return translated;
}

type ParsedAgent = {
  fields: Map<string, string>;
  body: string;
};

function parseFrontmatter(src: string, source: string): ParsedAgent {
  const normalized = normalize(src);
  if (!normalized.startsWith("---\n")) {
    throw parity("PARITY_INVALID_AGENT", `source ${source} has no frontmatter`);
  }
  const close = normalized.indexOf("\n---\n", 4);
  if (close < 0) {
    throw parity("PARITY_INVALID_AGENT", `source ${source} has unterminated frontmatter`);
  }
  const fields = new Map<string, string>();
  for (const line of normalized.slice(4, close).split("\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw parity("PARITY_INVALID_AGENT", `source ${source} has malformed frontmatter`);
    }
    fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return { fields, body: normalized.slice(close + "\n---\n".length) };
}

function routeKeySet(routing: Record<string, ClaudeRoute>): string[] {
  return Object.keys(routing).sort();
}

function validateRouting(agents: ParsedAgent[], routing: Record<string, ClaudeRoute>, deferrals: Record<string, ClaudeParityDeferral>): void {
  const names = agents.map((agent) => agent.fields.get("name") ?? "").sort();
  if (names.some((name) => !name)) {
    throw parity("PARITY_INVALID_AGENT", "an agent is missing its name");
  }
  const duplicates = names.filter((name, index) => index > 0 && names[index - 1] === name);
  if (duplicates.length) {
    throw parity("PARITY_ROUTING_STALE", `duplicate canonical agent ${duplicates[0]}`);
  }
  const routes = routeKeySet(routing);
  for (const name of names) {
    const deferral = deferrals[name];
    if (deferral) {
      if (name in routing || deferral.status !== "deferred-until-pi-acceptance" || deferral.reason !== "Cleaner/Architect Claude parity begins after packaged Pi acceptance") throw parity("PARITY_INVALID_DEFERRAL", `agent ${name}`);
      continue;
    }
    if (!(name in routing)) {
      throw parity("PARITY_ROUTING_MISSING", `agent ${name}`);
    }
    const route = routing[name];
    if (!route || typeof route.model !== "string" || !route.model.trim()) {
      throw parity("PARITY_ROUTING_MISSING", `agent ${name} has no valid model route`);
    }
  }
  for (const route of routes) {
    if (!names.includes(route)) {
      throw parity("PARITY_ROUTING_STALE", `agent ${route}`);
    }
  }
  for (const deferred of Object.keys(deferrals)) if (!names.includes(deferred)) throw parity("PARITY_INVALID_DEFERRAL", `agent ${deferred}`);
}

function translateAgent(src: string, source: string, routing: Record<string, ClaudeRoute>): string {
  const parsed = parseFrontmatter(src, source);
  const name = parsed.fields.get("name");
  if (!name) throw parity("PARITY_INVALID_AGENT", `source ${source} has no name`);
  const description = parsed.fields.get("description") ?? "";
  const tools = parsed.fields.get("tools");
  const lines = ["---", `name: ${name}`, `description: ${description}`];
  if (tools) lines.push(`tools: ${translateTools(tools, source, name)}`);
  const route = routing[name];
  if (route) {
    lines.push(`model: ${route.model}`);
    if (route.effort) lines.push(`effort: ${route.effort}`);
  }
  lines.push("---");
  return `${lines.join("\n")}\n${CC_NOTE}${translateBody(parsed.body, source)}`;
}

function boundedBlock(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from < 0 || to < from) return "";
  return text.slice(from, to + end.length);
}

function validateCoordinator(canonical: string, adapter: string): string {
  if (canonical.includes(ADAPTATION_START) || canonical.includes(ADAPTATION_END)) {
    throw parity("PARITY_INVALID_COORDINATOR", "canonical source contains Claude adaptation markers");
  }
  if (canonical.includes(HARNESS_START) || canonical.includes(HARNESS_END)) {
    throw parity("PARITY_INVALID_COORDINATOR", "canonical source owns the harness block");
  }
  if (adapter.split(ADAPTATION_START).length - 1 !== 1 || adapter.split(ADAPTATION_END).length - 1 !== 1) {
    throw parity("PARITY_INVALID_COORDINATOR", "adapter must contain exactly one adaptation boundary");
  }
  if (adapter.split(HARNESS_START).length - 1 !== 1 || adapter.split(HARNESS_END).length - 1 !== 1) {
    throw parity("PARITY_INVALID_COORDINATOR", "adapter must contain exactly one harness block");
  }
  if (adapter.indexOf(ADAPTATION_START) > adapter.indexOf(ADAPTATION_END)) {
    throw parity("PARITY_INVALID_COORDINATOR", "adapter adaptation markers are out of order");
  }
  if (adapter.indexOf(HARNESS_START) > adapter.indexOf(HARNESS_END)) {
    throw parity("PARITY_INVALID_COORDINATOR", "adapter harness markers are out of order");
  }
  // El almacén de Engram ya NO se reescribe por runtime: los dos comparten
  // cuaderno, así que la línea canónica vale tal cual para Claude.
  const translatedCanonical = translateBody(canonical, "AGENTS.md").trimEnd();
  const normalizedAdapter = translateBody(adapter, "CLAUDE.adapter.md").trimEnd();
  const output = `${PROVENANCE}\n\n${translatedCanonical}\n\n${normalizedAdapter}\n`;
  if (output.split(HARNESS_START).length - 1 !== 1 || output.split(HARNESS_END).length - 1 !== 1) {
    throw parity("PARITY_INVALID_COORDINATOR", "compiled coordinator must contain one harness block");
  }
  assertNoUntranslated(output, "cc-ein/CLAUDE.md");
  return output;
}

const DEFAULT_ROUTING: Record<string, ClaudeRoute> = {
  "sdd-scope": { model: "haiku", effort: "low" },
  "sdd-map": { model: "haiku", effort: "medium" },
  "sdd-design": { model: "opus", effort: "high" },
  "sdd-tasks": { model: "haiku", effort: "low" },
  "sdd-apply": { model: "sonnet", effort: "low" },
  "sdd-verify": { model: "haiku", effort: "medium" },
  "sdd-close": { model: "haiku", effort: "low" },
  "ein-scout": { model: "haiku" },
  "ein-git": { model: "haiku" },
  "ein-linear": { model: "haiku" },
};

/** Compile every Claude byte in memory; no filesystem promotion occurs here. */
export function compileClaudeSurface(options: CompileOptions = {}): ClaudeSurface {
  const canonicalPath = options.canonicalPath ?? join(CORE, "AGENTS.md");
  const adapterPath = options.adapterPath ?? join(CC, "CLAUDE.adapter.md");
  const agentsDir = options.agentsDir ?? join(CORE, "agents");
  const routing = options.routing ?? DEFAULT_ROUTING;
  const parityDeferrals = options.parityDeferrals ?? CLAUDE_PARITY_DEFERRALS;
  const canonical = readFileSync(canonicalPath, "utf8");
  const adapter = readFileSync(adapterPath, "utf8");
  const files = readdirSync(agentsDir)
    .filter((file) => file.endsWith(".md"))
    .sort();
  const parsedAgents = files.map((file) =>
    parseFrontmatter(readFileSync(join(agentsDir, file), "utf8"), `agents/${file}`),
  );
  validateRouting(parsedAgents, routing, parityDeferrals);
  const agents: Record<string, string> = {};
  for (const file of files) {
    const name = parsedAgents[files.indexOf(file)]!.fields.get("name")!;
    if (parityDeferrals[name]) continue;
    agents[file] = translateAgent(
      readFileSync(join(agentsDir, file), "utf8"),
      `agents/${file}`,
      routing,
    );
  }
  const coordinator = validateCoordinator(canonical, adapter);
  if (options.generatedPath) {
    assertGeneratedParity(coordinator, options.generatedPath);
  }
  return { coordinator, agents };
}

function assertGeneratedParity(coordinator: string, generatedPath: string): void {
  if (!existsSync(generatedPath)) {
    throw parity("PARITY_GENERATED_DRIFT", `generated surface ${generatedPath} is missing`);
  }
  const current = readFileSync(generatedPath, "utf8");
  if (current !== coordinator) {
    throw parity("PARITY_GENERATED_DRIFT", `generated surface ${sourceLabel(generatedPath)} differs from compiled output`);
  }
}

/** Comandos `/ein:*` que el adaptador publica, en orden estable. */
export function listClaudeCommands(): readonly string[] {
  return readdirSync(join(CC, "commands", "ein"))
    .filter((file) => file.endsWith(".md"))
    .sort();
}

export type ClaudeHookEntry = Readonly<{
  matcher?: string;
  hooks: readonly Readonly<{ type: "command"; command: string; timeout: number }>[];
}>;

/**
 * Hooks que Claude Code ejecuta. Se construye aparte del despliegue para que el
 * cableado sea verificable: que `SessionStart` inyecte los ajustes del proyecto
 * es un contrato, no una confianza — sin él Claude arranca con sus defaults y
 * un handoff cambia de estándar sin avisar.
 */
export function buildClaudeHooks(
  guardBin: string,
  continuityBin: string,
): Readonly<Record<string, readonly ClaudeHookEntry[]>> {
  const cmd = (command: string) => ({ type: "command" as const, command, timeout: 10 });
  const continuity = cmd(`"${continuityBin}" hook`);
  const mutations = "Write|Edit|Bash|Task";
  return Object.freeze({
    PreToolUse: [{ matcher: "Bash", hooks: [cmd(`"${guardBin}" guard`)] }],
    SessionStart: [
      { matcher: "startup|resume|clear|compact", hooks: [cmd(`"${guardBin}" settings --hook`)] },
    ],
    UserPromptSubmit: [{ hooks: [continuity] }],
    PostToolUse: [{ matcher: mutations, hooks: [continuity] }],
    PostToolUseFailure: [{ matcher: mutations, hooks: [continuity] }],
    Stop: [{ hooks: [continuity] }],
    PreCompact: [{ matcher: "manual|auto", hooks: [continuity] }],
    SessionEnd: [{ hooks: [continuity] }],
  });
}

export function checkGeneratedParity(options: Omit<CompileOptions, "generatedPath"> = {}): void {
  const generatedPath = join(CC, "CLAUDE.md");
  const surface = compileClaudeSurface(options);
  assertGeneratedParity(surface.coordinator, generatedPath);
}

function ensureDir(p: string) {
  if (DRY) return;
  mkdirSync(p, { recursive: true });
}

function write(dest: string, content: string) {
  if (DRY) return;
  writeFileSync(dest, content, "utf8");
}

export type SyncResult = {
  ok: boolean;
  requiredFailures: string[];
  optionalWarnings: string[];
};

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type SurfaceRunnerCompiler = (source: string, output: string) => void;

export type ClaudeSurfaceRunnerPayloadOptions = {
  destination: string;
  source?: string;
  compile?: SurfaceRunnerCompiler;
  install?: (staging: string, destination: string) => void;
};

/**
 * Single way to compile a standalone binary. stdout/stderr are captured rather
 * than discarded: swallowing them is what turned a plain "file not found" into
 * an undiagnosable failure on a user's machine.
 */
export function compileStandalone(entrypoint: string, output: string): void {
  try {
    execFileSync("bun", ["build", "--compile", entrypoint, "--outfile", output], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch (error) {
    const detail = error as { stderr?: string; stdout?: string };
    const captured = [detail.stderr, detail.stdout].filter(Boolean).join("\n").trim();
    throw new Error(captured || failureMessage(error));
  }
}

/** Compile and atomically promote the shared runner closure; stale payloads never survive failure. */
export function compileClaudeSurfaceRunnerPayload(options: ClaudeSurfaceRunnerPayloadOptions): void {
  const source = options.source ?? SURFACE_RUNNER_SOURCE;
  const staging = `${options.destination}.staging-${process.pid}`;
  const compile = options.compile ?? compileStandalone;

  mkdirSync(dirname(options.destination), { recursive: true });
  rmSync(staging, { force: true });
  rmSync(options.destination, { force: true });
  try {
    compile(source, staging);
  } catch (error) {
    rmSync(staging, { force: true });
    throw new Error(`SURFACE_RUNNER_COMPILE_FAILED: ${failureMessage(error)}`);
  }

  try {
    if (!existsSync(staging) || !statSync(staging).isFile() || statSync(staging).size === 0) {
      throw new Error("SURFACE_RUNNER_PAYLOAD_MISSING: compiler produced no runner payload");
    }
    (options.install ?? renameSync)(staging, options.destination);
  } catch (error) {
    rmSync(staging, { force: true });
    rmSync(options.destination, { force: true });
    const detail = failureMessage(error);
    if (detail.startsWith("SURFACE_RUNNER_PAYLOAD_MISSING:")) throw error;
    throw new Error(`SURFACE_RUNNER_PAYLOAD_INSTALL_FAILED: ${detail}`);
  }
}

/**
 * Run the sync as an explicit operation so the installer can trust its status.
 * Parity compilation is the first operation and only a complete valid surface
 * is promoted to the deployment tree. MCP setup remains best-effort.
 */
export function runSync(): SyncResult {
  const requiredFailures: string[] = [];
  const optionalWarnings: string[] = [];
  const claudeEngramHome = resolveEngramDataDir("claude", process.env);

  try {
    // Compile and validate all coordinator, agent, tool, runtime, and routing
    // inputs before creating or replacing any generated/deployed bytes.
    const surface = compileClaudeSurface();

    // ── 1. Estructura + credenciales compartidas ─────────────────────────────
    console.log("cc-ein sync →", DEST, DRY ? "(DRY RUN)" : "");
    ensureDir(DEST);
    ensureDir(join(DEST, "agents"));
    ensureDir(join(DEST, "commands", "ein"));

    const cred = join(MAIN, ".credentials.json");
    const credLink = join(DEST, ".credentials.json");
    if (existsSync(cred)) {
      const already = existsSync(credLink) && (() => { try { return lstatSync(credLink).isSymbolicLink(); } catch { return false; } })();
      if (!already) {
        if (!DRY) { try { rmSync(credLink, { force: true }); } catch {} symlinkSync(cred, credLink); }
        log("credenciales: symlink → ~/.claude/.credentials.json (login compartido)");
      } else log("credenciales: symlink ya presente");
    } else {
      log("⚠ ~/.claude/.credentials.json no existe: cc-ein pedirá login la 1ª vez");
    }

    // ── 2. CLAUDE.md (cerebro del parent, compilado y validado) ───────────────
    write(join(DEST, "CLAUDE.md"), surface.coordinator);
    log(`CLAUDE.md desplegado (${surface.coordinator.split("\n").length} líneas)`);

    // ── 3. settings.json + hook PreToolUse (guard) con ruta ABSOLUTA ──────────
    // Bakea la ruta real del binario para que el hook no dependa de PATH.
    const settingsObj = JSON.parse(readFileSync(join(CC, "settings.json"), "utf8")) as Record<string, unknown>;
    const guardBin = join(DEST, "bin", "cc-ein-sdd");
    const continuityBin = join(DEST, "bin", CLAUDE_CONTINUITY_RUNNER_NAME);
    settingsObj.hooks = buildClaudeHooks(guardBin, continuityBin);
    write(join(DEST, "settings.json"), `${JSON.stringify(settingsObj, null, 2)}\n`);
    // Todos los comandos, no una lista a mano: uno nuevo que nadie recuerde
    // añadir aquí no llega al usuario y el fallo es invisible.
    for (const file of listClaudeCommands()) {
      write(join(DEST, "commands", "ein", file), readFileSync(join(CC, "commands", "ein", file), "utf8"));
    }
    log(`comandos desplegados: ${listClaudeCommands().length}`);
    log("settings.json desplegado (+ hooks PreToolUse → guard, SessionStart → settings)");

    // ── 4. Agentes: traducidos desde el core canónico ─────────────────────────
    for (const file of Object.keys(surface.agents).sort()) {
      write(join(DEST, "agents", file), surface.agents[file]);
    }
    log(`agentes traducidos Pi→CC: ${Object.keys(surface.agents).length}`);

    // ── 5. Skills: copiadas del core (local + downloaded) ─────────────────────
    const skillsSrc = join(CORE, "skills");
    const skillsDest = join(DEST, "skills");
    if (!existsSync(skillsSrc)) throw new Error(`No existe el core de skills: ${skillsSrc}`);
    const skillGroups = ["local", "downloaded"] as const;
    for (const group of skillGroups) {
      if (!existsSync(join(skillsSrc, group))) throw new Error(`Falta el grupo de skills requerido: ${group}`);
    }
    if (!DRY) {
      rmSync(skillsDest, { recursive: true, force: true });
      for (const group of skillGroups) cpSync(join(skillsSrc, group), join(skillsDest), { recursive: true });
    }
    const n = skillGroups.reduce((acc, group) => {
      const p = join(skillsSrc, group);
      return acc + readdirSync(p).filter((d) => existsSync(join(p, d, "SKILL.md"))).length;
    }, 0);
    log(`skills copiadas: ~${n} (local + downloaded, aplanadas en skills/)`);

    // ── 6. CLI SDD determinista → binario standalone en bin/ ──────────────────
    // El binario reusa el core TS puro y no depende del repo tras compilar.
    const binDir = join(DEST, "bin");
    ensureDir(binDir);
    if (!DRY) {
      try {
        compileStandalone(join(CC, "sdd-cli", "cli.ts"), join(binDir, "cc-ein-sdd"));
        log("CLI SDD compilado → bin/cc-ein-sdd (standalone; status|check|close)");
      } catch (error) {
        const detail = `no se pudo compilar cc-ein-sdd: ${failureMessage(error)}`;
        requiredFailures.push(detail);
        log(`✗ ${detail}`);
      }
    } else log("CLI SDD se compilaría → bin/cc-ein-sdd");

    // ── 7. Runner compartido → binario standalone requerido ──────────────────
    // Bun follows the import closure from the canonical source, so Claude ships
    // the exact protocol and engines used by Pi rather than an adapter copy.
    if (!DRY) {
      try {
        compileClaudeSurfaceRunnerPayload({
          destination: join(binDir, CLAUDE_SURFACE_RUNNER_NAME),
        });
        log(`surface runner compilado → bin/${CLAUDE_SURFACE_RUNNER_NAME}`);
      } catch (error) {
        const detail = `no se pudo desplegar el surface runner: ${failureMessage(error)}`;
        requiredFailures.push(detail);
        log(`✗ ${detail}`);
      }
    } else log(`surface runner se compilaría → bin/${CLAUDE_SURFACE_RUNNER_NAME}`);

    if (!DRY) {
      try {
        compileClaudeSurfaceRunnerPayload({ source: CLAUDE_CONTINUITY_RUNNER_SOURCE, destination: continuityBin });
        log(`continuity runner compilado → bin/${CLAUDE_CONTINUITY_RUNNER_NAME}`);
      } catch (error) {
        const detail = `no se pudo desplegar continuity runner: ${failureMessage(error)}`;
        requiredFailures.push(detail); log(`✗ ${detail}`);
      }
    } else log(`continuity runner se compilaría → bin/${CLAUDE_CONTINUITY_RUNNER_NAME}`);
  } catch (error) {
    requiredFailures.push(failureMessage(error));
    console.error(`✗ fallo de sincronización requerida: ${failureMessage(error)}`);
  }

  if (requiredFailures.length > 0) {
    console.error(`✗ cc-ein sync incompleto (${requiredFailures.length} operación(es) requerida(s) fallaron).`);
    return { ok: false, requiredFailures, optionalWarnings };
  }

  // ── 8. MCP: Context7 (docs on-demand) + Engram (memoria, si está) ──────────
  // Son integraciones opcionales: su disponibilidad nunca oculta un sync core
  // correcto ni convierte una instalación utilizable en un fallo.
  function mcpUser(name: string, argv: string[], env: Record<string, string> = {}): void {
    if (DRY) { log(`MCP se configuraría (scope user): ${name}`); return; }
    const base = { ...process.env, CLAUDE_CONFIG_DIR: DEST };
    try { execFileSync("claude", ["mcp", "remove", "-s", "user", name], { env: base, stdio: "ignore" }); } catch { /* no existía */ }
    const envFlags = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
    try {
      execFileSync("claude", ["mcp", "add", "-s", "user", name, ...envFlags, "--", ...argv], { env: base, stdio: "ignore" });
      log(`MCP configurado (scope user): ${name}`);
    } catch (error) {
      const warning = `MCP ${name} no configurado: ${failureMessage(error)}`;
      optionalWarnings.push(warning);
      log(`⚠ ${warning}`);
    }
  }

  mcpUser("context7", ["bunx", "--bun", "@upstash/context7-mcp"]);

  // Engram es opcional: solo si el binario está en el sistema.
  let engramBin = "";
  try { engramBin = execFileSync("which", ["engram"], { encoding: "utf8" }).trim(); } catch { /* no está */ }
  if (engramBin && claudeEngramHome) {
    mcpUser("engram", [engramBin, "mcp", "--tools=agent"], { ENGRAM_DATA_DIR: claudeEngramHome });
  } else {
    log(engramBin ? "HOME inválido: memoria opcional omitida" : "engram no encontrado en PATH: memoria opcional omitida");
  }

  console.log("cc-ein sync core listo. Lanza con: cc-ein");
  return { ok: true, requiredFailures, optionalWarnings };
}

if (import.meta.main) {
  const result = runSync();
  if (!result.ok) process.exitCode = 1;
}
