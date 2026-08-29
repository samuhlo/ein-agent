# Summary — phase1-openspec-hygiene

status: complete
change: phase1-openspec-hygiene

## Resultado

OpenSpec separa desde ahora el trabajo vivo de la historia: los cambios activos conservan evidencia completa durante su validación y los cerrados guardan exclusivamente `summary.md`. Los dos registros entregados que seguían apareciendo como activos quedaron condensados y cerrados.

## Cambios

- `sdd-close` materializa un staging con el resumen, lo promociona y después elimina el activo.
- El lifecycle de cierre deja de persistir recibos de memoria en el archivo.
- El corpus congelado y sus pruebas recuperan evidencia histórica desde Git cuando ya no existe en HEAD.
- Los 76 cambios previos y los dos residuos se compactaron; un test impide que vuelva la acumulación.

## Verificación

- Suite completa: 2878 pass, 0 fail.
- Typecheck raíz e installer: pass.
- Contratos focalizados de cierre, archivo, corpus y packets: 74 pass.

## Política

Git conserva la evidencia exhaustiva. El árbol actual conserva contratos vigentes, trabajo activo y un resumen útil por cambio cerrado.
