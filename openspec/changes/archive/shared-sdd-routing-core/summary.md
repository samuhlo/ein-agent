status: complete
change: shared-sdd-routing-core
work_groups: 5
verification_status: pass

## // 000. RESUMEN

Pi y Claude comparten ya la misma selección de cambio, lectura de estado y decisión de siguiente fase SDD. La antigua implementación de Pi queda como una fachada pequeña y deja de viajar en el cierre runtime completo de Claude.

## // 001. QUÉ CAMBIÓ

- `shared/sdd/sdd-routing-core.ts` posee el vocabulario, la lectura de artefactos, selección, frescura, tareas, presupuesto, status y routing.
- `sdd-routing-runtime.ts` compone las entradas concretas de Pi; `sdd-router.ts` conserva compatibilidad y solo añade el handoff de presentación de Pi.
- `sdd-close-readiness.ts` recibe la preparación de cierre y reconciliación legacy, que no forman parte del core neutral.
- Lane conserva su almacenamiento, y guardrails conserva el parser OpenSpec; ambos entregan evidencia normalizada al core.
- `shared/ports/sdd.ts` compone directamente el mismo motor para Claude y retira el puente al router histórico.
- El template instala el core compartido sobre su layout plano, y las pruebas reproducen esa misma composición.

## // 002. CÓMO FUNCIONA POR DENTRO

El core observa el árbol común y recibe solo dos decisiones con dueño externo: cómo leer el lane persistido y cómo traducir la procedencia OpenSpec. Con esas entradas produce el mismo objeto de estado para ambos runtimes. No pregunta, no presenta interfaz, no cierra cambios y no interpreta por segunda vez los deltas.

El cierre de la CLI pasa de 33 a 36 módulos porque ahora nombra dueños y adaptadores pequeños, pero el código propiedad de Pi baja de 6.621 a 5.840 líneas. El núcleo compartido sube de 644 a 1.511 líneas y el puente directo histórico desaparece. La mejora buscada es propiedad real y menor acoplamiento, no ganar un contador ocultando responsabilidades.

## // 003. DECISIONES

- Inyectar lane y estado OpenSpec en una fábrica inmutable, sin singleton ni abstracción genérica de proveedores.
- Mantener persistencia lane y parsing OpenSpec en Pi hasta que el siguiente corte demuestre qué usan de verdad ambos runtimes.
- Separar readiness de cierre en su propio dueño Pi para no contaminar la política compartida.
- Conservar entrypoints compatibles durante la migración, pero proteger que Claude no vuelva a alcanzar la fachada histórica.
- Actualizar los fixtures instalados para reproducir el overlay real de `shared/sdd`, no una instalación simplificada distinta del producto.

## // 004. VERIFICACIÓN

- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- verify: `cd installer && bun run scripts/bundle-ein-cc.ts`
- verify: smoke compilado y ejecutado desde un directorio temporal aislado.
- verify: inventario instalado, payload, cierre, fronteras y superficies Pi/Claude — verdes.
- Resultado: 2.944 pass, 0 fail, 216 ficheros; ambos typechecks, bundles y smoke compilado en pass.

## // 005. PENDIENTE / RIESGOS

- La fase 6 conserva un último bloque: cierre, OpenSpec y guardas que ambos runtimes usan realmente.
- Los reexports de compatibilidad de Pi siguen siendo temporales; se retirarán cuando sus consumidores migren, no por perseguir cero puentes.
- El centinela específico que excluye `sdd-router.ts` se retira cuando el inventario general de fronteras posea por sí solo esa garantía.
