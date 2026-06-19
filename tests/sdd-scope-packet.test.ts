// =============================================================================
// TESTS: sdd-scope-packet contract
// Verifica que sdd-explore.md contiene:
//   - SCOPE PACKET como texto
//   - scope_missing como código de error
//   - budget en el contract
//   - ledger en el contract
//   - webfetch NO en frontmatter tools (retirado por defecto)
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EXPLORE_MD = join(
  import.meta.dir,
  "../ein-pi/agent/agents/sdd-explore.md",
);
const content = readFileSync(EXPLORE_MD, "utf8");

describe("sdd-explore.md SCOPE PACKET contract", () => {
  test("contiene SCOPE PACKET como texto", () => {
    expect(content).toContain("SCOPE PACKET");
  });

  test("contiene scope_missing como código de error", () => {
    expect(content).toContain("scope_missing");
  });

  test("contiene budget en el contract", () => {
    expect(content).toContain("budget:");
  });

  test("contiene ledger en el contract", () => {
    expect(content).toContain("ledger:");
  });

  test("webfetch NO está en frontmatter tools por defecto", () => {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const frontmatter = frontmatterMatch![1];
    // tools: read, grep, glob  (sin webfetch)
    expect(frontmatter).toContain("tools: read, grep, glob");
    expect(frontmatter).not.toContain("webfetch");
  });

  test("fail-fast por budget está documentado", () => {
    expect(content).toContain("budget_exceeded");
  });

  test("webfetch se activa condicionalmente via SCOPE PACKET", () => {
    expect(content).toContain("WHEN webfetch: true");
  });

  test("tiene budget hard-default para no explorar sin tope", () => {
    // La explosion de tokens venia de explorar sin presupuesto en modo chain.
    expect(content).toContain("HARD DEFAULT");
    expect(content).toContain("15000");
    expect(content).toContain("budget_allocated"); // lee el budget de init.md
  });

  test("refuerza read-only: no puede escribir codigo", () => {
    expect(content).toContain("MUST NOT write code");
  });
});
