# Scope: duplicate-startup-output-investigation

## Scope packet
scope: Diagnose why Ein startup output/notification can appear duplicated even though the current observation finds only one call to `startPiEinUp` at `ein-pi/agent/extensions/ein-banner.ts:348`. Treat both hypotheses as unconfirmed: `ctx.ui.notify` may duplicate presentation, or the extension may be loaded twice. Establish a later reproduction and provenance plan that can distinguish one function call rendered twice from two extension instances. Do not change behavior in this scope phase.
budget_allocated:
  max_tokens: 8000
  max_reads: 10
  max_runtime_ms: 120000

## Boundaries

- This is a separate, undiagnosed investigation issue; preserve the user observation without turning either hypothesis into a diagnosis.
- This scope does not investigate, implement, map, design, task, test, build, or perform a broad source scan.
- The later investigation must establish a reproducible startup session and provenance evidence sufficient to distinguish:
  1. one `startPiEinUp` invocation whose notification is presented twice; or
  2. two independently loaded extension instances/invocations.
- Evidence should correlate extension-instance identity, invocation identity, notification call, and rendered output/session provenance without changing behavior as part of this scope artifact.
- This issue must not alter, delay, or be included in roadmap block M `surface-wiring`; cleaner/workbench surface wiring remains independent.

## Planned diagnostic direction (later phase)

Capture a reproduction with timestamps/session identity and non-behavioral provenance around the observed startup path. Compare the count and identity of extension loads and `startPiEinUp` calls against the count of `ctx.ui.notify` calls and visible startup presentations. Keep the two hypotheses explicitly open until this evidence is available.

## Project SDD/testing configuration

- `strict_tdd: true` (existing `openspec/config.yaml`).
- Runtime/package manager: Bun; project context identifies Node.js/TypeScript ESM and installer TypeScript.
- Test runner: `bun test`; typecheck: `cd installer && bun run typecheck`.
- Existing configuration was read and preserved; no configuration changes were needed.

## Phase status

Scope artifact only. No source files, behavior, tests, builds, or implementation artifacts were changed or created.

## Spec delta declaration
spec_delta: none
spec_delta_reason: This artifact records an undiagnosed investigation plan and changes no observable behavior.
