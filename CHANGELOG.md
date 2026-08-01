# Changelog

Todos los cambios relevantes de Ein. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el versionado es
[SemVer](https://semver.org/lang/es/). Las releases se publican como tags
`installer-v*` (binarios del instalador vía GitHub Actions).

## [0.33.1] - 2026-08-01

Mini fix: primera pieza del aligerado del orchestrator (norte de Ockham).

### Changed

- **Retirado el protocolo legacy de intercom del orchestrator** (PR #85). El
  bridge de intercom va OFF por config (`extensions/subagent/config.json` →
  `intercomBridge.mode: "off"`, fijado por test), así que los ~3 párrafos de
  protocolo (*Intercom asks* reply+`wait`; *Detached-child liveness* stat del
  `session.jsonl` mtime) gobernaban un estado imposible: con el bridge apagado,
  ningún ejecutor se desacopla mid-run pidiendo al supervisor. Colapsados a un
  párrafo que conserva los guards vivos (bridge off → `status: blocked`, un
  detach es anomalía a reportar, no `wait`/`sleep`-poll, nunca rehacer una fase
  por un ask tardío). ~1950 chars / ~487 tokens menos por sesión del parent (el
  orchestrator se carga siempre), con cero pérdida de calidad de entrega. Test
  P2 de `sdd-phase-runtime-contract` actualizado en lockstep.

### Note

- La investigación a fondo del aligerado del orchestrator concluyó que **el
  resto no es grasa**: ~15 tests anti-drift fijan su contenido como invariantes
  ganadas por incidentes. El intercom (muerto por config) era el único peso
  muerto real; cortar más sería borrar guards de calidad.

## [0.33.0] - 2026-08-01

Batch de simplificación del sistema de skills + Context7 (norte de Ockham:
menos ceremonia, más núcleo). El valor real —el selector que inyecta los
`SKILL.md` relevantes en cada subagente— iba envuelto en maquinaria patrón-recibo.

### Changed

- **Sistema de skills 1467 → 847 líneas** (PR #83). En `ein-skill-maintenance`
  (597 → 269) fuera el package-manager (lock, hash, reconcile, `skills-lock.json`):
  queda `git clone --sparse` + copiar (clonar trae lo último, copiar sobrescribe).
  En `ein-skill-registry` (870 → 578) fuera la caché del registro, el árbol
  `.pi/ein/atl` + `skill-registry.md`, el tool `ein_skill_feedback` y el comando
  `skill-registry:refresh`. La resolución de skills es automática (el parent ya no
  lee ni casa un registro a mano).
- **Selector arreglado: puntúa por el trigger declarado, no por escanear el
  fichero** (PR #83). `inferTriggers` escaneaba todo el `SKILL.md` contra una lista
  fija de keywords, así que `architecture` acababa etiquetada `nuxt, vue, react` (su
  trigger real es refactor/architecture/design) y las skills verbosas ganaban en
  cualquier tarea. Ahora `extractTriggers` lee la cláusula declarada (`Trigger:` /
  `Use when`) de la descripción y el match es por palabra completa. Cobertura nueva
  (`tests/skill-resolution.test.ts`): el selector no tenía ningún test.
- **Context7 cubre el long tail con una regla always-on** (PR #83). El enrutado
  era un mapa hardcodeado de 11 keywords (drizzle, zod, postgres…) que solo conocía
  tecnologías comunes que el modelo ya domina, y quedaba mudo justo para la librería
  rara o el atasco. Fuera el mapa + la detección por-tarea (~55 líneas); dentro una
  regla always-on en `core/AGENTS.md`: cualquier librería sin skill curada —sobre
  todo si no la dominas o te atascas— va a Context7 por el topic concreto
  (`resolve-library-id` → `query-docs`), nunca el manual entero. Se conserva el
  servidor MCP context7 (docs frescas topic-scoped ya las hace `query-docs` nativo).

## [0.32.0] - 2026-07-31

Batch de simplificación siguiendo el norte (menos ceremonia, más núcleo; navaja
de Ockham). Cinco cambios que hacen EIN más simple, más claro y más útil sin
tocar lo que da valor.

### Changed

- **Bootstrap de `config.yaml` adelgazado 799 → ~180 líneas** (`a2b…`, PR #77).
  Era un detector heurístico multi-lenguaje (walker de 20k ficheros, tablas de
  hints, inspectores Node/Go/Rust/Python/Makefile) que adivinaba stack/comandos
  peor que el modelo y dejaba `test_command` vacío en repos con tests. Ahora lee
  la fuente autoritativa —los `scripts` de package.json— más fallbacks
  implícitos (bunfig→`bun test`, tsconfig→`tsc --noEmit`); lo que no sabe lo deja
  vacío para que el `sdd-scope` lo rellene. `context` apunta a EIN.md.
- **models-panel pulido** (PR #78). Fuera el coloreado de modelo por familia
  (regex que se pudría y contradecía la doctrina del panel) → un color de marca;
  paleta honesta (3 colores reales, no 5 alias que mentían); esfuerzo inline
  (`e` cicla en la fila) en vez de un picker de pantalla. Intacto lo que vale:
  tabla agrupada, barras, recomendación por rol, búsqueda.
- **sdd-preflight partido + menos fricción** (PR #79). El cajón de sastre (835
  líneas, 4 trabajos) se parte: `sdd-session-memory.ts` y `sdd-assets.ts` salen a
  sus ficheros. El cuestionario de arranque baja de 5 a 3 preguntas: fuera el
  `chained-PR strategy` (4 modos redundantes con el Review Workload Guard) y la
  pregunta del budget (fijo 400).
- **Lección de acceptance colapsada** (`76618ea`, PR #80). El "acceptance verdict"
  de pi-subagents rechaza en falso las fases de planning; un hook determinista ya
  inyecta `acceptance: none` y lo neutraliza, así que los 5 bullets de prompt que
  lo explicaban se colapsan a un párrafo. El hook (el mecanismo) se conserva;
  solo se resta la prosa que subsume. Conservadas las lecciones de thinking/
  runtime/scoping.

### Added

- **Tool determinista `ein_review_forecast`** (`7fe32af`, PR #81). El Review
  Workload Guard medía el tamaño del PR con un `git diff --shortstat` + 15 globs
  codificado como string de prompt en 3 sitios, ejecutado inline por el parent
  caro, con un test anti-drift. Ahora una tool es dueña única del pathspec: el
  parent la llama (deja de ejecutar git), ein-git confía en el número reenviado,
  y el anti-drift desaparece (no hay 3 copias que desincronizar).

## [0.31.0] - 2026-07-31

Sigue la línea del cambio de rumbo: menos ceremonia, más núcleo. Se retira el
segundo "sistema-recibo", se desenvuelve Engram conservando lo que vale, y se
cierra el hueco de que las herramientas externas envejecían en silencio.

### Removed

- **Ledger de coste / procedencia** (`3ea8e1d`, PR #73). RunReceiptV1 con sha256
  source bindings, `fileIdentity` (dev/ino/mtime), métricas
  reported/estimated/unavailable y aggregates con dedup — todo para atribuir
  tokens/coste por fase. Mismo patrón sobre-ingenierizado que el recibo de
  candidato, y no funcionaba: pedirle a un modelo barato procedencia honesta de
  coste daba `n/a` y problemas de atribución que ensuciaban el status. −783
  líneas netas. Se conserva el budget (self-report barato) y la reconciliación de
  fase.

### Changed

- **Engram desenvuelto: la taxonomía E0/E1/E2 colapsa a una regla** (`c2b9b34`,
  PR #74). El bloque "## Notebook Contract" se repetía en los 7 agentes SDD +
  orchestrator + doctor (~22 líneas de prompt por flujo). La regla que importa
  vive ahora una vez en `AGENTS.md`. La herramienta Engram y todos los guardas
  (secret-scrub, dedup, noise-reject, budgets) quedan intactos.
- **Memoria de Engram a granularidad de sesión, no de fase** (`23e99c4`, PR #74).
  Se hacía una búsqueda Engram + inyección de advisory por fase (map/design/
  apply/verify): coste por fase y superficie de fallo para un modelo barato. Ahora
  solo el parent recibe el snapshot de sesión; recuperar al arrancar, guardar al
  cerrar.

### Added

- **`ein update` auto-actualiza las deps externas presentes** (`70689ef`,
  PR #75). engram, hypa y codegraph son binarios fuera de la transacción de Ein y
  envejecían en silencio. `ein update` los refresca (re-ejecuta el instalador
  oficial = última versión) bajo la misma confirmación que pi, **solo si ya están
  presentes** — respeta el opt-out `--no-hypa`/`--no-codegraph`/`--no-engram`.
  Best-effort: un fallo de red conserva la versión actual.

## [0.30.1] - 2026-07-30

Hotfix de 0.30.0: el `ein-scout` no arrancaba con un modelo barato.

### Fixed

- **El reporte del scout tolera la forma natural de un modelo barato**
  (`4e47482`). La 0.30.0 quitó el `outputSchema` inyectado al lanzar el scout,
  que era lo único que forzaba la forma del JSON. Sin él, un modelo `thinking
  low` emite `uncertainties` como strings (no `{level, statement}`) y
  `references` con un campo `lines` "N-M" (no `startLine`/`endLine`), y el
  validador estricto descartaba el reporte con `missing or invalid uncertainty`
  — el scout parecía no arrancar aunque hacía el trabajo con citas correctas.
  `parseReport` normaliza ahora ambas formas a la canónica; la validación de
  citas contra disco (fichero:línea real y en rango) sigue estricta. El prompt
  del scout especifica las formas exactas con un esqueleto JSON.

## [0.30.0] - 2026-07-30

Cambio de rumbo. EIN se había alejado de su objetivo —simplicidad y ahorro de
tokens con un núcleo pequeño— acumulando maquinaria sobre-ingenierizada. Esta
release quita el aparato más caro y deja el proyecto y sus docs en su estado
real. El salto de 0.25 a 0.30 marca el nuevo capítulo (hacia un gentle-pi propio
más ligero), sin prometer estabilidad todavía.

### Removed

- **Subsistema de recibo de candidato** (`3ea8e1d`, PR #70). Ligaba los bytes
  que pasó `sdd-verify` a un árbol de git y lo revalidaba en cuatro fronteras
  (pre-commit, post-commit, pre-push, pre-PR) más una retirada contra el PR
  mergeado en GitHub. Copiaba el `candidate_tree`/receipt de gentle-pi, pero allí
  el recibo es salida de un review NATIVO real; EIN no lo tiene, así que sellaba
  un `sdd-verify` auto-reportado: garantía aparente sobre la palabra de un agente,
  a cambio de bucles de corrección y fases de más. Fuera 4 libs (~1.686 líneas),
  2 tools (`ein_candidate_receipt`, `ein_candidate_receipt_retire`), el gate del
  hook de entrega y 4 suites de test.
- **Docs de planificación, roadmaps y spikes** (`1f81a7b`, PR #70). `docs/` pasó
  de 21 ficheros a 2. Doctrina nueva: `docs/` guarda solo estado actual; la
  historia de lo planteado vive en git y en `openspec/changes/archive`. Se
  conserva `review-workload-guard.md` (feature viva) y `ein-multiagente-plan.md`
  (semilla del replanteamiento, ahora trackeado).

### Changed

- **Flujo de entrega de `ein-git`** (`3ea8e1d`, PR #70). Eliminada la declaración
  de contenido y las cuatro gates del recibo; la entrega queda protegida por la
  capa determinista barata que sí ahorra tokens: staging cerrado
  (`git-staging.ts`), guardrails y el grant de intención de un solo uso.
- **Spec `sdd-lifecycle`** (`3ea8e1d`, PR #70). De 283 a 73 líneas al retirar 30
  escenarios de recibo; menos superficie que razonar en cada fase.

### Fixed

- **El reporte de scout se valida desde `finalOutput`** (`f4c3be7`). El contrato
  exigía el reporte por el canal `structuredOutput` del runtime, que el modelo
  trata como opcional: 3 de 4 scouts lo emitían como mensaje final (texto) y se
  descartaban con `missing structured report`. Ahora se lee `finalOutput` como
  cualquier subagente y corre la misma validación de citas/schema/paths; un
  launch async devuelve un error accionable en vez del opaco. Se borra el
  `outputSchema` inyectado (código muerto: `parseReport` ya validaba a mano).

## [0.25.0] - 2026-07-30

### Added

- **Preflight de specs canónicos** (`fae19d4`, PR #68). El sync de close mergea
  cada delta dentro de su spec canónico base; un base heredado sin cabeceras
  reventaba con `invalid-format` en la última fase, tras todo el trabajo ya
  hecho. `lintCanonicalBases` valida esos bases desde `lintChange`, así
  `ein_sdd_check` lo saca ya en scope.
- **Serializador y tool de deltas OpenSpec desde datos estructurados**
  (`54410bc`, PR #68). Los deltas se escribían a mano y fallaban el parser
  estricto una y otra vez. `serializeOpenSpecDelta` + `buildOpenSpecDelta`
  generan y validan el delta re-parseando con la gramática del sync; la tool
  `ein_openspec_delta_write` lo escribe o lo rechaza sin dejar rastro.
  `sdd-scope` la usa y nunca teclea el markdown.

### Changed

- **Investigación pre-scope acotada del parent** (`1fa5e37`, PR #68). El parent
  delega la investigación amplia al `ein-scout` de solo lectura con un packet
  acotado y reutiliza la evidencia citada en vez de redescubrirla.

### Fixed

- **El preview cuenta contratos `.md` como producción** (`70b1ef9`, PR #68). El
  clasificador excluía `.md`, así que un cambio que solo tocaba contratos
  mostraba «sin ficheros de producción». Predicado compartido que incluye `.md`
  pero excluye artefactos de proceso SDD y el árbol `openspec/`.
- **La procedencia del ledger deja de figurar como bloqueo** (`08c55fe`, PR #68).
  `change-unresolved` y `legacy-metadata-excluded` (attribution de recibos)
  aparecían bajo «bloqueos» en cada status, ahogando los reales. Ahora salen solo
  en la línea `ledger provenance:`.
- **Staleness de verify por superficie entregada** (`02209a8`, PR #68). Una
  normalización post-verify (cabecera de spec, docs) reescribía `apply-progress.md`
  y forzaba un re-verify completo aunque no cambiara código ni tests. Se compara
  contra el mtime de los ficheros que `tasks.md` declara.
- **El budget avisa al superar lo asignado** (`0eaa440`, PR #68). El «asignado»
  era decoración muda; ahora `formatBudget` marca `⚠ sobre lo asignado (N%)` al
  cruzarlo (advisory, no bloquea el cierre).

## [0.24.4] - 2026-07-30

### Fixed

- **Structured handoff y lifecycle del scout** (`03272bb`, PR #62). El resultado
  estructurado se obtiene desde `details.results[0].structuredOutput`, se
  conservan los diagnósticos de error del runner y se limpia el tracking al
  terminar la sesión.
- **Contrato de extensiones vacías y cobertura aislada del scout** (`730509b`,
  PR #63). Se alinea el contrato entre especificación, doctor y pruebas, se
  corrige el falso negativo del doctor y se añaden cobertura determinista y un
  smoke aislado opt-in. El smoke respaldado por proveedor permanece
  **Unavailable** sin modelo y credencial explícitos.

## [0.24.3] - 2026-07-30

### Fixed

- **Scout de solo lectura sin skills y orientación acotada del orquestador**
  (`f0c786d`, PR #60). `ein-scout` recibía inyección de skills como cualquier
  agente nombrado, pese a estar aislado al repo con `inheritSkills: false`: los
  paths absolutos de `SKILL.md` caían fuera de su sandbox → `Skills not found` y
  ejecución degradada. Ahora se excluye al scout de la inyección de skills.
  Además el orquestador acota su orientación de arranque (`ein_sdd_status` +
  `git status --short`), reconoce que limpiar un cambio sin trackear es `rm -rf`
  en vez de una auditoría, y usa las herramientas `ctx_*` en modo indexar-y-buscar
  en vez de volcar output — evitando que se coma el contexto nada más empezar.

## [0.24.2] - 2026-07-30

### Fixed

- **Arranque de `ein-scout` sin extensiones** (`47712f8`, PR #58). El frontmatter
  declaraba `extensions: []`; pi-subagents parsea ese campo con
  `parseFrontmatterList` (no JSON), que trata `[]` como token literal y lo
  convierte en `--extension []` → el launcher intentaba cargar una extensión en
  `<cwd>/[]` y tumbaba el arranque de cualquier subagente. Ahora el campo va
  definido pero vacío (`extensions:`), que dispara `--no-extensions` sin token
  basura. Un test reproduce los dos parsers de frontmatter de pi-subagents sobre
  los agentes reales, y el orquestador acota sus lecturas inline y trata un scout
  caído como incidente en vez de tragar la investigación.

## [0.24.1] - 2026-07-30

### Fixed

- **Arranque de subagentes con `ein-scout` instalado** (`c2f9775`, PR #55). El
  frontmatter de `ein-scout` declaraba `turnBudget`/`toolBudget` como objeto con
  claves sin comillas; pi-subagents los pasa por `JSON.parse` y el error tumbaba
  el arranque de cualquier subagente (p.ej. `sdd-scope`), porque al lanzar uno se
  enumera el registro entero de agentes. Ahora son JSON válido; un nuevo test
  valida el frontmatter inline real de todos los agentes.

## [0.24.0] - 2026-07-30

### Added

- **`ein-scout` de solo lectura** (`ffe2034`, PR #52). Permite una exploración
  acotada con `read`, `grep` y `find`, lanzada de forma directa y fresca; sus
  informes citados fallan cerrados cuando falta evidencia.
- **Proveniencia fiable para el coste SDD** (`f823cae`, PR #51). El ledger usa
  recibos locales estructurados, no infiere datos por nombres de tarea y muestra
  `n/a` cuando no hay información suficiente.

### Changed

- **Retornos SDD más compactos** (`619c87a`, `9cc1c48`, PR #53). Las siete
  fases devuelven el resumen necesario y derivan la investigación amplia previa
  al alcance a scout; el detalle canónico permanece en disco.
- **Contrato de enseñanza más claro** (`b84cbd6`, PR #50). Las explicaciones
  de Ein y del orquestador priorizan a la persona que las usa.

### Fixed

- **Aceptación y cierre SDD sin ambigüedad** (`dbd6187`, PR #50). La aceptación
  normal queda en `none` y el modo verificado exige declararse; los cierres y
  forzados rechazan estados no permitidos en vez de avanzar por error.

## [0.23.0] - 2026-07-29

### Added

- **Entrega ligada al candidato verificado** (`57c78cb`). Los bytes y el árbol
  exactos que verificó el candidato quedan ligados al repositorio, worktree,
  HEAD y rutas declaradas, y se comprueban antes de entregar el commit.

### Fixed

- **Recuperación de timeout exacta** (`81a1ddd`). Antes de reintentar, la
  entrega reconcilia el estado real del repositorio y ejecuta una sola vez el
  delta restante exacto.
- **Retiro de receipts tras merge** (`1f89b0f`). El retiro pasa a ser explícito
  y solo sucede después de confirmar un PR fusionado en el mismo repositorio,
  sin borrar su evidencia.
- **Retiro durable de receipts** (`961aefa`). La revalidación, observación del
  remoto, locks y persistencia endurecen ese ciclo de vida sin aceptar estados
  dudosos.
- **Evidencia OpenSpec separada** (`874cab4`). El hardening conserva su
  evidencia en su propio cambio para que la trazabilidad del retiro siga siendo
  revisable.

## [0.22.1] - 2026-07-21

### Added

- **Contrato con Pi.** Ein codificaba supuestos sobre Pi —nombres de tools
  builtin en las allowlists de los agentes, hooks de extensión, métodos de
  `ExtensionAPI`— y ninguno estaba comprobado en ningún sitio: cada `pi update`
  era una ruleta. Ya salió caro una vez (`glob` no existe en Pi y tres fases SDD
  salieron ✗ con sus artefactos correctos). Ahora ese contrato es explícito y se
  valida en dos direcciones: si **Ein** empieza a usar algo sin declararlo, falla
  en CI; si **Pi** deja de ofrecerlo, `ein doctor` lo dice por su nombre antes de
  que un run falle de forma incomprensible. La comprobación contra la
  instalación real se salta declarándose cuando Pi no está, nunca fingiendo un
  veredicto.

### Changed

- El set de tools builtin de Pi vivía replicado en tres sitios. Ahora hay una
  sola fuente, contrastada contra la instalación real: tres copias de la misma
  verdad son la duplicación que ya abrió un agujero en la validación de OpenSpec.

## [0.22.0] - 2026-07-21

### Added

- **OpenSpec canónico**: especificaciones vigentes en `openspec/specs/<dominio>/`
  y deltas de comportamiento por cambio, con parser estricto, sincronización
  determinista por hashes y `sync-report.md` como recibo. El cierre exige specs
  sincronizadas; `spec_delta: none` con una razón real cubre el trabajo mecánico.
  Nuevo tool `ein_openspec_sync`: sin él el motor era código muerto y un cambio
  con deltas se quedaba bloqueado para siempre.
- **Pathspec cerrado en la entrega.** Un commit contiene lo que se decidió
  entregar, no lo que hubiera en el árbol. Se rechazan `git add -A/-u/.` y
  `git commit -a`, también dentro de `bash -c`, y se bloquea el `git add dir/`
  que arrastraría ficheros no trackeados o ignorados que nadie nombró — ahí es
  donde se cuela un `.env` o el trabajo en curso de otro. La salida siempre es
  la correcta: nombrar las rutas.
- **Recibo de candidato verificado.** Un verify que pasa ya no dice solo "pasó":
  fija QUÉ bytes pasaron en un árbol git construido con un índice temporal (sin
  tocar el índice ni el worktree reales) y lo liga a repositorio, worktree,
  cambio, HEAD, rutas declaradas, informe y comandos. Solo se emite sobre un
  verify en `pass`, no obsoleto y con el apply completo. Nuevo tool
  `ein_candidate_receipt`. Aún no bloquea la entrega: eso es el siguiente paso.

### Fixed

- **El cierre SDD estaba muerto.** La guarda de specs se evaluaba antes que
  `--force`, así que un cambio sin declaración no podía archivarse por ninguna
  vía. Ahora solo un `conflict` real es inmune a `--force`.
- **`synchronized` era inalcanzable**: el estado se recalculaba reaplicando el
  delta sobre specs ya sincronizadas, lo que producía un conflicto artificial.
  El motor escribía "synchronized" y el router leía "pending" para siempre.
- **Integridad de la sincronización**: un nombre de cambio con `..` escribía
  fuera de `openspec/changes/`, un nombre cualquiera creaba un cambio fantasma
  con solo su recibo, y un recibo copiado de otro cambio pasaba por bueno.
- El recibo de candidato representa correctamente altas, bajas y renombrados.

## [0.21.0] - 2026-07-21

### Fixed

- **`glob` no existe en Pi: los siete agentes SDD declaraban una tool fantasma.**
  Los builtins son `read/bash/edit/write/grep/find/ls`; el equivalente se llama
  `find`. Como `tools:` es una allowlist ESTRICTA, el runner convertía la tool
  ausente en un error AL CERRAR el run: la fase salía ✗ **aunque el artefacto
  estuviera escrito** y `ein_sdd_check` lo validara. Encima anteponía al prompt
  del hijo "reporta este error de configuración", así que reintentaba mientras
  trabajaba. Coste medido en una sesión real: scope/map/design en ✗ con sus
  artefactos correctos y ~120k tokens en reintentos.
- **El gate de entrega fallaba-cerrado por un adjetivo.** Deducía de la prosa de
  la task si una delegación era una entrega: "push the branch" acuñaba el grant
  y "push current branch" no, con el mismo significado. Al no acuñarlo, `ein-git`
  headless quedaba bloqueado **sin salida**. Ahora decide el agente destino
  (`ein-git` ES entrega, se redacte como se redacte) y la prosa queda como red
  secundaria. Además: la intención de entrega del usuario es PEGAJOSA con TTL
  (antes un log pegado a mitad del encargo revocaba en silencio tu "haz push"),
  el grant admite usos acotados en vez de uno solo (un reintento legítimo se
  quedaba sin autorización) y el mensaje de bloqueo dice que falta el GRANT —
  el genérico anterior hacía creer al subagente que faltaba `.pi/ein/git.json`.

### Added

- **El artefacto manda sobre el veredicto del runner.** Una fase SDD entrega UN
  artefacto: si está escrito y sano, la fase está hecha. El runner marca ✗ por
  cosas que no dicen nada del trabajo (tool ausente en la allowlist, respuesta
  final vacía, timeout en la lectura final) y el orquestador repetía una fase
  completa. Ahora se reconcilia de forma determinista, y **solo** si el artefacto
  de esa fase apareció o cambió DURANTE el run, es el único candidato y pasa su
  lint sin errores. El error original viaja siempre dentro del reporte.
- **`ein doctor` audita las allowlists de tools desplegadas**, no solo el repo:
  detecta la deriva entre `~/.pi/agent/agents/` y la plantilla.
- **La puerta de calidad corre en Ubuntu y macOS** con una versión de Bun fijada
  (matriz compartida, sin workflows duplicados). El E2E con Docker sigue solo en
  Ubuntu.
- **Roadmap de calidad** en `docs/quality-roadmap/`.

### Changed

- Suite blindada contra estas dos clases de fallo: contrato de tools de agentes
  (valida cada nombre declarado contra los builtins reales de Pi y cruza la tabla
  del orchestrator con el frontmatter) y reconciliación de fases, con la mayoría
  de casos cubriendo lo que NO debe reconciliarse.
- Los tests fijan el `AGENT_DIR` temporal en un preload, así que el orden de
  descubrimiento de ficheros deja de decidir si la suite pasa.

## [0.20.2] - 2026-07-17

### Removed

- **Fuera los presets de modelos `/ein:models:full` y `/ein:models:lite`.** Salen
  modelos y cambian precios cada semana: un preset que hardcodea nombres se pudre
  en silencio y da falsa confianza. Se eliminan los comandos, el modo del panel y
  todos los nombres de modelo de la documentación. Se queda lo que NO caduca: el
  esfuerzo por agente (un nivel, no un nombre) y la recomendación por rol.

### Changed

- **Las recomendaciones de `/ein:models` ahora se ven.** Marca `!` en cualquier
  agente cuyo esfuerzo fijado se desvíe del recomendado, más una línea explícita
  "Fuera de recomendación: X → recomendado Y" para el agente enfocado.
- **`sdd-apply` se recomienda ahora con modelo CAPAZ y esfuerzo bajo.** El coste
  lo controla el esfuerzo, no abaratar el modelo: uno barato no ahorra, flaquea
  (135 turnos y 1.5M tokens en un grupo con TDD estricto, agotando la cuota del
  proveedor). Sin routing condicional ni preguntas nuevas: mejor recomendación.
- **`apply-progress.md` se mantiene compacto**: cada grupo aporta un resumen, no
  un volcado (un cambio llegó a 906 líneas y disparó el aviso de tamaño).

## [0.20.1] - 2026-07-16

### Added

- **Brief docente antes de la compuerta de apply.** En un SDD interactivo, antes
  de preguntar "¿aplico?", el orquestador ahora presenta un resumen en tono
  docente: QUÉ consigue el cambio, CÓMO va a funcionar por dentro (del diseño),
  QUÉ SE TOCA (grupos + ficheros de producción exactos) y RIESGOS — y luego
  pregunta. La lista de ficheros es determinista (`resolveSddPlanPreview` sobre
  `tasks.md`, tests excluidos), no la paráfrasis del modelo; `ein_sdd_status` la
  adjunta en la ventana de apply. Se acabó decidir a ciegas.

## [0.20.0] - 2026-07-16

Cierra el arco de coste y fiabilidad del SDD acumulado en la serie 0.19.x
(updater transaccional funcionando, apply barato, TDD off por defecto, guards de
cierre, calibración de map/verify). Esta release recalibra el último cabo suelto
y termina el right-sizing de grupos.

### Fixed

- **El `turnBudget` de apply ya no aborta trabajo legítimo (regresión de E4).**
  El cap de 40 turnos cortaba a mitad un apply de TDD estricto —que corre muchos
  ciclos RED/GREEN legítimos— y llegó a bloquear un SDD entero. Ahora los applies
  de TDD estricto **no llevan cap de turnos** (los gobierna `maxRuntimeMs`); el
  cap normal sube a 60, como backstop solo de runaways reales.

### Changed

- **`sdd-tasks` dimensiona los grupos al trabajo real (bloque F).** Ni demasiados
  ni grupos monstruo: cada grupo ≤3-4 ficheros de producción, un tipo fundacional
  va en su propio grupo mínimo (nunca junto a sus consumidores), y bajo TDD
  estricto los grupos son aún más pequeños. `ein_sdd_check` avisa `oversized-group`
  cuando un grupo toca >4 ficheros de producción, para partirlo antes de aplicar.

## [0.19.14] - 2026-07-16

### Changed

- **Calibrado el thinking de map/verify y recomendaciones en `/ein:models` (bloque G).**
  Tras abaratar apply (bloque E), el coste se movió a `sdd-map` (~222k) y `sdd-verify`
  (~297k) — fases que leen y verifican, no diseñan. Ahora corren a `thinking: medium`
  por defecto; solo `orchestrator` y `sdd-design` (que razonan) siguen en modelo
  capaz/high. El detalle que design necesita vive en `map.md`, no en los tokens de map,
  así que bajar su thinking no pierde detalle. Además, el panel `/ein:models` muestra la
  recomendación por agente (barato/capaz + thinking + por qué) para elegir sin memorizar
  la arquitectura.

## [0.19.13] - 2026-07-16

### Added

- **Aviso de sesión obsoleta tras un `ein update` a mitad de sesión.** La plantilla
  (agentes, orchestrator.md, preflight/config) se carga al arrancar la sesión y
  corre una vez; un `ein update` cambia los ficheros en disco pero la sesión viva
  sigue con lo anterior. Ahora la sesión padre interactiva registra la versión
  instalada en su primer turno y, si cambia a mitad de sesión, avisa UNA vez de
  reiniciar Pi para cargar los cambios.

## [0.19.12] - 2026-07-16

### Changed

- **TDD off por defecto, una sola pregunta, sin doble-ask (bloque B).** El default
  de TDD pasa a **off** (la mayoría del trabajo frontend/simple no necesita
  RED/GREEN ni debe quemar tokens); strict es opt-in. El preflight pregunta la
  postura UNA vez al arrancar (off/strict, default off) y **siempre** fija la
  decisión de sesión, así el gate de delegación ya no vuelve a preguntar a mitad
  de flujo — fin del doble-ask que salía cuando el modo global era `ask`.

## [0.19.11] - 2026-07-15

### Changed

- **La fase apply del SDD ejecuta, ya no razona (bloque E: coste).** Apply era el
  sumidero de tokens (un cambio de 1 línea llegó a 47 turnos y rechazos varios).
  Ahora: `sdd-apply` corre a `thinking: low` (E0); se delega con `acceptance: none`
  por defecto y `sdd-verify` es el gate runtime real (E1), quitando el peaje del
  acceptance-report que hacía thrashear a los modelos baratos; nunca toca la línea
  `status:` de `tasks.md` y el lint acepta un tasks 100% cerrado (E2); y lleva un
  `turnBudget` backstop contra runaways (E4). El orquestador puede pedir
  `acceptance: verified` explícito cuando quiera re-ejecución por grupo.

## [0.19.10] - 2026-07-15

### Added

- **`ein_sdd_close` como herramienta.** El orquestador solo tenía el comando de
  usuario `/ein:sdd-close` (que no puede invocar por sí mismo), así que cerraba
  con rodeos (importar la librería a pelo) o pedía al usuario que lo tecleara.
  Ahora es una tool determinista —gemela de `ein_sdd_status`/`ein_sdd_check`—
  con el mismo guard de readiness, receipt de memoria y refresco de EIN.md.

### Fixed

- **Fuga de artefacto al usar una fase como explorador.** Delegar `sdd-map`
  (que es una FASE y escribe `map.md`) para investigar un cambio aún sin scope
  dejaba un `map.md`/dir stray. El router marca ahora un artefacto **fuera de
  orden** (una fase presente cuyo predecesor falta) para que `ein_sdd_status` lo
  surface; la investigación pre-scope debe ir por lectura directa, no por una fase.

## [0.19.9] - 2026-07-15

### Changed

- **El SDD ya no pregunta entre cada fase.** El modo interactivo se redefine: las
  fases de planificación (scope→map→design→tasks) corren de corrido sin preguntar;
  la única compuerta humana normal es UNA confirmación antes del primer apply, que
  cubre todos los grupos aprobados. verify/close siguen automáticos si pasan, pero
  paran con la causa exacta ante fallo, bloqueo o evidencia obsoleta.
- **Apply por grupos, reanudable.** `ein_sdd_status` muestra `next pending: <id>
  <título>` (la primera tarea sin marcar). Tras reabrir Pi, el flujo continúa desde
  ese grupo sin rehacer lo ya hecho.

## [0.19.8] - 2026-07-15

### Fixed

- **El SDD ya no puede cerrar sobre evidencia obsoleta.** Si una corrección se
  aplica DESPUÉS de que verify pasara, `verify-report.md`/`summary.md` seguían
  afirmando el estado viejo como verificado, y `/ein:sdd-close` (un move puro)
  archivaba igual. Ahora el router detecta la obsolescencia de forma determinista
  (por mtime: apply-progress más nuevo que verify → `verifyStale`) y enruta de
  vuelta a `verify`; `closeChange` rechaza archivar salvo que apply esté completo,
  verify sea pass y fresco, summary exista y fresco, y no queden tareas pendientes.
  `--force` es el escape deliberado.

## [0.19.7] - 2026-07-15

### Fixed

- **`ein update` completa la transacción (el arreglo definitivo).** La transacción
  spawnea el binario nuevo con tres entry-points que no existían en `main.ts`, así
  que fallaba etapa tras etapa (`verifying`, luego el swap, luego el deploy). Toda
  la transacción solo se había probado contra `child.spawn` mockeado. Ahora el
  binario implementa: `--version` con línea `template-version` (el probe necesita
  ambas), `--ein-continuation` (confirma identidad tras el swap) y
  `--ein-deploy-template` (extrae el template embebido). Se añade un smoke test que
  ejercita los tres contra el `main.ts` real. Como corren sobre el binario nuevo,
  `ein update` desde una versión rota los alcanza y completa la actualización.

## [0.19.6] - 2026-07-15

### Fixed

- **`ein update` seguía cortándose al descargar (segunda mitad del arreglo).**
  Tras subir el cap de tamaño (v0.19.5), el deadline HTTP de 15 s —correcto para
  el JSON de metadata— abortaba a mitad la descarga del binario Bun de ~90 MB
  (`acquiring-metadata: The operation timed out`). `http.get` acepta ahora un
  timeout por llamada: metadata/checksums fallan rápido (30 s) y la descarga del
  asset dispone de 300 s. Igual que con v0.19.5, hay que reinstalar una vez con
  el script `curl` para estrenar el arreglo.

## [0.19.5] - 2026-07-15

### Fixed

- **`ein update` fallaba en Linux y macOS-x64.** El actualizador transaccional
  limitaba toda respuesta HTTP a 64 MB, pero el binario del instalador es un
  ejecutable Bun standalone que empaqueta el runtime y pesa ~66-95 MB (linux-x64:
  91 MB). La descarga del asset reventaba el límite y el update abortaba en
  `acquiring-metadata: Response exceeds size limit`. Cap subido a 256 MB, con
  test de regresión. Para recibir el arreglo hay que reinstalar una vez con el
  script `curl`: `ein update` desde una versión anterior seguirá fallando porque
  el límite viejo va compilado en el binario.

## [0.19.4] - 2026-07-15

### Fixed

- **Los ejecutores SDD ya no se desacoplan del padre.** El intercom bridge de
  pi-subagents queda desactivado para los agentes EIN (`intercomBridge.mode:
  off`): en vez de detenerse a mitad pidiendo una decisión al supervisor —lo que
  dejaba al orquestador en bucles de `sleep`— devuelven `status: blocked` con la
  causa concreta.
- **El preflight Git deja de convertir stashes en una falsa emergencia.** Un
  stash es trabajo aparcado, no evidencia de un HEAD incorrecto; solo un `reset`
  reciente dispara la reconciliación. Y esa directiva se inyecta solo al
  orquestador, no a cada ejecutor: reconciliar el árbol es asunto del padre una
  vez, y los ejecutores dejan de re-auditar el repo (`git fsck`/`reflog`/`stash`).

## [0.19.3] - 2026-07-15

### Fixed

- **Fases documentales del SDD ya no se rechazan en falso.** Un hook determinista
  inyecta `acceptance: none` en las delegaciones de planificación (scope, map,
  design, tasks, close); el runner deja de exigir evidencia `tests-added` a un
  artefacto que `ein_sdd_check` ya valida. La ✗ dependía de que el orquestador
  recordara pasar el campo, por eso a veces aparecía y a veces no.

### Changed

- **TDD se elige al inicio del SDD.** El preflight pregunta la postura de TDD
  (off/strict/auto) junto al modo de ejecución; elegir off o strict fija la
  decisión de la sesión y el flujo no vuelve a interrumpirse a mitad.

## [0.19.2] - 2026-07-15

### Fixed

- **El instalador siempre nombra el paquete pi con scope.** El `pi` pelado en
  npm es una librería matemática ajena cuyo bin pisa al agente y rompe `pi`; el
  mensaje de fallo de `installPi` lo abreviaba a `bun install -g pi`, un footgun
  si se copiaba. Ahora nombra `@earendil-works/pi-coding-agent`, con un test que
  impide reintroducir la forma sin scope.

## [0.19.1] - 2026-07-15

### Fixed

- **`ein update` vuelve a actualizar pi.** La reescritura transaccional del
  actualizador dejó de refrescar el agente subyacente (`bun install -g pi`) y
  los paquetes Pi declarados, aunque el menú y la ayuda seguían prometiendo
  «Ein y pi». Tras un update verificado y no dry-run, pi y sus paquetes se
  refrescan de nuevo (best-effort, con confirmación); un fallo al refrescar pi
  no invalida el update del binario de Ein.

## [0.19.0] - 2026-07-14

### Added

- **Actualizador transaccional y verificado.** `ein update` resuelve releases
  estables, descarga el asset de la plataforma y valida su checksum antes del
  despliegue; sustituye el ejecutable, el template y el marker de instalación
  de forma atómica. Un fallo revierte el estado previo y una transacción
  interrumpida se recupera en la siguiente ejecución.
- **Ciclo de vida de Engram determinista.** El adapter CLI acota la memoria a
  operaciones verificables en fuente/desarrollo, guarda los descubrimientos de
  fase con claves estables y deja OpenSpec como verdad canónica cuando Engram
  no está disponible o falla sin bloquear el flujo.

### Changed

- **Semántica de Git y banner aclarada.** El estado mostrado distingue de forma
  determinista sincronía, remoto adelantado, commits sin publicar y cambios sin
  commit, con fallback explícito para offline, repos sin remoto y no-repos.
- **Experiencia de README y release más verificable.** La ruta rápida de
  instalación, el enlace a la instalación detallada y el bloque de última
  release se alinean con el registro local; la publicación conserva el tag
  genérico `installer-v<semver>`.

## [0.18.0] - 2026-07-13

### Added

- **Grafo de código (CodeGraph), opt-in y conmutable.** Si el proyecto está
  indexado con [codegraph](https://github.com/colbymchenry/codegraph)
  (`codegraph init`; AST determinista → SQLite local), Ein inyecta al
  orquestador y a las fases SDD la directiva "un `codegraph explore` antes que
  una docena de grep/read" — código verbatim + call paths + blast radius en una
  llamada, por CLI (la ruta MCP se descartó: el interop con pi-mcp-adapter
  cuelga; detalles en `docs/codegraph-spike-plan.md`). `/ein:codegraph`
  (`auto`|`off`, default `auto` = binario + índice); sin cualquiera de los dos,
  cero prompt gastado. `sdd-map` gana bash acotado EXCLUSIVAMENTE a queries
  codegraph read-only. `.codegraph/` entra al gitignore gestionado; celda
  CGRAPH en el banner. Medido en Fase 0: -38% mediana de payload (hasta -85%
  en ficheros grandes) frente a grep+read manual.
- **codegraph como dependencia opcional del installer** (wizard con default no,
  `--no-codegraph`, doctor `warn`), con `codegraph telemetry off` automático
  tras instalar — la política de Ein es no-telemetría.

### Changed

- **Bootstrap de `openspec/config.yaml` compartido y automático.** La
  detección/creación se extrae de `sdd-init` a una lib compartida y corre
  create-if-absent en el preflight SDD: los subagentes ya no se atascan
  preguntando por config vía intercom. El router deja de reportar "tasks.md
  ausente" como bloqueo en fases previas a tasks (era ruido en cada status).
- **Doctrina de intercom del orquestador renovada** (validada con incidentes
  reales): el canal supervisor nativo funciona (detach→reply→resume) — ante un
  ask vivo: verificar realidad → responder con decisión → `wait` inmediato sin
  cerrar el turno; y ante un hijo detachado "aparentemente muerto" (wait ciego,
  status congelado, resume rechazado), comprobar el mtime de su session file
  antes de lanzar una continuación — dos applies concurrentes sobre el mismo
  árbol se pisan.
- Tabla-inventario del orquestador sincronizada con los tools reales de
  `sdd-map` (write + bash acotado; estaba stale desde v0.17.5).

## [0.17.6] - 2026-07-13

### Fixed

- **Un `tasks.md` 100% completado ya pasa el gate.** Regresión destapada por
  0.17.5: al ordenar a `sdd-apply` marcar los checkboxes en ambos modos, un
  cambio terminado deja todo `- [x]` — y la señal obligatoria del linter solo
  matcheaba el literal `- [ ]`, así que `ein_sdd_check` reventaba con
  `missing-checkbox` justo al acabar el trabajo (y empujaba a des-marcar tareas
  hechas). La señal acepta ahora `- [ ]` y `- [x]`: significa "hay checklist",
  no "hay trabajo pendiente".

## [0.17.5] - 2026-07-13

### Fixed

- **Fin del `parent-fallback` en cada `sdd-map`.** Causa raíz: pi-subagents
  resuelve un `output` relativo dentro de su sandbox `.pi-subagents/`, nunca en
  el repo — el "runner escribe el artefacto" era una premisa falsa y CADA map
  acababa copiado a mano por el parent con warning de provenance. Ahora
  `sdd-map` tiene `write` (como todas las demás fases) y escribe él mismo su
  único artefacto en `openspec/changes/{change}/map.md`; el orquestador ya no
  pasa `output`/`outputMode` al delegar fases y el fallback queda como último
  recurso.
- **Checkboxes de `tasks.md` en strict TDD.** La instrucción de marcarlos solo
  existía en modo standard: un cambio terminado en strict reportaba `pending=N`
  para siempre en `ein_sdd_status`. Ahora se marcan en ambos modos.
- **`.pi-subagents/` en el bloque gestionado del gitignore.** El scratch de runs
  de subagentes no se ignoraba; `openspec/changes/` (el board) nunca se ignora.

### Changed

- **Guía de runtime por fase en el orquestador.** Apply estricto/multi-grupo
  ≥30 min (y continuar desde `apply-progress.md` tras un timeout, no reiniciar);
  fases de planificación que leen código (map/tasks/revisiones) ≥10 min; >6
  grupos en un `tasks.md` = smell de scoping (trocear en cambios hermanos).
- **Límite de shell compuesto en `ctx_batch_execute`.** `for`/`if`/heredocs
  rompen por el prefijo `NODE_OPTIONS` del wrapper; el orquestador ahora los
  envuelve en `bash -c '…'` en vez de reintentar en bucle.

## [0.17.4] - 2026-07-10

### Added

- **Estado de sync de git en la tabla de inicio.** GIT pasa a su propia fila con
  el estado real de la rama, calculado de forma **determinista** (cero tokens de
  modelo, una ronda de red con `ls-remote`): `✓ sync` · `⚠ pull (remoto adelante)`
  · `↑N sin pushear` · `○N sin commitear`. Para saber, antes de tocar nada, si
  otro PC ya adelantó la rama. Best-effort: offline → `sync?`, sin remoto →
  `local`, sin repo → nada.

### Fixed

- **`linear-workflow` no se inyecta en modo Solo.** La skill puntúa alto por sus
  tags (`nuxt`/`github`), así que el advisor la metía en `sdd-scope` en cualquier
  proyecto Nuxt aunque Linear estuviera dormido — ruido y tokens malgastados.
  Ahora las skills solo-Team se excluyen fuera de Team (filtro en la inyección,
  no en el registro: un cache viejo ya no la cuela).

## [0.17.3] - 2026-07-10

### Fixed

- **Onboarding: "Personalizar" repasa los 5 esenciales.** Antes solo preguntaba
  por lo pendiente (fichero de config ausente), así que en un proyecto con
  persona/lang/tdd ya configurados de antes solo pedía hypa + EIN.md — sensación
  de flujo incompleto. Ahora "Personalizar" repasa siempre los 5 mostrando el
  valor actual (`← actual`); "Usar recomendados" sigue rellenando solo lo
  ausente (nunca pisa una elección previa). La intro indica qué falta.

## [0.17.2] - 2026-07-10

### Fixed

- **`ein update` reventaba con `ENXIO: no such device or address`.** El backup
  previo copiaba `intercom/broker.sock` (socket IPC del runtime de Pi) con
  `cpSync` → `open()` sobre un socket falla con ENXIO y abortaba la actualización.
  Se excluye `intercom/` del backup y se añade un filtro que salta cualquier
  socket/FIFO/dispositivo (blindaje ante ficheros especiales sueltos).

### Changed

- **Tabla de inicio (banner de Pi) a 3 columnas** — más legible — y añade
  **HYPA** con su estado resuelto (`auto·on`/`auto·off`/`on`/`off`), como el TDD.
- **Animación del installer, una vez por proceso.** Menú → Install la repetía;
  ahora la segunda vez pinta estático. Añade una frase de la casa atenuada bajo
  el logo tras materializarlo.

## [0.17.1] - 2026-07-09

### Added

- **Índice de EIN.md autoactualizable.** Al cerrar un cambio (`sdd-close`) el
  `## Índice` se mantiene solo: cobertura **determinista** (los dirs nuevos
  entran con placeholder, se preservan las descripciones, caen los que ya no
  existen) + descripciones que el agente `sdd-close` rellena **solo para los
  dirs que tocó el cambio** (una línea, sin reescribir lo existente ni tocar
  otras zonas). El mapa del repo no envejece sin trabajo manual.

## [0.17.0] - 2026-07-09

### Added

- **Onboarding first-run.** La primera vez que Ein entra a un proyecto sin
  configurar (agnóstico a su edad: mira "¿está configurado?", no "¿es nuevo?"),
  un wizard único en `session_start` resuelve los esenciales —persona, idioma de
  artefactos, TDD, Hypa— y genera `EIN.md`. "Usar recomendados" de un toque o
  personalizar. Pendiente = fichero `.pi/ein/*.json` (o `EIN.md`) ausente; una
  vez escritos no vuelve a preguntar. No-op sin UI. Comando `/ein:onboard`.
- **`## Índice` y `## Docs` en EIN.md.** El scaffold siembra un `## Índice`
  curado con las carpetas del repo (una línea de "qué es cada cosa", preservado
  al refrescar) y la zona AUTO añade `## Docs` con links a la documentación
  detectada. `sdd-close` refresca la zona AUTO al cerrar un cambio.

### Changed

- **Hypa: default `auto` con detección de stack.** Nuevo modo `auto` (default,
  antes `off`): envuelve en toolchains verbosos no-Bun (dotnet/gradle/terraform/
  k8s → 90-100% menos ruido) y se queda crudo en Bun puro (ya terso). Modos
  `auto|on|off`; se retira el "ask" (el onboarding ya pregunta).
- **TDD `ask` pregunta al arrancar el SDD completo.** El gate se dispara al
  delegar la fase `scope` (no a mitad del apply) y cachea la decisión por run →
  no re-pregunta en applies sucesivos (slices).

## [0.16.0] - 2026-07-09

### Added

- **Compresión determinista de salida de comandos (Hypa).** `/ein:hypa on`
  envuelve el tool `bash` con [Hypa](https://github.com/Hypabolic/Hypa) para
  reducir el ruido que tragan los modelos baratos en `sdd-apply`/`sdd-verify`.
  Solo se envuelve un allowlist de tools con reducer real (git de lectura,
  vitest/jest/eslint/biome/oxlint, dotnet, cargo, terraform…); el genérico se
  deja a `context-mode` y el streaming/interactivo (`dev`, `serve`, `--watch`,
  `logs`, `-f`, `-it`) nunca se toca. Opt-in, default `off`, persistente en
  `.pi/ein/hypa.json`.
- **Integración EIN-native (sin la extensión `pi-hypa`).** El wrap se hace
  mutando `event.input.command` en el hook `tool_call`: los guardrails corren
  sobre el comando ORIGINAL primero y solo entonces se envuelve. Normaliza el
  prefijo Bun (`bunx vitest` → `vitest`) e inyecta `./node_modules/.bin` en el
  PATH para resolver el binario sin romper el anchor del reducer.
- **Hypa como dependencia opcional del installer.** `checkDeps` la detecta
  (no bloqueante), el wizard ofrece instalarla (`--no-hypa` para omitir), y el
  doctor la reporta en RUNTIME (`warn`, nunca falla). Si falta el binario, el
  wrap queda inerte y Ein cae a bash + `context-mode`.

## [0.15.3] - 2026-07-08

### Added

- **Modelo de ramas `feature -> dev -> main` en `github-workflow`.** La skill de
  delivery adopta un flujo de promoción explícito: `main` = producción (solo
  recibe merges desde `dev`), `dev` = integración/staging donde el trabajo
  terminado convive antes de publicar, y las ramas `feat/*`/`fix/*`/`chore/*`
  salen de `dev` y apuntan a `dev`. Incluye la excepción de hotfix (rama desde
  `main`, PR a `main`, y merge `main -> dev` de vuelta), el bootstrap del repo
  (crear `dev` desde `main` si falta) y la nota de previews de Vercel. Nuevo
  hard-stop gate que verifica la base de la rama antes de cualquier `git`/`gh`.

## [0.15.2] - 2026-07-08

### Added

- **Cobertura de comportamiento en `verify`.** Un `status: pass` con solo build
  y typecheck verdes ya no basta: `sdd-verify` declara `behavior_coverage`
  (`verified | partial | none | n-a`) y `ein_sdd_check` avisa (warning, no
  bloquea el routing) cuando un PASS no confirmó el comportamiento observable —
  un build verde no prueba no-regresión.

### Changed

- **Retirado el fallback cross-provider de los 9 agentes.** Se elimina
  `fallbackModels`: Ein deja de cambiar de modelo automáticamente a media
  tarea, restaurando la promesa del README. Un corte transitorio del proveedor
  se absorbe con el retry paciente (`maxRetries: 6`, backoff) en el mismo
  modelo; agotar cuota de verdad es una decisión manual (`/ein:models:lite`).
  Evita picos de coste silenciosos (un agente barato escalando al modelo caro)
  y caídas de calidad a mitad de un trabajo con estado.

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

- **Capa de estado SDD determinista** en TS puro expuesta como tools de Pi:
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

- **Flujo SDD fase a fase** en el orquestador: router →
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
