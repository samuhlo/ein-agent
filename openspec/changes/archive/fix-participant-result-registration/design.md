# Design: fix-participant-result-registration

**Change**: fix-participant-result-registration
**Lane**: micro (sin map ni tasks; design/verify/close son puertas duras)
**TDD**: strict
**Idioma del artefacto**: español

---

## // 000. CONTEXTO DE SPEC CANÓNICA

`scope.md` NO registró referencias de spec canónica (no hay sección de
`canonical spec context`). El único dominio mapeado es `sdd-lifecycle`, vía el
delta del propio cambio:

| path | digest | bytes |
| --- | --- | --- |
| `openspec/changes/fix-participant-result-registration/specs/sdd-lifecycle/spec.md` | no calculado | no calculado |

**Declaración honesta (`// 007`)**: este ejecutor corre sin shell, así que no
puede calcular SHA-256 ni tamaños. No se afirma un digest que no se ha medido.
Ninguna decisión de este diseño depende de un digest; dependen de código leído
directamente, con fichero y línea citados.

---

## A. PROPUESTA

### Intención

Que el resultado de un participante SDD (Cleaner/Architect) se registre de
verdad cuando termina, que desactivar un participante libere el pasaje ya
emitido, y que `sdd-close` en Claude escriba `summary.md` sin negarse.

### Alcance

**Dentro**

- **A** — registro del resultado del participante (crítico).
- **B** — liberación de un participante desactivado a mitad de pasaje (alto).
- **C** — una línea en `ein-pi/core/agents/sdd-close.md` (menor).
- Corrección del delta `specs/sdd-lifecycle/spec.md` de este cambio: su
  escenario `participant-result-via-subagent-wait` describe un mecanismo que no
  existe (ver `// 002`).

**Fuera (no-goals)**

- Reescribir el modelo de invocación de `pi-subagents`.
- Tocar los sellos de pasaje ni el fix de autoinvalidación de 0.72.0.
- La degradación `fresh` → `stale` (backlog aparte).
- Cualquier hook o guardarraíl nuevo en Claude Code.

### Áreas afectadas

| Fichero | Fallo | Naturaleza |
| --- | --- | --- |
| `ein-pi/agent/lib/sdd-preflight.ts` | A | nuevo inyector puro `ensureParticipantForeground` |
| `ein-pi/agent/extensions/ein-ai.ts` | A | llamada al inyector en `tool_call`; filtro y canario en `tool_result` |
| `ein-pi/agent/lib/sdd-participants.ts` | A, B | recogida no destructiva, predicado de deriva, orden efectivo, identidad de pasaje |
| `ein-pi/agent/lib/i18n/strings.ts` | A | clave del aviso de deriva de recogida |
| `ein-pi/core/agents/sdd-close.md` | C | una línea |
| `openspec/changes/.../specs/sdd-lifecycle/spec.md` | A | corrección del delta |
| `tests/sdd-participants.test.ts`, `tests/sdd-planning-acceptance.test.ts` (o fichero hermano) | A, B | tests RED |

### Riesgos

1. **`foregroundOnly` no está en el schema público de `subagent`** (solo se usa
   internamente en `pi-subagents/src/slash/delegation-adapters.ts:138-139`). Si
   desaparece, la clave sobrante es inerte; el riesgo real es que un día deje de
   proteger contra `forceTopLevelAsync`. Mitigación: el canario de recogida.
2. **Forzar foreground cambia la ergonomía**: el turno del padre se bloquea
   mientras el participante audita. Es lo que ya exige el contrato secuencial
   (`ein-ai.ts:830`), pero un Cleaner lento ahora se nota.
3. **Fail-closed con coste**: dejar `running` puesto tras un lanzamiento no
   terminal convierte un bucle silencioso en un `blocked` visible. Si el
   forzado de foreground fallara, el pasaje quedaría bloqueado en vez de
   girar en falso. Es el intercambio deseado (`// 002`), no un efecto lateral.
4. **B toca el hash de identidad del pasaje.** Se justifica abajo; el riesgo de
   pérdida de evidencia se elimina por construcción, no por cuidado.

### Rollback

Cada fallo es independiente y revertible por separado:

- A: revertir el inyector + la recogida deja el comportamiento actual (bucle).
- B: restaurar `order` dentro de `participantId()` y quitar el filtro efectivo.
- C: revertir una línea de markdown.

No hay migración de datos: `passages`/`callPassages`/`running` son mapas en
memoria por sesión y el checkpoint durable no cambia de forma.

### Criterios de éxito

Ver `// D`.

---

## // 001. FALLO A — CAUSA RAÍZ REAL (verificada, no supuesta)

El `scope.md` describe el síntoma correctamente pero **atribuye mal el
mecanismo**. Verificado leyendo la instalación real
(`~/.pi/agent/npm/node_modules/pi-subagents/src`):

**1. Por qué el lanzamiento no trae resultado.**
`asyncByDefault` es `true` por defecto: `resolveAsyncByDefault()` devuelve
`config.asyncByDefault !== false` (`extension/config.ts:150-152`) y la cabecera
del propio paquete lo declara — «async parameter (default: true; set
asyncByDefault:false in config.json to opt out)» (`extension/index.ts:9`). En
esta máquina no existe `~/.pi/agent/extensions/subagent/config.json`, así que
**toda delegación sale en background**. El `tool_result` del lanzamiento lleva
`details = { mode, runId, results: [], asyncId, asyncDir, … }`
(`runs/background/async-execution.ts:1288`): `results` **vacío** y el texto es
`Async …: … [id]`. No hay resultado que leer, y nunca lo habrá por ahí.

**2. Por qué `subagent_wait` tampoco lo trae — el scope se equivoca aquí.**
`subagent_wait` devuelve `details = { mode: "management", results: [],
completions }` y un texto de RESUMEN («Waited …; … Outcome: 1 complete.»)
(`runs/background/subagent-wait.ts:311-321`, `:635`). El texto del hijo se
excluye a propósito de `completions`: «Output text is deliberately excluded — it
already travels in the tool result content»
(`runs/background/wait-completions.ts:21-26`). Y ese «tool result content» no es
el del wait: el informe real del hijo se entrega como **mensaje custom**
`pi.sendMessage({ customType: "subagent-notify", … })`
(`runs/background/notify.ts:169-180`), que **no es un `tool_result`** y para el
que Ein no registra ningún hook (`PI_HOOKS` en `ein-pi/agent/lib/pi-contract.ts`
no contempla ningún canal de mensajes custom).

**Consecuencia dura**: el escenario `participant-result-via-subagent-wait` del
delta es **inimplementable**. Un test escrito contra esa forma pasaría contra un
evento inventado y el fix no funcionaría en vivo — exactamente el modo de fallo
que el `// 004` del MANIFIESTO llama burocracia: arnés que se aprueba a sí mismo.

**3. Qué sí es cierto del scope.** `completeSddParticipantCall`
(`sdd-participants.ts:130-138`) recibe el texto del handle, no encuentra
`status:`, y **ya ha borrado** `callPassages` y `running` antes de descartarlo.
Ese borrado prematuro es lo que permite relanzar en bucle sin que nada proteste.

---

## // 002. FALLO A — DISEÑO

### A-1. Traer el resultado al canal que Ein ya observa (`// 005`)

En vez de perseguir el informe por tres canales (wait + notify + ficheros de
artefacto, dos de ellos sin hook y uno condicionado por config de artefactos),
se hace que el participante corra **en primer plano**, de modo que su resultado
terminal vuelva en el MISMO `tool_result` de `subagent` que Ein ya rastrea por
`toolCallId`. Ninguna correlación nueva hace falta: el `toolCallId` vuelve a ser
la clave correcta porque vuelve a haber un solo evento.

Nuevo inyector puro en `ein-pi/agent/lib/sdd-preflight.ts`, junto a sus
hermanos (`ensureApplyAcceptance`, `ensurePhaseRuntime`, …), llamado desde
`ein-ai.ts` en el bloque de `tool_call` (junto a `ensurePhaseRuntime`, líneas
858-877), **después** de la admisión:

```
ensureParticipantForeground(input):
  si algún item de collectDelegationItems(input) tiene task con
  "[ein-sdd-participant/v1 " →  input.async = false ; input.foregroundOnly = true
```

Por qué esas dos claves y no una:

- `async: false` basta hoy: `runsForeground = clarify === true || (async ??
  asyncByDefault) !== true` (`runs/foreground/subagent-executor.ts:6583`).
- `foregroundOnly: true` es el seguro: `applyForceTopLevelAsyncOverride`
  devuelve los params intactos **si y solo si** `params.foregroundOnly` está
  puesto (`runs/background/top-level-async.ts:12`). Sin él, un
  `forceTopLevelAsync: true` en config volvería a mandar el pasaje a background
  y el fallo regresaría en silencio.
- No es una invención: `pi-subagents` usa exactamente ese par para su propia
  ruta de delegación garantizada — `async: false; foregroundOnly: true`
  (`src/slash/delegation-adapters.ts:138-139`).
- Mutar `event.input` es la costura soportada: Pi documenta «`event.input` is
  mutable… No re-validation is performed after mutation»
  (`pi-coding-agent/dist/core/extensions/types.d.ts`, nota de `ToolCallEvent`),
  y es lo que ya hacen los cinco inyectores existentes.

**Un `async: true` explícito del orquestador se sobrescribe**, a diferencia de
los otros inyectores que respetan lo explícito. Motivo: un participante que Ein
no puede observar no puede ser admitido, y admitirlo igualmente es precisamente
el bug. `// 002`: fail-closed.

Fondo, no mecánica: los participantes **ya** están obligados a correr de uno en
uno («SDD participants must run sequentially, one delegation at a time»,
`ein-ai.ts:830`). El background no compraba paralelismo aquí; solo costaba toda
la cadena de observabilidad.

### A-2. Que el lanzamiento deje de destruir el rastreo

`completeSddParticipantCall` deja de consumir el rastreo incondicionalmente.
Regla: **solo un resultado TERMINAL consume `callPassages` y `running`**.

Terminal se decide por **forma**, no por texto:

- Se busca el `SingleResult` del participante en `details.results[]` (tiene
  `agent`, `task` y `finalOutput`; `pi-subagents/src/shared/types.ts:900-945`).
  La `task` conserva el marcador `[ein-sdd-participant/v1 passage=… state=…]`,
  así que la correlación puede confirmarse contra el pasaje admitido además del
  `toolCallId`.
- Precedencia del texto de salida: `details.results[0].finalOutput` cuando hay
  exactamente un resultado, si no el texto de `content`. No es una elección
  arbitraria: es la misma precedencia que aplica `pi-subagents` a sus propios
  hijos (`runs/foreground/subagent-executor.ts:4613-4617`).
- Un `details` con `runId`/`asyncId` y `results: []` es un **handle de
  lanzamiento** (forma exacta de `async-execution.ts:1288`): no terminal.
- Sin payload terminal reconocible → **no se borra nada, no se registra nada**,
  y se dispara el canario (A-3).

Efecto directo sobre el bucle: con `running` intacto, un segundo lanzamiento del
mismo agente cae en `running.has(...)` (`sdd-participants.ts:111`) y el plan
devuelve `blocked: "<agent> is already running for this apply passage."` en vez
de entregar el mismo pasaje pendiente una y otra vez. El bucle infinito se
convierte en un bloqueo con causa. Coste aceptado: si el resultado nunca llega,
el pasaje queda bloqueado (fail-closed) en lugar de girar en falso.

Esto exige pasar `details` a la recogida. `completeSddParticipantCall` cambia su
firma a `(cwd, toolCallId, failed, output, details)` — o recibe un objeto
`result` — y `ein-ai.ts` le pasa `event.details`. Es cambio interno; ningún
consumidor externo la usa.

### A-3. Canario de deriva del lado de la RECOGIDA

Espejo del canario de ADMISIÓN que ya existe (`ein-ai.ts:837-853`, «es lo que
pasó al mover la ejecución a `workflowScript`»). El principio es el mismo: los
gates de Ein no fallan cuando la forma cambia, se quedan mirando a un sitio
vacío.

Predicado **puro** (testeable sin arrancar Pi), en `sdd-participants.ts`:

```
participantResultIsUnrecognized({ toolName, details, hasTrackedCalls }) -> boolean
```

Devuelve `true` cuando:

- llega un `tool_result` de `subagent` con una llamada de participante rastreada
  y sin payload terminal reconocible (handle de lanzamiento o `details` de forma
  desconocida), **o**
- llega un `tool_result` de `subagent_wait` mientras hay llamadas de
  participante rastreadas — firma exacta de «el forzado a foreground dejó de
  funcionar».

En `ein-ai.ts`, el filtro de la línea 911 pasa de rechazar todo lo que no sea
`subagent` a: tratar `subagent` como resultado (A-2) y tratar `subagent_wait`
**solo** como señal de canario (nunca registra evidencia: no la lleva). Si el
predicado da `true` y `ctx.hasUI`, se avisa **una vez por sesión** con
`ctx.ui.notify(..., "warning")` y una clave i18n hermana de
`ai.delegation.shape-drift`, diciendo que Ein no reconoce la forma del resultado
del participante y que actualice Ein. No bloquea, no lanza: avisa. `// 002`.

### A-4. Corrección del delta

El escenario `participant-result-via-subagent-wait` se sustituye por uno que
describe el comportamiento real y comprobable:

> The system MUST run SDD participant delegations in the foreground so the
> terminal result returns in the same `subagent` tool_result, MUST consume the
> participant call tracking only on a terminal result, and MUST NOT extract
> participant status from `subagent_wait` tool results.

El escenario `result-collection-drift-warning` se conserva, ampliando la
condición a «`subagent_wait` con llamadas de participante rastreadas».

---

## // 003. FALLO B — DISEÑO (se resuelve, no se aparca)

### B-1. La restricción real, medida

`participantId()` incluye `order` en el hash (`sdd-participants.ts:63`), así que
recalcular el orden cambia el `passageId`. Y hay una segunda restricción que el
scope no vio, más dura: el validador del checkpoint **rechaza** un registro cuyo
`order` no contenga a un agente con evidencia —
`(value.cleaner !== null && !value.order.includes("ein-cleaner")) || …` →
inválido (`continuity-checkpoint.ts:250`). Es decir: **reescribir `order` para
quitar un agente que ya completó invalida el checkpoint entero**. Ese es,
literalmente, el mecanismo de pérdida de evidencia que había que evitar.

### B-2. Decisión: la identidad del pasaje es el ESTADO auditado, no el reparto

Dos reglas, y las dos hacen falta:

**Regla 1 — `order` sale del hash de identidad.**
`participantId()` pasa a hashear `{ change, applyId, scopeId, beforeStateRef }`.
Un pasaje identifica *qué bytes se auditan*, no *quién los audita*. Con eso,
recalcular el orden en vuelo ya no mueve el `passageId`: `running`
(`${id}:${agent}`), `callPassages` y las claves de `passages` siguen válidas, y
la evidencia registrada sigue casando en `completeSddParticipantCall:142`.

No debilita nada: `change + applyId + scopeId + beforeStateRef` ya fijan los
bytes auditados, y `admitSddParticipantCall` sigue exigiendo
`planned.next?.agent === agent` (`:122`), así que una task vieja de un agente
desactivado se rechaza igual. De hecho **aprieta**: antes, dos sesiones con
distinta activación sobre el mismo apply obtenían ids distintos y podían correr
el Cleaner a la vez sobre los mismos ficheros; ahora comparten id y `running`
las serializa.

Sin migración: `passages` vive en memoria por sesión y los marcadores se
reemiten en cada plan. Tras el upgrade, una task emitida antes queda «unknown or
expired apply passage» y el orquestador pide plan fresco — el mismo camino que
ya se recorre tras cualquier reinicio.

**Regla 2 — el orden efectivo se filtra al LEER, y la evidencia nunca se
retracta.** En `passage()`, después de leer o acuñar el checkpoint:

```
effectiveOrder = durable.order.filter(agent =>
    enabled(agent) || tieneEvidencia(agent))
```

`Passage.order` pasa a ser `effectiveOrder`. **El `order` durable NO se
reescribe nunca** para estrechar: así el invariante de
`continuity-checkpoint.ts:250` queda intacto por construcción y ninguna
evidencia previa puede caerse.

### B-3. Qué pasa exactamente en cada caso

| Situación | Resultado |
| --- | --- |
| `/ein:cleaner off` con Cleaner **pendiente** | sale del orden efectivo; el plan avanza al Architect o queda `complete`; `guardSddVerify` desbloquea. **El pasaje se libera.** |
| `/ein:cleaner off` con Cleaner **ya completado** | sigue en el orden (tiene evidencia) y su evidencia se conserva; el pasaje sigue `complete`. Desactivar decide participación FUTURA, nunca retracta lo registrado. |
| Architect desactivado a mitad, Cleaner ya completó | el `stateRef` sigue siendo `cleaner.afterStateRef`: el Cleaner sí tocó el árbol y eso no se borra. Orden efectivo `["ein-cleaner"]`, pasaje `complete`. |
| Se reactiva a mitad de pasaje | vuelve al orden efectivo (el `order` durable estaba intacto); su evidencia es `null` → vuelve a ser `next`. Reversible e idempotente. |
| Los dos desactivados sin evidencia | orden efectivo vacío → plan `complete` con `order: []`. Es la semántica que ya produce la rama de acuñación (`:77`) y que el validador acepta (`""`, `:246`). |
| Participante **en vuelo** que se desactiva | su resultado tardío se **descarta**: no se escribe evidencia. Ver B-4. |
| Task vieja de un agente desactivado que se reintenta | `planned.next` ya no es ese agente → admisión bloqueada. Fail-closed. |

### B-4. El resultado tardío de un participante desactivado

`completeSddParticipantCall` aplica la MISMA regla de orden efectivo: si el
agente no está habilitado y no tenía evidencia previa, se libera el rastreo y
**no se escribe** evidencia. Motivo: si se escribiera un `blocked` tardío, el
participante que el operador acaba de apagar volvería a bloquear el pasaje —
deshaciendo la liberación que acaba de pedir.

No se pierde información real: si ese Cleaner llegó a mutar el árbol, el sello
recomputado deja de casar con `expectedState` y `passage()` **reacuña** el
checkpoint (`:76`) con el orden ya sin Cleaner. El sistema se recompone solo.

Esto exige el `sessionKey` en la recogida; se guarda en el registro de
`callPassages` en la admisión (`{ key, agent, sessionKey }`). Cambio interno,
sin tocar firmas exportadas.

**Alternativa rechazada**: recalcular `order` y reescribirlo en el checkpoint.
Invalida el registro en cuanto hay evidencia previa (`:250`) y mueve el
`passageId`, huerfanando `running`/`callPassages` de un participante en vuelo.
Es la opción que el scope temía, y con razón.

**Alternativa rechazada**: aparcar B a un follow-up. Es el fallo que dejó al
usuario sin salida; el arreglo cabe en dos reglas y no requiere estado
transitorio ni liberación en dos fases.

---

## // 004. FALLO C — DISEÑO

`ein-pi/core/agents/sdd-close.md:18-20` ya declara `summary.md` como «Your
primary output» y el frontmatter concede `write` (`tools: read, grep, find,
write`). No hay guardarraíl de Ein implicado: el único `PreToolUse` del adapter
matchea `Bash` (`cc-ein/sync.ts:526`) y nada intercepta `Write`. Es la política
base de Claude Code contra generar markdown por iniciativa propia.

**Ruta de derivación verificada**: `cc-ein/sync.ts` compila los prompts de
Claude desde `ein-pi/core/agents/*.md` aplicando traducciones por token y
`LEGACY_TRANSLATIONS` (`sync.ts:150-220`, con entradas explícitas para
`agents/sdd-close.md` en el bloque de fases). Los agentes generados NO están
versionados en el repo (`cc-ein/agents/` no existe): se emiten al
`CLAUDE_CONFIG_DIR` en el sync. Editar la fuente canónica es, por tanto, la
única acción necesaria; llega al runtime en el siguiente `ein update`/sync.

**Cambio**: una línea junto a `:18`, declarando que escribir `summary.md` es una
tarea EXPLÍCITAMENTE solicitada por el flujo SDD, no documentación proactiva.
Sin guardarraíl nuevo, sin fase nueva, sin token nuevo que traducir.

---

## B. SPEC (RFC 2119)

**R1 — Ejecución en primer plano.** El sistema MUST forzar
`async: false` y `foregroundOnly: true` en toda delegación `subagent` cuyo task
contenga el marcador `[ein-sdd-participant/v1 `, sobrescribiendo un `async`
explícito.
- *Given* una delegación con un task de participante y `async: true`
- *When* se procesa el `tool_call`
- *Then* el input sale con `async: false` y `foregroundOnly: true`

**R2 — Recogida no destructiva.** El sistema MUST consumir `callPassages` y
`running` únicamente cuando el `tool_result` contiene un payload terminal del
participante; un handle de lanzamiento MUST dejar el rastreo intacto.
- *Given* un participante admitido bajo `toolCallId` X
- *When* llega el `tool_result` del lanzamiento (`details.results` vacío, con `runId`)
- *Then* el plan siguiente devuelve `blocked` («already running»), no `ready` con el mismo agente

**R3 — Sin estado desde `subagent_wait`.** El sistema MUST NOT extraer estado de
participante de un `tool_result` de `subagent_wait`.
- *Given* un `tool_result` de `subagent_wait` con `completions`
- *When* se procesa
- *Then* no se registra evidencia alguna

**R4 — Canario de recogida.** El sistema MUST avisar una vez por sesión, sin
bloquear, cuando no reconoce la forma del resultado de un participante
rastreado, incluido el caso de un `subagent_wait` con llamadas rastreadas.
- *Given* una llamada de participante rastreada y un resultado de forma desconocida
- *When* se procesa el `tool_result` con UI disponible
- *Then* se emite un `warning` una sola vez y el manejador continúa

**R5 — Identidad de pasaje.** El `passageId` MUST derivarse de
`{ change, applyId, scopeId, beforeStateRef }` y MUST NOT depender del orden de
participantes.
- *Given* un pasaje emitido con orden `[cleaner, architect]`
- *When* se desactiva un participante
- *Then* el `passageId` no cambia

**R6 — Liberación prospectiva.** El sistema MUST excluir del orden efectivo a un
participante desactivado que aún no tiene evidencia, y MUST conservar en el
orden y en el checkpoint a todo participante con evidencia registrada.
- *Given* Cleaner completado y Architect pendiente
- *When* se desactiva el Architect
- *Then* el orden es `["ein-cleaner"]`, el plan es `complete`, `guardSddVerify` devuelve `null` y la evidencia del Cleaner sigue en el checkpoint

**R7 — Resultado tardío de un desactivado.** El sistema MUST descartar sin
registrar el resultado de un participante desactivado y sin evidencia previa.
- *Given* un Cleaner en vuelo que se desactiva
- *When* llega su resultado `blocked`
- *Then* no se escribe evidencia y el pasaje no vuelve a bloquearse

**R8 — Prompt de cierre.** `sdd-close.md` MUST declarar que escribir
`summary.md` es una tarea solicitada por el flujo, no documentación proactiva.
- *Given* la fuente canónica del agente
- *When* se compila el prompt de Claude
- *Then* la declaración aparece en el prompt generado

---

## C. DECISIONES

1. **Traer el resultado al canal observado, en vez de perseguirlo por tres
   canales.** Rechazado: leer `details.completions[].results[].artifactPaths.
   outputPath` desde disco — depende de que los artefactos estén habilitados en
   config y añade E/S a un hook síncrono. Rechazado: enganchar el mensaje custom
   `subagent-notify` — Ein no tiene hook para mensajes custom y el contrato
   `PI_HOOKS` tendría que crecer por un canal que ni siquiera garantiza texto
   completo (es un *preview*).
2. **Sobrescribir un `async` explícito** rompe la simetría con los otros
   inyectores a propósito: un participante inobservable no debe admitirse.
3. **Terminalidad por forma, no por texto.** Buscar `status:` en el texto es lo
   que hoy confunde un handle con un informe. La forma (`details.results`) es
   determinista.
4. **`order` fuera del hash de identidad** es la decisión estructural del
   cambio: separa *qué se audita* de *quién audita*, y es lo único que permite
   liberar sin mover el `passageId`.
5. **El `order` durable no se estrecha nunca.** Mantiene intacto el invariante
   evidencia ⊆ orden del validador de checkpoint.

### Fronteras

| Responsabilidad | Dueño |
| --- | --- |
| Mutación del input de delegación | `sdd-preflight.ts` (puro, sin fs) |
| Cableado de hooks y avisos de UI | `ein-ai.ts` |
| Identidad, orden efectivo, admisión, recogida, predicado de deriva | `sdd-participants.ts` |
| Invariantes durables del checkpoint | `continuity-checkpoint.ts` (no se toca) |
| Prompt de cierre | `ein-pi/core/agents/sdd-close.md` (fuente canónica) |

---

## D. CRITERIOS DE ÉXITO

### Tests RED (TDD estricto): cuál falla primero y por qué hoy no falla

**A — el test debe ser una SECUENCIA, no una llamada.** Un test que solo simule
la llamada `subagent` no reproduce el bug: el bug vive en
lanzamiento → (nada) → reintento.

- **RED A1** (`tests/sdd-participants.test.ts`): admitir el Cleaner con
  `admitSddParticipantCall`, llamar a `completeSddParticipantCall` con el texto
  y el `details` de un **handle de lanzamiento**
  (`{ mode:"single", runId:"r1", results: [], asyncId:"r1" }`, sin `status:`), y
  volver a pedir `planSddParticipants`. Aserción: `status === "blocked"`.
  **Hoy falla** porque devuelve `ready` con el mismo `next.agent` y el mismo
  `passageId` — el bucle. **Por qué hoy no lo caza la suite**: el helper
  `finish()` (`tests/sdd-participants.test.ts:41-44`) SIEMPRE alimenta la
  recogida con `"status: complete"`. Todos los tests le dan al recolector
  exactamente el texto que el recolector quiere; nadie simula un lanzamiento.
- **RED A2**: tras A1, entregar el resultado terminal (mismo `toolCallId`, con
  `details.results[0].finalOutput = "status: complete"` y `task` con el
  marcador del pasaje) y comprobar que el plan pasa a `complete`.
  **Hoy falla** porque el rastreo ya se borró en A1.
- **RED A3** (unitario, puro): `ensureParticipantForeground` fija
  `async:false`/`foregroundOnly:true` sobre un `workflowScript` con task de
  participante; deja intacta una delegación normal; fuerza incluso con
  `async:true` explícito. **Hoy falla** porque la función no existe.
- **RED A4** (unitario, puro): `participantResultIsUnrecognized` devuelve `true`
  para un handle de lanzamiento con llamadas rastreadas y para un
  `subagent_wait` con llamadas rastreadas; `false` para un terminal con estado.
  **Hoy falla** porque no existe predicado de recogida — solo el de admisión.

**B**

- **RED B1**: sesión con ambos activos; completar el Cleaner; `routeAgentControl
  (cwd, session, "architect", "off")`; replanificar. Aserciones: `order ===
  ["ein-cleaner"]`, `status === "complete"`, `guardSddVerify === null`,
  `passageId` idéntico al de antes de desactivar, y la evidencia del Cleaner
  sigue en el checkpoint leído. **Hoy falla** en las cuatro: `order` viene
  congelado del checkpoint y `planSddParticipants` sigue exigiendo el Architect.
- **RED B2** (triangulación): desactivar el Cleaner **antes** de que corra →
  `order === ["ein-architect"]` con `passageId` estable; reactivarlo → vuelve a
  ser `next`.
- **RED B3** (triangulación): resultado `blocked` tardío de un participante
  desactivado → el pasaje NO vuelve a bloquearse.

**C**

- **RED C1**: aserción de contenido sobre `ein-pi/core/agents/sdd-close.md`
  (declaración de tarea solicitada presente) más la comprobación de que el
  prompt compilado por `cc-ein/sync.ts` la conserva. **Hoy falla** porque la
  línea no existe. La verificación final (que Claude escriba `summary.md` sin
  negarse) es observación en vivo, no test automatizable.

### Comandos de verificación

- `bun test` desde la raíz.
- `tsc --noEmit` desde la raíz (cubre `ein-pi` y `cc-ein`).

**Fallo preexistente y ajeno**: `Claude continuity supervisor > runs real PTY …`
falla antes de este cambio. No es regresión y no se arregla aquí; debe seguir
siendo el ÚNICO fallo tras GREEN.

### Aceptación observable

1. `bun test` verde salvo el fallo preexistente citado; `tsc --noEmit` limpio.
2. Los RED A1-A4, B1-B3 y C1 fallan antes del fix y pasan después (evidencia en
   `apply-progress.md`).
3. El delta `specs/sdd-lifecycle/spec.md` de este cambio queda corregido según
   `// 002 A-4`; el escenario `subagent_wait` no sobrevive tal como está.
4. Ningún test existente de `tests/sdd-participants.test.ts` se relaja para
   pasar.
5. Comprobación en vivo (no automatizable, se registra en `verify-report.md`):
   el Cleaner corre en foreground, el pasaje pasa a `complete` a la primera y
   `sdd-verify` deja de estar bloqueado.
