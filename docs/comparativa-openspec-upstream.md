# OpenSpec upstream: qué robar y qué no

Análisis comparativo entre [OpenSpec](https://openspec.dev/) (`@fission-ai/openspec`,
MIT) y el ciclo SDD de Ein, hecho el **2026-08-17**. Existe para una sola
decisión: qué mecanismos de OpenSpec merecen entrar en Ein, cuáles ya están
dentro, y cuáles hay que rechazar por escrito para no volver a discutirlos.

Autoridad: **subordinado a `MANIFIESTO.md`**. Cuando este documento y el
manifiesto choquen, gana el manifiesto. No ordena trabajo — eso es
`docs/roadmap-features-ein.md`.

Nota de nombres: en este repo `openspec/` es **el directorio de Ein**. Aquí
"OpenSpec" a secas significa siempre la herramienta upstream de Fission AI.

---

## // 000. VEREDICTO

**OpenSpec es más ancho y más flojo. Ein es más estrecho y más duro.**

Casi nada de lo que OpenSpec hace mejor es *capacidad*: es **flexibilidad**. Y
ahí Ein tiene un problema real que el manifiesto ya nombra por su nombre —
`// 004` (arneses sí, burocracia no) y `// 008` (no exigir ceremonia para un
cambio de una línea). El núcleo de OpenSpec (deltas de spec, merge a specs
canónicos, config con contexto y reglas) ya está implementado en Ein, en varios
casos con más garantías que el original.

Un dato que fija la distancia de diseño: su README recomienda *"high-reasoning
models"* para todo el flujo. Es exactamente lo contrario de `// 001`. OpenSpec
asume modelo caro en todas las fases; Ein reparte fases mecánicas a modelos
baratos. **Su economía no se copia.**

Tres cosas valen la pena, en este orden:

1. Ensamblado de instrucción por artefacto (`instructions --json`).
2. Grafo de artefactos en vez de cadena lineal de fases.
3. Carril rápido declarado para el cambio pequeño.

---

## // 001. COMPARATIVA POR MECANISMO

| Mecanismo | OpenSpec | Ein hoy | Veredicto |
|---|---|---|---|
| Deltas de spec | `ADDED`/`MODIFIED`/`REMOVED` en markdown | `openspec-delta/v1`, parser estricto (`openspec-spec-parser.ts:8`) | **ya dentro** |
| Merge a specs canónicos | `archive` fusiona el delta | `planOpenSpecSync` con conflictos y sha256 (`openspec-spec-sync.ts:48`) | **ya dentro, más duro** |
| Sync sin cerrar | `/opsx:sync` | `cc-ein-sdd sync <change>` (`cli.ts:490`) | **ya dentro** |
| Config de proyecto | `config.yaml` con `context` + `rules` | mismo fichero, misma forma | **ya dentro (forma)** |
| Reglas inyectadas en el prompt | `instructions --json` monta plantilla + contexto + reglas + dependencias | `rules:` se escribe y **nadie la lee** | **ROBAR (1)** |
| Estado del flujo | DAG de artefactos, `BLOCKED`/`READY`/`DONE` por existencia de fichero | `PHASE_ORDER` lineal, fuera de orden = callejón sin salida | **ROBAR (2)** |
| Cambio pequeño | perfil mínimo + `/opsx:ff` | siete fases, una sola entrada | **ROBAR (3)** |
| Contrato JSON para agentes | envelope uniforme en todos los comandos | JSON solo en `sync`; el resto imprime prosa | **ROBAR (4)** |
| Enmienda de un cambio en curso | `/opsx:update` + heurística explícita | sin camino; se rehace la fase | **ROBAR (5)** |
| Adopción en repo existente | `/opsx:onboard` | `sdd-scope` cubre scope, no destila specs de dominio | **ROBAR (6)** |
| Tablero de estado | `openspec view` (TUI) | launcher, sin vista por cambio | **ROBAR (7), bajo** |
| Esquemas de workflow del usuario | `openspec/schemas/*/schema.yaml` | uno fijo | **rechazar** |
| Planificación multi-repo | `stores`, resolución de raíz en 5 niveles | no existe | **rechazar** |
| Cobertura de herramientas | 30+ asistentes | Pi + Claude | **rechazar** |
| Telemetría | activada por defecto | no existe | **rechazar** |
| Evidencia TDD / budget de revisión | no existe | `sdd-verify`, `SddBudgetStatus`, `review-forecast.ts` | **ventaja de Ein** |
| Procedencia del contexto | no existe | sha256 + bytes + límite duro (`ein-ai.ts:342-378`) | **ventaja de Ein** |

---

## // 002. LO QUE YA ESTÁ DENTRO

No hay nada que hacer aquí. Se documenta para cerrar la discusión.

- **Deltas y merge.** `openspec-spec-parser.ts` implementa `openspec-delta/v1`
  con las tres operaciones, y `openspec-spec-sync.ts` planifica el merge a los
  specs canónicos detectando conflictos por dominio y escenario. Ein va más
  allá de OpenSpec: registra `deltaSha256` y `resultSha256`, y modela el estado
  como `unresolved | conflict | synchronized | pending` — es `// 002`
  fail-closed, no un merge optimista.
- **Sync separado del cierre.** `cc-ein-sdd sync <change>` ya actualiza la
  verdad canónica sin archivar. La operación de cierre (`sdd-close.ts:172`) es
  independiente y tiene su propia lectura de preparación.
- **`config.yaml` con `context` y `rules`.** La forma es idéntica a la de
  OpenSpec porque ya se copió. Lo que falta es consumirla — ver `// 003`.
- **Archivo con prefijo de fecha, `doctor`, generación de assets por runtime
  desde una fuente única.** Equivalentes funcionales presentes.

---

## // 003. LAS TRES APUESTAS

### (1) La herramienta ensambla el paquete de instrucción

**Qué hace OpenSpec.** `openspec instructions <artefacto> --json` devuelve, en
un orden fijo, la plantilla del artefacto + el `context` del proyecto + las
`rules` de *ese* artefacto + el contenido de los artefactos de los que depende.
El agente recibe el paquete montado y escribe un artefacto. No decide qué leer.

**Qué hace Ein hoy.** `openspec-config-bootstrap.ts:129-131` **escribe**
`rules.design.require_problem_statement` y compañía en `config.yaml`, y ningún
consumidor las lee: los únicos lectores de ese módulo son el bootstrap y
`sdd-init`. Son decoración. El contrato real vive en los `.md` de los agentes y
en la concatenación de directivas de `ein-ai.ts:764`, que compone el
`systemPrompt` de la sesión.

**Por qué importa.** Toca dos artículos a la vez:

- `// 001` — el ejecutor barato con razonamiento bajo solo funciona sobre plan
  masticado. Si una herramienta entrega el paquete, el ejecutor no piensa: rellena.
  Y es requisito previo del horizonte declarado (fases mecánicas en modelo local),
  porque un paquete cerrado y verificable por herramienta es justo lo que un
  modelo pequeño puede consumir.
- `// 004` — presupuesto de prompt. Hoy las reglas que sobreviven viven en el
  prompt del orquestador, que se paga en **cada turno de cada sesión**. Movidas
  a un paquete por artefacto, viajan solo cuando se ejecuta esa fase. Es la
  única palanca legítima para *retirar* prosa a cambio de código, que es la
  condición que el manifiesto pone para dejar crecer el prompt.

**Cambio concreto.** Un comando `cc-ein-sdd instructions <fase> [change]` que
devuelva `{template, context, rules, dependencies[]}` leyendo `config.yaml`, y
que el delegador use como fuente del prompt de fase en lugar del bloque estático.
Las `rules` pasan de decoración a contrato ejecutable.

**Riesgo.** Si el ensamblado se hace mal, se duplica: reglas en el paquete *y*
en el prompt del agente. La adopción solo cuenta como hecha si el párrafo
equivalente desaparece del prompt del orquestador. Métrica de aceptación: líneas
netas retiradas del prompt fijo.

### (2) Grafo de artefactos, no cadena lineal

**Qué hace OpenSpec.** Su regla textual es *"dependencies are enablers, not
gates"*. Cada artefacto tiene estado `BLOCKED | READY | DONE`, derivado **solo**
de qué ficheros existen en el directorio del cambio. El DAG dice qué se
desbloquea al completar algo, no qué está prohibido. No hay fichero de metadatos
de progreso: el sistema de ficheros es la única fuente de verdad.

**Qué hace Ein hoy.** `sdd-router.ts:156` fija `PHASE_ORDER` lineal
(`scope → map → design → tasks → apply → verify → close`) y la validación de
secuencia trata cualquier hueco como error. Cuando lo detecta, el mensaje
(`sdd-router.ts:559`) es: *"artefacto(s) fuera de orden … limpia el change dir o
arranca por scope"*.

**Por qué importa.** Ese mensaje es un callejón sin salida: el arnés no impide
que el trabajo salga mal, impide que salga. Es la definición literal de
burocracia de `// 004`, y la señal de desvío que el propio manifiesto lista.
Para un cambio trivial, exigir `map` antes de `design` no protege ningún
consumidor mecánico aguas abajo.

**Cambio concreto.** El material ya está: `SddChangeStatus`
(`sdd-router.ts:86`) publica `present: Record<SddPhase, boolean>` y
`artifacts.present/missing`. Falta:

- añadir `ready | blocked | done` por artefacto, con la dependencia que falta
  cuando está bloqueado;
- reducir el bloqueo a lo que tiene consumidor real (`tasks` sin `design`
  bloquea; `design` sin `map` avisa);
- eliminar la salida "limpia el change dir".

Es un cambio pequeño y contenido en un módulo. No toca el determinismo: sigue
siendo cálculo sobre existencia de ficheros.

**Riesgo.** Aflojar demasiado convierte el flujo en el laissez-faire de
OpenSpec, que se permite porque *no tiene* gate de TDD ni de evidencia. Ein sí.
Se roba el DAG; no se roba "haz cualquier cosa en cualquier orden". `verify` y
`close` siguen siendo puertas duras.

### (3) Carril rápido declarado para el cambio pequeño

**Qué hace OpenSpec.** Perfil por defecto de 4 comandos
(`propose`/`apply`/`sync`/`archive`) frente a uno extendido de 11, más
`/opsx:ff` que genera todos los artefactos de planificación de una pasada. El
usuario elige el carril; la herramienta no lo adivina.

**Qué hace Ein hoy.** Siete fases y una sola puerta de entrada, para todo.

**Por qué importa.** `// 008` lo declara no-objetivo explícito: *"un sistema que
exija seguir su ceremonia para hacer un cambio de una línea"*. Hoy el sistema lo
exige.

**Nota honesta sobre la señal.** La tentación es elegir el carril
automáticamente con el budget. No sale gratis:

- `reviewForecast` (`review-forecast.ts:75`) mide churn **ya realizado**
  (`git diff --shortstat`). No sirve para decidir antes de planificar: en ese
  momento no hay diff.
- `SddBudgetStatus.allocated` sí es una declaración previa, pero solo existe
  cuando `tasks.md` existe — es decir, después del punto donde hay que decidir.

Conclusión: **hoy no hay señal determinista pre-plan**. La opción correcta es la
de OpenSpec — que el humano declare el carril al entrar y que la herramienta lo
registre, en vez de inventar una heurística floja. Eso respeta `// 002` (un
determinismo débil se reporta como evidencia incompleta, no se asciende a
conclusión) y `// 005` (la decisión de partir el trabajo es del humano).

**Cambio concreto.** Dos carriles internos, no un motor de perfiles: `micro`
(un artefacto de plan + apply + verify) y `standard` (la cadena actual).
Declarado al abrir el cambio, persistido en el directorio del cambio, visible en
`status`. El carril `micro` no relaja `verify`.

---

## // 004. MEJORAS DE COSTE BAJO

**(4) Generalizar el envelope JSON que Ein ya inventó.**
`cc-ein-sdd sync` ya emite un documento JSON puro en stdout —
`{command, change, ok, outcome, canonicalChanged, domains, report, code, message}` —
con exit codes diferenciados (0 éxito, 2 conflicto, 64 uso). Es buen diseño. El
problema es que es **el único**: `status`, `check`, `close` y `guard` imprimen
prosa, y no existe ninguna bandera `--json` en las superficies de CLI del repo.

El contrato de OpenSpec aporta las tres piezas que faltan para volverlo regla:

- **un documento JSON por invocación en stdout, prosa y spinners a stderr** —
  hoy Ein mezcla ambos según el comando;
- **envelope de diagnóstico uniforme** `{severity, code, message, target, fix}`.
  Ein ya tiene `CloseReadinessBlocker {code, message}`: falta `severity`,
  `target` y, sobre todo, `fix` — una frase accionable por diagnóstico, que es
  lo que convierte un blocker en algo que un ejecutor barato puede resolver sin
  interpretar;
- **contrato de exit codes explícito**, incluida la cancelación (130).

Coste bajo, `// 002` y `// 006` directos.

**(5) Camino de enmienda.** OpenSpec tiene `/opsx:update` para revisar
artefactos de planificación manteniendo coherencia, con una heurística escrita:
>50% de solapamiento y no puedes terminar el original sin tocarlo → enmienda; si
la intención cambió o el alcance explotó, cambio nuevo. Ein no tiene camino de
enmienda: se rehace la fase. Por `// 004`, esto entra como **herramienta**
(`cc-ein-sdd amend`), nunca como párrafo de prompt.

**(6) Adopción en repo existente.** `/opsx:onboard` destila specs desde código
ya escrito. `sdd-scope` cubre el scope y las capacidades de test del proyecto,
pero no "sacar ocho specs de dominio de un repo que ya existe". Ein tiene toda
la maquinaria (CodeGraph, colectores de Cleaner, parser de specs); falta el
comando. Para varios proyectos propios, es adoptar Ein en un paso.

**(7) Tablero por cambio.** `openspec view` da una vista TUI del estado de
artefactos. `// 006`. Encaja en el launcher como consumidor, sin reabrir la
decisión de renderer.

---

## // 005. LO QUE NO HAY QUE ROBAR

| Rechazado | Motivo |
|---|---|
| Esquemas de workflow definibles por el usuario (`openspec/schemas/`) | `// 008`: plataforma genérica. Se roba el mecanismo del DAG, no la extensibilidad. Dos carriles internos, no un motor de esquemas. |
| `stores` / planificación multi-repo | Es su apuesta de equipo y arrastra un contrato de resolución de raíz de cinco niveles. Tentador para varios proyectos propios; no, todavía. |
| Soporte de 30+ asistentes | `// 003`: dos runtimes, una disciplina. Un tercer runtime no autoriza una capa de proveedores. |
| Telemetría activada por defecto | Innecesaria en una herramienta de una persona. |
| "Actions, not phases" en su forma completa | Su fluidez total es viable porque no tiene gate de TDD ni de evidencia. Ein sí. |
| Su economía de modelos | Recomiendan razonamiento alto en todo el flujo. Contradice `// 001` de raíz. |

---

## // 006. DONDE EIN VA POR DELANTE

Se anota para no perderlo al importar mecanismos:

- **Procedencia y presupuesto en el contexto.** `ein-ai.ts:342-378` limita el
  contexto de spec canónico a 3 ficheros y 32 KiB, entrega `path` + `sha256` +
  `bytes` por referencia, y **bloquea pidiendo un dominio más estrecho en vez de
  truncar**. OpenSpec no tiene equivalente.
- **Evidencia TDD y budget de revisión** (`sdd-verify`, `SddBudgetStatus`,
  `review-forecast.ts`) y detección de evidencia obsoleta (`verifyStale`,
  `summaryStale`).
- **Gate de entrega determinista** y delegación a `ein-git`.
- **Continuidad bidireccional entre runtimes** por disco, no por transcripción.
- **Enrutado de modelos por fase**, que es el principio económico hecho código.

---

## // 007. ALCANCE DE LA VERIFICACIÓN

Lo comprobado en esta sesión (2026-08-17):

- **Leído de OpenSpec**: página principal, README de GitHub, `/docs/opsx`,
  `/docs/core-concepts`, `/docs/reference/cli`, `/docs/reference/agents`.
  No se ha instalado ni ejecutado la herramienta.
- **Leído de Ein**: `sdd-router.ts` (exports, `PHASE_ORDER`, tipos de estado),
  `openspec-spec-sync.ts`, `openspec-spec-parser.ts`,
  `openspec-config-bootstrap.ts`, `cc-ein/sdd-cli/cli.ts` (`statusCmd`,
  `closeCmd`, `syncCmd`, `emitSyncResponse`), `review-forecast.ts`,
  `ein-ai.ts` por grep dirigido, `openspec/config.yaml`,
  `openspec/specs/sdd-lifecycle/spec.md`, `docs/roadmap-features-ein.md`.
- **No comprobado**: si algún consumidor lee `config.yaml.rules` por una ruta
  distinta a `openspec-config-bootstrap.ts` (la búsqueda fue por nombre de
  módulo y por clave); el comportamiento en ejecución de `sdd-close.ts`; el
  coste real en líneas de prompt que la apuesta (1) permitiría retirar.

Ninguna afirmación de este documento se apoya en una ejecución de test. Es
lectura de código y de documentación.

---

## // 008. CONDICIÓN DE RETIRADA

Este documento se **borra** cuando ocurra lo primero de:

- las apuestas (1), (2) y (3) están decididas — adoptadas o rechazadas por
  escrito en `docs/roadmap-features-ein.md`; o
- pasan seis meses (**2027-02-17**) sin que ninguna entre en el roadmap.

No se mantiene actualizado contra versiones futuras de OpenSpec. Es una foto con
fecha, no un observatorio. Un documento sin condición de retirada es el
`// 008` que este repo rechaza.

**Siguiente paso propuesto:** un spike acotado que mida solo la apuesta (1) —
qué párrafos concretos del prompt del orquestador desaparecen si las reglas de
fase se inyectan por artefacto. Es la decisión que desbloquea las otras dos.
