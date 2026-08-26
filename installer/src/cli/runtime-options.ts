// =============================================================================
// LAS OPCIONES DE RUNTIME
// Módulo PURO, sin dependencias. Vivían dentro de `runtime-prompt.ts`, que
// cuelga de `install.ts` y por tanto del template empaquetado: un contrato que
// no se puede importar sin construir el binario no se puede fijar en un test.
//
// Las etiquetas NO se pintan aquí. Venían envueltas en `gold(...)`, y el
// `concrete(...)` que el prompt aplica a la fila con foco no puede tapar un ANSI
// interior — el de dentro gana. Resultado: las tres amarillas, con foco o sin
// él. El color de una fila lo decide quien sabe cuál tiene el cursor.
//
// Las pistas dicen la CONSECUENCIA, no el sinónimo: qué se instala y qué
// launcher queda puesto. «Pi → solo Pi» no informa de nada.
// =============================================================================

import type { InstallTarget } from "../core/install-plan.ts";

export type RuntimePromptOption = Readonly<{
  value: InstallTarget;
  label: string;
  hint: string;
}>;

export const RUNTIME_PROMPT_OPTIONS: readonly RuntimePromptOption[] = Object.freeze([
  Object.freeze({
    value: "pi" as const,
    label: "Pi",
    hint: "pi, bun, engram y gh · launcher pi-ein · estado en ~/.pi-ein",
  }),
  Object.freeze({
    value: "claude" as const,
    label: "Claude Code",
    hint: "claude code, bun, engram y gh · launcher cc-ein",
  }),
  Object.freeze({
    value: "both" as const,
    label: "Los dos",
    hint: "pi-ein y cc-ein, compartiendo un solo estado",
  }),
]);
