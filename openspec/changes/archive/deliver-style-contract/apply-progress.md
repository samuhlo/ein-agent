status: complete

# Apply progress: deliver-style-contract

**Lane:** micro · **TDD:** strict

Este apply tuvo un replanteo a mitad, provocado por el usuario, y el registro lo
dice porque explica por que el resultado no se parece al diseño inicial.

## Group 001 — el compilador (primera version, reemplazada)

- **RED** — `tests/style-contract.test.ts`: siete contratos contra un modulo que
  no existia.
- **GREEN** — `style-contract.ts` extraia cinco secciones de `comment-style` y
  cuatro de `logging-style`, con fail-closed por seccion. 7 pass.
- **TRIANGULATE** — seccion ausente en cada skill por separado, skill ilegible,
  y las secciones exigidas declaradas y no escondidas en el codigo.
- **MEDICION** — 4.889 bytes por turno de escritura. El numero llego DESPUES de
  construirlo, cuando era la pregunta de partida.

## Group 002 — la entrega

- **RED** — `tests/style-block-delivery.test.ts`: el bloque debia traer reglas y
  no rutas. 2 fail.
- **GREEN** — `buildConventionBlock` puro, y `codeConventionSkillBlock` como
  borde que resuelve la raiz de skills desde el propio registry.
- **TRIANGULATE** — sin skills legibles devuelve vacio en vez de inventar medio
  bloque; y si el extracto no se puede compilar, cae a las rutas de antes:
  peor que las reglas, mejor que el silencio.
- **HALLAZGO** — el registry lee del home instalado, no del checkout. En el
  arbol del repo el bloque devolvia cadena vacia.

## Group 003 — el linter (dos reglas, tras retirar una tercera equivocada)

- Escrito implementacion-primero. No hubo RED antes del modulo, y queda dicho.
- **TRIANGULATE sobre codigo real** — pasado por 173 ficheros del repo: 10
  hallazgos, y **nueve eran falsos positivos**. La regla de emoji marcaba los
  dingbats `✓ ✗ ✕` de la gramatica visual de Ein (`GLYPH.done`). Corregido:
  solo cuentan los pictogramas y los dingbats con selector de presentacion.
- **HACK anotado** — Bun 1.3.14 devuelve `false` al alternar un rango astral con
  otra rama; el rango suelto encuentra el pictograma y la misma alternancia no.
  Se resolvio con dos expresiones y un comentario que lo explica.
- **La regla equivocada** — el decimo hallazgo era `// [EXPORT] Registro en Pi`,
  marcado como "tag fuera de catalogo". Es un comentario correcto: la skill dice
  *"use these tags only when useful"* — sugiere, no cierra. Ella misma usa
  `[FEATURE]`, `[COMPOSABLE]` y `[CRITICAL]` fuera del catalogo universal.
  Leerla como whitelist fue un error de diseño; la regla se retiro entera.

## Group 004 — el replanteo

El usuario paro el trabajo con tres criticas: se estaba ejecutando sin plan, el
linter marcaba codigo correcto, y la skill podia pesar mucho menos y entregar lo
mismo. Las tres eran ciertas.

- **Medicion antes de rediseñar** — peso por seccion de ambas skills. Las gordas
  eran ejemplos repetidos en tres sintaxis: `Visual Blocks` 931 B, `Vandal
  Layer` 1.054 B, `Examples` de logging 711 B. Nada de eso cambia lo que alguien
  escribe.
- **El compilador existia solo porque la skill pesaba 6,4 KB.** Con el borrador
  del nucleo aprobado por el usuario, cada skill empieza por `## Essentials`
  —1.119 B y 738 B— y el compilador se reduce a coger una seccion.
- **GREEN** — skills reescritas con su nucleo, compilador de 97 lineas en vez de
  130 con cinco secciones, tests reapuntados al texto nuevo. 6 pass.
- **RESULTADO** — **2.010 bytes** por turno frente a 4.889, sin perder ninguna
  regla: se colapsaron ejemplos y se convirtieron tablas en lineas.
- **Ruido del linter tras el replanteo: 0 hallazgos en 173 ficheros.**

## Gates

- `bun run typecheck` (root): pass.
- `cd installer && bun run typecheck`: pass.
- `bun test`: recorded in `verify-report.md`.
