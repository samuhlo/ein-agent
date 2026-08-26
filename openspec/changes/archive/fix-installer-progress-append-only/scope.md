# Scope: fix-installer-progress-append-only

## Qué se toca

- `installer/src/tui/progress-view.ts` — la pantalla pasa a append-only: una
  línea por paso al cerrarse y ni un movimiento de cursor a filas anteriores.
- `installer/src/tui/progress.ts` — se retira `progressLines`, que componía la
  lista repintada; sobrevive `stepMark`, que es lo que la vista coloca.
- `tests/installer-plan-progress.test.ts` — los contratos, invertidos.

## Qué NO se toca

- El modelo del avance: sigue conociendo el plan entero, y de ahí sale el total
  del contador. Sus reglas (el contador sube al cerrar, no rebasa, ignora eventos
  ajenos) quedan intactas.
- El oyente del ejecutor y el journal.
- Los trece puntos de `install.ts` que escriben durante los handlers: precisamente
  la corrección consiste en dejar de pelearse con ellos.

## Capacidad de prueba

`bun test` en la raíz. La vista recibe su salida inyectada, así que se comprueba
sin terminal qué escribe exactamente y qué escapes emite.

## Spec delta declaration
spec_delta: none
spec_delta_reason: Cambia como se pinta el avance de la instalacion. No altera que se instala, en que orden, ni contratos de release o journal.
