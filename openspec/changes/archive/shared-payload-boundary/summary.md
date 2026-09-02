status: complete
change: shared-payload-boundary
work_groups: 2
verification_status: pass

## // 000. RESUMEN

El template instalado de Pi obtiene automáticamente todos los módulos TypeScript compartidos. Añadir una fuente a `shared/contracts/` o `shared/sdd/` ya no exige mantener una segunda lista oculta, y una colisión detiene el bundle antes de publicar un archive incompleto.

## // 001. QUÉ CAMBIÓ

- El bundler descubre ficheros `.ts` regulares en ambas raíces compartidas.
- El overlay falla ante entradas no regulares o nombres que se sobrescribirían.
- El test construye el archive y compara byte a byte todas las fuentes derivadas.
- Un ADR, el README y la prueba de arquitectura fijan la frontera neutral.

## // 002. CÓMO FUNCIONA POR DENTRO

Los dos directorios compartidos se escanean una vez al arrancar el bundler. Sus nombres se validan antes de copiar y después cada fuente se superpone en el `lib/` plano que recibe Pi. La prueba obtiene su expectativa de los directorios fuente, no del inventario del bundler, así que una futura omisión no puede hacer que implementación y test se equivoquen juntos.

## // 003. DECISIONES

- `shared/` puede manejar los artefactos SDD/OpenSpec del proyecto, pero no lanzar procesos ni conocer adaptadores.
- Se protegen `shared/contracts/` y `shared/sdd/` porque compartían el mismo defecto.
- Una reducción de puentes se exige al corte funcional completo, no a cada PR preparatoria impuesta por el presupuesto.

## // 004. VERIFICACIÓN

- verify: `bun test tests/architecture-boundaries.test.ts tests/installed-agent-inventory.test.ts tests/repository-hygiene.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`

## // 005. RIESGOS

- El overlay continúa siendo plano a propósito; un futuro subdirectorio necesita una decisión de layout, no una copia silenciosa.
- El scan sustituye una allowlist manual solo dentro de raíces de código propio y falla ante colisiones.
