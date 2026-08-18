# Scope: update-astro-documentation

## Scope packet
scope: Auditar y actualizar la documentación pública Astro/Starlight bajo `docs-site/` para que describa el comportamiento de Ein actualmente entregado, usando únicamente la evidencia aceptada y manteniendo el idioma español. El alcance cubre las páginas y configuración de documentación necesarias para explicar los carriles micro/standard, la postura TDD/carril persistida por cambio, las superficies Pi y Claude, los límites de paridad y las capacidades opcionales, sin implementar producto.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 120000

## Boundaries

### In scope

- Revisar y actualizar contenido Markdown y configuración de `docs-site/` relacionado con:
  - carriles SDD `micro` y estándar, sin presentar un flujo fijo de siete fases;
  - postura TDD y carril persistidos por cambio, compartidos entre runtimes;
  - panel vivo de cambio de Pi y atajo `ctrl+shift+e`;
  - comandos Claude `/ein:status` y `/ein:settings`;
  - Pi como runtime de referencia, fronteras reales de paridad y continuidad bidireccional Pi↔Claude;
  - traducción de directivas de proyecto fail-closed, incluyendo estados no aplicados, ilegibles o no soportados;
  - bootstrap asistido de Codegraph;
  - cuaderno Engram compartido por cambio como capacidad opcional;
  - participación de Cleaner y Architect, aceptada en Pi y deliberadamente desactivada/ausente como participación automática en Claude;
  - limitaciones honestas y metadatos/ejemplos de verificación únicamente cuando la evidencia los respalda.
- Corregir afirmaciones obsoletas sobre flujo fijo, equivalencia completa de runtimes y traducción desconocida de herramientas.
- Mantener la documentación en español y conservar las limitaciones conocidas; no convertir capacidades de roadmap en funcionalidades disponibles.
- Ejecutar en fases posteriores únicamente verificaciones documentales enfocadas (estructura/frontmatter, enlaces o referencias y comprobaciones textuales pertinentes a `docs-site`), sin ampliar el alcance a una auditoría general del repositorio.

### Explicit non-goals

- No modificar código de producto, adaptadores, comandos, instalador, runtime, contratos, tests ni comportamiento ejecutable.
- No cambiar `openspec/config.yaml`, la política SDD, la implementación de carriles, TDD, Engram, Codegraph, continuidad o traducción de directivas.
- No leer ni usar `openspec/specs/sdd-lifecycle/spec.md` ni ningún dominio canónico: la selección canónica es NONE.
- No rediseñar Astro/Starlight, navegación, tema, componentes visuales ni arquitectura del sitio salvo la configuración documental estrictamente necesaria para el refresh.
- No actualizar documentación fuera de `docs-site/`, salvo reutilizar como evidencia los archivos aceptados; no corregir esas fuentes.
- No afirmar paridad de servicios MCP en vivo, equivalencia 1:1 de skills/herramientas, ni disponibilidad de funciones que el roadmap marca como diferidas.
- No realizar cambios de copy sin evidencia en los archivos aceptados ni ejecutar una rediscovery amplia del repositorio.

## Evidence boundary

La evidencia aceptada y única para el mapeo inicial es:

- `docs-site/src/content/docs/04-reference/cli.md`
- `docs-site/src/content/docs/02-workflow/workflow-overview.md`
- `docs-site/src/content/docs/02-workflow/real-workflow-example.md`
- `docs-site/src/content/docs/03-runtimes/claude-code.md`
- `docs-site/src/content/docs/03-runtimes/runtime-matrix.md`
- `docs-site/src/content/docs/05-debug/known-limitations.md`
- `CHANGELOG.md`
- `MANIFIESTO.md`
- `docs/roadmap-features-ein.md`
- `ein-pi/agent/lib/project-directives.ts`
- `cc-ein/commands/ein/status.md`

The accepted evidence confirms the shipped additions and boundaries: `micro` skips only `map` and `tasks`; TDD and lane stance persist on disk; Pi owns the complete first behavior; Claude exposes status/settings and consumes shared project decisions; Cleaner/Architect remain Pi-only for automatic participation; unknown or unsupported directive translation must remain visible rather than silently defaulting; Codegraph bootstrap and shared Engram are available capabilities with their stated optionality; and the project bridge is the disk/checkpoint, not conversation history.

No canonical OpenSpec domain was selected or loaded. No canonical spec path, digest, or byte count is applicable.

## Project and SDD configuration

- Stack/context: Bun-managed TypeScript/ESM repository with Astro/Starlight public documentation under `docs-site/`.
- Existing `openspec/config.yaml` is preserved. It declares `strict_tdd: true`, Bun test commands, and installer typecheck configuration; this documentation-only scope does not alter it.
- Per-change stance: documentation-only refresh; strict TDD is recorded as configuration context but no implementation test cycle is authorized in scope. Focused documentation verification belongs to later apply/verify phases.
- Skill resolution: injected paths. `ein-discipline` and `document-writer` apply; `nuxt-content` applies to Markdown/content conventions; `vueuse` does not fit because this phase writes no Vue behavior; `web-design-guidelines` does not fit because this is content scoping, not a UI review.

## Acceptance criteria for downstream phases

1. Every changed page remains Spanish, grammatically complete, and consistent with shipped behavior evidenced above.
2. The documentation explains micro and standard lanes and persisted per-change TDD/lane stance without claiming a universal seven-phase flow.
3. Runtime pages distinguish Pi-first behavior from Claude's actual surfaces and limitations, including `/ein:status`, `/ein:settings`, bidirectional disk-based continuity, and the intentional Cleaner/Architect boundary.
4. Directive translation is described as fail-closed: unreadable, unsupported, inactive, or unhandled settings are not silently treated as defaults or successful application.
5. Codegraph, optional shared Engram, and verification metadata/examples are described only to the extent supported by the accepted evidence.
6. Focused documentation verification can identify stale claims, broken internal references/frontmatter, and unsupported roadmap-only assertions without requiring a full repository test/build.

## Phase handoff

The next phase should map the specific stale passages and exact `docs-site` files to edit, then design a bounded documentation-only update. It must not broaden evidence selection beyond the accepted paths without an explicit new scope decision.

## Spec delta declaration
spec_delta: none
spec_delta_reason: Este cambio solo actualiza documentación pública y no modifica ningún comportamiento observable del producto.
