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
y su observación report-only. El siguiente corte debe conservar esa observación
como evidencia durable y medirla antes de convertirla en una puerta dura.

- [ ] Persistir receipts pequeños de readiness en el borde vivo y contarlos sin
  confundir una orden ejecutable con código correcto.
- [ ] Acumular observaciones reales suficientes antes de endurecer la puerta.
- [ ] Impedir por herramienta escrituras y comandos fuera del packet.
- [ ] Emitir receipts de verificación ligados a packet y estado resultante.
- [ ] Unir accounting con resultado y ejecutar el canary capaz contra barato.
- [ ] Promocionar por clase de trabajo únicamente cuando la evidencia lo permita.

Criterio de salida: al menos una clase de trabajo alcanza cero escapes, calidad
equivalente y menor coste total sobre una muestra suficiente, y puede ejecutarse
con modelo barato/local sin fallback oculto.

## Condicionado — liberar presupuesto de prompt

Objetivo: crear espacio solo cuando un cambio de contrato observable demuestre que necesita tocar el orquestador.

`runtime/assets/orchestrator.md` pesa 42.730 bytes contra un techo de 43.011: quedan 281 bytes después de retirar duplicación al reparar el metro. Sigue siendo un margen estrecho. Hay 26 ficheros de test que fijan frases literales del texto, así que parte de esa prosa es portante y borrarla rompe mecanismos.

- [ ] Si `map` o `design` prueban que una fase posterior necesita cambiar el prompt, retirar comportamiento duplicado y cicatrices que ya no protegen de nada, comprobando cada retirada contra sus consumidores. No comprimir prosa para ganar bytes.

Criterio de salida: el cambio de contrato medido cabe con margen explícito y los consumidores de la prosa retirada siguen verdes. Sin necesidad demostrada, esta fase no se ejecuta.

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
