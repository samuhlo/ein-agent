# Summary — docs-content-inventory

status: pass
change: docs-content-inventory
verified_rev: "0ae709d"

Primera mitad (SLICE 1 de 2) de la documentación pública de EIN. Produce
**esqueletos, no páginas redactadas**: la prosa pertenece a una fase posterior y
la web a otra distinta. No hay documentación publicada ni desplegada.

## Qué se produjo

Diez ficheros markdown en estado esqueleto bajo `docs-site/src/content/docs/`:

- `00-start/` — overview, getting-started, first-run
- `01-concepts/` — orchestrator, sdd-openspec, context, deterministic-boundaries
- `02-workflow/` — workflow-overview, artifacts, real-workflow-example

Más `openspec/changes/docs-content-inventory/gap-inventory.md`, con cinco
decisiones de hueco y tres defectos de documentación fuente anotados.

Ningún fichero existente fue modificado.

## El contrato de página que queda establecido

Es lo que heredan el cambio hermano y todas las fases siguientes:

- **Frontmatter**: exactamente cuatro claves en orden — `title`, `description`,
  `sources` (rutas relativas al repo, existentes), `verified_rev`.
- **Estructura**: siete encabezados `##` fijos y en orden, sin ninguno más.
- **Contenido pendiente**: un único bloque `:::caution[PENDIENTE-D]` por
  sección, con las claves `falta:`, `fuentes:` y `lineas:`. Toda ruta citada
  debe estar en el `sources` del frontmatter.
- **Pureza**: tras eliminar frontmatter, encabezados, bloques `PENDIENTE-D`,
  ítems de `## Fuentes` y la línea de `## Siguiente paso`, no queda ninguna
  línea. Es lo que distingue un esqueleto de una página a medio redactar, y se
  comprueba con un comando en vez de con criterio editorial.
- **Sin literales de versión**: donde haga falta la release vigente se enlaza a
  `releases/latest`. Si ninguna página puede escribir un número, ninguna página
  puede quedarse desfasada.

## Cómo se verificó sin TDD

`openspec/config.yaml` declara `strict_tdd: true`, pero no tiene `test_command`
en apply ni en verify y registra que no se detectó runner. La salida es markdown
sin comportamiento ejecutable: no hay unidad que pueda fallar primero.

`design.md §D5` lo declaró **no satisfacible** en lugar de fabricar ciclos, y
definió el sustituto: 19 criterios comprobables con `find`, `grep` y `test`,
ejecutados sobre el árbol vacío antes de escribir y de nuevo tras cada lote.
`apply-progress.md` registra `tdd: not-applicable` con la causa concreta.

Resultado de `sdd-verify`: **pass, 19/19**. `behavior_coverage: n-a`.

Ninguna fase modificó `openspec/config.yaml`: la regla era devolver `blocked` si
el gate rechazaba la declaración. No hizo falta.

## Qué queda abierto

1. **Cambio hermano `docs-content-reference`**, aún sin crear: cubre
   `03-runtimes`, `04-reference` y `05-debug`. Su fuente reservada incluye
   `pi-ein/README.md`, única documentación de la superficie del adaptador Pi.

2. **Defecto conocido en `gap-inventory.md`**: la entrada `Runtime Matrix`
   declara `estado: esqueleto-en-A` cuando no se creó ningún esqueleto para ella
   aquí — pertenece al hermano. `GI-3` solo admite `esqueleto-en-A | bloqueado`
   y no existe valor correcto para "pendiente en el cambio hermano". El hermano
   debe extender el vocabulario y corregir el estado. Verificación lo confirmó
   como defecto menor de ejecución **y** hueco de contrato; no bloqueó el cierre.

3. **Known Limitations bloqueado**: su fuente autoritativa vive en la rama sin
   mergear `feat/shared-project-state-contract`. Desbloqueante: merge en `main`.

4. **Detalle cosmético**: `02-workflow/real-workflow-example.md:110` reproduce la
   redacción del contrato (`texto plano: ...`) en lugar de aplicarla.
   Dictaminado cosmético; corregir en la fase de redacción.

5. **Tres defectos de documentación fuente** (D1, D2, D3 en `gap-inventory.md`)
   anotados y no corregidos: viven en `README.md` y
   `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md`, fuera del alcance de este cambio.

6. **Cinco fricciones de herramienta de EIN** detectadas durante el trabajo,
   registradas fuera de OpenSpec en [`docs/fricciones-dogfooding.md`](../../../docs/fricciones-dogfooding.md)
   como material para el artículo de lanzamiento:
   el parser de `spec_delta` exige tres líneas contiguas y bloqueó `map` por un
   salto de línea; `strict_tdd: true` sin runner obligó a definir un gate
   sustitutivo; el guard `oversized-group` cuenta rutas citadas en lugar de
   ficheros escritos; `sdd-close` resolvió rutas contra el repositorio principal
   en vez del worktree y dedujo que fases ya ejecutadas no lo estaban; y una
   restricción global del harness que prohíbe escribir ficheros de resumen
   colide con el contrato SDD que exige `summary.md`.
