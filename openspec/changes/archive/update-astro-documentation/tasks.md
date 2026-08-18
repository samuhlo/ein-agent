# Tasks — update-astro-documentation

status: ready
blocked_by: none

## // 001. Actualizar el modelo de carriles y el ejemplo histórico

Archivos exactos:
- `docs-site/src/content/docs/02-workflow/workflow-overview.md`
- `docs-site/src/content/docs/02-workflow/real-workflow-example.md`

- [x] 1.1 Reescribir la vista general para documentar `standard` (`scope → map → design → tasks → apply → verify → close`) y `micro` (`scope → design → apply → verify → close`), indicando que `micro` omite únicamente `map` y `tasks`, y que carril y postura TDD se persisten por cambio, no se heredan ni se infieren.
  - skills: `document-writer`, `cognitive-doc-design`, `architecture`
  - why: Estas páginas contienen el encuadre universal obsoleto y deben expresar el contrato real de ambos carriles.
  - learn: La documentación debe distinguir el recorrido elegido para cada cambio de una secuencia obligatoria para todo el proyecto.
  - architecture: `workflow-overview.md` es la autoridad del modelo normativo; conserva `verify` y `close` en ambos carriles.
  - avoid: No presentar “las siete fases” como flujo único ni hacer que `micro` omita fases distintas de `map` y `tasks`.
  - verify: `grep -nE 'standard|micro|map|tasks|persist|persisten' docs-site/src/content/docs/02-workflow/workflow-overview.md && ! grep -nE 'flujo fijo|flujo universal|Las siete fases' docs-site/src/content/docs/02-workflow/workflow-overview.md`

- [x] 1.2 Añadir al ejemplo la nota visible de que es un cambio `standard` archivado y que la postura TDD pertenece al cambio, sin atribuirle una ejecución `micro`.
  - skills: `document-writer`, `cognitive-doc-design`
  - why: El ejemplo debe conservar su valor histórico sin convertirse en una prescripción universal.
  - learn: Un ejemplo histórico necesita contexto local cuando su forma puede confundirse con la regla general.
  - architecture: `real-workflow-example.md` posee el contexto de ese caso; no redefine los carriles ni inventa evidencia.
  - avoid: No reescribir el pasado del ejemplo ni afirmar que documenta cómo se ejecutó `micro`.
  - verify: `grep -nE 'standard|archivad|históric|postura TDD|TDD.*cambio' docs-site/src/content/docs/02-workflow/real-workflow-example.md`

## // 002. Actualizar las superficies CLI y capacidades opcionales de Pi/Claude

Archivos exactos:
- `docs-site/src/content/docs/04-reference/cli.md`

- [x] 2.1 Documentar en la referencia CLI `/ein:status` y `/ein:settings` para Claude, el panel vivo de Pi con cambio activo, carril, fase y tareas proyectadas desde `tasks.md`, y el atajo `ctrl+shift+e`.
  - skills: `document-writer`, `cognitive-doc-design`
  - why: Las superficies entregadas existen pero no están descritas en la referencia operativa.
  - learn: Una referencia CLI debe separar comandos y superficies por runtime para que el usuario encuentre una acción ejecutable.
  - architecture: `cli.md` es dueño de las superficies invocables; no se modifica ninguna implementación ni navegación.
  - avoid: No documentar comandos no confirmados ni prometer que el panel es una superficie de Claude.
  - verify: `grep -nE '/ein:status|/ein:settings|ctrl\+shift\+e|tasks\.md' docs-site/src/content/docs/04-reference/cli.md`

- [x] 2.2 Explicar Codegraph como bootstrap asistido opcional cuando falta el índice, con modo `on` por defecto, y conservar Engram como capacidad opcional junto a `--no-codegraph` y `--no-engram`.
  - skills: `document-writer`, `cognitive-doc-design`
  - why: La referencia debe reflejar la opcionalidad y los opt-outs sin convertir capacidades auxiliares en dependencias.
  - learn: Los defaults y opt-outs documentados deben conservar el carácter opcional de una integración.
  - architecture: `cli.md` describe configuración y flags; la disponibilidad real permanece en las fuentes de producto aceptadas.
  - avoid: No presentar Codegraph o Engram como obligatorios ni inventar flags adicionales.
  - verify: `grep -nE 'Codegraph|CodeGraph|bootstrap|--no-codegraph|Engram|--no-engram' docs-site/src/content/docs/04-reference/cli.md`

## // 003. Documentar la frontera Pi-first y el relevo Claude

Archivos exactos:
- `docs-site/src/content/docs/03-runtimes/claude-code.md`

- [x] 3.1 Reestructurar la página para identificar Pi como runtime de referencia y Claude como relevo, incorporar `/ein:status` y `/ein:settings`, y explicar la continuidad bidireccional mediante estado/checkpoint en disco, no mediante historial de conversación.
  - skills: `document-writer`, `cognitive-doc-design`, `architecture`
  - why: La página necesita describir las superficies reales y el puente de continuidad sin equiparar sesiones.
  - learn: Compartir decisiones persistidas permite relevo entre runtimes, pero no implica compartir conversaciones o capacidades completas.
  - architecture: `claude-code.md` posee el relato operativo específico de Claude y sus límites; Pi sigue siendo la referencia.
  - avoid: No afirmar recuperación de historial privado, equivalencia de sesiones ni paridad 1:1.
  - verify: `grep -nE '/ein:status|/ein:settings|Pi.*referencia|Claude.*relevo|checkpoint|disco' docs-site/src/content/docs/03-runtimes/claude-code.md && ! grep -nE 'paridad completa|equivalencia 1:1|historial.*compart' docs-site/src/content/docs/03-runtimes/claude-code.md`

- [x] 3.2 Declarar Cleaner y Architect como participación automática Pi-only, deliberadamente ausente o desactivada en Claude, y conservar las cautelas sobre traducción aproximada y MCP externo no ejercitado en vivo.
  - skills: `document-writer`, `cognitive-doc-design`
  - why: La frontera de participación automática y las limitaciones de paridad son parte explícita del contrato de runtime.
  - learn: Una capacidad no aplicable debe permanecer visible como limitación, no redactarse como ejecución silenciosa.
  - architecture: La página de Claude explica el límite del adaptador; no rellena la ausencia con una abstracción de paridad.
  - avoid: No presentar Cleaner/Architect como automáticos en Claude ni convertir best-effort en equivalencia.
  - verify: `grep -nE 'Cleaner|Architect|Pi-only|Pi.*solo|no aplicable|no soportad|best-effort|MCP' docs-site/src/content/docs/03-runtimes/claude-code.md`

## // 004. Rehacer la matriz de capacidades y límites de paridad

Archivos exactos:
- `docs-site/src/content/docs/03-runtimes/runtime-matrix.md`

- [x] 4.1 Reemplazar la afirmación de que ambos runtimes ejecutan el mismo ciclo por una matriz que separe capacidades compartidas comprobadas, superficies distintas y límites de paridad, identificando Pi como referencia y Claude como relevo.
  - skills: `document-writer`, `cognitive-doc-design`, `architecture`
  - why: La comparación actual sobreafirma equivalencia completa y oculta las fronteras operativas reales.
  - learn: Una matriz útil compara dimensiones explícitas en vez de resumir continuidad como identidad de runtime.
  - architecture: `runtime-matrix.md` es dueño de la comparación resumida y no duplica el relato operativo completo de Claude.
  - avoid: No conservar “los dos runtimes ejecutan el mismo ciclo SDD” como equivalencia global.
  - verify: `grep -nE 'Pi.*referencia|Claude.*relevo|compartid|superfic|límite|checkpoint|disco' docs-site/src/content/docs/03-runtimes/runtime-matrix.md && ! grep -nE 'mismo ciclo SDD|equivalencia completa|paridad completa' docs-site/src/content/docs/03-runtimes/runtime-matrix.md`

- [x] 4.2 Hacer explícitos Cleaner/Architect Pi-only, la continuidad Pi↔Claude por checkpoint/proyecto en disco y la ausencia de paridad 1:1 de skills, herramientas, sesiones y MCP vivo.
  - skills: `document-writer`, `cognitive-doc-design`
  - why: La matriz debe permitir detectar rápidamente qué se comparte y qué permanece limitado o no verificado.
  - learn: La paridad debe marcarse por capacidad y evidencia, no inferirse a partir de una continuidad de proyecto.
  - architecture: La matriz separa estado compartido de superficies y servicios runtime-específicos.
  - avoid: No marcar como compartida ninguna capacidad diferida o MCP no ejercitado en vivo.
  - verify: `grep -nE 'Cleaner|Architect|Pi-only|skills|herramientas|sesion|MCP|1:1|no.*paridad|no verif' docs-site/src/content/docs/03-runtimes/runtime-matrix.md`

## // 005. Alinear las limitaciones y el comportamiento fail-closed

Archivos exactos:
- `docs-site/src/content/docs/05-debug/known-limitations.md`

- [x] 5.1 Explicar que `verify: pass` prueba los criterios declarados por el cambio y su carril, y añadir la opcionalidad de Codegraph bootstrap y Engram compartido por cambio junto al puente por proyecto/checkpoint y los historiales privados.
  - skills: `document-writer`, `cognitive-doc-design`
  - why: La página debe evitar que una verificación local o una capacidad opcional se interprete como garantía universal o dependencia obligatoria.
  - learn: El significado de un resultado de verificación depende del contrato del cambio que lo produce.
  - architecture: `known-limitations.md` posee las limitaciones transversales y no introduce configuración ni comportamiento nuevo.
  - avoid: No presentar `verify: pass` como garantía global ni Engram/Codegraph como obligatorios.
  - verify: `grep -nE 'verify: pass|criterios.*cambio|carril|Codegraph|bootstrap|Engram|checkpoint|historial' docs-site/src/content/docs/05-debug/known-limitations.md`

- [x] 5.2 Documentar los estados `unreadable`, `unsupported`, `inactive`, `unhandled` y `applied`, dejando claro que solo `applied` representa una directiva inyectada y que los demás estados permanecen visibles sin defaults silenciosos; incluir la frontera Cleaner/Architect.
  - skills: `document-writer`, `cognitive-doc-design`
  - why: Esta página es la autoridad del significado fail-closed y debe impedir que incertidumbre o ausencia de soporte se lean como éxito.
  - learn: La visibilidad explícita de estados no aplicados protege al lector de falsas garantías.
  - architecture: El texto refleja estados producidos por la traducción existente; no normaliza ni inventa estados en documentación.
  - avoid: No describir estados desconocidos, ilegibles o no soportados como defaults, éxito o ejecución en Claude.
  - verify: `cd docs-site && bun run build && cd .. && grep -nE 'unreadable|unsupported|inactive|unhandled|applied|Cleaner|Architect|fail-closed|silencios' docs-site/src/content/docs/05-debug/known-limitations.md && ! grep -nE 'se aplica por defecto|éxito silencioso|automátic.*Claude' docs-site/src/content/docs/05-debug/known-limitations.md`

