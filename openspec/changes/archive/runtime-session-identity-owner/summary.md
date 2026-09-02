status: complete
change: runtime-session-identity-owner
work_groups: 1
verification_status: pass

## // 000. RESUMEN

El adaptador de sesiones delega la identidad de proyecto y las referencias opacas en su dueño independiente.

## // 001. QUÉ CAMBIA

- Retira la implementación duplicada de `runtime-session-adapters.ts`.
- Reexporta el contrato público anterior sin romper consumidores.
- Elimina una función muerta de referencia Pi y conecta listado, reanudación y lanzamiento al mismo dueño.

## // 002. CÓMO FUNCIONA POR DENTRO

La fachada conserva sus nombres públicos, pero las funciones son ahora las mismas instancias exportadas por `runtime-session-identity.ts`. Una prueba de identidad impide que reaparezca una segunda implementación.

## // 003. CÓMO PROBARLO

- `bun test tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 55 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

El contrato público no cambia. El riesgo está en una importación omitida; la prueba de identidad y los recorridos de listado, resume y launch cubren esa costura.
