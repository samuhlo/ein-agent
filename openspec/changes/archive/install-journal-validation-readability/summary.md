status: complete
change: install-journal-validation-readability
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La validación fail-closed del diario de instalación queda dividida en pasos con nombre y revisables, sin cambiar el contrato persistido ni los estados aceptados. El cambio está verificado y limitado a esta frontera; almacenamiento y ejecución quedan para unidades posteriores.

## // 001. QUÉ CAMBIÓ

- `installer/src/core/install-journal.ts`: constantes de dominio, validación separada del sobre y las entradas, hechos derivados de los segmentos y coherencia explícita por estado.
- La función pública conserva su firma y sigue rechazando cualquier forma dudosa con `InstallJournalError("recovery-required")`.
- El único comentario nuevo explica por qué esta frontera debe fallar cerrada; no narra el código ni añade ruido visual.

## // 002. CÓMO FUNCIONA POR DENTRO

La lectura valida primero que el documento tenga exactamente el sobre esperado. Después comprueba cada entrada y forma una secuencia tipada. A partir de esa secuencia deriva hechos sobre los segmentos `shared`, `pi` y `claude`, y finalmente decide si el estado persistido es coherente. Si cualquiera de esos pasos falla, no intenta adivinar una recuperación: exige intervención segura.

## // 003. DECISIONES

- Se nombraron conceptos propios del diario en vez de introducir una abstracción genérica.
- Se preservaron expresiones regulares, excepciones de recuperación, códigos de error, tipos exportados y serialización.
- Se dejó fuera el publicador, la inspección y el ejecutor para que esta PR tenga una sola razón de cambio y un presupuesto revisable.
- Se siguió el estilo de comentarios del proyecto: explicar intención y riesgo, con un único acento `FAIL CLOSED ->`.

## // 004. VERIFICACIÓN

- verify: `bun test tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts tests/release-update-integration.test.ts`
- Resultado enfocado: 33 pass, 0 fail, 248 assertions.
- `bun test` — 2900 pass, 0 fail, 14128 assertions, 209 files.
- `bun run typecheck` y `cd installer && bun run typecheck` — pass.
- `git diff --check` y lint SDD — pass.
- `behavior_coverage: verified`: la matriz existente cubre formas, secuencias, recuperación, reentrada y estados terminales.

## // 005. PENDIENTE / RIESGOS

- `publish`, `inspectInstallJournal` y `executeInstallPlanJournaled` siguen concentrando lógica; serán fronteras independientes, no una ampliación de esta PR.
- No hay migración de datos ni cambio observable previsto. El riesgo residual es una diferencia de precedencia no representada en la matriz existente; la suite completa y las pruebas enfocadas reducen ese riesgo.
