# SDD Artifact Grammar

Esta gramatica define el minimo comun que deben cumplir los artefactos SDD en Ein para evitar ambiguedad entre fases.

## Objetivo

- Estandarizar lo que cada fase lee y escribe.
- Reducir decisiones improvisadas entre subagentes.
- Facilitar continuidad despues de pausa o compaction.

## Artefactos Base

Ruta base por cambio:

`openspec/changes/<cambio>/`

Archivos esperados:

- `proposal.md`
- `specs/<dominio>/spec.md`
- `design.md`
- `tasks.md`
- `apply-progress.md`
- `verify-report.md`
- `sync-report.md`
- `archive-report.md`

Configuracion global:

- `openspec/config.yaml`

## `openspec/config.yaml`

Campos minimos:

- `project`
- `stack_lock`: `node` | `frontend` | `fullstack` | `unknown`
- `runtime`
- `package_manager`
- `default_commands`: `test`, `build`, `lint`, `typecheck` (o `none`)
- `strict_tdd_mode`: `required` | `recommended` | `off`
- `required_skills`
- `skill_digest`
- `forbidden_tools`
- `rules.proposal`, `rules.spec`, `rules.design`, `rules.tasks`, `rules.apply`, `rules.verify`

## `proposal.md`

Secciones minimas:

- `Resumen`
- `Contexto actual`
- `Ruta propuesta`
- `Riesgos`
- `Supuestos`
- `Siguiente paso`

## `specs/<dominio>/spec.md`

Regla:

- Si no existe spec canonica, escribir el comportamiento completo.
- Si ya existe `openspec/specs/<dominio>/spec.md`, usar secciones `ADDED Requirements`, `MODIFIED Requirements` o `REMOVED Requirements`.
- Cada requirement debe incluir escenarios Given/When/Then cuando sea observable.

## `tasks.md`

Regla:

- Solo tareas checkbox: `- [ ]` o `- [x]`.

Cada tarea debe incluir:

- `id` (ejemplo `1.1`)
- `title`
- `why`
- `skills`
- `skill_digest` o referencia a digest usado
- `verify`

Opcional recomendado cuando aplique:

- `architecture`
- `avoid`

## `apply-progress.md`

Secciones minimas por batch:

- `Batch`
- `Tareas completadas`
- `Archivos tocados`
- `Decisiones tecnicas`
- `Riesgos`
- `Checks ejecutados` (o `none`)
- `Siguiente paso`

## `verify-report.md`

Secciones minimas:

- `Estado global`: `Passed` | `Failed` | `Partial` | `Not Ready`
- `Comandos/checks` con resultado individual
- `Criterios revisados`
- `Riesgos`
- `Decision`
- `Siguiente paso`

Regla:

- Si un check no se ejecuta, debe figurar como `Skipped: <motivo>`.

## Gates Entre Fases

- `/ein:sdd:new` requiere `openspec/config.yaml`.
- `/ein:sdd:apply` requiere `openspec/config.yaml`, `proposal.md`, `tasks.md` y digest de skills cuando aplique.
- `/ein:sdd:verify` requiere `openspec/config.yaml`, `tasks.md` y `apply-progress.md` cuando hubo implementacion.
- Si no hay tareas pendientes, `/ein:sdd:apply` debe parar y derivar a `/ein:sdd:verify`.

## Contrato De Resultado Entre Fases

Cada fase debe devolver al menos:

- `estado`
- `artefactos leidos`
- `artefactos escritos`
- `riesgos`
- `siguiente paso`

Esto no obliga un formato JSON en la respuesta al usuario. La salida final puede ser Markdown humano, pero estos elementos deben estar presentes.
