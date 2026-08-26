# Scope: redesign-launcher-installer-shell

## Qué se toca

- `ein-pi/agent/lib/terminal-app.ts` — `buildDashboard` reparte sus nueve filas
  en secciones por verbo (`arrancar`, `continuar`, `taller`) y acorta las
  etiquetas que la sección ya nombra.
- `ein-pi/agent/surfaces/terminal-chrome.ts` — dos primitivas puras nuevas: la
  placa de marca y el bloque de contexto del proyecto.
- `ein-pi/agent/surfaces/terminal-dashboard-view.tsx` — la portada monta placa y
  contexto; las demás vistas conservan su cabecera.
- `installer/src/tui/banner.ts` — la marca pasa a placa, igual que el banner de
  Pi.
- `installer/src/cli/runtime-prompt.ts` — las etiquetas dejan de venir pintadas,
  y las pistas dicen la consecuencia.
- `tests/terminal-chrome.test.ts`, `tests/terminal-app.test.ts`,
  `tests/installer-runtime-menu.test.ts` — los contratos de todo lo anterior.

## Qué NO se toca

- El conjunto de filas del dashboard, su orden y sus teclas: mismas nueve,
  mismos atajos, `Arrancar Pi` sigue siendo la primera bajo el cursor.
- El avance guiado por plan del instalador. Es la tercera pieza del diseño y va
  en una entrega encadenada aparte: obliga a pasar un reporter por las 772
  líneas de `install.ts` y mezcla dos riesgos distintos en la misma revisión.
- La geometría del aparato (`ein-tv.ts`) y el banner de Pi, ya entregados.
- El vocabulario de tonos, marcadores y la gramática `// NNN.`.

## Capacidad de prueba

`bun test` en la raíz. `terminal-chrome.ts` y `terminal-app.ts` son módulos
puros; `banner.ts` y `runtime-prompt.ts` del instalador ya tienen inyección de
dependencias y suite propia. Nada de esto necesita un terminal.

## Spec delta declaration
spec_delta: none
spec_delta_reason: Reorganiza la presentacion del launcher y del instalador. No cambia comandos, teclas, ficheros de estado ni el contrato de release.
