---
change: automatic-intent-preflight
phase: intent
created: 2026-08-28T10:39:24Z
---

## Petición

Ein debe ayudar a decidir bien un cambio antes de empezar a construirlo, sin depender de que el usuario recuerde pedir una pausa cuando va con prisa.

El resultado estará terminado cuando un cambio normal plantee dos preguntas al arrancar y una tercera solo si queda una decisión material abierta, mientras que un cambio pequeño o exclusivamente documental se limite a una línea que restate lo entendido y continúe.

## Decisiones cerradas

- **Clasificación conservadora — opción 3A.** Un cambio solo es pequeño si es mecánico, acotado y no añade comportamiento; ante la duda se trata como normal para no ocultar decisiones relevantes.
- **Contenido de las preguntas — opción 4A.** Las preguntas cierran el resultado esperado, los límites y el criterio de terminado porque son las decisiones que determinan si se construye lo correcto.
- **Recorrido pequeño — opción 5A.** La única línea restata lo entendido y continúa sin pedir respuesta para eliminar fricción en trabajo trivial.
- **Consolidación del preflight — opción 6A.** El canal sustituye y consolida la superficie de preguntas existente para mantener un máximo total de tres.
- **Elevación por riesgo — opción 7A.** Seguridad, datos y acciones destructivas siempre convierten el recorrido en normal aunque el cambio parezca pequeño.
- **Persistencia por cambio — opción 8A.** Una intención cerrada se conserva y no vuelve a preguntarse salvo que la petición cambie materialmente.
- **Frontera de activación — opción 9A.** El canal se activa ante cualquier petición que vaya a modificar código, configuración o datos persistentes.
- **Número adaptativo — opción 10A.** Un cambio normal recibe dos preguntas base y una tercera solo cuando todavía queda una decisión material abierta.
- **Confirmación previa — opción 11A.** Después de las respuestas se muestra la intención cerrada y se exige confirmación final antes de construir.
- **Decisiones técnicas existentes — opción 12A.** TDD y lane reutilizan valores ya registrados o defaults del proyecto y solo ocupan la tercera pregunta si afectan materialmente al resultado.
- **Documentación y texto — opción 13A.** Los cambios acotados exclusivamente documentales o de texto siguen el recorrido pequeño de una sola línea.
- **Continuación automática — opción 14A.** Tras confirmar se guarda `intent.md` y se entrega automáticamente el cambio al router existente.
- **Cambio material — opción 15A.** La intención se reabre cuando cambia el objetivo, los límites o el criterio de terminado; una mera reformulación no basta.
- **Omisión explícita — opción 16A.** El usuario puede saltarse el canal con una orden explícita salvo en cambios de seguridad, datos o acciones destructivas.
- **Límite arquitectónico — opción 17A.** El cambio solo añade la decisión previa y no rediseña las fases SDD, la verificación ni la entrega.
- **Contrato de persistencia — precisión de cierre.** El canal sustituye la superficie de preguntas del preflight, no su almacén ni su contrato: `preflight.json` sigue siendo la fuente persistida y `sdd-preflight.ts` sigue siendo quien escribe.
- **Precedencia del lane — precisión de cierre.** Un lane declarado siempre gana sobre el clasificador; el clasificador solo decide cuando no existe una declaración previa.

## Hechos verificados

- Pi ya activa automáticamente el preflight ante entradas SDD y al arrancar agentes SDD (`ein-pi/agent/extensions/ein-ai.ts:797-812`).
- El preflight actual recoge preguntas de sesión y por cambio, persiste la postura del cambio y evita volver a preguntar una postura ya registrada (`ein-pi/agent/lib/sdd-preflight.ts:520-599`).
- Los lanes existentes son `standard` y `micro`; antes de este cambio no hay una señal determinista previa a la planificación que elija entre ambos (`ein-pi/agent/lib/sdd-lane.ts:1-41`).
- El repositorio no contiene todavía un eje automático de preguntas de intención ni un clasificador previo de cambio normal frente a pequeño (`ein-pi/agent/lib/sdd-lane.ts:1-41`).

## Fuera de alcance

- Sustituir `preflight.json` como almacén o mover su escritura fuera de `sdd-preflight.ts`.
- Rediseñar las fases SDD, sus artefactos, la verificación o las puertas de entrega.
- Aplicar el recorrido normal a consultas de solo lectura o a cambios acotados exclusivamente documentales o de texto.
- Permitir que el clasificador sobrescriba un lane declarado.

## Abierto

No queda ninguna decisión de producto abierta. El diseño técnico deberá concretar el clasificador y la composición exacta de las preguntas sin romper las decisiones anteriores.
