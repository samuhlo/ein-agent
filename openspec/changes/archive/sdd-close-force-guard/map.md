# Map: fail-closed forced SDD close

status: partial
scope_status: bounded
change: sdd-close-force-guard
phase: map
skill_resolution: paths-injected
budget_exceeded: true

## Ledger

ledger:
  reads:
    - { path: "/home/samuhlo/.pi/agent/skills/downloaded/bun/SKILL.md", lines: 196, estimated_tokens: 2200 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/branch-pr/SKILL.md", lines: 230, estimated_tokens: 1700 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/cognitive-doc-design/SKILL.md", lines: 55, estimated_tokens: 500 }
    - { path: "/home/samuhlo/.pi/agent/skills/downloaded/drizzle/SKILL.md", lines: 260, estimated_tokens: 2600 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/ein-discipline/SKILL.md", lines: 101, estimated_tokens: 1100 }
    - { path: "codegraph explore: forced-close call path", lines: 610, estimated_tokens: 2200 }
    - { path: "openspec/changes/sdd-close-force-guard/scope.md", lines: 72, estimated_tokens: 1100 }
    - { path: "find: openspec/changes/sdd-close-force-guard", lines: 4, estimated_tokens: 40 }
    - { path: "find: openspec/specs/sdd-lifecycle", lines: 1, estimated_tokens: 10 }
    - { path: "find: tests/*sdd*close*", lines: 1, estimated_tokens: 10 }
    - { path: "find: tests/*sdd*router*", lines: 1, estimated_tokens: 10 }
    - { path: "codegraph explore: sdd-close force decisions", lines: 290, estimated_tokens: 1600 }
    - { path: "codegraph explore: sdd-router readiness", lines: 280, estimated_tokens: 1300 }
    - { path: "codegraph explore: ein-ai close surface", lines: 620, estimated_tokens: 1900 }
    - { path: "grep: openspec/specs/sdd-lifecycle/spec.md close/legacy scenarios", lines: 89, estimated_tokens: 1100 }
    - { path: "grep: openspec/changes/sdd-close-force-guard/specs/sdd-lifecycle/spec.md", lines: 34, estimated_tokens: 550 }
  webfetch_used: false
  budget_consumed: { tokens: 17920, reads: 16 }

## Scope and authoritative delta

The scoped delta at `openspec/changes/sdd-close-force-guard/specs/sdd-lifecycle/spec.md` adds two requirements:

1. Forced close preserves task, apply, verify, summary, and canonical-spec gates; it cannot archive incomplete, absent, failing, stale, or conflicted work.
2. The only exception is an explicitly recognized recoverable legacy `pending`/`unresolved` spec state after every non-legacy gate passes, with an explicit non-empty reason and a result/evidence marker distinguishing it from normal close.

Canonical `sdd-lifecycle` also states that canonical evidence blocks close when unresolved, pending, malformed, stale, or conflicted; it explicitly includes legacy force in that assessment. The delta is therefore the narrow exception that must be expressed without changing ordinary readiness.

## Mapped call path and current bypass

`ein-pi/agent/extensions/ein-ai.ts` owns `handleSddClose` and invokes the close module. `ein-pi/agent/lib/sdd-close.ts` exports `closeChange(cwd, change, { force? })`, calls `assessCloseReadiness(cwd, change)` from `sdd-router.ts`, then moves the directory by rename (or copy/remove fallback).

Current `CloseResult` is `{ ok, from, to, reason? }`; `CloseOptions` contains only `force?: boolean`.

At `sdd-close.ts:47-71`, the only absolute runtime blocker is a readiness reason beginning `estado de specs OpenSpec: conflict`. For every other `readiness.ready === false` state, `force` skips the rejection and archives. Thus force currently bypasses every non-conflict reason emitted by router readiness, including task/apply/verify/summary failures and canonical spec states such as pending or unresolved.

## Required decision boundaries

- **Always reject, regardless of force:** pending tasks; partial/incomplete apply; absent/failing/stale verification; missing/stale close summary; canonical malformed/stale/conflict state; and any non-recoverable canonical pending/unresolved state. Rejection must leave the live change in place and report all applicable blockers.
- **Legacy-only candidate:** force may be considered only when the complete non-spec readiness set passes and the remaining canonical reason is a positively recognized legacy pending/unresolved state. A modern missing declaration, malformed evidence, stale evidence, or mixed blocker set is not recoverable legacy.
- **Truthful result/evidence:** normal archival and legacy archival need distinct, additive result information. The legacy path must expose that the escape was used and retain the caller-supplied non-empty reason; it must not return the same unqualified success shape as normal close. This is a close result/evidence concern, not an archive-layout redesign.
- **Router remains the source of readiness facts:** close should classify readiness reasons rather than recreate task/apply/verify freshness checks. The exact `assessCloseReadiness` classifier was not obtained before the map budget was exceeded and must be examined first in design.

## Minimum blast radius

Expected implementation/design surfaces:

| Area | Role |
|---|---|
| `ein-pi/agent/lib/sdd-close.ts` | Replace blanket `force` bypass with all-gates-plus-classified-legacy decision; extend options/result only as needed for explicit reason and legacy marker. |
| `ein-pi/agent/lib/sdd-router.ts` | Expose or preserve a structured/readable distinction between recoverable legacy pending/unresolved and all other readiness reasons; do not duplicate lifecycle checks in close. |
| `ein-pi/agent/extensions/ein-ai.ts` | Pass explicit legacy reason, render differentiated success/failure, and make help describe force as narrow legacy recovery rather than a general override. |
| `openspec/specs/sdd-lifecycle/spec.md` | Incorporate the approved delta scenarios canonically. |
| `tests/sdd-close.test.ts` | Cover normal ready close, force rejection for each absolute gate, and the audited legacy success boundary. |
| `tests/sdd-router.test.ts` | Cover router classification/readiness facts used to distinguish legacy pending/unresolved from malformed, stale, conflict, or modern incomplete state. |

No updater, installer, archive-format, or broad OpenSpec changes are implicated.

## Test and compatibility map

The focused test files exist, but their bodies and direct close-force contract coverage were not read before budget exhaustion. Do not assume the codegraph statement of “no covering tests” is authoritative because its queried symbol coverage was incomplete.

Later phases should first inspect those focused tests and package test configuration, then use the smallest applicable Bun invocation, expected to be one or both of:

- `bun test tests/sdd-close.test.ts`
- `bun test tests/sdd-router.test.ts`

These are proposed focused commands only; none was run in map. Scope metadata says no runner command is currently configured, so verify the project’s actual test setup before relying on them.

## Risks

- String-prefix recognition of conflict already exists; expanding that ad hoc matching can accidentally classify malformed or stale evidence as legacy. Prefer a router-owned structured classification if one can be added without widening the lifecycle model.
- A reason accepted only in UI help but not enforced at `closeChange` would leave programmatic callers able to archive unaudited legacy work. The deterministic close boundary must enforce it.
- Adding a legacy field can break callers/tests that assert deep equality of the current minimal result. Keep normal-close compatibility intentional and add focused assertions for the legacy variant.
- Codegraph output for router and extension was trimmed before their exact close symbols were returned. This map is partial by budget, not a complete implementation design.

## Skill applicability

Bun applies only to later focused test selection; tests were not run. Cognitive documentation applies to the map’s scanable structure. Branch/PR requirements do not apply because this phase creates no PR. Drizzle is unrelated. Ein discipline applies: this is a bounded OpenSpec map and implementation is deferred.

## Next phase

Recommend `sdd-design`. It must start by reading the exact router readiness assessment, `handleSddClose` registration/help, both focused test files, and any direct close-force test, then turn the above boundaries into a minimal compatible contract.
