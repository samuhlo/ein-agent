# Intent: entrevista, recibos y espera

Base: `4419e31` (PR #436). El checkout principal estaba en otra revisión; se trabajó en un worktree de origin/main sin modificar la instalación del usuario.

## Evidencia del caso original

En la sesión aportada del bloque 05, dos scouts y el ensayo muestran 54,9 s, 81 s y 24,5 s: 160,4 s de ejecución visible. No incluyen toda la coordinación ni el tiempo humano. Los contadores de tokens del widget no se usan como medida de coste facturado.

El transcript local conserva la llamada que produjo el recibo ilegible: `ein_intent` recibió `{ "action": "status" }`, sin `work`; la siguiente llamada con work recuperó la respuesta. No fue pérdida del resultado de ask.

## Cambio comprobable

- Preguntas por consecuencias y alternativas viables; hechos pendientes bloquean solo sus ramas.
- Lecturas puntuales de hasta dos archivos sin scout; investigación amplia sigue delegada.
- Protocolo Pi separado y cargado cuando hace falta, sin lectura obligatoria al arrancar.
- El hook del selector persiste primero y devuelve responseId y texto observado. Se elimina la consulta status obligatoria entre ask y la siguiente acción. Status sigue disponible para recuperación y admite omitir work dentro de una sesión con acuerdo.
- Cancelar otra tanda conserva respuestas y notas anteriores. Una cancelación del mismo cuestionario de revisión no conserva una autorización anterior.
- En revisión por selector, solo Confirmar acuerdo sin enmiendas permite confirm. Negativa libre, nota sin elección y confirmación con cambios mantienen el acuerdo pendiente. Las respuestas de chat siguen siendo interpretadas por el coordinador; este cambio no implementa un clasificador semántico universal.

## Evaluación conductual

Un evaluador independiente recibió solo la skill, un caso de cursos propios y hechos delimitados. Tras «conservar para recuperar», abrió la compatibilidad con cambios posteriores y mantuvo abiertas las respuestas pendientes. También detectó los casos de cancelación entre tandas y negativa libre que ahora tienen regresión automatizada.

El piloto real usa el modelo configurado de ein y tres mensajes idénticos. Aporta hechos controlados; no ejecuta scouts ni el motor de planificación. Comprueba acuerdo pendiente, respuesta parcial, explicación sin confirmación y ausencia de escritura SDD. La calidad de las preguntas se revisa en las respuestas guardadas, no se deduce del mero paso de asserts.

Reproducción desde la raíz (requiere el modelo configurado y la instalación de ein):

```sh
git show 4419e31:runtime/skills/local/intent-channel/SKILL.md > /tmp/ein-intent-baseline-skill.md
EIN_INTENT_PILOT_SKILL=/tmp/ein-intent-baseline-skill.md bun tooling/verify-intent-runtime.ts --block05
bun tooling/verify-intent-runtime.ts --block05
bun tooling/verify-intent-questionnaire.ts
```

Los pilotos comparan prompts sobre el mismo adaptador actual; no son una comparación integral entre dos releases. El fixture de ask usa el plugin nativo instalado y diálogos RPC controlados, sin intervención humana. El piloto conductual usa respuestas de chat. Ninguno acredita una aceleración end-to-end del caso original con scouts.

## Resultado medido

Modelo: `openai-codex/gpt-6-astra`. Una muestra de tres turnos por variante, sobre el adaptador actual.

| Variante | Primera respuesta | Tres turnos | Llamadas de herramienta |
| --- | ---: | ---: | ---: |
| Skill anterior | 32.1 s | 72.5 s | 3 |
| Skill revisada | 44.4 s | 83.6 s | 4 |

Respuestas y métricas completas, sin credenciales ni razonamiento interno: [fixture](intent-sharp-2026-09-14.json). El tiempo incluye modelo y herramientas, no espera humana. Las pruebas locales concurrentes y la variabilidad del proveedor impiden atribuir diferencias pequeñas solo al prompt. Las iteraciones previas con lectura obligatoria del protocolo tardaron 88,9 s y 82,7 s; se eliminó esa lectura del arranque normal.

En la segunda ronda revisada, la respuesta de conservar abre qué versión recuperar si el módulo ha cambiado. En la base, la segunda ronda se concentra en conservar evaluaciones y recuperación automática. Ambas mantienen el ensayo pendiente y responden a una explicación sin confirmar. Esto evidencia una diferencia útil en este caso, no superioridad universal.

## Validación

- Suite completa local: 3.259 pass / 0 fail; después, suite focalizada final: 108 pass / 0 fail.
- Typecheck raíz correcto; piloto del plugin nativo correcto.
- Empaquetado host correcto y validación de SKILL.md correcta.
- Los primeros intentos de suite estaban bloqueados por sockets del sandbox y por el template sin generar; la ejecución completa pasó al habilitar sockets y empaquetar.

La reducción del 50 % era una meta inicial, no un resultado acreditado. No se proclama optimalidad ni se extrapola una muestra pequeña a latencia de producción. La mejora determinista es quitar un viaje al modelo por respuesta de selector; la mejora conductual se documenta con los ejemplos reproducibles.
