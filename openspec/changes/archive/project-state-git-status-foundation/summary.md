status: complete
change: project-state-git-status-foundation
work_groups: 1
verification_status: pass

## // 000. RESUMEN

El parser puro de `git status --porcelain=v2` queda preparado y probado antes de sustituir la implementación histórica.

## // 001. QUÉ CAMBIA

- Añade `project-state-git-status.ts`.
- Publica parseo y orden estable sin ejecutar Git ni leer contenido.
- Prueba rutas válidas y escapes fuera del repositorio.

## // 002. CÓMO FUNCIONA POR DENTRO

El parser acepta únicamente los cuatro registros previstos, valida estados y objetos Git, normaliza rutas relativas y marca cualquier forma dudosa como malformada.

## // 003. CÓMO PROBARLO

- `bun test tests/shared-project-state.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 44 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

Existe duplicación controlada durante un único escalón. La PR siguiente conecta el lector real y retira la copia histórica.
