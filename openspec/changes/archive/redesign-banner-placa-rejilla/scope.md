# Scope: redesign-banner-placa-rejilla

## Qué se toca

- `ein-pi/agent/lib/banner-panel.ts` — sección `grid`: dos bloques de campos en paralelo dentro del mismo ancho de panel.
- `ein-pi/agent/lib/ein-tv.ts` — el corte `compact` pierde las patas.
- `ein-pi/agent/extensions/ein-banner.ts` — placa horizontal (mueble + marca a su derecha), corte `cabinet`, y `SISTEMA`/`SESION` en rejilla.
- `ein-pi/agent/surfaces/terminal-splash.ts` e `installer/src/tui/banner.ts` — el corte más grande pasa a ser `cabinet`.
- `tests/banner-panel.test.ts`, `tests/ein-tv.test.ts` — contratos de la rejilla y del corte sin patas.

## Qué NO se toca

- El contenido del panel: mismos campos, mismos valores, mismo orden de secciones.
- La cascada de apertura y sus tiempos (`PANEL_FRAME_TICKS`, `PANEL_ROW_TICKS`, `PANEL_LEADER_TICKS`).
- `composeColumns` / `composedWidth`: siguen exportados y testeados, sin usar por el banner.
- El corte `full` sigue existiendo en `ein-tv.ts` y en su suite; solo deja de elegirse.

## Capacidad de prueba

`bun test` en la raíz. `tests/banner-panel.test.ts` y `tests/ein-tv.test.ts` cubren la geometría; ambos módulos son puros y no necesitan terminal.

## Spec delta declaration
spec_delta: none
spec_delta_reason: Cambia la geometria del banner de arranque y del aparato que dibuja: filas, columnas y orden visual. No toca comandos, estado persistido ni formato de release.
