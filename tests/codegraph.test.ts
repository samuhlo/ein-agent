// =============================================================================
// TESTS: lib/codegraph
// Ruta CLI-over-bash del grafo de código. Contrato clave: la directiva solo
// existe con binario + índice + modo ≠ off — sin codegraph, cero líneas de
// prompt. Más round-trip de config y detección de índice.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const {
	readCodegraphMode,
	writeCodegraphMode,
	codegraphConfigPath,
	projectIndexed,
	resolveCodegraphEnabled,
	codegraphDirective,
	initializeCodegraph,
	shouldOfferCodegraphInit,
	markCodegraphInitPrompted,
	codegraphInitPrompted,
} = await import("../ein-pi/agent/lib/codegraph");

describe("config round-trip", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-cg-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("default 'on' sin fichero", () => {
		expect(readCodegraphMode(cwd)).toBe("on");
	});

	test("round-trip on/off + inválido → on", () => {
		writeCodegraphMode(cwd, "off");
		expect(readCodegraphMode(cwd)).toBe("off");
		writeCodegraphMode(cwd, "on");
		expect(readCodegraphMode(cwd)).toBe("on");
		writeFileSync(codegraphConfigPath(cwd), '{"mode":"maybe"}\n');
		expect(readCodegraphMode(cwd)).toBe("on");
	});

	// La config existente de cualquier proyecto lleva `auto`. Significaba lo
	// mismo que `on` menos la oferta de indexar, así que se lee como `on` en vez
	// de caer al default por "valor desconocido".
	test("el valor heredado `auto` se lee como `on`", () => {
		mkdirSync(dirname(codegraphConfigPath(cwd)), { recursive: true });
		writeFileSync(codegraphConfigPath(cwd), '{"mode":"auto"}\n');
		expect(readCodegraphMode(cwd)).toBe("on");
	});
});

describe("resolveCodegraphEnabled / directiva (FAIL CLOSED)", () => {
	let cwd: string;
	let fakeBin: string;
	const prevEnv = process.env.CODEGRAPH_BIN;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-cg-en-"));
		fakeBin = join(cwd, "codegraph-bin");
		writeFileSync(fakeBin, "#!/bin/sh\n");
		process.env.CODEGRAPH_BIN = fakeBin;
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
		if (prevEnv === undefined) delete process.env.CODEGRAPH_BIN;
		else process.env.CODEGRAPH_BIN = prevEnv;
	});

	test("sin índice → inactivo y directiva vacía (aunque haya binario)", () => {
		expect(projectIndexed(cwd)).toBe(false);
		expect(resolveCodegraphEnabled(cwd)).toBe(false);
		expect(codegraphDirective(cwd)).toBe("");
	});

	test("binario + índice + auto → activo, directiva con la doctrina", () => {
		mkdirSync(join(cwd, ".codegraph"));
		expect(resolveCodegraphEnabled(cwd)).toBe(true);
		const d = codegraphDirective(cwd);
		expect(d).toContain("codegraph explore");
		expect(d).toContain("BEFORE any grep/read");
		expect(d).toContain("staleness banner");
	});

	test("off gana a todo → directiva vacía", () => {
		mkdirSync(join(cwd, ".codegraph"));
		writeCodegraphMode(cwd, "off");
		expect(resolveCodegraphEnabled(cwd)).toBe(false);
		expect(codegraphDirective(cwd)).toBe("");
	});
});

// =============================================================================
// Inicialización del índice. El agujero que cerró esto: en un proyecto que
// nunca arrancó codegraph, la directiva no podía activarse NUNCA y no había
// salida desde Ein. Medido contra la CLI 1.5.0 antes de escribir nada.
// =============================================================================
describe("inicialización del índice", () => {
  let cwd: string;
  const prevEnv = process.env.CODEGRAPH_BIN;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "ein-cg-init-"));
    const bin = join(cwd, "fake-codegraph");
    writeFileSync(bin, "#!/bin/sh\nexit 0\n");
    chmodSync(bin, 0o755);
    process.env.CODEGRAPH_BIN = bin;
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.CODEGRAPH_BIN;
    else process.env.CODEGRAPH_BIN = prevEnv;
    rmSync(cwd, { recursive: true, force: true });
  });

  // El hallazgo que obligó a comprobar el resultado y no el código de salida:
  // en un directorio sin código indexable, la CLI dice "No files found to
  // index" y sale con 0. Un éxito reportado sin índice es una mentira.
  test("salida 0 sin índice NO cuenta como éxito", () => {
    const outcome = initializeCodegraph(cwd, () => ({ code: 0, output: "No files found to index" }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("no-index-created");
  });

  test("se comprueba que el índice existe de verdad", () => {
    const outcome = initializeCodegraph(cwd, () => {
      mkdirSync(join(cwd, ".codegraph"), { recursive: true });
      return { code: 0, output: "120 nodes" };
    });
    expect(outcome).toEqual({ ok: true, alreadyIndexed: false });
  });

  // Reejecutarlo es inofensivo (la CLI responde en ~50 ms sin reconstruir),
  // pero ni siquiera se lanza: el estado ya es el deseado.
  test("un proyecto ya indexado no relanza nada", () => {
    mkdirSync(join(cwd, ".codegraph"), { recursive: true });
    let called = false;
    const outcome = initializeCodegraph(cwd, () => { called = true; return { code: 0, output: "" }; });
    expect(outcome).toEqual({ ok: true, alreadyIndexed: true });
    expect(called).toBe(false);
  });

  test("un fallo real se reporta con su motivo", () => {
    const outcome = initializeCodegraph(cwd, () => ({ code: 1, output: "boom" }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("failed");
      expect(outcome.detail).toContain("boom");
    }
  });

  test("sin binario no se intenta", () => {
    const outcome = initializeCodegraph(cwd, () => ({ code: 0, output: "" }), () => undefined);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("no-binary");
  });
});

describe("cuándo se ofrece indexar", () => {
  let cwd: string;
  const prevEnv = process.env.CODEGRAPH_BIN;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "ein-cg-offer-"));
    const bin = join(cwd, "fake-codegraph");
    writeFileSync(bin, "#!/bin/sh\nexit 0\n");
    chmodSync(bin, 0o755);
    process.env.CODEGRAPH_BIN = bin;
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.CODEGRAPH_BIN;
    else process.env.CODEGRAPH_BIN = prevEnv;
    rmSync(cwd, { recursive: true, force: true });
  });

  test("proyecto sin índice y con binario: se ofrece", () => {
    expect(shouldOfferCodegraphInit(cwd)).toBe(true);
  });

  test("con `off` no se ofrece: dijiste que no lo quieres aquí", () => {
    writeCodegraphMode(cwd, "off");
    expect(shouldOfferCodegraphInit(cwd)).toBe(false);
  });

  test("ya indexado no se ofrece", () => {
    mkdirSync(join(cwd, ".codegraph"), { recursive: true });
    expect(shouldOfferCodegraphInit(cwd)).toBe(false);
  });

  test("sin binario no se ofrece lo que no se puede hacer", () => {
    expect(shouldOfferCodegraphInit(cwd, () => undefined)).toBe(false);
  });

  // Una oferta que reaparece cada sesión deja de ser una oferta.
  test("solo se pregunta una vez por proyecto", () => {
    markCodegraphInitPrompted(cwd);
    expect(shouldOfferCodegraphInit(cwd)).toBe(false);
    expect(codegraphInitPrompted(cwd)).toBe(true);
  });

  test("cambiar el modo no borra que ya se preguntó", () => {
    markCodegraphInitPrompted(cwd);
    writeCodegraphMode(cwd, "on");
    expect(codegraphInitPrompted(cwd)).toBe(true);
  });
});
