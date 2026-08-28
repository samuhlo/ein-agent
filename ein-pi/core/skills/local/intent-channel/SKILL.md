---
name: intent-channel
description: Canal de intención pre-SDD — /ein:intent interroga la petición como árbol de decisiones y cierra a disco; /ein:eh restata sin actuar. Invocación explícita del usuario, único protocolo para ambos runtimes.
license: internal
---

# Canal de intención (`/ein:intent`, `/ein:eh`)

Este skill define, en un único lugar, el protocolo de dos comandos de invocación
**exclusivamente humana**: nunca lo ejecuta un agente por su cuenta, nunca aparece
en una instrucción de otro comando, y ningún prompt de coordinador lo carga por
defecto. Cada superficie (Pi, Claude) apunta aquí; ninguna reescribe estas reglas.

## /ein:intent

Modela la petición del usuario como un **árbol de decisiones** y recorre su
**frontera**: en cada ronda solo se preguntan las decisiones cuyos prerequisitos
ya están cerrados.

### Ronda 1 (first round)

La ronda 1 es la única parte del protocolo que un futuro llamador (el tercer eje
de preflight, todavía sin construir) podría querer pedir de forma aislada. Por eso
vive en su propia sección `##` addressable, separada del resto del flujo.

- Solo decisiones sin prerequisitos entran en la ronda 1.
- Cada pregunta va numerada y trae una recomendación.
- La ronda se entrega como **un solo mensaje de texto plano**, respondible de una
  sola vez (`"1A, 2B"`); nunca como un diálogo modal ni una pregunta a la vez.

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
- Al confirmar, se pide el nombre del cambio (si no existe ya) y se valida con
  `isSafeChangeName` — el mismo validador que usa el router, no uno nuevo.
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

## Artefact template

`intent.md` lleva frontmatter (`change`, `phase: intent`, `created`) y estas
secciones, en este orden:

```markdown
---
change: <nombre-del-cambio>
phase: intent
created: <ISO-8601>
---

## Petición

## Decisiones cerradas

## Hechos verificados

## Fuera de alcance

## Abierto
```

- Cada decisión cerrada registra la opción elegida y una línea del porqué.
- Cada hecho verificado trae una referencia `path:line` obtenida de `ein-scout`.

## Activación

Ambos comandos se invocan **únicamente** por el usuario, desde el prompt. Ningún
agente, herramienta ni instrucción de otro comando debe invocarlos por su cuenta;
la invocación explícita del usuario es el único disparador válido.

---

Basado en `grilling` de mattpocock/skills (MIT, Copyright 2026 Matt Pocock); Ein añade el cierre a disco vía `intent.md` y delega la búsqueda de hechos a `ein-scout`.
