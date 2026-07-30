# Tasks — candidate-receipt-retirement

status: ready
blocked_by: none

## // 001. Retirement evidence and state contract

- [x] 1.1 Define the pure retirement input/observation/result schema, exact fingerprint and repository/PR binding decision, safe fingerprint-addressed archive naming, and stale-attempt rejection without remote I/O.
  - production files: `ein-pi/agent/lib/delivery-receipt.ts`, `ein-pi/agent/lib/candidate-receipt.ts`
  - test files: `tests/candidate-receipt.test.ts`, `tests/delivery-gate.test.ts`
  - before: no retirement decision contract, archive identity helper, or explicit stale-attempt rule exists.
  - after: pure functions fail closed unless active raw-byte fingerprint, validated head, local identities, explicit delivery identities, and normalized same-repository merged-PR evidence bind exactly; archive paths are fingerprint-addressed and safe.
  - acceptance: `candidate-receipt-bound-retirement-evidence`, `candidate-receipt-invalid-attempt-or-receipt`, `candidate-receipt-attempt-rotation`, `candidate-receipt-terminal-boundary`
  - blocked_by: none
  - skills: `architecture`, `typescript-advanced-types`, `bun`
  - why: Establishes an independently testable authorization boundary before filesystem or GitHub effects exist.
  - learn: A fingerprint binds the exact serialized evidence, not merely an equivalent parsed object.
  - architecture: Keep policy in pure library functions; remote observation and persistence remain adapters.
  - avoid: Accepting branch names, local HEAD, or caller-provided completion JSON as retirement proof.
  - verify: `bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts` (and `bun run typecheck` if that script exists)

## // 002. Atomic archival and active-slot deactivation

- [x] 2.1 Implement lifecycle locking shared by candidate emission and retirement, exact-byte archive publication plus immutable metadata conflict checks, revalidation, ordered active-slot removal, and retry-safe idempotency.
  - production files: `ein-pi/agent/lib/candidate-receipt.ts`
  - test files: `tests/candidate-receipt.test.ts`
  - before: the active receipt is atomically emitted but cannot be archived, retired, or safely resumed after an interrupted transition.
  - after: retirement publishes and reads back exact receipt bytes and matching immutable metadata before unlinking the still-matching active slot; conflicting evidence, lock contention, publication/removal failure, and concurrent mutation retain the active gate, while matching retries are deterministic.
  - acceptance: `candidate-receipt-successful-retirement`, `candidate-receipt-archive-before-deactivate`, `candidate-receipt-idempotent-retirement`, `candidate-receipt-retirement-concurrent-revalidation`, `candidate-receipt-attempt-rotation`
  - blocked_by: `001. Retirement evidence and state contract`
  - skills: `architecture`, `typescript-advanced-types`, `bun`
  - why: Archive-before-deactivate prevents evidence loss and ensures partial failures remain conservative.
  - learn: Two filesystem operations become safe by ordering them so the live gate survives every intermediate state.
  - architecture: `candidate-receipt.ts` owns filesystem state and raw-byte integrity; it receives an already-approved decision rather than performing network work.
  - avoid: Moving or deleting the live receipt first, overwriting archive conflicts, or silently reserializing historical evidence.
  - verify: `bun test tests/candidate-receipt.test.ts` (and `bun run typecheck` if that script exists)

## // 003. Fresh GitHub merge observation and explicit retirement tool

- [x] 3.1 Register `ein_candidate_receipt_retire` with required explicit delivery identities; normalize two in-operation `gh pr view` observations for same-repository merged PRs only, invoke the pure decision and persistence transition, and clear the matching session attempt only after successful unlink.
  - production files: `ein-pi/agent/extensions/ein-ai.ts`
  - test files: `tests/candidate-receipt.test.ts`, `tests/delivery-gate.test.ts`
  - before: no tool can observe a completed PR or retire a receipt; session attempt state is never rotated after a completed lifecycle transition.
  - after: the explicit tool accepts only `change`, receipt fingerprint, remote, base ref, head ref, and PR number; it fails closed for unavailable/auth-failed/malformed/unmerged/ambiguous/mismatched/fork observations and never fabricates a verification claim.
  - acceptance: `candidate-receipt-explicit-retirement-trigger`, `candidate-receipt-fresh-network-truth`, `candidate-receipt-terminal-boundary`, `candidate-receipt-bound-retirement-evidence`, `candidate-receipt-successful-retirement`
  - blocked_by: `001. Retirement evidence and state contract`; `002. Atomic archival and active-slot deactivation`
  - skills: `architecture`, `typescript-advanced-types`, `bun`, `comment-style`
  - why: The tool is the narrow adapter that obtains fresh external truth without allowing external data into domain authorization unchecked.
  - learn: A remote adapter normalizes untrusted CLI output into a small typed observation before policy evaluates it.
  - architecture: `ein-ai.ts` owns CLI/tool wiring and session state; `delivery-receipt.ts` decides validity; `candidate-receipt.ts` owns the transition.
  - avoid: Inferring a PR from local branches, supporting forks, reusing pre-PR snapshots, or clearing attempt state before deactivation succeeds.
  - verify: `bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts` (and `bun run typecheck` if that script exists)

## // 004. Delivery overlap lifecycle evidence and final audit

- [x] 4.1 Prove that overlapping mechanical delivery remains blocked while retirement is absent or fails, then proceeds only after safe retirement under its unchanged mechanical declaration, grant, and identity gates; run the final focused retirement audit.
  - production files: none (the design keeps `ein-pi/agent/lib/delivery-gate.ts` and mechanical declaration behavior unchanged)
  - test files: `tests/delivery-gate.test.ts`, `tests/candidate-receipt.test.ts`
  - before: no regression evidence connects active/retired receipt state to later overlapping mechanical delivery.
  - after: tests demonstrate that retirement removes only the old content gate after all checks succeed and does not convert later delivery into verified content or weaken delivery grants/declarations.
  - acceptance: `candidate-receipt-mechanical-overlap-lifecycle`, `candidate-receipt-archive-before-deactivate`, `candidate-receipt-invalid-attempt-or-receipt`
  - blocked_by: `002. Atomic archival and active-slot deactivation`; `003. Fresh GitHub merge observation and explicit retirement tool`
  - skills: `bun`, `architecture`
  - why: This protects the user-visible reason for retirement without broadening existing delivery policy.
  - learn: Retiring old evidence removes a stale gate; it never becomes authorization for a new delivery.
  - architecture: Preserve `delivery-gate.ts` as the existing mechanical-policy authority; lifecycle state changes only the presence of the old active receipt.
  - avoid: Editing mechanical declarations, grants, or the four identity gates to special-case retired receipts.
  - verify: `bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts && bun test && git diff --check && bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts` (run `bun run typecheck` if available; no installer files are touched, so no installer typecheck is required)
