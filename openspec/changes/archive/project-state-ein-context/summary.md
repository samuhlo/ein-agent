status: complete
change: project-state-ein-context
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La inspección de `EIN.md` deja de convivir con las demás fuentes del estado del proyecto.

## // 001. QUÉ CAMBIA

- Añade `project-state-ein.ts`.
- Mueve allí la lectura de límites curados y automáticos.
- El agregado delega sin reescribir el fichero inspeccionado.

## // 002. CÓMO FUNCIONA POR DENTRO

El lector distingue ausencia, error de lectura, contenido incompleto y documento actual. La zona curada y los marcadores generados conservan señales separadas.

## // 003. CÓMO PROBARLO

- `bun test tests/shared-project-state.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 42 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

La prueba conserva la política de solo lectura: detectar deriva no autoriza a refrescar `EIN.md` durante la inspección.
