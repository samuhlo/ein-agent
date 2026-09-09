---
name: intent-channel
description: Canal de intención pre-SDD — /ein:intent interroga la petición como árbol de decisiones y cierra a disco; /ein:eh restata sin actuar. Descubrimiento automático antes de cambios; entrada manual /ein:intent.
license: internal
---

# Canal de intención (`/ein:intent`, `/ein:eh`)

Este protocolo también se activa automáticamente antes de trabajo modificador nuevo. El padre conduce las decisiones; `/ein:intent` entra explícitamente en la misma conversación. `/ein:eh` sigue siendo exclusivamente humano.

En Pi usa `ein_intent`: `propose` guarda la ronda en sesión, muestra sus preguntas y espera; `status` recupera la respuesta real y su `responseId`; `confirm` incorpora únicamente decisiones contestadas y guarda el acuerdo. Rechazo o cancelación nunca confirman. Si quedan decisiones, abre otra ronda. Para SDD, `change` y `work` comparten nombre; para cambios pequeños omite `change` y conserva el acuerdo en sesión. Reutiliza acuerdos idénticos; `auto` no omite esta conversación. `delegate` solo permite omitir preguntas si el mensaje humano actual lo pide explícitamente (“sin preguntas / without questions”); registra el objetivo, los límites y los supuestos delegados.

## /ein:intent

Modela la petición del usuario como un **árbol de decisiones** y recorre su
**frontera**: en cada ronda solo se preguntan las decisiones cuyos prerequisitos
ya están cerrados.

### Ronda 1 (first round)

La primera ronda sirve también para el arranque automático. En un cambio pequeño basta una pregunta concreta; no preguntes de nuevo lo que el usuario ya explicó.

- Solo decisiones sin prerequisitos entran en la ronda 1.
- Cada pregunta va numerada y trae una recomendación.
- La ronda se entrega como **un solo mensaje de texto plano**, respondible de una
  sola vez (`"1A, 2B"`); nunca como un diálogo modal ni una pregunta a la vez.
- **Arranque en frío**: si no hay petición inicial ni contexto previo, la ronda 1
  es una sola pregunta abierta y llana (`"¿qué quieres hacer?"`), nunca un
  formulario. Si llega una petición inicial, la ronda 1 ya modela el árbol sobre
  ella y no vuelve a preguntar qué quiere.
- **Forma de las opciones**: cada opción es una respuesta concreta ya redactada,
  que el usuario acepta, matiza o rechaza tal cual. Nunca una plantilla con
  huecos entre corchetes para que la rellene él — si no hay una respuesta
  concreta que proponer, la pregunta todavía no está lista para la ronda.

### Rondas siguientes

- Regla: los hechos los busco yo, las decisiones son tuyas — toda búsqueda de hechos se
  delega a `ein-scout` y **no bloquea** la emisión de la ronda — la ronda sale con
  lo que ya se sabe, y los hallazgos de scout (con referencia `path:line`) se
  incorporan a la ronda **siguiente**, nunca retrasando la actual.
- Nunca se le pregunta al usuario algo que el código ya contesta.
- Ninguna decisión se toma en nombre del usuario.
- La sesión termina cuando la frontera queda vacía: no quedan decisiones sin
  prerequisito cerrado. En ese punto se pide confirmación explícita antes de
  escribir nada.

### Cierre y confirmación (R8, R9)

- **Nada se escribe a disco hasta la confirmación del usuario.** Abandonar la
  sesión a mitad de camino deja el árbol de trabajo intacto: ni directorio nuevo,
  ni artefacto parcial.
- El padre propone un nombre descriptivo para el cambio; no obliga al usuario a inventarlo. `ein_intent` valida el nombre con el router.
- Se escribe **exactamente un fichero**: `openspec/changes/<change>/intent.md`
  (fallback `.sdd/changes/<change>/intent.md` si esa es la raíz activa).

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

## Artefacto canónico

`ein_intent` escribe `intent.md` con objetivo, límites, criterios de éxito, preguntas y la respuesta íntegra observada. Su bloque estructurado y su vista humana tienen un único escritor; no los edites a mano. El `materialKey` liga las fases a lo acordado. Las nuevas rondas de un cambio existente mantienen un estado pendiente durable para impedir que otra sesión continúe con el acuerdo anterior.

## Ejecución

- **Nada de exploración directa del coordinador.** Todo hallazgo de repositorio
  (código, configuración, historial) se delega en `ein-scout`; el coordinador
  no lee, busca ni explora el árbol por su cuenta durante la sesión. La
  delegación no bloquea la ronda en curso (ver regla de rondas siguientes).
- La escritura del acuerdo pasa por `ein_intent`; los agentes leen el fichero y nunca fabrican la respuesta del usuario.

## Activación

`/ein:intent` es la entrada explícita; el orquestador usa el mismo protocolo automáticamente para nuevos cambios. `/ein:eh` solo se invoca por el usuario.

---

Basado en `grilling` de mattpocock/skills (MIT, Copyright 2026 Matt Pocock); Ein añade el cierre a disco vía `intent.md` y delega la búsqueda de hechos a `ein-scout`.
