status: partial
scope_status: mapped
change: reviewed-area-ledger
phase: map

# Map — reviewed-area-ledger (Roadmap G only)

## Outcome

The bounded existing authorities are B's immutable project/Git projection and F's pure evidence normalization. No reviewed-area ledger, evidence record store, or read-only ledger consumer exists in the inspected roots. Design should add one dependency-light, read-only contract seam rather than alter Git, SDD routing, updater, launcher, or installer ownership.

## Authorities and seams

| Concern | Current authority / seam | What it establishes | G implication |
|---|---|---|---|
| Project identity and Git binding | `ein-pi/agent/lib/project-state.ts`: `ProjectStateV1`, `ProjectGitState`, `ProjectGitChange`, `ProjectVerificationState`, `projectProjectState` | `identity.repositoryRoot` is physical; Git paths are repository-relative; `git.stateRef` is `git-v1:sha256:<64hex>`, derived deterministically from HEAD/branch and bounded porcelain-v2 changes plus worktree content identity. `complete=false` or missing ref is fail-closed. | Reuse `stateRef` as the exact observed/current Git binding. Do not re-project or create a second Git snapshot. Area freshness must compare the record's binding to a newly supplied B state and determine affected paths from bounded relative changes. |
| Relevant Git change classes | `ProjectGitChange`: `path`, `previousPath?`, `kind`, index/worktree status; `readGitState` parses committed HEAD, staged/index, tracked worktree, and all untracked files (bounded at 256). | Added/modified/deleted/renamed/copied/type-changed/unmerged/unknown are explicit; untracked paths are included; malformed, command-error, overflow, read-error produce incomplete/unavailable state without `stateRef`. | Area matching must include both current and `previousPath` for rename/copy/delete impact, and fail closed when Git state is incomplete/unavailable or a change kind/path cannot be safely interpreted. Do not rely on `GitBaseline`: it only reports dirty/reset/stashes and has no exact identity or path set. |
| Verification freshness precedent | `projectVerificationState` in `project-state.ts`; `PROJECT_STATE_GIT_REF`; `ProjectVerificationState` (`current`, `stale`, `unbound`, `unavailable`, `invalid`) | Exact reference equality is required; missing/invalid/mismatched report binding never becomes current. Router mtime staleness is separately preserved as `stale-source`. | Model G states similarly but do not claim verification or human review from SDD artifact presence, phase completion, or session existence. A matching Git ref is necessary, not sufficient: bounded area + attributable evidence are also required. |
| Existing evidence/provenance normalization | `ein-pi/agent/lib/shared-config-update-advisor.ts`: `AdvisorEvidence`, `AdvisorProvenance`, `AdvisorFreshness`, `evaluateSharedConfigUpdateAdvisor`, `renderAdvisorSemantics` | Pure evaluator consumes observed evidence; status/freshness/reason/provenance are explicit; values are bounded/sanitized and results recursively frozen. `source` is reduced to safe tokens; private words/paths/control chars are excluded. | Reuse the evidence discipline and immutable/pure boundary. Ledger evidence identity should be a separate opaque/repository-safe reference plus stable hash/algorithm metadata; never store raw prompts, transcripts, payloads, exceptions, private paths, or session IDs. |
| SDD lifecycle state | `ein-pi/agent/lib/sdd-router.ts`: `resolveSddStatus`, `resolveSddNext`, `assessCloseReadiness`, artifact presence and mtime freshness | Filesystem-only deterministic phase projection; artifact presence is not evidence of review. Existing `verifyStale` is delivered-surface/mtime based and scoped to verification, not arbitrary review areas. | Ledger consumers may read SDD state as context only; must not infer review from map/design/verify/close artifacts or phase completion, and must not mutate router artifacts. |
| Baseline warning surface | `ein-pi/agent/lib/git-baseline.ts`: `readGitBaseline`, `renderGitBaselineLine`, `renderWorkingTreeLine` | Read-only preflight warning for recent reset/dirty state; no exact state identity or affected-path semantics. | Not an authority for ledger freshness. Use only as historical context if needed; avoid duplicate dirty/reset interpretation. |
| Read-only consumer precedent | `projectProjectState`, `evaluateSharedConfigUpdateAdvisor`, router read functions are pure/read-only from caller perspective; project-state tests assert no cache/store writes and unchanged source bytes. | Existing consumers receive snapshots and do not persist them. | New ledger read API should return immutable records/statuses and expose no writer, callback, mutation command, or auto-approval path. A persistence owner is not present in scope; design must choose a single designated record source without introducing parallel writers. |
| Privacy boundary tests | `tests/shared-project-state.test.ts`: forbidden key scan, runtime reference sanitization, no private paths/content, deterministic repeated projection/no writes; `tests/shared-config-update-advisor.test.ts`: bounded provenance and sanitized semantic output. | Existing contracts explicitly reject private session/execution surfaces and raw sensitive evidence. | Add ledger-specific privacy tests for opaque evidence references, hash/reference validation, no raw boundary payload, no private path leakage, and no session-implies-review. |

## Area identity and granularity gap

No existing type defines a reviewed area. The new contract must make the boundary explicit and bounded: a canonical sorted set of repository-relative paths and/or an explicitly named review seam, with deterministic serialization and stable identity hash. Empty, unbounded, ambiguous, unknown, absolute, escaping, or unsafe boundaries must be invalid/unreviewable. Overlapping areas need distinct stable identities; a named seam must not silently expand into the whole repository. Rename/delete records require both old and new paths for invalidation. This is a design seam, not an existing authority to extend casually.

## Evidence identity and persistence gap

Current runtime references are bounded public tokens but are not review evidence. Project-state has no cache/store (`tests/shared-project-state.test.ts` verifies no `project-state.json` or cache); F's evaluator is intentionally pure. Therefore no persistence ownership is currently established for G. The ledger design must explicitly name the designated record source and read-only API, define an opaque/repository-safe evidence reference and hash/algorithm, reject raw/private/session references, and avoid adding a competing store or parallel writer. Absence of a record remains unreviewed/unavailable/unknown, never current.

## Git invalidation rules to carry forward

- Current reviewed state requires a complete Git snapshot and exact observed/current `stateRef` equality.
- Any relevant committed HEAD change, staged index change, tracked worktree change, or explicitly in-scope untracked change invalidates the affected area only; unrelated changes need not stale unrelated areas.
- `path` and `previousPath` must be matched against area boundaries; malformed/unknown Git status, overflow, unavailable Git, or unverifiable scope must yield unavailable/unknown/invalid, never current.
- A global `stateRef` mismatch alone is insufficient to classify unrelated areas stale; area intersection must be deterministic and fail closed on uncertainty.

## State and ambiguity matrix (design target)

| State | Minimum meaning | Never infer from |
|---|---|---|
| `reviewed/current` | bounded valid area, attributable privacy-safe evidence, exact complete Git binding, no relevant invalidation | session, artifact, phase completion, automation success, clean tree alone |
| `unreviewed` | valid area with no qualifying review evidence or explicit non-review record | absent evidence upgraded to reviewed |
| `stale` | evidence was valid but relevant Git state changed or binding no longer matches | unrelated changes without deterministic intersection |
| `invalid` | malformed/unsafe area, evidence identity, state, or contradictory record | parser tolerance or partial fields |
| `unavailable` | required authority/evidence cannot be read or verified | current/clean assumptions |
| `unknown` | ambiguity prevents safe classification (overlap ambiguity, unknown boundary/state, unverifiable mapping) | guessed path expansion or alphabetical/implicit selection |

Reasons should be stable bounded codes with observed/current Git refs only where safe and applicable. Raw Git output, prompts, transcripts, secrets, private paths, and opaque state refs must not be rendered as evidence payloads; if references are exposed, use repository-safe opaque identifiers and bounded metadata.

## Smallest review-sized implementation/test surface

Recommended design slice:

1. **One additive ledger contract/evaluator module** under the existing `ein-pi/agent/lib` boundary (exact filename and persistence representation to be selected in design). It should normalize area identity, evidence reference/hash, Git binding, and read-only status; no filesystem/network/process/mutation dependency.
2. **Focused contract tests** in a new or narrowly extended ledger test file, covering canonical boundary serialization, overlaps, unsafe/unknown boundaries, evidence privacy/hash/reference validation, all six states, exact Git invalidation (including staged/tracked/untracked/rename/delete), repeatability, session non-claim, and read-only output. Reuse project-state fixtures/types rather than duplicate Git parsing.
3. **Minimal integration/read consumer** only if an existing consumer is required by the delta: accept an injected ledger snapshot and render/read it without writes. Do not wire launcher/updater/installer behavior; no mutation surface is needed for G.

This is review-sized if production remains one additive pure module plus a narrow consumer seam and focused tests; do not expand into project-state refactoring, SDD router changes, persistence migration, or broader E2E. Parent should obtain a review forecast after design/tasks.

## Later-phase commands (not run in map)

- `bun test tests/shared-project-state.test.ts tests/git-baseline.test.ts tests/shared-config-update-advisor.test.ts`
- `bun test <new focused reviewed-area-ledger contract/consumer test>`
- `bun test tests/beta-launcher-e2e-hardening.test.ts` only if a minimal no-write/read-only integration is deliberately selected by design.
- `cd installer && bun run typecheck` only if design introduces installer-facing TypeScript (currently not recommended).

Do not run these during map; apply/verify own them.

## Risks and open decisions for sdd-design

- **Persistence ownership unresolved:** no existing ledger store is in allowed scope; choose one designated source or keep G as injected read-only records, but do not add parallel writers.
- **Area-to-Git intersection:** B exposes a global fingerprint and changed paths, but exact per-area freshness rules are new; design must specify rename/delete and unknown/overflow handling.
- **Evidence identity privacy:** repository-safe references can still leak topology; use opaque bounded references and stable hashes without raw payloads/private paths.
- **Consumer semantics:** no existing reviewed-area consumer was found in allowed roots; keep integration minimal and ensure absence/ambiguity never implies review.

## Ledger Contract

ledger:
  reads:
    - { path: "/Users/samu/.pi-ein/agent/skills/local/ein-discipline/SKILL.md", lines: 101, estimated_tokens: 1250 }
    - { path: "/Users/samu/.pi-ein/agent/skills/local/work-unit-commits/SKILL.md", lines: 77, estimated_tokens: 850 }
    - { path: "/Users/samu/.pi-ein/agent/skills/local/cognitive-doc-design/SKILL.md", lines: 73, estimated_tokens: 700 }
    - { path: "/Users/samu/.pi-ein/agent/skills/local/skill-registry/SKILL.md", lines: 57, estimated_tokens: 650 }
    - { path: "/Users/samu/.pi-ein/agent/skills/downloaded/vitest/SKILL.md", lines: 71, estimated_tokens: 850 }
    - { path: "openspec/changes/reviewed-area-ledger/scope.md", lines: 101, estimated_tokens: 1600 }
    - { path: "openspec/changes/reviewed-area-ledger/specs/sdd-lifecycle/spec.md", lines: 37, estimated_tokens: 500 }
    - { path: "EIN.md", lines: 48, estimated_tokens: 450 }
    - { path: "codegraph explore: bounded reviewed-area/Git/project-state/evidence seams", lines: 0, estimated_tokens: 700 }
    - { path: "ein-pi/agent/lib/project-state.ts", lines: 700, estimated_tokens: 6200 }
    - { path: "ein-pi/agent/lib/git-baseline.ts", lines: 131, estimated_tokens: 1300 }
    - { path: "ein-pi/agent/lib/shared-config-update-advisor.ts", lines: 340, estimated_tokens: 3000 }
    - { path: "ein-pi/agent/lib/sdd-router.ts", lines: 650, estimated_tokens: 6500 }
    - { path: "tests/shared-project-state.test.ts", lines: 650, estimated_tokens: 7000 }
    - { path: "tests/git-baseline.test.ts", lines: 200, estimated_tokens: 2200 }
    - { path: "tests/shared-config-update-advisor.test.ts", lines: 250, estimated_tokens: 2800 }
    - { path: "tests/beta-launcher-e2e-hardening.test.ts", lines: 900, estimated_tokens: 9000 }
    - { path: "openspec/changes/archive/shared-config-update-advisor/map.md", lines: 130, estimated_tokens: 2500 }
    - { path: "openspec/changes/archive/shared-config-update-advisor/design.md", lines: 260, estimated_tokens: 4500 }
    - { path: "openspec/changes/archive/shared-config-update-advisor/tasks.md", lines: 190, estimated_tokens: 3500 }
    - { path: "openspec/changes/archive/beta-launcher-e2e-hardening/map.md", lines: 95, estimated_tokens: 2200 }
    - { path: "openspec/changes/archive/beta-launcher-e2e-hardening/design.md", lines: 250, estimated_tokens: 4500 }
    - { path: "openspec/changes/archive/beta-launcher-e2e-hardening/tasks.md", lines: 170, estimated_tokens: 3000 }
    - { path: "openspec/changes/archive/beta-launcher-e2e-hardening/verify-report.md", lines: 170, estimated_tokens: 3500 }
    - { path: "openspec/changes/archive/shared-config-update-advisor/verify-report.md", lines: 150, estimated_tokens: 3000 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 60000, reads: 25 }
  budget_source: packet
  budget_exceeded: true

skill_resolution: paths-injected
