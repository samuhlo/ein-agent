// =============================================================================
// PROJECT SETTINGS CATALOGUE
// The settings `ein init` writes, made readable and changeable from the app.
// Each one delegates to the module that already owns it, so the app never
// becomes a second source of truth for a value that already has one.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SETTING_DEFINITIONS,
  applySetting,
  readSettings,
  settingLabelFor,
} from "../ein-pi/agent/lib/project-settings.ts";

let cwd = "";
let config = "";
const touched = ["XDG_CONFIG_HOME", "LANG", "LC_ALL"] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of touched) saved.set(key, process.env[key]);
  cwd = mkdtempSync(join(tmpdir(), "ein-settings-project-"));
  config = mkdtempSync(join(tmpdir(), "ein-settings-config-"));
  process.env.XDG_CONFIG_HOME = config;
  delete process.env.LANG;
  delete process.env.LC_ALL;
});

afterEach(() => {
  for (const key of touched) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(cwd, { recursive: true, force: true });
  rmSync(config, { recursive: true, force: true });
});

function valueOf(id: string): string | undefined {
  return readSettings(cwd).find((setting) => setting.id === id)?.value;
}

describe("the catalogue covers what init configures", () => {
  test("every setting init writes is present", () => {
    const ids = SETTING_DEFINITIONS.map((definition) => definition.id).sort();
    expect(ids).toEqual(["chat-lang", "codegraph", "hypa", "lang", "mode", "persona", "tdd"]);
  });

  test("every setting declares at least two values to cycle between", () => {
    for (const definition of SETTING_DEFINITIONS) {
      expect(definition.options.length).toBeGreaterThan(1);
    }
  });

  test("every declared value has a human label", () => {
    for (const definition of SETTING_DEFINITIONS) {
      for (const option of definition.options) {
        expect(settingLabelFor(definition.id, option)).toBeTruthy();
      }
    }
  });
});

describe("the agent's own language", () => {
  test("it reads the shared locale", () => {
    expect(valueOf("chat-lang")).toBe("es");
  });

  test("changing it writes the file the locale is read from", () => {
    expect(applySetting(cwd, "chat-lang", "en")).toBe(true);
    expect(valueOf("chat-lang")).toBe("en");
    const written = JSON.parse(readFileSync(join(config, "rpiv-i18n", "locale.json"), "utf8"));
    expect(written).toEqual({ locale: "en" });
  });

  test("an undeclared language is refused", () => {
    expect(applySetting(cwd, "chat-lang", "fr")).toBe(false);
    expect(existsSync(join(config, "rpiv-i18n", "locale.json"))).toBe(false);
  });
});

describe("the artifact language", () => {
  test("with no override it declares that it inherits", () => {
    expect(valueOf("lang")).toBe("auto");
  });

  test("an explicit override is read back", () => {
    expect(applySetting(cwd, "lang", "en")).toBe(true);
    expect(valueOf("lang")).toBe("en");
  });

  test("going back to auto clears the override instead of freezing today's value", () => {
    applySetting(cwd, "lang", "en");
    expect(applySetting(cwd, "lang", "auto")).toBe(true);
    expect(valueOf("lang")).toBe("auto");
    expect(JSON.parse(readFileSync(join(cwd, ".pi", "ein", "lang.json"), "utf8"))).toEqual({});
  });
});

describe("writing through the owner", () => {
  test("a declared value reaches its owner's file", () => {
    expect(applySetting(cwd, "mode", "team")).toBe(true);
    expect(JSON.parse(readFileSync(join(cwd, ".pi", "ein", "mode.json"), "utf8"))).toEqual({ mode: "team" });
  });

  test("an unknown id is refused", () => {
    expect(applySetting(cwd, "not-a-setting", "team")).toBe(false);
  });

  test("a value outside the declared options is refused", () => {
    expect(applySetting(cwd, "mode", "duo")).toBe(false);
  });

  test("a write that throws is refused, not propagated", () => {
    const exploding = [{
      id: "boom",
      label: "Boom",
      options: ["a", "b"],
      read: () => "a",
      write: () => { throw new Error("read-only checkout"); },
    }];
    expect(applySetting(cwd, "boom", "b", exploding)).toBe(false);
  });

  test("an unreadable setting is reported unknown, never defaulted", () => {
    const exploding = [{
      id: "boom",
      label: "Boom",
      options: ["a", "b"],
      read: () => { throw new Error("nope"); },
      write: () => undefined,
    }];
    expect(readSettings(cwd, exploding)[0]?.value).toBeUndefined();
  });
});
