status: complete
change: ein-general-commands-foundation
work_groups: 1
verification_status: pass

## // 000. RESUMEN

Los comandos cotidianos de configuración, sesiones y contabilidad reciben un registrador independiente.

## // 001. QUÉ CAMBIA

- Añade `ein-general-commands.ts` con doce comandos humanos no ligados al flujo SDD.
- Conserva temporalmente sus definiciones activas en `ein-ai.ts`.
- Fija el inventario del registrador con una prueba directa.

## // 002. CÓMO FUNCIONA POR DENTRO

La nueva pieza llama a los dueños existentes de persona, idioma, TDD, Git, Hypa, Codegraph, onboarding, Linear y contexto. Solo mantiene el formateo propio de resume y accounting.

## // 003. CÓMO PROBARLO

- `bun test tests/ein-general-commands.test.ts`
- `bun run typecheck`
- `cd installer && bun run typecheck`

## // 004. VERIFICACIÓN

La prueba de inventario y ambos typechecks pasan.

## // 005. RIESGOS

Durante un escalón existen definiciones duplicadas, pero solo las históricas están conectadas. La siguiente PR sustituye el bloque completo por el registrador.
