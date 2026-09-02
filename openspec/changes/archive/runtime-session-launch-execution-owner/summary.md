status: complete
change: runtime-session-launch-execution-owner
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La fachada de sesiones delega la apertura y observación de procesos en su dueño independiente.

## // 001. QUÉ CAMBIA

- Retira spawn, cancelación y normalización de `runtime-session-adapters.ts`.
- Conserva los exports públicos mediante reexports.
- Hace que todos los consumidores ejecuten la misma función del dueño nuevo.

## // 002. CÓMO FUNCIONA POR DENTRO

La fachada entrega un plan autenticado; el ejecutor dedicado abre el proceso sin shell y devuelve solo resultados públicos acotados. Una prueba de identidad impide recuperar una segunda implementación.

## // 003. CÓMO PROBARLO

- `bun test tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 57 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

El contrato público no cambia. El riesgo de carrera entre cancelación y salida permanece cubierto por las pruebas existentes en el nuevo dueño.
