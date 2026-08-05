# Scope: optimize-tdd-verify

Optimize strict-TDD apply versus final verify command execution without weakening evidence or the close gate. Preserve apply's RED→GREEN→TRIANGULATE→REFACTOR focused cycles and verify's independent freshness/evidence audit; remove only redundant final execution by deduplicating identical commands, rerunning one final focused command per behavior seam, and running relevant global checks once.

## Scope packet

```yaml
scope: Optimize strict-TDD apply versus final verify command execution while preserving focused TDD cycles, independent freshness/evidence auditing, and the existing close gate.
budget_allocated:
  max_tokens: 15000
  max_reads: 12
  max_runtime_ms: 120000
```

## In scope

- Update the apply/verify workflow guidance and its tests or contracts as needed to express command de-duplication.
- Keep apply's RED→GREEN→TRIANGULATE→REFACTOR focused testing intact.
- Keep verify independent: it must perform its own freshness and evidence audit and rerun required checks.
- Deduplicate identical commands, retain one final focused command per behavior seam, and run relevant global checks once.
- Preserve the current no-cache, no timestamp/hash reuse, and no weaker close-gate constraints.

## Out of scope

- Production application behavior, production builds during apply, and unrelated repository-wide refactors.
- Cross-run caches or reuse of timestamps/hashes as evidence.
- Replacing independent verify execution with apply evidence.
- Running tests, builds, or the full repository suite during this scope phase.

## Accepted evidence and routing

The accepted ownership evidence is:

- `ein-pi/core/agents/sdd-apply.md` owns focused TDD cycles.
- `ein-pi/core/agents/sdd-verify.md` independently audits and reruns.
- `openspec/config.yaml` has `strict_tdd: true` and blank global test commands.

Downstream phases should limit discovery to these workflow surfaces and directly relevant tests/contracts/docs. Any deterministic support needed downstream must be justified before expanding beyond those surfaces.

## Current SDD configuration

- Project context identifies a Node.js/TypeScript ESM project using Bun.
- `strict_tdd` is `true`.
- Apply and verify test commands are blank; the configured global test command lists are empty.
- A typecheck command exists for `installer`, but this scope phase does not execute it.
- `openspec/config.yaml` was preserved unchanged because it already contains the required SDD configuration.

## Phase boundary

This artifact defines scope only. Do not implement, run the test suite or build, or create apply/verify progress artifacts in this phase.

