// =============================================================================
// TESTS: sdd-init-budget contract
// Verifica que sdd-init.md contiene:
//   - Fast path (sección "Fast Path" o "Config-Only")
//   - budget en frontmatter
//   - budget_allocated en output
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INIT_MD = join(import.meta.dir, "../ein-pi/agent/agents/sdd-init.md");
const content = readFileSync(INIT_MD, "utf8");

describe("sdd-init.md budget contract", () => {
  test("contiene fast path config-only", () => {
    expect(content).toMatch(/Fast Path|Config-Only|config.only|config-only/);
  });

  test("contiene budget en frontmatter", () => {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const frontmatter = frontmatterMatch![1];
    expect(frontmatter).toContain("budget:");
    expect(frontmatter).toContain("default_max_tokens");
  });

  test("budget_allocated en output", () => {
    expect(content).toContain("budget_allocated");
  });

  test("max_runtime_ms en budget_allocated", () => {
    expect(content).toContain("max_runtime_ms");
  });

  test("tokens ~200 para config-only fast path", () => {
    expect(content).toContain("~200");
  });
});
