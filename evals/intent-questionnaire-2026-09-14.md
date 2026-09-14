# Intent con selector y TODO — 14 de septiembre de 2026

## Comportamiento

El padre conserva la explicación humana y presenta alternativas concretas.
`ein_intent propose` guarda el árbol y el cuestionario; `ask_user_question`
recoge las elecciones con el plugin existente, incluida su respuesta libre.
La revisión final ofrece Confirmar acuerdo, Ajustar acuerdo y Cancelar.
El TODO muestra intent desde antes de crear un directorio SDD y mantiene su
estado durante las rondas, la revisión y la reapertura.

## Procedencia y continuidad

El adaptador empareja `tool_call` y `tool_result` del cuestionario con su
sesión, revisión, preguntas y opciones guardadas. Solo acepta respuestas con
el contrato estructurado del plugin: no analiza el texto del resultado ni
convierte mensajes de herramientas en mensajes humanos. La fuente persistida
es `ask_user_question`; las otras superficies pueden leerla con el validador
compartido. Las respuestas no actualizan la autorización de entrega Git.

El plugin admite cuatro preguntas por llamada: las tandas de una frontera
mayor comparten revisión y conservan sus respuestas. Un cuestionario ajeno,
obsoleto, cancelado o fallido no confirma el intent. Cancelar el selector deja
el acuerdo pendiente; elegir Cancelar en la revisión es una decisión que el
padre debe aplicar al trabajo. Ajustar y Cancelar no permiten llamar a confirm.
Sin plugin disponible se conserva la conversación por texto.

## Evidencia

- Suite completa durante la implementación: 3.248 pruebas, cero fallos.
- Typecheck y empaquetado del template correctos.
- `bun tooling/verify-intent-questionnaire.ts`: usa el paquete realmente
  instalado `@juicesharp/rpiv-ask-user-question` 2.10.1 con su implementación RPC.
  Verifica opciones, respuesta libre, recepción por intent, cancelación sin
  confirmación, revisión mediante selector y TODO antes de scope.
- `bun tooling/verify-intent-runtime.ts --block04 --questionnaire`: ejecuta el
  padre con su modelo configurado, la skill y el plugin real. El host de prueba
  cancela el diálogo de forma programada. Exige explicación antes del selector,
  alternativas concretas, ramas dependientes guardadas y cero escrituras SDD.
  Distingue cancelación real de error de herramienta; no exige volver a preguntar
  después de cancelar. Los eventos quedan solo en el directorio temporal impreso.
- Las pruebas focalizadas cubren tandas, notas, respuestas ajenas y obsoletas,
  opciones inventadas, revisión no confirmada, reanudación y anchuras del TODO.

No se ha modificado la instalación personal. La prueba nativa usa el camino RPC
real con respuestas programadas; no es una evaluación visual manual de la TUI.
El modelo sigue siendo responsable de formular alternativas pertinentes y de
interpretar el texto libre. Los checks estructurales no prueban toda esa semántica.

## Incidente Git de la sesión aportada

La delegación a sdd-scope contenía una lista «Excluidos app/, .design/,
shared/types/academia.types.ts, … commits/push/PR/publicación». El detector
no reconocía esa forma de exclusión y pedía autorización de entrega. La
regresión reproduce la lista con rutas que contienen puntos; la corrección
elimina únicamente los términos excluidos y conserva una petición afirmativa
en otra cláusula. No cambia los permisos ni concede autorización por confirmar
intent. El control existe contra este falso positivo concreto y puede retirarse
cuando el contrato de entrega deje de depender de esta clasificación de texto.
