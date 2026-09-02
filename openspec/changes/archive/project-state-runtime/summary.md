status: complete
change: project-state-runtime
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La normalización pública de Pi y Claude deja de convivir con lectores de Git, OpenSpec y EIN.

## // 001. QUÉ CAMBIA

- Añade `project-state-runtime.ts` como dueño de defaults, vocabularios y filtros de privacidad.
- El coordinador delega las dos proyecciones de runtime en ese módulo.
- Una prueba compara la proyección ensamblada con el dueño directo.

## // 002. CÓMO FUNCIONA POR DENTRO

El módulo recibe metadatos ya observados y devuelve únicamente tokens públicos, ordenados y acotados. No busca sesiones, no ejecuta procesos y no conoce la interfaz.

## // 003. CÓMO PROBARLO

- `bun test tests/shared-project-state.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

Las 40 pruebas enfocadas y ambos typechecks pasan.

## // 005. RIESGOS

La política conserva exactamente sus vocabularios actuales; ampliar capacidades o razones sigue requiriendo una decisión de contrato separada.
