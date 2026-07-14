# Mapa — semántica Git veraz en el banner

status: partial
scope_status: partial_budget_exceeded
change: banner-git-semantics
phase: map
skill_resolution: paths-injected
budget_source: scope.md
budget:
  max_tokens: 15000
  max_reads: 30
budget_exceeded: true

> El mapa cubre la laguna señalada por el roadmap: el cálculo, lifecycle y fila `GIT` reales están todos en el banner y no tienen cobertura. Se detuvo la exploración al superar el presupuesto de tokens; no se ejecutaron tests, builds, red ni Git, y no se modificó código/documentación.

## Ledger

ledger:
  reads:
    - { path: "/home/samuhlo/.pi/agent/skills/local/ein-discipline/SKILL.md", lines: 101, estimated_tokens: 1500 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/architecture/SKILL.md", lines: 124, estimated_tokens: 1900 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/cognitive-doc-design/SKILL.md", lines: 46, estimated_tokens: 650 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/work-unit-commits/SKILL.md", lines: 82, estimated_tokens: 1100 }
    - { path: "openspec/changes/banner-git-semantics/scope.md", lines: 129, estimated_tokens: 3300 }
    - { path: "EIN.md", lines: 43, estimated_tokens: 500 }
    - { path: "codegraph explore: Git banner semantics", lines: 190, estimated_tokens: 2800 }
    - { path: "tests/** grep banner/GIT", lines: 100, estimated_tokens: 2100 }
    - { path: "ein-pi/** grep banner/GIT", lines: 18, estimated_tokens: 350 }
    - { path: "**/package.json grep test", lines: 0, estimated_tokens: 0 }
    - { path: "ein-banner.ts grep i18n", lines: 0, estimated_tokens: 0 }
    - { path: "openspec/changes/banner-git-semantics/** grep", lines: 129, estimated_tokens: 3300 }
    - { path: "codegraph explore: banner lifecycle/GIT row", lines: 205, estimated_tokens: 3000 }
    - { path: "ein-pi/agent/extensions/ein-banner.ts", lines: 619, estimated_tokens: 7200 }
    - { path: "ein-pi/agent/lib/lang.ts", lines: 266, estimated_tokens: 3100 }
    - { path: "tests/git-baseline.test.ts", lines: 153, estimated_tokens: 1800 }
    - { path: "**/package.json grep scripts", lines: 1, estimated_tokens: 30 }
    - { path: "repository grep ein-banner", lines: 100, estimated_tokens: 5200 }
    - { path: "ein-pi/agent/lib/*.ts grep process/Git", lines: 100, estimated_tokens: 3400 }
    - { path: "tests/**/*.test.ts grep render/width/fakes", lines: 100, estimated_tokens: 1900 }
    - { path: "docs/.github grep bun test", lines: 3, estimated_tokens: 100 }
    - { path: "repository grep bun test", lines: 100, estimated_tokens: 5600 }
    - { path: "ein-pi/agent/extensions/*.ts grep doctor/status", lines: 0, estimated_tokens: 0 }
    - { path: "ein-pi/agent/extensions/ein-doctor.ts", lines: 429, estimated_tokens: 5100 }
    - { path: "ein-pi/agent/lib/project-context.ts:360-414", lines: 55, estimated_tokens: 600 }
    - { path: "installer/package.json", lines: 24, estimated_tokens: 250 }
    - { path: "tests/**/*.test.ts grep bun:test", lines: 55, estimated_tokens: 700 }
  webfetch_used: false
  budget_consumed: { tokens: 51130, reads: 27 }

## Mapa de código y call edges

| Archivo y rango | Símbolo / responsabilidad actual | Call edges y radio de impacto |
|---|---|---|
| `ein-pi/agent/extensions/ein-banner.ts:9-27` | Imports `exec` + `promisify`; `execAsync = promisify(exec)`. | Única ejecución de proceso del banner. Cambiar este borde afecta el arranque del header, no doctor/preflight. |
| `ein-pi/agent/extensions/ein-banner.ts:32-64` | `computeGitSync(cwd): Promise<string>`. Construye y devuelve directamente el texto de UI, mezclando estado local/remoto. | Un único caller interno; Codegraph no encontró tests que lo cubran. Es el seam principal a separar en proceso → parser/modelo → render. |
| `ein-pi/agent/extensions/ein-banner.ts:33-37` | Closures `run(cmd, timeout)` y `ok(cmd)`. Ejecutan shell con `git -C "${cwd}" …`; `run` devuelve `stdout.trim()`, `ok` colapsa cualquier error a `false`. | No exportadas ni inyectables; los resultados/error/timeout no preservan una causa tipada. |
| `ein-pi/agent/extensions/ein-banner.ts:39-60` | Protocolo Git actual: rama, porcelain, `ls-remote`, `HEAD`, `cat-file`, `merge-base`, `rev-list`. | Todo pasa por `computeGitSync`; no hay helper compartido de relación con upstream. |
| `ein-pi/agent/extensions/ein-banner.ts:~325-342` | `setTimeout(..., 100)`: ejecuta por separado `branch --show-current` para `gitBranch`, e invoca `computeGitSync(ctx.cwd)` para `gitSync`. | `session_start` → timers diferidos → variables capturadas por `render`. Ninguna promesa solicita un repaint al resolver. |
| `ein-pi/agent/extensions/ein-banner.ts:~347-415` | Estado de animación, `cleanup`, `setHeader`, intervalo de 30 ms y `tui.requestRender()`. | Los re-renders sólo existen mientras dura la animación (hasta `FINISH_TICK` o 3 s); resize también puede pedir uno. |
| `ein-pi/agent/extensions/ein-banner.ts:~421-618` | Callback `render(width)`: construye `LayoutBuilder`, serializa ANSI y finalmente llama `truncateToWidth`. | Es render puro respecto de Git: sólo lee `gitBranch`/`gitSync`; no ejecuta proceso ni red. |
| `ein-pi/agent/extensions/ein-banner.ts:547-555` | Fila `GIT`: `gitVal = gitSync ? \`${gitBranch} · ${gitSync}\` : gitBranch`; etiqueta `GIT`; value limitado por `fit(..., GRID_W - 2 - L)`. | Única construcción de fila Git. `GIT` no aparece en el modo minimal. |
| `ein-pi/agent/extensions/ein-banner.ts:594-612` | Serialización de celdas y `truncateToWidth(line, Math.max(1, width), "")`. | Truncación final de toda fila, después de colores/centrado. |
| `ein-pi/agent/lib/lang.ts:29-33, 99-118` | `Lang`, `ACTIVE_LANGS`, `readChatLang`, `pick(es,en)`. | Es la localización de UI reutilizable. El banner hoy sólo importa `LANG_LABEL`, no `pick`; sus textos Git no están localizados. |
| `ein-pi/agent/lib/i18n/strings.ts` | Catálogo `t`/`tf` es/en usado por extensiones como doctor. | Fuente alternativa de copy; no es importada por el banner. No elegir catálogo ni claves hasta diseño. |
| `ein-pi/agent/lib/git-baseline.ts:42-52, 74-85` | `git(cwd,args)` síncrono y `readGitBaseline`: repo, dirty booleano, reflog y stashes para preflight. | Sólo `readGitBaseline` lo llama (Codegraph); no cubre upstream, categorías porcelain ni banner. Mantener separado: finalidad preventiva antes de mutar y API sync distintas. Sus parsers puros son precedente, no una reutilización directa. |
| `ein-pi/agent/lib/git-baseline.ts:58-72, 93-110` | `parseRecentReset` y `renderGitBaselineLine`, ambos puros/exportados. | `tests/git-baseline.test.ts` demuestra el patrón de parser puro + proceso aislado; no hay semántica de relación de rama que reutilizar. |
| `ein-pi/agent/lib/project-context.ts:373-406` | `gitShortSha` y `einMdCommitsBehind`: `execFileSync`, `rev-parse`, y un `rev-list <EIN.md rev>..HEAD`. | El conteo es frescura de `EIN.md`, unidireccional y no upstream; no reutilizar para el banner. |
| `ein-pi/agent/extensions/ein-doctor.ts:1-429` | `doctorReport`, `doctorSmokeReport`, herramientas/comandos doctor. | Comprueba CLIs/configuración/archivos; no calcula estado de repo, upstream, porcelain o refs. Debe quedar fuera. |
| `tests/git-baseline.test.ts:1-153` | Tests Bun del helper Git de preflight. | Tiene parsers puros y además crea un repo temporal real para el baseline; no pincha texto del banner ni ofrece un fake de proceso reusable. |

### Call path operativo exacto

`default einBanner(pi)` → `pi.on("session_start", async …)` → `setTimeout(100 ms)` →
1. `execAsync(git branch --show-current)` → asigna `gitBranch` (`"detached"` si stdout vacío); y en paralelo
2. `computeGitSync(ctx.cwd)` → `run/ok` → asigna `gitSync`.

Después: `ctx.ui.setHeader` → intervalo de animación → `tui.requestRender()` → `render(width)` → fila `GIT` → serialización ANSI → `truncateToWidth`.

El `setTimeout(50 ms)` que instala el header no espera el probe de Git. El `Promise` del probe tampoco llama `requestRender`; por tanto sólo se ve un resultado si resuelve antes de un render posterior disponible (normalmente ticks de animación/resize). Las variables son una caché efímera por sesión, no una caché de Git ni una suscripción de refresco.

## Estado actual: hechos y colapsos

| Entrada/condición actual | Salida literal actual | Semántica real / problema |
|---|---|---|
| `branch --show-current` rechaza, o outer `try` falla | `""` | No repo y varios errores se silencian. |
| stdout de rama vacío | `""` desde `computeGitSync` | Detached queda oculto en sync; el probe paralelo puede mostrar `gitBranch = "detached"`, pero no hay estado explícito/garantizado. |
| `status --porcelain` falla | `dirty = 0` | Error se presenta igual que limpio. |
| porcelain vacío | sin `dirtyTag` | No nombra `local clean`. |
| porcelain no vacío | ` · ○N` | `N` es número de líneas/entradas porcelain, no commits ni número garantizado de archivos únicos. |
| `ls-remote origin <branch>` rechaza/timeout | `sync?${dirtyTag}` y comentario `offline` | Un error arbitrario (Git, auth, DNS, timeout, remoto) se convierte en una insinuación de sincronía/desconexión; no prueba offline. |
| `ls-remote` sin stdout | `local${dirtyTag}` | Equivale a “no publicada en `origin/<mismo nombre>`”, no a “sin upstream configurado”. |
| SHA remoto igual a `HEAD` | `✓ sync${dirtyTag}` | Sólo compara el anuncio de red de `origin <branch>` con HEAD; no expresa la relación con el tracking ref configurado. |
| SHA remoto existe localmente y es ancestro de `HEAD` | `↑N sin pushear${dirtyTag}` | Ahead-only; `N` sale de `rev-list --count <remoteSHA>..HEAD`. |
| Cualquier otro remoto no igual | `⚠ pull (remoto adelante)${dirtyTag}` | **Aquí se colapsan behind y diverged**. También caen SHA remoto no presente localmente y otros fallos lógicos; no se calcula behind. |

### Unidad exacta de `○N`

`N = porcelain.split("\n").length` en `ein-banner.ts:41-43`: entradas de `git status --porcelain` separadas por salto de línea. No es un conteo de commits ni una promesa de archivos únicos. El código no inspecciona las columnas XY: una entrada con cambio en índice y worktree (por ejemplo `MM`) cuenta una vez en `○N`, aunque una UI por categorías debe contarla una vez en staged y una vez en unstaged. Los renames/copies de porcelain v1 pueden incluir una línea de path adicional dependiendo de la forma usada; contar líneas además no es un parser robusto de entrada/archivo. El diseño debe tratar las categorías como conteos independientes y no sumarlas como “N archivos”.

## Relación upstream local, staleness y offline

- El requisito se puede satisfacer sin `fetch` ni `ls-remote`: una rama con tracking ref local permite derivar ahead/behind por ancestry/rangos contra su upstream configurado (p. ej. `@{upstream}` o la ref que resuelva). Los conteos describen **la copia local conocida** del tracking ref.
- Sin fetch, esa ref puede estar stale. Copy debe decir “upstream/tracking” o equivalente localizable, nunca prometer que se contactó el servidor ni que está actualizado en red.
- El actual `ls-remote` sí es una operación de red y contradice el nuevo borde “metadatos locales sólo”. Debe salir del camino de render/probe de esta feature, no sustituirse por fetch.
- “Offline” no puede inferirse de un error genérico de proceso. Con sólo refs locales no hay evidencia para afirmar conectividad; el estado seguro es unavailable/unknown cuando no se puede leer Git o la ref. Si diseño conserva una prueba de conectividad separada, debe conservar evidencia tipada antes de mostrar offline; no hay tal evidencia ni tipo hoy.

## Render, anchura y localización

- El modo full exige al menos 80 columnas y 27 filas (`pickIntroMode`). Sólo allí existe la fila Git; modo minimal/skip la elimina. Al encoger bajo el umbral, el resize debounce cambia a minimal, no degrada semánticamente esa fila.
- En full: `L = 8`, `V = 13`, `COLS = 3`, `GRID_W = 69`; el valor Git recibe como máximo `GRID_W - 2 - L = 59` caracteres vía `fit`, que normaliza espacios y hace `.slice(0,w)`. La truncación final `truncateToWidth` es posterior. No hay presupuesto por concepto local/upstream, prioridad de etiquetas, ni prueba de ancho estrecho.
- La seam concreta es la proyección de un modelo Git a la cadena `gitVal` antes de la fila 547-555; el layout existente puede conservar colores/branding mientras esa proyección aplica degradación progresiva: quitar detalle antes de etiquetas, y nunca transformar behind/diverged en synced/ahead.
- `LANG_LABEL` prueba que la UI conoce el idioma de chat; `pick(es,en)` y `t`/`tf` son las fuentes existentes para copy bilingüe. El Git copy actual está hardcodeado y mezcla `sync`, `local`, `pull` con `sin pushear`; no hay fixture/test de paridad ni de strings de banner. `gl` cae actualmente a español en `pick`; diseño debe respetar esa convención o el catálogo elegido, sin decidir aún claves/copy final.

## Seams de prueba focalizados

**Ausencias confirmadas:** Codegraph no encontró test de `computeGitSync`; el grep de `tests/` no encontró `ein-banner`, `○`, `sync?`, `sin pushear` ni `remoto adelante`. No existe fixture Git del banner.

**Seams a diseñar, no implementar todavía:**

1. Extraer el parser puro de porcelain y el clasificador de relación upstream a un módulo pequeño (nombre/ubicación a decidir), con entradas de stdout/exit explícitas y un modelo separado `{ local, upstream }`.
2. Inyectar una capacidad de proceso asíncrona (argumentos, cwd, timeout y resultado/error tipado) en el probe, en vez de capturar `execAsync`/shell. Fake por tabla de comandos evita repo, remoto, red y mutación reales.
3. Aislar la proyección localizada/por ancho del modelo para poder probar full, degradación progresiva y nunca-colapso de behind/diverged sin montar Pi/TUI.
4. Exponer o encapsular un controlador mínimo del ciclo async: estado loading inicial, completion/error, y callback de refresh. Test con deferred Promise controla que render no espera y que completion solicita exactamente el repaint permitido.

**Conjunto propuesto (sujeto a design):** modificar `ein-pi/agent/extensions/ein-banner.ts`; añadir un módulo de dominio Git del banner sólo si la extracción es necesaria para los seams anteriores; añadir `tests/banner-git-semantics.test.ts`; quizá ampliar `tests/i18n-parity.test.ts` únicamente si el catálogo compartido recibe claves. No tocar `installer/**`, README, doctor ni `git-baseline` salvo que diseño descubra una abstracción realmente compartida (no está justificada por el mapa).

**Comandos existentes, no ejecutados:** CI y documentación usan `bun test` desde la raíz; los tests importan `bun:test`. El comando focal previsto es `bun test tests/banner-git-semantics.test.ts`; el gate de regresión existente es `bun test`. `installer/package.json` sólo declara `dev`, `bundle-template`, `build:all` y `typecheck`, y está fuera de alcance.

## Preguntas confirmadas vs. abiertas

### Confirmado

- La relación vigente no usa el upstream configurado: asume `origin` y el mismo nombre de rama, y consulta red con `ls-remote`.
- Behind y diverged están colapsados exactamente en la devolución de la línea 60.
- Local porcelain y relación de commits se mezclan en un único `string` y `○N` no tiene unidad explicada.
- Render no bloquea sobre Git, pero no expresa loading y no refresca explícitamente al completar el probe.
- No existe cobertura de banner ni seam inyectable de proceso; los helpers Git existentes sirven a otros dominios.
- La fila desaparece, no se degrada, fuera de full; la localización Git no está conectada al mecanismo bilingüe existente.

### Abierto para `sdd-design` (no decidir en map)

- Forma/nombres exactos del modelo discriminado y de las capacidades inyectables.
- Copy, símbolos, colores, puntuación y claves finales en es/en.
- Política precisa de qué detalle se elimina en cada presupuesto de ancho y si minimal debe contener una versión semántica de Git.
- Distinción de `unavailable` vs `unknown`, y qué evidencia concreta —si alguna— habilitaría `offline` después de retirar red del probe.
- Formato porcelain a soportar (v1/v2 y manejo exacto de rename/copy) y el contrato de categoría para cada código XY.
- Momento/canal exacto del repaint tras resolve si la animación ya terminó, preservando que render no espere ni haga I/O.

## Forecast y handoff

- **Producción:** riesgo medio; una extracción mínima más banner/localización probablemente cabe bajo el objetivo de 400 líneas, pero no hay estimación fiable sin la decisión de responsive/minimal y catálogo. Mantener un único PR si el diff de producción sigue <400; tests aparte del presupuesto.
- **Tests:** matriz de al menos clean, staged, unstaged, untracked, mixed/overlap, synced, ahead, behind, diverged, no-upstream, detached, loading y unavailable/error; más widths y locales. Es probable que las líneas de test sean mayores que producción y deben reportarse separadas.
- **Riesgo de review:** no añadir una abstracción Git global; conservar el cambio como un work unit banner + tests. Revisar primero modelo/unidades, luego async/error, después responsive/i18n.
- **Límite hacia `readme-release-ia`:** este cambio entrega únicamente el estado/copy aceptado y evidencia de verify (tabla final, locales, anchuras, matriz fake y comandos). `readme-release-ia` permanece bloqueado hasta `verify-report.md` de este change; no editará README ni se iniciará documentación desde esta fase. El handoff debe citar esa evidencia, no la intención de scope ni una afirmación de live remote freshness.

## Siguiente fase

`sdd-design`: convertir este mapa en el contrato de modelo, estrategia de proceso local, lifecycle de refresh, degradación por ancho y matriz determinista, sin fijar aún copy/símbolos fuera de la decisión de diseño.
