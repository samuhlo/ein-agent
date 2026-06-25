# Changelog

Todos los cambios relevantes de Ein. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el versionado es
[SemVer](https://semver.org/lang/es/). Las releases se publican como tags
`installer-v*` (binarios del instalador vía GitHub Actions).

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
