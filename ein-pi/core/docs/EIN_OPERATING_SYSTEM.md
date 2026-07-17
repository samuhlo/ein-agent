# Ein, explicado fácil

Author: samuhlo

Este documento explica Ein como si nunca lo hubieras visto. Sin tecnicismos donde no hacen falta.

## ¿Qué es Ein?

Ein es tu **ayudante de programación**. Funciona encima de un programa llamado **Pi**. Piensa en Pi como el motor, y en Ein como el coche montado a tu gusto: tus reglas, tus colores, tus atajos.

Cuando abres Pi, hablas con Ein en lenguaje normal ("añade un botón aquí", "arregla este bug") y Ein decide cómo hacerlo: lo hace él mismo si es pequeño, o reparte el trabajo entre **ayudantes especializados** (subagentes) si es grande.

## Las 3 cosas que tienes que saber

1. **Hablas normal.** No necesitas memorizar comandos. Los comandos `/ein:*` son botones de emergencia para control manual.
2. **Para trabajo serio, Ein usa SDD.** Es una forma ordenada de trabajar en 5 pasos (lo vemos abajo).
3. **Ein recuerda y se mantiene solo.** Tiene memoria entre sesiones y puede actualizar sus propias capacidades (skills).

---

## Instalar Ein (en cualquier ordenador)

Una sola línea en la terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
```

Esto descarga el instalador y **abre un menú bonito** (con tu paleta brutalista de marca). Desde ahí eliges qué hacer. La primera vez, elige **Install**.

El instalador, paso a paso:
1. Mira tu ordenador (Mac o Linux, qué procesador, qué terminal).
2. Instala lo que falte: `bun` y `pi` (obligatorios), `engram` y `gh` (opcionales).
3. Te pregunta si quieres **Linear** (gestor de tareas). Si dices que no, no lo instala.
4. Copia Ein a su sitio (`~/.pi/agent`) y ajusta las rutas a TU ordenador automáticamente.
5. Te pregunta por tus claves secretas (opcional).
6. Pasa el "médico" (doctor) para confirmar que todo está bien.

Comandos del instalador (en la terminal, no dentro de Pi):

```bash
ein            # abre el menú
ein install    # instala o repara Ein
ein update     # actualiza Ein y Pi (hace copia de seguridad antes)
ein doctor     # revisa que todo esté bien
ein uninstall  # quita Ein (NO borra tus claves ni tus sesiones)
ein restore    # vuelve a una copia de seguridad anterior
```

Nunca toca tu `auth.json`, tus sesiones ni tus copias de seguridad.

---

## Cómo trabajar día a día

Abre Pi escribiendo `pi` en la terminal. Verás el banner EIN en blanco concreto con la I amarilla y tu nombre debajo: **SAMUHLO · PI WORKBENCH**.

**Regla de oro:**
- Tarea pequeña (un typo, un ajuste visual, una pregunta) → Ein lo hace directo.
- Tarea seria (una feature, un bug difícil, varios archivos) → Ein usa SDD.

Ejemplos de cosas que puedes decirle:
- `"Nueva tarea: añade un selector de fechas. Móntala en Linear y prepara SDD"`
- `"continúa con SDD"`
- `"aplica el primer batch"`
- `"verifica"`

---

## SDD: trabajar en orden (5 pasos)

SDD es la forma seria de trabajar. Son 5 fases, cada una hecha por un ayudante distinto:

```
scope → map → design → tasks → apply → verify → close
```

- **init**: entiende el proyecto.
- **map**: mira el código antes de tocar nada (qué hay, qué riesgos).
- **design**: hace el plan (propuesta + especificación + lista de tareas).
- **apply**: programa, en trozos pequeños, con tests.
- **verify**: comprueba que todo funciona de verdad.

Para empezar SDD en un proyecto: `/ein:ai:install-sdd`. Luego trabajas hablando normal ("continúa con SDD").

---

## Modelos (el "cerebro" que usa Ein)

Ein **no fija modelos concretos a propósito**: salen modelos nuevos y cambian de precio cada semana, así que cualquier lista hardcodeada se pudre en silencio. Lo que no caduca es **el rol de cada agente**.

Configúralo a mano con **`/ein:models`**, que te dice la **recomendación por rol** y marca con `!` los agentes cuyo esfuerzo se desvía:

- **Razonan** (modelo capaz, esfuerzo alto): el **orquestador** y **sdd-design** — son las compuertas de decisión.
- **Leen y verifican** (barato, esfuerzo medio): `sdd-map`, `sdd-verify`.
- **Ejecutan** (esfuerzo **bajo**): `sdd-apply`, `sdd-scope`, `sdd-tasks`, `sdd-close`, entrega.

Dos ideas clave sobre el coste:
- **El coste lo controla el esfuerzo (thinking), no abaratar el modelo.** Un esfuerzo bajo gasta poco por turno.
- **Abaratar el modelo no ahorra: flaquea.** Un modelo barato en `sdd-apply` llegó a dar 135 turnos de prueba y error en un grupo con TDD estricto. Por eso apply se recomienda **capaz + esfuerzo bajo**: pocos turnos en trabajo mecánico y sin atascarse cuando toca razonar.

> Tras cambiar el modelo del orquestador, reinicia Pi para que tome efecto. Los subagentes cambian al instante.

---

## Skills: el conocimiento extra de Ein

Una **skill** es un manual corto sobre una tecnología o una forma de trabajar. Ein las usa para hacer mejor su trabajo. Hay **3 capas**:

1. **Locales** (`skills/local/`): tus reglas propias (cómo comentas, cómo haces commits, tu disciplina). Son tuyas, nadie más las tiene. Se sincronizan desde tu repo de GitHub.
2. **Bajadas** (`skills/downloaded/`): un grupo **pequeño y de confianza** traído de fuentes buenas (onmax para Nuxt, antfu para Vue, greensock para GSAP, vercel, etc.).
3. **Context7**: para todo lo demás (drizzle, zod, tailwind, postgres...), Ein **pide la documentación fresca en el momento**, sin guardar un manual que se quede viejo.

La idea: pocas skills pero buenas, y para el resto, documentación al día con Context7.

Comandos de skills (dentro de Pi):

```text
/ein:skills                    → ver el estado (qué hay, qué cambió)
/ein:skills update             → actualiza locales (tu repo) + bajadas (sus fuentes)
/ein:skills update --local     → solo las locales
/ein:skills update --downloaded→ solo las bajadas
/ein:skills add <skill>        → instala una skill del catálogo
/ein:skills clean              → enseña qué sobra (fuera de tu stack)
/ein:skills clean --yes        → borra lo que sobra
/ein:skills:advisor <tarea>    → te dice qué skills usar para una tarea concreta
```

**El advisor con Context7:** cuando le pides ayuda para una tarea, Ein mira qué tecnologías hay. Si tiene skill curada, la usa. Si no (por ejemplo "drizzle" o "zod"), te dice que traiga la doc fresca de Context7. Así nunca trabaja a ciegas.

Para cambiar el catálogo de skills, edita `~/.pi/agent/skills/stack-profile.json`: ahí están las listas `core`/`secondary`, el `catalog` (de dónde sale cada skill) y el mapa `context7` (qué tecnologías van por Context7).

---

## Linear y GitHub

- **Linear** = tu tablero de tareas.
- **GitHub** = donde entregas el código (ramas, PRs).
- `ein-linear` es el ayudante para Linear; `ein-git` para GitHub.

Comandos de Linear:

```text
/ein:linear:new <petición>                 → crea o reutiliza una issue
/ein:linear:project-bootstrap <proyecto>   → crea proyecto + milestones + issues base
/ein:linear:milestones <proyecto>          → lista los milestones
/ein:linear:help                           → ayuda de Linear
```

---

## Sesiones recientes

Al abrir Pi, el banner muestra tus **sesiones recientes** (de todos los proyectos, con su antigüedad). Para retomar una:

- `pi -c` → continúa la última sesión.
- `pi -r` → elige una de una lista.
- `pi --session <id>` → abre una concreta. El comando `/ein:resume` (dentro de Pi) te lista las recientes con su `id` listo para copiar.

## Diagnóstico (¿está todo bien?)

```text
/ein:status          → vista rápida del sistema
/ein:help            → lista de comandos (usa /ein:help full para todo)
/ein:doctor          → revisión completa y explicada
/ein:doctor-output   → revisión técnica rápida (8 grupos de checks)
```

Si el doctor dice `FAIL`, hay algo roto: arréglalo antes de entregar nada. Si dice `OK`, todo en orden.

---

## Persona (cómo te habla Ein)

```text
/ein:persona           → ver la persona activa
/ein:persona samuhlo   → modo docente (explica bien, con estructura)
/ein:persona neutral   → modo directo (texto plano, sin adornos)
```

En modo `samuhlo`, ante un **cambio importante** (nueva dependencia, patrón nuevo, endpoint, decisión de arquitectura, código no trivial, seguridad) Ein **te enseña cómo funciona por dentro**: qué hace cada pieza nueva y cómo encajan entre sí, el mecanismo real paso a paso — no un simple parte de "qué hice". Lo trivial (un typo, un ajuste pequeño) sigue siendo breve.

La persona decide el **tono**. El **idioma** se elige aparte (siguiente sección).

---

## Idioma (en qué lengua te habla y escribe)

Ein separa el idioma en **dos cosas distintas**, y las eliges con `/ein:lang`:

1. **Cómo te habla y la interfaz** (la ayuda, los paneles, los avisos). Por defecto en español; se detecta de tu sistema (`LANG`).
2. **Lo que escribe fuera** (los PR, los commits, las issues de Linear). Por proyecto: por defecto el mismo que usa para hablarte, pero lo puedes poner distinto.

¿Para qué sirve separarlos? Para poder, por ejemplo, **hablar con Ein en castellano pero que los PR y las issues salgan en inglés** (útil en repos internacionales).

```text
/ein:lang   → elige idioma de conversación/UI y, aparte, de los artefactos
```

Hoy hay **español** e **inglés**. El cambio se aplica al reiniciar Pi o abrir una sesión nueva.

---

## Seguridad (lo importante)

- Ein **nunca** toca tus secretos ni tu `auth.json`.
- Tiene guardrails: no ejecuta comandos peligrosos (como borrar cosas a lo bruto) sin confirmar.
- Antes de cambiar su propia configuración, hace copia de seguridad.

---

## Si algo se rompe

1. `/ein:doctor` para ver qué falla.
2. `/ein:doctor-output` para el detalle técnico.
3. Desde la terminal: `ein restore` para volver a una copia anterior.

---

## Futuro (todavía no hecho)

- **Multi-perfil (Fase 2b):** poder tener varios perfiles (`profiles/<persona>.json`), cada uno con su propia persona y su propio stack de skills. Así otra persona podría instalar Ein con un stack distinto al tuyo. La base ya está lista (el `stack-profile.json` es un perfil con nombre), solo falta el selector. **No está construido todavía.**
