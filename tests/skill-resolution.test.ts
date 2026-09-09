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
  test("dot-prefixed paths do not leave only a generic verb as the trigger", () => {
    const vue = entry("vue", "Use when editing .vue files, creating Vue 3 components, writing composables, or testing Vue code - provides patterns");
    const vueuse = entry("vueuse", "Apply VueUse composables where appropriate to build concise, maintainable Vue.js / Nuxt features.");
    expect(extractTriggers(vue.description)).toContain("vue");
    expect(resolveSkills([vue, vueuse], "Apply the planned TypeScript change, editing source.ts and testing source.test.ts")).toEqual([]);
    expect(resolveSkills([vue], "Edit app/components/Card.vue")).toEqual([vue]);
    expect(resolveSkills([vueuse], "Use VueUse for the watcher")).toEqual([vueuse]);
  });
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

  test("stack and workflow tags only rank skills with a relevant signal", () => {
    const workflow = entry("linear-workflow", "Trigger: Linear tickets", ["workflow"]);
    expect(resolveSkills([...registry, workflow], "Verify the Nuxt settings", "frontend")).toEqual([]);
    expect(resolveSkills([workflow], "Update Linear tickets")).toEqual([workflow]);
  });

  test("control identifiers and substrings do not request a framework skill", () => {
    const next = entry("next", "Trigger: Next applications", ["frontend"]);
    const react = entry("react", "Trigger: React components", ["frontend"]);
    expect(resolveSkills([next, react], "Nuxt reactive state; next_recommended: close")).toEqual([]);
    expect(resolveSkills([next], "Verify Next.js route", "frontend")).toEqual([next]);
    expect(resolveSkills([react], "Verify React component")).toEqual([react]);
  });
});

// Pi passes the session context fifth; discovery must not fall back to the
// process cwd when a delegated session belongs to another project.
test("native skill tools return readable paths from the actual session project", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { default: registerSkills } = await import("../ein-pi/agent/extensions/ein-skill-registry.ts");
  const cwd = mkdtempSync(join(tmpdir(), "ein-skill-session-"));
  try {
    const path = join(cwd, ".pi", "skills", "fixture-local-accessibility", "SKILL.md");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "---\nname: fixture-local-accessibility\ndescription: Trigger: fixture-local-accessibility. Check focus order.\n---\nUse actual keyboard navigation.\n");
    const tools = new Map<string, any>();
    registerSkills({ registerTool(tool: any) { tools.set(tool.name, tool); }, registerCommand() {} } as any);
    for (const name of ["ein_skill_registry", "ein_skill_resolve", "ein_skill_digest"]) {
      const result = await tools.get(name).execute("call", {
        query: "fixture-local-accessibility", task: "fixture-local-accessibility", limit: 1,
      }, new AbortController().signal, undefined, { cwd });
      const text = result.content.map((part: any) => part.text ?? "").join("\n");
      expect(text).toContain(path);
      if (name !== "ein_skill_digest") expect(text).toContain("Check focus order");
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
