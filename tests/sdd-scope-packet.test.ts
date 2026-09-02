// =============================================================================
// TESTS: sdd-scope-packet contract
// Verifica que sdd-map.md contiene:
//   - SCOPE PACKET como texto
//   - scope_missing como código de error
//   - budget en el contract
//   - ledger en el contract
//   - webfetch NO en frontmatter tools (retirado por defecto)
// =============================================================================

import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("@earendil-works/pi-tui", () => ({
  // `Text` lo usa ein-ai para pintar los recibos de una linea de las tools.
  Text: class { constructor(public text: string) {} setText(value: string) { this.text = value; } },
  matchesKey: () => false,
  truncateToWidth: (value: string) => value,
}));

const { resolveCanonicalSpecContext } = await import(
  "../ein-pi/agent/extensions/internal/ein-canonical-spec-context.ts"
);

const MAP_MD = join(
  import.meta.dir,
  "../runtime/agents/sdd-map.md",
);
const AI_TS = join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts");
const CONTEXT_TS = join(import.meta.dir, "../ein-pi/agent/extensions/internal/ein-canonical-spec-context.ts");
const content = readFileSync(MAP_MD, "utf8");
const ai = readFileSync(AI_TS, "utf8");
const canonicalContext = readFileSync(CONTEXT_TS, "utf8");

describe("sdd-map.md SCOPE PACKET contract", () => {
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
    // tools: read, grep, find  (sin webfetch). `find` es el builtin de Pi que
    // lista ficheros; `glob` NO existe — ver tests/agent-tools-contract.test.ts.
    expect(frontmatter).toContain("tools: read, grep, find");
    expect(frontmatter).not.toContain("webfetch");
  });

  test("fail-fast por budget está documentado", () => {
    expect(content).toContain("budget_exceeded");
  });

  test("webfetch se activa condicionalmente via SCOPE PACKET", () => {
    expect(content).toContain("WHEN webfetch: true");
  });

  test("tiene budget hard-default para no mapear sin tope", () => {
    // La explosion de tokens venia de mapear sin presupuesto en modo chain.
    expect(content).toContain("HARD DEFAULT");
    expect(content).toContain("15000");
    expect(content).toContain("budget_allocated"); // lee el budget de scope.md
  });

  test("refuerza read-only: no puede escribir codigo", () => {
    expect(content).toContain("MUST NOT write code");
  });
});

describe("canonical OpenSpec context", () => {
  test("reads only explicit canonical paths and records digest evidence", () => {
    const cwd = mkdtempSync(join(tmpdir(), "ein-spec-context-"));
    try {
      const dir = join(cwd, "openspec/specs/sdd-lifecycle");
      mkdirSync(dir, { recursive: true });
      mkdirSync(join(cwd, ".sdd/specs/sdd-lifecycle"), { recursive: true });
      writeFileSync(join(dir, "spec.md"), "canonical\n");
      writeFileSync(join(cwd, ".sdd/specs/sdd-lifecycle/spec.md"), "legacy\n");

      expect(resolveCanonicalSpecContext(cwd, ["sdd-lifecycle"])).toEqual({
        status: "ok",
        references: [{
          path: "openspec/specs/sdd-lifecycle/spec.md",
          sha256: "43045e07e709b38e470076ff8235b68ca6e63400498c0aa847f6e743f230166e",
          bytes: 10,
        }],
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("blocks instead of truncating when the canonical context exceeds its budget", () => {
    const cwd = mkdtempSync(join(tmpdir(), "ein-spec-context-"));
    try {
      for (const domain of ["alpha", "beta", "gamma", "delta"]) {
        const dir = join(cwd, "openspec/specs", domain);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "spec.md"), `${domain}\n`);
      }
      const result = resolveCanonicalSpecContext(cwd, ["delta", "gamma", "beta", "alpha"]);
      expect(result.status).toBe("blocked");
      expect(result.references).toHaveLength(0);
      expect(result.message).toContain("narrower canonical spec selection");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("keeps the exact-path and no-truncation instructions in the prompt contract", () => {
    expect(ai).toContain("canonicalSpecPrompt");
    expect(canonicalContext).toContain("never glob domains or read .sdd specs");
    expect(canonicalContext).toContain("Do not truncate or glob specs");
  });
});
