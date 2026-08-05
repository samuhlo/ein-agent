## // 000. RESUMEN
Harden-scope-retries hace reanudable `sdd-scope`: un delta OpenSpec persistido y válido conserva autoridad exacta en los reintentos. El router ahora bloquea de forma determinista el avance a `map` cuando la procedencia canónica está `unresolved` o `conflict`, sin alterar los estados elegibles ni el flujo legacy.

## // 001. QUÉ CAMBIÓ
- `ein-pi/core/agents/sdd-scope.md`: preflight obligatorio del delta persistido antes de `none`, escritura, reemplazo o regeneración; preservación byte a byte y fallback existente para procedencia ausente/inválida.
- `ein-pi/agent/lib/sdd-router.ts`: candidatos canónicos `map` pasan a `scope` con blocker y acción específicos para `unresolved`/`conflict`; `pending`/`synchronized` siguen avanzando a `map`.
- `tests/sdd-flow-contract.test.ts`, `tests/sdd-router.test.ts`, `tests/sdd-next-dispatcher.test.ts`: cobertura de contrato, matriz de estados, límites y diagnósticos.
- `tests/sdd-status-output.test.ts`: remediación de expectativa obsoleta para mostrar `next: scope` y el blocker aprobado.

## // 002. CÓMO FUNCIONA POR DENTRO
El contrato de `sdd-scope` exige validar primero la declaración y el conjunto completo de deltas mediante las autoridades existentes; si es válido, sus bytes quedan preservados y no se ejecutan operaciones destructivas. Si falta o es inválido, continúa el camino de declaración existente, sin reconciliación.

`resolveSddStatus()` reutiliza `specState` ya calculado. Sólo en el candidato ordinario `map` de un cambio canónico con `scope.md` y sin `map.md`, `unresolved` y `conflict` aplican una compuerta fail-closed hacia `scope`; `resolveSddNext()` transmite la razón/acción específica. Dispatcher y salida de status exponen esa misma decisión, sin duplicar evaluación.

## // 003. DECISIONES
- Se eligió una regla contractual, no transacciones, staging, rollback ni reconciliación: no existe ejecutor runtime de scope y la autoridad ya está en el parser/evaluador existente.
- Se conservó el vocabulario `SddNext`: `scope` es la ruta compatible de remediación y el diagnóstico identifica la procedencia bloqueada.
- La compuerta es estrecha: no bloquea `pending`, `synchronized`, fases posteriores, cambios legacy `.sdd`, ni modifica sincronización o close-readiness.

## // 004. VERIFICACIÓN
- Suite enfocada: 72 pasaron, 0 fallaron; status: 22 pasaron, 0 fallaron.
- Suite completa Bun: 1.080 pasaron, 0 fallaron en 90 archivos.
- `cd installer && bun run typecheck`: correcto (`tsc --noEmit`).
- `git diff --check`: correcto. Se verificaron RED/GREEN/TRIANGULATE/REFACTOR y la remediación del test stale fue sólo de expectativas.

## // 005. PENDIENTE / RIESGOS
- La preservación byte a byte tiene cobertura estática de contrato, porque no existe ejecutor runtime de `sdd-scope`.
- Los artefactos de `optimize-tdd-verify` son contenido preexistente no trackeado; no fueron tocados.
- La suite completa emite un warning no bloqueante preexistente de `git diff --no-index`.
