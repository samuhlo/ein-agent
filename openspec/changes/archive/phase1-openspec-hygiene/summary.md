# Summary — phase1-openspec-hygiene

status: complete
change: phase1-openspec-hygiene
work_groups: 3
verification_status: pass

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
- verify: `bun test tests/sdd-close.test.ts tests/apply-corpus-frozen.test.ts tests/apply-packet-compile.test.ts tests/openspec-archive-hygiene.test.ts`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`

## Política

Los artefactos completos existen mientras el cambio está activo. Al cerrarlo,
`summary.md` se convierte en su registro duradero y el resto se elimina.
