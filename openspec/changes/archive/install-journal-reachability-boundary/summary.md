status: complete
change: install-journal-reachability-boundary
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La regla que decide si el historial de una instalación podría haber ocurrido queda separada de la lectura, escritura y ejecución del diario. Es una política pura y fail-closed; el validador público conserva la misma firma y los mismos resultados.

## // 001. QUÉ CAMBIÓ

- `installer/src/core/install-journal-reachability.ts` reúne secuencias, hechos derivados y coherencia por estado.
- `installer/src/core/install-journal.ts` valida primero la forma y entrega sólo dos hechos de presencia a la política.
- No cambian el contrato persistido, los estados admitidos, el codec ni la ejecución.

## // 002. CÓMO FUNCIONA POR DENTRO

El validador comprueba el sobre y cada entrada antes de construir un diario tipado. Después conserva la diferencia entre una propiedad opcional ausente y una presente con valor `undefined`, la reduce a booleanos y consulta la política. La política sólo conoce el contrato y el orden del plan; no puede leer disco ni ejecutar pasos.

## // 003. DECISIONES

- Mantener `validateInstallJournal` como única puerta pública evita duplicar autoridades.
- No pasar descriptores JavaScript mantiene la política en vocabulario de dominio.
- Extraer sólo alcanzabilidad conserva una revisión humana de 222 líneas productivas; la validación estructural queda como corte independiente.
- El comentario fail-closed acompaña a la decisión que autoriza nuevas mutaciones.

## // 004. VERIFICACIÓN

- verify: `bun test tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts tests/release-update-integration.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `git diff --check`
- Suite enfocada: 34 pass, 0 fail, 249 assertions.
- Suite completa: 2905 pass, 0 fail, 14150 assertions en 209 ficheros.
- Typecheck raíz e installer: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

No queda riesgo funcional conocido en este corte. `install-journal.ts` todavía mezcla validación estructural, codec y coordinación; el siguiente cambio separará la validación de forma sin ampliar la API pública.
