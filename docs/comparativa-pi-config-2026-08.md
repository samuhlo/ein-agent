# Comparativa Ein ↔ `pi-config` de Amos Blomqvist (agosto 2026)

> Intención corta: medir el setup de Pi que mejor funciona ahí fuera, entender por
> qué parece más simple, y dejar decidido —con evidencia y enlaces— qué se adopta
> en Ein, qué se descarta, y qué queda anotado para más adelante.

**Fecha de medición:** 2026-08-26. Todas las cifras de este documento se
remidieron ese día sobre los commits de la tabla; ninguna viene de memoria.

| Repo | Commit medido | Fecha |
|---|---|---|
| [`amosblomqvist/pi-config`](https://github.com/amosblomqvist/pi-config) | [`f82da56`](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3) | 2026-08-25 |
| [`amosblomqvist/pi-observational-memory`](https://github.com/amosblomqvist/pi-observational-memory) | [`78a1efc`](https://github.com/amosblomqvist/pi-observational-memory/tree/78a1efcfdd46332253fb289724f05b26dfc7769e) | 2026-08-25 |
| [`amosblomqvist/pi-interactive-subagents`](https://github.com/amosblomqvist/pi-interactive-subagents) | [`c3e8b53`](https://github.com/amosblomqvist/pi-interactive-subagents/tree/c3e8b53c0754ae5ccc19fdab5a7481ec039bc2f7) | 2026-08-25 |
| Ein | `9f95a24` (`main`) | 2026-08-26 |

**Autoridad:** por debajo de [`MANIFIESTO.md`](../MANIFIESTO.md). Este documento no
fija rumbo: propone adopciones con evidencia. Lo que se acepte sube al roadmap.

**Relación con otros documentos:**
[`docs/valoracion-estado-y-rumbo-2026-08.md`](valoracion-estado-y-rumbo-2026-08.md)
mira a Ein hacia dentro; este mira hacia fuera y coincide con ella en tres
diagnósticos que ya estaban escritos (el prompt del orquestador, la ceremonia
sobre cambios pequeños, el archivo dentro del árbol vivo). Donde coinciden, este
documento aporta el mecanismo que allí faltaba y el número que faltaba.

---

## // 000. VEREDICTO EN UNA PÁGINA

**`pi-config` no es más simple que Ein. Está empaquetado de otra forma, y esa
forma —no el tamaño— es lo que hay que copiar.**

El repo visible son 5.734 líneas. Sus dos piezas serias viven en repos aparte y
suman 14.723 más. El sistema real de Amos son **~20.500 líneas**; el motor de Ein
(`ein-pi/agent/`) son **34.744**. No es 5k contra 240k: es 20k contra 35k, y él
tiene menos porque no construye SDD, ni instalador, ni dos runtimes.

La diferencia estructural es una sola: **en su sistema cada capacidad tiene un
interruptor y solo se paga cuando se enciende; en Ein la disciplina está siempre
puesta y se paga siempre.**

Cuatro adopciones salen de ahí. Dos son urgentes y una de ellas es un defecto:

1. **Guardrail shell-aware** — sus regex están sustituidas por tokenización real.
   Las de Ein tienen falsos negativos medidos: `git push -f` y `rm -fr /` pasan.
   La promesa *"Force-push is always denied"* escrita en `ein-pi/core/AGENTS.md:31`
   y `ein-cc/CLAUDE.md:33` **hoy es falsa**.
2. **Contabilidad de sesiones** — su skill lee el coste real del JSONL. Ein tiene
   1.278 sesiones con `usage.cost` completo y **nadie las ha leído nunca**: son
   **$412,76** de gasto ciego, y el **85,4% se ha ido en construir Ein, no en
   usarlo**.
3. **Un sitio donde las cosas puedan morir** (`deprecated/`) — el mecanismo que le
   falta al `// 004` del manifiesto.
4. **Snippets de prompt efímeros** — la alternativa a que toda regla nueva acabe
   siendo prosa permanente en el orquestador.

Se descartan explícitamente su memoria observacional, sus subagentes en tmux, su
modelo de distribución y su ausencia de tests. El detalle, en `// 010`.

---

## // 001. QUÉ ES `pi-config`, MEDIDO

### Inventario

| Pieza | Líneas | Qué es |
|---|---|---|
| `pi-config` activo | **5.734** (33 ficheros) | 8 extensiones + 4 skills |
| `pi-config/deprecated/` | ~1.500 | Lo que no ganó su sitio, conservado |
| `pi-observational-memory` | **5.662** | Memoria por observadores + compactación determinista |
| `pi-interactive-subagents` | **9.061** | Subagentes async en paneles tmux |
| **Sistema real** | **~20.500** | |

Y el dato que más dice de la naturaleza del repo: **`pi-config` tiene 2 commits**
— `575a0a5` inicial y `f82da56` *"6 month config refresh: add new extensions/skills
and retire old ones to deprecated/"*. No es un historial de trabajo: es un
escaparate. **Publica lo que sobrevivió, no el proceso.**

### El mismo corte sobre Ein

| Pieza | Líneas | |
|---|---|---|
| `ein-pi/agent/` | **34.744** | 102 módulos en `lib/`, 11 extensiones, 7 superficies |
| `installer/` | 9.778 | CLI, TUI, backups, releases |
| `tests/` | 43.108 | 191 ficheros, ~2.465 tests |
| `openspec/changes/archive/` | **63.124** | **71 cambios SDD cerrados, dentro del árbol vivo** |
| `ein-pi/core/skills/downloaded/` | 89.533 | Docs de terceros vendorizadas |
| `ein-pi/core/skills/local/` | 3.494 | 16 skills propias |
| Commits | **827** | |

Ein publica el proceso entero. **El archivo SDD más los skills descargados son el
63% del repo, y ninguna de las dos cosas es el producto.** La señal 5 de deriva de
la valoración de agosto (archivo / motor > 1,0) sigue disparada y ha **empeorado**:
63.124 / 34.744 = **1,82** (era 1,61).

### El README que fija la filosofía

> *"This is **not** meant to be installed as one big package. Browse the repo and
> copy the pieces you want into your own Pi config."*
> — [`README.md`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/README.md)

Es el opuesto exacto de Ein: instalador, canales de release, backups, `ein doctor`.
**No es un error de ninguno de los dos**: son respuestas a problemas distintos.
Pero explica la sensación de "a él le va genial con algo simple", y conviene saber
que la simplicidad está en la *distribución*, no en el código.

---

## // 002. EL MECANISMO: POR QUÉ SU FORMA CUESTA MENOS

Esta es la parte importante del documento. Lo demás son consecuencias.

### La idea llana

Dos talleres. En el primero cada herramienta cuelga de la pared y la coges cuando
hace falta; si no la usas, no pesa. En el segundo llevas siempre puesto un
cinturón con todas: nunca te falta nada, pero cargas el peso entero incluso para
apretar un tornillo.

Amos tiene el primero. Ein tiene el segundo. Los dos funcionan. El segundo cansa
más, y el cansancio no se nota en un día: se nota en el mes 6.

En un agente, "peso" es **contexto** — texto que viaja en cada turno y que se paga
en tokens y en atención del modelo. Se acumula en tres sitios.

### Sitio 1 — El prompt permanente

`ein-pi/agent/assets/orchestrator.md` son **6.518 palabras / 43 KB** inyectadas en
toda sesión de Pi y de Claude, siempre, hagas una release o corrijas una coma.

Amos tiene **cero** palabras fijas de orquestación. Tiene seis ficheros de ~40
palabras en
[`extensions/prompt-snippets/snippets/`](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/prompt-snippets/snippets),
que se activan con `alt+s`, se inyectan en **ese** mensaje y **se apagan solos al
enviarlo**. Uno de ellos dice literalmente lo mismo que los primeros párrafos del
orquestador de Ein:

> *"This is a pure high-level orchestrator session. Outsource mechanical work —
> file exploration, code reading, implementation — to subagents. Keep your own
> context window lean […]"*
> — [`orchestrator-mode.md`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/prompt-snippets/snippets/orchestrator-mode.md)

**Matiz honesto, medido:** de 1.336M tokens de entrada consumidos por Ein,
**1.200M (89,8%) fueron `cacheRead`**. El prompt fijo **sí se cachea**, así que su
coste en dólares es mucho menor de lo que sugiere su tamaño. Su coste real es de
**atención del modelo**, no de dinero. Esto rebaja la urgencia del robo de
snippets frente a lo que parecía a simple vista, y así está reflejado en el orden
de `// 012`.

### Sitio 2 — Las capacidades encendidas

El navegador de Amos está **apagado por defecto** (`/browser on`). Su memoria
observacional está **apagada por defecto** (`/om`) — el README lo dice sin
rodeos: *"gated off per session and is completely invisible until you turn it on
[…] When off, every trigger, hook, widget, and subprocess returns immediately."*
Su bash-guard tiene toggle de sesión. **El default de todo su sistema es OFF.**

El default de Ein es ON, y no por diseño abstracto sino **medido**: de los 71
cambios archivados, **55 tienen `map.md`** (77%) — carril completo de siete fases.
El carril `micro` existe, está bien argumentado en `ein-pi/agent/lib/sdd-lane.ts`,
y su uso declarado es **cero**: ningún `preflight.json` archivado registra un campo
`lane`. `DEFAULT_LANE` es `"standard"` (`sdd-lane.ts:36`). **La válvula está
construida y casi no se abre.**

### Sitio 3 — El coste de retirada (el que no se ve)

Cuando Amos jubila una extensión, la mueve a `deprecated/` y escribe una línea:

> *"`deprecated/` holds the extensions and skills from the two-month setup that
> are no longer in active use. They still work; they just didn't earn their
> place. Kept for reference."*

Coste: un `git mv`.

Cuando Ein jubila una pieza hay que tocar el módulo, su test espejo, el bundle del
instalador, la paridad del adaptador Claude, `ein-cc/sync.ts`, la docs-site y
probablemente un spec de OpenSpec. Coste: un cambio SDD completo.

**La arquitectura de Ein hace barato añadir y caro quitar.** Por eso crece: no
porque se decida crecer, sino porque la asimetría empuja en una dirección. El
manifiesto `// 004` ya nombró el síntoma —*"un guardarraíl nace con su condición
de retirada"*— pero es una norma de prosa contra una fuerza estructural, y la
prosa pierde. Lo que Amos tiene y Ein no es el **mecanismo**: una carpeta donde
algo puede morir sin ceremonia.

---

## // 003. INVENTARIO COMPLETO CON DECISIÓN

Todas las piezas de los tres repos, con enlace y veredicto. Sin huecos.

### Extensiones de `pi-config`

| Pieza | Líneas | Qué hace | Decisión |
|---|---|---|---|
| [`bash-guard/`](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/bash-guard) | 550 | Hook `tool_call` sobre `bash`, parseo shell-aware, dos modos (interactivo / headless) | **ADOPTAR** → `// 005` |
| [`prompt-snippets/`](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/prompt-snippets) | 325 | Reglas markdown toggleables por mensaje, reset tras enviar | **ADOPTAR** → `// 007` |
| [`ask-user-question.ts`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/ask-user-question.ts) | 669 | Popup de pregunta con opciones + "Other" libre, y **lock de UI compartido entre extensiones** | **OBSERVAR** → `// 009` |
| [`browser/`](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/browser) | 590 | Chromium headless por Playwright; off por defecto (`/browser on`) | **DESCARTAR** (Ein ya tiene Chrome vía Claude) |
| [`web-fetch/`](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/web-fetch) | 650 | URL → markdown limpio | **DESCARTAR** (cubierto) |
| [`web-search/`](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/web-search) | 323 | Búsqueda web | **DESCARTAR** (cubierto) |
| [`custom-header.ts`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/custom-header.ts) | 98 | Cabecera Π grande | **DESCARTAR** (Ein tiene su identidad, y mejor) |
| `interactive-subagents/`, `observational-memory/` | 7 c/u | Stubs que apuntan a los repos grandes | — |

### Skills de `pi-config`

| Pieza | Líneas | Qué hace | Decisión |
|---|---|---|---|
| [`analyze-sessions/`](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3/skills/analyze-sessions) | ~1.200 | Coste, minería de prompts, render y búsqueda sobre sesiones pasadas | **ADOPTAR** → `// 006` |
| [`web-debug/`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/skills/web-debug/SKILL.md) | 201 | Playbook de depuración frontend con el navegador | **OBSERVAR** (si vuelve trabajo web repetitivo) |
| [`pdf-reader/`](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3/skills/pdf-reader) | ~360 | PDFs a contexto, con venv propio | **DESCARTAR** |
| [`youtube-transcript/`](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3/skills/youtube-transcript) | 171 | Título + transcripción como JSON | **DESCARTAR** |

### Repos grandes

| Pieza | Líneas | Decisión |
|---|---|---|
| [`pi-observational-memory`](https://github.com/amosblomqvist/pi-observational-memory) | 5.662 | **DESCARTAR ahora, leer el diseño** → `// 009` |
| [`pi-interactive-subagents`](https://github.com/amosblomqvist/pi-interactive-subagents) | 9.061 | **DESCARTAR** → `// 010` |

---

## // 004. LO QUE EIN HACE MEJOR (para no perderlo de vista)

Un documento así invita a rehacerlo todo. Antes de las adopciones, lo que no está
en discusión porque Amos sencillamente no lo tiene:

- **Estado del cambio en disco.** `openspec/changes/<cambio>/` con un artefacto
  por fase. Amos no tiene equivalente: su continuidad es memoria de sesión.
- **Enrutado determinista.** El estado de fase lo calcula `sdd-router.ts`, no el
  recuerdo del modelo.
- **~2.465 tests en 191 ficheros.** `pi-config` no tiene ninguno. (Sus repos
  grandes sí: obs-mem e int-sub llevan suite propia.)
- **Dos runtimes con continuidad bidireccional.** Fuera del alcance de Amos.
- **Instalador con backups, canales y `doctor`.** Ídem.
- **Un manifiesto que gobierna de verdad** y que ya ha detectado sus propias
  desviaciones antes que su autor.
- **Gate de entrega con grants acotados** (`guardrails.ts`, TTL 10 min, scope por
  cwd, 3 usos): más fino que el prompt binario de Amos. Se conserva entero.

---

## // 005. ADOPTAR 1 — GUARDRAIL SHELL-AWARE

**Prioridad: máxima. Esto es un defecto, no una preferencia.**

### La evidencia

Su
[`bash-guard/index.ts`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/bash-guard/index.ts)
no usa regex sobre la cadena. Parsea con
[`shell-quote`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/bash-guard/index.ts#L5),
parte en segmentos por `&&`/`||`/`;`
([`splitOnOps`, L26](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/bash-guard/index.ts#L26);
[`analyzeBashCommand`, L269-295](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/bash-guard/index.ts#L269))
y analiza cada segmento como `cmd` + `args` con
[`hasFlag`, L41](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/bash-guard/index.ts#L41).

Ein aplica regex sobre el comando entero: `DENIED_BASH_PATTERNS`
(`ein-pi/agent/lib/guardrails.ts:38`) y `CONFIRM_BASH_PATTERNS`
(`guardrails.ts:47`), evaluadas en `evaluateDeniedCommand` (`guardrails.ts:168`).

### La sonda (reejecutada el 2026-08-26 sobre `9f95a24`)

```
DENY  git push --force
PASA  git push -f origin main          ← force-push, no bloqueado
PASA  git -C /repo push --force        ← force-push, no bloqueado
PASA  git push origin +main:main       ← force-push por refspec, no bloqueado
PASA  rm -fr /
PASA  rm -r -f /
PASA  rm --recursive --force /
DENY  rm -rf /
DENY  git reset --hard HEAD~1
DENY  echo 'git push --force'          ← falso positivo: es una cadena, no un comando
DENY  F=1 git push --force
```

### Las dos consecuencias

1. **`ein-pi/core/AGENTS.md:31` y `ein-cc/CLAUDE.md:33` prometen *"Force-push is
   always denied"*. No es cierto.** `git push -f` no está en `DENIED`; cae en
   `CONFIRM` por `/\bgit\s+push\b/` y se aprueba con un enter. El manifiesto
   `// 009` señal 9 —*"una pantalla muestra como verdad algo que no ha
   verificado"*— aplica igual a una promesa de prompt.
2. **`rm -fr /` y `rm -r -f /` no están en ninguna de las dos listas.** Pasan sin
   bloqueo ni confirmación.

Y el falso positivo tiene su gracia: al intentar escribir la sonda con un heredoc,
el propio hook de Ein la bloqueó porque el *texto* contenía `rm -rf /`. Un guard
que no distingue una cadena de un comando falla en las dos direcciones a la vez.

Esto viola el manifiesto `// 002` en su propio terreno: **es una garantía de
seguridad implementada como heurística de texto**, que es exactamente lo que ese
apartado prohíbe.

### Qué se adopta y qué no

- **Se adopta:** la tokenización con `shell-quote`, el troceado por operadores y
  el análisis por segmento con `cmd`/`args`/`hasFlag`.
- **Se adopta también:** su antibucle
  ([`recentlyAborted`, L497](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/bash-guard/index.ts#L497)),
  60 s recordando un comando abortado para que el modelo no reintente el mismo en
  bucle. Ein no tiene equivalente.
- **Se adopta la idea de dos perfiles** (interactivo con prompt / headless con
  bloqueo duro, discriminados por `PI_SUBAGENT_DEPTH`,
  [L354-358](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/bash-guard/index.ts#L354)),
  que Ein ya tiene en espíritu pero no separada en listas distintas.
- **NO se adopta:** su agresividad (pide confirmación ante *cualquier* `git`, y
  ante `lsblk`). Con el gate de entrega de Ein sería fricción pura.
- **NO se toca:** grants delegados, TTL, scope por cwd, `DELIVERY_AGENTS`. Eso de
  Ein es mejor y es ortogonal al parseo.

### Coste y forma

Cambio acotado a `ein-pi/agent/lib/guardrails.ts` + su test espejo. Los once casos
de la sonda son la suite RED de partida. **TDD estricto, sin excepción: toca
seguridad.** Dependencia nueva: `shell-quote` (^1.8.3), MIT — o una tokenización
propia de ~60 líneas si se prefiere no añadir dependencia; la decisión es del
cambio, no de este documento.

---

## // 006. ADOPTAR 2 — CONTABILIDAD DE SESIONES

**Prioridad: máxima. Es el hueco más grande entre el manifiesto y el código.**

### El hueco

`MANIFIESTO.md // 001` se titula **"El principio económico"** y es el fundamento de
todo el diseño de Ein: el modelo caro decide el mapa, los baratos recorren rutas
cortas, el coste se controla con el nivel de razonamiento.

**No se mide nada de eso.** `ein-pi/agent/lib/sessions.ts` lee *solo la primera
línea* de cada JSONL para pintar el banner (`sessions.ts:82-88`). Un barrido de
`cost` sobre los 102 módulos de `lib/` no devuelve una sola agregación de gasto.

### Lo que hay ahí guardado, medido hoy

Las sesiones de Ein viven en `~/.pi-ein/agent/sessions/` con el mismo shape que
asume la skill de Amos (`message.usage.cost.{input,output,cacheRead,cacheWrite,total}`).
Sonda directa sobre ellas:

| Métrica | Valor |
|---|---|
| Ficheros de sesión | **1.278** |
| Mensajes con coste registrado | **21.986** |
| **Gasto total acumulado** | **$412,76** |
| Input no cacheado | 136,3M tokens |
| `cacheRead` | 1.199,9M tokens (**89,8% del input**) |
| Output | 9,5M tokens |
| Ratio input/output | **14,3 : 1** |

**Reparto por proyecto:**

| Gasto | Proyecto |
|---|---|
| $265,89 | `ein-agent` |
| $70,64 | `ein-agent-worktrees/rele…` |
| $45,08 | `planificador-didactico` |
| $13,12 | `ein-agent-worktrees/rumb…` |
| $7,91 | `samuhlo-omarchy-theme` |
| $4,09 | `fitness-dev-app` |
| $3,03 | `ein-agent-worktrees/task…` |

**Reparto por modelo:** $256 `gpt-5.6-sol` · $33 `gpt-5.5` · $26 `MiniMax-M2.7` ·
$20 `gpt-5.6-luna` · $8 `MiniMax-M3` · ~$73 sin modelo atribuible (el
`model_change` no siempre precede al mensaje; la skill de Amos resuelve esto
acreditando cada mensaje a su propio modelo).

### Las tres lecturas

1. **$352,68 de $412,76 —el 85,4%— se ha gastado en construir Ein, no en usar
   Ein.** El trabajo real de cliente son $60. Esto contesta con un número la
   pregunta 5 de la valoración de agosto (*"¿cuál es el ritmo sostenible?"*): la
   transición de construirse a usarse todavía no ha empezado.
2. **El caché funciona** (89,8%). El prompt fijo de 43 KB no es principalmente un
   problema de dinero: es un problema de atención del modelo. Dato que **rebaja**
   la prioridad del robo 3 y **sube** la de este.
3. **Ratio 14,3:1 de entrada sobre salida.** El sistema lee muchísimo más de lo
   que escribe. Coherente con un orquestador que delega, pero es una hipótesis
   hasta que se pueda separar el gasto de padre y de subagentes — que es justo lo
   que esta adopción habilita.

### Qué se adopta

Su skill son ~1.200 líneas de Python **stdlib puro** (sin dependencias):

| Script | Qué da |
|---|---|
| [`cost.py`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/skills/analyze-sessions/scripts/cost.py) | Coste por `total`/`day`/`project`/`model`/`session`; subagentes incluidos por defecto |
| [`prompts.py`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/skills/analyze-sessions/scripts/prompts.py) | Volcado de prompts propios para minar patrones repetidos |
| [`show_session.py`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/skills/analyze-sessions/scripts/show_session.py) | Render de una sesión a markdown, con transcripciones de subagentes |
| [`search.py`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/skills/analyze-sessions/scripts/search.py) | Búsqueda por transcripciones, `--errors-only`, `--min-cost` |
| [`sessions.py`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/skills/analyze-sessions/scripts/sessions.py) | Librería de un solo paso reutilizable (agregación en `L259-264`) |

**Decisión de forma para Ein: reescribirlo en TypeScript, no portar el Python.**
Razones: `lib/` es TypeScript determinista y testeable con la suite existente, Ein
tiene que leer **dos** almacenes (`~/.pi-ein/agent/sessions/` y las sesiones de
Claude, ya modeladas en `claude-sessions.ts` y `runtime-session-adapters.ts`), y
una skill en Python añade un runtime más a un proyecto que hoy solo necesita Bun.
Lo que se copia es el **modelo de datos y el vocabulario de filtros**, que están
bien pensados: `--since/--until`, `--cwd`, `--model`, `--session`,
`--include-subagents`, `--min-cost`, `--errors-only`.

Superficie propuesta: `ein cost` (o `/ein:cost`) con los mismos ejes, más un dato
que Amos no necesita y Ein sí: **coste de sesión padre frente a coste de
subagentes**, que es la métrica que valida o refuta el `// 001` del manifiesto.

**`prompts.py` merece su propia mención**: su flujo documentado es *"corre el
volcado de 30 días, agrupa por temas recurrentes, propón añadidos a las
instrucciones globales"*. Es un método para decidir qué entra en el prompt del
orquestador **con evidencia en vez de por cicatriz**, que es exactamente lo que el
manifiesto `// 004` pide y hoy no tiene cómo hacer.

---

## // 007. ADOPTAR 3 — SNIPPETS DE PROMPT EFÍMEROS

**Prioridad: media. Alta como experimento, baja como ahorro.**

### El problema que resuelve

Hoy, la única respuesta de Ein a "el agente hizo X mal" es añadir prosa al
orquestador, que cobra a todas las sesiones futuras por un fallo que pasó una vez.
El manifiesto `// 004` detecta el patrón (*"la cicatriz no es doctrina"*) pero no
ofrece alternativa: si no puede ser código y no cabe en el prompt, **no hay tercer
sitio**. El snippet es ese tercer sitio.

### El mecanismo, verificado como portable

[`prompt-snippets/index.ts`](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/prompt-snippets/index.ts)
es sorprendentemente pequeño (325 líneas, casi todo la UI del menú). El corazón
son 20 líneas en el hook `input`
([L294-311](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/prompt-snippets/index.ts#L294)):

```ts
pi.on("input", async (event, ctx) => {
  if (enabled.size === 0) return;         // nada activo: coste cero
  snippets = loadSnippets();               // relee de disco: editar surte efecto ya
  const active = snippets.filter((s) => enabled.has(s.id));
  enabled = new Set();                     // ← reset tras enviar: la clave del diseño
  updateWidget(ctx);
  return { action: "transform", text: [...prepends, event.text, ...appends].join("\n\n") };
});
```

Cada snippet es un markdown con frontmatter `name` / `description` / `placement`
(`prepend`|`append`) / `order`
([`parseSnippet`, L38](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/prompt-snippets/index.ts#L38)).

**Portabilidad verificada en el paquete que usa Ein**
(`@earendil-works/pi-coding-agent@0.84.1`, comprobado en los `.d.ts` instalados,
no supuesto):

- `InputEventResult` incluye `{ action: "transform", text }` —
  `dist/core/extensions/types.d.ts:639-644`. ✔
- `registerShortcut(shortcut, options)` — `types.d.ts:905`. ✔
- `ExtensionShortcut` — `types.d.ts:1123`. ✔
- Ein **ya usa** `pi.on("input")` en `ein-ai.ts` y `ein-continuity.ts`, así que el
  punto de enganche está probado en producción. ✔

El port es casi directo; solo cambia el scope de import
(`@mariozechner/…` → `@earendil-works/…`, ver `// 011`).

### La condición de adopción

Los seis snippets de Amos son, tal cual, aplicables a Ein
([carpeta completa](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/prompt-snippets/snippets)):
*Session kickoff*, *Ask questions*, *Verify don't assume*, *Delegate exploration*,
*Orchestrator mode*, *Diagnose don't fix*. Los dos últimos ya viven —permanentes—
dentro de `orchestrator.md`.

**Pero adoptar snippets sin sacar prosa del orquestador empeora el sistema:** una
superficie más y ningún byte menos. El manifiesto `// 004` lo dice sin ambigüedad
(*"crece solo si algo sale a cambio"*).

Por tanto, la adopción va **atada a una condición**: el cambio que introduzca
snippets tiene que mover al menos un bloque de `orchestrator.md` a snippet y medir
el resultado. Y hay una trampa ya documentada en el manifiesto que aplica aquí de
lleno: **parte de la prosa es portante** — hay reglas que el runtime detecta
buscando una frase literal. Antes de mover un bloque, comprobar con un barrido que
ningún código depende de él.

El valor mayor no es el ahorro: es que **convierte una discusión de opinión en un
experimento**. Sacas un párrafo a snippet; si en dos semanas no lo has encendido
nunca, no hacía falta.

---

## // 008. ADOPTAR 4 — UN SITIO DONDE LAS COSAS PUEDAN MORIR

**Prioridad: baja en esfuerzo, alta en efecto. Es lo más barato del documento.**

Una carpeta `deprecated/` (o `ein-pi/attic/`) con la regla de Amos escrita en su
README: *funciona, pero no se ganó su sitio; se conserva por referencia*.

Contrato mínimo:

- Mover algo ahí **no** es un cambio SDD. Es un `git mv` y una línea en un índice.
- Lo que está ahí **no** entra en el bundle del instalador, **no** exige paridad
  con Claude, **no** tiene test espejo obligatorio y **no** aparece en la
  docs-site.
- Un barrido determinista comprueba que nada vivo importa de ahí. Eso sí es código.

Es el mecanismo que le falta al `// 004` del manifiesto y el contrapeso directo a
la asimetría añadir/quitar de `// 002`. Candidatos inmediatos: los módulos
huérfanos ya identificados en el recorte 2 de la valoración de agosto.

---

## // 009. PENDIENTES: LO INTERESANTE QUE NO SE HACE AHORA

Anotado con su razón, para que dentro de tres meses no haya que redescubrirlo.

### `pi-observational-memory` — leer el diseño, no el código

5.662 líneas. Pipeline: trozos crudos → **observadores paralelos** (subprocesos
`pi` headless) → observaciones atómicas → ledger local a la rama → **bloque de
compactación renderizado de forma determinista y sin modelo** → consolidador que
promueve lo más viejo a ficheros `.memory/<sesión>/<tema>.md` grepables.

**Lo valioso para Ein no es la implementación: es la idea de compactación
determinista.** *"a deterministic, model-free compaction renders that buffer
verbatim into the compaction block"* es literalmente el `// 002` de Ein aplicado a
la memoria, y Ein no lo hace así.

Detalles concretos que merece la pena robar el día que se toque continuidad:

- El **ledger local a la rama**, para que la memoria siga siendo correcta bajo
  `/tree`; y en cambio los ficheros de memoria duradera **no** revierten, porque
  siguen a la sesión y no a la rama. Esa distinción de niveles está bien pensada.
- El **coste por worker** contabilizado desde `usage.cost.total` de Pi y sumado a
  un ledger propio: *"cost rides the result-file IPC, never a saved session log"*.
  Conecta directamente con `// 006`.
- **Apagado por defecto**, y con `PI_OM_PASSIVE=1` para pruebas limpias.

**No se adopta** porque Ein ya resuelve el problema equivalente con checkpoints en
disco y `continuity-*`, y 5.662 líneas de mecanismo nuevo contra un problema ya
cubierto es exactamente el crecimiento que este documento diagnostica.

### `ask-user-question` — el lock de UI compartido

[`SHARED_UI_LOCK_KEY`, L546-566](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions/ask-user-question.ts#L546):
un lock global en `process` que serializa los popups de **todas** las extensiones,
encadenando promesas. Detalle pequeño y muy bien visto.

**Relevante para Ein** porque hay varias superficies que pueden querer la UI a la
vez (banner, doctor, confirmación de guardrail, gate de entrega). Hoy no consta
que colisionen; el día que lo hagan, la solución ya está escrita en 20 líneas.

### `web-debug` + `browser`

El [playbook](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/skills/web-debug/SKILL.md)
está bien construido y sería directamente aplicable si vuelve trabajo web
repetitivo. Enganchado a su extensión `browser/`, apagada por defecto. Ein tiene
Chrome en Claude pero no en Pi.

### Sacar las piezas grandes a repos aparte

La estructura de Amos —config pequeño + repos independientes con su propia suite—
es la que hace su sistema manejable. El equivalente para Ein sería sacar
`docs-site/` y quizá `installer/`. **No se hace ahora**: partir un monorepo que
funciona, en solitario, tiene un coste alto y un beneficio difuso. Queda anotado
porque es la lección estructural del `// 002` y porque el día que el repo pese
demasiado, esta es la salida.

### Sacar el archivo SDD y los skills descargados del árbol vivo

No es de Amos, pero su repo lo hace evidente por contraste: él publica lo que
sobrevivió. Ya está propuesto como recortes 3 y 5 en la valoración de agosto; este
documento lo confirma con el ratio archivo/motor de **1,82** y con el 63% del repo.

---

## // 010. LO QUE NO SE ADOPTA, Y POR QUÉ

- **Su modelo de distribución.** *"copy the pieces you want"* funciona para una
  config personal. El instalador de Ein con backups, canales y `doctor` es
  infraestructura real y resuelve un problema que Amos no tiene. **No se cambia.**
- **Su ausencia de tests.** `pi-config` no tiene ninguno. Los ~2.465 de Ein son su
  activo más sólido.
- **`pi-interactive-subagents`.** Superficie preciosa (paneles tmux, widget de
  estado, `ask_question` del hijo al padre, snapshot de loadout para resumir con
  el mismo sandbox). Es 9.061 líneas y resuelve un problema que Ein no tiene: sus
  subagentes son síncronos y acotados **a propósito**, porque el contrato de fase
  SDD depende de que devuelvan un envelope y mueran. Adoptarlo sería importar una
  arquitectura de concurrencia para decorar un flujo que no la pide.
- **`browser/`, `web-fetch/`, `web-search/`, `pdf-reader/`, `youtube-transcript/`,
  `custom-header.ts`.** Cubiertos, innecesarios, o peores que lo que Ein ya tiene.
- **Su agresividad de confirmación** (prompt ante cualquier `git`, ante `lsblk`).
  Con el gate de entrega de Ein sería fricción sin garantía añadida.
- **Y la conclusión perezosa: "Ein debería ser más pequeño como pi-config".** Es
  falsa. Sus dos piezas grandes son tan complejas como las de Ein. Lo que hizo
  bien fue **empaquetarlas para que se puedan apagar y retirar**, no hacerlas
  pequeñas.

---

## // 011. NOTAS DE PORTABILIDAD

Detalles que van a morder si se ignoran.

- **Scope de npm distinto.** Amos importa de `@mariozechner/pi-coding-agent` y
  `@mariozechner/pi-tui`; Ein usa `@earendil-works/pi-coding-agent@0.84.1` y
  `@earendil-works/pi-tui@0.84.1`. Es el mismo agente renombrado; los imports hay
  que reescribirlos. `pi-interactive-subagents` importa además de `pi-mono`.
- **API verificada como presente en `0.84.1`**: `InputEventResult` con
  `action: "transform"` (`types.d.ts:639`), `registerShortcut` (`types.d.ts:905`),
  `ExtensionShortcut` (`types.d.ts:1123`), `pi.on("input", …)` (`types.d.ts:899`).
- **`PI_SUBAGENT_DEPTH`** es la variable que Amos usa para distinguir sesión padre
  de subagente. Antes de usarla en Ein hay que confirmar que la inyecta el
  mecanismo de subagentes de Ein y no el de Amos.
- **Ruta del coste en el JSONL:** `message.usage.cost.total`, **no**
  `usage.cost.total`. La primera sonda de este análisis dio $0,18 por leer la ruta
  equivocada; la buena da $412,76. Si el port devuelve una cifra absurdamente
  baja, es esto.
- **Sesiones de Ein en `~/.pi-ein/agent/sessions/`**, no en `~/.pi/agent/sessions/`
  como asume la skill de Amos. Y hay un segundo almacén para Claude.
- **Licencias:** `pi-interactive-subagents` es MIT explícito. `pi-config` no
  declara licencia en el repo — para código copiado literalmente conviene pedir
  permiso o reescribir; para las adopciones de este documento (que son
  reescrituras en TypeScript sobre ideas y contratos de datos) no aplica, pero
  **la atribución a la fuente sí**, en el comentario de cabecera del módulo.

---

## // 012. ORDEN DE EJECUCIÓN PROPUESTO

Con la evidencia de coste ya medida, este es el orden — y difiere del que parecía
obvio antes de medir.

| # | Cambio | Carril | TDD | Por qué en este puesto |
|---|---|---|---|---|
| 1 | `fix-guardrails-shell-aware` | standard | **strict** | Es un defecto de seguridad y una promesa falsa en el prompt. Lo único aquí que no es preferencia. |
| 2 | `add-session-accounting` | standard | strict | Desbloquea todo lo demás: sin números, las decisiones de `// 007` y del roadmap son opinión. Y es el prerrequisito de la tanda 5 (evals) de la valoración de agosto. |
| 3 | `add-attic` | micro | off | Barato, estructural, y hace baratos los recortes ya decididos. **Buen primer uso real del carril `micro`.** |
| 4 | `add-prompt-snippets` | standard | strict | Solo después de 2, y **atado** a sacar prosa del orquestador con barrido de prosa portante previo. |

Los cuatro son adopciones de ideas, no copias de código: se implementan en
TypeScript en `ein-pi/agent/`, con test espejo en `tests/`, y con la atribución a
`pi-config` en la cabecera del módulo.

---

## // 013. CÓMO SABER SI EL ROBO FUNCIONÓ

Señales medibles, para revisar dentro de 60 días. Sin esto, adoptar es fe.

| # | Señal | Cómo se mide | Umbral de éxito |
|---|---|---|---|
| 1 | El guardrail dejó de mentir | Los 11 casos de `// 005` en la suite | 11/11 en verde |
| 2 | El gasto se conoce | `ein cost --by project --since 30d` corre | Existe y se usa |
| 3 | El reparto se invierte | % del gasto en proyectos ≠ `ein-agent` | > 40% (hoy: **14,6%**) |
| 4 | El principio económico se cumple | Coste de sesión padre / coste de subagentes | Medible, y el padre por debajo del 50% |
| 5 | La válvula se abre | Cambios con `lane: micro` sobre el total | > 1 de cada 4 (hoy: **0 declarados de 71**) |
| 6 | El prompt encoge | `wc -w ein-pi/agent/assets/orchestrator.md` | < 5.500 (hoy: **6.518**) |
| 7 | Las cosas mueren | Piezas movidas al ático | > 0 (hoy: no existe el sitio) |
| 8 | El archivo deja de pesar más que el motor | `archive` / `ein-pi/agent` en líneas | < 1,0 (hoy: **1,82**) |

La 3 y la 5 son las que de verdad importan. Las dos miden lo mismo desde ángulos
distintos: **si Ein ha dejado de ser un proyecto que se construye para ser una
herramienta que se usa.**

---

## // 014. LA FRASE QUE RESUME EL DOCUMENTO

Amos no ha construido un sistema más simple. Ha construido uno donde **cada pieza
puede estar apagada, y cualquiera puede morir sin ceremonia**.

Ein tiene mejor motor, mejores garantías y mejores tests. Le falta el interruptor
y le falta el cementerio. Las cuatro adopciones de este documento son eso, y nada
más que eso.
