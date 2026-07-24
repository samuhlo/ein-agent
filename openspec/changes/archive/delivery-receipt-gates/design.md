# Design — delivery receipt gates

## Canonical context

| Path | SHA-256 | UTF-8 bytes |
|---|---|---:|
| `openspec/specs/sdd-lifecycle/spec.md` | `83ca133904563d34f022c03ffa22e878c6747fa2075d9a769d94d938a8bd800f` | 6857 |

Selection: 1 canonical specification file, 6857 bytes. This is within the 3-file and 32 KiB limit declared by `scope.md`.

## A. Proposal

### Intent

Make delivery preserve the exact verified candidate across four independent Git boundaries. The existing user-intent grant continues to authorize the requested action; a current candidate receipt independently authorizes only the exact verified content.

### Scope

In scope:

- A typed delivery-content declaration: verified SDD delivery for one named change, or explicitly mechanical/trivial delivery with no verification receipt.
- Independent pre-commit, post-commit, pre-push, and pre-PR content-identity gates.
- Fresh fail-closed receipt validation at every verified-SDD gate, stable receipt identity throughout one delivery attempt, and a visible route back to verify.
- Effective local, remote, and existing-PR head resolution before PR creation or update.
- Deterministic helper and prompt-contract coverage while preserving the existing intent-grant behavior.

Explicit non-goals:

- Changing user-intent detection, confirmation modes, grant TTL, cwd scope, bounded uses, legacy use behavior, storage, or force-push policy.
- Changing candidate-receipt emission, version, path-manifest semantics, verify readiness, or automatic publication behavior.
- Inferring mechanical delivery from file types, TDD mode, missing SDD artifacts, or a missing receipt.
- Automatic re-verification, receipt refresh/replacement, rollback recovery, locks, journals, daemons, authority graphs, native binaries, or a broad Git/GitHub abstraction.
- Linear integration, broad delivery redesign, and Pi contract v0.22.1 work.

### Affected areas

- `ein-pi/agent/lib/candidate-receipt.ts` or one small adjacent delivery-receipt module: pure tree/head comparisons and typed gate results.
- `ein-pi/core/agents/ein-git.md`: delivery declaration, four gate placements, pinned push/PR-head rules, and visible verify rerouting.
- `tests/candidate-receipt.test.ts`: deterministic Git identity and hook-mutation cases.
- `tests/ein-git-noninteractive.test.ts`: operational contract for four gates, mechanical declaration, PR-head resolution, and recovery wording.
- `tests/git-delivery.test.ts` and `tests/guardrails.test.ts`: declaration parsing only if owned there, plus unchanged intent/grant regressions.

`git-delivery.ts` and `guardrails.ts` are not owners of candidate-content authority. They may carry typed context only if necessary; their intent and grant decisions remain unchanged.

### Risks

- A hook can change the index or committed tree after the pre-commit comparison.
- A branch, HEAD, push source, remote branch, or existing PR head can change after an earlier gate.
- A mechanical declaration can become an implicit bypass if it is inferred or described as verified.
- GitHub cannot provide a transactional lock between remote-head inspection and PR mutation; immediate precondition checks and mandatory read-back must detect that race.
- Spreading enforcement through extension plumbing could exceed the review budget.

### Rollback boundary

The four content gates and the explicit content-authority declaration form one rollback unit. Rollback MUST disable or revert all four new gates together and restore the prior delivery behavior; it MUST NOT modify, delete, broaden, or reinterpret the existing user-intent grant. Individual gate disablement is not supported because it would leave an undocumented TOCTOU gap.

### Success criteria

Verified SDD delivery advances only when both independent authorities pass: the unchanged intent authorization for the action and a current receipt for the exact content. Each boundary rejects absent, malformed, stale, replaced, unresolvable, or divergent identity with the gate name, reason, and an instruction to return to verify. Explicit mechanical delivery remains unverified and still requires the existing intent authorization.

## B. Spec

### Requirement: independent action and content authority

The system MUST keep user-intent authorization and candidate-content authorization independent. It MUST preserve the existing intent grant's confirmation semantics, 10-minute TTL, exact cwd scope, three-use bound, legacy one-use behavior, and storage; success at either authority MUST NOT satisfy the other.

**Scenario**

- **Given** a requested delivery action has only an intent grant or only a matching candidate receipt
- **When** delivery authorization is evaluated
- **Then** delivery is blocked until the other applicable authority also passes, without minting, consuming, extending, or reinterpreting the intent grant as part of receipt validation

### Requirement: explicit delivery-content mode

The system MUST require exactly one explicit content-authority mode: `verified-sdd` with a safe named change, or `mechanical-unverified` with the literal declaration `no-verification-receipt-applies`. Missing, malformed, ambiguous, or conflicting modes MUST fail closed and MUST NOT be inferred from repository state.

**Scenario**

- **Given** an authorized delivery request lacks a valid content-authority declaration
- **When** `ein-git` prepares a delivery mutation
- **Then** it performs no mutation and reports that the caller must supply one explicit mode

### Requirement: pre-commit identity gate

For `verified-sdd`, the system MUST immediately before commit freshly validate the receipt, require the current base HEAD to match the receipt's candidate base, reconstruct the declared candidate, stage only the exact receipt manifest, and require the resulting index tree to equal the receipt tree before invoking `git commit`.

**Scenario**

- **Given** a valid receipt exists for declared candidate bytes
- **When** a declared byte, base HEAD, staged path, or index tree differs before commit
- **Then** the pre-commit gate rejects the commit and routes the change to verify

### Requirement: post-commit identity gate

For `verified-sdd`, the system MUST revalidate receipt evidence after commit processing and hooks complete, resolve `HEAD^{tree}`, and require it to equal the receipt tree. Only a successful comparison MAY capture the resulting commit SHA as the validated delivery head.

**Scenario**

- **Given** the pre-commit gate passed
- **When** commit processing or a hook records different content
- **Then** `HEAD^{tree}` differs, the post-commit gate blocks subsequent push and PR actions, and no validated delivery head is retained

### Requirement: pre-push identity gate

For `verified-sdd`, the system MUST immediately before push freshly validate the same receipt, require a validated delivery head, and require the selected local push source and its tree to equal respectively that validated head and the receipt tree. The push MUST use the validated commit SHA as its explicit source rather than a mutable branch name.

**Scenario**

- **Given** post-commit validation captured a delivery head
- **When** HEAD, the selected branch, its commit, its tree, or the receipt identity changes before push
- **Then** the pre-push gate rejects the push and routes the change to verify

### Requirement: pre-PR effective-head gate

For `verified-sdd`, the system MUST immediately before PR creation or update freshly validate the same receipt and resolve the explicit local PR head, its effective remote branch head, and any existing PR head. Every applicable head MUST resolve to the validated delivery head; an absent, unresolvable, or different identity MUST block the PR mutation.

**Scenario**

- **Given** local content passed the earlier gates
- **When** the explicit local head, effective remote head, or existing PR head differs from the validated delivery head
- **Then** opening or updating the PR is rejected before mutation and the change is routed to verify

### Requirement: fail-closed recovery and stable evidence

At every verified-SDD gate, the system MUST reject absent, unreadable, malformed, unsupported, stale, replaced, internally inconsistent, repository/worktree/change-mismatched, or divergent receipt identity. It MUST name the boundary and reason, visibly instruct the caller to return to `sdd-verify`, re-verify, emit a new receipt, and restart delivery, and MUST NOT refresh or replace evidence itself.

**Scenario**

- **Given** a verified delivery attempt has started with one receipt identity
- **When** a later gate cannot validate that same identity or cannot resolve an observed Git/GitHub identity
- **Then** the requested mutation does not proceed and the response gives the explicit verify route without automatic recovery

### Requirement: explicit mechanical delivery remains unverified

The system MUST allow a mechanical/trivial delivery without receipt gates only when the caller explicitly supplies `mechanical-unverified` and the literal `no-verification-receipt-applies` declaration. It MUST display that the delivery is unverified, MUST NOT inspect missing evidence as an implicit declaration, MUST NOT emit, fabricate, or claim a candidate receipt, and MUST still require the unchanged user-intent authorization.

**Scenario**

- **Given** a genuinely mechanical delivery has no applicable verification receipt and has an existing intent authorization
- **When** the caller explicitly declares `mechanical-unverified: no-verification-receipt-applies`
- **Then** delivery may use the existing flow without claiming verified-SDD evidence, while an omitted or inferred declaration is rejected

### Requirement: boundary-local TOCTOU protection

The system MUST re-read authoritative identity at each boundary; no earlier result MAY substitute for a later gate. It MUST compare the staged index immediately before commit, committed `HEAD^{tree}` after hooks, a SHA-pinned source immediately before push, and effective remote/PR head immediately before PR mutation, followed by the existing PR JSON read-back.

**Scenario**

- **Given** one gate passed and Git or remote state changes before a later mutation
- **When** the next boundary is reached
- **Then** that boundary observes the current identity and rejects divergence instead of relying on cached success

## C. Decisions

### 1. Use a discriminated content-authority request

The delivery request carries one of these conceptual shapes:

```ts
type DeliveryContentAuthority =
  | { mode: "verified-sdd"; change: string }
  | {
      mode: "mechanical-unverified";
      declaration: "no-verification-receipt-applies";
    };
```

This is intentionally narrower than prose classification. Mechanical delivery is an explicit caller assertion, never a conclusion drawn from extensions, changed paths, TDD settings, absent SDD files, or receipt failure. It creates no verification evidence.

### 2. Model the four gates as separate transitions

| Gate | Fresh authoritative inputs | Pass output | Mutation protected |
|---|---|---|---|
| Pre-commit | Current receipt, receipt base HEAD, reconstructed candidate, exact staged index tree | Receipt identity plus matching candidate/index | `git commit` |
| Post-commit | Same receipt identity, resulting `HEAD^{tree}` after hooks | `validatedDeliveryHead = HEAD` | Any later push/PR |
| Pre-push | Same receipt identity, selected local source OID/tree, validated delivery head | SHA-pinned push source | `git push` |
| Pre-PR | Same receipt identity, explicit local head, effective remote head, existing PR head when updating | Matching effective head | `gh pr create` or update |

A small in-process verified-delivery state may retain the original receipt fingerprint and post-commit validated head for the bounded delivery attempt. It is not a new persisted receipt, grant, or journal. Missing state at a later required gate is uncertainty and therefore fails closed.

### 3. Compare the authoritative representation for each boundary

Before commit, the real index tree is authoritative after exact named staging. After commit, Git's `HEAD^{tree}` is authoritative because hooks may have changed what was recorded. Before push, the selected source commit is authoritative and is pinned by SHA in the refspec. Before PR, the remote branch or existing PR head is authoritative, not merely the current local branch name.

The shared receipt validator remains responsible for receipt structure and current SDD evidence. Boundary helpers own transient Git identity. This avoids teaching candidate-receipt emission about delivery state or teaching the intent-grant subsystem about content.

### 4. Treat every unresolvable identity as divergence

Gate results are structured pass/fail values with a boundary and reason. They do not silently retry, select a different branch, refresh a receipt, or downgrade verified delivery to mechanical delivery. User-visible failure states the expected and observed identity when safely available, then gives one recovery route: verify again, emit a new receipt, and restart delivery.

### 5. Resolve PR heads before mutation and retain read-back

PR creation uses its explicit `--head` branch to resolve both the local commit and effective remote commit. PR update additionally reads the existing PR head OID. All applicable OIDs must equal the validated delivery head. The existing non-interactive JSON read-back remains mandatory after mutation to detect a remote race that cannot be transactionally locked; a mismatch blocks further delivery and routes to verify.

### 6. Modify the adoption-limit scenario only for this slice

The delta intentionally keeps valid OpenSpec operation order: `ADDED` scenarios appear before `MODIFIED`. `candidate-receipt-delivery-limit` is `MODIFIED`, not duplicated or removed: its former prohibition on enforcement and a mechanical lane is replaced only by this slice's dual-authority rule and explicit unverified mechanical declaration. All other canonical candidate-receipt requirements remain unchanged.

### 7. Keep one reviewable slice

Mapped production impact is approximately 180–320 changed lines, below the 400-production-line review budget, so no design split is currently required. The smallest design is a pure gate helper plus targeted `ein-git` contract wiring; no framework or class hierarchy is warranted. If task planning finds the production forecast exceeds 400 lines, the design must be split before apply into (1) pure receipt/Git identity gates and (2) `ein-git` remote/PR integration, each with a behavior-complete boundary and without weakening any gate in the delivered state.

### Alternatives rejected

- **One check before commit:** rejected because hooks, branch movement, push selection, and remote PR state can diverge later.
- **Receipt success as action authorization:** rejected because content evidence does not express user intent.
- **Intent grant as content authorization:** rejected because action permission says nothing about verified bytes.
- **Automatic mechanical inference:** rejected because missing evidence would become a silent bypass.
- **Updating the receipt after commit:** rejected because delivery must consume verification evidence, not rewrite it.
- **Mutable branch-name push source:** rejected because branch movement creates a check/use race; the validated SHA is stable.
- **Locks or persistent delivery journal:** rejected as unnecessary for this bounded slice and explicitly out of scope.

## D. Success Criteria

### Observable acceptance

- A verified delivery with a valid intent authorization and stable receipt passes all four separately observable gates.
- Changed candidate bytes or an unexpected staged path block pre-commit.
- Hook-induced committed-content mutation makes `HEAD^{tree}` mismatch and blocks later delivery.
- Branch, HEAD, selected push source, tree, or receipt replacement after post-commit validation blocks push.
- A local, effective remote, existing-PR, or unresolvable PR head mismatch blocks PR creation/update before mutation.
- Every verified-SDD receipt error is fail-closed and reports the boundary, reason, and route to verify; no error downgrades to mechanical delivery.
- Mechanical delivery succeeds only with the exact explicit unverified declaration plus existing intent authorization, and emits or claims no receipt.
- Existing grant TTL, cwd rejection, bounded/legacy uses, action authorization modes, force-push denial, and sticky intent behavior remain behaviorally unchanged.
- The canonical delta continues to list `ADDED` before `MODIFIED`, with `candidate-receipt-delivery-limit` modified only as described above.
- Production changed lines remain at or below 400 for the slice.

### Verification strategy

Apply/verify should use deterministic Bun tests and local temporary Git repositories; this design phase does not execute them.

Required focused command:

```bash
bun test tests/candidate-receipt.test.ts tests/ein-git-noninteractive.test.ts tests/git-delivery.test.ts tests/guardrails.test.ts
```

The focused suite must cover matching and mismatching identities at every gate, missing/malformed/stale/replaced receipts, hook-like committed-tree mutation, changed HEAD/branch before push, unresolved and divergent effective PR heads, exact mechanical declaration handling, visible verify rerouting, and unchanged intent/grant regressions. GitHub responses should be supplied through a deterministic command/adapter seam; tests must not require network access.

Manual contract review must confirm that `ein-git.md` places each check immediately around its protected mutation, uses an explicit SHA push source and explicit PR head, retains non-interactive `gh` flags and JSON read-back, and never tells `ein-git` to emit or refresh a receipt. Review workload must be measured before PR preparation using the repository's production-line guard and must not exceed 400 production lines without splitting the change.
