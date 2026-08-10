# Scope — surface-wiring

## Outcome

Make the already-built cleaner audit, bounded cleaner mutation flow, and launcher/workbench invocable through explicit user-facing Ein surfaces in both Pi and Claude. The change wires real command, agent, or skill entry points according to each runtime, preserves equivalent behavior or declares any runtime difference, and proves the surface-to-engine seam from a clean session.

## Scope packet

scope: Make already-built engines invocable through real Ein surfaces. Expose `cleaner-read-only-audit.ts`, `cleaner-bounded-mutations.ts`, and `ein-pi/workbench.ts` through explicit user-facing entry points in both Pi and Claude, with identical behavior or an explicitly declared runtime difference; cover clean-session invocation and the module-to-surface seam.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 120000

## In scope

- Explicit activation in Pi and Claude for cleaner read-only audit, bounded cleaner mutations, and launcher/workbench.
- Runtime-appropriate command, agent, or skill surfaces, without exposing internal paths as the user contract.
- Observable parity between runtimes, or an explicit declaration of intentional runtime differences.
- Seam coverage that invokes each capability through its real surface, not only direct module tests.
- Clean-session reachability and bounded diagnostics when activation cannot proceed.

## Out of scope

- New cleaner, launcher, or workbench capabilities; contract redesign; or widening bounded mutation ownership/limits.
- Reopening H/I cleaner design, autonomous or parallel writers, architect mutation, or installer TUI integration.
- Updater work from N, terminal app work from O, or unrelated startup/banner notification observations.
- Changes to OpenSpec, EIN.md, or Git authority.
- Implementation, mapping, design, task planning, or test execution in this phase.

## Dependencies and constraints

- Dependencies D (minimal workbench launcher) and I (bounded cleaner mutations) are treated as delivered.
- The launcher/workbench remains separate from the installer TUI.
- OpenSpec remains the authority of active work; EIN.md remains stable project context; Git remains exact code state.
- Bounded mutations remain explicit SDD slices; this change only supplies invocation surfaces.
- The three named engines are currently evidenced as imported only by their own tests, so the primary gap is surface reachability.

## Acceptance direction

1. A clean Pi session can invoke cleaner audit, bounded cleaner mutation flow, and launcher/workbench without knowing internal file paths.
2. A clean Claude session can invoke the same capabilities through explicit runtime-native entry points.
3. Pi and Claude have identical observable activation/result semantics, or each intentional difference is declared at the boundary.
4. Tests exercise the real surface-to-module connection for all three capabilities and both runtimes (or document a justified runtime-specific seam), rather than only pure core modules.
5. No capability, ownership, mutation limit, authority, or installer responsibility is expanded.

## Canonical context references

Only the explicitly authoritative roadmap reference was consulted:

| path | SHA-256 | bytes |
|---|---|---:|
| `docs/roadmap-features-ein.md` | `279b3600e566227aa2961a09ecc6cec7bc7138499cdee0b0df0c2001d33ad818` | 28941 |

Relevant canonical direction: block M and locked decisions in §7/§7.1. Do not consult `roadmap-beta.md` or `docs/ein_futuras_features.md` as direction.

## Project SDD/testing configuration

Existing `openspec/config.yaml` is preserved. It declares `strict_tdd: true`, Bun as package manager/runtime, `bun test` as the test runner, tests under `tests/`, and installer typecheck via `cd installer && bun run typecheck`. This scope phase does not run tests, build, or typecheck.

## Phase boundary

This artifact is scope only. Map, design, tasks, implementation, and verification belong to later phases.
