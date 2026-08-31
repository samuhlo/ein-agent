// =============================================================================
// TESTS: contrato de adaptación del coordinador Claude.
// La fuente canónica y la adaptación son entradas; CLAUDE.md es su proyección.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLAUDE_PARITY_DEFERRALS, checkGeneratedParity, compileClaudeSurface } from "../ein-cc/sync.ts";

const ROOT = join(import.meta.dir, "..");
const CANONICAL_PATH = join(ROOT, "runtime", "AGENTS.md");
const ADAPTER_PATH = join(ROOT, "ein-cc", "CLAUDE.adapter.md");
const GENERATED_PATH = join(ROOT, "ein-cc", "CLAUDE.md");

function readIfPresent(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function count(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function boundedBlock(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from < 0 || to < from) return "";
  return text.slice(from, to + end.length);
}

function frontmatterField(text: string, field: string): string {
  const match = text.match(new RegExp(`^${field}: (.+)$`, "m"));
  return match?.[1] ?? "";
}

function expectedClaudeTool(raw: string): string {
  const exact: Record<string, string> = {
    read: "Read",
    grep: "Grep",
    find: "Glob",
    edit: "Edit",
    write: "Write",
    bash: "Bash",
    ein_openspec_delta_write: "Bash",
  };
  return exact[raw] ?? (raw.startsWith("linear_") ? `mcp__linear__${raw}` : "");
}

describe("core parity: Claude coordinator contract", () => {
  const canonical = readIfPresent(CANONICAL_PATH);
  const adapter = readIfPresent(ADAPTER_PATH);
  const generated = readIfPresent(GENERATED_PATH);

  test("declares the explicit adaptation source and boundary", () => {
    expect(existsSync(ADAPTER_PATH)).toBe(true);
    expect(count(adapter, "<!-- ein:claude-adaptation:start -->")).toBe(1);
    expect(count(adapter, "<!-- ein:claude-adaptation:end -->")).toBe(1);
    expect(adapter.indexOf("<!-- ein:claude-adaptation:start -->")).toBeLessThan(
      adapter.indexOf("<!-- ein:claude-adaptation:end -->"),
    );
    expect(adapter).toContain("Claude Code");
    expect(adapter).toContain("ein-cc-sdd");
    expect(adapter).toMatch(/`Task` tool/);
    expect(adapter).toContain("CLAUDE_CONFIG_DIR");
  });

  test("keeps shared coordinator policy out of the Claude adaptation", () => {
    for (const heading of [
      "# Ein Pi Workbench",
      "## Core Rules",
      "## Automatic intent preflight",
      "## Linear (optional integration)",
      "## GitHub",
      "## Delivery Gate (deterministic)",
      "## Pi Notes",
      "## Output",
    ]) {
      expect(adapter).not.toContain(heading);
      expect(canonical).toContain(heading);
      expect(generated).toContain(heading);
    }
  });

  test("publishes one automatic intent preflight without reviving the human-only channel", () => {
    expect(canonical).toContain("modifies or may modify code, configuration, or persistent data");
    expect(canonical).toContain("at most one third question");
    expect(canonical).toContain("explicit final confirmation");
    expect(canonical).toContain("one plain-language restatement line");
    expect(canonical).toContain("declared lane remains authoritative");
    expect(canonical).toContain("existing SDD router");
    expect(canonical).toContain("must never invoke `/ein:intent`");

    expect(adapter).toContain("Invoke the automatic intent preflight exactly once");
    expect(adapter).toContain("adopt a resolution already stored in `preflight.json`");
    expect(adapter).not.toContain("Pi asks two questions before working a change");
    expect(adapter).not.toMatch(/ask them, and only once per change/i);

    expect(count(generated, "## Automatic intent preflight")).toBe(1);
    expect(count(generated, "Invoke the automatic intent preflight exactly once")).toBe(1);
    expect(generated).not.toContain("Pi asks two questions before working a change");
  });

  test("publishes generated provenance and preserves one ordered harness block", () => {
    const harnessStart = "<!-- ein:harness-discipline:start -->";
    const harnessEnd = "<!-- ein:harness-discipline:end -->";
    const adaptationStart = "<!-- ein:claude-adaptation:start -->";
    const adaptationEnd = "<!-- ein:claude-adaptation:end -->";

    expect(generated.split("\n", 1)[0]).toBe(
      "<!-- GENERATED: source=runtime/AGENTS.md adapter=ein-cc/CLAUDE.adapter.md; DO NOT EDIT -->",
    );
    expect(count(generated, adaptationStart)).toBe(1);
    expect(count(generated, adaptationEnd)).toBe(1);
    expect(count(adapter, harnessStart)).toBe(1);
    expect(count(adapter, harnessEnd)).toBe(1);
    expect(count(generated, harnessStart)).toBe(1);
    expect(count(generated, harnessEnd)).toBe(1);
    expect(boundedBlock(adapter, harnessStart, harnessEnd)).not.toBe("");
    expect(boundedBlock(generated, harnessStart, harnessEnd)).toBe(
      boundedBlock(adapter, harnessStart, harnessEnd),
    );
    expect(generated).toContain("ein-cc-sdd");
    expect(generated).toContain("Claude Code");
  });

  test("compiles the canonical coordinator and agent inventory with supported translations", () => {
    const surface = compileClaudeSurface();
    expect(surface.coordinator).toBe(generated);
    expect(surface.agents["ein-scout.md"]).toContain("tools: Read, Grep, Glob");
    expect(surface.agents["ein-linear.md"]).toContain("mcp__linear__linear_get_issue");
    expect(surface.agents["sdd-apply.md"]).toContain("ein-cc-sdd status");
    expect(surface.agents["sdd-apply.md"]).not.toContain("ein_sdd_status");
  });

  test("reserva Opus para decidir y usa modelos menores para ejecutar la rutina", () => {
    const surface = compileClaudeSurface();
    const route = (agent: string) => ({
      model: frontmatterField(surface.agents[`${agent}.md`], "model"),
      effort: frontmatterField(surface.agents[`${agent}.md`], "effort"),
    });

    for (const agent of ["sdd-scope", "sdd-design", "sdd-tasks"]) {
      expect(route(agent)).toEqual({ model: "opus", effort: "high" });
    }
    expect(route("sdd-map")).toEqual({ model: "haiku", effort: "medium" });
    expect(route("sdd-apply")).toEqual({ model: "sonnet", effort: "low" });
    expect(route("sdd-verify")).toEqual({ model: "haiku", effort: "medium" });
    expect(route("sdd-close")).toEqual({ model: "haiku", effort: "low" });

    const settings = JSON.parse(readFileSync(join(ROOT, "ein-cc", "settings.json"), "utf8")) as {
      model?: string;
      effortLevel?: string;
    };
    expect(settings).toMatchObject({ model: "opus", effortLevel: "high" });
  });

  test("translates every canonical tool through its exact Claude identity", () => {
    const surface = compileClaudeSurface();
    const files = Object.keys(surface.agents).sort();
    expect(files).toEqual([
      "ein-git.md",
      "ein-linear.md",
      "ein-scout.md",
      "sdd-apply.md",
      "sdd-close.md",
      "sdd-design.md",
      "sdd-map.md",
      "sdd-scope.md",
      "sdd-tasks.md",
      "sdd-verify.md",
    ]);

    for (const file of files) {
      const source = readFileSync(join(ROOT, "runtime", "agents", file), "utf8");
      const rawTools = frontmatterField(source, "tools")
        .split(",")
        .map((tool) => tool.trim())
        .filter(Boolean);
      const expected = [...new Set(rawTools.map(expectedClaudeTool))].join(", ");
      expect(expected, `${file} has an unregistered fixture tool`).not.toBe("");
      expect(frontmatterField(surface.agents[file], "tools"), file).toBe(expected);
      expect(surface.agents[file]).not.toContain("completionGuard:");
      expect(surface.agents[file]).not.toContain("turnBudget:");
    }

    expect(frontmatterField(surface.agents["sdd-scope.md"], "tools")).toBe(
      "Read, Grep, Glob, Write, Bash",
    );
  });

  test("defers exactly Cleaner and Architect until packaged Pi acceptance", () => {
    expect(CLAUDE_PARITY_DEFERRALS).toEqual({
      "ein-cleaner": { status: "deferred-until-pi-acceptance", reason: "Cleaner/Architect Claude parity begins after packaged Pi acceptance" },
      "ein-architect": { status: "deferred-until-pi-acceptance", reason: "Cleaner/Architect Claude parity begins after packaged Pi acceptance" },
    });
    expect(Object.keys(compileClaudeSurface().agents)).not.toContain("ein-cleaner.md");
    expect(() => compileClaudeSurface({ parityDeferrals: {} })).toThrow(/PARITY_ROUTING_MISSING.*ein-architect/);
  });

  test("preserves Claude adapter content in a compiled fixture boundary", () => {
    const fixture = mkdtempSync(join(tmpdir(), "core-parity-coordinator-"));
    try {
      const canonicalPath = join(fixture, "AGENTS.md");
      const adapterPath = join(fixture, "CLAUDE.adapter.md");
      const adapterMarker = "Fixture Claude adaptation: `Task`, `ein-cc-sdd sync`, and `CLAUDE_CONFIG_DIR`.";
      writeFileSync(canonicalPath, `${canonical}\nFixture canonical policy.\n`);
      writeFileSync(
        adapterPath,
        readFileSync(ADAPTER_PATH, "utf8").replace(
          "<!-- ein:claude-adaptation:end -->",
          `${adapterMarker}\n<!-- ein:claude-adaptation:end -->`,
        ),
      );

      const surface = compileClaudeSurface({ canonicalPath, adapterPath });
      expect(surface.coordinator.startsWith(
        "<!-- GENERATED: source=runtime/AGENTS.md adapter=ein-cc/CLAUDE.adapter.md; DO NOT EDIT -->\n",
      )).toBe(true);
      expect(surface.coordinator).toContain("Fixture canonical policy.");
      expect(surface.coordinator).toContain(adapterMarker);
      expect(count(surface.coordinator, "<!-- ein:claude-adaptation:start -->")).toBe(1);
      expect(count(surface.coordinator, "<!-- ein:claude-adaptation:end -->")).toBe(1);
      expect(boundedBlock(surface.coordinator, "<!-- ein:harness-discipline:start -->", "<!-- ein:harness-discipline:end -->")).toBe(
        boundedBlock(adapter, "<!-- ein:harness-discipline:start -->", "<!-- ein:harness-discipline:end -->"),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("rejects unknown tools before returning a promotable surface", () => {
    const fixture = mkdtempSync(join(tmpdir(), "core-parity-"));
    try {
      const agents = join(fixture, "agents");
      const generatedFixture = join(fixture, "CLAUDE.md");
      cpSync(join(ROOT, "runtime", "agents"), agents, { recursive: true });
      writeFileSync(generatedFixture, generated);
      const scout = join(agents, "ein-scout.md");
      writeFileSync(scout, readFileSync(scout, "utf8").replace("tools: read, grep, find", "tools: read, ein_unknown_tool, find"));
      const previous = readFileSync(generatedFixture, "utf8");

      expect(() => compileClaudeSurface({ agentsDir: agents, generatedPath: generatedFixture })).toThrow(/PARITY_UNKNOWN_TOOL/);
      expect(() => compileClaudeSurface({ agentsDir: agents, generatedPath: generatedFixture })).toThrow(/ein-scout.*ein_unknown_tool/);
      expect(readFileSync(generatedFixture, "utf8")).toBe(previous);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("rejects untranslated runtime identifiers with source location", () => {
    const fixture = mkdtempSync(join(tmpdir(), "core-parity-"));
    try {
      const agents = join(fixture, "agents");
      cpSync(join(ROOT, "runtime", "agents"), agents, { recursive: true });
      const apply = join(agents, "sdd-apply.md");
      writeFileSync(apply, `${readFileSync(apply, "utf8")}\nUnknown runtime: ein_unknown_runtime\n`);

      expect(() => compileClaudeSurface({ agentsDir: agents })).toThrow(
        /PARITY_UNTRANSLATED_TOKEN.*sdd-apply\.md.*line.*column/,
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("detects canonical source drift and generated output drift", () => {
    const fixture = mkdtempSync(join(tmpdir(), "core-parity-"));
    try {
      const canonical = join(fixture, "AGENTS.md");
      const generatedFixture = join(fixture, "CLAUDE.md");
      writeFileSync(canonical, `${readFileSync(CANONICAL_PATH, "utf8")}\nSource drift\n`);
      writeFileSync(generatedFixture, generated);
      const surface = compileClaudeSurface({ canonicalPath: canonical });
      const repeated = compileClaudeSurface({ canonicalPath: canonical });
      expect(surface.coordinator).not.toBe(generated);
      expect(surface.coordinator).toBe(repeated.coordinator);
      const drifted = `${generated}\n`;
      writeFileSync(generatedFixture, drifted);
      expect(() => compileClaudeSurface({ generatedPath: generatedFixture })).toThrow(
        /PARITY_GENERATED_DRIFT/,
      );
      expect(readFileSync(generatedFixture, "utf8")).toBe(drifted);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
    expect(() => compileClaudeSurface({ generatedPath: GENERATED_PATH })).not.toThrow();
    expect(() => checkGeneratedParity()).not.toThrow();
  });

  test("reports adapter runtime drift at the adapter source", () => {
    const fixture = mkdtempSync(join(tmpdir(), "core-parity-"));
    try {
      const adapter = join(fixture, "CLAUDE.adapter.md");
      writeFileSync(adapter, `${readFileSync(ADAPTER_PATH, "utf8")}\nUnknown adapter runtime: ein_adapter_unknown\n`);

      expect(() => compileClaudeSurface({ adapterPath: adapter })).toThrow(
        /PARITY_UNTRANSLATED_TOKEN.*CLAUDE\.adapter\.md.*line.*column/,
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("does not treat ordinary runtime words as registered translations", () => {
    const fixture = mkdtempSync(join(tmpdir(), "core-parity-"));
    try {
      const agents = join(fixture, "agents");
      cpSync(join(ROOT, "runtime", "agents"), agents, { recursive: true });
      const apply = join(agents, "sdd-apply.md");
      writeFileSync(apply, `${readFileSync(apply, "utf8")}\nA supervisor reviews intercom architecture.\n`);

      expect(() => compileClaudeSurface({ agentsDir: agents })).toThrow(/PARITY_UNTRANSLATED_TOKEN/);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("rejects unknown runtime markers with source location", () => {
    const fixture = mkdtempSync(join(tmpdir(), "core-parity-"));
    try {
      const agents = join(fixture, "agents");
      cpSync(join(ROOT, "runtime", "agents"), agents, { recursive: true });
      const apply = join(agents, "sdd-apply.md");
      writeFileSync(apply, `${readFileSync(apply, "utf8")}\n<!-- ein:runtime-ref id="unknown-runtime" -->\n`);

      expect(() => compileClaudeSurface({ agentsDir: agents })).toThrow(
        /PARITY_UNTRANSLATED_TOKEN.*sdd-apply\.md.*line.*column.*unknown-runtime/,
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("validates runtime identifiers as whole tokens and applies registered fixtures", () => {
    const fixture = mkdtempSync(join(tmpdir(), "core-parity-runtime-"));
    try {
      const agents = join(fixture, "agents");
      cpSync(join(ROOT, "runtime", "agents"), agents, { recursive: true });
      const apply = join(agents, "sdd-apply.md");
      writeFileSync(apply, [
        readFileSync(apply, "utf8"),
        "Embedded identifiers remain prose: prefixein_unknown_runtime and wrapped_ein_unknown_runtime_suffix.",
        "Registered token: ein_sdd_status.",
        '<!-- ein:runtime-ref id="pi-runtime" -->',
      ].join("\n"));

      const surface = compileClaudeSurface({ agentsDir: agents });
      const output = surface.agents["sdd-apply.md"];
      expect(output).toContain("prefixein_unknown_runtime");
      expect(output).toContain("wrapped_ein_unknown_runtime_suffix");
      expect(output).toContain("Registered token: ein-cc-sdd status.");
      expect(output).not.toContain('<!-- ein:runtime-ref id="pi-runtime" -->');
      expect(output).not.toMatch(/(?<![A-Za-z0-9_])ein_[A-Za-z0-9_]+(?![A-Za-z0-9_])/);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("rejects a known Pi-only runtime signature outside its scoped fixture", () => {
    const fixture = mkdtempSync(join(tmpdir(), "core-parity-runtime-"));
    try {
      const agents = join(fixture, "agents");
      cpSync(join(ROOT, "runtime", "agents"), agents, { recursive: true });
      const apply = join(agents, "sdd-apply.md");
      writeFileSync(apply, `${readFileSync(apply, "utf8")}\nUnregistered signature: completionGuard\n`);

      expect(() => compileClaudeSurface({ agentsDir: agents })).toThrow(
        /PARITY_UNTRANSLATED_TOKEN.*sdd-apply\.md.*completionGuard/,
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("rejects missing and stale routing keys bidirectionally from a fixture inventory", () => {
    const fixture = mkdtempSync(join(tmpdir(), "core-parity-routing-"));
    try {
      const agents = join(fixture, "agents");
      cpSync(join(ROOT, "runtime", "agents"), agents, { recursive: true });
      const inventory = compileClaudeSurface({ agentsDir: agents });
      const names = Object.values(inventory.agents)
        .map((content) => frontmatterField(content, "name"))
        .sort();
      const routing = Object.fromEntries(names.map((name) => [name, { model: "haiku" }]));
      const missing = { ...routing };
      delete missing[names[0]!];
      expect(() => compileClaudeSurface({ agentsDir: agents, routing: missing })).toThrow(
        new RegExp(`PARITY_ROUTING_MISSING.*${names[0]}`),
      );
      expect(() => compileClaudeSurface({ agentsDir: agents, routing: { ...routing, "sdd-ghost": { model: "haiku" } } })).toThrow(
        /PARITY_ROUTING_STALE.*sdd-ghost/,
      );
      const routed = compileClaudeSurface({ agentsDir: agents, routing });
      for (const content of Object.values(routed.agents)) expect(frontmatterField(content, "model")).toBe("haiku");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("produces byte-identical surfaces despite fixture directory creation order", () => {
    const fixture = mkdtempSync(join(tmpdir(), "core-parity-deterministic-"));
    try {
      const firstAgents = join(fixture, "agents-a");
      const secondAgents = join(fixture, "agents-b");
      mkdirSync(firstAgents, { recursive: true });
      mkdirSync(secondAgents, { recursive: true });
      const files = Object.keys(compileClaudeSurface().agents).sort();
      for (const file of files) cpSync(join(ROOT, "runtime", "agents", file), join(firstAgents, file));
      for (const file of [...files].reverse()) cpSync(join(ROOT, "runtime", "agents", file), join(secondAgents, file));

      const first = compileClaudeSurface({ agentsDir: firstAgents, parityDeferrals: {} });
      const second = compileClaudeSurface({ agentsDir: secondAgents, parityDeferrals: {} });
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      expect(Object.keys(first.agents)).toEqual(files);
      expect(first.coordinator.endsWith("\n")).toBe(true);
      expect(first.coordinator).not.toMatch(/\/tmp\/|\\tmp\\|generated at|timestamp:/i);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
