## // 000. RESUMEN
Se reemplazó el `○N` ambiguo y el `pull` impreciso del banner por una semántica Git explícita y bilingüe. El cambio queda cerrado como completitud SDD; no incluye README, entrega ni release.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/banner-git.ts`: modelo independiente `HEAD`/`LOCAL`/`UPSTREAM`, parser porcelain, relación upstream, probe read-only, controller cacheado y renderer responsive.
- `ein-pi/agent/extensions/ein-banner.ts`: integración de filas semánticas y repaint diferido, conservando la UI del installer fuera del cambio.
- `tests/banner-git-semantics.test.ts`: matriz fake de parser, renderer, procesos y lifecycle.
- `handoff.md`: hechos verificados para `readme-release-ia`; README permanece intacto.

## // 002. CÓMO FUNCIONA POR DENTRO
El estado local cuenta entradas lógicas de `git status --porcelain=v1 -z`: staged, unstaged y untracked pueden solaparse (`MM`), mientras rename/copy consume su path origen sin duplicar la entrada. El estado upstream calcula commits `ahead`/`behind` contra la ref local configurada (`HEAD...@{upstream}`), distinguiendo synced, ahead, behind, diverged, no-upstream, detached, loading y errores.

Un `ProcessRunner` inyectado ejecuta sólo lecturas; no hay fetch ni mutación. El probe publica primero el estado local y, opcionalmente, comprueba `ls-remote`: si el servidor cambió el OID, muestra `server changed/counts unavailable`, sin inventar conteos. El controller conserva snapshot y generaciones, ignora resultados obsoletos, `invalidate()` suprime callbacks tardíos y render sólo lee caché.

El renderer produce filas `HEAD`, `LOCAL` y `UPSTREAM` en español/inglés: variantes para 80, 60 y 40 columnas preservan etiquetas y `commits`; `<40` mantiene el skip. En narrow, el agregado local se etiqueta como `entradas locales`/`local entries`, nunca como commits.

## // 003. DECISIONES
- Se abandonaron `○N` y `pull`: no expresaban unidades ni distinguían behind de diverged.
- La relación usa tracking refs locales, por lo que puede estar obsoleta sin fetch; no se afirma sincronización remota viva.
- La verificación remota sólo aporta frescura; errores genéricos no se traducen en `offline`.
- El primer VERIFY halló un fallo CRITICAL: las filas Git sólo salían en modo full. La remediación conectó `addGitBannerRows()` también a minimal (60 y 40) y añadió prueba de contrato de esas ramas.

## // 004. VERIFICACIÓN
- `timeout 300 bun test`: **pasó**, 576 tests, 1.728 assertions, 0 fallos.
- `timeout 300 bun test tests/banner-git-semantics.test.ts`: **pasó**, 48 tests, 346 assertions, 0 fallos.
- `timeout 300 git diff --check`: **pasó**, sin errores.
- `behavior_coverage: partial`: no hubo TUI real, repositorio/remoto real, red, build ni automatización visual; la evidencia es determinista con fakes.

## // 005. PENDIENTE / RIESGOS
- Producción: `+466/-62` (528 líneas cambiadas), 128 sobre el pronóstico de 400; tests `+386`, handoff `+25`.
- `readme-release-ia` puede documentar sólo el handoff factual y no prometer frescura remota ni evidencia TUI real.
- Installer excluido; no se hizo README, delivery, publicación ni release. Cierre limitado a completar SDD.
