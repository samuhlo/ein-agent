// =============================================================================
// TESTS: installer deps — refresh de engram (macOS/brew)
// Fija el contrato de honestidad: un `brew` fallido NUNCA se reporta como
// actualización aplicada. La regresión que motivó esto descartaba el exit code
// de brew, así que el gate de taps no confiados de Homebrew dejaba engram
// congelado mientras `ein update` decía "aplicado".
// =============================================================================

import { describe, expect, test } from "bun:test";
import { refreshEngram } from "../installer/src/core/deps";
import { brewFailureDetail, ENGRAM_FORMULA, ENGRAM_TAP } from "../installer/src/core/engram";
import type { RunResult } from "../installer/src/core/exec";
import type { Platform } from "../installer/src/core/platform";

const MAC: Platform = {
  os: "darwin",
  arch: "arm64",
  distro: "unknown",
  packageManager: "brew",
  shell: "fish",
  shellRc: "/tmp/config.fish",
  home: "/tmp",
};

// Texto literal del Homebrew que rechaza el tap sin confiar.
const UNTRUSTED = [
  "Error: Refusing to load formula gentleman-programming/tap/engram from untrusted tap gentleman-programming/tap.",
  "Run `brew trust --formula gentleman-programming/tap/engram` or `brew trust gentleman-programming/tap` to trust it.",
].join("\n");

function result(over: Partial<RunResult> = {}): RunResult {
  return { ok: false, code: 1, stdout: "", stderr: "", ...over };
}

function deps(res: RunResult, calls: string[][] = []) {
  return {
    run: async (cmd: string, args: string[] = []) => {
      calls.push([cmd, ...args]);
      return res;
    },
    resolveEngram: () => ({ command: "/opt/homebrew/bin/engram", found: true }),
  };
}

describe("brewFailureDetail", () => {
  test("un tap no confiado devuelve el comando exacto de trust", () => {
    const detail = brewFailureDetail("upgrade", result({ stderr: UNTRUSTED }));
    expect(detail).toContain(`brew trust ${ENGRAM_TAP}`);
  });

  test("otros fallos conservan la ultima linea de stderr como motivo", () => {
    const detail = brewFailureDetail("upgrade", result({ stderr: "Error: No such keg: engram" }));
    expect(detail).toContain("No such keg: engram");
  });

  test("sin stderr cae al exit code en vez de quedarse mudo", () => {
    expect(brewFailureDetail("install", result({ code: 7 }))).toContain("exit 7");
  });
});

describe("refreshEngram — macOS/brew", () => {
  test("brew fallido NO se reporta como actualizacion aplicada", async () => {
    const step = await refreshEngram(MAC, deps(result({ stderr: UNTRUSTED })));
    expect(step.ok).toBe(false);
    expect(step.detail).toContain(`brew trust ${ENGRAM_TAP}`);
  });

  test("brew ok se reporta como aplicado", async () => {
    const step = await refreshEngram(MAC, deps(result({ ok: true, code: 0 })));
    expect(step.ok).toBe(true);
  });

  test("usa la formula cualificada del tap, no el nombre a secas", async () => {
    const calls: string[][] = [];
    await refreshEngram(MAC, deps(result({ ok: true, code: 0 }), calls));
    expect(calls[0]).toEqual(["brew", "upgrade", "--formula", ENGRAM_FORMULA]);
  });

  test("sin engram instalado no invoca brew", async () => {
    const calls: string[][] = [];
    const step = await refreshEngram(MAC, {
      ...deps(result(), calls),
      resolveEngram: () => ({ command: "engram", found: false }),
    });
    expect(step.ok).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
