status: complete
change: shared-sdd-change-validation-foundation
work_groups: 2
verification_status: pass

## // 000. RESUMEN

La validación completa de un cambio SDD tiene ya un coordinador neutral probado, aún sin reconectar consumidores.

## // 001. QUÉ CAMBIÓ

- Se añade `shared/sdd/sdd-change-validation.ts`.
- Filesystem, estado OpenSpec y bases canónicas viven juntos.
- Las fases esperadas se reciben por una costura mínima.

## // 002. CÓMO FUNCIONA POR DENTRO

Shared lee los artefactos, aplica las reglas puras y agrega procedencia y OpenSpec. La única decisión externa es la lista de fases que espera el lane; Pi la entrega hoy y cualquier runtime puede componerla sin que shared importe su persistencia.

## // 003. DECISIONES

- Inyectar fases, no un objeto genérico de runtime.
- Preparar y probar el dueño antes de eliminar el coordinador Pi mantiene la PR dentro del presupuesto.

## // 004. VERIFICACIÓN

- verify: `bun test tests/sdd-change-validation-parity.test.ts tests/sdd-guardrails.test.ts tests/sdd-lane.test.ts tests/sdd-close.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- Resultado: 2.965 pass, 0 fail.

## // 005. RIESGOS

- Este escalón no cambia consumidores; la PR siguiente es necesaria para retirar el puente.
- Shared toca filesystem de proyecto, permitido por el ADR, pero no procesos, Git ni configuración de runtime.
