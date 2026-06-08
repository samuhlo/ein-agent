---
name: linear-workflow
description: Professional Linear workflow for issue-first development, SDD execution, project creation, progress sync, verification, and closure.
license: internal
---

# Linear Workflow

Use this skill whenever work should be tracked in Linear:

- creating features, bugs, improvements, docs, QA, tooling tasks
- reading an existing issue before implementation
- creating or updating Linear projects
- syncing SDD progress back to Linear
- closing verified work

## Mental Model

- Linear = external source of truth for work status.
- SDD = local execution system for exploration, implementation, and verification.
- Engram = memory of decisions, lessons, and solved problems.
- Git/PR = final code delivery.

## Default Workspace Rules

- Team: `Samuhlodev`
- Team key: `SAM`
- Default assignee: `me`
- Preferred states:
  - `Backlog` for untriaged ideas
  - `Todo` for ready work
  - `In Progress` for active implementation
  - `In Review` for implemented and awaiting final review
  - `Done` for verified and closed
- Common labels:
  - `Feature`
  - `Bug`
  - `Improvement`
  - `Front`
  - `Back`
  - `Design`
  - `Docs`
  - `QA`
  - `AI`
  - `Tooling`

## Professional Rules

1. For serious work, use issue-first flow.
2. Search projects before creating projects or issues, including completed/archived projects.
3. Do not create duplicate projects.
4. Completed projects are still reusable as containers for new related issues.
5. Only create a project when the user explicitly asks for a new initiative and no clear existing project matches.
6. If a matching project exists, use it even if it is stale or completed.
7. If project creation is ambiguous, ask one short question.
8. Issues can be created more freely than projects, but still search first.
9. Keep Linear comments short, human, and readable: summary, what changed, next step, risks.
10. Do not paste SDD internals into Linear unless requested. Avoid `.sdd` paths, task counts, apply logs, generated planning files, and implementation bookkeeping in human comments.
11. Always preserve Linear as readable project management, not a dump of implementation noise.
12. Keep tags, labels, and states consistent, but write comment bodies with a natural voice.
13. Issue creation is not complete until the issue has been read back and metadata is verified.
14. If assignee or obvious labels are missing, update the same issue before returning success.
15. Do not comment on every mini-batch. Prefer one Linear comment per user interaction, and only publish on meaningful milestones, blockers, final verification, or explicit sync requests.

## Project Preflight (Hard Gate)

Before creating any project or issue:

1. Search projects by exact name, aliases, and fuzzy names.
2. Include completed and archived projects in the search.
3. Read the best matching project with milestones/resources when available.
4. Read workspace issue labels and project labels.
5. Search for duplicate issues by title keywords and tag family.
6. Use the existing project when there is a clear match.
7. Do not create a project if there is a clear existing match.

Portfolio aliases:

- `portfolio`
- `portfolio app`
- `portfolio-app`
- `portfolio personal`
- `personal digital garden`
- `awwwards portfolio`
- `nuxt portfolio`

All Portfolio aliases resolve to project `Portfolio`, not a new project.

Blog aliases:

- `blog`
- `blog portfolio`
- `nuxt content blog`
- `portfolio blog`

Blog aliases resolve to `BLOG - Portfolio` when the work is specifically about blog/content publishing. If the work is general portfolio UI, use `Portfolio`.

If a project is stale/completed but clearly matches, use it and create a fresh issue in it. Do not create a replacement project.

## Linear Tag Style

Issue titles should start with compact bracket tags that mirror labels.

Tag taxonomy:

- `[[SYS]]` -> `System`, `Tooling`, `Ops`
- `[[FRONT]]` -> `Front`
- `[[BACK]]` -> `Back`
- `[[DESIGN]]` -> `Design`
- `[[AI]]` -> `AI`
- `[[QA]]` -> `QA`
- `[[DOCS]]` -> `Docs`
- `[[BUG]]` -> `Bug`
- `[[FEAT]]` -> `Feature`
- `[[IMPROVE]]` -> `Improvement`

Examples:

```text
[[FRONT]][[DESIGN]] Rediseñar hero del portfolio
[[SYS]][[AI]] Revisar pipeline de ingesta GitHub
[[BUG]][[FRONT]] Corregir overflow en mobile nav
[[IMPROVE]][[QA]] Añadir verificaciones visuales mobile
```

Rules:

- Use 1-3 tags max.
- Tags in title must match actual Linear labels when those labels exist.
- Use `Feature`, `Improvement`, or `Bug` as the task-type label.
- Add area labels like `Front`, `Back`, `Design`, `AI`, `QA`, `Docs`, `System`, `Tooling`, or `Ops` when relevant.
- For Portfolio UI/design work, prefer labels: `Front`, `Design`, plus `Feature` or `Improvement`.
- For Portfolio data/automation work, prefer labels: `Back`, `AI` or `System`, plus `Feature` or `Improvement`.
- For docs/content work, prefer labels: `Docs` plus `Improvement`.

## Issue Metadata Hard Gate

Every created issue must be read back and verified before reporting success.

Required metadata:

- **Assignee:** `me`, unless the user explicitly asked for someone else.
- **State:** `Todo` for ready work, or `In Progress` when work starts immediately.
- **Project:** the clear project selected by Project Preflight, when one exists.
- **Milestone:** required for project-scoped work unless the user explicitly says no milestone.
- **Labels:** every obvious label implied by title tags and request type.
- **Title tags:** compact bracket tags that match labels when labels exist.

Tag-to-label mapping:

- `[[SYS]]` -> `System`, `Tooling`, or `Ops` depending on context.
- `[[FRONT]]` -> `Front`.
- `[[BACK]]` -> `Back`.
- `[[DESIGN]]` -> `Design`.
- `[[AI]]` -> `AI`.
- `[[QA]]` -> `QA`.
- `[[DOCS]]` -> `Docs`.
- `[[BUG]]` -> `Bug`.
- `[[FEAT]]` -> `Feature`.
- `[[IMPROVE]]` -> `Improvement`.

Repair flow:

1. Create or reuse the issue.
2. Read the issue back.
3. Compare actual metadata against expected metadata.
4. If `assignee` is missing, update the same issue with `assignee: "me"`.
5. If obvious labels are missing, update the same issue with the missing labels.
6. If milestone is missing, assign or create the matching milestone and update the same issue.
7. If the clear project is missing, link the same issue to that project.
8. Read the issue back again.
9. Only report success when verification passes.

If verification cannot pass, do not say the issue is fully ready. Report exactly what is missing and why.

Milestone policy:

- For new project bootstraps, create milestones automatically from the chosen preset.
- For existing projects, if milestones are missing and the user asked to organize work, create/reuse milestones before creating issues.
- If milestone naming is ambiguous, ask one short clarification question.

Fixed milestone convention for all projects:

- M00 - Descubrimiento y alcance
- M01 - Diseno visual y experiencia
- M02 - Base tecnica
- M03 - Modelo de datos y backend
- M04 - UI base y navegacion
- M05 - Funcionalidad principal
- M06 - Estadisticas, automatizacion o IA
- M07 - Pulido visual, QA y cierre

Design gate:

- For frontend/visual work, do not start M04 implementation if M01 is empty or undefined.
- Minimum M01 evidence: visual direction, basic wireframes, and typography/color decisions.

Implementation note: when using Linear tools, use `assignee`, not `assigneeId`.

## Project vs Issue

Create/use a **Project** when the work is an initiative:

- portfolio redesign
- blog system
- product module
- multi-week feature group
- release/milestone

Create an **Issue** when the work is concrete:

- add animated project cards
- fix mobile nav overflow
- add sitemap
- refactor auth middleware

## Issue Creation Template

When creating an issue, use this structure:

```md
# [[TAGS]] <clear issue title>

> Intencion corta: que se quiere conseguir y por que importa.

## // 001. CONTEXTO

Proyecto: `<project name>`
Stack/contexto: `<short project context>`

## // 002. ALCANCE

- <included item>
- <included item>

## // 003. CRITERIOS DE ACEPTACION

- [ ] <clear check>
- [ ] <clear check>

## // 004. SDD

Change folder: `.sdd/changes/<issue-id>-<slug>/`

## // 005. RIESGOS

- None / <short risk>
```

## Progress Comment Template

Use this only for a meaningful milestone, blocker, final implementation update, or explicit sync request. Do not use it after every `sdd-explore` or `sdd-apply` batch.

```md
## // 000. RESUMEN

He dejado esta parte en un punto claro: <resultado humano y util>.

> La idea importante: <decision o estado que una persona necesita entender>.

## // 001. HECHO

- **Cambio real:** <que cambio en producto/codigo/proceso>
- **Por que importa:** <motivo practico>
- **Estado:** <listo / parcial / bloqueado>

## // 002. SIGUIENTE

Ejecutar `<next command>`.

## // 003. RIESGOS

De momento no veo bloqueos claros. / <riesgo real en lenguaje humano>
```

## Verification Comment Template

Use this after verification:

```md
## // 000. RESUMEN

He revisado la implementacion y dejo aqui el resultado claro para decidir el siguiente paso.

## // 001. COMPROBADO

- **Checks:** <comandos relevantes y resultado en una frase>
- **Criterios:** <que queda cumplido y que no>
- **Alcance:** <resumen del comportamiento validado>

## // 002. DECISION

Mover a `In Review` / mantener en `In Progress` / cerrar como `Done`.

## // 003. NOTA

Si alguien quiere el detalle interno, se puede pedir y lo saco aparte. No hace falta meterlo en Linear por defecto.
```

## Human Comment Voice

Linear comments should sound like a real project update, not like a generated report.

Keep this voice:

- Spanish from Spain.
- Direct, close, and clear.
- No corporate tone.
- No filler.
- Natural technical words when they fit: `deploy`, `runtime`, `endpoint`, `check`, `branch`, `PR`.
- Use **bold** for important labels, _italics_ for nuance, and blockquotes for the main idea.

Avoid this by default:

- Cold labels like `STATUS DROP` or `VERIFICATION DROP`.
- Tables for simple updates.
- Phrases like `Resultado de verificacion del trabajo` when a normal sentence works better.
- Robotic status dumps with no explanation.
- SDD bookkeeping: `.sdd` paths, `tasks.md`, `apply.md`, `verify.md`, task counts, apply logs, or artifact inventories unless explicitly requested.

Preferred section names:

- `// 000. RESUMEN`
- `// 001. HECHO`
- `// 001. COMPROBADO`
- `// 002. SIGUIENTE`
- `// 002. DECISION`
- `// 003. RIESGOS`
- `// 003. NOTA`
- `// 004. APRENDIZAJE`

## Natural Request Routing

If the user asks for a feature naturally, like:

> Quiero añadir una feature visual al portfolio. Usa Linear y SDD.

Do this:

1. Identify likely project by name and alias (`Portfolio`, `BLOG - Portfolio`, etc.).
2. Search matching Linear projects, including completed/archived projects.
3. Read the selected project context before writing the issue.
4. Search existing issues for duplicates.
5. Create issue if needed using tags and labels.
6. Move issue to `Todo` or `In Progress` depending on whether work starts immediately.
7. Create SDD change folder name from issue ID and slug.
8. Delegate exploration to `sdd-explore`.
9. Comment Linear only if there is a useful human milestone, blocker, final result, or explicit sync request. Keep the `//` sections, but summarize product progress instead of SDD artifacts.

## State Transitions

- Start work: `Todo` or `Backlog` -> `In Progress`
- Implementation complete: `In Progress` -> `In Review`
- Verification passed and user accepts: `In Review` -> `Done`
- Blocked work: keep current state and add a clear comment explaining blocker

## Teaching Mode

Explain Linear actions simply:

- what was created/read/updated
- why it was done
- what the user should understand about the workflow

Keep it short but not cold. Linear is the board, SDD is the workbench, Engram is the notebook.
