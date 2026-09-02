status: complete
change: shared-sdd-summary-writer
work_groups: 1
verification_status: pass

## // 000. RESUMEN

Pi y Claude escriben ahora `summary.md` mediante una única implementación neutral.

## // 001. QUÉ CAMBIÓ

- El escritor vive en `shared/sdd/sdd-summary-write.ts`.
- Pi conserva un entrypoint compatible.
- El puerto público ya no cruza a la implementación de Pi.
- El cierre de Claude pierde un fichero Pi.

## // 002. CÓMO FUNCIONA POR DENTRO

Claude importa directamente el dueño compartido. El checkout de Pi conserva un reexport con el nombre histórico y el template automático superpone en esa ruta la implementación real. Ambos caminos ejecutan la misma función y devuelven los mismos bytes y errores.

## // 003. DECISIONES

- No se cambió el contrato para convertir una migración de propiedad en una feature nueva.
- El módulo histórico permanece como fachada; retirar el puente no exige romper consumidores internos de Pi.

## // 004. VERIFICACIÓN

- verify: `bun test tests/sdd-summary-write.test.ts tests/sdd-claude-closure.test.ts tests/architecture-boundaries.test.ts tests/installed-agent-inventory.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- verify: `cd installer && bun run scripts/bundle-ein-cc.ts`

## // 005. RIESGOS

- El escritor mantiene sus escrituras actuales sin añadir atomicidad; ese comportamiento queda fuera de este corte de propiedad.
