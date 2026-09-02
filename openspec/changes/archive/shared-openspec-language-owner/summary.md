status: complete
change: shared-openspec-language-owner
work_groups: 2
verification_status: pass

## // 000. RESUMEN

Contrato y parser OpenSpec tienen ya un único dueño compartido; las rutas de Pi son fachadas compatibles.

## // 001. QUÉ CAMBIÓ

- Las dos implementaciones históricas de Pi se reducen a reexports.
- Una prueba exige identidad real, no solo resultados parecidos.
- Consumidores, puertos y comportamiento permanecen intactos.

## // 002. CÓMO FUNCIONA POR DENTRO

Cuando Pi importa su ruta histórica, recibe directamente las mismas funciones y tipos de `shared/sdd`. Ya no hay dos parsers que puedan divergir con el tiempo.

## // 003. DECISIONES

- Mantener las rutas históricas evita mezclar una migración de consumidores con el cambio de propiedad.
- Escritor y sincronizador quedan fuera para conservar el presupuesto de revisión.

## // 004. VERIFICACIÓN

- verify: `bun test tests/openspec-specs.test.ts`
- verify: `bun test tests/openspec-archive-hygiene.test.ts`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `bun test`

## // 005. RIESGOS

- Las fachadas siguen siendo deuda temporal, pero ya no contienen lógica duplicada.
- El puente del escritor continúa hasta la PR siguiente.
