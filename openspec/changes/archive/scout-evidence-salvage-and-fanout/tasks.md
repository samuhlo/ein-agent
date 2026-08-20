status: ready
blocked_by: none
change: scout-evidence-salvage-and-fanout
phase: tasks

# Tasks — scout-evidence-salvage-and-fanout

`strict_tdd: true`. Cada tarea de comportamiento entra en RED antes que en GREEN.

- verify: `bun test && bun run typecheck`

## Bloque 1 — RED: los tests dicen lo nuevo

- [x] 1.1 Reescribir `tests/readonly-scout-contract.test.ts:149,167`: el rango pasado de EOF ahora se recorta y se acepta; el caso `startLine` fuera del fichero sigue en rojo (R1).
- [x] 1.2 Añadir test de mensaje diagnosticable: el rechazo nombra id, path, rango citado y líneas reales (R2).
- [x] 1.3 Añadir test de salvamento parcial con el caso real medido — 12 referencias, 1 irrecuperable, 11 supervivientes + incertidumbre sintética (R3).
- [x] 1.4 Añadir test de rechazo total: sin referencias vivas, sin findings vivos, o `summaryReferenceIds` vacío (R3.5).
- [x] 1.5 Añadir test de fan-out: 3 ramas con una malformada devuelven 2 válidas; 4 ramas se rechazan; 1 resultado sigue devolviendo el reporte pelado (R4).
- [x] 1.6 Reescribir el bloque R6 del test: el segundo scout concurrente ya no se rechaza (R4).
- [x] 1.7 Actualizar `tests/orchestrator-context-diet.test.ts:98-105` a la prosa de fan-out paralelo (R6).
- [x] 1.8 Confirmar RED: `bun test tests/readonly-scout-contract.test.ts tests/orchestrator-context-diet.test.ts` falla por las razones esperadas, no por otras.

## Bloque 2 — GREEN: Pieza 1

- [x] 2.1 `validateReference` → `checkReference(root, ref)` devuelve `{ ok, reference }` o `{ ok: false, reason }` en vez de lanzar; clamp de `endLine` cuando `startLine` cabe (R1).
- [x] 2.2 Todos los motivos de rechazo nombran id, path, rango y líneas reales (R2).
- [x] 2.3 `validateScoutReport`: coherencia interna estricta ANTES del disco (ids únicos, ids conocidos, sin huérfanas), salvamento después (R3).
- [x] 2.4 Barrido de descarte: referencia fuera, findings sin referencias vivas fuera, `summaryReferenceIds` podado, referencias huérfanas sobrevenidas retiradas en silencio (R3.1-R3.4).
- [x] 2.5 Incertidumbre sintética por descarte, sin aplicar el tope de 8 a la salida (R3.6).
- [x] 2.6 Rechazo total solo si no queda evidencia viva (R3.5).

## Bloque 3 — GREEN: Pieza 2

- [x] 3.1 `unsupportedForm` deja de rechazar `workflowScriptFansOut`; el resto de formas no soportadas siguen fuera (R4).
- [x] 3.2 Retirar la puerta de scout pendiente único en `normalizeScoutLaunch`; conservar `async: false` en las dos formas (R4).
- [x] 3.3 `scoutReportText` → validación por resultado; 1 resultado devuelve el reporte pelado, N devuelven `ein-scout-fanout/v1` (R4).
- [x] 3.4 Bound de 3 ramas aplicado en el contrato, no solo en la prosa (R4).
- [x] 3.5 `OFF_CONTRACT_LIMIT` re-apuntado: solo fallo total; en fan-out, solo si caen todas las ramas (R5).
- [x] 3.6 `ein-ai.ts:988-991` devuelve la forma nueva sin romper el camino de un solo scout (R4).

## Bloque 4 — Prosa y contrato declarado

- [x] 4.1 `orchestrator.md:150,152`: fan-out en paralelo, una sola llamada; sale "one scout per turn" (R6).
- [x] 4.2 `ein-scout.md`: "Ein rejects any reference it cannot resolve" → la verdad nueva, sin ganar bytes ni añadir procedimiento (R6).
- [x] 4.3 `subagent-envelope-contract.ts:63-67`: nota reescrita y `failureMode` a `safe-degradation` (R6).
- [x] 4.4 `bun test tests/prompt-budget.test.ts` en verde sin tocar ningún techo (R6).

## Bloque 5 — Verificación

- [x] 5.1 `bun test` completo en verde.
- [x] 5.2 `bun run typecheck` limpio.
- [x] 5.3 Regresión con evidencia real: los dos reportes de `~/.pi-ein/agent/sessions/…/subagent-artifacts/` que hoy se descartan pasan el contrato nuevo con 12/12 y 10/10 referencias tras el clamp.
