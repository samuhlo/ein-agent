# Changelog

Todos los cambios relevantes de Ein. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el versionado es
[SemVer](https://semver.org/lang/es/). Las releases se publican como tags
`installer-v*` (binarios del instalador vía GitHub Actions).

## [0.15.1] - 2026-07-08

### Added

- **Baseline de git en el preflight SDD** (`lib/git-baseline.ts`). Al arrancar
  un flujo SDD, Ein hace un snapshot determinista del árbol (`reflog`, `status`,
  `stash list`) e inyecta un WARNING en el bloque de preflight si detecta un
  `reset` reciente o stashes — señal de trabajo posiblemente huérfano. Obliga a
  reconciliar HEAD con el usuario **antes** de la primera mutación. Cubre el
  fallo donde el flujo refactorizaba sobre un árbol revertido y `verify` firmaba
  PASS sobre trabajo perdido.

### Changed

- **Cortafuegos anti-inline en el orquestador.** Si se agotan los subagentes
  ("spawn limit reached"), el parent PARA en vez de ejecutar todo inline —
  evita invertir el modelo de coste, saltarse la re-ejecución de acceptance y
  convertir el gate en autocertificación.
- **`ein_sdd_check` rechaza telemetría fabricada.** Valores tipo `tokens:
  unknown` o un `ledger` con excusas (`parent-direct`, `subagent limit
  reached`) son ahora error duro. La ausencia de telemetría de run se relaja a
  warning **solo** con `authored_by: parent-fallback` — salida honesta que no
  obliga a inventar cifras para pasar el gate.

## [0.15.0] - 2026-07-02

### Added

- **Backups v2 del instalador.** Snapshots comprimidos (`.tar.gz`) con sidecar
  de metadatos, dedup por hash de contenido (si el árbol no cambió, no se crea
  otro backup), poda automática conservando los 5 más recientes y pins
  (`ein restore --pin/--unpin <nombre>`) que la poda respeta. Los backups
  legacy (directorio) siguen listándose y restaurándose. Los backups ya **no
  incluyen `auth.json`** (ni `bin/` ni `disabled-skill-conflicts/`): restaurar
  un backup antiguo nunca pisa credenciales actuales — antes sí podía.
- **Rollback automático.** `ein install` (sobre un árbol existente) y
  `ein update` snapshotean antes del deploy y, si la extracción falla a
  medias (el deploy limpia los dirs del template antes de extraer), restauran
  solos el estado anterior.
- **`--dry-run`** en `ein install` y `ein update`: muestra el plan completo
  (deps a instalar, backup, contenido del template, pasos restantes) sin
  ejecutar nada.
- **`template-manifest.json`** generado por el bundler dentro del tarball:
  describe exactamente qué agentes/chains/extensiones lleva el bundle. Lo
  consumen `ein doctor` (valida lo desplegado contra lo distribuido, sin
  listas cableadas) y `--dry-run` (lo lee del binario sin desplegar).
- **E2E real en Docker** (`e2e/docker-test.sh` + workflow manual `e2e`):
  instala Ein en un Ubuntu limpio (bun + pi desde la red), verifica doctor,
  reinstalación con backup y dry-runs.

### Changed

- **Reorganización del repo: `ein-pi/core/` (portable) vs `ein-pi/agent/`
  (runtime Pi).** `agents/`, `skills/`, `prompts/`, `docs/` y `AGENTS.md` viven
  ahora en `core/`; `extensions/`, `lib/`, `chains/`, `assets/` y los JSON de
  runtime siguen en `agent/`. El bundler compone ambas raíces y el layout
  desplegado en `~/.pi/agent` no cambia (Pi lo espera plano). `assets/` se
  queda en runtime porque `lib/persona.ts` y `lib/sdd-preflight.ts` lo leen
  relativo al módulo; migrará a `core/` cuando esa lógica se extraiga al CLI.
  Preparación para adapters no-Pi (OpenCode) sin tocar comportamiento.

## [0.14.6] - 2026-07-02

### Added

- **Tema pi `ein`** (`themes/ein.json`): la paleta brutalista del banner
  aplicada a toda la TUI — Concrete `#FAF3F0` como texto, Structure `#737373`
  para lo secundario, Industrial Yellow `#FFCA40` como único acento y fondos
  derivados de Carbon `#0C0011`. El indicador de thinking escala del gris al
  amarillo industrial según el esfuerzo. `settings.json` del template arranca
  con `theme: ein`; el bundle incluye `themes/` pero el deploy NO lo gestiona
  como dir manejado (criterio `skills/`: un `ein update` no destruye temas
  personales).
- **Coste real por cambio en `ein_sdd_status`.** Nuevo `readSddRealCost()` en
  `sdd-router.ts`: suma el consumo REAL de inferencia desde los `meta.json`
  de `.pi-subagents/artifacts/` (atribución determinista por mención del
  cambio en el task del run) y el status muestra `coste real: N runs · in/out
  · $ · min` con desglose por agente, junto al budget del ledger (tokens
  estimados de lectura — otra magnitud). Un cambio real que el status
  reportaba como `consumed≈9000` costó 910k tokens y $3.71.
- **Procedencia de artefactos SDD.** Si el parent persiste un artefacto por
  fallback debe marcarlo con `authored_by: parent-fallback`; `lintChange`
  emite `WARNING provenance-parent-fallback-<fase>` para que verify/review
  sepan que no lo escribió el executor de fase. Prohibido fabricar números de
  ledger que el hijo no reportó.

### Changed

- **El acceptance de `sdd-apply` pasa de atestación a verificación mecánica.**
  Los applies behavioral se delegan con `acceptance: { level: "verified",
  verify: [...] }` usando los comandos reales de `openspec/config.yaml`
  (`testing.runner`/`testing.typecheck`): el runner de `pi-subagents`
  re-ejecuta los comandos al terminar el hijo y rechaza el run si fallan — un
  modelo barato ya no puede afirmar tests verdes que nunca corrió. Los applies
  mecánicos (taxonomía `tdd: "off"`) llevan `level: "none"` con reason porque
  `verified`/`checked` exigen estructuralmente evidencia `tests-added` que un
  apply honesto sin tests no puede producir. `sdd-apply.md` gana la sección
  "Runtime Acceptance Verification": prohibido amañar la verificación —
  `blocked` honesto antes que verde mentiroso.

## [0.14.5] - 2026-07-02

### Fixed

- **`sdd-map` ya no puede interbloquearse pidiendo permiso para escribir su
  artefacto.** Su contrato era autocontradictorio: una línea ordenaba
  "Write map notes to `map.md`" y otra decía que la chain lo captura — con
  tools `read, grep, glob` (sin write). En un run real el agente escaló al
  supervisor vía intercom, la reply nunca le llegó (los hijos no interactivos
  no reciben replies mid-run) y el padre acabó escribiendo `map.md` a mano.
  Nuevo **Artifact Persistence Contract** en `sdd-map.md`: el RUNNER persiste
  el artefacto (step de chain con `outputMode: file-only`, o `output` +
  `outputMode` pasados por el padre en modo fase a fase) y el agente emite
  SIEMPRE su output final como el contenido completo listo-para-persistir;
  la falta de write tool es intencional, no un bloqueo.
- **Falsos `acceptance: rejected` en fases de planificación.** `pi-subagents`
  infiere el nivel de acceptance del texto de la task y exige un
  `acceptance-report` con evidencias con forma de código (changed-files,
  tests-added, commands-run) que un artefacto de planificación no puede
  satisfacer — scope/design/tasks salían `rejected` con artefactos perfectos.
  Nueva regla en `orchestrator.md`: fases de planificación (`scope`, `map`,
  `design`, `tasks`, `close`) se delegan con `acceptance: { level: "none",
  reason: ... }` porque `ein_sdd_check` es el gate determinista real;
  `apply`/`verify` mantienen auto (ahí un `rejected` es señal); y el loop SDD
  NUNCA se rutea por el veredicto de acceptance, siempre por
  `ein_sdd_status` + `ein_sdd_check`.

### Changed

- **Fail-fast en los 7 agentes de fase SDD.** Todos los `sdd-*.md` prohíben
  bloquearse en asks de supervisor/intercom (un hijo no interactivo no puede
  recibir la reply): ante un bloqueo devuelven inmediatamente
  `status: blocked` con la causa concreta y qué debe arreglar el padre.
- **`orchestrator.md`: asks de intercom bajo sospecha.** El runtime puede
  entregar un ask minutos después de que su run terminara. Antes de actuar
  sobre CUALQUIER ask: `intercom pending` + realidad (`ein_sdd_status` /
  artefacto en disco); si ya está resuelto se ignora — nunca se rehace una
  fase por un ask tardío. Y al delegar `sdd-map` directo, pasar siempre
  `output` + `outputMode: "file-only"`; si aun así falta el artefacto, se
  persiste desde el envelope/`_output.md`, sin re-runs ni bucles de polling.

### Added

- **`tests/sdd-phase-runtime-contract.test.ts`** (17 casos): pinnea el
  contrato de persistencia de `sdd-map`, la regla fail-fast en los 7 agentes
  y las reglas de acceptance del orquestador.

## [0.14.0] - 2026-07-02

### Changed

- **Prompts con un dueño por política (−39% de contexto fijo del padre).**
  `AGENTS.md` queda reducido a las reglas que comparten TODAS las sesiones
  (170 → 44 líneas): la política de coordinación vive solo en
  `assets/orchestrator.md`, los contratos de ejecución en cada `agents/*.md`,
  y lo que ya es determinista en código (gates, guardrails, router) solo se
  referencia, no se re-especifica. Se elimina la contradicción entre los
  "Human Approval Gates" de AGENTS.md y el gate determinista de entrega en
  modo `auto` (causa raíz del doble-ask), y el contrato docente de 7 puntos
  obligatorios pasa a ser proporcional al peso del cambio (criterio único:
  "synthesis weight matches change weight" del orquestador).
- **`orchestrator.md` comprimido** (~4300 → ~3100 palabras) conservando todas
  las reglas y frases de contrato testeadas; menos anécdota, misma normativa.

### Added

- **Raíz de cambios SDD dual.** `resolveChangesDir()` en `sdd-router.ts`:
  `openspec/changes/` sigue siendo canónica; si no existe pero hay
  `.sdd/changes/` (gramática previa / herramienta externa), el router, el
  gatekeeper (`lintChange`), el cierre (`closeChange`) y la extensión la usan.
  Alias de artefactos legacy: `explore.md` cuenta como scope+map y `apply.md`
  como design, de modo que `ein_sdd_status`/`ein_sdd_check`/`/ein:sdd-close`
  funcionan sobre trabajo existente sin migrar ficheros.

### Fixed

- **Guardrails: negación de entrega POR VERBO/CLÁUSULA, no por texto.**
  Antes cualquier negación ("…pero no hagas merge") cancelaba TODO el texto y
  el push/PR legítimo quedaba sin grant → bloqueo headless y retry-loop.
  Ahora solo se descarta el verbo negado (negador a ≤16 chars, sin cruzar
  comas): "abre PR pero no hagas merge" emite el grant del PR. En el mensaje
  del usuario (`messageRequestsDelivery`) la negación sigue vetando la
  autorización automática (conservador), pero acotada por cláusula: "no rompas
  nada, haz push" ya autoriza.
- **Guardrails: `push` a secas ya no emite grant.** "implementa push
  notifications" abría una ventana de 10 min en la que cualquier `git push`
  headless pasaba sin confirmación. Ahora la task debe nombrar la entrega con
  contexto (`git push`, `haz push`, `push the branch`, `push to origin`,
  `pushea`, orden completa "push") — mismo criterio que documenta el
  orquestador para re-delegar.

## [0.13.5] - 2026-07-01

### Fixed

- **Delegación/PR: detección `open-PR` y `delegated`.** Los patrones de entrega en
  `guardrails.ts` y `git-delivery.ts` ahora reconocen `open-PR` (alias de `open_pr`)
  y `delegated` como modos de entrega válidos. `taskRequestsGuardedDelivery()` y
  `requestsCommitLikeAction()` devuelven `false` cuando el intent es explícitamente
  `delegated` u `open-PR`.

- **Seguridad: negación primero en `taskRequestsGuardedDelivery()`.** Verificación
  de patrones de negación (`no push`, `sin commit`, `do not tag`) *antes* de evaluar
  patrones positivos, evitando falsos positivos en frases como "haz commit pero sin push".

- **Loop `ask_user_question` en delivery: cortado.** La recursión infinita entre
  `ask_user_question` y delivery se corta en raíz — si la task头来 pide entrega
  pero no puede auto-delegarse, se responde con el tool result directamente sin
  volver a preguntar.

- **Tests de guardrails actualizados.** Casos para `delegated`, `open-PR` y
  negaciones añadidos; antiguos casos de negación corregidos.

## [0.13.3] - 2026-06-30

### Changed

- **`ein-readme` migrate a skill local.** El agente de generación de README pasa de
  `agents/ein-readme.md` (subagent visible) a `skills/local/readme-style/SKILL.md`
  (skill local). Ya no aparece en el inventario de subagentes del orquestador ni
  en la documentación arquitectónica. Se invoca implícitamente cuando el contexto
  lo requiere; no necesita `subagent({ agent: "ein-readme" })`.

- **Nota de estilo: `Vandal Note` → `_note:`.** La marca estética en los README
  generados cambia de `> _Vandal Note:` a `> _note:` — una convención de estilo
  neutral que no funciona como título de autor ni marca personal.

### Fixed

- **Negación en `taskRequestsGuardedDelivery()` (`guardrails.ts`).** La función
  que detecta si una task de delegación pide push/commit no manejaba negaciones:
  frases como "haz commit pero sin push", "sin push", "do not push" devolvían
  `true` cuando debían devolver `false`. Añadido `DELIVERY_NEGATION_PATTERNS`
  (copiado de `git-delivery.ts`) con verificación previa a los patrones positivos.

- **Ruta del template en `installer/README.md`.** El comment de `bundle-template`
  decía `../.pi/agent` y ahora dice `../ein-pi/agent` (ruta real del repo).

- **Ejemplo de release hardcoded en `README.md`.** El tag de ejemplo cambiaba de
  `installer-v0.13.0` a `installer-v0.13.3`.

## [0.13.2] - 2026-06-29

### Changed

- **Las tools SDD deterministas ya no vuelcan JSON crudo en la conversación.**
  `ein_sdd_status` y `ein_sdd_check` ahora devuelven el mismo texto compacto y
  legible que los comandos `/ein:sdd-status` y `/ein:sdd-audit` (`formatSddStatus`
  / `formatChangeLint`), en vez de un muro de `JSON.stringify(..., null, 2)` con
  el array `tasks.items[]` entero. El report/estado crudo viaja ahora en
  `details` para uso programático. El orquestador sigue enrutando por la línea
  `next:`.

### Fixed

- **Falsos positivos del aviso "subagent needs attention".** Nuevo
  `extensions/subagent/config.json` que sube `control.needsAttentionAfterMs` de
  60s a 240s, alineado con el umbral de "active long-running" de `pi-subagents`.
  Los modelos baratos (MiniMax) dejan de disparar el nudge durante applies
  multi-fichero largos, sin perder la detección de cuelgues reales.
- **`subagent list` repetido y ruidoso.** `orchestrator.md` declara ahora la
  tabla "Subagent Inventory" como fuente autoritativa y prohíbe explícitamente
  llamar a `subagent({ action: "list" })`.

## [0.13.1] - 2026-06-29

### Added

- **Skill propia `slidev`**. Construir, editar y exportar presentaciones de
  desarrollador con Slidev (Markdown + Vue): `SKILL.md` + `references/` (syntax,
  cli, layouts, components, animations, code, themes-config, export-deploy,
  presenter). Vive en `skills/local/` y se sincroniza desde `samuhlo/ein-agent`
  como el resto de propias; registrada en `skills-lock.json`.

## [0.13.0] - 2026-06-29

> **Major SDD Workflow Release.** Esta release renombra y consolida las fases
> y agentes SDD definitivas. Es un cambio SemVer minor en código, pero una
> **gran release funcional** para el workflow: las fases, artefactos y comandos
> principales adoptan nombres canónicos.

### Added

- **Fases SDD definitivas** (`scope → map → design → tasks → apply → verify → close`):
  agentes `sdd-scope`, `sdd-map`, `sdd-design`, `sdd-tasks`, `sdd-apply`,
  `sdd-verify`, `sdd-close`; artefactos `scope.md`, `map.md`, `design.md`,
  `tasks.md`, `apply-progress.md`, `verify-report.md`, `summary.md`; helper
  de cierre `sdd-close.ts`. Todo queda bajo el namespace `/ein:sdd-*`.

- **SDD mantiene el namespace OpenSpec** en `openspec/changes/<change>/`; los
  nombres de las fases son definitivos y no se renombrarán.

- **`/ein:sdd-close` como comando canonical** (antes `/ein:sdd-archive`).
  `/ein:sdd-archive` se elimina como alias visible. El routing determinista
  actualiza sus checks para reflejar `close`/`summary` en vez de `archive`/
  `close-report`.

- **Status enriquecido** (`/ein:sdd-status`) con fase actual, siguiente paso,
  artefactos, tareas, blockers y budget. **`/ein:sdd-audit`** queda como
  validación completa de un cambio y `/ein:sdd-check` permanece solo como alias
  legacy de audit.

- **Split `design` / `tasks` formalizado**: `sdd-design` produce el spec
  (`design.md`); `sdd-tasks` lo convierte en checklist ejecutable
  (`tasks.md`). Son fases separadas con gate propio.

### Changed

- Los nombres antiguos `sdd-init`, `sdd-explore` y `sdd-archive` desaparecen
  de la superficie pública del workflow. Solo quedan aliases internos de
  migración para preservar configuraciones de modelos existentes.

- **`/ein:sdd-next`** muestra el siguiente paso recomendado basándose en el
  estado determinista del router. En esta versión `--auto` es dry-run: explica,
  pero no ejecuta fases.

### Migration Note

- **Cambios vivos con `init.md` / `exploration.md`** pueden necesitar
  migración manual a `scope.md` / `map.md`. Las nuevas sesiones SDD usan los
  nombres canonicales desde el primer momento.

### Breaking / Installer Note

> **Nueva release de installer requerida.** El script `install.sh` descarga
> desde `releases/latest`, así que para recibir esta versión es necesario
> publicar el tag `installer-v0.13.0` después de este bump y reinstalar con el
> `curl` de instalación. Un binario viejo ejecutando `ein update` redespliega su
> template embebido viejo; no puede actualizarse a sí mismo hasta que descargues
> la nueva release.

## [0.12.0] - 2026-06-25

### Added

- **Capa de estado SDD determinista** (inspirada en el dispatcher de gentle-ai,
  pero en TS puro expuesto como tools de Pi):
  - **Router** (`lib/sdd-router.ts` + tool `ein_sdd_status` + `/ein:sdd-status`):
    calcula en qué fase va un cambio leyendo SOLO los ficheros de
    `openspec/changes/<x>/` y la línea `status:` de verify-report → `nextRecommended`.
    El orquestador enruta por esto, no por lo que el modelo crea recordar.
    Reanudar entre sesiones es gratis: `ein_sdd_status` reubica el cambio sin
    volcar contexto.
  - **Gatekeeper** (`lib/sdd-guardrails.ts` → `lintPhaseArtifact`/`lintChange` +
    tool `ein_sdd_check`): valida cada artefacto de fase (secciones, señales
    obligatorias como el `status:` de verify, placeholders, tamaño) antes de
    avanzar. Una fase mala se re-ejecuta una vez y, si falla, para — no se
    construye sobre basura.
  - **Fase `archive`** (`agents/sdd-archive.md` + `lib/sdd-archive.ts` +
    `/ein:sdd-archive`): condensa un cambio verificado en un `summary.md`
    revisable y mueve los ficheros de trabajo a `openspec/changes/archive/`, así
    `openspec/changes/` solo contiene cambios vivos.

### Changed

- **Flujo SDD fase a fase** (estilo gentle-ai) en el orquestador: router →
  delegar una fase (`context: "fresh"`, referencias no contenido) → gatekeeper →
  repetir. La chain `ein-sdd` de un tiro queda como fallback (`/run-chain`), no
  como ruta primaria, porque no permite gate intermedio. SDD pasa a 7 fases
  (init → explore → design → tasks → apply → verify → archive).
- Doctor COHERENCIA: checks de router/gatekeeper/archive cableados.

## [0.11.3] - 2026-06-25

### Fixed

- **Documentación pura ya no dispara la pregunta de TDD**. En modo global `ask`,
  un cambio de docs delegado a `sdd-apply` lanzaba el select de TDD si el parent
  no adjuntaba el hint (o si el campo se perdía). Nuevo `delegationIsDocsOnly`:
  detección **determinista** de no-código (señal de docs —`.md`/`README`/
  `CHANGELOG`/"documenta…"— **y** ausencia de señal de código) que se salta el
  gate, independiente del hint. Conservador: ante la duda, pregunta como antes.
- **`sdd-apply` ya no cuelga corriendo un build de producción**. Un
  `bun run build`/`nuxt build` tuberiado por `| tail`/`| head` retiene toda la
  salida hasta el final → el runtime ve "no activity" y lo marca colgado.
  `sdd-apply` tiene prohibido correr un build completo como gate (eso es
  `sdd-verify` o el parent, con env + `timeout`, streaming, nunca por `tail`/
  `head`); el orquestador deja de pedírselo.

### Changed

- **Aviso de TDD solo en `strict`**. `setTaskTddMode` ya no notifica
  `TDD para esta tarea: off` — `off` es un no-evento (mecánico/docs/trivial) y
  anunciarlo era ruido. Solo se avisa cuando TDD queda forzado ON.
- **Higiene de comandos en `sdd-verify`** (donde el build es legítimo): stream
  en vez de buffer, `timeout` siempre, y env del build (`DATABASE_URL`…) o
  reportar que no puede validarse en vez de colgarse.

## [0.11.2] - 2026-06-25

### Fixed

- **`ein-git` ya no se cuelga al abrir el PR**. El cuelgue #1 de delivery: en un
  subagente headless (sin TTY), un `gh pr create` pelado cae en su prompt de
  título / editor de body y **arde hasta el timeout** (minutos de reloj, casi sin
  tool calls). `agents/ein-git.md` manda ahora la receta **no interactiva
  obligatoria**: body a fichero (`mktemp` + heredoc `<<'EOF'`), flags explícitos
  `--title`/`--body-file`/`--base`/`--head`, prefijo `GH_PROMPT_DISABLED=1
  GH_PAGER=cat`, prohibido el `gh pr create` pelado y el `--web`; read-back por
  `gh pr view --json`. Regla: si un `gh` sigue pidiendo input, arregla los flags
  — no esperes ni reintentes el comando idéntico.

### Changed

- **Precheck de scope `workflow`** en `ein-git`: antes de pushear algo que toca
  `.github/workflows/**`, comprueba `gh auth status`; si falta el scope, STOP +
  `gh auth refresh --scopes workflow` (falla rápido, no lento).
- **`maxRuntimeMs` tirante para delivery**: el orquestador pasa ahora ≈`120000` a
  `ein-git`, nunca el presupuesto de chain (`1800000`) — un cuelgue aborta en
  ~2 min, no en 10.

## [0.11.1] - 2026-06-25

### Changed

- **Review Workload Guard: presupuesto solo-producción**. El gate de tamaño de
  PR mide ahora las líneas de **producción** (`git diff --shortstat` con pathspec
  de exclusión), no el diff entero. Tests y generados (`*.test.*`, `*.spec.*`,
  `**/tests/**`, `*.snap`, `*-lock.*`, `dist/`, `.output/`, `.nuxt/`, `coverage/`,
  `*.min.*`) se **reportan aparte** pero **no cuentan** contra el presupuesto: el
  review gatea sobre lógica, no sobre volumen de test/fixture. Un refactor con
  TDD estricto deja de dispararse por las líneas de los tests que añade. Regla
  reforzada: nunca separar el código de una slice de sus tests en PRs distintos.
  Sincronizado en los tres puntos (parent forecast, preflight, gate de `ein-git`)
  con un test anti-drift.
- **Hand-off cerrado a `sdd-apply`**. Si el parent ya diagnosticó la edición
  exacta, entrega un *patch cerrado* (archivo + `before → after` + tests) y el
  apply no re-escanea el árbol para re-derivar lo que ya recibió (menos tokens
  del modelo barato en fixes triviales).

### Fixed

- **El apply ad-hoc ya no ensucia el repo**. Un `sdd-apply` fuera del chain SDD
  devuelve su report **inline** en vez de escribir un `*.md` de scratch en la
  raíz del proyecto (que luego obligaba a un segundo apply solo para borrarlo).
  Los artefactos in-repo (`openspec/changes/<change>/…`) quedan reservados para
  chains reales. `agents/sdd-apply.md`: "Apply Progress" pasa a chain-only.

## [0.11.0] - 2026-06-25

### Added

- **Modo de entrega git (`/ein:git`, `auto`/`ask`/`off`)**: controla la
  confirmación antes de un push/PR delegado, persistido en `.pi/ein/git.json`.
  En `auto` (default), si tu mensaje pidió la entrega (commit/push/PR) no se
  vuelve a preguntar — ya la autorizaste; la entrega por iniciativa del agente sí
  confirma. `ask` confirma siempre; `off` nunca. El `git push --force*` sigue
  **denegado en seco** en cualquier modo y el grant one-shot se emite igual.
  Nuevos `readGitDeliveryMode()` y `messageRequestsDelivery()`.

### Changed

- **Fin de la doble pregunta de entrega**: el orquestador ya no añade su propio
  `ask_user_question` antes de commit/push/PR/merge — la confirmación es ahora
  responsabilidad única del gate determinista (`confirmDelegatedDelivery` decide
  por modo + intención del mensaje).
- **Gate de TDD `ask` refinado**: deja de preguntar en CADA delegación que
  escribe código. El orquestador clasifica el cambio y adjunta un hint `tdd`
  (`off` en mecánicos —mover/renombrar/config/copy/CSS/docs—, `strict` en lógica
  clara); solo cuando no clasifica se pregunta. Default sigue siendo preguntar
  (degradación segura). Nuevos `readDelegationTddHint()` y
  `gateTddForDelegation()`.

## [0.10.2] - 2026-06-21

### Changed

- **Disciplina de coste del parent endurecida**: el orquestador NUNCA edita
  código (ni un one-liner) — entender → `sdd-explore`, escribir → un `sdd-apply`
  acotado (no la cadena entera), entregar → `ein-git` con `context: "fresh"`
  (deja de arrastrar el hilo del padre: un commit trivial medía ~382k tokens de
  input por `fork` → decenas de miles con `fresh`).
- **Review Workload Guard**: el parent mide el diff (`git diff --stat`) y
  pregunta single/split **antes** de delegar el PR; `ein-git` pasa a backstop.
- **`maxRuntimeMs` obligatorio** en chains como backstop ante stalls de
  proveedor; nudge de inactividad que inspecciona estado antes de interrumpir un
  subagente sano (evita corromper un apply multi-fichero a medias).
- **Voz brutalista** como registro-suelo de toda respuesta, no solo de cambios
  importantes.

### Added

- **Gate determinista de TDD**: se dispara en `tool_call` ante cualquier
  delegación que escriba código (`sdd-apply` directo o dentro de un chain), no
  solo en el trigger SDD explícito. Un cambio ad-hoc también resuelve la decisión
  de TDD (modo `ask`), sin doble pregunta. Nueva `delegationTargetsApply()`.

## [0.10.1] - 2026-06-21

### Fixed

- **Crash del banner al arrancar**: el indicador `MODE` se añadió como fila de un
  solo par y el render desestructura cada fila como dos → `undefined is not
  iterable` tumbaba toda la sesión de Pi. MODE emparejado con TDD + loop
  defensivo (una fila malformada ya nunca crashea el banner).

## [0.10.0] - 2026-06-20

### Added

- **Modos de trabajo Solo / Team** (`/ein:mode`, `lib/mode.ts`): Solo por
  defecto (sin Linear; board = `openspec/changes/` + git + EIN.md), Team activa
  Linear como board + preflight. Indicador `MODE` en el banner y en
  `/ein:status`. El installer escribe el modo global (`--no-linear` → Solo) en
  vez de borrar ficheros.
- **Windows vía WSL**: `install.sh` detecta WSL y despliega la build Linux;
  sección de instalación y roadmap de Windows nativo en el README.

### Changed

- **Orquestador recortado** 625 → ~190 líneas: fusión de reglas redundantes,
  gates reubicados al agente que los ejecuta, diferenciadores intactos
  (teaching, routing caro→barato, EIN.md, SDD-5, Plan/Scope Gate). Test de
  presupuesto anti-engorde.
- **Narrativa mode-aware**: fin del "Linear is the primary board" incondicional
  en prompts, agentes, skills y docs.
- **Modelos**: `sdd-apply` → MiniMax-M3 en ambos presets (M2.7 se quedaba corto
  escribiendo código). `ein-git` entra en el flujo Solo (entrega siempre vía
  subagente, nunca git a pelo desde el orquestador).
- **README** reescrito en estética propia (harness personal, stack curado,
  modelos como elección personal personalizable con `/ein:models`).

## [0.9.5] - 2026-06-19

### Added

- **`EIN.md` — contexto de proyecto versionado** (`/ein:init`): verdad de base
  del repo (comandos, arquitectura, convenciones) que se inyecta al orquestador
  y a las fases SDD para que los modelos baratos no re-descubran lo mismo cada
  run. Dos zonas: **curada** (la escribe el humano; Ein no la pisa) y **auto**
  (comandos detectados de `package.json`/lockfiles + estructura, regenerable),
  con sello `rev` (SHA git) + fecha. `/ein:status` avisa de cuántos commits
  atrás quedó el sello para detectar la deriva.
- **`context-mode`** (`npm:context-mode`) integrado: sandboxea las salidas de
  tools, persiste estado de sesión sobre las compactaciones y añade una KB con
  búsqueda. La mayor palanca de ahorro de contexto en sesiones largas. Se
  autoinstala con los demás paquetes declarados.
- **Fan-out read-only paralelo**: guía en el orquestador para lanzar varios
  `sdd-explore` concurrentes (áreas independientes) y sintetizar. Acota cuándo
  NO usarlo (escrituras, la chain SDD, dependencias entre áreas) y recuerda que
  ahorra reloj, no tokens.

### Changed

- **`ein-github` → `ein-git`**: el agente de entrega también hace git local, no
  solo GitHub. Rename completo (agente, routing de modelos, doctor, verify,
  orquestador, docs) con **alias de migración** que remapea la clave legacy en
  `models.json` al leer (no orfana configs previas).
- **Estado de Ein consolidado bajo `.pi/ein/`**: `.atl/` (registro de skills)
  pasa a `.pi/ein/atl/`, junto a `lang/tdd/persona`. Ein aporta así una sola
  carpeta, en el namespace idiomático de Pi (`.pi/agents`, `.pi/chains`).
- **`.gitignore` con un único bloque gestionado** (`lib/gitignore.ts`): cubre
  `.pi/ein/` y `.piagents/`, idempotente y escrito en `session_start`. Migra
  automáticamente el bloque legacy (`# Local Pi runtime state` + `.atl/`) y
  limpia el `.atl/` huérfano de la raíz (solo ficheros generados; nunca toca
  `.atl/skills`).

### Fixed

- **Ficheros huérfanos al actualizar** (`deploy.ts`): la extracción del tarball
  solo añade/sobrescribe, nunca borra, así que un rename upstream (p. ej.
  `ein-github.md` → `ein-git.md`) dejaba el fichero viejo conviviendo con el
  nuevo. Ahora el deploy hace **reemplazo limpio** de las carpetas 100% del
  template (`agents`, `assets`, `chains`, `docs`, `extensions`, `lib`,
  `prompts`) antes de extraer. Se excluye a propósito `skills/` (skills
  descargadas + symlinks del usuario) y la raíz del agente (`auth.json`,
  `sessions/`, `backups/`, `.sdd/`), que siguen intactos.

## [0.9.2] - 2026-06-17

### Changed

- **`sdd-apply` acotado** (coste/calidad con modelos baratos): se queda en el
  slice del design; **prohibido instalar dependencias/frameworks** por su
  cuenta (si hace falta, para y lo decide el padre); tests enfocados, no
  exhaustivos; en el loop corre solo tests focalizados y la suite completa una
  vez al final (lo holístico es de `sdd-verify`).

### Fixed

- **El modo `ask` de `/ein:tdd` no preguntaba nunca**: se pedía como
  instrucción al padre "antes de apply", que dentro de un chain no dispara.
  Ahora se resuelve de forma determinista en el preflight (`ctx.ui.select`
  real por tarea, vía el `input` hook), con override por sesión.

## [0.9.1] - 2026-06-17

### Added

- **Control de TDD estricto** con `/ein:tdd` (`auto`/`strict`/`off`/`ask`),
  persistente por proyecto en `.pi/ein/tdd.json` y autoritativo sobre
  `openspec/config.yaml`. En modo `ask`, Ein pregunta **antes de cada apply**
  si usar el ciclo RED/GREEN — para retoques visuales/triviales se evita el
  desperdicio de tokens.
- **Indicador en el banner** del estado de TDD y persona.

### Changed

- **Ejecutores más estrechos (coste/calidad con modelos baratos)**:
  - `ein-github` es git/gh exclusivo: prohibido correr tests/builds/linters,
    lecturas mínimas (`git diff --stat`, no el diff completo), sin `grep`/`glob`.
  - `ein-linear` exige metadata completa (project, assignee, state, tags,
    labels, milestone) con recipe determinista de IDs y read-back.
  - Las convenciones de código (comment/logging/file-naming) se inyectan solo
    en el parent y `sdd-apply`, no en delivery/linear/explore.
  - `orchestrator`: hand-off explícito ("da la orden, no el problema") — el
    modelo caro resuelve y pasa tareas pequeñas y concretas a los baratos.

### Fixed

- `/ein:tdd` usa `t()` para su descripción (consistencia de locale es/en).

## [0.9.0] - 2026-06-16

### Added

- **Sistema de idioma con dos ejes**, configurable con `/ein:lang`:
  conversación/UI (locale compartido de `rpiv-i18n`, autodetectado de `LANG`,
  también `pi --locale` / `/languages`) y artefactos PR/commit/Linear (config
  por proyecto en `.pi/ein/lang.json`, hereda el de conversación). Permite
  hablar en castellano y generar PRs/issues en inglés.
- UI bilingüe **es/en**: `/ein:help`, `/ein:status`, panel de `/ein:models`,
  selectores y notificaciones; cabeceras de artefactos traducidas para
  `ein-github` / `ein-linear`.
- `/ein:lang` en la ayuda, grupo de checks **I18N** en el doctor y fila
  **LANG/ARTF** en el banner.
- **CI** (`.github/workflows/ci.yml`): suite de tests + typecheck del
  installer + smoke de empaquetado del template en cada push a `main` y PR.
- Test de **paridad es/en** de las claves de UI (invariante de mantenimiento).
- Tests del sistema de idioma (`tests/lang.test.ts`): ejes, herencia,
  directivas, `pick`/`pickFor`, `buildEinPrompt`.

### Changed

- La **persona** controla solo el **tono**; el idioma se gestiona aparte. El
  modo `samuhlo` ya no fija una variante regional: español peninsular por
  defecto vía la directiva autoritativa de idioma.
- Documentación al día: README + las 5 guías de `docs/` documentan el sistema
  de idioma; cifras corregidas (12 skills locales, "8 grupos de checks").
- `installer/src/core/settings.ts`: funciones puras de preservación de
  settings extraídas de `deploy.ts` (la suite corre sin compilar el template).
- Versión del instalador a `0.9.0` (`version.ts` + `package.json`).

### Removed

- Skill local `comment-writer` (sin uso, heredada de una versión previa).

### Fixed

- El test `deploy-settings` ya no depende del template embebido
  (`template.tar.gz`); la suite queda verde de raíz.

---

Releases anteriores (`installer-v0.8.2` y previas) están en
[GitHub Releases](https://github.com/samuhlo/ein-agent/releases).
