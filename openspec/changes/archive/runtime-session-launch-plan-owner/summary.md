status: complete
change: runtime-session-launch-plan-owner
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La fachada de sesiones delega la construcción y autenticación de planes de lanzamiento en su dueño independiente.

## // 001. QUÉ CAMBIA

- Retira argv, resolución de ejecutables, aislamiento y snapshots de `runtime-session-adapters.ts`.
- Conserva los mismos exports públicos mediante reexports.
- Conecta la ejecución a la autenticación del dueño nuevo.

## // 002. CÓMO FUNCIONA POR DENTRO

La fachada ya no decide cómo se arranca un runtime. El constructor genera el plan y guarda su fotografía privada; el ejecutor consulta al mismo módulo antes de abrir un proceso.

## // 003. CÓMO PROBARLO

- `bun test tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 56 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

El contrato público y los cuatro argv permitidos no cambian. Las pruebas de identidad impiden que la fachada recupere otra implementación.
