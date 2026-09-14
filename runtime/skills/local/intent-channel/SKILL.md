---
name: intent-channel
description: Entrevista de decisiones antes de SDD o cuando el usuario pide hacer el intent, acordar o contrastar una idea. /ein:eh reformula sin actuar.
license: internal
---

# Canal de intención

El padre conduce esta conversación; los ejecutores reciben después el acuerdo.
Actívala cuando el usuario pide intent en lenguaje natural o con `/ein:intent`,
y antes de un nuevo cambio SDD. Lee el contexto ya disponible: un bloque de una
hoja de ruta describe trabajo, pero no demuestra que sus decisiones estén resueltas.
Una petición explícita de entrevista nunca se despacha con `record`.
Para trabajo mecánico completo y autorizado, `record` conserva la petición sin
inventar una entrevista. Conversar o investigar no inicia un cambio SDD.

## /ein:intent

Construye un árbol de decisiones sobre el resultado que quiere el usuario.
Cada decisión abre otras que dependen de ella. Recorre el árbol por rondas hasta
alcanzar entendimiento compartido; no lo reduzcas a confirmar un resumen del alcance.

### Ronda 1 (first round)

Adopta decisiones ya explícitas en la petición o en documentación acordada,
con su referencia. Busca las interpretaciones diferentes que producirían resultados
materialmente distintos: actores, relaciones, reglas, escenarios y límites relevantes
para esta petición. No uses ese listado como formulario fijo.

La **frontera** son todas las decisiones cuyos prerequisitos están resueltos.
Antes de incluir una pregunta, comprueba: si el usuario eligiera otra respuesta
a una decisión aún abierta, ¿cambiarían sus opciones o tu recomendación? Si sí,
registra esa dependencia y aplázala. Por ejemplo, acordar una identidad con varios
papeles puede abrir la elección de contexto de entrada; esa entrada condiciona
la cabecera. No presentes las tres como decisiones independientes ni marques
todas las dependencias vacías por conveniencia.

Explica toda esa frontera en texto humano: preguntas numeradas, alternativas
concretas y una recomendación razonada por pregunta. Después recoge las respuestas
con `ask_user_question`. La explicación y sus consecuencias permanecen en el chat;
el selector facilita elegir, matizar o escribir una respuesta libre.
No limites la ronda a una pregunta ni a un cupo fijo; tampoco fuerces preguntas
sobre algo ya resuelto. Sin petición ni contexto, pregunta solamente qué quiere hacer.

Ejemplo de formato:

**1. Identidad de la cuenta.** ¿Una persona puede enseñar y gestionar un centro
con la misma cuenta, o son altas independientes?
Recomiendo una cuenta con ambos contextos si una misma persona puede ejercerlos:
evita duplicar su identidad y permite cambiar de contexto.

Ese ejemplo ilustra una decisión, no una pregunta obligatoria. Si la identidad
ya está acordada, empieza por la siguiente decisión abierta.

### Rondas siguientes

Después de cada respuesta, incorpora únicamente lo contestado y recalcula el árbol.
Las preguntas dependientes de una decisión abierta pertenecen a una ronda posterior.
Una respuesta parcial mantiene las demás abiertas. Explicar una alternativa, rechazar
una recomendación o pedir estado no confirma nada. No reformules la misma pregunta
cuando el usuario ya la resolvió; abre sus consecuencias.

Los hechos estáticos los busca `ein-scout` con contexto fresco y referencias `path:line`.
Si hace falta ejecutar un ensayo local, usa `ein_intent investigate`: reutiliza
la autorización ya observada (responseId de la respuesta o del historial), vincula
el ensayo a su hecho pendiente y aporta objetivo, raíces de lectura y comandos
exactos. La herramienta devuelve un encargo acotado a `sdd-verify`; ejecútalo tal
cual. Este modo produce evidencia, sin exigir cerrar el intent ni crear una fase
SDD. No delegues un ensayo como una verificación SDD ordinaria.

Tras recibir el resultado, incorpora los hechos sustentados mediante propose y
presenta la siguiente ronda en ese mismo turno. No hace falta otro «vamos».
Un rechazo técnico no invalida el permiso del ensayo: corrige el encargo dentro
de su alcance y reutiliza la respuesta guardada, sin pedir autorización de nuevo.
No ofrezcas saltarte el arnés ejecutándolo directamente. Una ampliación material
sí requiere una nueva decisión humana. Un ensayo fallido puede aportar evidencia;
no cambies código ni conviertas su fracaso en aprobación de una solución.
Nunca preguntes al usuario algo que puedes investigar. Una exploración pendiente
es un prerequisito sin resolver: espera solo para sus preguntas dependientes y
plantea las independientes. Si toda la frontera espera hechos, espera los resultados;
una frontera temporalmente vacía no significa que el árbol esté resuelto.

### Estado y cierre en Pi

Usa `ein_intent` como único escritor:

- `propose`: guarda la ronda, el material provisional y `questionnaire`: question,
  header (hasta 16 caracteres), options (2–4 alternativas con label y description),
  multiSelect solo para elecciones combinables. La recomendación va primero y
  marcada como tal. No añadas «Otra»: el plugin incorpora respuesta libre. Mantén
  las alternativas concretas; «seguir» frente a «no seguir» no explora una decisión.
  `questions` se deriva automáticamente de questionnaire. Da un title corto al
  acuerdo y a sus nodos. Conserva `decisions` (kind: decision/fact/permission, id, question,
  dependsOn, status open/waiting/resolved; incluye tanto la frontera actual como
  las preguntas futuras conocidas que todavía dependen de ella, no solo lo que
  vas a preguntar hoy. resolution explica la decisión y su
  respuesta o fuente). Conserva las ramas anteriores, incluidas las descartadas
  explícitamente, y añade las descubiertas. Explica las preguntas y llama a `ask_user_question` con el questionnaire devuelto
  sin cambiar sus preguntas ni opciones. El plugin admite hasta cuatro por llamada:
  divide una frontera mayor en tandas de la misma ronda, sin avanzar decisiones
  dependientes entre tandas. No vuelvas a propose para abrir cada tanda.
- `status`: recupera la respuesta observada y su `responseId` después del selector;
  también tras reanudar. Sus respuestas no son mensajes de chat: el runtime las
  vincula al cuestionario y revisión exactos. No las copies a un input inventado.
  Cancelar el selector no confirma ni cancela por sí solo el trabajo.
- Otra `propose` incorpora la respuesta y abre la siguiente frontera. No cierres
  con `confirm` por haber contestado una ronda.
- `review`: cuando todas las ramas estén resueltas, pasa el árbol completo y el
  `responseId` de la última ronda. Presenta el objetivo, decisiones, límites y
  criterios observables devueltos. Recoge esa decisión con el questionnaire final devuelto: Confirmar acuerdo, Ajustar acuerdo o Cancelar.
- `confirm`: solo tras una nueva respuesta afirmativa a esa revisión final, obtenida mediante status.
  Una corrección requiere actualizar el acuerdo y revisarlo de nuevo.
- `cancel`: detiene el trabajo. `delegate` requiere una instrucción humana explícita
  de decidir sin preguntas; `auto` no equivale a esa instrucción.

No se crea un directorio de cambio durante la primera entrevista. El estado vive
en la sesión durable; al confirmar se escribe `intent.md`. Reabrir un acuerdo ya
existente sí actualiza su estado pendiente para impedir que otra sesión ejecute
un acuerdo obsoleto. El padre propone el nombre; el runtime lo valida.

Consulta el nextAction devuelto por status: distingue incorporar respuestas,
preparar/ejecutar evidencia, esperar un ensayo real, incorporar su resultado y
abrir la siguiente ronda. Un hecho pendiente sin ensayo arrancado no es una espera.
El TODO muestra un resumen de actividad y siguiente paso; su atajo despliega detalles.
No cuentes hechos ni permisos como decisiones de producto.

Si el plugin no está disponible, falla o la pregunta todavía no tiene alternativas
concretas (por ejemplo el arranque en frío), usa texto y espera la respuesta real.
No simules que el selector obtuvo una respuesta ni exijas instalarlo para conversar.
El TODO muestra intent desde esta conversación, sus decisiones pendientes y su
revisión; al confirmar, continúa mostrando intent como completado antes de scope.

### Paso a SDD

Para SDD, `work` y `change` coinciden; para trabajo pequeño se conserva el acuerdo
en sesión. `intent.md` es el contrato canónico: scope lo consume, no repite la
entrevista. Una nueva decisión de producto descubierta por map vuelve al padre;
reabre solo las ramas afectadas. Reutiliza el resto del acuerdo con su procedencia.

Acordar qué se quiere no autoriza a implementarlo. Si se pidió solo intent, termina
al guardar el acuerdo. Si ya se autorizó continuar con planificación, continúa;
la autorización de apply y entrega pertenece a sus controles existentes.

## /ein:eh

Restata el último mensaje del usuario en lenguaje llano, con el vocabulario del
proyecto — nunca actúa, nunca edita, nunca delega, nunca investiga. No es un
resumen técnico ni una propuesta de plan: es una traducción a español corriente
de lo que se acaba de pedir, para que el usuario confirme que se entendió bien
antes de que nada se ejecute.

La superficie Claude aplica esto declarando `allowed-tools` vacío, así la
restricción la impone el runtime, no solo la prosa.

### Qué mensaje se restata

`/ein:eh` se dispara con un mensaje de usuario, así que "el último mensaje" se
autorreferencia si no se define. El objetivo es **el último mensaje escrito por
el usuario en prosa, anterior a esta invocación**.

- No cuentan como objetivo la invocación de `/ein:eh`, su kickoff, ni ninguna
  otra invocación de comando ni su expansión: se salta hacia atrás hasta la
  última prosa del usuario.
- Si no hay ninguno, se dice en una línea y se para. Nunca se restata la propia
  invocación, nunca se inventa una petición.
- Si esa petición ya se ejecutó, se restata igual, en pasado, sin proponer un
  siguiente paso ni volver a actuar.

## Continuidad y Claude

El bloque estructurado de `intent.md` y su vista humana tienen un único escritor;
no los edites a mano. El `materialKey` liga las fases al material acordado.
En Claude aplica las mismas rondas y revisión final; registra el acuerdo con
`ein-cc-sdd intent <change> record` (JSON por stdin, contrato en `--help`). Conserva
la respuesta literal con procedencia `claude-coordinator`, sin simular recibos Pi.
No delegues fases mientras haya decisiones pendientes.

---

Adaptado de [grilling](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md)
de Matt Pocock (MIT, Copyright 2026 Matt Pocock). Ein añade persistencia, revisión
versionada y consumo del acuerdo por SDD.
