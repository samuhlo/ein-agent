# Design: harden-subagent-envelope-contract

**Carril**: micro (sin `map` ni `tasks`) · **TDD**: estricto · **Idioma**: español
**Autoridad**: MANIFIESTO.md — `// 002` (determinista primero), `// 004` (arnés vs
burocracia, presupuesto de prompt, condición de retirada), `// 005` (menor cambio
correcto), `// 007` (no vender cobertura que no existe), `// 008` (sin ceremonia
para un cambio pequeño).

---

## // 000. CONTEXTO DE SPEC CANÓNICA

`scope.md` no registró referencias canónicas y el carril micro no produce
`map.md`. Se leyeron **2** ficheros de `openspec/specs/`, dentro de la cota de
3 / 32 KiB:

| path | uso | digest |
|---|---|---|
| `openspec/specs/scout-routing/spec.md` | requisito de foreground ya existente (escenario `scout-launch-is-always-foreground`) | **no computado** |
| `openspec/specs/surface-wiring/spec.md` | dominio candidato para el enunciado general | **no computado** |

**Limitación declarada (`// 002` procedencia, `// 007`)**: este ejecutor corre sin
herramienta de shell y **no puede computar SHA-256 ni bytes**. No se inventa un
digest. Procedencia: `unverified-digest`. La cota dura sí se respetó; lo que
falta es el recibo, no el límite.

---

## // 001. ESTADO VERIFICADO DEL ÁRBOL

La regla del envelope **existe de facto y ambos consumidores que la necesitan la
cumplen hoy**. Verificado por lectura directa en esta sesión, no asumido:

- `ein-pi/agent/lib/sdd-preflight.ts:387-394` — `ensureParticipantForeground`
  fija `input.async = false` y `input.foregroundOnly = true` en toda delegación
  cuyo task lleve el marcador `[ein-sdd-participant/v1 `. **Sobrescribe un
  `async` explícito** a propósito: un participante inobservable no debe
  admitirse (fail-closed, `// 002`).
- `ein-pi/agent/extensions/ein-ai.ts:860` — lo llama en el hook `tool_call`.
- `tests/sdd-participants.test.ts:356-378` — lo cubre (marcador presente,
  ausente, y `async:true` explícito sobrescrito).
- `ein-pi/agent/lib/scout-contract.ts:92,94` — `async: false` en las dos formas.
- `ein-pi/core/agents/ein-scout.md:9` — `async: false` en el frontmatter, el
  cinturón contra que la mutación del hook no llegue.

Nota de procedencia: en una lectura anterior de esta misma sesión este código no
estaba en el árbol; el trabajo de `fix-participant-result-registration` vivía en
un `git stash` que se recuperó después. Lo he releído yo mismo tras la
recuperación. **El archivo de ese cambio no declara código inexistente**; no hay
nada que decidir ahí.

Por tanto el riesgo que la Pieza 1 debe cubrir es el que decía `scope.md`: la
regla no está escrita en ningún sitio ni la protege ningún test, y **el
consumidor futuro es el que la puede romper en silencio**.

### Inventario real de consumidores del envelope

Único punto de consumo: `ein-pi/agent/extensions/ein-ai.ts:934-968`, handler
`pi.on("tool_result")`. (`ein-continuity.ts:81` también es un `tool_result`, pero
solo lee `event.isError` para tools mutadoras: no deriva estado del payload de un
subagente y queda fuera de la regla.)

| # | consumidor | lee | modo de fallo en background | protección hoy |
|---|---|---|---|---|
| 1 | `completeSddParticipantCall` (`:944`) | `content`, `isError`, `details` | **silent-incorrect-state**: sin payload terminal el pasaje no avanza y `sdd-verify` queda inalcanzable | `ensureParticipantForeground` (`sdd-preflight.ts:387`) |
| 2 | `acceptTrackedScoutResult` (`:946`) | `details` | **loud-wasteful**: el reporte se tira y se marca off-contract; el trabajo ya se pagó | `normalizeScoutLaunch` + frontmatter `async: false` |
| 3 | `participantResultIsUnrecognized` (`:939`, `:943`) | `details`, `toolName` | **safe-degradation**: es un canario de deriva, solo avisa por UI | no requerida |
| 4 | reconciliación de fallo de fase (`:953-967`) | `isError`, `content` | **safe-degradation**: no dispara, y el veredicto real lo da `ein_sdd_check` sobre el artefacto en disco | no requerida |

**Dos consumidores requieren protección y los dos la tienen.** Los otros dos
entran en el inventario porque el detector de novedad es de mundo cerrado: si el
escáner ve cuatro y el inventario declara dos, el test falla por una razón falsa.
Declararlos es una necesidad mecánica, no una preferencia.

Sobre `asyncByDefault: true` en `pi-subagents`: es la premisa del mecanismo y
está citada de segunda mano en el código recuperado (`runs/background/top-level-async.ts:12`,
`delegation-adapters.ts:138-139`). **No verificada en esta sesión** — sin shell
no puedo leer la dependencia vendorizada. Evidencia con procedencia, no hecho
propio.

---

## // 002. PROPUESTA

### Intención

Dos cosas que el release 0.73.0 necesita juntas:

1. **Pieza 1** — convertir en código verificable la regla que hoy es folclore, de
   forma que falle cuando alguien añada un consumidor sin declararlo o cuando una
   protección declarada desaparezca del árbol.
2. **Pieza 2** — dar a `sdd-close` en Claude un canal de persistencia que no
   dependa de que el modelo venza su propia política.

### Alcance

**Dentro (Pieza 1):**
- `ein-pi/agent/lib/subagent-envelope-contract.ts` (nuevo): regla en cabecera,
  inventario legible por máquina, función pura de auditoría.
- Escenario nuevo en `openspec/specs/surface-wiring/spec.md`.
- `tests/subagent-envelope-contract.test.ts` (nuevo).

**Dentro (Pieza 2):**
- `ein-pi/agent/lib/sdd-summary-write.ts` (nuevo): núcleo compartido.
- `cc-ein/sdd-cli/cli.ts`: subcomando `summary` desde stdin.
- `ein-pi/core/agents/sdd-close.md`: `+ bash` en el frontmatter.
- `ein-pi/agent/lib/sdd-remedies.ts`: remedio calculado para el runtime `claude`.
- Tests de ambos.

**Fuera (no-objetivos):**
- No se toca ningún consumidor de envelope: los dos que requieren protección ya
  la tienen. La Pieza 1 **declara**, no arregla.
- No se toca el prompt del orquestador ni la prosa de `core/agents/*.md` más allá
  de los 6 bytes del frontmatter.
- No se crea una tool de Pi `ein_sdd_summary_write` (justificado en `// 005`).

### Áreas afectadas

| fichero | acción | pieza |
|---|---|---|
| `ein-pi/agent/lib/subagent-envelope-contract.ts` | nuevo | 1 |
| `tests/subagent-envelope-contract.test.ts` | nuevo | 1 |
| `openspec/specs/surface-wiring/spec.md` | delta (vía `cc-ein-sdd delta`) | 1 |
| `ein-pi/agent/lib/sdd-summary-write.ts` | nuevo | 2 |
| `cc-ein/sdd-cli/cli.ts` | `runSummaryCommand` + dispatch + usage | 2 |
| `ein-pi/core/agents/sdd-close.md` | frontmatter `+ bash` (6 bytes) | 2 |
| `ein-pi/agent/lib/sdd-remedies.ts` | rama de remedio para close en claude | 2 |
| `tests/sdd-summary-write.test.ts` | nuevo | 2 |

La Pieza 1 no cambia ninguna ruta de ejecución: es datos más una función pura que
solo consume el test.

### Riesgos

1. **El detector de novedad es de mundo cerrado.** Un consumidor cableado por
   otra vía se le escapa (detallado y acotado en `// 004`).
2. **Falso rojo por refactor de forma.** Si `ein-ai.ts` renombra el handler o el
   acceso a `event.content`, el escáner falla sin defecto real. Coste acotado: el
   mensaje de fallo dice exactamente qué actualizar.
3. **Presupuesto de agentes al límite.** `core/agents/*.md` está en 83.041 de
   83.053 (dato del encargo, no medido por mí). `, bash` son 6 bytes: entra con 6
   de margen. `bun test tests/prompt-budget.test.ts` es puerta obligatoria del
   apply, no un chequeo opcional.
4. **La Pieza 2 no puede garantizarse por test.** Que el modelo llame al CLI no
   es comprobable de forma determinista (ver `// 005`).

### Rollback

Pieza 1: borrar los dos ficheros nuevos y revertir el delta; nada en runtime
depende de ellos. Pieza 2: revertir los cuatro ficheros; `sdd-close` vuelve a
escribir con `write`, que es lo que ya funciona en Pi. Las dos piezas se
revierten por separado.

---

## // 003. SPEC (RFC 2119)

**R1.** El sistema **MUST** mantener un inventario declarado, legible por
máquina, de todo código que derive estado a partir del payload de un
`tool_result` de subagente.

- *Given* el handler `tool_result` de Ein en Pi
- *When* se audita el árbol contra el inventario declarado
- *Then* el conjunto de consumidores hallados en la fuente es exactamente igual
  al conjunto de claves del inventario

**R2.** Un consumidor clasificado `silent-incorrect-state` **MUST** declarar una
protección, y esa protección **MUST** estar presente en la fuente.

- *Given* un consumidor declarado con protección `foreground-forced`
- *When* la fuente ya no contiene el forzado correspondiente
- *Then* la auditoría falla nombrando el consumidor y la protección ausente

**R3.** Un consumidor clasificado `loud-wasteful` **SHOULD** forzar foreground; un
consumidor clasificado `safe-degradation` **MAY** permanecer sin protección y
**MUST** declararse así explícitamente.

- *Given* el canario de deriva y la reconciliación de fallo de fase
- *When* se auditan
- *Then* se aceptan sin protección porque su fallo degrada a no-op, y el
  veredicto real lo produce evidencia en disco

**R4.** El sistema **MUST** declarar que esta regla es específica de Pi: en Claude
no existe interceptación de resultados de subagente (los hooks generados son
`PreToolUse`/`PostToolUse`/`SessionStart`/…, ninguno de resultado —
`cc-ein/sync.ts:518-537`).

- *Given* las dos superficies de runtime
- *When* se lee el escenario de `surface-wiring`
- *Then* la asimetría queda declarada en vez de silenciada, como exige
  `runtime-surface-parity-or-declared-difference`

**R5.** El sistema **MUST** ofrecer a la fase `close` un canal de persistencia del
`summary.md` que no dependa de que el agente escriba el fichero por iniciativa
propia, y ese canal **MUST** validar el destino en vez de solo volcar bytes.

- *Given* un `summary.md` producido por `sdd-close` y un cambio existente
- *When* el contenido se pasa a `cc-ein-sdd summary <change>` por stdin
- *Then* se escribe en `openspec/changes/<change>/summary.md`, y se rechaza si el
  nombre no es seguro, el cambio no existe o el contenido está vacío

---

## // 004. PIEZA 1 — DECISIONES

### D1 — Dónde vive el enunciado: el módulo del inventario

**Elegido:** `ein-pi/agent/lib/subagent-envelope-contract.ts`, con la regla en el
comentario de cabecera y el inventario en el mismo fichero. **Respaldo:** un
escenario en `openspec/specs/surface-wiring/spec.md`.

El criterio del encargo es "que lo lea quien añade el tercer consumidor, no quien
pasa por allí". Un comentario se lee por suerte; **este se lee por obligación**:
el test de R1 no pasa hasta que el consumidor nuevo esté en el inventario, y el
fichero que hay que abrir para lograrlo es justo el que enuncia la regla. El
enunciado está en el camino de una edición forzosa, no en un catálogo.

El spec es el respaldo: sobrevive a que alguien reescriba el test, y es donde
`// 003` del manifiesto exige registrar la asimetría Pi/Claude.

**Rechazados:**
- `core/agents/*.md` — 12 bytes de margen, y **audiencia equivocada**: los
  agentes no lanzan subagentes; el arnés sí.
- Prompt del orquestador — presupuesto (`// 004`), y el coordinador no puede
  actuar sobre esta regla: la aplica el hook, no él.
- Cabecera de `scout-contract.ts` — es scout-específica; quien escribió el
  consumidor de participantes no tenía por qué abrir ese fichero.
- Dominio de spec nuevo — `// 008` prohíbe el catálogo que nadie mantiene.
  `surface-wiring` ya posee "cómo se enchufan las superficies de runtime y dónde
  se declaran sus diferencias".

### D2 — El eje es el MODO DE FALLO, no "consume envelope"

La regla tal como se enunció ("consumidor de envelope ⇒ foreground") clasifica
mal dos de los cuatro consumidores reales: el canario de deriva y la
reconciliación de fase consumen el envelope y **no necesitan** protección, porque
su fallo degrada a no-op y el veredicto real lo produce evidencia en disco.

Tres clases, que mapean directamente sobre RFC 2119:

| clase | qué pasa si el lanzamiento va a background | exigencia |
|---|---|---|
| `silent-incorrect-state` | el sistema queda en un estado falso y nadie se entera | **MUST** protegerse |
| `loud-wasteful` | falla ruidosamente, pero el trabajo ya se pagó | **SHOULD** protegerse |
| `safe-degradation` | no dispara; otra puerta da el veredicto | **MAY** quedarse sin protección |

Sin este eje, el inventario obligaría a "proteger" consumidores que no lo
necesitan — que es exactamente la burocracia que `// 004` prohíbe.

### D3 — Qué test la hace cumplir, y qué NO cubre

Tres tests: uno unitario sobre fixtures (la lógica), dos que corren la misma
función pura contra el árbol real (los hechos).

**T1 (unitario, fixtures)** — `auditEnvelopeConsumers(sources, inventory)` marca
hallazgo cuando una entrada `silent-incorrect-state` declara
`foreground-forced` y las fuentes dadas no contienen el forzado. Es la lógica que
detecta una protección declarada que se evapora.

**T2 (integración) — detector de novedad, mundo cerrado.** Del handler
`tool_result` real se extrae el conjunto de funciones que reciben
`event.content` / `event.details`, y se exige igualdad con las claves del
inventario. Un quinto consumidor sin declarar ⇒ rojo. Mismo patrón que
`tests/prompt-budget.test.ts`: un literal comprometido que solo se mueve
deliberadamente, con el mensaje de fallo explicando qué hacer.

**T3 (integración) — la protección declarada existe hoy.** Para cada entrada con
protección declarada, el forzado está en la fuente: `ensureParticipantForeground`
fija `async`/`foregroundOnly` para el consumidor 1; el normalizador y el
frontmatter `async: false` para el 2.

**Lo que estos tests NO cubren — sin endulzar (`// 007`):**

- **No previenen "el tercer consumidor" en general.** Previenen dos cosas
  concretas: (a) un consumidor **no declarado** sobre la superficie
  `tool_result` de Pi, y (b) una protección **declarada que desaparece**.
- **Mundo cerrado sobre un handler.** Un consumidor en otro hook, o que reciba el
  texto del envelope indirectamente a tres llamadas de distancia, se escapa.
  Mitigación barata: escanear **todos** los `pi.on("tool_result"` de
  `ein-pi/agent/extensions/*.ts` en vez de una porción fija de un fichero. El
  predicado "recibe `event.content` o `event.details`" ya separa bien: excluye
  limpiamente `ein-continuity.ts:81`, que solo mira `event.isError`.
- **Cero cobertura en Claude.** Ahí no hay interceptación de resultados, así que
  el guardarraíl no puede existir. Se declara (R4) en vez de fingir paridad.
- Se descarta el test tautológico ("scout fuerza `async:false` y participantes
  también"): describe el presente y no dice nada del consumidor futuro, que es el
  riesgo real.

### D4 — Condición de retirada (`// 004`)

El guardarraíl muere cuando **el inventario queda vacío**: cuando ningún código
deriva estado del payload de un `tool_result`. Evidencia computable, no opinión:
el escáner de T2 encuentra **cero** llamadas que reciban `event.content` /
`event.details` dentro de handlers `tool_result`. Eso ocurre cuando el scout
valide su reporte desde un fichero que él mismo escribe y el participante lea su
estado del checkpoint de continuidad que él mismo escribe. En ese momento se
borran juntos el módulo, el inventario y el test.

Segundo disparador independiente: si `pi-subagents` pasa `asyncByDefault` a
`false` por defecto, la premisa desaparece. Verificable leyendo el default de la
dependencia (hoy no verificado).

---

## // 005. PIEZA 2 — DECISIÓN Y TAMAÑO

### Elegida: hipótesis (c), con precedente ya en producción

**Este problema ya se resolvió en este repo, para esta misma clase de fallo.**
`cc-ein/sdd-cli/cli.ts:295-298` lo dice con todas las letras: el delta de OpenSpec
se escribe por CLI desde stdin *"porque el agente tenía prohibido escribir el
markdown a mano y la herramienta que debía usar no existía aquí"*. El patrón
completo existe y está testeado: núcleo compartido (`writeOpenSpecDelta`), tool
de Pi (`ein_openspec_delta_write`), subcomando de Claude (`cc-ein-sdd delta`),
traducción (`EXACT_TOOL_MAP`, `sync.ts:112`) y concesión de tools
(`tests/agent-tools-contract.test.ts:137-148`).

Y **funciona empíricamente en este runtime**: los commits `delta: declare spec
changes…` y `sync: register spec delta sync report` se produjeron en Claude, en
esta máquina. No es una hipótesis: es un patrón con evidencia de uso.

### Por qué (a) y (b) se rechazan

**(a) Dar `Bash` a `sdd-close` para que persista por otro canal.** Se rechaza
como *mecanismo*. La política de Claude es una instrucción al modelo, no un
interceptor: quien rehúsa `Write` por política puede rehusar igual un
`cat > summary.md`. Y si **no** lo rehúsa, es porque no reconoce que es el mismo
acto — sería un guardarraíl apoyado en la incoherencia del modelo, lo contrario
de `// 002`. Comprobarlo de verdad exigiría N ejecuciones independientes de
`sdd-close` en sesiones frescas midiendo la tasa de negativa: caro, no
determinista, y caduca con cada actualización del modelo. `sdd-close` **sí**
recibe `bash` bajo (c), pero con propósito acotado —invocar un comando de ciclo
de vida documentado—, gateado por el mismo `PreToolUse` que el resto.

**(b) Fallback del coordinador desde el envelope.** Se rechaza por tres motivos,
y el primero es fatal: **contradice la Pieza 1 de este mismo cambio**.
`sdd-close.md:64-73` prohíbe expresamente pegar el contenido del artefacto en el
envelope ("NEVER paste into the envelope the artifact's content"); (b) exige justo
eso, y engorda el contexto del padre en cada cierre — `// 001`, el recurso
escaso. Segundo: vuelve a ser "que el modelo obedezca", solo que ahora el
coordinador en vez del ejecutor. Tercero: viola el enrutado (el padre no escribe
artefactos de fase). Que funcionara a mano dos veces no es evidencia de
mecanismo: es evidencia de que había un humano mirando.

### Por qué (c) es determinismo y no "un `Write` con pasos extra"

El escritor **calcula y gatea**: la ruta se computa
(`openspec/changes/<change>/summary.md`), el nombre se valida con
`isSafeChangeName`, se rechaza si el cambio no existe o si el contenido está
vacío o excede la cota, y el artefacto escrito queda bajo el mismo `lintChange`
que ya gobierna la fase (`sdd-guardrails.ts:233` → `close: "summary.md"`).
Determinismo añadido sobre la escritura, no alrededor de ella. Y el acto deja de
ser iniciativa del agente: es la invocación de un comando de ciclo de vida.

### Tamaño real: entra en este cambio

Cuatro piezas pequeñas, todas espejo de algo que ya existe:

1. `writeSddSummary({ cwd, change, content })` — núcleo compartido, ~40 líneas.
2. `runSummaryCommand(dir, args, rawStdin)` + `case "summary"` + usage — espejo
   exacto de `runDeltaCommand`, ~25 líneas.
3. `sdd-close.md`: `tools: read, grep, find, write, bash` — **6 bytes**.
4. `sdd-remedies.ts`: una rama más.

**Sin tool de Pi nueva.** El precedente del delta la necesitaba porque en Pi el
delta *debe* pasar por el escritor determinista; para `summary.md` no existe esa
prohibición y en Pi `write` ya funciona. Añadir `ein_sdd_summary_write` obligaría
a registrar la tool, ampliar `EXACT_TOOL_MAP` y tocar la tabla del orquestador
para comprar cero comportamiento nuevo. `// 005`: el menor cambio correcto.

Montarle a esto un ciclo SDD aparte sería la ceremonia que `// 008` prohíbe. Va
dentro.

### D5 — Dónde vive la indicación de usar el CLI

No en el prompt del agente: quedan ~6 bytes de presupuesto tras el `, bash`, así
que la vía está **mecánicamente cerrada**. Y es la vía que ya falló dos veces.

Va en `sdd-remedies.ts`, que ya recibe el runtime como parámetro
(`collectSddRemedies(status, "claude")`, `cli.ts:100`) y ya inyecta su texto en la
salida de `cc-ein-sdd status`. Cuando el runtime es `claude` y la fase siguiente
es `close`, el remedio nombra `cc-ein-sdd summary <change>`. Es guía **calculada
desde el estado**, que aparece justo cuando hace falta, no prosa fija pagada en
cada turno de cada sesión. Esa es la diferencia entre `// 002` y una cicatriz
convertida en doctrina.

### El residuo honesto

Nada de esto **garantiza** que el modelo llame al CLI; eso no es comprobable de
forma determinista. Lo que sí garantiza es que **una negativa a `Write` deja de
ser terminal**: existe un canal que no es "crear un fichero por iniciativa
propia", y la salida determinista lo nombra en el momento exacto. La
comprobación final es empírica —una ejecución real de `sdd-close` en Claude— y se
declara como tal, no como cobertura de test.

---

## // 006. TDD ESTRICTO — QUÉ FALLA PRIMERO

### Pieza 1

| orden | test | por qué NO falla hoy |
|---|---|---|
| **RED-1** | T1 unitario: `auditEnvelopeConsumers` marca hallazgo cuando una entrada `silent-incorrect-state` declara `foreground-forced` y el forzado no está en las fuentes | `subagent-envelope-contract.ts` no existe: el import revienta. Ningún test del repo audita protecciones declaradas. |
| **RED-2** | T2: consumidores hallados en el handler real == claves del inventario | No hay inventario ni escáner. **Ningún test de `tests/` lee el handler `tool_result` de `ein-ai.ts`.** |
| **RED-3** | T3: cada protección declarada está en la fuente | Idem. Lo más parecido es `tests/readonly-scout-contract.test.ts:79-93`, scout-específico: afirma que el scout fuerza `async:false` porque lo fuerza, sin decir nada de ningún otro consumidor. |

**GREEN**: el inventario declara los cuatro consumidores con su clasificación
real. Ningún fichero de runtime cambia.

**TRIANGULATE**: (a) declarar temporalmente el consumidor 4 como
`silent-incorrect-state` debe poner T3 en rojo — prueba de que la clasificación
manda y no es decorativa; (b) añadir una quinta llamada ficticia con
`event.content` al handler debe poner T2 en rojo. Ambos rojos se observan, se
revierten y se anotan en `apply-progress.md`.

### Pieza 2

| orden | test | por qué NO falla hoy |
|---|---|---|
| **RED-4** | `writeSddSummary` rechaza un `change` inexistente, un nombre no seguro y contenido vacío; escribe en la ruta computada cuando todo es válido | La función no existe. |
| **RED-5** | `runSummaryCommand` devuelve `exitCode: 1` con texto accionable ante stdin vacío, y `0` escribiendo el fichero en el caso bueno | El subcomando no existe: `cc-ein-sdd summary` cae al `default` del dispatch. |
| **RED-6** | `collectSddRemedies(status, "claude")` con fase siguiente `close` nombra `cc-ein-sdd summary` | La rama no existe; el remedio actual no menciona la persistencia del summary. |

**GREEN**: los tres pasan y `tests/prompt-budget.test.ts` sigue verde con los
presupuestos intactos.

**TRIANGULATE**: `writeSddSummary` con un `change` que contenga `../` debe
rechazarse por `isSafeChangeName`, no por casualidad de la ruta.

---

## // 007. CRITERIOS DE ÉXITO

1. `bun test tests/subagent-envelope-contract.test.ts` — 3 tests en verde.
2. `bun test tests/sdd-summary-write.test.ts` — en verde.
3. `bun test` — 2248 + los nuevos, 0 fallos. Conocido y ajeno: el test de PTY
   `Claude continuity supervisor > runs real PTY …` es **intermitente**; si falla
   se reejecuta y se anota, no se persigue.
4. `tsc --noEmit` en la raíz, limpio (cubre `ein-pi` + `cc-ein`).
5. `bun test tests/prompt-budget.test.ts` verde **sin tocar los presupuestos**:
   los 6 bytes de `, bash` entran en el margen. Si no entraran, el apply se
   detiene y lo reporta — no se sube el techo por comodidad.
6. Comprobación manual de que el guardarraíl muerde (Pieza 1): añadir una quinta
   llamada con `event.content` al handler debe poner T2 en rojo con un mensaje
   que nombre la regla y diga qué declarar.
7. Comprobación empírica (Pieza 2, no automatizable): una ejecución real de
   `sdd-close` en Claude persiste `summary.md` sin intervención manual del
   coordinador. Es la única evidencia que cierra el fallo medido.
8. Delta de spec registrado con
   `cc-ein-sdd delta harden-subagent-envelope-contract --domain surface-wiring`
   (**nunca escribiendo el markdown a mano**) y `cc-ein-sdd sync` en el cierre.
   `scope.md` declaró `spec_delta: none` difiriendo a design; **esta fase lo
   revoca**: hay delta, dominio `surface-wiring`, escenarios R1-R5.

Los criterios 1-5 son mecánicos. El 6 existe porque un guardarraíl que nadie ha
visto morder no está verificado. El 7 se declara como manual en vez de fingir que
un test lo cubre (`// 007`).
