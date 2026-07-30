# Scope — candidate-receipt-retirement-hardening

## SCOPE PACKET

```yaml
scope: Adopt and independently verify the useful post-review hardening already present at commit 961aefa, while restoring the original archived change and canonical specification to their verified 1f89b0f baseline before synchronizing this sibling change. Add missing observable adapter/tool coverage and produce fresh synchronized verification and delivery evidence for the final PR bytes.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Outcome

Preserve the post-review safety improvements without falsifying the earlier change's evidence. This sibling change owns the new behavior delta, its verification, the clean canonical synchronization, and the final candidate receipt.

## Canonical context

| Domain | Path | SHA-256 | UTF-8 bytes |
|---|---|---:|---:|
| `sdd-lifecycle` | `openspec/specs/sdd-lifecycle/spec.md` | `e74f081c21750fd3535929277fff5a22520a38ea2886cd51739bd815001d09bc` | 22940 |

Selection total: 1 file and 22940 bytes, within the shared limit of 3 files and 32768 bytes. The selected file is authoritative context for this scope, but incident evidence says its current working-tree form contains post-close synchronization that apply must unwind to the exact `1f89b0f` baseline before applying this sibling delta.

## Current SDD configuration

- OpenSpec is the canonical artifact store; Engram is unavailable.
- `strict_tdd: false`; requested tests remain mandatory coverage, but no tests run during scope.
- The configured project is Node.js/TypeScript ESM using Bun. The config has no general test command and records `cd installer && bun run typecheck` as the detected typecheck command.
- The skill registry exists at `.pi/ein/atl/skill-registry.md`.

## In scope

1. Preserve the source hardening already present at `961aefa` unless map/design identifies a confirmed defect requiring a minimal correction.
2. Restore every artifact under `openspec/changes/archive/candidate-receipt-retirement/` changed after `1f89b0f` to its exact bytes at `1f89b0f`, including its delta, sync report, verify report, summary, and apply evidence where changed. Historical evidence must describe only the bytes it originally verified.
3. Restore `openspec/specs/sdd-lifecycle/spec.md` to its exact `1f89b0f` baseline during apply, then synchronize only this sibling change's delta. The resulting sibling sync report must be fresh and `state: synchronized`; `state: conflict` is not close-ready.
4. Own only these post-review behaviors in the new delta: durable attempt persistence across sessions; unique push-URL resolution and bounded/abortable fresh observations; PID/token owner-matched lock recovery and directory durability; durable archive ancestry; immutable metadata race handling; and terminal `cleanupPending` retry behavior.
5. Add an observable successful merged-PR JSON normalization test for `candidate-receipt-retirement-remote.ts`.
6. Add a real public-tool execution/wiring test when feasible without broad extension-harness work. If mapping confirms that is not boundedly feasible, remove any static-string overclaim and record the residual wiring risk explicitly.
7. Independently run focused and full verification in later phases, refresh this change's summary, synchronize cleanly, archive this sibling change, and emit a fresh candidate receipt bound to the final bytes before merge.
8. Recalculate production/docs and test changed lines before delivery. The prior single-PR approval covered 1296 production/docs plus 217 test lines, not the current reported 1733 plus 392; delivery requires a new explicit user decision under the review-workload gate.

## Acceptance criteria

- Original archived artifacts modified after close are byte-identical to `1f89b0f`; no old report or summary claims coverage of `961aefa` behavior.
- Canonical `sdd-lifecycle` is first restored to the `1f89b0f` baseline and then receives only the six scenarios declared by this sibling delta.
- The sibling synchronization report is fresh and reports `state: synchronized` with no `added-existing` conflict.
- Useful `961aefa` hardening remains unless a confirmed defect is documented and minimally repaired.
- Focused coverage executes a valid merged-PR JSON response through the remote adapter and asserts its normalized observable result.
- Public tool wiring is exercised through real execution, or bounded infeasibility and residual risk are stated without treating static string inspection as behavioral proof.
- Focused and full verification evidence is fresh for the final implementation bytes.
- The archived sibling summary, canonical spec, sync evidence, and fresh candidate receipt agree with the final PR head and tree.
- No merge proceeds on the stale receipt bound to tree `1c3138ed...`; the current/final tree receives a newly emitted receipt.
- A new explicit delivery decision is obtained after the workload is recalculated.

## Non-goals

- Removing useful hardening merely to reduce diff size.
- Rewriting Git history or force-pushing.
- Supporting forks, direct push, non-GitHub remotes, or broader remote models.
- Changing grants, the four delivery gates, the mechanical declaration, or receipt payload version.
- Treating a conflicting synchronization report as acceptable.
- Editing source, archived artifacts, canonical specs, tests, or apply/verify evidence during scope.

## Constraints and risks

- Restoration and new synchronization must be separate, auditable steps; mixing them could conceal historical mutation.
- Existing green CI does not prove the missing adapter normalization or runtime tool wiring behavior.
- Filesystem durability behavior is platform-sensitive and must remain fail-closed where required by the delta.
- Cleanup after terminal unlink cannot be represented as rollback; the result must truthfully expose pending cleanup and permit safe retry.
- The current PR exceeds the 400-line review budget by a wide margin, so scope does not authorize delivery.

## Phase handoff

Map the exact `1f89b0f..961aefa` artifact and source changes, the remote adapter's executable seams, the public tool's bounded test harness, and the repository's actual focused/full Bun commands. Keep restoration, delta synchronization, verification, archival, receipt emission, and workload-gated delivery as distinct evidence-producing steps.
