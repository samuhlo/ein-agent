# Design — harden-scope-retries

## A. Proposal

### Intent

Make `sdd-scope` retries preserve an already-valid persisted OpenSpec delta, and make deterministic routing fail closed at the canonical scope-to-map boundary when existing `specState` is `unresolved` or `conflict`. Preserve map eligibility for `pending` and `synchronized` without changing synchronization semantics.

### Scope

In scope:

- Add a mandatory persisted-delta preflight to the `sdd-scope` contract.
- Add a canonical scope-to-map gate in the deterministic router using the existing `specState` result.
- Return `scope` with an explicit provenance diagnostic for blocked states because `SddNext` has no separate remediation phase.
- Add focused Bun regressions for delta preservation and all four relevant states.

Out of scope:

- Transactions, staging, rollback infrastructure, merge/reconciliation systems, or new provenance states.
- Delta grammar, canonical synchronization, close-readiness, timeout, model, retry-policy, or delivery changes.
- Changes to legacy `.sdd` routing, `openspec/changes/optimize-tdd-verify/`, or `docs/roadmap-codegraph-tdd-launcher.md`.

### Canonical context

| Path | SHA-256 | UTF-8 bytes |
| --- | --- | ---: |
| `openspec/specs/sdd-lifecycle/spec.md` | `51ee0e4de3db05d77e73dbf08a9a207f7adf5fe31e39af6b66428b144692e990` | 17,452 |

The selection contains one file and 17,452 bytes, within the three-file and 32 KiB shared limit.

### Affected areas

- `ein-pi/core/agents/sdd-scope.md`: contract ordering and preservation rules.
- `ein-pi/agent/lib/sdd-router.ts`: map-boundary route and diagnostic selection.
- `tests/sdd-flow-contract.test.ts`: static scope-contract regression.
- `tests/sdd-router.test.ts`: status and router state matrix.
- `tests/sdd-next-dispatcher.test.ts`: report-level diagnostic visibility.

`readSpecDeltaDeclaration()` and `evaluateOpenSpecState()` remain the validation and state authorities; their source files are not change targets.

### Risks

- Returning `scope` when `scope.md` exists can look like a missing-scope loop unless the reason explicitly identifies the provenance state and blocked transition.
- A route-only assertion could pass while the user-facing reason becomes generic or disappears.
- Contract wording that checks persisted deltas too late could still permit a destructive `none` declaration or regeneration before preservation applies.

### Rollback

Revert the contract, router, and focused test changes together. No data migration or rollback mechanism is needed because this design does not rewrite canonical specs or valid persisted deltas.

### Success criteria

- A valid persisted delta remains byte-for-byte unchanged after a scope retry, with no contradictory `spec_delta: none` declaration or replacement delta.
- At the canonical scope-to-map boundary, `unresolved` and `conflict` return `scope`, never `map`, and expose a diagnostic naming the exact state.
- At the same boundary, `pending` and `synchronized` continue to return `map` when no earlier gate blocks.
- Legacy `.sdd` routing and later lifecycle phases retain their current behavior.

## B. Spec

### Requirement 1: Persisted-delta preflight

The `sdd-scope` contract MUST require a persisted-delta preflight for the active canonical change before the executor may declare `spec_delta: none`, invoke the deterministic delta writer, replace a delta, or regenerate delta content. When the existing declaration validates as `delta` under the current declaration/parser rules, the executor MUST treat the complete persisted delta set and its exact bytes as authoritative and MUST perform none of those writes.

**Scenario: A valid delta survives a scope retry**

- **Given** an active canonical change contains one or more persisted delta files that collectively pass the existing declaration and delta validation.
- **When** `sdd-scope` retries or re-evaluates that change.
- **Then** every validated delta retains its exact bytes, no `spec_delta: none` block is added, and no replacement or regenerated delta is written.

Missing or invalid provenance MUST continue through the existing validation and declaration path. The contract MUST NOT define partial-delta preservation, repair, reconciliation, staging, or rollback behavior for an invalid declaration set.

### Requirement 2: Unresolved provenance blocks map

The deterministic router MUST fail closed when the ordinary next phase is `map` and the canonical change has `specState: unresolved`. It MUST return `scope`, append an explicit provenance blocker, and MUST NOT describe scope as missing.

The status blocker and `resolveSddNext()` reason MUST be: `estado de specs OpenSpec: unresolved; map bloqueado hasta resolver la procedencia desde scope.` The suggested action MUST keep the change in `scope`, name `unresolved`, and direct the caller to the existing OpenSpec validation flow rather than proposing a new repair mechanism.

**Scenario: Unresolved provenance stays in scope**

- **Given** a canonical change has `scope.md`, lacks `map.md`, and evaluates to `specState: unresolved`.
- **When** status or next-step routing is resolved.
- **Then** `nextRecommended` is `scope`, never `map`, and the blocker and report reason identify `unresolved` provenance.

### Requirement 3: Conflicting provenance blocks map

The deterministic router MUST fail closed when the ordinary next phase is `map` and the canonical change has `specState: conflict`. It MUST return `scope` and surface the conflict without changing conflict evaluation or adding reconciliation behavior.

The status blocker and `resolveSddNext()` reason MUST be: `estado de specs OpenSpec: conflict; map bloqueado hasta resolver la procedencia desde scope.` The suggested action MUST keep the change in `scope`, name `conflict`, and direct the caller to the existing OpenSpec validation/synchronization flow.

**Scenario: Conflicting provenance stays in scope**

- **Given** a canonical change has `scope.md`, lacks `map.md`, and evaluates to `specState: conflict`.
- **When** status or next-step routing is resolved.
- **Then** `nextRecommended` is `scope`, never `map`, and the blocker and report reason identify `conflict` provenance.

### Requirement 4: Pending provenance remains eligible

The deterministic router MUST preserve `map` eligibility for `specState: pending` at the canonical scope-to-map boundary. Pending means synchronization has not completed; it does not block mapping.

**Scenario: Pending provenance advances to map**

- **Given** a canonical change has `scope.md`, lacks `map.md`, contains a valid delta, and evaluates to `specState: pending`.
- **When** status or next-step routing is resolved with no earlier blocker.
- **Then** `nextRecommended` remains `map` and no map-boundary provenance blocker is added.

### Requirement 5: Synchronized provenance remains eligible

The deterministic router MUST preserve `map` eligibility for `specState: synchronized` at the canonical scope-to-map boundary.

**Scenario: Synchronized provenance advances to map**

- **Given** a canonical change has `scope.md`, lacks `map.md`, and evaluates to `specState: synchronized`.
- **When** status or next-step routing is resolved with no earlier blocker.
- **Then** `nextRecommended` remains `map` and no map-boundary provenance blocker is added.

### Requirement 6: Gate boundaries remain narrow

The provenance gate MUST apply only when the ordinary deterministic candidate is `map` for a canonical OpenSpec change. It MUST NOT alter missing-scope routing, changes that already have `map.md`, later phases, close-readiness behavior, or the legacy `.sdd` lifecycle.

**Scenario: Unrelated lifecycle routing is unchanged**

- **Given** a change is outside the canonical scope-to-map boundary because it is legacy, lacks scope, already has map, or has reached a later phase.
- **When** status or next-step routing is resolved.
- **Then** the existing lifecycle result and diagnostics remain unchanged by this gate.

## C. Decisions

### 1. Put delta authority in the scope contract, not a new persistence subsystem

`ein-pi/core/agents/sdd-scope.md` owns operation ordering: validate persisted provenance first, then use the existing declaration path only when no valid delta declaration already exists. `readSpecDeltaDeclaration()` and the strict delta parser own validity; the scope contract does not duplicate grammar or invent a second parser.

This choice is intentionally contract-level because `sdd-scope` is an agent prompt and the requested failure is a destructive retry instruction. Runtime transactions, staging, and rollback would add machinery beyond the observed problem.

### 2. Gate the already-computed ordinary `map` candidate

`resolveSddStatus()` already computes `specState` through `readSpecDeltaDeclaration()` and `evaluateOpenSpecState()`. After normal phase selection, the router changes only an ordinary `map` candidate with `unresolved` or `conflict` to `scope` and adds the state-specific blocker. Checking the candidate keeps the rule limited to `scope.md` present and `map.md` absent without broad lifecycle changes.

### 3. Preserve the existing phase vocabulary

`SddNext` remains `SddPhase | "done"`; no remediation phase or status type is added. `scope` is the smallest compatible non-map route. `resolveSddNext()` uses provenance-specific reason and action copy at this boundary so the existing generic “scope missing” message never misrepresents the state.

### 4. Keep state semantics where they are

The design consumes `unresolved`, `conflict`, `pending`, and `synchronized` exactly as currently evaluated. It does not modify sync reports, canonical bytes, close blockers, or the meaning of any state.

### 5. Use focused contract and state-matrix tests

`tests/sdd-flow-contract.test.ts` owns the static ordering and preservation contract because no runtime scope function executes the agent prompt. `tests/sdd-router.test.ts` owns the four-state routing matrix and asserts both route and blocker. `tests/sdd-next-dispatcher.test.ts` owns the rendered/report reason so diagnostics cannot silently regress.

### Alternatives rejected

- **Transaction or staging layer:** disproportionate to a prompt-ordering defect and explicitly excluded.
- **Automatic reconciliation or conflict repair:** changes synchronization semantics and cannot be inferred safely.
- **New remediation phase or blocker type:** expands public routing vocabulary when `scope` plus an explicit reason is sufficient.
- **Blocking `pending`:** contradicts the agreed lifecycle, where mapping may continue before synchronization.
- **Gating every phase or close:** broadens behavior beyond the exact scope-to-map seam and duplicates existing close readiness.
- **Changing retries, timeouts, or models:** does not address persisted authority or deterministic routing.

## D. Success Criteria

Acceptance requires all of the following observable results:

- The scope contract places valid persisted-delta validation before every `none`, writer, replacement, or regeneration path and explicitly requires byte preservation.
- Focused tests demonstrate `unresolved → scope`, `conflict → scope`, `pending → map`, and `synchronized → map` for canonical changes with `scope.md` and without `map.md`.
- Blocked-state tests assert `nextRecommended`, `blocked`, `reason`, and state-specific suggested action; neither report uses generic missing-scope copy.
- Compatibility coverage demonstrates that legacy `.sdd` routing remains unchanged.
- The implementation changes only the declared production and focused test surfaces and introduces none of the excluded mechanisms.

The focused verification command is:

```bash
bun test tests/sdd-router.test.ts tests/sdd-next-dispatcher.test.ts tests/sdd-flow-contract.test.ts
```

No test, build, or typecheck command runs during design. Apply and verify phases must record fresh command evidence under the repository's strict-TDD policy.
