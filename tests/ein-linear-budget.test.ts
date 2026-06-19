// =============================================================================
// TESTS: ein-linear-known-ids-budget contract
// Verifica que ein-linear.md contiene:
//   - tools: SIN bash, read, grep, glob, write, edit
//   - Known Issue IDs Mode con max_calls_per_issue
//   - Pragmatic state resolution (sin regla rígida UUID)
//   - Prohibición de curl/shell para board updates
// Verifica que orchestrator.md contiene:
//   - LINEAR OPERATION PACKET
//   - mode: known_ids
//   - no_shell, no_discovery
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LINEAR_MD = join(import.meta.dir, "../ein-pi/agent/agents/ein-linear.md");
const ORCH_MD = join(import.meta.dir, "../ein-pi/agent/assets/orchestrator.md");
const linearContent = readFileSync(LINEAR_MD, "utf8");
const orchContent = readFileSync(ORCH_MD, "utf8");

describe("ein-linear.md — tools contract", () => {
  test("NO contiene bash en frontmatter tools", () => {
    const frontmatterMatch = linearContent.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const frontmatter = frontmatterMatch![1];
    expect(frontmatter).not.toContain("bash");
  });

  test("NO contiene read, grep, glob, write, edit en frontmatter tools", () => {
    const frontmatterMatch = linearContent.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const frontmatter = frontmatterMatch![1];
    expect(frontmatter).not.toContain("read,");
    expect(frontmatter).not.toContain("grep,");
    expect(frontmatter).not.toContain("glob,");
    expect(frontmatter).not.toContain("write,");
    expect(frontmatter).not.toContain("edit,");
  });

  test("SI contiene solo linear_* tools en frontmatter", () => {
    const frontmatterMatch = linearContent.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const frontmatter = frontmatterMatch![1];
    const toolsLine = frontmatter.split("\n").find(l => l.startsWith("tools:"));
    expect(toolsLine).toBeDefined();
    expect(toolsLine!).toMatch(/^tools:(\s*linear_\w+,?)+$/);
  });
});

describe("ein-linear.md — Known Issue IDs Mode contract", () => {
  test("contiene Known Issue IDs Mode", () => {
    expect(linearContent).toContain("Known Issue IDs Mode");
  });

  test("contiene max_calls_per_issue o max 4 per issue", () => {
    expect(linearContent).toMatch(/max.*4.*per.*issue|4.*calls.*per.*issue/);
  });

  test("contiene overhead: 2 o + 2 overhead", () => {
    expect(linearContent).toMatch(/\+ 2 overhead|overhead.*2/);
  });

  test("prohibe shell/no_shell para board updates", () => {
    expect(linearContent).toMatch(/no_shell|no.*shell/i);
  });

  test("prohibe discovery/no_discovery para IDs exactos", () => {
    expect(linearContent).toMatch(/no_discovery|no.*discovery|do\s+not.*(?:discovery|list)/i);
  });

  test("prohibe broad_search para IDs exactos", () => {
    expect(linearContent).toMatch(/no_broad_search|no.*broad.*search|do\s+not.*broad.*linear_search_issues|do\s+not.*scan.*board/i);
  });

  test("prohibe curl/direct API para board updates", () => {
    expect(linearContent).toMatch(/curl|direct API|env.*token.*discovery/);
  });
});

describe("ein-linear.md — pragmatic state resolution contract", () => {
  test("NO contiene la regla rigida stateId gate UUID", () => {
    expect(linearContent).not.toMatch(/never pass a state name.*to linear_update_issue/);
    expect(linearContent).not.toMatch(/always call.*get_team_states.*first/);
  });

  test("SI contiene Pragmatic state resolution o equivalente", () => {
    expect(linearContent).toMatch(/Pragmatic state resolution|state.*schema|state.*name.*UUID/);
  });

  test("contiene fallback a UUID si schema requiere", () => {
    expect(linearContent).toMatch(/fallback|requires UUID|if.*fails/);
  });

  test("contiene stop on failure con error exacto", () => {
    expect(linearContent).toMatch(/stop.*error|error.*exact|failure/);
  });
});

describe("orchestrator.md — LINEAR OPERATION PACKET contract", () => {
  test("contiene LINEAR OPERATION PACKET", () => {
    expect(orchContent).toContain("LINEAR OPERATION PACKET");
  });

  test("contiene mode: known_ids", () => {
    expect(orchContent).toContain("mode: known_ids");
  });

  test("contiene constraints no_shell", () => {
    expect(orchContent).toContain("no_shell: true");
  });

  test("contiene constraints no_discovery", () => {
    expect(orchContent).toContain("no_discovery: true");
  });

  test("contiene budget max_calls_per_issue: 4", () => {
    expect(orchContent).toMatch(/max_calls_per_issue.*4|4.*calls.*per.*issue/);
  });
});
