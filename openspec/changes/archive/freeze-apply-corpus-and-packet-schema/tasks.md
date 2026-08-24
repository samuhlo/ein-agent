# Tasks — freeze-apply-corpus-and-packet-schema

status: ready
blocked_by: none
lane: standard
tdd: strict

<!-- Skill applicability: `ein-discipline` aplica al ciclo TDD estricto y a la propiedad acotada de hunks; `architecture` aplica a módulos [CORE] sin estado y a la frontera E/S en el borde; `bun` aplica a los comandos de test y typecheck; `comment-style` aplica a los bloques tocados. `vitest` se salta porque este repo usa Bun; `linear-workflow` se salta porque el modo es solo. -->

## // 001. Schema y validador del Apply Packet

Production files (apply touches): `ein-pi/agent/lib/apply-packet.ts`.

Test files (apply touches): `tests/apply-packet.test.ts`.

- [x] 1.1 Fijar `apply-packet/v1`, su tipo y `validateApplyPacket` con los seis códigos de rechazo, sin lanzar nunca.
  - skills: `ein-discipline`, `architecture`, `comment-style`
  - production: `ein-pi/agent/lib/apply-packet.ts`
  - tests: `tests/apply-packet.test.ts`
  - cycle: RED — casos para `missing-invariant`, `unresolved-decision`, `stale-source`, `out-of-scope`, `missing-stop` y `unknown-grammar`, cada uno afirmando el `code` y el `field` ofensor, más un caso que prueba que un input basura devuelve un resultado y no una excepción; GREEN — tipo versionado y validador como unión discriminada; TRIANGULATE — packet completo válido, packet `incomplete` con campos faltantes nombrados, y comando enfocado que nombra una ruta fuera de `allowedFiles`; REFACTOR — extraer los predicados de rechazo sin cambiar códigos ni mensajes.
  - why: Un ejecutor barato solo es seguro si la frontera que lo limita se puede comprobar antes de que escriba.
  - learn: Un validador que lanza obliga a cada consumidor a envolver la llamada; una unión discriminada hace del fallo un valor.
  - architecture: Módulo `[CORE]`: sin lectura de disco, sin estado global, sin dependencias nuevas. El digest se recibe como parámetro.
  - avoid: No importar `node:fs` aquí, no devolver un packet parcial como válido, no reutilizar los códigos de error de OpenSpec.
  - verify: `bun test tests/apply-packet.test.ts`
  - stop: Parar si un rechazo no nombra el campo ofensor, si el validador lanza ante cualquier input, o si un packet `incomplete` se devuelve como ejecutable.

## // 002. Compilador que parsea la etiqueta, nunca el cuerpo

Production files (apply touches): `ein-pi/agent/lib/apply-packet-compile.ts`.

Test files (apply touches): `tests/apply-packet-compile.test.ts`.

- [x] 2.1 Compilar un packet desde el texto de `design.md` y `tasks.md` reconociendo el conjunto cerrado de grafías de la etiqueta de ficheros permitidos.
  - skills: `ein-discipline`, `architecture`, `comment-style`
  - production: `ein-pi/agent/lib/apply-packet-compile.ts`
  - tests: `tests/apply-packet-compile.test.ts`
  - cycle: RED — una fixture por cada una de las diez grafías conocidas afirmando el mismo campo normalizado y la `provenance` correcta, más una grafía inventada que debe dar `unknown-grammar` y un basename sin directorio que debe rechazarse; GREEN — parser de etiqueta contra el conjunto cerrado, reutilizando la partición por `##` de `oversizedGroupWarnings` y clasificando rutas con `isTestPath`/`isProductionFile`; TRIANGULATE — grupo que declara `none`, grupo con rutas en el cuerpo pero no en la etiqueta (debe dar lista vacía, no nueve ficheros) y grupo sin etiqueta; REFACTOR — la tabla de grafías queda como dato único, no repartida entre regex.
  - why: El defecto medido no es que falte un extractor, es que el existente ignora la etiqueta y barre el cuerpo entero.
  - learn: Un conjunto cerrado de grafías reconocidas falla en claro; un regex abierto sobre el cuerpo falla en silencio y a favor del ejecutor.
  - architecture: Importa los predicados de ruta de `sdd-router.ts` para CLASIFICAR, jamás para encontrar rutas. No se crea un segundo particionador de grupos.
  - avoid: No editar `sdd-router.ts` ni `sdd-guardrails.ts`, no llamar a `extractProductionFiles`, no caer al barrido del cuerpo cuando la etiqueta falte.
  - verify: `bun test tests/apply-packet-compile.test.ts`
  - stop: Parar si una grafía desconocida produce ficheros en vez de `unknown-grammar`, si una ruta sale del cuerpo en vez de la etiqueta, o si algún módulo existente aparece modificado.

## // 003. Reglas de pertenencia y serialización canónica del corpus

Production files (apply touches): `ein-pi/agent/lib/apply-corpus.ts`.

Test files (apply touches): `tests/apply-corpus.test.ts`.

- [x] 3.1 Calcular la pertenencia al corpus desde los cuatro hechos inyectados y serializarlo de forma canónica con su digest.
  - skills: `ein-discipline`, `architecture`, `comment-style`
  - production: `ein-pi/agent/lib/apply-corpus.ts`
  - tests: `tests/apply-corpus.test.ts`
  - cycle: RED — casos de inclusión y los cuatro motivos de exclusión (`sin-commit`, `solo-artefactos`, `sin-tasks`, `verify-sin-status`), cada uno con su motivo en el resultado, más dos serializaciones del mismo corpus que deben dar bytes idénticos; GREEN — función pura sobre hechos inyectados y serializador con claves e ítems ordenados; TRIANGULATE — orden de entrada alterado, ítem con ficheros tocados vacíos y corpus vacío; REFACTOR — un solo lugar decide el orden canónico.
  - why: Una pertenencia elegida a mano no es reproducible, y un corpus que excluye en silencio miente sobre su cobertura.
  - learn: Congelar no es guardar un fichero: es que regenerarlo produzca los mismos bytes.
  - architecture: Módulo `[CORE]`: recibe los hechos de git y disco como parámetros. Reutiliza `sha256` de `openspec-spec-contract.ts`.
  - avoid: No ejecutar git ni leer disco desde este módulo, no ordenar por fecha, no descartar exclusiones.
  - verify: `bun test tests/apply-corpus.test.ts`
  - stop: Parar si una exclusión pierde su motivo, si dos serializaciones difieren, o si el módulo necesita el sistema de ficheros para probarse.

## // 004. Congelar el corpus real y aislarlo del runtime

Production files (apply touches): `evals/build-corpus.ts`.

Test files (apply touches): `tests/apply-corpus-frozen.test.ts`.

- [x] 4.1 Escribir el generador del borde y congelar `evals/apply-corpus.json` contra el archivo real, probando que el dato congelado es reproducible.
  - skills: `ein-discipline`, `bun`, `architecture`, `comment-style`
  - production: `evals/build-corpus.ts`
  - tests: `tests/apply-corpus-frozen.test.ts`
  - cycle: RED — test que exige `evals/apply-corpus.json` presente, con digest coherente, 40 ítems incluidos y 16 exclusiones con motivo; GREEN — generador que reúne los hechos de git y disco y delega toda la decisión en `apply-corpus.ts`; TRIANGULATE — regenerar sobre el mismo historial produce bytes idénticos, y un ítem al que se le quita un hecho sale del corpus con motivo; REFACTOR — el generador no toma ninguna decisión de pertenencia propia.
  - why: El corpus solo sirve como examen si está en disco, versionado y regenerable sin criterio humano.
  - learn: La E/S en el borde permite que la regla se pruebe sin árbol real y que el dato se compruebe contra el árbol real.
  - architecture: `evals/` vive fuera de `ein-pi/` porque es dato de evaluación, no payload instalable, y fuera de `openspec/`, cuya autoridad es el spec-sync.
  - avoid: No reescribir ningún artefacto archivado, no meter lógica de pertenencia en el generador, no añadir dependencias.
  - verify: `bun test tests/apply-corpus-frozen.test.ts`
  - stop: Parar si el recuento no cuadra con el archivo real, si el generador decide pertenencia, o si algún fichero de `openspec/changes/archive/` aparece modificado.

- [x] 4.2 Probar que ningún módulo de fase importa el corpus.
  - skills: `ein-discipline`
  - production: none
  - tests: `tests/apply-corpus-frozen.test.ts`
  - cycle: RED — test que escanea `ein-pi/agent/lib/` y `cc-ein/` buscando importaciones de `apply-corpus.json` o del generador y falla si encuentra alguna; GREEN — pasa sin tocar producción, porque nada lo importa; TRIANGULATE — una importación simulada en una fixture hace fallar el test; REFACTOR — el escaneo nombra el fichero infractor.
  - why: El corpus es dato de evaluación; si una herramienta de fase lo lee, se convierte en una segunda fuente de estado.
  - learn: Una prohibición que no tiene test es una frase, no una garantía.
  - architecture: El test escanea el árbol real, no una lista mantenida a mano.
  - avoid: No añadir excepciones ni allowlists al escaneo.
  - verify: `bun test tests/apply-corpus-frozen.test.ts`
  - stop: Parar si el test necesita una excepción para pasar.

## // 005. Puertas completas

Production files (apply touches): none.

Test files (apply touches): none.

- [x] 5.1 Pasar la suite completa y el typecheck de raíz una vez el trabajo del otro agente esté fuera del camino.
  - skills: `bun`, `ein-discipline`
  - production: none
  - tests: none
  - cycle: no aplica (puerta de verificación, no ciclo TDD).
  - why: El test enfocado prueba la unidad; la puerta completa prueba que no se rompió nada ajeno.
  - learn: `bun test` en verde no basta: Bun no comprueba tipos, y este repo tiene dos typechecks.
  - architecture: Este cambio solo puede afectar al typecheck de raíz; el de `installer/` no entra.
  - avoid: No declarar la puerta pasada si no se ejecutó en esta sesión.
  - verify: `bun test && bun run typecheck`
  - stop: Parar y reportar si falla algún test ajeno a este cambio, en vez de tocarlo.
