status: complete

# Apply progress — fix-participant-result-registration

Carril micro; `design.md` es el contrato ejecutable. Esta entrada cubre
**SOLO el Fallo A** (registro del resultado del participante). B y C quedan
para otra delegación.

## Fallo A — implementado (TDD estricto)

R1 (foreground forzado), R2 (recogida no destructiva por forma), R3 (sin
estado desde `subagent_wait`), R4 (canario de recogida) según `design.md //
002`.

### TDD Cycle Evidence

| Seam | RED (real) | GREEN | Comando final |
| --- | --- | --- | --- |
| Handle de lanzamiento deja `running` intacto → replan da `blocked` ("already running") en vez de `ready` repetido | A1: `expected "blocked", received "ready"` | pasa | `bun test tests/sdd-participants.test.ts` |
| Resultado terminal en el mismo `toolCallId` tras un handle previo completa el pasaje | A2: `expected "complete", received "ready"` | pasa | `bun test tests/sdd-participants.test.ts` |
| `ensureParticipantForeground` fija `async:false`/`foregroundOnly:true` sobre task con marcador de participante, incluso con `async:true` explícito; no toca delegaciones no-participante | A3: `expected true, received false` (función no existía) | pasa | `bun test tests/sdd-participants.test.ts` |
| `participantResultIsUnrecognized` distingue handle/`subagent_wait` (con rastreo) de un terminal reconocido | A4: `expected true, received false` (función no existía) | pasa | `bun test tests/sdd-participants.test.ts` |

RED se capturó ANTES de tocar `sdd-participants.ts`/`sdd-preflight.ts`
(commit intermedio de stubs `return false` para exponer la forma de la API sin
implementar la lógica); los cuatro casos fallaron con la aserción real, no con
un error de import. Ningún test existente se relajó: `finish()` y las tres
llamadas directas a `completeSddParticipantCall` en el fichero pasaron a
entregar `details` con forma terminal (`{ mode, results: [{ agent, task,
finalOutput }] }`), preservando exactamente el comportamiento previo para
todos los tests no-RED.

### Qué cambió

- `sdd-participants.ts`: `completeSddParticipantCall` gana un 5º parámetro
  `details`. Solo consume `callPassages`/`running` cuando `details.results[]`
  trae un `SingleResult` con `finalOutput` string (terminal por forma, no por
  texto) o cuando `failed === true`. Nuevo `participantResultIsUnrecognized`
  (predicado puro, espejo del canario de admisión) y
  `sddParticipantCallsAreTracked` (para que el canario distinga "forma
  desconocida" de "nada rastreado").
- `sdd-preflight.ts`: nuevo inyector puro `ensureParticipantForeground` —
  fuerza `async:false`+`foregroundOnly:true` sobre cualquier delegación cuyo
  task contenga `[ein-sdd-participant/v1 `, sobrescribiendo un `async`
  explícito (fail-closed, a diferencia de los demás inyectores).
- `ein-ai.ts`: llama a `ensureParticipantForeground(event.input)` en
  `tool_call` junto a los demás inyectores de participante; en `tool_result`
  pasa `event.details` a `completeSddParticipantCall`, trata
  `subagent_wait` únicamente como señal de canario (nunca como fuente de
  evidencia) y avisa una vez por sesión (`ctx.ui.notify(..., "warning")`) si
  la forma no se reconoce.
- `i18n/strings.ts`: clave `ai.delegation.participant-result-drift`
  (EN + ES).

### Comandos ejecutados

- `bun test tests/sdd-participants.test.ts` → 34 pass, 0 fail (evidencia GREEN
  final de los 4 seams de Fallo A + toda la suite existente sin relajar).
- `bunx tsc --noEmit` → limpio.
- `bun test` (suite completa) → 2245 pass, 0 fail. No se reprodujo el fallo
  preexistente citado en el diseño (`Claude continuity supervisor > runs real
  PTY ...`); no estaba presente en esta ejecución. No es una regresión de este
  cambio (Fallo A no toca ese área) y no se investiga más por estar fuera de
  alcance.

### Desviaciones del diseño

Ninguna relevante. `warnParticipantResultDrift` reutiliza el patrón exacto del
canario de admisión existente (`shapeDriftWarned`) con un `Set` hermano
(`participantResultDriftWarned`), tal como pide `// 002 A-3`.

## Fallo B — implementado (TDD estricto)

R5 (identidad de pasaje sin `order`), R6 (liberación prospectiva), R7
(resultado tardío de un desactivado descartado) según `design.md // 003`.

### TDD Cycle Evidence

| Seam | RED (real) | GREEN | Comando final |
| --- | --- | --- | --- |
| Desactivar el Architect pendiente tras completar el Cleaner libera el pasaje (`order` se estrecha, `complete`, `guardSddVerify` desbloquea, `passageId` estable, evidencia del Cleaner sobrevive) | `expected ["ein-cleaner"], received ["ein-cleaner","ein-architect"]` | pasa | `bun test tests/sdd-participants.test.ts` |
| Desactivar el Cleaner antes de correr lo excluye del orden efectivo; reactivarlo lo devuelve como `next` con `passageId` estable | `expected ["ein-architect"], received ["ein-cleaner","ein-architect"]` | pasa | `bun test tests/sdd-participants.test.ts` |
| Un `blocked` tardío de un participante recién desactivado no vuelve a bloquear el pasaje | `expected ["ein-architect"], received ["ein-cleaner","ein-architect"]` | pasa | `bun test tests/sdd-participants.test.ts` |

RED capturado ANTES de tocar `sdd-participants.ts` (los 3 casos fallaban con
la aserción real de `order`, no con un error de import). Ningún test existente
se relajó; dos tests preexistentes (`first post-apply plan freezes order
across sessions`, `restart hydrates durable completion...`) fueron RED
colateral tras el cambio real: el primero encapsulaba una premisa que la
Regla 2 del diseño invalida a propósito (que `order` no reflejara nunca el
estado de control de la sesión que consulta); se actualizó su aserción
(pasa a `passageId` estable + `order: []` para la sesión con override
explícito off, documentado con `// 003 B-2`), no se debilitó. El segundo
(reinicio/crash con sesión nueva sin override) siguió pasando sin tocar
porque la regla efectiva distingue override EXPLÍCITO de sesión (real
`/ein:cleaner off`) de un mero default de proyecto sin tocar — una sesión
nueva tras un crash no pierde visibilidad de trabajo pendiente por defecto.

### Qué cambió

- `sdd-participants.ts`:
  - `participantId()` deja de hashear `order`; identidad =
    `{ change, applyId, scopeId, beforeStateRef }` (Regla 1, `// 003 B-2`).
  - Nuevo `disabledByThisSession()`: solo un override de SESIÓN explícito a
    `off` (no un default de config de proyecto) puede excluir un agente sin
    evidencia — distingue una desactivación real del operador de un default
    ausente en una sesión nueva/reiniciada.
  - Nuevo `effectiveOrder()`: filtra `durable.order` al LEER, conservando
    siempre a quien tenga evidencia; el `order` durable NUNCA se reescribe
    (Regla 2). `passage()` devuelve `effectiveOrder(...)` en vez de
    `durable.order` congelado.
  - `callPassages` gana `sessionKey` (necesario para B-4).
    `completeSddParticipantCall`: si el agente no tenía evidencia previa y
    está desactivado EN LA SESIÓN que lo rastreó, descarta el resultado
    tardío sin escribir evidencia (B-4) — libera `running`/`callPassages`
    igual, pero no vuelve a bloquear el pasaje.
- `tests/sdd-participants.test.ts`: nuevo `describe("disabling a participant
  mid-passage releases it without dropping evidence (Fallo B)")` con los 3
  seams; actualizado el test de "freezes order across sessions" (ver arriba).

### Comandos ejecutados

- `bun test tests/sdd-participants.test.ts` → 37 pass, 0 fail.
- `bunx tsc --noEmit` → limpio.
- `bun test` (suite completa) → 2248 pass, 0 fail. El fallo intermitente
  preexistente (`Claude continuity supervisor > runs real PTY ...`) no
  apareció en esta corrida; sigue siendo flaky conocido y ajeno, no se
  persigue.

### Desviaciones del diseño

`disabledByThisSession` (basado en `source: "session override"` de
`readAgentControlStatus`) es una precisión no explícita literalmente en el
texto del diseño, necesaria para que Regla 2 conviva con los dos tests
preexistentes de reinicio/multisesión sin perder visibilidad de trabajo
pendiente por un default de proyecto ausente. Es coherente con B-2/B-3 del
diseño (la liberación es una acción explícita del operador en su sesión, no
un efecto colateral de config no tocada).

## Fallo C + corrección del delta — implementado (documento, sin ciclo TDD)

R8 (`design.md // 004`). Ambas tareas son de documento; ningún comportamiento
de código nuevo que testear, así que no se fuerza un RED/GREEN artificial —
edición mínima + verificación de que llega al runtime/gate correspondiente.

### Qué cambió

- `ein-pi/core/agents/sdd-close.md`: una línea junto a `## Your primary
  output` declarando que escribir `summary.md` es tarea requerida por el flujo
  SDD, no documentación proactiva — la causa verificada de que `sdd-close` en
  Claude se negara a escribirlo. Verificado que `cc-ein/sync.ts` compila el
  cuerpo del agente verbatim (solo tokens/legacy-signatures explícitos se
  traducen; ninguno choca con la frase nueva), así que llega al prompt
  generado en el siguiente sync. La primera redacción hizo crecer
  `core/agents/*.md` por encima del presupuesto de
  `tests/prompt-budget.test.ts` (+193 bytes); se recortó la frase en varias
  pasadas hasta caber dentro del presupuesto existente (sin subirlo).
- `openspec/changes/fix-participant-result-registration/specs/sdd-lifecycle/spec.md`:
  reescrito. El escenario `participant-result-via-subagent-wait` (premisa
  falsa: `subagent_wait` no transporta estado del participante) se declara
  `REMOVED` con motivo, superseded por el nuevo `ADDED`
  `participant-delegations-run-foreground` (foreground forzado +
  recogida terminal por forma). Se añaden `participant-passage-identity-excludes-order`
  y `disabling-a-pending-participant-releases-the-passage` (Fallo B: `order`
  fuera del hash de identidad, filtrado al leer). `result-collection-drift-warning`
  se declara `MODIFIED` para cubrir también `subagent_wait` con llamadas
  rastreadas como señal de canario. `cc-ein-sdd sync` corrió con éxito:
  `outcome: synchronized`, `added=3 modified=1 removed=1 conflicts=0` (el
  canónico `openspec/specs/sdd-lifecycle/spec.md` ya tenía ambos escenarios
  desde un sync previo de la fase de scope, así que hacía falta MODIFIED/REMOVED,
  no solo ADDED — el primer intento con solo ADDED chocó con `added-existing`).

### Comandos ejecutados

- `cc-ein-sdd sync fix-participant-result-registration` → `ok: true,
  outcome: synchronized`.
- `bunx tsc --noEmit` → limpio.
- `bun test` (suite completa) → 2248 pass, 0 fail. El fallo intermitente
  citado en el diseño (`Claude continuity supervisor > runs real PTY ...`) no
  apareció en esta corrida.

### Desviaciones del diseño

Ninguna de fondo. El ajuste de presupuesto de prompt (recortar la frase varias
veces) fue necesario para no tocar `tests/prompt-budget.test.ts`, no estaba
anticipado en `design.md` pero es consistente con `// 004` (presupuesto de
prompt, sin guardarraíl nuevo).

## Files changed

- `ein-pi/agent/lib/sdd-participants.ts`
- `ein-pi/agent/lib/sdd-preflight.ts`
- `ein-pi/agent/extensions/ein-ai.ts`
- `ein-pi/agent/lib/i18n/strings.ts`
- `tests/sdd-participants.test.ts`
- `ein-pi/core/agents/sdd-close.md`
- `openspec/changes/fix-participant-result-registration/specs/sdd-lifecycle/spec.md`
- `openspec/changes/fix-participant-result-registration/sync-report.md`
- `openspec/specs/sdd-lifecycle/spec.md`
