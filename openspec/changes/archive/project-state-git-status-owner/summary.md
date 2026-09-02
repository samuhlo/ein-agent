status: complete
change: project-state-git-status-owner
work_groups: 1
verification_status: pass

## // 000. RESUMEN

El lector de proyecto usa ya el parser Git independiente y deja de conservar una segunda implementación.

## // 001. QUÉ CAMBIA

- Conecta `project-state.ts` con `project-state-git-status.ts`.
- Retira el parser histórico del agregado.
- Comparte también la validación de identificadores y el orden estable.

## // 002. CÓMO FUNCIONA POR DENTRO

El lector ejecuta Git y entrega los bytes porcelain al parser puro. Solo si el resultado es completo continúa construyendo cambios e identidad.

## // 003. CÓMO PROBARLO

- `bun test tests/shared-project-state.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 45 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

El parser estricto conserva el comportamiento fail-closed ante cualquier registro que no reconozca.
