status: complete

## Completed

La placa y la rejilla están implementadas y el banner completo mide 30 filas × 62
columnas, catorce menos que las 44 de antes, sin pedir una columna más.

- **Rejilla en el módulo puro.** `banner-panel.ts` acepta una sección `grid` con
  exactamente dos columnas de `PANEL_W / 2`. Cada mitad se rellena o se recorta a
  `GRID_W` antes de unirse, así que la invariante del panel (toda línea mide
  `PANEL_W`) se cumple pase lo que pase con la etiqueta o el valor. La numeración
  `// NNN.` sale de izquierda a derecha.
- **El aparato es un rectángulo.** `ein-tv.ts` deja de emitir las patas en
  `compact`. `full` conserva antena y patas y su suite, pero ninguna superficie
  lo elige ya.
- **La placa.** `ein-banner.ts` pone el subtítulo y las versiones al costado del
  mueble, apoyados en filas concretas por corte (`BAND_ANCHORS`). Si el mueble
  más el aire más el texto no caben en el terminal, el banner vuelve a apilarse
  en vez de recortar la marca.
- **Un solo aparato.** `terminal-splash.ts` y `installer/src/tui/banner.ts`
  pasan de `full` a `cabinet`, para que el televisor sea el mismo en las tres
  superficies.

## Files changed
`ein-pi/agent/lib/banner-panel.ts`
`ein-pi/agent/lib/ein-tv.ts`
`ein-pi/agent/extensions/ein-banner.ts`
`ein-pi/agent/surfaces/terminal-splash.ts`
`installer/src/tui/banner.ts`
`tests/banner-panel.test.ts`
`tests/ein-tv.test.ts`

## TDD Cycle Evidence
No aplica: la postura registrada en `preflight.json` es `strict_tdd: off`. Los
contratos se añadieron junto a la implementación, no antes.

Contratos nuevos en `tests/banner-panel.test.ts`:
- la rejilla no rompe el ancho: dos mitades exactas suman `PANEL_W`
- numera de izquierda a derecha: `// 000.` y luego `// 001.`
- cada mitad tiene su propia sangría de etiqueta (13 y 31+13)
- la columna corta se queda en blanco por abajo sin descuadrar
- un valor largo se recorta en su mitad, no invade la vecina

Contrato ampliado en `tests/ein-tv.test.ts`: ningún corte salvo `full` emite
antena (`╲`) ni patas (`▀`).

## Verification
- `bun test ./tests/banner-panel.test.ts ./tests/ein-tv.test.ts` — 39 passed, 0 failed.
- Medición de geometría con los módulos reales, de 120 a 40 columnas: 30 filas y
  62 columnas de 66 en adelante; por debajo de 59 el banner se apila y ninguna
  anchura desborda su terminal.
