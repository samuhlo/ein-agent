# Piloto de profundidad de intent

Comparación del 15 de septiembre de 2026 con `openai-codex/gpt-6-astra`, el modelo
configurado localmente. Baseline: skill de `64e0ae3`; candidata inicial: antes del
ajuste final sobre alcances superpuestos. Mismos
hechos, turnos y configuración en ambas variantes; sesiones nuevas por caso.

Las [conversaciones y sus decisiones](intent-depth-2026-09-15.json) quedan
adjuntas para revisar preguntas reales. El extracto conserva únicamente mensajes
visibles, decisiones, estado y métricas; omite eventos, razonamiento interno,
identificadores de sesión, rutas locales y autenticación.

## Reproducir

```sh
bun tooling/verify-intent-runtime.ts --depth=block06
bun tooling/verify-intent-runtime.ts --depth=ambiguous
bun tooling/verify-intent-runtime.ts --depth=partial
bun tooling/verify-intent-runtime.ts --depth=mechanical
bun tooling/verify-intent-runtime.ts --depth=natural06
bun tooling/verify-intent-runtime.ts --depth=block06 --skill=/ruta/baseline/SKILL.md
```

La baseline necesita conservar `references/pi-protocol.md` junto a la skill.
El piloto utiliza la autenticación instalada en un directorio temporal privado y
la elimina al salir. Imprime el directorio de resultados: `events.json` contiene
los turnos y herramientas; `result.json`, respuestas, árbol y tiempos por turno.
No publica credenciales. La revisión de calidad se hace sobre esas respuestas,
no mediante coincidencias de palabras en el prompt.

## Resultados de la candidata inicial

| Caso | Preguntas por ronda, baseline → candidata | Revisión de comportamiento |
| --- | --- | --- |
| Bloque 06 | 2/2/2 → 2/2/3 | Ambas mantienen pendientes cómputo, reasignación y vacío después de aceptar solo el resumen visual. Al pedir desglose, la candidata pregunta además qué módulos se muestran, separando mostrar, contar y abrir. |
| Avisos ambiguos | 2/1 → 3/1 | La candidata pregunta destinatarios desde la primera ronda. Ambas exploran la consulta posterior al elegir avisos internos y conservan eventos/frecuencia pendientes. |
| CSV, respuesta parcial y corrección | 3/3/4 → 3/3/4 | Ambas reabren el selector todas/filtradas sin decidir columnas ni confirmar. La candidata explora también el resultado ante errores; la baseline pregunta el caso vacío. |
| Texto de botón completamente definido | 0 → 0 | Ambas usan `record` y explican que el piloto carece de editor, sin inventar una entrevista. |

Una segunda muestra del bloque 06 produjo 2/2/2 preguntas en ambas variantes.
La candidata volvió a registrar la visibilidad del desglose como decisión pendiente,
esta vez dependiente del cómputo y del caso vacío; la baseline no añadió esa rama.
No todas las consecuencias se preguntan inmediatamente. Una ejecución adicional
de la candidata se interrumpió por WebSocket 1006 en el tercer turno; se repitió
completa con el mismo modelo y escenario, sin cambiar el prompt.

En las diez ejecuciones completas no hubo confirmación prematura ni fases SDD.
Las entrevistas no crearon archivos SDD; el caso mecánico solo registró `intent.md`.
Los números describen estas conversaciones; más preguntas por sí solas no prueban
mejor calidad. Las dos versiones conservaron los acuerdos heredados del bloque 05.

## Respuestas naturales y ajuste final

Se añadieron dos ejecuciones con los mismos hechos y respuestas sin recordatorios:
«Vamos con el 06, hagamos el intent.», «Resumen por anexo.» y «¿Qué pasa si cambio
los módulos asignados a un docente?». Baseline y candidata inicial mantuvieron el
acuerdo abierto: la presentación no decidió el cómputo y la pregunta sobre
reasignación produjo explicación y otra pregunta, no confirmación. Por tanto,
respetar esas respuestas parciales no es una mejora exclusiva de esta PR.

Ambas mezclaban en sus preguntas el alcance del curso parcial y la asignación del
docente. Esto motivó dos líneas genéricas para distinguir qué pertenece al trabajo,
qué ve o hace cada papel y qué conjunto mide cada resumen. El JSON identifica con
SHA-256 `baseline`, `candidate` anterior al ajuste y `final-candidate`; las muestras
anteriores no se atribuyen a la versión final.

Una ejecución adicional de `natural06` con la skill final pasa: mantiene pendientes
las decisiones después de las tres respuestas, sin revisar ni escribir SDD. Distingue
el recálculo del resumen y la conservación del trabajo al reasignar, aunque acaba
preguntándolos juntos. No explicita aún la selección del curso como rama distinta
de la asignación docente: el ajuste de instrucciones no demuestra por sí solo esa
cobertura. Hay trece ejecuciones completas archivadas; solo esta última usa la
skill final. La evaluación no justifica afirmar que todas las ramas estén cubiertas.

## Alcance y límites

Es una comparación controlada con hechos suministrados y respuestas de texto,
sin scout, selector nativo ni implementación. El modelo conoce qué decisiones aún
no tienen acuerdo; este ensayo no acredita que descubra solo todas las lagunas de
un repositorio. Las conversaciones parciales prueban continuidad, no calidad de
un cierre completo. No hay significación estadística ni medición de latencia real
del producto. Las pruebas del protocolo siguen cubriendo recibos, revisión y cierre.

Validación local: 77 pruebas de intent, canal y paridad; `bun run typecheck`;
validador `quick_validate.py` de la skill. Todas pasan.
