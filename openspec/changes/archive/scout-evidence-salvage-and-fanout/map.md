status: ready
scope_status: bounded
change: scout-evidence-salvage-and-fanout
phase: map
budget_consumed: max_tokens: 4200
budget_exceeded: false
verified_rev: "f5970ad"

# Map — scout-evidence-salvage-and-fanout

## Resultado ejecutivo

Todo el comportamiento vive en UN módulo puro: `ein-pi/agent/lib/scout-contract.ts`
(216 líneas, sin dependencias del runtime). El adaptador `ein-ai.ts` solo lo toca
en dos puntos. La superficie de prosa que afirma la regla vieja son tres ficheros
y cuatro tests. No hay ningún consumidor fuera de Ein.

## Superficie de código

| Fichero | Qué cambia | Pieza |
|---|---|---|
| `ein-pi/agent/lib/scout-contract.ts:155-161` | `validateReference`: clamp de `endLine`, mensajes que nombran la cita | 1 |
| `ein-pi/agent/lib/scout-contract.ts:163-172` | `validateScoutReport`: salvamento parcial en vez de `throw` al primer fallo | 1 |
| `ein-pi/agent/lib/scout-contract.ts:40-47` | `unsupportedForm`: deja de rechazar `workflowScriptFansOut` | 2 |
| `ein-pi/agent/lib/scout-contract.ts:180-196` | `scoutReportText`: N resultados, no exactamente 1 | 2 |
| `ein-pi/agent/lib/scout-contract.ts:56-75` | `normalizeScoutLaunch`: retirar la puerta "un scout pendiente por turno" | 2 |
| `ein-pi/agent/extensions/ein-ai.ts:988-991` | Devolver N reportes en vez de uno | 2 |

`ein-pi/agent/lib/delegation-shape.ts` NO cambia: `workflowScriptFansOut` sigue
siendo el detector correcto, solo deja de ser motivo de rechazo.

## Blast radius

Consumidores reales de `scout-contract.ts` (grep exhaustivo, sin node_modules):

- `ein-pi/agent/extensions/ein-ai.ts:141` — único consumidor de producción.
- `tests/readonly-scout-contract.test.ts` — 257 líneas, el test de contrato.
- `tests/delegation-shape.test.ts:51` — importa `normalizeScoutLaunch`.
- `tests/subagent-envelope-contract.test.ts:14` — audita el FUENTE del fichero
  por texto (`scout-launch-normalized`), no su comportamiento.
- `tests/scout-live-smoke.ts` — smoke con modelo real, no corre en `bun test`.

`ENVELOPE_CONSUMER_INVENTORY` (`subagent-envelope-contract.ts:63-67`) declara
`acceptTrackedScoutResult` con `failureMode: "loud-wasteful"` y
`protection: "scout-launch-normalized"`. La Pieza 1 ataca exactamente ese
`loud-wasteful`; la nota del inventario ("el reporte se tira y se marca
off-contract; el trabajo del scout ya se pagó") queda obsoleta y hay que
reescribirla. La protección `scout-launch-normalized` sigue vigente: `async:
false` no se toca — el foreground sigue siendo obligatorio, lo que se retira es
la exclusividad.

## Superficie de prosa

| Fichero | Línea | Afirma la regla vieja |
|---|---|---|
| `ein-pi/agent/assets/orchestrator.md` | 150 | Encabezado `## Read-only fan-out (sequential)` |
| `ein-pi/agent/assets/orchestrator.md` | 152 | "one scout per turn"; "a second scout launched while one is still pending is rejected" |
| `ein-pi/agent/assets/orchestrator.md` | 53 | "returns off-contract twice → incidente de infraestructura" |
| `ein-pi/core/agents/ein-scout.md` | contrato de reporte | "Every `path`+`lines` must point to real lines"; sin procedimiento |

## Tests que hoy afirman lo contrario (RED esperado)

| Test | Línea | Aserción que se invierte |
|---|---|---|
| `tests/readonly-scout-contract.test.ts` | 149 | `lines: "1-99"` sobre fichero de 3 líneas → `toThrow("line range")` |
| `tests/readonly-scout-contract.test.ts` | 167 | `endLine: 99` → `toThrow("line range")` |
| `tests/orchestrator-context-diet.test.ts` | 98-105 | exige `## Read-only fan-out (sequential)`, `not.toContain("## Parallel read-only fan-out")`, `/one scout per turn/` |
| `tests/readonly-scout-contract.test.ts` | (bloque R6) | rechazo del segundo scout concurrente |

`tests/orchestrator-scope-gate.test.ts:31` exige el límite hard de 3 ramas: ese
NO se invierte, se conserva.

## Presupuesto de prompt (`// 004`)

`tests/prompt-budget.test.ts` impone techo a `orchestrator.md` y al total de
`core/agents/*.md`, y un tercer test falla si el techo queda >15% holgado. El
cambio de prosa tiene que ser **neto ≤ 0**: la sección de fan-out gana "en
paralelo, una sola llamada" y pierde "uno por turno" + la frase del rechazo del
segundo scout. Sale más de lo que entra.

## Riesgo residual

El clamp acepta una cita cuyo final el modelo inventó por arriba. Se asume a
conciencia: el `startLine` real y la existencia del fichero siguen verificados,
y el coste de la alternativa está medido — dos reportes buenos a la basura por 2
y 4 líneas. `// 002` se respeta porque el recorte no se esconde: la referencia
recortada viaja con su procedencia.
