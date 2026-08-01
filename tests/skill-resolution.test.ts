import { describe, expect, test } from "bun:test";
import {
  extractTriggers,
  resolveSkills,
  type SkillEntry,
} from "../ein-pi/agent/extensions/ein-skill-registry";

// Build a realistic entry: triggers come from the DECLARED description, exactly
// like parseSkill does in production. Stack tags are a coarse tie-breaker, set
// by hand here since inferStackTags is internal.
function entry(key: string, description: string, stackTags: string[] = []): SkillEntry {
  return {
    key,
    name: key,
    source: "local",
    scope: "user",
    path: `/fake/${key}/SKILL.md`,
    description,
    stackTags,
    triggers: extractTriggers(description),
  };
}

const ARCHITECTURE = entry(
  "architecture",
  "Samuhlo's judgment for software architecture and refactors in TypeScript/Vue/Nuxt: Screaming Architecture. Trigger: refactor, architecture or design decisions, structuring a project, choosing a pattern.",
  ["node", "frontend"],
);
const OMARCHY = entry(
  "omarchy",
  "REQUIRED for end-user customization of a Linux desktop. Triggers: Hyprland, waybar, keybindings, monitors, wallpaper.",
);
const HONO = entry(
  "hono",
  "Use when building Hono web applications or when the user asks about routing and middleware.",
  ["node"],
);

describe("extractTriggers — declared intent, not a file scan", () => {
  test("uses the explicit Trigger: clause and ignores stack words before it", () => {
    const triggers = extractTriggers(ARCHITECTURE.description);
    expect(triggers).toContain("refactor");
    expect(triggers).toContain("architecture");
    expect(triggers).toContain("design");
    // The bug we fixed: nuxt/vue/react appear in the prose but are NOT the
    // declared trigger, so they must not become triggers.
    expect(triggers).not.toContain("nuxt");
    expect(triggers).not.toContain("vue");
    expect(triggers).not.toContain("react");
  });

  test("falls back to a 'Use when …' clause when no Trigger: is declared", () => {
    const triggers = extractTriggers(HONO.description);
    expect(triggers).toContain("hono");
  });

  test("drops generic stopwords", () => {
    expect(extractTriggers("Use when building a web app for the user")).not.toContain("web");
  });
});

describe("resolveSkills — precise routing", () => {
  const registry = [ARCHITECTURE, OMARCHY, HONO];

  test("a refactor task surfaces architecture and never the Linux-desktop skill", () => {
    const resolved = resolveSkills(registry, "Refactor the architecture of the payments module");
    const keys = resolved.map((s) => s.key);
    expect(keys[0]).toBe("architecture");
    expect(keys).not.toContain("omarchy");
  });

  test("an unrelated web task does not drag in omarchy", () => {
    const resolved = resolveSkills(registry, "Add a Hono route for the login endpoint");
    const keys = resolved.map((s) => s.key);
    expect(keys).toContain("hono");
    expect(keys).not.toContain("omarchy");
  });

  test("skills with zero signal score out entirely", () => {
    const resolved = resolveSkills(registry, "Water the office plants");
    expect(resolved).toHaveLength(0);
  });
});
