status: complete
change: shared-sdd-close-engine-owner
work_groups: 2
verification_status: pass

## // 000. RESUMEN

Pi y Claude ya cierran cambios con el mismo motor neutral. El puente de cierre desaparece y quedan cinco adaptadores SDD legítimos.

## // 001. QUÉ CAMBIA

- Reduce `sdd-close.ts` de Pi a 23 líneas de composición.
- Compone cierre y readiness dentro del puerto público.
- Retira `sdd-close` de los puentes autorizados.
- Reduce el cierre Claude en tres ficheros y 841 líneas procedentes de Pi.

## // 002. CÓMO FUNCIONA POR DENTRO

Ambos runtimes conectan routing, readiness e identidad Git a `createCloseChange`. La decisión, reconciliación y transacción viven en shared; los adaptadores sólo proporcionan capacidades.

## // 003. CÓMO PROBARLO

- verify: `bun test && bun run typecheck && (cd installer && bun run typecheck && bun run bundle-template:host && bun run scripts/bundle-ein-cc.ts) && bun build installer/scripts/cc-payload-smoke.ts --compile --outfile /tmp/ein-cc-payload-smoke && (cd /tmp && /tmp/ein-cc-payload-smoke)`

## // 004. VERIFICACIÓN

2.971 pruebas pasan; typechecks, paquetes y smoke compilado pasan.

## // 005. RIESGOS

Los cinco puentes restantes no son deuda equivalente: son persistencia, Git, comandos y configuración. La auditoría final documentará su dueño y condición de retirada.
