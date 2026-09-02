status: complete
change: project-state-openspec
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La selección y lectura del cambio SDD activo ya tienen un dueño separado del agregado de estado.

## // 001. QUÉ CAMBIA

- Añade `project-state-openspec.ts`.
- Mueve allí selección, procedencia, calidad, artefactos y bloqueos OpenSpec.
- El coordinador delega y una prueba compara ambas rutas.

## // 002. CÓMO FUNCIONA POR DENTRO

El lector valida primero la raíz de cambios, evita adivinar entre varios cambios activos y proyecta el router determinista en el contrato público.

## // 003. CÓMO PROBARLO

- `bun test tests/shared-project-state.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 41 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

La raíz legacy sigue siendo una procedencia explícita; este refactor no la retira ni altera su prioridad.
