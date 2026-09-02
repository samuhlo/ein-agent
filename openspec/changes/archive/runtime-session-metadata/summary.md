status: complete
change: runtime-session-metadata
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La traducción de resultados de sesión a metadatos de proyecto deja de vivir dentro del adaptador.

## // 001. QUÉ CAMBIA

- Añade `runtime-session-metadata.ts` como traductor puro hacia `ProjectRuntimeMetadata`.
- Conserva `toProjectRuntimeMetadata` en la fachada mediante reexport.
- Prueba que fachada y traductor son la misma función.

## // 002. CÓMO FUNCIONA POR DENTRO

El traductor convierte capacidades, referencias opacas y fallos seguros en el vocabulario existente de ProjectState. No lee disco, no persiste y no copia datos privados del runtime.

## // 003. CÓMO PROBARLO

- `bun test tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 58 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

La tabla de errores conserva las categorías anteriores. Las pruebas triangulan todas las familias de fallo y limitan referencias malformadas o duplicadas.
