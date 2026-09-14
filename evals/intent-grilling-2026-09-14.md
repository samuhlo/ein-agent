# Intent por rondas — evaluación del 14 de septiembre de 2026

## Problema y contrato

La petición «vamos a hacer el intent del bloque 04» podía convertirse en una
ratificación del alcance. El runtime aceptaba la respuesta de una ronda como
confirmación del acuerdo entero. El prompt compacto reforzaba el atajo de
1–4 preguntas y no cargaba necesariamente el protocolo de entrevista.

El padre ahora carga `intent-channel` para SDD y peticiones explícitas de intent,
incluidas las expresadas en lenguaje natural. La herramienta conserva el árbol
conocido y separa rondas de revisión final. Los cambios mecánicos completos
conservan `record`; conversación y lectura no crean trabajo.

Referencia: [grilling de Matt Pocock](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md).
La adaptación conserva preguntas independientes por ronda, recomendaciones,
investigación de hechos y recorrido de las dependencias. Ein añade persistencia
y una respuesta nueva ligada al material revisado antes de confirmar.

## Pilotos con modelo real

Ejecutados mediante el SDK real de Pi, el prompt del padre, la skill actual y la
herramienta `ein_intent` registrada, con el modelo configurado del usuario:
`openai-codex/gpt-6-astra`. Proyectos y sesiones temporales; instalación personal
sin modificar. El piloto entrega la skill en el contexto para aislar el protocolo.
No es una prueba visual del terminal ni una auditoría del proyecto original.

- `bun tooling/verify-intent-runtime.ts`: PASS. Preguntas concretas sobre filas,
  columnas y formato CSV; revisión final tras las respuestas; respuesta nueva
  antes de crear el acuerdo; un hijo real escribe la especificación; ampliar
  el alcance reabre intent y cancelar detiene el trabajo. Las comprobaciones de
  alineación de la especificación cubren filtros, orden y exclusión de datos ocultos.
- `bun tooling/verify-intent-runtime.ts --block04`: PASS. Petición en español de
  hacer solo intent, varias decisiones sustantivas, dependencias pendientes
  registradas, respuesta parcial que no cierra el acuerdo y explicación que no
  se interpreta como elección. Cero escrituras de SDD o código.

La primera evaluación del bloque 04 detectó preguntas dependientes adelantadas.
Una segunda aplazó esas preguntas en prosa, pero no las conservó en el árbol.
Se corrigió el criterio para identificar dependencias y se exigió guardar el
árbol conocido completo. El piloto final comprueba también las ramas aplazadas.

Ejemplo final observado: la primera ronda pregunta por identidad, relación entre
academia y sedes, significado de colaboración y límite de la entrada. Permisos,
comportamiento de entrada y cabeceras quedan para sus decisiones previas. Tras
responder únicamente identidad y colaboración con varios centros, el padre
conserva esas respuestas y mantiene el resto pendiente.

Suite final: **3.242 pruebas, 0 fallos**; typecheck y empaquetado del template
correctos. Tras el último ajuste del validador, 63 pruebas centradas en intent y
continuidad Claude volvieron a pasar.

## Garantías y límites

Las pruebas deterministas cubren respuesta ligada a la ronda, revisión ligada a
material inmutable, ramas abiertas o esperando hechos, ciclos, pérdida de ramas,
más de cuatro preguntas, cancelación, reanudación, repetición de revisión y
hechos que terminan sin necesitar una ronda humana artificial. Los acuerdos
históricos siguen siendo legibles y los consumidores Claude conservan compatibilidad.

La máquina comprueba el árbol declarado y la procedencia de la respuesta; no
puede demostrar que el modelo descubrió todas las decisiones relevantes ni que
interpretó correctamente cualquier frase. Eso requiere evaluación conversacional.
Los pilotos son evidencia acotada con un modelo, no una garantía para todos.

El control de revisión existe para impedir que una respuesta parcial desbloquee
scope/apply. Se podría retirar el paso separado si otro mecanismo demostrase
que la respuesta observada confirma el material final completo sin reintroducir
ese fallo; el criterio es la regresión de varias rondas, no la forma de la prosa.

Para repetir: instalar dependencias de raíz e instalador, generar el template con
`bun run bundle-template:host` desde `installer`, ejecutar `bun test` y
`bun run typecheck`. Los pilotos necesitan acceso al proveedor configurado y
guardan eventos/resultados en la ruta temporal impresa al arrancar; no copiar
credenciales ni eventos privados a la PR.
