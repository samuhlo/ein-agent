status: complete
change: shared-sdd-close-compaction-owner
work_groups: 2
verification_status: pass

## // 000. RESUMEN

El cierre real ya usa la transacción de archivo compartida y el módulo principal ha perdido casi la mitad de sus responsabilidades.

## // 001. QUÉ CAMBIA

- Retira la copia local de recuperación y compactación.
- Reexporta el contrato público desde shared.
- Reduce `sdd-close.ts` de 457 a 252 líneas.

## // 002. CÓMO FUNCIONA POR DENTRO

El motor decide qué clase de cierre corresponde y entrega esa decisión a la transacción neutral. La transacción es quien escribe la marca, promueve el directorio, poda y recupera interrupciones.

## // 003. CÓMO PROBARLO

- verify: `bun test && bun run typecheck && (cd installer && bun run typecheck && bun run bundle-template:host && bun run scripts/bundle-ein-cc.ts) && bun build installer/scripts/cc-payload-smoke.ts --compile --outfile /tmp/ein-cc-payload-smoke && (cd /tmp && /tmp/ein-cc-payload-smoke)`

## // 004. VERIFICACIÓN

2.969 pruebas pasan; typechecks, paquetes y smoke compilado pasan.

## // 005. RIESGOS

La decisión y la lectura Git siguen en Pi hasta el siguiente corte. Esta PR mueve sólo la transacción y conserva el resultado público.
