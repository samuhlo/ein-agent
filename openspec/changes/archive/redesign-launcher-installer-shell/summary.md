## // 000. RESUMEN
El aparato que ya era la marca del banner de Pi está ahora en las otras dos
puertas del producto —la portada de `ein` y el arranque del instalador— con una
sola composición compartida. De paso, la portada agrupa su menú por verbo, nombra
el cambio SDD en curso, y el foco del prompt del instalador vuelve a pintar.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/ein-tv.ts`: `placaRows`, `BAND_ANCHORS`, `BAND_GUTTER` y un
  tono `label` para el texto que ahora acompaña al aparato.
- `terminal-chrome.ts`: `brandLines`, `contextLines` y `homeTopLines`.
- `terminal-app.ts`: el dashboard reparte sus filas en `arrancar`, `continuar` y
  `taller`.
- `terminal-dashboard-view.tsx`: la portada monta la cabecera medida; las demás
  vistas conservan la suya.
- `terminal-splash.ts`, `ein-banner.ts`, `installer/src/tui/banner.ts`: las tres
  pasan a consumir `placaRows`.
- `installer/src/cli/runtime-options.ts`: módulo puro nuevo con las tres opciones.
- `spec_delta: none`.

## // 002. CÓMO FUNCIONA POR DENTRO
- `placaRows` compone mueble más texto y decide sola cuándo no cabe: si el ancho
  no da para aparato, aire y el texto más largo, devuelve la forma apilada. La
  regla es que cede la composición, nunca la marca.
- `homeTopLines` aplica la misma regla al ALTO. El aparato son ocho filas; con
  una pantalla de veinte se come el menú, así que por debajo de 34 filas la
  portada se queda solo con su barra de contexto.
- El cambio SDD en curso va al chrome y no a una fila. Una fila es una acción con
  atajo, caería bajo el cursor y desplazaría a «arrancar Pi», que es lo primero
  que el usuario viene a hacer.
- Las secciones nombran el verbo, así que la etiqueta deja de repetirlo:
  «arrancar › Pi», no «Arrancar Pi». El orden y los atajos no se mueven.
- Las opciones del instalador salen a un módulo sin dependencias. Llegaban
  envueltas en `gold(...)`, y el `concrete(...)` del prompt no puede tapar un
  ANSI interior: las tres salían amarillas con foco o sin él.

## // 003. DECISIONES
- Una composición en `ein-tv.ts` en vez de una por superficie: tres copias de la
  misma placa son tres sitios donde puede divergir.
- La decisión de altura vive en el chrome, no en la vista `.tsx`: es layout, y el
  layout se mide.
- Las opciones a un módulo puro: el resto del prompt cuelga del template
  empaquetado, y un contrato que no se puede ejecutar no es un contrato.
- El avance guiado por plan queda fuera. Es la tercera pieza del diseño y va
  encadenada: obliga a pasar un reporter por las 772 líneas de `install.ts`.

## // 004. VERIFICACIÓN
- `bun test` — 2501 pass. Conjunto de fallos IDÉNTICO al de `origin/main`
  (15 fallos, 10 errores), comprobado con `diff`.
- `bun run typecheck` — PASS. `cd installer && bun run typecheck` — PASS.
- Render de la portada con los módulos reales a 40 y a 24 filas.
- Ciclo estricto en cinco contratos, con el rojo de PTY que descubrió el problema
  de altura documentado en `apply-progress.md`.

## // 005. PENDIENTE / RIESGOS
- La portada no conoce su versión: la placa muestra el lema sin versiones.
- El umbral de 34 filas es un salto visible al redimensionar.
- Los 15 fallos preexistentes de la suite piden un build completo del binario.
