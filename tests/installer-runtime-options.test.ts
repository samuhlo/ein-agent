// =============================================================================
// TESTS: las opciones de runtime del instalador
// Módulo PURO a propósito. El resto del prompt cuelga de `install.ts`, que
// arrastra el template empaquetado y no se puede importar sin construirlo — y un
// contrato que no se puede ejecutar no es un contrato.
//
// La regresión que fija: las tres etiquetas llegaban envueltas en `gold(...)`
// desde el punto de llamada, así que el `concrete(...)` que el prompt aplica a
// la fila con foco no podía taparlas (el ANSI de dentro gana). Las tres salían
// amarillas, con foco o sin él, y el color dejaba de significar nada.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { RUNTIME_PROMPT_OPTIONS } from "../installer/src/cli/runtime-options.ts";

describe("las opciones de instalación", () => {
  test("Ein siempre incluye Pi y Claude solo se ofrece como complemento", () => {
    expect(RUNTIME_PROMPT_OPTIONS.map((option) => option.value)).toEqual(["pi", "both"]);
  });

  test("la etiqueta no trae color propio: el foco es quien pinta la fila", () => {
    for (const option of RUNTIME_PROMPT_OPTIONS) {
      expect(option.label).not.toMatch(/\x1b\[/);
      expect(option.hint).not.toMatch(/\x1b\[/);
    }
  });

  test("cada pista dice la consecuencia, no repite la etiqueta", () => {
    for (const option of RUNTIME_PROMPT_OPTIONS) {
      expect(option.hint).not.toContain(option.label);
      expect(option.hint.length).toBeGreaterThan(option.label.length);
    }
  });

  test("cada pista explica el núcleo que deja instalado", () => {
    expect(RUNTIME_PROMPT_OPTIONS[0]!.hint).toContain("ein-pi");
    expect(RUNTIME_PROMPT_OPTIONS[1]!.hint).toContain("ein-pi");
    expect(RUNTIME_PROMPT_OPTIONS[1]!.hint).toContain("ein-cc");
  });
});
