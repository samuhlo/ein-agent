status: complete
change: shared-openspec-delta-writer
work_groups: 2
verification_status: pass

## // 000. RESUMEN

Pi y Claude escriben deltas OpenSpec con una sola implementación compartida y un puente temporal menos.

## // 001. QUÉ CAMBIÓ

- El escritor vive en `shared/sdd/openspec-delta-write.ts`.
- Pi conserva una fachada compatible.
- El puerto apunta a shared y la lista baja a ocho puentes SDD.
- Claude deja fuera la fachada Pi de su cierre.

## // 002. CÓMO FUNCIONA POR DENTRO

Claude alcanza directamente el escritor neutral. Pi conserva el nombre histórico, pero reexporta exactamente la misma función. Serialización, validación previa, filesystem y errores no cambian.

## // 003. DECISIONES

- Trasladar el escritor después de unificar contrato y parser mantiene cada diff dentro del presupuesto.
- No mezclar todavía sincronización, que tiene rollback y un riesgo distinto.

## // 004. VERIFICACIÓN

- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- verify: `cd installer && bun run scripts/bundle-ein-cc.ts`
- verify: smoke compilado y ejecutado desde `/tmp`.
- Resultado: 2.957 pass, 0 fail; bundles y smoke en pass.

## // 005. RIESGOS

- El escritor conserva escrituras directas síncronas; esta PR cambia propiedad, no semántica de persistencia.
- La sincronización completa mantiene su puente separado hasta la siguiente entrega.
