status: complete

# Apply progress — Pieza 1 + Pieza 2 + cierre de alcance

Pieza 1 (regla del envelope) queda como se registró antes, sin cambios. Esta
entrada añade Pieza 2 (canal determinista de `summary.md` para `sdd-close` en
Claude) y el delta de spec que cierra el alcance.

## Pieza 2 — qué se hizo

- `ein-pi/agent/lib/sdd-summary-write.ts` (nuevo): `writeSddSummary({ cwd,
  change, content })`, espejo de `writeOpenSpecDelta`. Rechaza `change`
  inexistente en disco (`no-change`), nombre inseguro vía `isSafeChangeName`
  (`invalid-change`), contenido vacío/solo-espacios (`empty-content`); escribe
  en `openspec/changes/<change>/summary.md` cuando todo es válido.
- `cc-ein/sdd-cli/cli.ts`: `runSummaryCommand(dir, args, rawStdin)` + `case
  "summary"` + `summaryCmd` + usage/cabecera — espejo exacto de
  `runDeltaCommand`/`deltaCmd`. `cc-ein-sdd summary [change] < summary.md`.
- `ein-pi/core/agents/sdd-close.md`: `tools: read, grep, find, write, bash`
  (+6 bytes; presupuesto de `core/agents/*.md` seguía en 83.041/83.053 → ahora
  83.047, dentro del tope. No se tocó la prosa del agente: el diseño (D5) exige
  que la indicación de usar el CLI viva en `sdd-remedies.ts`, no en el prompt,
  precisamente porque no quedaba margen).
- `ein-pi/agent/lib/sdd-remedies.ts`: nuevo `summaryChannelRemedy(nextPhase,
  runtime)` + campo `nextPhase` en `collectSddRemedies`. Cuando
  `runtime==="claude"` y la siguiente fase es `close`, el remedio nombra `cc-
  ein-sdd summary <change>` en la salida de `cc-ein-sdd status`. Guía calculada
  desde el estado, no prosa fija.
- `cc-ein/sdd-cli/cli.ts` (statusCmd): pasa `status.nextRecommended` como
  `nextPhase` a `collectSddRemedies`.
- Ajustes colaterales de contrato: `ein-pi/agent/assets/orchestrator.md`
  actualiza la fila de tools de `sdd-close` (el test
  `agent-tools-contract.test.ts` exige que tabla y frontmatter coincidan).

### Honestidad sobre lo que esto garantiza (`// 007`)

Que el modelo invoque `cc-ein-sdd summary` en vez de rehusarse otra vez NO es
determinista y no se testea — nada en este cambio lo hace comprobable por
test. Lo que SÍ garantiza el código: la negativa a `Write` deja de ser
TERMINAL, porque existe un canal de persistencia (`writeSddSummary` +
`runSummaryCommand`) que no depende de que el agente cree el fichero por
iniciativa propia, y `sdd-remedies.ts` lo nombra en la salida de `status`
justo cuando la siguiente fase es `close` en Claude. La comprobación real de
si esto reduce la tasa de negativa es empírica (una ejecución real de
`sdd-close` en Claude), no una propiedad de test.

## TDD Cycle Evidence (Pieza 2)

| seam | RED (observado) | GREEN | TRIANGULATE | comando final asociado |
|---|---|---|---|---|
| `writeSddSummary` rechaza change inexistente/inseguro/contenido vacío y escribe en la ruta computada | `Cannot find module '../ein-pi/agent/lib/sdd-summary-write.ts'` (0 pass, error de import) | 4 tests del módulo pasan tras implementarlo | `change: "../escape"` cubierto como caso propio (rechazo por `isSafeChangeName`, no por azar de `join`) — ya incluido en el set GREEN, sin necesidad de una segunda ronda roja | `bun test tests/sdd-summary-write.test.ts` |
| `runSummaryCommand` — exitCode 1 con stdin vacío, exitCode 0 en el caso bueno | mismo RED de import ausente (el símbolo no existía en `cli.ts`) | 2 tests pasan tras añadir el subcomando y su dispatch | — | `bun test tests/sdd-summary-write.test.ts` |
| `collectSddRemedies` nombra `cc-ein-sdd summary` para runtime claude + nextPhase close, y calla en pi | mismo RED de import (la firma con `nextPhase` no existía) | 2 tests pasan tras añadir `summaryChannelRemedy` y el campo `nextPhase` | — | `bun test tests/sdd-summary-write.test.ts` |

## Cierre de alcance

- Delta de spec registrado: `cc-ein-sdd delta harden-subagent-envelope-contract
  --domain surface-wiring` desde JSON estructurado por stdin (nunca markdown a
  mano) — 5 escenarios ADDED en `openspec/specs/surface-wiring/spec.md`
  (mapeo directo a R1-R5 de `design.md`): inventario declarado exacto (R1),
  protección presente para `silent-incorrect-state` (R2), clasificación por
  modo de fallo para `loud-wasteful`/`safe-degradation` (R3), asimetría
  Pi/Claude declarada (R4), canal determinista de `summary.md` (R5).
- `cc-ein-sdd sync harden-subagent-envelope-contract` → `outcome:
  "synchronized"`, `canonicalChanged: true`, `domains: ["surface-wiring"]`.
- `scope.md` revocó su `spec_delta: none` original (bloque de declaración
  eliminado, reemplazado por una nota en prosa que apunta al delta real) —
  `lintChange` exigía exactamente un delta válido o una declaración `none`
  válida, nunca ambos; con el bloque `## Spec delta declaration` presente
  aunque dijera `present`, el guard seguía viéndolo como declaración sin
  resolver. Confirmado con `cc-ein-sdd check`: `errors: 0`.
- `tasks.md ausente` que reportaba `cc-ein-sdd status` es ruido esperado del
  carril micro (`design.md` es el contrato ejecutable); no es un blocker real
  de este cierre.

## Verificación (Pieza 2 + cierre)

- `bun test tests/sdd-summary-write.test.ts` — 8 pass / 0 fail.
- `bun test tests/prompt-budget.test.ts` — verde, sin tocar presupuestos (los
  6 bytes de `, bash` entraron con margen).
- `bun test tests/agent-tools-contract.test.ts` — verde tras sincronizar la
  fila de `sdd-close` en `orchestrator.md` con el frontmatter real.
- `bun test` completo — **2264 pass / 0 fail** (2256 previos + 8 nuevos de
  Pieza 2). Sin aparición del PTY intermitente conocido en esta corrida.
- `tsc --noEmit` en la raíz — limpio, sin salida.
- `cc-ein-sdd check harden-subagent-envelope-contract` — `errors: 0`
  (warnings preexistentes de `design.md`: oversize/missing-proposal/missing-
  spec, fuera del alcance de esta pieza — el carril micro usa `design.md`
  como contrato ejecutable, no la plantilla estándar).

## Deviations

- Ninguna respecto al diseño de Pieza 2. El único ajuste no anticipado en el
  texto de `design.md` fue el bloque `## Spec delta declaration` de
  `scope.md`: había que retirarlo por completo (no solo cambiar el valor) para
  que `lintChange` reconociera el delta real — mecánica de
  `readSpecDeltaDeclaration`, no una decisión de diseño.

## Qué se hizo (Pieza 1)

- `ein-pi/agent/lib/subagent-envelope-contract.ts` (nuevo): regla en cabecera
  (MUST/SHOULD/MAY por modo de fallo, límites declarados `// 007`, condición de
  retirada), `ENVELOPE_CONSUMER_INVENTORY` con los 4 consumidores reales del
  handler `pi.on("tool_result")` de `ein-ai.ts:934-968` clasificados por modo de
  fallo (`completeSddParticipantCall` silent-incorrect-state/foreground-forced,
  `acceptTrackedScoutResult` loud-wasteful/scout-launch-normalized,
  `participantResultIsUnrecognized` y `originalError` safe-degradation/none), y
  funciones puras: `extractToolResultHandlerBody`, `findEnvelopeConsumers`
  (escaneo con balanceo de paréntesis sobre llamadas + forma receptora
  `const x = event.content...`), `extractNamedFunctionBody`,
  `auditEnvelopeConsumers` (R2: silent-incorrect-state sin protección `none` es
  hallazgo automático; protección declarada se verifica leyendo la fuente real).
- `tests/subagent-envelope-contract.test.ts` (nuevo): 8 tests — T1 unitario
  sobre fixtures (4 casos), T2 integración contra el handler real de
  `ein-ai.ts` (igualdad de conjuntos + caso de novedad no declarada), T3
  integración contra `sdd-preflight.ts`/`scout-contract.ts` reales (auditoría en
  verde + reclasificación de triangulación).

## TDD Cycle Evidence

| seam | RED (observado) | GREEN | TRIANGULATE | comando final asociado |
|---|---|---|---|---|
| detector de novedad exige inventario declarado exacto contra el handler real | `Cannot find module '../ein-pi/agent/lib/subagent-envelope-contract.ts'` (módulo movido a `/tmp`, 0 pass / 1 error) | 8 pass tras restaurar el módulo | inserción manual de una 5ª llamada ficticia (`debugLogEnvelopePayload(event.content)`) en el handler real → `toEqual` falla mostrando el id nuevo no declarado; revertido y confirmado 8/8 verde de nuevo | `bun test tests/subagent-envelope-contract.test.ts` |
| protección declarada `silent-incorrect-state` MUST existir en la fuente (R2) | mismo RED de import ausente cubre este seam (módulo inexistente) | fixture sin `input.async = false` produce hallazgo; fixture con fuentes reales pasa | reclasificar el consumidor 4 (`originalError`, hoy safe-degradation) como `silent-incorrect-state` sin añadir protección → auditoría cae a `ok:false` (R2 exige protección != none) | `bun test tests/subagent-envelope-contract.test.ts` |

## Lo que el test NO cubre (declarado, `// 007`)

No previene "el tercer consumidor" en general: mundo cerrado sobre
`pi.on("tool_result")` de `ein-ai.ts`. Un consumidor cableado por otro hook, o
que reciba el texto del envelope indirectamente, se escapa. Cero cobertura en
Claude (no existe interceptación de resultados de subagente ahí); la asimetría
queda para el delta de spec de la Pieza 2/cierre, no fingida como paridad.

## Verificación

- `bun test tests/subagent-envelope-contract.test.ts` — 8 pass / 0 fail.
- `bun test` completo — 2256 pass / 0 fail (2248 previos + 8 nuevos). Sin
  aparición del PTY intermitente conocido en esta corrida.
- `bun test tests/prompt-budget.test.ts` — 3 pass / 0 fail, presupuestos
  intactos (esta pieza no toca `core/agents/*.md`).
- `tsc --noEmit` en la raíz — limpio, sin salida.

## Deviations (Pieza 1)

- Ninguna respecto al diseño de Pieza 1. En su momento no se registró el delta
  de spec; queda cubierto por "Cierre de alcance" arriba, en esta misma
  entrega.

## Files changed

`ein-pi/agent/lib/subagent-envelope-contract.ts`
`tests/subagent-envelope-contract.test.ts`
`ein-pi/agent/lib/sdd-summary-write.ts`
`tests/sdd-summary-write.test.ts`
`cc-ein/sdd-cli/cli.ts`
`ein-pi/agent/lib/sdd-remedies.ts`
`ein-pi/core/agents/sdd-close.md`
`ein-pi/agent/assets/orchestrator.md`
`openspec/changes/harden-subagent-envelope-contract/scope.md`
`openspec/specs/surface-wiring/spec.md`
`openspec/changes/harden-subagent-envelope-contract/sync-report.md`
