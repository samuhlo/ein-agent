status: complete
change: shared-openspec-config-rules
work_groups: 2
verification_status: pass

## // 000. RESUMEN

El lector acotado de reglas OpenSpec tiene ya un único dueño compartido.

## // 001. QUÉ CAMBIÓ

- `openspec-config-rules.ts` vive en `shared/sdd`.
- Pi conserva una fachada de compatibilidad.
- Parser y lector tienen identidad entre ambas rutas.

## // 002. CÓMO FUNCIONA POR DENTRO

El módulo reconoce únicamente el bloque `rules:` exacto que escribe Ein. Lo desconocido sigue degradando a reglas ausentes y, por tanto, al comportamiento estricto por defecto.

## // 003. DECISIONES

- `openspec/config.yaml` es configuración del proyecto compartido, no del runtime.
- No ampliar el lector a YAML general mantiene el contrato pequeño y determinista.

## // 004. VERIFICACIÓN

- verify: `bun test tests/openspec-config-rules.test.ts tests/sdd-artifact-validation-parity.test.ts tests/sdd-guardrails.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- Resultado: 2.964 pass, 0 fail.

## // 005. RIESGOS

- La fachada Pi sigue siendo necesaria para el layout del checkout.
- El coordinador de guardrails se moverá en la PR siguiente; esta entrega aún no reduce puentes.
