# Summary: fix-participant-result-registration

## // 000. RESUMEN

El arnés SDD asumía que el resultado de un participante (Cleaner/Architect) llegaba por un
canal que Ein no observa. Con eso, los reintentos giraban en falso y desactivar un
participante a mitad de sesión atrapaba el flujo. Este cambio fuerza foreground en las
delegaciones de participante, lee el resultado por forma en lugar de por texto, y desacopla
la identidad del pasaje del reparto de trabajo — tres piezas que cierran un patrón de fallo
recurrente en el arnés.

## // 001. QUÉ CAMBIÓ

| Fichero | Cambio |
| --- | --- |
| `ein-pi/agent/lib/sdd-preflight.ts` | Inyector `ensureParticipantForeground`: fuerza `async:false` + `foregroundOnly:true` en delegaciones con marcador `[ein-sdd-participant/v1` |
| `ein-pi/agent/extensions/ein-ai.ts` | Llama al inyector en `tool_call`, pasa `details` a la recogida, trata `subagent_wait` solo como canario y avisa ante forma desconocida |
| `ein-pi/agent/lib/sdd-participants.ts` | `participantId` excluye `order` del hash; `effectiveOrder()` filtra el durable al leer; `terminalResultsOf()` valida por forma; `completeSddParticipantCall` consume el rastreo solo en terminal |
| `ein-pi/agent/lib/i18n/strings.ts` | Clave `ai.delegation.participant-result-drift` (EN+ES) |
| `ein-pi/core/agents/sdd-close.md` | Declara `summary.md` como tarea solicitada por el flujo, no documentación proactiva |
| `openspec/changes/.../specs/sdd-lifecycle/spec.md` | Escenario falso (`participant-result-via-subagent-wait`) REMOVED; 3 ADDED + 1 MODIFIED describiendo el mecanismo real |
| `tests/sdd-participants.test.ts` | 7 RED: A1–A4 (registro) + B1–B3 (liberación); todos pasan tras el arreglo |

## // 002. CÓMO FUNCIONA POR DENTRO

**Fallo A — el resultado nunca volvía.** `asyncByDefault: true` en `pi-subagents`: sin
override, la delegación va a segundo plano y el `tool_result` trae `results: []`. El scope
culpaba a `subagent_wait`, un evento que Ein no observa; el diseño verificó
`pi-subagents/src` y confirmó que ese evento no transporta el estado del participante.
Arreglo: foreground forzado (`async:false`, `foregroundOnly:true`) mediante un inyector puro
que sobrescribe incluso un `async` explícito (fail-closed). El resultado llega así en el
MISMO `tool_result` que Ein rastrea por `toolCallId`.

**Recogida no destructiva por forma.** `completeSddParticipantCall` valida la terminalidad
por `finalOutput` dentro de `details.results[]`, no rebuscando texto. Un handle (`results: []`
con `runId`) deja `running` intacto: el siguiente plan responde `blocked: "already running"`
en vez de girar en falso. El canario `participantResultIsUnrecognized` detecta que Ein deje
de reconocer la forma y avisa una sola vez.

**Fallo B — desactivar atrapaba el flujo.** `participantId()` incluía `order` en el hash, así
que recalcular el orden movía el `passageId` y huerfanaba el rastreo. Arreglo: la identidad
pasa a ser `{ change, applyId, scopeId, beforeStateRef }` — los bytes auditados, no quién los
audita. `effectiveOrder()` filtra el durable al leer, conservando siempre a quien tenga
evidencia, y nunca reescribe el checkpoint: el invariante evidencia ⊆ orden queda intacto. Un
resultado tardío de un participante desactivado se descarta sin re-bloquear.

**Fallo C — mitigación.** `sdd-close.md` declara `summary.md` como tarea solicitada por el
flujo SDD.

## // 003. DECISIONES

1. Traer el resultado por el canal que Ein ya observa, en vez de observar tres canales más.
2. Sobrescribir un `async` explícito: un participante inobservable no se admite.
3. Identidad sin `order`: el `passageId` dice QUÉ se audita, no QUIÉN lo audita.
4. El `order` durable nunca se estrecha, para preservar el invariante evidencia ⊆ orden.

## // 004. VERIFICACIÓN

Suite 2248 pass / 0 fail. `tsc --noEmit` limpio. Presupuesto de prompts 83.041/83.053 bytes.
R1–R8 verificados: 7 RED (A1–A4, B1–B3) capturados antes del arreglo y en verde después.
Delta de spec: 1 escenario falso REMOVED, 3 ADDED, 1 MODIFIED.

## // 005. PENDIENTE / RIESGOS

1. `foregroundOnly` es interno de `pi-subagents` y no está en el schema público de
   `subagent`. Si desaparece, el canario de recogida es la única red.
2. **Tercer parche de la misma herida** (scout, sello del pasaje, y este registro): el arnés
   asume que el trabajo del subagente vuelve por donde salió. El patrón es el hallazgo, no
   cada parche por separado.
3. Fallo C mitigado, NO cerrado. La declaración completa no cupo en el presupuesto de prompt
   (quedaban 12 bytes), y el bloqueo se reprodujo en este mismo cierre pese a la mitigación y
   a una instrucción explícita del coordinador. La solución correcta es código —que el
   coordinador persista el summary que el agente devuelve en el envelope— y no más prosa.

## // 006. NOTA DE PROCESO

El diagnóstico inicial del coordinador sobre el fallo A era INCORRECTO: atribuía la pérdida
del resultado a un evento `subagent_wait` que Ein no escuchaba. La fase de diseño lo desmontó
y la causa real resultó ser el arranque asíncrono por defecto. El delta de spec, escrito
sobre esa premisa falsa, se reescribió durante el apply.
