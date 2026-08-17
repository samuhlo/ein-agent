// =============================================================================
// PROJECT SETTINGS CATALOGUE
// One entry per setting the terminal app can show and cycle. Each delegates to
// the reader/writer that already owns the setting, so the app never becomes a
// second source of truth — EIN.md stays project context, not configuration.
// =============================================================================

import { readMode, writeMode, type EinMode } from "./mode.ts";
import { readTddMode, writeTddMode, type TddMode } from "./tdd.ts";
import { readHypaMode, writeHypaMode, type HypaMode } from "./hypa.ts";
import { readCodegraphMode, writeCodegraphMode, type CodegraphMode } from "./codegraph.ts";
import { readPersonaMode, writePersonaMode, type PersonaMode } from "./persona.ts";
import {
  readAgentActivationProfile,
  writeAgentActivationProfile,
  type AgentActivationProfile,
} from "./agent-controls.ts";
import {
  ACTIVE_LANGS,
  applyChatLang,
  pick,
  readArtifactOverride,
  readChatLang,
  writeArtifactLang,
  type Lang,
} from "./lang.ts";
import type { Setting } from "./terminal-app.ts";

export type SettingDefinition = Readonly<{
  id: string;
  label: string;
  options: readonly string[];
  read: (cwd: string) => string;
  write: (cwd: string, value: string) => void;
  /** One line on what the setting decides, shown next to it in the app. */
  hint?: string;
}>;

/** Narrows an incoming value against the declared options; refuses anything else. */
function accepted<T extends string>(options: readonly T[], value: string): T | undefined {
  return options.find((option) => option === value);
}

const EIN_MODES: readonly EinMode[] = ["solo", "team"];
const TDD_MODES: readonly TddMode[] = ["auto", "strict", "ask", "off"];
const HYPA_MODES: readonly HypaMode[] = ["auto", "on", "off"];
const CODEGRAPH_MODES: readonly CodegraphMode[] = ["auto", "off"];
const PERSONA_MODES: readonly PersonaMode[] = ["samuhlo", "neutral"];
// Solo los tres perfiles soportados son elegibles. La lectura puede devolver
// `custom` (una combinación fuera de ellos) o `invalid` (sin configurar): son
// estados honestos que se muestran, no valores a los que se pueda ciclar.
const AGENT_PROFILES: readonly AgentActivationProfile[] = ["balanced", "thorough", "manual"];
/** `auto` is the absence of an override, which is a real state, not a default. */
const ARTIFACT_LANGS: readonly string[] = ["auto", ...ACTIVE_LANGS];

/**
 * Human names per value. The stored value stays the canonical token — this is
 * presentation only, so the file on disk never depends on the interface
 * language.
 */
const VALUE_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  mode: { solo: "individual", team: "equipo" },
  tdd: { auto: "auto", strict: "estricto", ask: "preguntar", off: "off" },
  hypa: { auto: "auto", on: "on", off: "off" },
  codegraph: { auto: "auto", off: "off" },
  persona: { samuhlo: "samuhlo", neutral: "neutral" },
  agents: {
    balanced: "equilibrado (Cleaner)",
    thorough: "exhaustivo (Cleaner + Architect)",
    manual: "manual (ninguno)",
    custom: "personalizado",
    invalid: "sin configurar",
  },
  "chat-lang": { es: "Español", en: "English", gl: "Galego" },
  lang: { auto: "hereda del chat", es: "Español", en: "English", gl: "Galego" },
};

/** Presentation name of one value; falls back to the token itself. */
export function settingLabelFor(settingId: string, value: string): string {
  return VALUE_LABELS[settingId]?.[value] ?? value;
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = Object.freeze([
  {
    id: "mode",
    label: pick("Modo de trabajo", "Work mode"),
    hint: pick("equipo activa Linear como board", "team turns Linear into the board"),
    options: EIN_MODES,
    read: (cwd) => readMode(cwd),
    write: (cwd, value) => {
      const mode = accepted(EIN_MODES, value);
      if (mode) writeMode(cwd, mode);
    },
  },
  {
    id: "chat-lang",
    label: pick("Idioma del agente", "Agent language"),
    hint: pick("compartido con todos los proyectos", "shared across every project"),
    options: ACTIVE_LANGS,
    // Global, not per project: the shared locale is one dial for the whole
    // machine, so cwd is deliberately unused here.
    read: () => readChatLang(),
    write: (_cwd, value) => {
      const lang = accepted(ACTIVE_LANGS, value as Lang);
      // A refused disk write must surface as a refusal, not as a silent no-op.
      if (lang && !applyChatLang(lang)) throw new Error("locale write failed");
    },
  },
  {
    id: "lang",
    label: pick("Idioma de PR y commits", "PR and commit language"),
    hint: pick("de este proyecto", "for this project"),
    options: ARTIFACT_LANGS,
    read: (cwd) => readArtifactOverride(cwd) ?? "auto",
    write: (cwd, value) => {
      if (value === "auto") {
        writeArtifactLang(cwd, null);
        return;
      }
      const lang = accepted(ACTIVE_LANGS, value as Lang);
      if (lang) writeArtifactLang(cwd, lang);
    },
  },
  {
    id: "persona",
    label: "Persona",
    hint: pick("tono y voz del agente", "the agent's tone and voice"),
    options: PERSONA_MODES,
    read: (cwd) => readPersonaMode(cwd),
    write: (cwd, value) => {
      const mode = accepted(PERSONA_MODES, value);
      if (mode) writePersonaMode(cwd, mode);
    },
  },
  {
    id: "tdd",
    label: pick("TDD estricto", "Strict TDD"),
    hint: pick("exige test en rojo antes de implementar", "demands a red test before code"),
    options: TDD_MODES,
    read: (cwd) => readTddMode(cwd),
    write: (cwd, value) => {
      const mode = accepted(TDD_MODES, value);
      if (mode) writeTddMode(cwd, mode);
    },
  },
  {
    id: "hypa",
    label: "Hypa",
    hint: pick("compresión de contexto", "context compression"),
    options: HYPA_MODES,
    read: (cwd) => readHypaMode(cwd),
    write: (cwd, value) => {
      const mode = accepted(HYPA_MODES, value);
      if (mode) writeHypaMode(cwd, mode);
    },
  },
  {
    id: "agents",
    label: pick("Participación automática", "Automatic participation"),
    hint: pick("Cleaner/Architect tras el apply", "Cleaner/Architect after apply"),
    options: AGENT_PROFILES,
    read: (cwd) => readAgentActivationProfile(cwd),
    write: (cwd, value) => {
      const profile = accepted(AGENT_PROFILES, value);
      if (profile) writeAgentActivationProfile(cwd, profile);
    },
  },
  {
    id: "codegraph",
    label: "CodeGraph",
    hint: pick("grafo de código preindexado", "pre-indexed code graph"),
    options: CODEGRAPH_MODES,
    read: (cwd) => readCodegraphMode(cwd),
    write: (cwd, value) => {
      const mode = accepted(CODEGRAPH_MODES, value);
      if (mode) writeCodegraphMode(cwd, mode);
    },
  },
]);

/** Reads every setting; one that throws is reported unknown, never guessed. */
export function readSettings(cwd: string, definitions = SETTING_DEFINITIONS): readonly Setting[] {
  return Object.freeze(definitions.map((definition) => {
    let value: string | undefined;
    try {
      value = definition.read(cwd);
    } catch {
      value = undefined;
    }
    return Object.freeze({
      id: definition.id,
      label: definition.label,
      options: definition.options,
      value,
      ...(definition.hint ? { hint: definition.hint } : {}),
      ...(VALUE_LABELS[definition.id] ? { labels: VALUE_LABELS[definition.id] } : {}),
    });
  }));
}

/**
 * Applies one change through its owner. Unknown ids and undeclared values are
 * refused, and a write that throws — read-only checkout, permissions — reports
 * failure instead of taking down the app.
 */
export function applySetting(
  cwd: string,
  settingId: string,
  value: string,
  definitions = SETTING_DEFINITIONS,
): boolean {
  const definition = definitions.find((item) => item.id === settingId);
  if (!definition || !definition.options.includes(value)) return false;
  try {
    definition.write(cwd, value);
  } catch {
    return false;
  }
  return true;
}
