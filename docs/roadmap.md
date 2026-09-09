# Roadmap de Ein

Este documento contiene únicamente trabajo vigente. Las decisiones estables viven en `docs/adr/`, el comportamiento actual en `openspec/specs/` y la historia exhaustiva en Git y las releases.

El trabajo anterior dejó la baseline de beta congelada, OpenSpec condensado, producto y runtime separados, propiedad del launcher `ein` unificada, presupuesto de revisión resistente a código empaquetado y el diario de instalación separado por responsabilidades. El núcleo SDD compartido ya posee intención, routing, remedios, validación, lenguaje y sincronización OpenSpec, resumen y cierre. Sus cinco adaptadores supervivientes están inventariados con dueño y condición de retirada en `shared/README.md`. La auditoría de salida de la fase arquitectónica quedó aceptada en `docs/adr/0004-close-architecture-phase.md`.

El cierre de beta también está completado: la matriz desechable prueba Pi,
Claude, ambos, reinstalación, update, rollback, uninstall, preservación y
launcher; el workflow de release añade un update real entre alphas publicadas.
El quickstart y el recorrido de primera ejecución viven en la documentación
pública, y la matriz de runtimes declara Pi como referencia y los límites de
Claude sin prometer paridad inexistente.

## Principal — cerrar el bucle del ejecutor barato

Objetivo: demostrar el principio económico de Ein con una cadena completa:
modelo capaz que decide y descompone, packet ejecutable consumido por runtime,
worker barato confinado, verificación independiente y coste atribuido al
resultado correcto. La decisión y el programa viven en
`docs/adr/0005-make-cheap-apply-verifiable.md`.

`make-apply-handoff-executable` ya cerró el contrato `apply-packet/v2` por grupo
y su observación report-only. `measure-live-apply-packets` instala el metro
durable en el transcript padre y lo muestra en accounting. La foto anterior al
metro está congelada en `evals/cheap-apply-accounting-baseline.json`; no es una
comparación capaz/barato.

- [ ] Acumular 20 observaciones consecutivas `executable`, sin telemetría
  malformada, repartidas entre al menos 3 cambios normales antes de endurecer
  la puerta. Un fallo reinicia la racha después de corregir su causa aguas
  arriba.
- [ ] Impedir por herramienta escrituras y comandos fuera del packet.
- [ ] Emitir receipts de verificación ligados a packet y estado resultante.
- [ ] Unir accounting con resultado y ejecutar el canary capaz contra barato.
- [ ] Promocionar por clase de trabajo únicamente cuando la evidencia lo permita.

Criterio de salida: al menos una clase de trabajo alcanza cero escapes, calidad
equivalente y menor coste total sobre una muestra suficiente, y puede ejecutarse
con modelo barato/local sin fallback oculto.

## Contexto inicial — reducción comprobada

La [prueba del 2026-09-08](../evals/orchestrator-context-2026-09-08.md) reduce la
entrada inicial de unas 41.100 a 23.800 tokens con el núcleo bajo demanda y un
catálogo compacto de skills. Se conserva el contrato completo en disco y el
resolver existente. El flujo real design/tasks/apply/verify pasó; verify también
rechazó una regresión sembrada. Es un caso probado, no una promoción general ni
una validación de modelo local.

El siguiente trabajo se decide desde el uso en proyectos. No se abre otra
campaña de compresión ni un subsistema de presupuestos; se corrigen problemas
concretos y se conserva la evidencia, incluidos fallos y reparaciones.

La [simplificación de apply](../evals/lean-apply-2026-09-08.md) elimina la doble
edición de checkboxes y reúne cada tarea con las pruebas que necesita para
completarse. Se conserva el backend de progreso y la verificación independiente.
Las dos comparaciones se documentan por separado, sin convertir los 26 turnos
históricos en una promesa de ahorro general. El siguiente ajuste se decide desde
fallos concretos de uso, manteniendo los modelos elegidos por el usuario.

## Secundario

- Perfil mínimo para facilitar pruebas de terceros, sin convertirlo en el centro del producto.
- Evals conductuales externos al propio historial.
- Packs adicionales de skills y preparación para contribuciones.

## Reglas de prioridad

- Ningún proveedor o modelo se selecciona por defecto. Ein puede recomendar esfuerzo, pero la elección pertenece al usuario.
- No se añade una integración nueva durante el cierre de beta salvo que bloquee el flujo principal.
- No se divide un fichero por su número de líneas. Se divide cuando tiene más de un dueño.
- Ninguna fase persigue un cero absoluto —ni cero puentes, ni cero ficheros grandes—. Se persigue que cada pieza tenga dueño y que cambiarla no obligue a entender media casa.
- Un elemento completado sale de este roadmap; su resultado queda en spec, ADR, changelog o release según corresponda.
