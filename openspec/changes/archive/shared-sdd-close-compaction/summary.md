status: complete
change: shared-sdd-close-compaction
work_groups: 2
verification_status: pass

## // 000. RESUMEN

La transacción que mueve un cambio al archivo y puede recuperarse tras una interrupción ya tiene una pieza neutral y revisable.

## // 001. QUÉ CAMBIA

- Añade el contrato de resultado y opciones de cierre.
- Aísla la marca pendiente, su validación y la reanudación.
- Aísla la promoción y poda que deja únicamente `summary.md`.

## // 002. CÓMO FUNCIONA POR DENTRO

Antes de mover nada escribe una marca con el hash del resumen y el resultado esperado. Tras renombrar, verifica ese hash, poda los artefactos intermedios y sólo entonces retira la marca. Una interrupción deja datos suficientes para reanudar sin adoptar un destino extraño.

## // 003. CÓMO PROBARLO

- verify: `bun test && bun run typecheck && (cd installer && bun run typecheck && bun run bundle-template:host && bun run scripts/bundle-ein-cc.ts) && bun build installer/scripts/cc-payload-smoke.ts --compile --outfile /tmp/ein-cc-payload-smoke && (cd /tmp && /tmp/ein-cc-payload-smoke)`

## // 004. VERIFICACIÓN

2.969 pruebas pasan; typechecks, paquetes y smoke compilado pasan.

## // 005. RIESGOS

La pieza nueva aún no conduce el cierre real. La PR siguiente elimina la copia histórica y ejecuta toda la matriz sobre el módulo compartido.
