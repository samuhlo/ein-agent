status: complete
change: runtime-session-launch-plan-foundation
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La construcción y autenticación de planes de lanzamiento recibe un dueño independiente antes de retirar su copia histórica.

## // 001. QUÉ CAMBIA

- Añade `runtime-session-launch-plan.ts` con argv cerrados, resolución de ejecutables y aislamiento de entorno.
- Conserva temporalmente el constructor original en la fachada.
- Prueba la paridad de las decisiones de argv y ejecutable.

## // 002. CÓMO FUNCIONA POR DENTRO

El dueño nuevo valida estado e intención, resuelve solo binarios conocidos y firma cada plan en memoria. La ejecución posterior puede comprobar que recibe el mismo objeto sin mutaciones.

## // 003. CÓMO PROBARLO

- `bun test tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 56 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

Existe una duplicación deliberada durante un único escalón. La siguiente PR reexporta este dueño desde la fachada y retira el constructor anterior.
