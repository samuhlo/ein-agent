status: complete
change: shared-sdd-close-readiness
work_groups: 2
verification_status: pass

## // 000. RESUMEN

La decisión de si un cambio está listo para cerrar ya pertenece al núcleo compartido; Pi sólo le entrega su lectura de estado.

## // 001. QUÉ CAMBIA

- Añade una fábrica neutral de readiness.
- Reduce el módulo Pi a una composición pequeña.
- Conserva sin cambios los bloqueos normales, legacy y de reconciliación.

## // 002. CÓMO FUNCIONA POR DENTRO

Shared puede mirar los artefactos del cambio, pero recibe `resolveSddStatus` como enchufe. Así no conoce cómo Pi compone lane y OpenSpec, ni depende de un runtime.

## // 003. CÓMO PROBARLO

- verify: `bun test && bun run typecheck && (cd installer && bun run typecheck && bun run bundle-template:host && bun run scripts/bundle-ein-cc.ts) && bun build installer/scripts/cc-payload-smoke.ts --compile --outfile /tmp/ein-cc-payload-smoke && (cd /tmp && /tmp/ein-cc-payload-smoke)`

## // 004. VERIFICACIÓN

2.968 pruebas pasan; typechecks, paquetes y smoke compilado pasan.

## // 005. RIESGOS

El filesystem sigue siendo una capacidad permitida de `shared/sdd`; Git, procesos y configuración continúan prohibidos e inyectados.
