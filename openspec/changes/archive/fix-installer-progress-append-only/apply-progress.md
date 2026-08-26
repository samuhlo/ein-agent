status: complete

## Completed

La pantalla del avance ya no repinta. Una línea por paso al cerrarse, con su
posición en el plan, y un indicador vivo contenido en su propia línea. Ningún
movimiento de cursor a filas anteriores, con terminal o sin él.

- `progress-view.ts`: reescrita append-only. `announce` imprime la cabecera con
  el total una vez, `live` reescribe la línea actual con retorno de carro, y
  `settle` la cierra con el resultado y salta.
- `progress.ts`: se retira `progressLines`; sobrevive `stepMark`.

## Files changed
`installer/src/tui/progress-view.ts`
`installer/src/tui/progress.ts`
`tests/installer-plan-progress.test.ts`

## TDD Cycle Evidence

Postura registrada en `preflight.json`: strict TDD ON.

| Contrato | RED | GREEN / TRIANGULATE / REFACTOR | Comando final |
|---|---|---|---|
| Nunca se sube el cursor | 4 fallos tras invertir los contratos: los anteriores EXIGÍAN el repintado con escapes de cursor. | GREEN append-only. TRIANGULATE: se comprueba con TTY y sin él, y el indicador vivo usa retorno de carro pero nunca cursor arriba. | `bun test ./tests/installer-plan-progress.test.ts` — 20 pass. |
| Una línea por paso, con su posición | Incluido en los 4 fallos: no existía ni cabecera con total ni posición por línea. | GREEN. TRIANGULATE: un paso abandonado deja su línea con «no ejecutado», y la cabecera sale una sola vez pase lo que pase. | Mismo comando — 20 pass. |
| La línea no decide el ancho | El contrato de ancho apuntaba a la lista retirada. Reescrito sobre la vista, falló: al reescribirla me dejé el recorte fuera. | GREEN con `clip` en las dos rutas de escritura. | Mismo comando — 20 pass. |

### Evidencia de campo

El defecto se observó en una instalación real, no en test: la salida mostraba
bloques de lista apilados, el contador saltando `0/9 → 3/9 → 6/9` sin las filas
intermedias, y el informe del doctor partido. La causa se localizó contando los
puntos de escritura: **trece** `p.log.*` en `install.ts`, incluido
`p.log.message(renderReport(report))` dentro de `pi.verify-doctor`.

Tras el arreglo se rehízo el render con un handler escribiendo a mitad, y el
informe se intercala sin pisar nada.

## Verification
- `bun test` — 2690 pass, 0 fail.
- `bun run typecheck` — PASS. `cd installer && bun run typecheck` — PASS.
