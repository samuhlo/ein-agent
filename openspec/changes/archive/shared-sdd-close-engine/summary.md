status: complete
change: shared-sdd-close-engine
work_groups: 2
verification_status: pass

## // 000. RESUMEN

El motor de cierre ya puede vivir en terreno neutral porque recibe el estado, readiness, reloj e identidad Git como enchufes explícitos.

## // 001. QUÉ CAMBIA

- Añade `createCloseChange` sin dependencias de runtime.
- Añade al adaptador Git una lectura acotada de HEAD y tree.
- Demuestra que los nombres inseguros se rechazan antes de pedir capacidades.

## // 002. CÓMO FUNCIONA POR DENTRO

El motor coordina la decisión y la compactación. Puede leer artefactos, pero no ejecuta Git: pide una función que devuelve la identidad probada del repositorio. También recibe el estado y la readiness ya compuestos por cada runtime.

## // 003. CÓMO PROBARLO

- verify: `bun test && bun run typecheck && (cd installer && bun run typecheck && bun run bundle-template:host && bun run scripts/bundle-ein-cc.ts) && bun build installer/scripts/cc-payload-smoke.ts --compile --outfile /tmp/ein-cc-payload-smoke && (cd /tmp && /tmp/ein-cc-payload-smoke)`

## // 004. VERIFICACIÓN

2.970 pruebas pasan; typechecks, paquetes y smoke compilado pasan.

## // 005. RIESGOS

La fábrica todavía no conduce producción. La siguiente PR compone Pi y Claude y retira el puente de cierre con toda la matriz de cierre activa.
