# SDD Artifact Grammar

Esta gramatica define el minimo comun que deben cumplir los artefactos SDD en Ein para evitar ambiguedad entre fases.

## Objetivo

- Estandarizar lo que cada fase lee y escribe.
- Reducir decisiones improvisadas entre subagentes.
- Facilitar continuidad despues de pausa o compaction.

## Artefactos Base

Ruta base por cambio:

`openspec/changes/<cambio>/`

Archivos esperados (flujo `ein-sdd`):

- `scope.md`
- `map.md`
- `design.md`
- `apply-progress.md`
- `verify-report.md`

Configuracion global:

- `openspec/config.yaml`

## `openspec/config.yaml`

Campos minimos:

- `project`
- `stack_lock`: `node` | `frontend` | `fullstack` | `unknown`
- `runtime`
- `package_manager`
- `default_commands`: `test`, `build`, `lint`, `typecheck` (o `none`)
- `strict_tdd`
- `rules.design`, `rules.apply`, `rules.verify`

## `map.md`

Notas de exploracion: scope, riesgos, dependencias y prior art. Sin implementacion.

## `design.md`

Artefacto unico de planificacion con tres secciones:

### A. Propuesta
- `Intent`, `Scope` (y non-goals), `Affected areas`, `Risks`, `Rollback`, `Success criteria`.

### B. Spec
- Requirements en estilo RFC 2119.
- Escenarios Given/When/Then por requirement observable.

### C. Tareas
- Solo checkbox: `- [ ]` o `- [x]`.
- Cada tarea: descripcion, archivos afectados, skills necesarias, orden/dependencias.
- Sin review workload forecast ni chained-PR planning.

## `apply-progress.md`

Secciones minimas por batch:

- `Batch`
- `Tareas completadas`
- `Archivos tocados`
- `TDD Cycle Evidence` (cuando strict TDD activo)
- `Decisiones tecnicas`
- `Riesgos`
- `Checks ejecutados` (o `none`)
- `Siguiente paso`

## `verify-report.md`

Secciones minimas:

- `Estado global`: `Passed` | `Failed` | `Partial` | `Not Ready`
- `Comandos/checks` con resultado individual
- `Criterios revisados`
- `Strict TDD compliance` (cuando aplique)
- `Riesgos`
- `Decision`
- `Siguiente paso`

Regla:

- Si un check no se ejecuta, debe figurar como `Skipped: <motivo>`.

## Gates Entre Fases

El flujo `ein-sdd` se lanza por lenguaje natural o por la chain (no por comandos `/ein:sdd:*`). Los gates entre fases son:

- La fase `design` requiere `openspec/config.yaml` y los artefactos `scope.md` + `map.md`.
- La fase `apply` requiere `openspec/config.yaml` y `design.md` (sección Tareas).
- La fase `verify` requiere `openspec/config.yaml`, `design.md` y `apply-progress.md` cuando hubo implementación.
- Si no hay tareas pendientes, `apply` debe parar y derivar a `verify`.

## Contrato De Resultado Entre Fases

Cada fase debe devolver al menos:

- `estado`
- `artefactos leidos`
- `artefactos escritos`
- `riesgos`
- `siguiente paso`
- `skill_resolution`

Esto no obliga un formato JSON en la respuesta al usuario. La salida final puede ser Markdown humano, pero estos elementos deben estar presentes.
