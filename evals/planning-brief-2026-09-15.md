# Explicar antes de diseñar y aplicar

El manifiesto fija el objetivo: preguntar lo necesario, explicar de forma que la
persona pueda juzgar la solución y mostrar información útil. El orquestador
aplica ese principio al terminar map: cuenta qué ocurre hoy y qué se pretende
cambiar, después explica el mecanismo y las incertidumbres. Antes de apply
conserva archivos, comprobaciones y riesgos del plan.

## Piloto con el modelo configurado

`bun tooling/verify-planning-brief.ts evals/planning-brief-2026-09-15.json`

Compara el prompt de `origin/main` con la revisión en tres escenarios, dos
muestras por variante: después de map, antes de apply y un cambio mecánico.
Modelo: `openai-codex/gpt-6-astra`. Son doce respuestas, guardadas completas
en [el resultado](planning-brief-2026-09-15.json), sin razonamiento privado.

- Después de map, la revisión empieza por lo que ocurre al abrir un curso y
  qué módulos deben contar. Después explica la selección conservada, el filtro
  y las respuestas tardías. Mantiene visible la laguna sobre módulos sin asignar.
- Antes de apply, las dos muestras revisadas ponen el ejemplo de dos módulos
  seleccionados y uno asignado en el primer apartado. Conservan archivos,
  comandos, protección al cambiar de curso y la confirmación ya prevista.
- El cambio de una etiqueta sigue siendo una actualización de dos frases.
- No se afirma que haya código cambiado ni pruebas ejecutadas en los escenarios
  que todavía son planificación. No se añade una confirmación antes de design.

La revisión independiente de un piloto preliminar encontró una mejora clara
después de map y moderada antes de apply: la base ya explicaba parte del mecanismo.
Se afinó la separación entre verbos cotidianos en el inicio y vocabulario técnico
después; las muestras finales dicen «qué se considera completo».

Los tiempos acumulados fueron 47,332 s en la base y 47,313 s en la revisión.
No acreditan una mejora de velocidad. Este es un replay de prosa con evidencia
suministrada, no un ciclo SDD completo ni una garantía de calidad determinista.
Los ejemplos concretos todavía varían en profundidad entre respuestas.

## Comprobaciones locales

- 91 pruebas de contratos de planificación, continuidad de gates y presupuesto
  del prompt: correctas. Los checks estáticos de voz se adaptaron a la redacción
  nueva; la evaluación de legibilidad está en el piloto, no en esos checks.
- Typecheck raíz correcto.
- Orquestador: 42.702 bytes, dentro del límite existente de 43.011; no se elevó.
- La instalación personal no se modifica ni se publica una release.
