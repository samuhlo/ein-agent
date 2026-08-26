status: complete

## Completed

El instalador enseña su plan y va tachándolo. Los pendientes se pintan desde el
primer fotograma, con contador y barra, y los spinners de los handlers dejan de
pelearse con la lista: alimentan la fila que corre.

- `executeInstallPlan` acepta un oyente opcional y emite `start`, `done` y
  `abandoned`. No cambia una sola decisión: hay un contrato que fija que con
  oyente y sin él el resultado es idéntico.
- `executeInstallPlanJournaled` lo deja pasar; el journal sigue sin enterarse.
- `progress.ts` es el modelo puro: plan + eventos → líneas.
- `progress-view.ts` mantiene el modelo, repinta solo con TTY y expone un spinner
  con el mismo contrato que `p.spinner`.
- `install.ts` construye la pantalla, se la pasa al ejecutor, y manda los tres
  spinners de los handlers por `effects.spinner`, que existía para esto.

## Files changed
`installer/src/core/install-executor.ts`
`installer/src/core/install-journal.ts`
`installer/src/tui/progress.ts`
`installer/src/tui/progress-view.ts`
`installer/src/cli/install.ts`
`tests/installer-plan-progress.test.ts`

## TDD Cycle Evidence

Postura registrada en `preflight.json`: strict TDD ON.

| Contrato | RED | GREEN / TRIANGULATE / REFACTOR | Comando final |
|---|---|---|---|
| El ejecutor cuenta lo que hace | `bun test ./tests/installer-plan-progress.test.ts` falló al importar: `progress.ts` no existía. Con el módulo puesto, 3 fallos más: no se emitía nada. | GREEN con el oyente opcional. TRIANGULATE: ningún `start` se queda sin cierre; un paso que falla se cierra como fallo; lo abandonado se declara; con oyente y sin él el resultado es igual. | `bun test ./tests/installer-plan-progress.test.ts` — 16 pass. |
| El contador no miente | 3 fallos: el total contaba el inventario entero y el contador no se movía. | GREEN con `startProgress`/`advanceProgress`. TRIANGULATE: eventos repetidos no suman dos veces, un evento de un paso ajeno al plan se ignora entero, y solo un paso figura corriendo. | Mismo comando — 16 pass. |
| Sin terminal no se repinta | Falló al importar: `progress-view.ts` no existía. | GREEN. TRIANGULATE: con TTY hay escapes de cursor y la salida no crece sin fin; sin TTY hay una línea por paso cerrado y ni un escape; el spinner de la pantalla no escribe hasta que el paso cierra. | Mismo comando — 16 pass. |

### Lo que cazó el ciclo

El fixture del plan tenía `bun: true`, así que `shared.dependency.bun` quedaba
fuera del plan ejecutable y dos contratos apuntaban a un paso inexistente — que
es exactamente el caso que el requisito 2 defiende. Se corrigió el fixture y el
contrato de «un evento de un paso que no está en el plan» quedó cubierto de
verdad, no por accidente.

## Verification
- `bun test` — 2517 pass. Conjunto de fallos IDÉNTICO al de `origin/main`
  (15 fallos, 10 errores), comprobado con `diff`.
- `bun run typecheck` — PASS. `cd installer && bun run typecheck` — PASS.
- Render del avance con los módulos reales: 13 pasos ejecutables de un inventario
  de 16, contador `2 / 13`, y `migrar instalación previa` correctamente fuera de
  la lista porque el plan lo descarta.
