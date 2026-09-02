status: complete
change: shared-sdd-close-reconciliation
work_groups: 2
verification_status: pass

## // 000. RESUMEN

La regla pura que decide si una reconciliación fuera del flujo es válida ya tiene una implementación neutral preparada para ambos runtimes.

## // 001. QUÉ CAMBIA

- Añade `shared/sdd/sdd-reconciliation.ts`.
- Compara sus decisiones con la implementación histórica de Pi.
- Mantiene la copia de Pi temporalmente para que esta PR sea pequeña y revisable.

## // 002. CÓMO FUNCIONA POR DENTRO

La función recibe hechos ya leídos —registro, resumen, identidad Git y evidencia— y devuelve aceptación o una lista cerrada de bloqueos. No abre ficheros ni ejecuta procesos.

## // 003. CÓMO PROBARLO

- verify: `bun test && bun run typecheck && (cd installer && bun run typecheck && bun run bundle-template:host && bun run scripts/bundle-ein-cc.ts) && bun build installer/scripts/cc-payload-smoke.ts --compile --outfile /tmp/ein-cc-payload-smoke && (cd /tmp && /tmp/ein-cc-payload-smoke)`

## // 004. VERIFICACIÓN

2.968 pruebas pasan; typechecks, paquetes y smoke compilado pasan.

## // 005. RIESGOS

Durante una PR existen dos copias deliberadamente idénticas. La siguiente PR convierte Pi en fachada y elimina esa duplicación.
