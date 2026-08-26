# Scope: fix-probe-prerelease-identity

## Qué se toca

- `installer/src/core/binary-probe.ts` — la sonda lee la versión SemVer entera,
  sufijo de prerelease incluido.
- `installer/src/core/transaction.ts` — las dos rutas de fallo de `verifying`
  descartan el candidato y el snapshot, como ya hacía la siguiente.
- `tests/release-update-exec.test.ts`, `tests/release-update-integration.test.ts`
  — los contratos de ambas.

## Qué NO se toca

- El formato de `--version`: sigue emitiendo las dos líneas etiquetadas que el
  contrato de release ya fija.
- `verifyBinaryIdentity`: compara igual, contra la versión del release
  seleccionado. Lo que cambia es que ahora recibe la versión completa.
- El resto de rutas de fallo de la transacción y su journal.

## Capacidad de prueba

`bun test` en la raíz. `binary-probe.ts` es puro; la transacción ya se ejercita
de extremo a extremo en `release-update-integration.test.ts` con capacidades
reales sobre un directorio temporal.

## Spec delta declaration
spec_delta: none
spec_delta_reason: Corrige el parseo de una salida cuyo formato no cambia, y cierra una fuga de ficheros temporales. No altera comandos, contratos de release ni el journal.
