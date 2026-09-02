status: complete
change: shared-sdd-artifact-validation-foundation
work_groups: 2
verification_status: pass

## // 000. RESUMEN

Las reglas puras que revisan artefactos SDD tienen ya un dueño neutral probado antes de cambiar consumidores.

## // 001. QUÉ CAMBIÓ

- Se añade `shared/sdd/sdd-artifact-validation.ts`.
- Diseño, tareas, fases y tamaño de grupos producen los mismos informes que Pi.
- Filesystem, lanes y configuración quedan fuera.

## // 002. CÓMO FUNCIONA POR DENTRO

El módulo recibe texto y devuelve issues ordenados. No abre ficheros ni sabe qué runtime lo llamó. Una prueba compara casos válidos y rotos contra la implementación actual para proteger la migración.

## // 003. DECISIONES

- Preparar primero el dueño evita presentar alta y baja de unas 300 líneas como un único diff comprimido.
- La duplicación existe solo durante este escalón apilado y se elimina en la PR siguiente.

## // 004. VERIFICACIÓN

- verify: `bun test tests/sdd-artifact-validation-parity.test.ts tests/sdd-guardrails.test.ts tests/sdd-close.test.ts tests/openspec-config-rules.test.ts tests/sdd-cost-block-e.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- Resultado: 2.962 pass, 0 fail.

## // 005. RIESGOS

- Ningún consumidor usa aún el módulo; la siguiente PR es necesaria para cerrar la transición.
- `PhaseRules` se expresa como contrato estructural neutral y debe mantenerse compatible al reconectar configuración.
