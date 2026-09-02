status: complete
change: project-state-contract
work_groups: 1
verification_status: pass

## // 000. RESUMEN

El estado del proyecto conserva una única API pública, pero su vocabulario versionado ya tiene un dueño puro separado de los lectores de Git, OpenSpec, EIN y runtimes.

## // 001. QUÉ CAMBIA

- Añade `project-state-contract.ts` con el esquema y todos sus tipos públicos.
- Mantiene `project-state.ts` como ruta compatible mediante reexport.
- Ata la versión exportada por la fachada a la versión del contrato.

## // 002. CÓMO FUNCIONA POR DENTRO

Los consumidores siguen importando `project-state.ts`. Esa fachada importa el contrato para construir el agregado y lo reexporta íntegro, mientras los siguientes lectores podrán depender del contrato sin crear ciclos con el coordinador.

## // 003. CÓMO PROBARLO

- `bun test tests/shared-project-state.test.ts`
- `bun test`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

La versión del esquema mantiene identidad entre contrato y fachada; las proyecciones existentes conservan sus resultados.

## // 005. RIESGOS

La ruta histórica permanece deliberadamente: retirarla obligaría a migrar decenas de consumidores sin aportar una frontera nueva.
