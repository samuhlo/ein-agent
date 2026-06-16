---
name: architecture
description: "Samuhlo's judgment for software architecture and refactors in TypeScript/Vue/Nuxt: Screaming Architecture (structure by domain, not framework), simplicity-first, and applying design patterns only when they earn their place. Trigger: refactor, architecture or design decisions, structuring a project, choosing a pattern."
license: internal
metadata:
  author: samuhlo
---

# Architecture & Refactor Judgment

Samuhlo's stance for **design/refactor decisions** (sdd-design phase, restructuring, choosing whether to use a pattern). This is a **judgment** skill, not a pattern catalogue: the model already knows the GoF patterns — your job is to apply restraint and Samu's preferred structure, not to recite them.

Use it when: refactoring, defining or fixing a project's structure, deciding "what pattern fits here", or reviewing an over/under-engineered design.

## 0. Core stance (read first)

- **Simplicity wins by default.** The best design is the one that's easiest to change and to test, not the one with the most patterns.
- **A pattern must earn its place.** Add it only when it removes *real, present* pain (duplication, rigidity, untestability). Never speculative ("might need it later").
- **YAGNI + rule of three.** Don't abstract until the third real occurrence. Two is a coincidence; three is a pattern.
- **In TS prefer functions and modules over class hierarchies** unless you genuinely need shared state + polymorphism. A `Strategy` is often just a map of functions; a `Factory` is often just a factory function.
- **The test of a good abstraction**: naming it makes the code *easier to change*. If it doesn't, delete it. A wrong abstraction is more expensive than duplication.

## 1. Screaming Architecture (Samu's default)

> The structure should **scream what the app does**, not which framework it uses. A newcomer reading the top-level folders should see the *domain*, not `controllers/ models/ views/`.

Organize **by feature/domain**, not by technical layer. Each feature is cohesive and self-contained; co-locate its UI, logic, and tests.

```text
app/
  features/                 # ← screams the domain
    pacientes/
      components/           # feature UI
      composables/          # feature logic (Vue)
      stores/               # feature state (Pinia, setup pattern)
      services/             # data access / API for this feature
      types.ts
      pacientes.test.ts
    evaluaciones/
      ...
    planificaciones/
      ...
  shared/                   # cross-feature reusable: ui atoms, base composables, utils
  core/                     # app-wide infra: http client, config, auth, error handling
  pages/                    # THIN: routing only; compose feature components
  layouts/
server/                     # Nitro API, also organized by domain
```

Rules:

- **Top level reads as domains.** If you can't tell what the app does from the folder names, the architecture isn't screaming yet.
- **Cohesion over layers.** A feature's component, its composable, its store and its test live together — not scattered across global `components/`, `composables/`, `stores/`.
- **Thin framework edges.** `pages/`, `server/routes`, plugins are the framework boundary; keep them thin and delegate to features. Domain logic stays framework-agnostic where reasonable (testable without mounting a component).
- **Dependency direction is one-way**: `features → shared → core`. Never the reverse. Features should not import each other directly; if two features need the same thing, lift it to `shared` or expose a small public surface.
- **Respect framework-required names** (`pages/`, `layouts/`, `app.vue`, `[id].vue`); screaming structure lives *inside* them, it doesn't fight Nuxt's conventions. Files in kebab-case (see `file-naming`).

For a refactor of a structureless project, the first win is usually **carving the domain features out of the technical-layer soup**, before touching any pattern.

## 2. Refactor decision heuristic

1. **Name the real problem.** What is hard to change or to test *right now*? Where is the duplication, the coupling, the god-component? Be specific — don't refactor what doesn't hurt.
2. **Find the seam.** The smallest boundary where you can cut without a big-bang rewrite.
3. **Smallest structural fix first** (extract function/composable, move to a feature folder, inject a dependency). Re-test.
4. **Only then ask: does a pattern pay?** If the smallest fix already made it easy to change, stop. Don't add a pattern on top.
5. **Sequence it.** Many small, reviewable, test-backed steps (TDD where tests exist). Never a speculative big rewrite in one shot.

## 3. Smell → typical remedy (with restraint)

The model knows these patterns — this is *when* to reach for them, and the guard against over-using them.

| Smell | Consider | But first / instead |
| :--- | :--- | :--- |
| `if/else`/`switch` branching on a type or enum | polymorphism / Strategy | a plain lookup map `{ key: fn }` if it's just data |
| God component/class doing many things | split by responsibility (SRP) into composables/modules | just extract one function if that's all it needs |
| Same logic in 3+ places | extract a function/composable | leave 2 occurrences inline (rule of three) |
| Hard to test (hidden/global deps) | inject the dependency (param/constructor) | usually NOT a pattern — just pass it in |
| Tight coupling to an external lib/API | Adapter / Facade at the boundary | only at the seam you actually swap |
| Complex multi-step object construction | Builder / factory function | a factory function usually suffices |
| Cross-cutting events/notifications | Observer | framework reactivity / a tiny event bus first |

Every row carries an implicit "...or keep it simple if the pain isn't real."

## 4. Anti-over-engineering contract

- A pattern that doesn't reduce net complexity is a bug. Remove it.
- No abstraction for hypothetical futures. Build for the change you can see, not the one you imagine.
- Prefer composition over inheritance; prefer functions/modules over class trees in TS.
- Keep the public surface of each feature/module small and explicit.
- In the SDD design phase: map the real problems and propose the **smallest** structure that fixes them (usually: domain feature folders + the one or two patterns that earn their place). Call out explicitly what you chose NOT to add and why.
