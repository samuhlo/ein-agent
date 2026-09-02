status: complete
change: shared-sdd-close-reconciliation-owner
work_groups: 2
verification_status: pass

## // 000. RESUMEN

Pi ya no mantiene una segunda política de reconciliación: su ruta histórica apunta al único dueño compartido.

## // 001. QUÉ CAMBIA

- Sustituye 244 líneas de Pi por un reexport.
- Exige identidad entre la función vista desde Pi y desde shared.
- Conserva intacto el contrato del motor de cierre.

## // 002. CÓMO FUNCIONA POR DENTRO

Los consumidores antiguos siguen importando la misma ruta, pero el módulo sólo redirige al código neutral. Así no se obliga a migrar todos los llamadores en la misma entrega.

## // 003. CÓMO PROBARLO

- verify: `bun test && bun run typecheck && (cd installer && bun run typecheck && bun run bundle-template:host && bun run scripts/bundle-ein-cc.ts) && bun build installer/scripts/cc-payload-smoke.ts --compile --outfile /tmp/ein-cc-payload-smoke && (cd /tmp && /tmp/ein-cc-payload-smoke)`

## // 004. VERIFICACIÓN

2.968 pruebas pasan; typechecks, paquetes y smoke compilado pasan.

## // 005. RIESGOS

La fachada Pi se mantiene por compatibilidad. Retirarla por completo no aporta valor mientras existan consumidores internos legítimos.
