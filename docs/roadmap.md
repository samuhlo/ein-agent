# Roadmap de Ein

Este documento contiene únicamente trabajo vigente. Las decisiones estables viven en `docs/adr/`, el comportamiento actual en `openspec/specs/` y la historia exhaustiva en Git y las releases.

El trabajo anterior dejó la baseline de beta congelada, OpenSpec condensado, producto y runtime separados, propiedad del launcher `ein` unificada, primeros contratos compartidos extraídos y fronteras automáticas de imports en su sitio. Las fases posteriores repararon el presupuesto de revisión y separaron el diario de instalación en contrato, forma, alcanzabilidad, codec, store, política, persistencia y ejecución.

## Ahora — fase 4, retirar peso accidental del payload

Objetivo: que la frontera declarada en prosa la confirme el archive.

`ein-pi/agent/lib/project-settings.ts` importa el tipo `Setting` desde la aplicación de terminal, invirtiendo la dirección correcta de la dependencia. El empaquetador persigue imports con una expresión regular (`installer/scripts/bundle-ein-cc.ts`) que no distingue dependencias de solo tipo, así que copia código de interfaz de Pi dentro del paquete de Claude aunque nunca se ejecute.

- [ ] Mover `Setting` al dominio de ajustes e invertir la dependencia: la interfaz importa el dominio, no al revés.
- [ ] Sustituir el perseguidor de imports por análisis de TypeScript y descartar los imports de solo tipo.

Criterio de salida: desaparecen los ocho ficheros accidentales y el payload sigue siendo autocontenido. Verificación dura: regenerar el archive, comparar el manifiesto, compilar las cuatro entradas desde el payload aislado y pasar el smoke compilado BunFS. `bun test` no compila binarios y no cubre esta puerta.

## Condicionado — liberar presupuesto de prompt

Objetivo: crear espacio solo cuando un cambio de contrato observable demuestre que necesita tocar el orquestador.

`runtime/assets/orchestrator.md` pesa 42.730 bytes contra un techo de 43.011: quedan 281 bytes después de retirar duplicación al reparar el metro. Sigue siendo un margen estrecho. Hay 26 ficheros de test que fijan frases literales del texto, así que parte de esa prosa es portante y borrarla rompe mecanismos.

- [ ] Si `map` o `design` prueban que una fase posterior necesita cambiar el prompt, retirar comportamiento duplicado y cicatrices que ya no protegen de nada, comprobando cada retirada contra sus consumidores. No comprimir prosa para ganar bytes.

Criterio de salida: el cambio de contrato medido cabe con margen explícito y los consumidores de la prosa retirada siguen verdes. Sin necesidad demostrada, esta fase no se ejecuta.

## Después — fase 6, núcleo SDD neutral

Objetivo: que el motor compartido exista de verdad, no como fachada.

`shared/ports/` sigue siendo una fachada de migración hacia implementaciones propiedad de Pi. La CLI SDD de Claude consume parte de ese cierre; la frontera compartida todavía está declarada antes que construida.

Zona explícita `shared/sdd/`, pieza a pieza, con reexports temporales durante cada migración:

- [ ] Resolución pura de intención, hoy mezclada con el diálogo de Pi en `sdd-preflight.ts`.
- [ ] Selección, lectura de estado y routing, hoy en `sdd-router.ts` (40 exports, 19 consumidores).
- [ ] Cierre, OpenSpec y guardas que ambos runtimes usan realmente.

Hooks, preguntas, interfaz y herramientas exclusivas se quedan en Pi. Cada PR debe reducir la lista de puentes y el cierre real de la CLI.

Criterio de salida: cada puente superviviente tiene motivo, propietario y condición de retirada. No se persigue cero.

## Después — fase 7, hotspots con reglas sanas

Objetivo: dividir por responsabilidad medida, nunca por número de líneas.

Es el último punto vivo de la fase 1, y va aquí porque su resultado depende de las fases 2 y 6. Volver a medir antes de elegir; orden provisional:

- [ ] `project-state.ts` — 19 consumidores; Git, OpenSpec, configuración y verificación en un módulo.
- [ ] `runtime-session-adapters.ts` — 57 exports; contratos, búsqueda, validación, plan y ejecución.
- [ ] `installer/src/cli/install.ts` — solo si la evidencia de ciclo de vida de la fase 8 muestra coste o riesgo.
- [ ] `ein-ai.ts` — al final: separar registro de hooks, herramientas SDD, Cleaner y comandos. Ordenar la fachada antes de estabilizar los motores que registra es trabajo que se rehace.

`ein-linear.ts` y `model-config.ts` no se dividen por tamaño. `ein-linear.ts` entra solo si vuelve a cambiar con frecuencia.

## Después — fase 8, cierre de la beta

`e2e/docker-test.sh` cubre hoy cuatro escenarios instalados dos veces y un `update --dry-run`, y se dispara solo a mano (`workflow_dispatch`).

- [ ] Matriz completa en hogares desechables: Pi, Claude, ambos, instalación repetida, update real, fallo inducido y rollback, uninstall, conservación de ficheros ajenos y credenciales, integraciones opcionales ausentes y smoke compilado del payload.
- [ ] Alinear documentación pública, versión, artefactos y release.
- [ ] Publicar un quickstart reproducible y una demo del flujo completo.
- [ ] Mantener Pi como camino principal y declarar con precisión el soporte Claude.

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
