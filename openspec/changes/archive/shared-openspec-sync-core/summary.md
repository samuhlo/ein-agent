status: complete
change: shared-openspec-sync-core
work_groups: 2
verification_status: pass

## // 000. RESUMEN

La planificación y evaluación de sincronización OpenSpec tienen ya un único dueño compartido.

## // 001. QUÉ CAMBIÓ

- El core vive en `shared/sdd/openspec-spec-sync.ts`.
- Pi conserva una fachada compatible.
- Planificación, serialización de informes y evaluación apuntan a las mismas funciones.

## // 002. CÓMO FUNCIONA POR DENTRO

El módulo convierte deltas y bases en un plan determinista, genera el recibo de sincronización y comprueba si ese recibo describe los bytes actuales. Es política compartida; todavía no toca el disco por sí mismo.

## // 003. DECISIONES

- Mover el core como una unidad evita separar tipos y decisiones que evolucionan juntas.
- El adaptador con rollback se conserva para la PR siguiente, donde también se retirará el puente.

## // 004. VERIFICACIÓN

- verify: `bun test tests/openspec-specs.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- Resultado: 2.958 pass, 0 fail.

## // 005. RIESGOS

- El puente no baja todavía porque el adaptador de filesystem sigue en Pi.
- La ruta Pi permanece como compatibilidad temporal sin lógica propia.
