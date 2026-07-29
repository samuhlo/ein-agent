# Zero-friction SDD start

Make an explicitly requested SDD bootstrap OpenSpec when needed and continue directly into `sdd-scope`. Keep manual initialization and real phase gates compatible while making status diagnostics depend on the current phase.

## SCOPE PACKET

```yaml
scope: Remove friction when starting a new SDD. Reuse project initialization from the SDD entry path, continue into scope without redundant user steps, and make status diagnostics phase-relative so future artifacts are not reported as blockers.
change_name: zero-friction-sdd-start
webfetch: false
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 600000
```

## Current project context

- `openspec/config.yaml` already exists and must remain unchanged by this scope phase.
- The current SDD configuration has `strict_tdd: false`.
- The project is Node.js/TypeScript ESM and uses Bun under `installer/`.
- No reliable test runner command is currently recorded in `openspec/config.yaml`; the implementation phase must identify the existing targeted test convention without changing package managers.
- `.pi/ein/atl/skill-registry.md` exists.
- The authoritative orchestrator inventory already contains the `sdd-scope` row. This change must preserve it.

## In scope

1. Extract OpenSpec configuration creation from the `/sdd-init` command handler into reusable code.
2. Use that shared bootstrap from both manual `/sdd-init` and SDD startup/preflight.
3. During SDD startup, create `openspec/config.yaml` safely when absent and never overwrite it when present.
4. After bootstrap, continue to `sdd-scope` in the same requested flow without asking the user to run `/sdd-init` or reconfirm bootstrap.
5. Make `sdd-status` diagnostics phase-relative:
   - During scope, map, and design, absent `tasks.md` is future pending work, not a blocker.
   - Real blockers in tasks, apply, and verify continue to surface.
6. Preserve `/sdd-init` as a compatible manual command.
7. Preserve interactive gates between actual SDD phases.
8. Add focused tests for missing-config startup, existing-config preservation, and phase-relative status behavior.

## Acceptance criteria

1. Starting an explicitly requested SDD in a project without config prepares OpenSpec and creates `scope.md` without requiring a second manual command.
2. Existing `openspec/config.yaml` content remains byte-for-byte unchanged.
3. During the scope phase, status recommends `scope` and does not list `tasks.md absent` as a blocker.
4. Genuine tasks/apply/verify blockers still surface at the phases where they are actionable.
5. Tests cover missing-config startup, existing-config preservation, and phase-relative status.

## Compatibility and invariants

- Keep the existing `sdd-scope` entry in the authoritative orchestrator inventory.
- Bootstrap is idempotent with respect to an existing config: existence means preserve, not regenerate or merge.
- Automatic bootstrap removes only the redundant initialization step; it does not remove phase-transition confirmation gates.
- Manual `/sdd-init` remains available and uses the same reusable config-creation behavior as startup/preflight.
- Status distinguishes future artifacts from current actionable blockers rather than suppressing blocker reporting globally.

## Non-goals

- Read-only assessment mode or token optimization.
- Engram behavior changes.
- Full automatic execution through apply.
- Phase or artifact renaming.
- Broad redesign of `/ein:sdd-next`.

## Risks and boundaries

- Sharing bootstrap logic can accidentally change `/sdd-init` output or overwrite behavior; compatibility and preservation tests are required.
- Over-broad status filtering could hide real downstream failures; diagnostics must be keyed to phase/actionability, not merely artifact absence.
- Continuing automatically into scope must not be generalized into automatic progression across later SDD phases.
- Existing unrelated working-tree changes, especially the orchestrator inventory edit, must not be rewritten or reverted.

## Exit condition for scope

This scope is ready for `sdd-map` when mapping stays bounded to the SDD entry/preflight path, `/sdd-init` config creation, `sdd-status` diagnostic rules, and their targeted tests.