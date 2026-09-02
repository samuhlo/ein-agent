status: complete
change: runtime-session-launch-execution-foundation
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La ejecución de planes recibe un dueño independiente antes de retirar su copia histórica.

## // 001. QUÉ CAMBIA

- Añade `runtime-session-launch-execution.ts` con spawn, cancelación y resultados normalizados.
- Conserva temporalmente intacto el ejecutor de la fachada.
- Prueba directamente la normalización de salidas y señales.

## // 002. CÓMO FUNCIONA POR DENTRO

El módulo acepta solo planes autenticados, ejecuta sin shell y traduce cualquier terminación a un vocabulario pequeño que nunca incluye stdout, stderr ni detalles de excepciones.

## // 003. CÓMO PROBARLO

- `bun test tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 57 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

Existe una duplicación deliberada durante un único escalón. La siguiente PR conecta el export público y elimina la copia.
