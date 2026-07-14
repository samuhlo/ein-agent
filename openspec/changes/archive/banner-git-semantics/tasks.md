# Tasks — banner-git-semantics

status: ready
blocked_by: none

## // 001. Modelo Git puro, parsers y copy responsive

- [x] 1.1 Crear `ein-pi/agent/lib/banner-git.ts` con `HeadState`, `WorktreeState`, `TrackingRelation`, `RemoteCheck`, `UpstreamState`, `GitBannerSnapshot`, `parsePorcelainV1Z`, `parseLeftRightCount` y `renderGitBannerRows`; añadir la matriz table-driven pura en `tests/banner-git-semantics.test.ts`.
  - skills: `architecture`, `bun`, `vitest`
  - why: separar identidad de `HEAD`, entradas locales y relación upstream para sustituir `○N` y el copy ambiguo por unidades verificables.
  - learn: porcelain cuenta registros lógicos; `MM` pertenece a staged y unstaged, pero sigue siendo una sola entrada, y un rename consume su segundo path sin duplicarla.
  - architecture: el módulo de dominio es puro y cohesivo; el renderer recibe snapshot, `Lang` y ancho, no procesos, red, reloj ni estado global.
  - avoid: reutilizar `git-baseline`, contar líneas/tokens NUL como archivos, sumar categorías como total único, o tratar `behind` como `pull`.
  - acceptance: `git status --porcelain=v1 -z --untracked-files=all` queda fijado para vacío, `M `, ` M`, `??`, `MM`, `R ` y `RM`; tokens inválidos o rename/copy incompleto dan `invalid-porcelain`; `0 0`, `N 0`, `0 N`, `N M` clasifican equal/ahead/behind/diverged; a 80/60/40 columnas y en español/inglés se asertan filas `HEAD`/`LOCAL`/`UPSTREAM`, `commits` para upstream, `local entries`/`entradas locales` sólo en narrow, y ausencia de `○`, `pull` y leyendas sólo simbólicas. `server-changed-counts-unavailable` oculta siempre conteos y nunca se vuelve behind/diverged inventado.
  - rollback: retirar el módulo y esta matriz restaura el seam textual anterior sin datos persistidos ni cambios de configuración Git.
  - verify: `bun test tests/banner-git-semantics.test.ts`
  - forecast: producción ≤220 líneas; tests separados, estimación ≤260 líneas; strict_tdd=false, pero las pruebas conductuales table-driven son obligatorias en este mismo work unit.

## // 002. Probe inyectable y lifecycle cacheado sin mutación

- [x] 2.1 Implementar en `ein-pi/agent/lib/banner-git.ts` el contrato `ProcessRunner`, `probeGitBanner` y `GitBannerController`; extender `tests/banner-git-semantics.test.ts` con `FakeProcessRunner`, deferred y reloj inyectado.
  - skills: `architecture`, `bun`, `vitest`
  - why: obtener estado local útil sin bloquear y hacer observables los comandos, fallos, generaciones y repaint sin repositorios ni red reales.
  - learn: un snapshot cacheado separa el trabajo asíncrono de render; una generación evita que una promesa vieja sobrescriba una vista nueva.
  - architecture: `ProcessRunner` es una capability estructural inyectada con `file + args[] + cwd + timeout`; `getSnapshot()` sólo lee caché, mientras `refresh()` publica transiciones y coalesce el callback de refresh.
  - avoid: shell interpolado, `exec` capturado dentro del renderer, polling, fetch, o inferir `offline` desde un timeout/auth/error genérico.
  - acceptance: el probe valida repositorio, resuelve rama o detached, parsea worktree, lee `branch.<name>.remote`/`.merge`, usa `@{upstream}` y `rev-list --left-right --count HEAD...@{upstream}` contra objetos locales; publica relación local antes de `ls-remote --exit-code <remote> <merge-ref>` opcional (no para remote `.`); mismatch OID produce sólo `server-changed-counts-unavailable`; DNS/`Network is unreachable` permite offline y timeout/auth/process produce error; runner fake allowlist sólo admite `rev-parse`, `symbolic-ref`, `status`, `config`, `rev-list`, `ls-remote`; no hay fetch/pull/push/mutación. Los tests prueban loading, refresh diferido, cero llamadas antes/después de render, timeout, mismatch, generación vieja ignorada e `invalidate()` sin repaint tardío.
  - rollback: retirar controller/probe y sus tests elimina sólo estado efímero de sesión; no hay refs, configuración ni red que deshacer.
  - verify: `bun test tests/banner-git-semantics.test.ts`
  - forecast: producción ≤180 líneas; tests separados, estimación ≤220 líneas; strict_tdd=false, pero fake-process y lifecycle conductuales son obligatorios en este work unit.

## // 003. Adaptar la fila GIT del banner sin afectar otras filas

- [x] 3.1 Modificar `ein-pi/agent/extensions/ein-banner.ts`: eliminar `computeGitSync()` y el probe duplicado de rama; en `session_start` crear `GitBannerController`, diferir `refresh(ctx.cwd)` 100 ms, adaptar `execFile`, `Lang`/`pick`, `renderGitBannerRows`, `LayoutBuilder` y `tui.requestRender()`; ajustar sólo el umbral de filas necesario para las tres filas Git y preservar `<40` skip.
  - skills: `architecture`, `bun`, `vitest`
  - why: conectar el contrato puro al header existente para que cada estado se vea y el resultado tardío repinte sin ejecutar trabajo síncrono durante render.
  - learn: la UI puede degradar contenido por variantes de ancho sin truncar frases críticas; el adaptador debe traducir datos al layout, no reinterpretar Git.
  - architecture: `ein-banner.ts` es borde TUI: adapta runner/locale/filas a `LayoutBuilder`; render lee sólo `controller.getSnapshot()` y el callback coalescido llama `tui.requestRender()` si el header continúa activo.
  - avoid: reimplementar parsers o relaciones en la extensión, usar `fit(...).slice()` para cortar copy Git, volver a una única fila que mezcle unidades, o cambiar colores, animación, intro, filas no Git o `installer/**`.
  - acceptance: la fila `GIT` se sustituye por filas semánticas `HEAD`, `LOCAL`, `UPSTREAM` en los modos que caben; se preservan registro del header, paleta, animación, resize y todas las filas no Git; `<40` sigue skip; wide/medium/narrow muestran el copy español e inglés fijado por la matriz, sin `○N`, `sync?` ni `pull`; no hay proceso/red síncronos dentro de `render`, ni nueva ejecución por resize/render repetido, y el banner de versión de `installer/**` queda intacto.
  - rollback: revertir este work unit restaura `computeGitSync()` y la única fila `GIT`; el módulo nuevo y sus tests se pueden revertir juntos, sin afectar installer ni otros dominios Git.
  - verify: `bun test tests/banner-git-semantics.test.ts`
  - forecast: producción ≤180 líneas incluidas en el límite total de producción ≤400 para los work units 001–003; tests separados, estimación ≤80 líneas adicionales; strict_tdd=false, con regresiones conductuales obligatorias.

## // 004. Matriz de regresión y handoff factual para documentación posterior

- [x] 4.1 Completar `tests/banner-git-semantics.test.ts` con la matriz integrada renderer/controller/adapter y crear `openspec/changes/banner-git-semantics/handoff.md` sólo a partir de la evidencia aceptada para `readme-release-ia`.
  - skills: `cognitive-doc-design`, `bun`, `vitest`, `work-unit-commits`
  - why: cerrar el cambio con evidencia reproducible y entregar al consumidor posterior hechos verificados, sin adelantar README ni promesas de frescura remota.
  - learn: un handoff útil distingue intención de evidencia: los commits son contra la tracking ref local y un servidor distinto sólo informa conteos no disponibles.
  - architecture: los tests permanecen aislados con snapshots/fakes y el handoff es un artefacto OpenSpec dependiente de `verify-report.md`, no una fuente de comportamiento ni un cambio de producto.
  - avoid: repositorios/remotos reales, red o mutaciones Git en pruebas; editar README; describir `equal` como sincronía remota viva; incluir installer, updater, Engram, Homebrew o refactors ajenos.
  - acceptance: la matriz cubre clean/staged/unstaged/untracked/mixed/rename, equal/ahead/behind/diverged/no-upstream/detached/loading/uncomputable/offline/error/server-changed, generaciones e invalidate, en es/en y 80/60/40; aserta que `MM + ??` es `entries=2` aunque categorías sumen 3, que diverged conserva ambos conteos, que timeout no es offline y que render no invoca el runner. Tras `bun test tests/banner-git-semantics.test.ts` y `bun test` aceptados en VERIFY, `handoff.md` registra copy/anchuras, unidades porcelain/upstream, semántica server-changed, ausencia de fetch/mutación e installer excluido; no edita README.
  - rollback: eliminar el handoff y su cobertura de regresión no toca código ni documentación de usuario; cualquier rollback funcional sigue los work units anteriores.
  - verify: `bun test && bun test tests/banner-git-semantics.test.ts`
  - forecast: producción 0 líneas; tests separados, estimación ≤180 líneas; handoff ≤60 líneas; cada unidad permanece ≤400 líneas y no decide topología de PR.
