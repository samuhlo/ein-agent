status: complete
change: shared-sdd-bridge-ledger
work_groups: 2
verification_status: pass

## // 000. RESUMEN

La fase 6 queda cerrada con cinco adaptadores explícitos, documentados y protegidos contra deriva.

## // 001. QUÉ CAMBIA

- Inventaría cada puente SDD superviviente.
- Nombra motivo, propietario y condición de retirada.
- Hace que la suite compare documento e imports autorizados.
- Mueve el roadmap vivo a la fase 7.

## // 002. CÓMO FUNCIONA POR DENTRO

La tabla humana y la lista que aplica la arquitectura contienen las mismas rutas. Añadir o retirar un puente en un solo lado rompe el test, por lo que la deuda no puede cambiar sin explicar su ciclo de vida.

## // 003. CÓMO PROBARLO

- verify: `bun test && bun run typecheck && (cd installer && bun run typecheck && bun run bundle-template:host && bun run scripts/bundle-ein-cc.ts) && bun build installer/scripts/cc-payload-smoke.ts --compile --outfile /tmp/ein-cc-payload-smoke && (cd /tmp && /tmp/ein-cc-payload-smoke)`

## // 004. VERIFICACIÓN

2.972 pruebas pasan; typechecks, paquetes y smoke compilado pasan.

## // 005. RIESGOS

Los cinco adaptadores no son permanentes por decreto: cada fila define la evidencia necesaria para retirarlo sin perseguir un cero artificial.
