# Continuidad de la investigación

La recepción del scout registra el estado de la evidencia y conserva la salida
original para recuperarla. Los diagnósticos quedan separados de las afirmaciones
aceptadas. La tarjeta de Pi muestra ese estado.

Tras fallos de citas/formato se reutiliza lo aceptado y se investigan las lagunas
con lecturas acotadas, sin escrituras ni nuevas raíces. Un helper no leído queda
pendiente; no demuestra que falte autorización.

Verificación conjunta con la PR de referencias: 3.298 pruebas correctas, cero
fallos; ambos typechecks y empaquetado host. Pruebas con componentes reales de
Pi cubren historial, vistas normal/expandida, otras herramientas y conservación
de mensajes originales incluso cuando el sobre del runner es inválido.

El ensayo opcional `bun tests/e2e/scout-recovery-live.ts` usa los modelos
configurados y lecturas reales del SDK sobre un proyecto temporal. Inyecta
explícitamente dos errores de cita en la entrega del informe para ejercitar
la recuperación, interrumpe al padre después de guardar el resultado y reabre
la sesión. Ese ensayo no simula ni corrige un fallo WebSocket del proveedor,
ni ejecuta el launcher completo de `pi-subagents`.

Resultado del ensayo: correcto. Scout `openai-codex/gpt-5.6-luna` leyó tres
archivos; padre `openai-codex/gpt-6-astra` recibió cuatro hallazgos aceptados,
reabrió la sesión y leyó únicamente el helper pendiente del proyecto. Hubo una
entrega del scout y una lectura adicional de política del arnés, registrada
aparte. Los archivos del proyecto permanecieron idénticos y no se creó SDD.
La [transcripción saneada](../tests/e2e/fixtures/scout-recovery-2026-09-16.json)
distingue evidencia generada, errores inyectados y límites del ensayo.
