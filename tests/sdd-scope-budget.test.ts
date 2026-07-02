// =============================================================================
// TESTS: sdd-scope-budget contract
// Verifica que sdd-scope.md contiene:
//   - Fast path (sección "Fast Path" o "Config-Only")
//   - budget en frontmatter
//   - budget_allocated en output
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCOPE_MD = join(import.meta.dir, "../ein-pi/core/agents/sdd-scope.md");
const content = readFileSync(SCOPE_MD, "utf8");

describe("sdd-scope.md budget contract", () => {
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

  test("emite scope + max_reads para propagar el SCOPE PACKET a map", () => {
    // Sin scope/max_reads concretos en scope.md, map corre sin tope de
    // lectura en modo chain (causa de la explosion de tokens).
    expect(content).toContain("scope:");
    expect(content).toContain("max_reads");
  });
});
