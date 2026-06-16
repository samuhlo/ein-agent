# Changelog

Todos los cambios relevantes de Ein. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el versionado es
[SemVer](https://semver.org/lang/es/). Las releases se publican como tags
`installer-v*` (binarios del instalador vía GitHub Actions).

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
