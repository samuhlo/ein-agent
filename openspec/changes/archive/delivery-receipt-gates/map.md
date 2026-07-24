# Map — delivery-receipt-gates

status: partial
scope_status: mapped-with-budget-limit
change: delivery-receipt-gates
phase: map
skill_resolution: paths-injected
budget_source: scope.md
budget_exceeded: true

## Outcome

The receipt subsystem already provides fail-closed evidence validation and deterministic candidate reconstruction, but has **no delivery consumer**. Delivery is currently a prompt-driven `ein-git` flow plus the independent runtime intent grant. This slice should add four distinct receipt-identity checks without changing the intent-grant protocol.

The known Pi contract/release baseline is out of scope and must not be folded into this change.

## Current boundaries and required insertion seams

| Boundary | Current flow/seam | Required identity comparison | Current gap |
|---|---|---|---|
| Pre-commit | `ein-pi/core/agents/ein-git.md`, **Post-verify PR flow**: inspect → create branch/commit | `validateCandidateReceipt(cwd, change)` then `candidateTreeMatches(cwd, receipt)` immediately before staging/`git commit` | No receipt is read; named staging protects path selection, not verified bytes. |
| Post-commit | Same agent flow, immediately after `git commit` returns (therefore after commit hooks) and before any push/PR | resolve `git rev-parse HEAD^{tree}` and compare it to `receipt.treeSha`; retain the committed `HEAD` as the validated delivery head | Hooks can alter index/committed content after pre-commit reconstruction. |
| Pre-push | `ein-git.md` Act phase before `git push`; runtime `confirmCommand()` independently consumes intent grant for guarded push | Revalidate receipt, then compare selected local branch/`HEAD` content to the validated receipt tree (and reject changed branch/HEAD) | The current grant authorizes an action only; it does not attest content. |
| Pre-PR | `ein-git.md` non-interactive `gh pr create --head <branch>` / update path, before `gh` mutation | Resolve the effective PR head (the explicit `--head` and, for an existing PR, GitHub read state) and require it to equal the validated delivery head; reject local/remote mismatch | Existing `gh pr view --json` is read-back **after** mutation, not a precondition. |

Do not collapse these into one early check: the candidate can diverge through worktree/index edits, hooks, branch/HEAD changes, or a differing PR head.

## Candidate-receipt API surface

`ein-pi/agent/lib/candidate-receipt.ts` is the central domain seam.

- `CandidateReceipt` binds `repositoryId`, `worktreeId`, SDD `change`, emission `head`/`branch`, `treeSha`, exact `paths`, report/command digests, and creation time.
- `resolveWorktreeIdentity(cwd)` distinguishes common Git-dir repository identity from per-worktree identity; receipt storage is `<git-dir>/ein/candidate-receipt.json` via `receiptPath()`.
- `validateCandidateReceipt(cwd, change): ReceiptVerdict` fail-closes on absent/corrupt/version-invalid receipt, repo/worktree/change mismatch, manifest digest mismatch, changed/missing verify report, stale verify, or incomplete apply. It is the mandatory evidence check before each verified-SDD gate.
- `candidateTreeMatches(cwd, receipt)` calls `buildCandidateTree(cwd, receipt.paths)` and compares its SHA with `receipt.treeSha`. `buildCandidateTree()` uses an isolated `GIT_INDEX_FILE`, seeded from `HEAD`, so it detects changed declared bytes without changing the real index/worktree.
- `emitCandidateReceipt()` is intentionally emission-only; its module header explicitly assigns delivery gating to slice 04. Do not change emission, receipt version, manifest semantics, or automatic replacement behavior.

**Needed post-commit seam:** the API has no helper for `HEAD^{tree}` or a validated delivery-head record. Keep this comparison distinct from `candidateTreeMatches`: after a commit, the authoritative comparison is Git's committed `HEAD^{tree}`, not a reconstruction from mutable worktree bytes.

## Delivery runtime and intent grant (must remain separate)

### Current authorization call path

1. User message is classified by `messageRequestsDelivery()` / `nextDeliveryIntent()` in `ein-pi/agent/lib/git-delivery.ts`; `deliveryIntentActive()` preserves the sticky session intent for `DELIVERY_INTENT_TTL_MS = 30 minutes`.
2. Delegation is classified by `delegationIsDelivery()` / `confirmDelegatedDelivery()` in `ein-pi/agent/lib/guardrails.ts`. `ein-git` is always a delivery agent; other agents require delivery-language detection.
3. An approved/auto/off eligible delegation calls `grantDelegatedDelivery(cwd)`.
4. In a headless child, `confirmCommand()` calls `consumeDelegatedDelivery(ctx.cwd)` before allowing a guarded command such as push.

### Invariants to preserve unchanged

- Grant file: `deliveryGrantPath()` → `${EIN_PI_CONFIG_HOME|~/.pi/ein}/delivery-grant.json`.
- TTL: `DELIVERY_GRANT_TTL_MS = 10 minutes`.
- Scope: exact `cwd` equality; mismatch deletes/rejects the grant.
- Bounded use count: `DELIVERY_GRANT_MAX_USES = 3`; each consumption decrements and deletes at zero. Legacy grants without `remainingUses` allow one use.
- `gitDeliveryConfigPath(cwd)` remains project-local `.pi/ein/git.json`; modes `auto|ask|off` decide confirmation, not content identity. `auto` depends on user intent; force-push remains denied.

Receipt validation must run as an additional content-authority decision and must neither mint, consume, extend, nor reinterpret this grant. A receipt success cannot authorize delivery; a grant success cannot authorize divergent bytes.

## `ein-git` integration and visible recovery

`ein-pi/core/agents/ein-git.md` is the operational delivery contract. Its current **Hard gates**, **Delivery phases**, **Post-verify PR flow**, and **Non-interactive gh** sections are the visible integration point. It already requires cheap Git inspection, named staging, non-interactive explicit `--head`, and a post-PR JSON read-back, but says nothing about receipts or rerouting to verify.

Design should add a single clear verified-SDD delivery input/declaration passed to `ein-git` (change name plus receipt-required mode), then require it to:

- stop before the relevant mutation at each of the four boundaries;
- report the exact identity mismatch reason from the receipt/gate;
- visibly state the next action: **return to `sdd-verify` / re-verify and emit a new receipt**; and
- never refresh, overwrite, or infer a receipt itself.

For PRs, preserve explicit `--head`; resolve/check its actual head before `gh pr create` or update, rather than relying only on the current branch or post-create read-back.

## Mechanical/trivial delivery

No explicit mechanical/no-verification delivery representation was found in the delivery flow. `sdd-preflight.ts` has a TDD `off` classification for mechanical/docs/trivial work, but that is a testing preference, not delivery evidence and must not become a receipt bypass. The canonical lifecycle currently prohibits a mechanical lane; scope states this slice's delta replaces that adoption limit.

The explicit declaration belongs at the **delivery request handed to `ein-git` / its runtime contract**, as a narrow, auditable discriminator (verified SDD receipt required vs declared mechanical/no verification). It must be required rather than inferred from missing receipt, must remain visibly distinct in `ein-git` output, and must never emit or claim candidate-receipt verification. Missing/malformed mode must fail closed for a purported verified-SDD delivery.

## Focused test seams

| Test file | Existing seam | Add/extend coverage |
|---|---|---|
| `tests/candidate-receipt.test.ts` | Temp Git repo fixture; receipt emission/validation; `candidateTreeMatches`; declared-byte divergence | Pre-commit mismatch; helper-level post-commit `HEAD^{tree}` mismatch after a hook-like commit/tree mutation; missing/malformed/stale receipt at each applicable gate. Reuse its isolated repo fixture. |
| `tests/guardrails.test.ts` | `grantDelegatedDelivery`, `consumeDelegatedDelivery`, `confirmDelegatedDelivery`, headless `confirmCommand` | Regression assertions that the existing 10-minute TTL, cwd rejection, 3 uses, legacy one-use behavior, and authorization modes are unchanged while receipt checks are added elsewhere. |
| `tests/git-delivery.test.ts` | config modes and sticky 30-minute `DeliveryIntent` | Preserve configuration/intent behavior unchanged; add only if a new delivery-mode declaration parser lives in this module. |
| `tests/ein-git-noninteractive.test.ts` | Prompt-contract substring assertions for `ein-git.md`, explicit `--head`, JSON read-back | Assert four pre-mutation checks, visible `verify` route-back, explicit mechanical declaration, and effective PR-head mismatch blocking language. |

A deterministic Git/`gh` adapter seam is likely needed so unit tests can supply `HEAD^{tree}`, selected branch/HEAD, and remote PR-head responses without network calls. Keep prompt-contract tests separate from helper behavior tests.

## Blast radius and forecast

**Likely production files**

1. `ein-pi/agent/lib/candidate-receipt.ts` — reuse/possibly extend comparison APIs; highest correctness risk because it owns receipt semantics.
2. `ein-pi/core/agents/ein-git.md` — four operational gates, explicit mechanical declaration, and verify reroute.
3. `ein-pi/agent/lib/git-delivery.ts` or a small adjacent delivery-receipt utility — only if a typed declaration/identity gate is required outside the prompt; do not entangle intent-grant state.
4. Possibly `ein-pi/agent/lib/guardrails.ts` only for wiring a typed delivery context. It should not alter grant issuance/consumption semantics.

**Likely test/docs files:** the four focused test files above; no change is indicated for installer, Linear, broad SDD lifecycle runtime, or the merged Pi-contract baseline.

Forecast: approximately 180–320 production lines if the comparisons are a small pure helper plus targeted `ein-git` contract changes; tests are likely 180–280 lines and do not count toward the 400 production-line guard. Risk rises above 400 if enforcement is spread through extension event plumbing or PR remote resolution becomes a broad GitHub abstraction. If that occurs, decompose before apply into (1) pure receipt/delivery identity gates plus deterministic tests, then (2) `ein-git` prompt/runtime PR integration and prompt-contract tests. Keep each work unit behavior-complete.

## Design constraints

- Fail closed for absent, corrupt, stale, uncertain, or mismatched evidence.
- Preserve four gates as independently observable checks.
- Post-commit must compare committed `HEAD^{tree}` after hooks, not only mutable candidate reconstruction.
- Pre-PR must validate effective selected/remote PR head before mutation, then retain existing read-back.
- Mismatch output must name the reason and route to verify; no automatic recovery/re-emission.
- Keep the user-intent grant untouched in behavior and storage.

## Ledger

ledger:
  reads:
    - { path: "/home/samuhlo/.pi/agent/skills/local/architecture/SKILL.md", lines: 110, estimated_tokens: 1450 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/work-unit-commits/SKILL.md", lines: 75, estimated_tokens: 700 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/ein-discipline/SKILL.md", lines: 101, estimated_tokens: 1250 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/cognitive-doc-design/SKILL.md", lines: 60, estimated_tokens: 600 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/readme-style/SKILL.md", lines: 100, estimated_tokens: 1100 }
    - { path: "/home/samuhlo/.pi/agent/skills/downloaded/nodejs-best-practices/SKILL.md", lines: 200, estimated_tokens: 1550 }
    - { path: "openspec/changes/delivery-receipt-gates/scope.md", lines: 57, estimated_tokens: 1150 }
    - { path: "docs/quality-roadmap/04-delivery-receipt-gates.md", lines: 38, estimated_tokens: 500 }
    - { path: "openspec/specs/sdd-lifecycle/spec.md", lines: 43, estimated_tokens: 1550 }
    - { path: "codegraph explore: delivery-receipt-gates delivery flow", lines: 230, estimated_tokens: 1800 }
    - { path: "codegraph explore: candidate receipt implementation", lines: 190, estimated_tokens: 1100 }
    - { path: "codegraph explore: candidate-receipt source/test symbols", lines: 170, estimated_tokens: 900 }
    - { path: "ein-pi/agent/lib/candidate-receipt.ts", lines: 350, estimated_tokens: 5200 }
    - { path: "tests/candidate-receipt.test.ts", lines: 370, estimated_tokens: 5200 }
    - { path: "ein-pi/core/agents/ein-git.md", lines: 185, estimated_tokens: 2700 }
    - { path: "tests/git-delivery.test.ts", lines: 132, estimated_tokens: 1500 }
    - { path: "tests/ein-git-noninteractive.test.ts", lines: 72, estimated_tokens: 900 }
    - { path: "codegraph explore: delegated grant and callers", lines: 220, estimated_tokens: 1600 }
    - { path: "codegraph callers: grantDelegatedDelivery", lines: 5, estimated_tokens: 80 }
    - { path: "codegraph callers: candidateTreeMatches", lines: 2, estimated_tokens: 30 }
    - { path: "tests/guardrails.test.ts", lines: 300, estimated_tokens: 3900 }
    - { path: "codegraph explore: mechanical/trivial delivery", lines: 190, estimated_tokens: 1600 }
  webfetch_used: false
  budget_consumed: { tokens: 36000, reads: 22 }

## Handoff

Proceed to `sdd-design`. It should turn the four boundary table into a minimal typed gate contract, explicitly preserve the grant invariants, and settle the effective PR-head resolution/test adapter before task decomposition.
