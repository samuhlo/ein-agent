status: complete
change: project-state-verification
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La frescura de la verificación ya se calcula fuera del coordinador general del estado.

## // 001. QUÉ CAMBIA

- Añade `project-state-verification.ts`.
- Mueve allí lectura, parseo y enlace del informe con la identidad Git.
- El agregado entrega OpenSpec y Git ya observados al nuevo dueño.

## // 002. CÓMO FUNCIONA POR DENTRO

Una verificación solo es actual cuando su referencia coincide con el estado Git completo. Evidencia ausente, antigua, inválida o ilegible conserva una calidad explícita y nunca se convierte en éxito.

## // 003. CÓMO PROBARLO

- `bun test tests/shared-project-state.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 43 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

La semántica fail-closed se conserva byte por byte; el corte no relaja estados legacy, stale o unbound.
