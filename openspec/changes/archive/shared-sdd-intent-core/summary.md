status: complete
change: shared-sdd-intent-core
work_groups: 4
verification_status: pass

## // 000. RESUMEN

La política y la coordinación de intención SDD viven ahora en un núcleo neutral compartido por Pi y Claude. El primer puente grueso hacia `sdd-preflight.ts` desaparece sin cambiar el comportamiento observable ni mover preguntas, hooks, memoria o interfaz fuera de Pi.

## // 001. QUÉ CAMBIÓ

- `shared/sdd/sdd-intent-preflight.ts` posee la política pura de clasificación y resolución.
- `shared/sdd/sdd-intent-resolution.ts` coordina lectura, persistencia, reloj y deduplicación mediante dependencias explícitas.
- `sdd-preflight-record.ts` conserva la E/S Pi; `sdd-preflight.ts` queda como adaptador de sesión e interfaz.
- `shared/ports/sdd.ts` enlaza Claude directamente al mismo coordinador, sin reexport runtime de `sdd-preflight.ts`.
- Los entrypoints Pi anteriores permanecen como reexports compatibles y el bundle instalado superpone las implementaciones compartidas reales.
- Pruebas directas, de paridad, inventario y arquitectura fijan el nuevo límite y su reducción de cierre.

## // 002. CÓMO FUNCIONA POR DENTRO

El coordinador recibe contratos para leer estado, persistir una resolución y obtener la hora. Decide sobre datos neutrales, conserva el lane declarado, evita escrituras en rutas read-only o inciertas y deduplica resoluciones concurrentes por sesión y cambio. El adaptador Pi traduce esos contratos a sus stores, carreras de adopción y compatibilidad TDD/lanes; las preguntas y notificaciones siguen en la capa de interfaz.

Claude construye el mismo coordinador desde su port usando únicamente el adaptador de persistencia estrecho. El payload ya no alcanza `sdd-preflight.ts` ni sus dependencias colaterales: pasa de 41 a 33 módulos totales, de 36 a 27 módulos Pi y de 8.860 a 6.621 líneas Pi.

## // 003. DECISIONES

- Extraer primero intención porque era la costura con mayor reducción aislable y no exigía tocar el orquestador.
- Inyectar E/S y reloj en vez de introducir abstracciones de runtime dentro del núcleo.
- Mantener reexports temporales en Pi para no romper consumidores mientras progresa la migración.
- Fijar una frontera estructural ejecutable que impida reintroducir los colaboradores exclusivos de Pi sin volver a medir el corte por renglones.
- Reservar selección/estado/routing y cierre/OpenSpec/guardas para PRs independientes.

## // 004. VERIFICACIÓN

- verify: `bun test tests/sdd-intent-preflight.test.ts tests/sdd-intent-resolution.test.ts tests/sdd-preflight-record.test.ts tests/sdd-preflight-per-change.test.ts tests/sdd-intent-runtime-parity.test.ts tests/sdd-claude-closure.test.ts tests/architecture-boundaries.test.ts tests/core-parity-coordinator.test.ts tests/cc-payload-bundle.test.ts tests/installed-agent-inventory.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `bun run bundle-template:host`
- verify: `cd installer && bun run scripts/bundle-ein-cc.ts`
- verify: `bun build installer/scripts/cc-payload-smoke.ts --compile --outfile /tmp/ein-cc-payload-smoke-shared-sdd && (cd /tmp && /tmp/ein-cc-payload-smoke-shared-sdd)`
- Resultado: 104 pruebas enfocadas y 2.938 globales, 0 fallos; ambos typechecks, bundles y smoke compilado en pass.

## // 005. PENDIENTE / RIESGOS

- El adaptador de persistencia aún pertenece a Pi y mantiene compatibilidad legacy; el siguiente corte debe abordar selección, lectura de estado y routing sin mezclarlo con este PR.
- Los reexports Pi son deliberadamente temporales y deben retirarse cuando no queden consumidores internos.
- El centinela estructural del corte se retira cuando la persistencia de intención deje de cruzar Pi y el inventario general de puentes posea por sí solo esta garantía.
