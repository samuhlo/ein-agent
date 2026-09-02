status: complete
change: shared-openspec-language-foundation
work_groups: 1
verification_status: pass

## // 000. RESUMEN

El contrato y el parser OpenSpec ya tienen una copia compartida comprobada antes de cambiar ningún consumidor.

## // 001. QUÉ CAMBIÓ

- El contrato y el parser viven también en `shared/sdd/`.
- Las pruebas comparan serialización, parseo y errores con los entrypoints actuales de Pi.
- Ningún consumidor cambia todavía de dueño.

## // 002. CÓMO FUNCIONA POR DENTRO

Este es un escalón de migración deliberado: primero se instala la pieza nueva y se demuestra que habla exactamente el mismo idioma; la siguiente PR sustituye las copias históricas por fachadas. Así el parser de 246 líneas no se presenta como una mudanza ilegible de alta más baja en un único diff.

## // 003. DECISIONES

- Aceptar duplicación solo durante un escalón apilado y sin divergencia observable.
- No reconectar puertos ni consumidores hasta que el dueño compartido esté probado.
- No modificar ningún byte, error ni regla observable del formato.

## // 004. VERIFICACIÓN

- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- verify: `cd installer && bun run scripts/bundle-ein-cc.ts`
- verify: smoke compilado y ejecutado desde `/tmp`.
- Resultado: pruebas de paridad y suite del repositorio en pass.

## // 005. RIESGOS

- Durante una sola PR apilada existen dos copias; la siguiente convierte las rutas Pi en fachadas y elimina esa duplicación.
- Escritor, sincronizador y puentes siguen intactos en este escalón.
