status: complete

# Apply Progress — docs-content-inventory

tdd: not-applicable — documentation-only change, no test runner configured (openspec/config.yaml: test_command vacío). Tratamiento según design.md §D5: checks D1–D4 (find/grep/test ad hoc) sustituyen el ciclo RED/GREEN; ejecutados sobre árbol vacío al inicio (fallarían por ausencia de ficheros, equivalente RED) y tras cada lote (pasan, equivalente GREEN). No se creó ningún script.

## Correción normativa aplicada (tasks.md // 001)

Los criterios 11–14 de design.md §D3 se interpretaron con la reformulación normativa de tasks.md // 001 (overview nombra ambos runtimes en `falta:`; getting-started sin EIN_OPERATING_SYSTEM.md en sources; ninguna página de recuento de fases usa EIN_OPERATING_SYSTEM.md como fuente; términos de context.md/deterministic-boundaries.md únicos en su página), no con la redacción original inconsistente con SK-3.

## Lote 1/6 — orchestrator.md, sdd-openspec.md, context.md

Creados los tres esqueletos con frontmatter CT-1 (4 claves, verified_rev "0ae709d"), 7 secciones CT-3 exactas, un bloque PENDIENTE-D por sección/subsección. Gate: `grep -c '^## '` = 7 en las tres; `verified_rev` presente en las tres. context.md contiene `fork`, `fresh`, `max_tokens` (términos exclusivos de esta página, verificado en Lote 3).

## Lote 2/6 — workflow-overview.md, artifacts.md

Creados con 6 filas de Detalles (workflow-overview) y 9 (artifacts, incluyendo Canonical openspec config). `sources` de workflow-overview.md NO incluye EIN_OPERATING_SYSTEM.md en frontmatter; la mención solo aparece dentro de la línea `falta:` de un PENDIENTE-D como exclusión explícita ("autoridad orchestrator.md, no EIN_OPERATING_SYSTEM.md"). Ajusté "Siguiente paso" de artifacts.md para enlazar a `real-workflow-example.md` (cadena CT-7 correcta) tras detectar que el borrador inicial apuntaba fuera de orden. Gate: 7 secciones en ambas; `grep -c '^## '` = 7.

## Lote 3/6 — deterministic-boundaries.md

Creado con las 6 filas de Detalles del map (qué decide modelo, qué comprueba herramienta, qué garantiza EIN, qué solo se observa, límites explícitos, importancia). Gate: 7 secciones; criterio 14 verificado — `modelo` aparece solo en esta página (workflow-overview.md y overview.md no la mencionan aún en este punto); `fork` no aparece aquí (confinado a context.md).

## Lote 4/6 — overview.md, getting-started.md

overview.md: bloque PENDIENTE-D de `## En una frase` menciona `pi-ein` y `cc-ein` explícitamente (criterio 11, verificado con grep). getting-started.md: `sources` NO incluye `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md` (criterio 12, verificado). Ambas con 7 secciones y 6 filas de Detalles según el map.

## Lote 5/6 — real-workflow-example.md, first-run.md

real-workflow-example.md usa como `sources` los 7 ficheros verificados de `openspec/changes/archive/installer-beta/`, con 6 subsecciones de Detalles (petición, por qué, y las 6 fases: map, design, tasks, apply, verify, close). first-run.md amplía `sources` respecto al map (añade `ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md`, expande `installer-beta/` a sus 7 ficheros concretos por C1) porque las secciones citan esas fuentes explícitamente y CT-4 exige que toda `fuentes:` de un PENDIENTE-D esté en `sources`; excluí `README.md` y `EIN_OPERATING_SYSTEM.md` del frontmatter del map original porque ninguna sección de first-run los cita realmente. Ninguna de las dos páginas menciona `fork`/`fresh`/`max_tokens`/`max_reads` ni `EIN_OPERATING_SYSTEM.md`. Gate: 7 secciones en ambas.

## Lote 6/6 — gap-inventory.md

Creado en `openspec/changes/docs-content-inventory/gap-inventory.md` (no bajo `docs-site/`). `## Decisiones de hueco` con exactamente 5 subsecciones `###` (First Run, Deterministic Boundaries, Runtime Matrix, Real Workflow Example, Known Limitations), cada una con las 6 claves GI-3 en orden. Known Limitations añade la séptima clave `desbloqueante:` nombrando el merge de `feat/shared-project-state-contract`, con `fuentes_candidatas: ninguna (bloqueado)`. `## Defectos de fuente detectados` con exactamente 3 filas (D1, D2, D3) y declaración explícita de que no se corrigen en este cambio. `grep -rn "shared-project-state-contract"` en el árbol de este cambio solo devuelve la línea `desbloqueante:` dentro de `gap-inventory.md` (más referencias legítimas en scope/map/tasks/design, artefactos previos de fase); ninguna ruta de esa rama se citó como fuente en ninguna página.

## Validación transversal (grupo 008/009)

- D1: 10 ficheros exactos bajo `docs-site/src/content/docs/`; `verified_rev: "0ae709d"` en las 10; todas las rutas de `sources` resuelven con `test -e` (script ad hoc en scratchpad, 0 fallos).
- D2: 7 secciones `##` exactas en las 10 páginas; pureza de esqueleto (SK-3) verificada con `awk` filtrando frontmatter/encabezados/bloques PENDIENTE-D/ítems de Fuentes/línea de Siguiente paso/blancas — 0 líneas residuales en las 10; sin literales de versión (`grep -rEn 'v?[0-9]+\.[0-9]+\.[0-9]+'` vacío); cadena CT-7 sin enlaces rotos (script ad hoc, 0 roturas) — `real-workflow-example.md` y `getting-started.md`(→first-run) enlazan `.md` a páginas del cambio; el resto de saltos fuera de las 10 páginas están en texto plano (`real-workflow-example.md` → área Runtimes del cambio hermano).
- D3: criterio 11 (overview.md nombra ambos runtimes en `## En una frase`) OK; criterio 12 (getting-started.md sin EIN_OPERATING_SYSTEM.md en sources) OK; criterio 13 (workflow-overview.md y sdd-openspec.md no listan EIN_OPERATING_SYSTEM.md en sources, solo mención de exclusión en `falta:`) OK; criterio 14 (`fork`/`max_tokens`/`max_reads` solo en context.md; `modelo` solo en deterministic-boundaries.md) OK.
- D4: gap-inventory.md con 5 huecos, 3 defectos, Known Limitations bloqueado con `desbloqueante:` — todos verificados arriba.

## Superficie de escritura

Se crearon exactamente las 11 rutas autorizadas (10 páginas + gap-inventory.md) más este `apply-progress.md`. No se modificó ningún fichero existente (README.md, ein-pi/core/docs/*, openspec/config.yaml intactos).

## Comandos ejecutados (resumen)

`grep -c '^## '` por página (todas → 7); `grep -L 'verified_rev...'` (vacío); script `check_sources.sh` (rutas de sources, 0 fallos); script `check_purity.sh` (pureza SK-3, 0 residuos); script `check_links.sh` (enlaces Siguiente paso, 0 rotos); `grep -rEn` versión (vacío); `grep -rl fork|max_tokens|max_reads|modelo` (confinamiento correcto); `grep -c '^### '` gap-inventory (5); `grep -E 'D[123]'` gap-inventory (3).

## Riesgos residuales

- Los bloques `PENDIENTE-D` fijan qué falta y de dónde sale, pero la redacción real es responsabilidad de la fase D; no se anticipó contenido.
- `first-run.md` amplió `sources` respecto al map original (desviación menor, documentada arriba) para cumplir CT-4 sin dejar `fuentes:` huérfanas.
