status: complete

## Completed

La marca está en las tres puertas del producto con la misma composición, la
portada de `ein` agrupa su menú y nombra el trabajo en curso, y el foco del
prompt del instalador vuelve a significar algo.

- **Una sola placa.** `placaRows` vive en `ein-tv.ts`, con el aparato. La
  consumen el banner de Pi, el splash, la portada y el instalador; antes cada
  superficie la componía por su cuenta o no la tenía.
- **La portada.** `homeTopLines` decide qué cabe: aparato más contexto cuando hay
  altura, contexto solo cuando no. `buildDashboard` reparte sus filas en
  `arrancar`, `continuar` y `taller` sin mover ninguna ni cambiar un atajo.
- **El instalador.** `bannerStatic` dibuja la placa; `RUNTIME_PROMPT_OPTIONS` sale
  a un módulo puro, sin color propio y con pistas que dicen la consecuencia.

## Files changed
`ein-pi/agent/lib/ein-tv.ts`
`ein-pi/agent/lib/ein-tv-preview.ts`
`ein-pi/agent/lib/terminal-app.ts`
`ein-pi/agent/extensions/ein-banner.ts`
`ein-pi/agent/surfaces/terminal-chrome.ts`
`ein-pi/agent/surfaces/terminal-theme.ts`
`ein-pi/agent/surfaces/terminal-splash.ts`
`ein-pi/agent/surfaces/terminal-dashboard-view.tsx`
`installer/src/cli/runtime-options.ts`
`installer/src/cli/runtime-prompt.ts`
`installer/src/tui/banner.ts`
`tests/ein-tv.test.ts`
`tests/terminal-chrome.test.ts`
`tests/terminal-app.test.ts`
`tests/installer-runtime-options.test.ts`
`tests/installer-runtime-menu.test.ts`

## TDD Cycle Evidence

Postura registrada en `preflight.json`: strict TDD ON.

| Contrato | RED | GREEN / TRIANGULATE / REFACTOR | Comando final |
|---|---|---|---|
| La placa y el contexto son líneas del chrome | `bun test ./tests/terminal-chrome.test.ts` falló al importar: `Export named 'contextLines' not found`. | GREEN con `brandLines` y `contextLines`. TRIANGULATE: sin versión que enseñar la placa no dibuja una fila vacía; una ruta de 400 caracteres se recorta sin desbordar. REFACTOR: `brandLines` pasó a delegar en `placaRows`. | `bun test ./tests/terminal-chrome.test.ts` — 23 pass. |
| El dashboard agrupa sin mover filas | `bun test ./tests/terminal-app.test.ts` — 2 fallos: no había más de una sección y había filas fuera de sección. | GREEN con tres secciones. TRIANGULATE: el orden de atajos se fija explícitamente, y los contratos previos («la primera fila arranca Pi», «cada atajo llega a su fila») siguen verdes. | `bun test ./tests/terminal-app.test.ts` — 69 pass. |
| La placa es una composición del aparato | `bun test ./tests/ein-tv.test.ts` falló: `placaRows` no existía. | GREEN. TRIANGULATE: sin sitio se apila, sin tag no se reserva fila, y cada corte apoya el texto contra su pantalla y no contra las tapas. REFACTOR: las cuatro superficies pasaron a consumirla. | `bun test ./tests/ein-tv.test.ts` — 28 pass. |
| Las opciones de runtime no traen color propio | `bun test ./tests/installer-runtime-options.test.ts` falló: el módulo no existía. | GREEN con `runtime-options.ts`. TRIANGULATE: ni etiqueta ni pista llevan ANSI, y cada pista nombra el launcher que instala. | `bun test ./tests/installer-runtime-options.test.ts` — 4 pass. |
| La portada cede por alto | `bun test ./tests/terminal-chrome.test.ts` falló: `homeTopLines` no existía. | GREEN con umbral de 34 filas. TRIANGULATE: a 18, 24, 30, 40 y 60 filas la portada nunca pasa de un tercio de la pantalla y toda línea mide el ancho pedido. | `bun test ./tests/terminal-chrome.test.ts` — 23 pass. |

### El fallo que cazó el ciclo

Los tres contratos de PTY real (`tests/terminal-app-pty.test.ts`) se pusieron en
rojo al montar la placa en la portada: en un terminal de 24 filas el aparato se
comía el menú y la pantalla dejaba de responder al atajo antes de que expirara el
plazo del test. De ahí salió `homeTopLines` y su umbral. Con él, el conjunto de
fallos vuelve a ser exactamente el de `origin/main`.

## Verification
- `bun test` — 2501 pass. `origin/main` limpio da 2471 pass con los MISMOS 15
  fallos y 10 errores: el conjunto es idéntico, comprobado con `diff`.
- `bun run typecheck` — PASS. `cd installer && bun run typecheck` — PASS.
- Render de la portada con los módulos reales a 40 y a 24 filas: 32 y 23 filas
  respectivamente, sin desbordes.
