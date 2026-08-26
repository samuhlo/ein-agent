## // 000. RESUMEN
El banner de arranque de Pi pasa de 44 filas a 30 sin pedir una columna más. El
televisor pierde la antena y las patas, la marca se pone a su costado en vez de
debajo, y `SISTEMA` y `SESION` se dibujan en paralelo dentro del mismo ancho de
panel.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/banner-panel.ts`: sección `grid` con dos columnas de
  `PANEL_W / 2`, y `GRID_VALUE_W` exportado.
- `ein-pi/agent/lib/ein-tv.ts`: el corte `compact` deja de emitir su fila de
  patas. `full` se conserva con antena y patas, ya sin usarse.
- `ein-pi/agent/extensions/ein-banner.ts`: placa horizontal, corte `cabinet`, y
  `SISTEMA`/`SESION` en rejilla.
- `ein-pi/agent/surfaces/terminal-splash.ts` e `installer/src/tui/banner.ts`: el
  corte más grande pasa de `full` a `cabinet`.
- `tests/banner-panel.test.ts` y `tests/ein-tv.test.ts`: contratos de la rejilla
  y del aparato rectangular.
- `spec_delta: none` — no hay contrato observable que cambie.

## // 002. CÓMO FUNCIONA POR DENTRO
- La invariante del panel es que toda línea mide `PANEL_W`. La rejilla la
  sostiene rellenando o recortando cada mitad a `GRID_W` antes de unirlas: dos
  mitades exactas suman el ancho entero pase lo que pase con etiqueta y valor.
- La cascada de apertura escalona por índice de fila y no conoce las secciones,
  así que la rejilla se emite como filas normales con las dos mitades dentro. Por
  eso la animación no se toca, y la numeración `// 000.` / `// 001.` sale de
  izquierda a derecha.
- La placa engancha subtítulo y versiones a filas concretas del mueble
  (`BAND_ANCHORS`), distintas por corte. Si el mueble más el aire más el texto no
  caben en el terminal, `banded` sale falso y el banner vuelve a apilarse.
- Quitar antena y patas cierra además un defecto: el banner centra cada fila por
  su cuenta, y esas piezas son más estrechas que el mueble, así que salían
  desplazadas. Un rectángulo no tiene ese problema.

## // 003. DECISIONES
- Sección `grid` nueva en vez de un flag sobre `fields`: deja intacta la
  animación, que solo sabe contar filas.
- Ajuste final por celda en vez de confiar en la aritmética: es lo que hace la
  invariante robusta ante una etiqueta larga.
- `full` se conserva con su tipo, su ancho y su suite; solo deja de elegirse.
- El mismo aparato en las tres superficies: el televisor es una marca única, y
  dejarlo con antenas en el splash y sin ellas en el banner sería incoherente.

## // 004. VERIFICACIÓN
- `bun test ./tests/banner-panel.test.ts ./tests/ein-tv.test.ts` — 39 pass, 0 fail.
- `bun test` en la rama — 2476 pass. `origin/main` limpio da 2471 pass con los
  MISMOS 15 fallos y 10 errores: son preexistentes, no de este cambio.
- `bun run typecheck` — PASS. `cd installer && bun run typecheck` — PASS.
- Geometría medida con los módulos reales de 120 a 40 columnas: 30 filas y 62
  columnas de 66 en adelante, placa hasta 59, apilado por debajo, sin desbordes.

## // 005. PENDIENTE / RIESGOS
- Un valor de la rejilla tiene 18 columnas antes de recortarse, no 49. Hoy caben
  todos; un modo o una persona con nombre largo se cortaría antes que ahora.
- El banner minimal enseña ahora también las versiones, porque van en la banda y
  no cuestan fila. Aun así baja de 15 filas a 11.
- El splash de Pi y el banner del instalador también pierden antena y patas.
- Nada de esto se ve hasta reinstalar: Ein corre la copia instalada.
