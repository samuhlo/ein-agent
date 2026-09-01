# Tasks — install-journal-execution-boundary

status: ready
blocked_by: none

## // 001. Codec — PR 1

- [x] 1.1 Añadir pruebas RED directas de roundtrip, canonicalidad y rechazo estable; extraer validación, encode y parse a `install-journal-codec.ts` manteniendo los reexports públicos.
  - skills: `none`
  - why: bytes y significado deben tener un traductor único antes de separar los efectos.
  - architecture: codec depende sólo de contrato, forma y alcanzabilidad.
  - avoid: importar store, filesystem, executor o CLI.
  - verify: `bun test tests/install-journal-codec.test.ts tests/install-journal.test.ts`

## // 002. Política pura — PR 2

- [x] 2.1 Añadir pruebas RED de clasificación exacta y sustituir las cuatro funciones duplicadas por `classifyInstallJournalResume`.
  - skills: `none`
  - why: CLI y ejecutor no pueden discrepar sobre qué diario autoriza mutaciones.
  - architecture: un resultado cerrado explica el retry admitido.
  - avoid: ampliar los casos soportados o consultar filesystem.
  - verify: `bun test tests/install-journal-policy.test.ts tests/install-journal.test.ts`

- [x] 2.2 Añadir pruebas RED de inmutabilidad y alcanzabilidad; extraer preparación y transiciones puras de entrada, interrupción y finalización.
  - skills: `none`
  - why: la ejecución debe coordinar efectos, no construir estados a mano.
  - architecture: funciones de dominio con nombres, sin reducer genérico.
  - avoid: persistir, ejecutar handlers o capturar señales.
  - verify: `bun test tests/install-journal-policy.test.ts tests/install-journal.test.ts`

## // 003. Persistencia — PR 3

- [x] 3.1 Añadir pruebas RED de composición y errores; mover inspección/publicación a `install-journal-persistence.ts` usando codec y store sin cambiar resultados públicos.
  - skills: `none`
  - why: ejecución necesita consumir IO sin crear un ciclo con la fachada.
  - architecture: persistencia traduce bytes/errores; store conserva atomicidad.
  - avoid: duplicar validación, serialización o filesystem.
  - verify: `bun test tests/install-journal-codec.test.ts tests/install-journal.test.ts`

## // 004. Coordinador y fachada — PR 4

- [ ] 4.1 Añadir pruebas RED de arquitectura y lifecycle; mover el bucle a `install-journal-execution.ts`, hacerlo consumir política/persistencia y dejar `install-journal.ts` como fachada fina.
  - skills: `none`
  - why: el flujo final debe leerse sin descifrar decisiones comprimidas.
  - architecture: execution posee efectos; facade sólo reexporta.
  - avoid: cambiar orden de rollback/finalize, señales, errores o API.
  - verify: `bun test tests/install-journal-codec.test.ts tests/install-journal-policy.test.ts tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts tests/architecture-boundaries.test.ts`

- [ ] 4.2 Medir cada PR, sincronizar el delta, retirar la fase 3 del roadmap, ejecutar verificación completa y cerrar el cambio SDD.
  - skills: `none`
  - why: el resultado duradero pertenece a spec/archivo y el roadmap sólo conserva trabajo pendiente.
  - architecture: ninguna PR excede el guard sin decisión explícita.
  - avoid: cerrar con tareas, sync o verificación pendientes.
  - verify: `bun ein-cc/sdd-cli/cli.ts check install-journal-execution-boundary`
