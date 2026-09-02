status: complete
change: shared-sdd-artifact-validation-owner
work_groups: 2
verification_status: pass

## // 000. RESUMEN

Pi ya delega la validación pura de artefactos en el dueño compartido; `sdd-guardrails.ts` deja de ser un bloque mezclado.

## // 001. QUÉ CAMBIÓ

- Se añade una fachada Pi para el módulo neutral.
- Se retiran unas 300 líneas de reglas duplicadas del coordinador.
- Los exports históricos mantienen nombre e identidad.

## // 002. CÓMO FUNCIONA POR DENTRO

Los consumidores siguen entrando por `sdd-guardrails.ts`. Ese módulo reexporta las reglas compartidas y conserva solo lo que necesita filesystem, configuración y lane. En la instalación, el overlay shared sustituye la fachada local con la implementación real.

## // 003. DECISIONES

- No mover aún la coordinación impide que el puente desaparezca solo de nombre.
- Mantener comentarios y formato existentes reduce el coste de revisión a 329 líneas medidas.

## // 004. VERIFICACIÓN

- verify: `bun test tests/sdd-artifact-validation-parity.test.ts tests/sdd-guardrails.test.ts tests/sdd-close.test.ts tests/sdd-lane.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- Resultado: 2.963 pass, 0 fail.

## // 005. RIESGOS

- El puente `sdd-guardrails` continúa porque la coordinación restante aún pertenece a Pi.
- La fachada local es necesaria mientras fuente e instalación usen layouts distintos.
