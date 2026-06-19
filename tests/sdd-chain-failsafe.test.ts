// =============================================================================
// TESTS: sdd-chain-failsafe contract
// Verifica que ein-sdd.chain.md contiene:
//   - FAIL-SAFE o fail-safe
//   - scope_missing
//   - DETENER CHAIN o equivalente
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CHAIN_MD = join(
  import.meta.dir,
  "../ein-pi/agent/chains/ein-sdd.chain.md",
);
const content = readFileSync(CHAIN_MD, "utf8");

describe("ein-sdd.chain.md fail-safe", () => {
  test("contiene FAIL-SAFE", () => {
    expect(content).toContain("FAIL-SAFE");
  });

  test("contiene scope_missing", () => {
    expect(content).toContain("scope_missing");
  });

  test("contiene DETENER CHAIN o equivalente", () => {
    expect(content.toLowerCase()).toContain("detener");
  });

  test("exploration-error.md como output de error", () => {
    expect(content).toContain("exploration-error.md");
  });

  test("presencia de budget en artifact propagate", () => {
    expect(content).toContain("budget_allocated");
  });

  test("scope_status en artifact", () => {
    expect(content).toContain("scope_status");
  });
});
