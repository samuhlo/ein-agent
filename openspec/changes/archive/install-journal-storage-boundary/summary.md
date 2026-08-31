status: complete
change: install-journal-storage-boundary
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La persistencia segura del diario de instalación queda separada de su validación y de la ejecución del plan. La fachada pública no cambia, pero el acceso al disco tiene ahora una responsabilidad única, comprobable y pequeña.

## // 001. QUÉ CAMBIÓ

- `installer/src/core/install-journal-store.ts`: ruta gestionada, filesystem real, recorrido seguro, permisos privados, límite de bytes y publicación atómica.
- `installer/src/core/install-journal.ts`: conserva los exports públicos y traduce entre bytes almacenados y diarios semánticamente válidos.
- `tests/install-journal.test.ts`: regresión para un filesystem cuya metadata declara menos bytes de los que entrega.

## // 002. CÓMO FUNCIONA POR DENTRO

El almacén comprueba que el home y sus ancestros sean directorios reales, que el directorio gestionado sea privado y que el fichero sea regular y acotado. Al escribir usa un temporal exclusivo, completa y sincroniza sus bytes, renombra, sincroniza el directorio y relee el resultado. Sólo entonces la fachada parsea el JSON canónico y valida la máquina de estados.

## // 003. DECISIONES

- El almacén devuelve `available`, no `valid`: tener bytes protegidos no demuestra que su significado sea correcto.
- No se añadió una interfaz genérica de repositorio, una clase ni una fábrica; dos funciones de dominio resuelven el dolor actual.
- `InstallJournalFs` e `installJournalPath` siguen reexportados desde la fachada para no mover a los consumidores.
- El único comentario nuevo explica la garantía atómica con el acento `BLINDAJE ->`; el resto se expresa mediante nombres.

## // 004. VERIFICACIÓN

- verify: `bun test tests/install-journal.test.ts tests/architecture-boundaries.test.ts`
- Resultado enfocado: 24 pass, 0 fail, 207 assertions.
- `bun test`: 2905 pass, 0 fail, 14150 assertions, 209 files.
- `bun run typecheck` y `cd installer && bun run typecheck`: pass.
- `git diff --check` y lint SDD: pass.
- `behavior_coverage: verified`: rutas, permisos, tamaño real/declarado, fallos de filesystem, publicación, reentrada y fronteras.

## // 005. PENDIENTE / RIESGOS

- `executeInstallPlanJournaled` sigue concentrando reentrada, checkpoints, señales y lifecycle; será una unidad posterior con sus propias pruebas.
- No hay migración ni cambio de bytes. El riesgo residual es una diferencia no cubierta en un filesystem no conforme; la inyección y la matriz de fallos mantienen esa frontera explícita.
