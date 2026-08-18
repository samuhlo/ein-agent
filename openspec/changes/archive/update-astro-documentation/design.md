# Design: update-astro-documentation

## A. Proposal

### Intent

Actualizar seis páginas públicas de Astro/Starlight para que expliquen con precisión el flujo SDD entregado, las superficies reales de Pi y Claude y sus límites de paridad. El contenido seguirá en español y distinguirá de forma explícita las capacidades disponibles, opcionales, desconocidas y diferidas.

### Scope

**Incluye:** cambios de contenido y, solo cuando la página lo requiera, de su frontmatter en las seis páginas mapeadas; descripción de los carriles `standard` y `micro`; postura TDD/carril persistida por cambio; superficies Pi y Claude; continuidad por disco; límites de Cleaner/Architect; estados fail-closed; Codegraph y Engram dentro de su alcance entregado; verificación documental enfocada.

**No incluye:** producto, adaptadores, comandos, instalador, tests, configuración SDD, otras páginas, rediseño visual, navegación global, arquitectura del sitio ni capacidades diferidas del roadmap. Este diseño tampoco autoriza una auditoría general del repositorio.

### Affected areas

| Página | Cambio de contenido diseñado |
| --- | --- |
| `docs-site/src/content/docs/02-workflow/workflow-overview.md` | Sustituir “las siete fases” como recorrido universal por dos carriles declarables. `standard` conserva `scope → map → design → tasks → apply → verify → close`; `micro` conserva `scope → design → apply → verify → close` y omite únicamente `map` y `tasks`. Explicar que carril y postura TDD se persisten por cambio, los leen Pi y Claude, no se heredan entre cambios y no se adivinan. Ajustar título, diagrama y secciones que contradigan este modelo. |
| `docs-site/src/content/docs/02-workflow/real-workflow-example.md` | Mantener el ejemplo histórico y señalar que representa un cambio archivado de carril `standard`, no un requisito universal. Aclarar que la postura TDD pertenece al cambio. No atribuir al ejemplo una ejecución `micro` que la evidencia no registra. |
| `docs-site/src/content/docs/04-reference/cli.md` | Añadir `/ein:status` y `/ein:settings` como superficies Claude. Documentar el panel vivo de Pi, su proyección del cambio activo, carril, fase y tareas desde `tasks.md`, y `ctrl+shift+e`. Presentar Codegraph como bootstrap asistido opcional cuando falta el índice, con modo `on` por defecto y `--no-codegraph`; conservar Engram como capacidad opcional y `--no-engram`. |
| `docs-site/src/content/docs/03-runtimes/claude-code.md` | Presentar Pi como runtime de referencia y Claude como relevo que consume decisiones compartidas del proyecto. Explicar la continuidad bidireccional Pi↔Claude mediante estado/checkpoint en disco, no mediante historial de conversación. Incorporar `/ein:status` y `/ein:settings`. Declarar Cleaner/Architect automáticos como Pi-only y deliberadamente ausentes/desactivados en Claude, donde su perfil se reporta como no aplicable o no soportado. Conservar las cautelas sobre traducción aproximada, MCP externo no ejercitado en vivo y ausencia de equivalencia 1:1. |
| `docs-site/src/content/docs/03-runtimes/runtime-matrix.md` | Reemplazar la equivalencia total por una matriz que separe capacidades compartidas comprobadas, superficies distintas y límites de paridad. Incluir Pi como referencia, Claude como relevo, decisiones de carril/TDD compartidas en disco y continuidad bidireccional por checkpoint/proyecto. Marcar Cleaner/Architect automáticos como Pi-only y mantener explícita la falta de paridad 1:1 de skills/herramientas, sesiones y MCP vivo. |
| `docs-site/src/content/docs/05-debug/known-limitations.md` | Relacionar `verify: pass` con los criterios declarados por el cambio y su carril, no con una garantía universal. Explicar que `unreadable`, `unsupported`, `inactive` y `unhandled` permanecen visibles y nunca se convierten en defaults ni en aplicación exitosa; solo `applied` representa una directiva inyectada. Añadir la opcionalidad de Codegraph y Engram compartido por cambio, la frontera Cleaner/Architect y que el puente entre runtimes es el proyecto/checkpoint mientras los historiales siguen privados. |

### Risks

- El copy puede volver a sobreafirmar paridad si mezcla continuidad de estado con equivalencia de sesiones, herramientas o MCP.
- El ejemplo histórico puede parecer una prescripción universal si su nota de contexto no queda cerca del flujo descrito.
- El frontmatter puede quedar desalineado si se inventan `sources` o `verified_rev` no respaldados.

### Rollback

Revertir únicamente los cambios de contenido/frontmatter de las seis páginas objetivo. No habrá estado de producto ni migraciones que deshacer.

### Success criteria

- Las seis páginas quedan en español y son coherentes entre sí sobre carriles, TDD, continuidad y paridad.
- Ninguna página presenta siete fases como flujo universal ni `micro` como omisión de fases distintas de `map` y `tasks`.
- Pi queda identificado como referencia y Claude como relevo con superficies y límites concretos.
- Los estados de traducción desconocidos o no aplicables permanecen visibles y fail-closed.
- La documentación no promociona como entregada ninguna capacidad diferida o no comprobada.
- La verificación enfocada de Astro/Starlight, frontmatter, enlaces y afirmaciones objetivo termina sin errores.

## B. Spec

### DOC-1 — Carriles y postura por cambio

La documentación **DEBE** describir `standard` como `scope → map → design → tasks → apply → verify → close` y `micro` como `scope → design → apply → verify → close`. **DEBE** indicar que `micro` omite solo `map` y `tasks`, y que el carril y la postura TDD se persisten por cambio para ambos runtimes, sin heredarse ni inferirse automáticamente.

**Escenario:** Dado un lector que compara ambos carriles, cuando consulta la vista general, entonces puede identificar exactamente las fases presentes y ausentes y entiende que carril y TDD pertenecen al cambio actual.

### DOC-2 — Contexto del ejemplo histórico

El ejemplo de flujo real **DEBE** conservarse como evidencia histórica de un cambio `standard` archivado y **NO DEBE** presentarse como recorrido obligatorio ni como evidencia de una ejecución `micro`.

**Escenario:** Dado el ejemplo archivado, cuando un lector lo contrasta con la vista general, entonces entiende por qué aparecen las fases estándar sin concluir que todos los cambios siguen ese carril.

### DOC-3 — Superficies y capacidades de referencia

La referencia CLI **DEBE** documentar el panel vivo y `ctrl+shift+e` en Pi, y `/ein:status` y `/ein:settings` en Claude. **DEBE** presentar el bootstrap de Codegraph y Engram como capacidades opcionales con sus opt-outs, no como dependencias obligatorias.

**Escenario:** Dado un usuario de Pi o Claude, cuando busca cómo inspeccionar el cambio o ajustar la integración, entonces encuentra solo la superficie disponible en su runtime y puede reconocer las capacidades opcionales.

### DOC-4 — Pi-first, relevo Claude y continuidad

Las páginas de runtimes **DEBEN** identificar Pi como runtime de referencia y Claude como relevo. **DEBEN** explicar que ambos consumen decisiones persistidas y pueden continuar trabajo en ambos sentidos mediante proyecto/checkpoint en disco; **NO DEBEN** equiparar esa continuidad con compartir conversación, sesión, skills, herramientas o servicios MCP en vivo.

**Escenario:** Dado un cambio iniciado en un runtime, cuando el usuario continúa en el otro, entonces la documentación dirige al estado persistido en disco y no promete recuperar el historial privado de la sesión anterior.

### DOC-5 — Frontera de Cleaner y Architect

La documentación **DEBE** declarar que la participación automática de Cleaner y Architect está disponible en Pi y deliberadamente desactivada o ausente en Claude. Claude **DEBE** reportar esa directiva como no aplicable o no soportada en vez de sugerir ejecución o paridad automática.

**Escenario:** Dado un proyecto que declara Cleaner o Architect y se abre en Claude, cuando el usuario consulta las capacidades, entonces ve la limitación explícita y no interpreta que esos perfiles participaron.

### DOC-6 — Traducción fail-closed

La página de limitaciones **DEBE** distinguir `unreadable`, `unsupported`, `inactive`, `unhandled` y `applied`. Solo `applied` **DEBE** describirse como directiva inyectada; cualquier estado desconocido, ilegible, no soportado, inactivo o sin traductor **DEBE** permanecer visible y **NO DEBE** convertirse silenciosamente en un default ni en éxito. La traducción puede seguir descrita como aproximada o best-effort, pero no como equivalencia.

**Escenario:** Dado un ajuste que Claude no puede leer, soportar o traducir, cuando se muestra su estado, entonces la documentación anticipa un resultado explícito distinto de `applied` y no una configuración predeterminada inventada.

### DOC-7 — Regla de evidencia shipped-vs-roadmap

Una capacidad **DEBE** describirse como entregada solo si la evidencia aceptada la confirma como construida o publicada. Una capacidad marcada como diferida **DEBE** aparecer únicamente como límite o trabajo futuro; una capacidad no comprobada **DEBE** omitirse o etiquetarse como desconocida/no verificada. Los metadatos `sources` y `verified_rev` **NO DEBEN** inventarse ni actualizarse sin respaldo de la revisión.

**Escenario:** Dada una afirmación del roadmap sobre paridad futura, cuando se incorpora a una página, entonces queda presentada como diferida y no como funcionalidad disponible.

### DOC-8 — Verificación acotada

La verificación **DEBE** limitarse a las seis páginas objetivo y al build documental. **DEBE** comprobar estructura/frontmatter, referencias o enlaces internos relevantes y restos textuales de las afirmaciones obsoletas; **NO DEBE** ampliarse a una auditoría general ni a suites de producto.

**Escenario:** Dadas las seis páginas actualizadas, cuando se verifica el cambio, entonces Astro/Starlight las procesa y las búsquedas acotadas no encuentran afirmaciones incompatibles con este diseño.

## C. Decisions

### Decisiones de arquitectura y trade-offs

1. **Corregir el modelo en cada contexto, no mediante una página nueva.** Las afirmaciones obsoletas viven en seis páginas con propósitos distintos; corregirlas localmente reduce enlaces indirectos y evita ampliar navegación o arquitectura.
2. **Separar continuidad de paridad.** El estado persistido permite relevo Pi↔Claude, pero no demuestra equivalencia de UI, sesiones, skills, herramientas ni MCP. La matriz hará visible esa diferencia en lugar de resumirla como “mismo ciclo”.
3. **Mantener el ejemplo como histórico.** Una nota contextual conserva su valor sin reescribir el pasado ni inventar un caso `micro`.
4. **Usar estados explícitos para incertidumbre.** El copy fail-closed prioriza exactitud sobre una experiencia aparentemente uniforme: ausencia de soporte nunca se redacta como éxito.
5. **Aplicar una puerta de evidencia.** Changelog/manifiesto y estado “construido” respaldan disponibilidad; el roadmap diferido solo respalda limitaciones o futuro. La incertidumbre no autoriza copy promocional.

### Boundaries de responsabilidad

- `workflow-overview.md` posee el modelo normativo de carriles y persistencia por cambio.
- `real-workflow-example.md` posee el contexto histórico de su ejemplo, no la definición general del flujo.
- `cli.md` posee las superficies invocables, el panel Pi y los opt-outs de capacidades opcionales.
- `claude-code.md` posee el relato operativo y las limitaciones específicas de Claude.
- `runtime-matrix.md` posee la comparación resumida entre capacidades compartidas, distintas y no equivalentes.
- `known-limitations.md` posee el significado fail-closed, el alcance de `verify: pass` y las limitaciones transversales.
- Las fases apply/verify posteriores poseen la edición y comprobación; este diseño no modifica `docs-site`.

### Alternativas rechazadas

- **Mantener “siete fases” y añadir una excepción:** se rechaza porque conserva un modelo universal falso.
- **Prometer paridad completa porque existe continuidad:** se rechaza porque el puente de disco no comparte conversaciones ni prueba herramientas/MCP equivalentes.
- **Simular Cleaner/Architect en Claude mediante copy:** se rechaza porque su paridad automática está deliberadamente ausente/diferida.
- **Normalizar estados desconocidos a defaults:** se rechaza por violar la postura fail-closed.
- **Actualizar páginas fuera de las seis mapeadas:** se rechaza porque excede la evidencia y el alcance aceptados.
- **Cargar dominios OpenSpec canónicos:** se rechaza porque el scope declara selección canónica `NONE` y no existe delta de comportamiento.

### Contexto canónico

No se seleccionaron especificaciones canónicas OpenSpec. Por tanto, no aplican ruta, SHA-256 ni conteo de bytes de `openspec/specs/<domain>/spec.md`.

## D. Success Criteria

El cambio será aceptable cuando:

- `cd docs-site && bun run build` finalice correctamente y valide lo que Astro/Starlight cubre de contenido, schema y referencias.
- Una comprobación textual limitada a las seis páginas no encuentre un flujo universal de siete fases, equivalencia completa de runtimes, Cleaner/Architect automáticos en Claude ni traducción desconocida presentada como default o éxito.
- La revisión manual de esas seis páginas confirme el orden exacto de ambos carriles, la persistencia por cambio y el sentido bidireccional Pi↔Claude mediante disco/checkpoint.
- Los frontmatters `sources`/`verified_rev` y enlaces internos de las páginas editadas sean válidos y estén respaldados, sin revisiones inventadas.
- Codegraph, Engram, MCP, skills/herramientas y `verify: pass` mantengan sus límites y opcionalidad explícitos.
- El diff quede restringido a las seis páginas de `docs-site` durante apply y al artefacto SDD de este cambio; no se modifique producto ni configuración ejecutable.
