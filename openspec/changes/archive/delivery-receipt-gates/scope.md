# Scope — delivery-receipt-gates

## SCOPE PACKET
scope: Implement quality-roadmap slice 04 so delivery preserves the identity of the verified candidate across pre-commit, post-commit against `HEAD^{tree}`, pre-push, and pre-PR boundaries. Keep user intent and content authorization separate, fail closed on identity divergence, and define explicit mechanical-delivery and PR-head mismatch behavior.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000

## Goal
Make a verified candidate receipt an enforceable content-identity prerequisite at every delivery boundary where Git state can diverge. The existing user-intent grant continues to authorize the requested action; the receipt independently authorizes only the exact verified content.

## Source of truth
- `docs/quality-roadmap/04-delivery-receipt-gates.md` — SHA-256 `bedfc209a16f6fcff4a969aaa5a46579d3eef4500f4dc55882d930b843c6b300`, 2283 bytes.
- Canonical domain `sdd-lifecycle`: `openspec/specs/sdd-lifecycle/spec.md` — SHA-256 `83ca133904563d34f022c03ffa22e878c6747fa2075d9a769d94d938a8bd800f`, 6857 bytes.
- Canonical context total: 1 specification file, 6857 UTF-8 bytes; within the 3-file/32768-byte phase limit.

## In scope
1. **Pre-commit gate:** reconstruct or compare the exact candidate identity immediately before commit and reject if the current deliverable content differs from the receipt.
2. **Post-commit gate:** after commit hooks complete, compare `HEAD^{tree}` with the receipt candidate tree; reject further delivery if hooks or commit processing changed content.
3. **Pre-push gate:** immediately before push, require the branch/HEAD content selected for push to retain the receipt identity.
4. **Pre-PR gate:** immediately before opening or updating a PR, require the actual PR head to be the validated delivery head; a different local or remote PR head blocks the operation.
5. At every mismatch, fail closed with a visible reason and an explicit route back to `verify`; do not silently refresh, replace, or recover the receipt.
6. Preserve the existing delivery-confirmation grant exactly: TTL, cwd scope, bounded uses, and confirmation semantics remain unchanged.
7. Define an explicit trivial/mechanical-delivery path: it must declare that no verification receipt applies, remain visibly distinct from verified SDD delivery, and must not fabricate or imply verification evidence.
8. Cover the four gates, hook-induced index/tree mutation, visible verify rerouting, mechanical declaration, and PR-head mismatch with deterministic tests.

## Measurable success criteria
- A matching receipt permits each of the four identity checks to pass without changing the existing intent-grant decision.
- Changing declared candidate bytes before commit causes pre-commit rejection and a visible `verify` next action.
- A commit hook that changes committed content causes `HEAD^{tree}` to differ and post-commit rejection before push or PR.
- Changing the selected branch or HEAD after post-commit validation causes pre-push rejection.
- Opening or updating a PR whose effective head differs from the validated head is rejected.
- Missing, malformed, stale, or mismatched receipt evidence fails closed for verified SDD delivery at every applicable boundary.
- Trivial/mechanical delivery is accepted only through an explicit no-verification declaration and never emits or claims a verified candidate receipt.
- Existing tests for confirmation grant TTL, cwd scoping, bounded uses, and action authorization remain behaviorally unchanged.

## Non-goals
- Changing, merging, replacing, or extending the user-intent confirmation grant.
- Locks, an authority graph, journals, a daemon, a native binary, or automatic recovery/re-verification.
- Automatic receipt refresh after divergence.
- Broad redesign of Git delivery, candidate-receipt emission, verification, or close readiness beyond the seams needed by these gates.
- Linear operations or team-board integration.

## Constraints and invariants
- Intent authorizes the action; candidate receipt identity authorizes the content. Passing either check cannot substitute for the other.
- Validation occurs at all four boundaries because hooks and intervening Git operations can mutate index, tree, branch, or remote head.
- Any identity uncertainty is a mismatch and blocks delivery.
- This scope phase does not implement source changes or execute tests.
- `strict_tdd` remains `false` in `openspec/config.yaml`; apply/verify must use the repository's established Bun/TypeScript test conventions discovered during mapping.

## Expected impact and review forecast
Likely areas are `ein-pi/agent/lib/git-delivery.ts`, adjacent candidate-receipt/tree comparison utilities, `ein-pi/core/agents/ein-git.md`, and focused tests under `tests/`. The slice is one cohesive delivery invariant and is forecast to fit the 400-production-line review budget; map/design must decompose it before apply if concrete production work is forecast above 400 changed lines.

## Risks
- Git hooks can mutate the index or committed tree after an earlier check, making a single validation unsafe.
- Local branch identity can match while the effective remote PR head differs.
- Mechanical-delivery wording could become an accidental bypass unless it is explicit, narrow, and never presented as verified delivery.
- The canonical `candidate-receipt-delivery-limit` currently forbids receipt enforcement and a mechanical lane; the accompanying delta intentionally replaces that adoption limit for this slice.

## Phase handoff
Map only the delivery boundaries, candidate-receipt validation seams, intent-grant seam, PR-head resolution, and focused tests. Preserve the four checks as distinct gates rather than collapsing them into one early validation.
