status: complete
change: runtime-session-identity-foundation
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La identidad de proyecto y las referencias opacas de sesión reciben un dueño independiente antes de retirar su copia histórica.

## // 001. QUÉ CAMBIA

- Añade `runtime-session-identity.ts` con validación de proyecto, referencias opacas y resolución acotada.
- Conserva temporalmente el comportamiento original en `runtime-session-adapters.ts`.
- Prueba que el dueño nuevo produce los mismos contratos públicos.

## // 002. CÓMO FUNCIONA POR DENTRO

El módulo deriva una identidad pública mínima, valida su vínculo con Git y resuelve hashes irreversibles recorriendo solo el almacén acotado del runtime correspondiente.

## // 003. CÓMO PROBARLO

- `bun test tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 55 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

Existe una duplicación deliberada durante un único escalón. La siguiente PR conecta el adaptador al dueño nuevo y elimina la copia.
