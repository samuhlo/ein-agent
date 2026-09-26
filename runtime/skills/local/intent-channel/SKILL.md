---
name: intent-channel
description: Entrevista de decisiones antes de SDD o cuando el usuario pide hacer el intent, acordar o contrastar una idea. /ein:eh reformula sin actuar.
license: internal
---

# Canal de intención

El padre conduce la entrevista; los ejecutores reciben el acuerdo. Actívala antes
de un nuevo cambio SDD o cuando el usuario pide intent, también en lenguaje natural.
Una petición explícita de entrevista nunca se despacha con `record`. Para una
petición completa y autorizada sin decisiones de producto abiertas, `record`
conserva lo acordado sin inventar preguntas ni pedir confirmación adicional.
Para un cambio SDD, usa el mismo nombre en `work` y `change` tanto en `record`
como en `propose`; sin esa vinculación no se puede iniciar `scope`.
Conversar o investigar no inicia SDD.

## /ein:intent

Entrevista hasta alcanzar entendimiento compartido. Modela un **árbol de decisiones**:
cada respuesta abre las decisiones que dependen de ella. La **frontera** contiene
las que ya pueden responderse sin adivinar otras respuestas. Recorre esa frontera
por rondas, con alternativas concretas y tu recomendación razonada.

### Ronda 1 (first round)

Separa acuerdos del usuario, hechos comprobados y decisiones pendientes, con su
procedencia. El código demuestra qué ocurre hoy, no qué comportamiento se desea;
una hoja de ruta tampoco resuelve esa intención. Reutiliza acuerdos vigentes sin
volver a negociarlos. Sin petición ni contexto,
pregunta solamente qué quiere hacer; con contexto, empieza por la primera decisión real.

Busca dónde dos interpretaciones razonables producirían resultados distintos para
las personas afectadas: caso habitual, cambios posteriores y situaciones sin datos
o con errores. Usa solo escenarios relevantes al encargo, no un formulario fijo.
Si se superponen alcances, separa qué pertenece al trabajo de qué puede ver o hacer
cada papel. Resolver uno no decide el otro ni qué conjunto mide cada resumen.
Investiga lo comprobable; pregunta las decisiones de producto que sigan abiertas.

Explica la frontera completa en un mensaje: preguntas numeradas, alternativas
viables y una recomendación cuyo beneficio y coste sean visibles. Una alternativa
no debe ser una caricatura para que solo resulte razonable aceptar la tuya.
Usa `ask_user_question` para recoger esas mismas opciones y permitir respuesta libre.
Si no hay alternativas concretas o el selector falla, pregunta en texto.

### Rondas siguientes

Incorpora solo lo contestado y abre sus consecuencias con un caso concreto: «Si
elegimos esto, cuando ocurra aquello…». Antes de dar una rama por cerrada, comprueba
qué comportamiento todavía quedaría a elección del implementador.
Por ejemplo, «conservar para recuperar» puede dejar abierta la compatibilidad con
cambios posteriores. Expón ese caso si cambia el resultado; no conviertas el ejemplo
en una pregunta obligatoria para todos los proyectos.

Una respuesta parcial deja preguntas abiertas. Una corrección reabre solo las ramas
afectadas; un rechazo requiere entender qué falla en las opciones. Pedir estado,
cancelar un selector o explicar una opción no confirma el acuerdo.

Pregunta juntas hasta cuatro decisiones independientes por tanda. Si otra respuesta todavía abierta
cambiaría las opciones o tu recomendación, aplaza esa pregunta y registra dependsOn.
No inventes dependencias para serializar la conversación. Tampoco cierres una rama
solo porque el usuario eligió la recomendación o aceptó una presentación visual.
No hay cuota mínima: importa resolver decisiones, no contar preguntas ni confirmaciones.

### Hechos sin detener la entrevista

Los hechos los buscas tú; las decisiones son del usuario. Reutiliza evidencia
vigente. Para una consulta conocida basta una lectura puntual de hasta dos archivos;
para explorar usa `ein-scout` con contexto fresco, una incertidumbre concreta,
fuentes delimitadas y condición de parada. Pide únicamente evidencia que pueda
cambiar la siguiente decisión, con referencias y lagunas explícitas.

Presenta la frontera independiente antes de esperar la investigación. Si puede
continuar en segundo plano, hazlo. Una exploración pendiente bloquea solo sus
preguntas dependientes; si todas esperan hechos, espera sin dar el árbol por cerrado.
No repitas un scout para redescubrir evidencia aceptada. Si falta un ensayo, reutiliza
sus hallazgos para preparar comandos; consulta el protocolo de ensayos del runtime.

### Cierre y paso a SDD

Antes de revisar, contrasta el acuerdo con los escenarios relevantes: cada decisión
de comportamiento necesita respuesta o acuerdo previo identificable; cada hecho,
evidencia. Marca las exclusiones explícitas. Si el texto final introduce una regla
nueva, vuelve a su pregunta: no la conviertas en acuerdo dentro del resumen.
Deja al diseño los detalles que no cambian el resultado. Una lista de nodos cerrados
no demuestra cobertura, ni una confirmación global sustituye decisiones pendientes.

Presenta objetivo, decisiones, límites y criterios observables y pide una confirmación
final. No escribas intent.md ni inicies fases mientras el acuerdo siga abierto.
`scope` consume el contrato sin repetir la entrevista; una decisión nueva descubierta
por `map` vuelve al padre y reabre solo lo afectado.

En Pi, `ein_intent` es el único escritor: propose guarda la ronda; el recibo de ask
permite avanzar sin consultar status; review prepara el cierre y confirm exige una
respuesta nueva. Para ensayos, tandas de más de cuatro preguntas o recuperación,
consulta [el protocolo Pi](references/pi-protocol.md); no lo releas en cada ronda.
Si solo se pidió intent, termina al guardar. Si ya se autorizó planificar, continúa;
acordar el resultado no autoriza por sí solo apply ni entrega Git.

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
