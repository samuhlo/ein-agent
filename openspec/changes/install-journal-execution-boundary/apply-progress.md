# Apply progress — install-journal-execution-boundary

status: partial

## // 001. Codec — PR 1

Completada 1.1. `install-journal-codec.ts` posee validación compuesta, encode canónico y parse fail-closed. `install-journal.ts` conserva la API pública y consume el codec sin cambiar persistencia ni ejecución.

## // 002. Política pura — PR 2

Completadas 2.1 y 2.2. `install-journal-policy.ts` es el único dueño de clasificación, preparación y transiciones. CLI y coordinador consumen `classifyInstallJournalResume`. La transición de retirada legacy elimina el recovery ya resuelto y permite que el retry anunciado alcance `complete` sin repetir entradas anteriores.

## // 003. Persistencia — PR 3

Completada 3.1. `install-journal-persistence.ts` compone codec y store: inspecciona como `missing|valid|invalid` y publica con el error estable `journal-write-failed`. La fachada conserva `inspectInstallJournal` por reexport y el coordinador usa la nueva publicación.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Codec canónico | El focused run falló al no existir `install-journal-codec.ts` | 22 pruebas pasaron tras extraer validate/encode/parse | Malformed, whitespace no canónico, campo extra y estado inalcanzable convergen en `recovery-required` | Los nombres públicos expresan dirección y el módulo sólo depende de contrato, forma y alcanzabilidad | `bun test tests/install-journal-codec.test.ts tests/install-journal.test.ts` |
| Clasificación única de resume | El focused run falló al no existir `install-journal-policy.ts` | Backup y retirada devolvieron dos clases cerradas; los ambiguos devolvieron null | CLI y coordinador pasaron a consumir la misma función y los casos startup existentes siguieron verdes | Las cuatro copias se redujeron a un dueño con helpers privados | `bun test tests/install-journal-policy.test.ts tests/install-journal.test.ts` |
| Transiciones puras y retry de retirada | El módulo ausente dejó rojas preparación, pending, complete, failure e interruption | Todos los estados producidos pasaron `validateInstallJournal` sin mutar la entrada | Una prueba integrada falló conceptualmente en la implementación anterior y ahora demuestra que el segundo intento sólo ejecuta `shared.retire-legacy` | Se usaron funciones de dominio con nombre; no se introdujo reducer genérico | `bun test tests/install-journal-policy.test.ts tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts` |
| Persistencia codec + store | El focused run falló al no existir `install-journal-persistence.ts` | Publicación e inspección canónica pasaron con filesystem real | Missing, bytes no canónicos, estado inalcanzable y fallo de open conservaron resultados distintos | La frontera quedó en dos funciones y el store sigue poseyendo toda la atomicidad | `bun test tests/install-journal-persistence.test.ts tests/install-journal-codec.test.ts tests/install-journal.test.ts` |

## Files changed

- `installer/src/core/install-journal-codec.ts`
- `installer/src/core/install-journal-policy.ts`
- `installer/src/core/install-journal-persistence.ts`
- `installer/src/core/install-journal.ts`
- `installer/src/cli/install.ts`
- `tests/install-journal-codec.test.ts`
- `tests/install-journal-policy.test.ts`
- `tests/install-journal-persistence.test.ts`
- `tests/install-journal.test.ts`
- artefactos de `openspec/changes/install-journal-execution-boundary/`

## Verification run in apply

- `bun test tests/install-journal-codec.test.ts tests/install-journal.test.ts` — 22 pass, 0 fail, 193 assertions.
- `cd installer && bun run typecheck` — pass.
- PR 2 focused: 27 pass, 0 fail, 221 assertions.
- PR 2 root and installer typechecks — pass.
- PR 2 full suite: 2.923 pass, 0 fail, 14.252 assertions, 211 files.
- PR 3 focused: 25 pass, 0 fail, 205 assertions.
- PR 3 installer typecheck — pass.
- PR 3 root typecheck — pass; full suite: 2.925 pass, 0 fail, 14.259 assertions, 212 files.

## Remaining

Pendientes política pura, persistencia y coordinador/fachada.
