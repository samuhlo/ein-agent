status: complete

## Files changed

- `docs-site/src/content/docs/02-workflow/workflow-overview.md`
- `docs-site/src/content/docs/02-workflow/real-workflow-example.md`
- `docs-site/src/content/docs/04-reference/cli.md`
- `docs-site/src/content/docs/03-runtimes/claude-code.md`
- `docs-site/src/content/docs/03-runtimes/runtime-matrix.md`
- `docs-site/src/content/docs/05-debug/known-limitations.md`

## // 001. Actualizar el modelo de carriles y el ejemplo histórico

- **Estado:** completado; tareas 1.1 y 1.2 marcadas en `tasks.md`.
- **Cambios:** la vista general distingue los carriles `standard` y `micro`, documenta que `micro` omite únicamente `map` y `tasks`, y fija la persistencia por cambio del carril y la postura TDD. El ejemplo incorpora una nota visible como cambio `standard` archivado e histórico, sin atribuirle una ejecución `micro`.
- **Archivos de contenido:** `docs-site/src/content/docs/02-workflow/workflow-overview.md`; `docs-site/src/content/docs/02-workflow/real-workflow-example.md`.
- **Metadatos:** se conservaron `sources` y `verified_rev`; no se inventaron revisiones de frontmatter.
- **Verificación 1:** `grep -nE 'standard|micro|map|tasks|persist|persisten' docs-site/src/content/docs/02-workflow/workflow-overview.md && ! grep -nE 'flujo fijo|flujo universal|Las siete fases' docs-site/src/content/docs/02-workflow/workflow-overview.md` — PASS.
- **Verificación 2:** `grep -nE 'standard|archivad|históric|postura TDD|TDD.*cambio' docs-site/src/content/docs/02-workflow/real-workflow-example.md` — PASS.
- **TDD:** OFF para esta ejecución; no se realizó ciclo RED/GREEN.
- **Desviaciones:** ninguna; no se ejecutó el build de Astro ni verificaciones fuera de las dos indicadas.
- **Pendiente:** grupos 002–005 de `tasks.md`, fuera del alcance de este grupo.

## // 002. Actualizar las superficies CLI y capacidades opcionales de Pi/Claude

- **Estado:** completado; tareas 2.1 y 2.2 marcadas en `tasks.md`.
- **Cambios:** `cli.md` documenta el panel vivo de Pi, `ctrl+shift+e`, `/ein:status` y `/ein:settings` para Claude, además del bootstrap opcional de Codegraph (`on` por defecto) y Engram con sus opt-outs.
- **Archivo de contenido:** `docs-site/src/content/docs/04-reference/cli.md`.
- **Verificación 1:** `grep -nE '/ein:status|/ein:settings|ctrl\+shift\+e|tasks\.md' docs-site/src/content/docs/04-reference/cli.md` — PASS.
- **Verificación 2:** `grep -nE 'Codegraph|CodeGraph|bootstrap|--no-codegraph|Engram|--no-engram' docs-site/src/content/docs/04-reference/cli.md` — PASS.
- **TDD:** OFF; no se realizó ciclo RED/GREEN.
- **Desviaciones:** ninguna; no se ejecutó el build de Astro ni verificaciones fuera de los dos grep enfocados.
- **Pendiente:** grupos 003–005 de `tasks.md`.

## // 003. Documentar la frontera Pi-first y el relevo Claude

- **Estado:** completado; tareas 3.1 y 3.2 marcadas en `tasks.md`.
- **Cambios:** `claude-code.md` identifica Pi como referencia y Claude como relevo; documenta continuidad bidireccional por estado/checkpoint en disco, `/ein:status`, `/ein:settings`, y la frontera Pi-only de Cleaner/Architect. Conserva límites de traducción aproximada, herramientas best-effort y MCP externo no ejercitado en vivo.
- **Archivo de contenido:** `docs-site/src/content/docs/03-runtimes/claude-code.md`.
- **Metadatos:** se conservaron `sources` y `verified_rev`; no se inventaron revisiones de frontmatter.
- **Verificación 1:** `grep -nE '/ein:status|/ein:settings|Pi.*referencia|Claude.*relevo|checkpoint|disco' docs-site/src/content/docs/03-runtimes/claude-code.md && ! grep -nE 'paridad completa|equivalencia 1:1|historial.*compart' docs-site/src/content/docs/03-runtimes/claude-code.md` — PASS.
- **Verificación 2:** `grep -nE 'Cleaner|Architect|Pi-only|Pi.*solo|no aplicable|no soportad|best-effort|MCP' docs-site/src/content/docs/03-runtimes/claude-code.md` — PASS.
- **TDD:** OFF; no se realizó ciclo RED/GREEN.
- **Desviaciones:** ninguna; no se ejecutó el build de Astro ni verificaciones fuera de los dos grep enfocados.
- **Pendiente:** grupos 004–005 de `tasks.md`, fuera del alcance de este grupo.

## // 004. Rehacer la matriz de capacidades y límites de paridad

- **Estado:** completado; tareas 4.1 y 4.2 marcadas en `tasks.md`.
- **Cambios:** `runtime-matrix.md` separa continuidad de estado compartida, superficies específicas y límites de paridad; identifica Pi como referencia y Claude como relevo.
- **Archivo de contenido:** `docs-site/src/content/docs/03-runtimes/runtime-matrix.md`.
- **Límites documentados:** Cleaner/Architect quedan como `Pi-only`; el checkpoint/proyecto en disco permite relevo Pi↔Claude sin compartir sesiones. Skills, herramientas y MCP vivo no se presentan como paridad 1:1.
- **Verificación 1:** el grep enfocado de referencias compartidas y ausencia de afirmaciones obsoletas — PASS.
- **Verificación 2:** el grep enfocado de Cleaner/Architect, superficies y límites — PASS.
- **TDD:** OFF; no se realizó ciclo RED/GREEN.
- **Desviaciones:** ninguna; no se ejecutó el build de Astro ni verificaciones fuera de los dos grep enfocados.
- **Pendiente al cierre de este grupo:** grupo 005 de `tasks.md`.

## // 005. Alinear las limitaciones y el comportamiento fail-closed

- **Estado:** completado; tareas 5.1 y 5.2 marcadas en `tasks.md`.
- **Cambios:** `known-limitations.md` relaciona `verify: pass` con los criterios del cambio y su carril, y documenta Codegraph/Engram como capacidades opcionales.
- **Continuidad:** se aclara el puente Pi↔Claude por proyecto/checkpoint en disco y la privacidad de los historiales de cada runtime.
- **Fail-closed:** se describen `unreadable`, `unsupported`, `inactive`, `unhandled` y `applied`; solo `applied` representa una directiva inyectada y los demás estados permanecen visibles sin defaults silenciosos.
- **Frontera runtime:** Cleaner y Architect quedan como participación automática únicamente en Pi; Claude los marca como no aplicable o no soportado.
- **Archivo de contenido:** `docs-site/src/content/docs/05-debug/known-limitations.md`.
- **Verificación 1:** `grep -nE 'verify: pass|criterios.*cambio|carril|Codegraph|bootstrap|Engram|checkpoint|historial' docs-site/src/content/docs/05-debug/known-limitations.md` — PASS.
- **Verificación 2:** `grep -nE 'unreadable|unsupported|inactive|unhandled|applied|Cleaner|Architect|fail-closed|silencios' docs-site/src/content/docs/05-debug/known-limitations.md && ! grep -nE 'se aplica por defecto|éxito silencioso|automátic.*Claude' docs-site/src/content/docs/05-debug/known-limitations.md` — PASS.
- **TDD:** OFF; no se realizó ciclo RED/GREEN.
- **Desviaciones:** no se ejecutó `cd docs-site && bun run build`, por pertenecer a `sdd-verify`; no se modificaron otras páginas.
- **Pendiente:** ninguno; las diez tareas del cambio están marcadas.
