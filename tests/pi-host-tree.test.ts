// =============================================================================
// TESTS: shared/contracts/pi-host-tree — coherencia del árbol interno del host
// Fixtures aislados en directorio temporal. Casos 1-3 reproducen el incidente:
// pines ^0.x tratados como si el techo fuera el siguiente major, no el minor.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluatePiHostTree,
  resolvePiHostRoot,
  satisfiesRange,
} from "../shared/contracts/pi-host-tree.ts";

const HOST = "@earendil-works/pi-coding-agent";
const SIBLING = "@earendil-works/pi-agent-core";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "pi-host-tree-"));
}

function writeManifest(root: string, packageName: string, contents: unknown) {
  const dir = join(root, ...packageName.split("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(contents));
}

describe("pi-host-tree — comparador de rangos (semántica caret sobre 0.x)", () => {
  test("^0.78.0 NO admite 0.85.0 (caso 1: fuente del incidente)", () => {
    expect(satisfiesRange("^0.78.0", "0.85.0")).toBe(false);
  });

  test("^0.85.0 NO admite 0.78.0 (caso 2: simétrico, separa arreglo de regresión)", () => {
    expect(satisfiesRange("^0.85.0", "0.78.0")).toBe(false);
  });

  test("^0.85.0 admite 0.85.0 exacto (caso 3)", () => {
    expect(satisfiesRange("^0.85.0", "0.85.0")).toBe(true);
  });

  test("^1.2.0 admite 1.9.0 (caso 7: caret sobre 1.x llega hasta <2.0.0)", () => {
    expect(satisfiesRange("^1.2.0", "1.9.0")).toBe(true);
  });

  test("rangos no comprendidos son unknown (caso 5)", () => {
    expect(satisfiesRange("~0.85.0", "0.85.0")).toBe("unknown");
    expect(satisfiesRange(">=0.80.0", "0.85.0")).toBe("unknown");
    expect(satisfiesRange("*", "0.85.0")).toBe("unknown");
    expect(satisfiesRange("^0.85.0 || ^1.0.0", "0.85.0")).toBe("unknown");
  });

  test("versión instalada con prerelease o no parseable es unknown (caso 6)", () => {
    expect(satisfiesRange("^0.85.0", "0.85.0-beta.1")).toBe("unknown");
    expect(satisfiesRange("^0.85.0", "latest")).toBe("unknown");
  });
});

describe("pi-host-tree — evaluatePiHostTree (veredicto sobre disco)", () => {
  test("caso 1: host exige ^0.85.0, hermano instalado en 0.78.0 -> FALLO nombrando causa", () => {
    const root = makeRoot();
    try {
      writeManifest(root, HOST, { dependencies: { [SIBLING]: "^0.85.0" } });
      writeManifest(root, SIBLING, { version: "0.78.0" });

      const verdict = evaluatePiHostTree(root);

      expect(verdict.coherent).toBe(false);
      if (!verdict.coherent) {
        const failure = verdict.failures.find((f) => f.package === SIBLING);
        expect(failure).toBeDefined();
        expect(failure?.requiredRange).toBe("^0.85.0");
        expect(failure?.installedVersion).toBe("0.78.0");
        expect(failure?.repairCommand).toBe(`bun install -g ${SIBLING}@latest`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("caso 2: host exige ^0.78.0, hermano instalado en 0.85.0 -> FALLO (se sale por arriba)", () => {
    const root = makeRoot();
    try {
      writeManifest(root, HOST, { dependencies: { [SIBLING]: "^0.78.0" } });
      writeManifest(root, SIBLING, { version: "0.85.0" });

      const verdict = evaluatePiHostTree(root);

      expect(verdict.coherent).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("caso 3: host y hermano alineados en 0.85.0 con ^0.85.0 -> PASA", () => {
    const root = makeRoot();
    try {
      writeManifest(root, HOST, { dependencies: { [SIBLING]: "^0.85.0" } });
      writeManifest(root, SIBLING, { version: "0.85.0" });

      const verdict = evaluatePiHostTree(root);

      expect(verdict.coherent).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("caso 4: manifiesto del host ausente -> FALLO declarado, nunca verde", () => {
    const root = makeRoot();
    try {
      const verdict = evaluatePiHostTree(root);
      expect(verdict.coherent).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("caso 4b: manifiesto hermano ausente -> FALLO declarado", () => {
    const root = makeRoot();
    try {
      writeManifest(root, HOST, { dependencies: { [SIBLING]: "^0.85.0" } });
      const verdict = evaluatePiHostTree(root);
      expect(verdict.coherent).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("caso 5: rango no comprendido -> FALLO declarado con 'rango no comprendido'", () => {
    const root = makeRoot();
    try {
      writeManifest(root, HOST, { dependencies: { [SIBLING]: "~0.85.0" } });
      writeManifest(root, SIBLING, { version: "0.85.0" });

      const verdict = evaluatePiHostTree(root);

      expect(verdict.coherent).toBe(false);
      if (!verdict.coherent) {
        expect(verdict.failures[0]?.reason).toContain("rango no comprendido");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("caso 7: rango ^1.2.0 con instalada 1.9.0 -> PASA", () => {
    const root = makeRoot();
    try {
      writeManifest(root, HOST, { dependencies: { [SIBLING]: "^1.2.0" } });
      writeManifest(root, SIBLING, { version: "1.9.0" });

      const verdict = evaluatePiHostTree(root);

      expect(verdict.coherent).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("root no determinado -> FALLO declarado (fail closed)", () => {
    const verdict = evaluatePiHostTree(null);
    expect(verdict.coherent).toBe(false);
  });
});

describe("pi-host-tree — resolvePiHostRoot (root inyectable)", () => {
  test("toma la última aparición de node_modules en la ruta del ancla", () => {
    const anchor = "/home/u/.bun/bin/pi";
    const root = resolvePiHostRoot(anchor, {
      realpath: () =>
        "/home/u/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js",
    });
    expect(root).toBe("/home/u/.bun/install/global/node_modules");
  });

  test("sin node_modules en la ruta resuelta -> null (fail closed)", () => {
    const root = resolvePiHostRoot("/usr/local/bin/pi", { realpath: (p) => p });
    expect(root).toBeNull();
  });

  test("ancla nula -> null", () => {
    expect(resolvePiHostRoot(null)).toBeNull();
  });

  test("realpath que lanza -> null (fail closed)", () => {
    const root = resolvePiHostRoot("/broken", {
      realpath: () => {
        throw new Error("ENOENT");
      },
    });
    expect(root).toBeNull();
  });
});
