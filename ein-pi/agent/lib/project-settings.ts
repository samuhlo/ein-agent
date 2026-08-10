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
import type { Setting } from "./terminal-app.ts";

export type SettingDefinition = Readonly<{
  id: string;
  label: string;
  options: readonly string[];
  read: (cwd: string) => string;
  write: (cwd: string, value: string) => void;
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

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = Object.freeze([
  {
    id: "mode",
    label: "Work mode",
    options: EIN_MODES,
    read: (cwd) => readMode(cwd),
    write: (cwd, value) => {
      const mode = accepted(EIN_MODES, value);
      if (mode) writeMode(cwd, mode);
    },
  },
  {
    id: "tdd",
    label: "Strict TDD",
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
    options: HYPA_MODES,
    read: (cwd) => readHypaMode(cwd),
    write: (cwd, value) => {
      const mode = accepted(HYPA_MODES, value);
      if (mode) writeHypaMode(cwd, mode);
    },
  },
  {
    id: "codegraph",
    label: "CodeGraph",
    options: CODEGRAPH_MODES,
    read: (cwd) => readCodegraphMode(cwd),
    write: (cwd, value) => {
      const mode = accepted(CODEGRAPH_MODES, value);
      if (mode) writeCodegraphMode(cwd, mode);
    },
  },
  {
    id: "persona",
    label: "Persona",
    options: PERSONA_MODES,
    read: (cwd) => readPersonaMode(cwd),
    write: (cwd, value) => {
      const mode = accepted(PERSONA_MODES, value);
      if (mode) writePersonaMode(cwd, mode);
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
