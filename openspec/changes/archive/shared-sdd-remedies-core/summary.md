status: complete
change: shared-sdd-remedies-core
work_groups: 3
verification_status: pass

## // 000. RESUMEN

Los remedios deterministas del ciclo SDD viven ahora en un núcleo neutral compartido por Pi y Claude. Claude deja de cargar la implementación histórica de Pi y ambos runtimes conservan exactamente los mismos códigos, orden, mensajes y acciones.

## // 001. QUÉ CAMBIÓ

- `shared/sdd/sdd-remedies.ts` posee la política pura y usa el vocabulario neutral de routing.
- `ein-pi/agent/lib/sdd-remedies.ts` queda como entrypoint compatible para consumidores de checkout.
- `shared/ports/sdd.ts` exporta directamente el dueño compartido.
- El template Pi superpone la implementación real bajo su layout plano.
- Arquitectura y cierre semántico impiden reintroducir el puente histórico.

## // 002. CÓMO FUNCIONA POR DENTRO

El módulo recibe un estado ya calculado y devuelve una lista inmutable de remedios. No lee disco, no escribe ni ejecuta. La única variación legítima es el runtime solicitado: Pi nombra su tool de sync y Claude su comando determinista; Claude añade además el canal de escritura del resumen cuando llega a close.

El payload conserva 69 ficheros totales porque el módulo cambia de dueño, no desaparece. Los ficheros Pi bajan de 55 a 54 y sus líneas de 14.704 a 14.564; los compartidos suben de 9 a 10. La lista de puentes SDD baja de 11 a 10.

## // 003. DECISIONES

- Reutilizar `SddSpecState` en vez de mantener un tipo OpenSpec propiedad de Pi.
- Mantener un wrapper de checkout y un overlay instalado, sin duplicar la implementación.
- Medir el cierre completo de las cuatro entradas de Claude.
- Separar esta PR de validación, sincronización y cierre para respetar el presupuesto de revisión.

## // 004. VERIFICACIÓN

- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- verify: `cd installer && bun run scripts/bundle-ein-cc.ts`
- Resultado: 2.947 pruebas globales, 0 fallos; typechecks, bundles y smoke compilado en pass.

## // 005. PENDIENTE / RIESGOS

- La fase 6 conserva validación de artefactos, OpenSpec y cierre como responsabilidades todavía cruzadas.
- El wrapper Pi es temporal y se retirará cuando los consumidores internos dejen de usar la ruta histórica.
- El centinela específico se retira cuando el inventario general de fronteras posea por sí solo esta garantía.
