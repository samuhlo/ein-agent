# Changelog

Todos los cambios relevantes de Ein. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el versionado es
[SemVer](https://semver.org/lang/es/). Las releases se publican como tags
`installer-v*` (binarios del instalador vía GitHub Actions).

## [0.10.0] - 2026-06-18

### Added

- **`EIN.md` — contexto de proyecto versionado** (`/ein:init`): verdad de base
  del repo (comandos, arquitectura, convenciones) que se inyecta al orquestador
  y a las fases SDD para que los modelos baratos no re-descubran lo mismo cada
  run. Dos zonas: **curada** (la escribe el humano; Ein no la pisa) y **auto**
  (comandos detectados de `package.json`/lockfiles + estructura, regenerable),
  con sello `rev` (SHA git) + fecha. `/ein:status` avisa de cuántos commits
  atrás quedó el sello para detectar la deriva.

### Changed

- **Estado de Ein consolidado bajo `.pi/ein/`**: `.atl/` (registro de skills)
  pasa a `.pi/ein/atl/`, junto a `lang/tdd/persona`. Ein aporta así una sola
  carpeta, en el namespace idiomático de Pi (`.pi/agents`, `.pi/chains`).
- **`.gitignore` con un único bloque gestionado** (`lib/gitignore.ts`): cubre
  `.pi/ein/` y `.piagents/`, idempotente y escrito en `session_start`. Migra
  automáticamente el bloque legacy (`# Local Pi runtime state` + `.atl/`) y
  limpia el `.atl/` huérfano de la raíz (solo ficheros generados; nunca toca
  `.atl/skills`).

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
