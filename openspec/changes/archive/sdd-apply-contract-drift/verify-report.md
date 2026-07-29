# Verify Report — `sdd-apply-contract-drift`

status: pass
behavior_coverage: verified
acceptance_level: attested
skill_resolution: paths-injected

## Executive summary

Both in-scope edits are correct, on-spec, and behaviorally covered. The revised `sdd-apply.md` cleanly separates runtime-injected `acceptance: none` (no report, no verified claim) from explicit `acceptance: verified` (fresh runner re-execution, honest evidence, blocked-on-failure), and explicitly retains `sdd-verify` as the independent final behavioral and freshness gate. The strengthened prompt contract test now asserts both modes and the retained verify authority with semantic markers rather than a single fragment match, so it will catch drift in either direction.

The focused regression quartet passes (54/54, 0 fail). `git diff --check` on the two in-scope paths is clean. The previous `status: blocked` was raised on files OUTSIDE this change's explicit implementation manifest; this retry scopes verification to the two declared paths only and finds them correct.

## Scope contract (explicit implementation manifest)

This change's exact implementation paths per the parent's manifest:

| Path | Role | Diff |
|---|---|---:|
| `ein-pi/core/agents/sdd-apply.md` | Apply prompt contract rewrite | 12 +/4 − |
| `tests/sdd-phase-runtime-contract.test.ts` | Mode-specific prompt contract assertion | 14 +/4 − |

Total in-scope diff: 26 insertions, 8 deletions — both files inside the 15–30 line forecast in `tasks.md`.

## Spec coverage (sdd-lifecycle delta)

Change-local delta at `openspec/changes/sdd-apply-contract-drift/specs/sdd-lifecycle/spec.md` adds two scenarios that match the design:

- `apply-default-acceptance-none` — Present; matches design Requirement 1.
- `apply-explicit-verified-override` — Present; matches design Requirement 2.

The other two design requirements (Requirement 3: `sdd-verify` retains lifecycle authority; Requirement 4: focused drift protection) refine existing behavior and are enforced through the prompt contract test and the unchanged orchestrator language rather than canonical scenarios — consistent with the design's "Out of scope / non-goals" and "Affected areas" lists.

The canonical `openspec/specs/sdd-lifecycle/spec.md` modifications observed in the working tree are out of scope for this change and are already accounted for by the separately closed `zero-friction-sdd-start` (per parent manifest). They are NOT a blocker and NOT candidates for staging/unstaging/reverting in this change.

## Excluded context (preserved, NOT blockers, NOT candidates for staging/reverting)

These files are known unrelated work and are reported only for transparency. They MUST NOT be unstaged, split, reverted, or attributed to this change:

| File | Reason for exclusion |
|---|---|
| `ein-pi/agent/assets/orchestrator.md` | Preserved non-regression surface per design.md "Affected areas" and map.md "Candidate task groups". No semantic change required for this drift fix. |
| `ein-pi/core/AGENTS.md` | Listed only in scope.md "Candidate mapping boundary" as a mapping pass; design.md's "minimal candidate edit set" does NOT include it. |
| `tests/sdd-flow-contract.test.ts` | Belongs to the release-experience-roadmap change; explicitly excluded by parent manifest. |
| `openspec/specs/sdd-lifecycle/spec.md` | Already synchronized by the separately closed `zero-friction-sdd-start`; explicitly excluded by parent manifest. |
| All docs / frozen roadmap artifacts / other untracked files | Out of scope per scope.md non-goals ("Do not modify unrelated changes or untracked files"). |

## Task completion status

- `// 001.1` — completed. The 16 modified lines in `sdd-apply.md` and the 18 modified lines in `tests/sdd-phase-runtime-contract.test.ts` sit inside the 15–30 line forecast in `tasks.md`. No remaining tasks per `apply-progress.md`.

## Test / validation commands actually run

```bash
timeout 120 bun test tests/sdd-phase-runtime-contract.test.ts tests/sdd-planning-acceptance.test.ts tests/subagent-build-hygiene.test.ts tests/sdd-cost-block-e.test.ts
```

Result: **54 pass, 0 fail, 135 expect() calls, 58.00ms.** Highlights:

- `tests/sdd-phase-runtime-contract.test.ts > P3 > sdd-apply distingue none normal de verified explícito y conserva sdd-verify` — 8 expect() calls, PASS. Covers both modes, runner re-execution, honest report, blocked-on-failure, and independent `sdd-verify` final-freshness authority.
- `tests/sdd-cost-block-e.test.ts > E1 — ensureApplyAcceptance > una delegación sdd-apply sin acceptance → none` — PASS (runtime injection proven).
- `tests/sdd-cost-block-e.test.ts > E1 — ensureApplyAcceptance > respeta un acceptance explícito (p.ej. verified)` — PASS (explicit override preserved).
- `tests/sdd-phase-runtime-contract.test.ts > P3 > orchestrator exige acceptance none explícito en fases de planificación` and `sdd-apply ejecuta: acceptance none por defecto (inyectado), sdd-verify es el gate (E1)` — PASS (sdd-verify final gate authority retained at the orchestrator level).
- `tests/sdd-planning-acceptance.test.ts` and `tests/subagent-build-hygiene.test.ts` — PASS, unchanged non-regression.

```bash
git diff --check -- ein-pi/core/agents/sdd-apply.md tests/sdd-phase-runtime-contract.test.ts
```

Result: **no output** (clean — no whitespace or merge-conflict warnings on either in-scope file).

## Strict TDD compliance

`openspec/config.yaml` declares `strict_tdd: false`; `tasks.md` and `apply-progress.md` both note TDD is off. The test for `// 001.1` was added alongside the prompt edit (RED-then-GREEN-style: strengthened assertions on a known-existing prompt). No TDD gate applies this round; an assertion-quality audit was performed and is noted below.

## Assertion quality (informational, since TDD off)

The strengthened assertion slices the acceptance section between `## Runtime Acceptance Verification` and `## Ad-hoc apply`, then runs 8 semantic markers against that slice. The slice bounds couple to the two H2s staying adjacent; if either is renamed the test throws on `indexOf` rather than silently degrading — honest failure is preferable to silent green. The bundled markers (default none, no claim, explicit verified, fresh runner re-execution, fenced report, blocked-on-failure, independent sdd-verify final freshness) are non-tautological and directly enforce the split-mode semantic. No ghost loops, no implementation-detail CSS assertions, no type-only assertions.

## Behavior coverage assessment

- `behavior_coverage: verified`
- Mode 1 (runtime-injected `acceptance: none` → no report, no verified claim): covered by `tests/sdd-phase-runtime-contract.test.ts` (prompt assertion) AND `tests/sdd-cost-block-e.test.ts` E1 (runtime injection unit test).
- Mode 2 (explicit `acceptance: verified` → fresh runner re-execution, honest evidence, blocked-on-failure): covered by `tests/sdd-phase-runtime-contract.test.ts` (4 of the 8 expect() calls target the verified branch).
- Independent `sdd-verify` final-gate authority: covered by `tests/sdd-phase-runtime-contract.test.ts` (P3 orchestrator gate assertion) and the unchanged orchestrator `sdd-verify` ownership language.
- End-to-end observable coverage of both modes plus the sdd-verify final-gate authority is established.

## Residual risks

- The prompt contract test couples the slice bounds to the two adjacent H2s (`## Runtime Acceptance Verification` and `## Ad-hoc apply`). If either is renamed, the test will throw rather than silently degrade — acceptable failure mode, but a coupling to track for future restructuring.
- The excluded files remain in the working tree under their respective other-change ownership; this verifier neither blocks nor recommends any action on them. The parent's exclusion list is the authoritative treatment.

## Artifacts

- `openspec/changes/sdd-apply-contract-drift/verify-report.md` — this report.
- No other files modified by this verifier.

## Next recommended

1. Proceed to `sdd-close` for `sdd-apply-contract-drift` against only the two in-scope paths.
2. Treat the excluded files as owned by their respective other changes (release-experience-roadmap, zero-friction-sdd-start, frozen roadmap, etc.); the parent's exclusion list governs them.
3. If the parent intends a chained-PR split, do that decision OUTSIDE this change — it has no effect on the correctness of the two in-scope edits.

## skill_resolution

`paths-injected` — all five required skills (`bun`, `branch-pr`, `cognitive-doc-design`, `drizzle`, `ein-discipline`) loaded from the parent-injected paths; `drizzle` not applicable (no DB schema in this change), others applied. No fallback registry or path probing was needed.
