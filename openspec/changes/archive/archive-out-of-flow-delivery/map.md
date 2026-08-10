status: partial
scope_status: bounded
budget_exceeded: true
change: archive-out-of-flow-delivery
phase: map

# Map notes

Scope is limited to an explicit, auditable out-of-flow reconciliation path for the approved declarationless legacy shape. Do not close `docs-site-shell`, create retrospective lifecycle artifacts, or weaken ordinary close guards.

## Deterministic surfaces

- `ein-pi/agent/lib/sdd-router.ts`: `resolveSddStatus` (494-623) computes artifact order, apply/verify outcomes, freshness, tasks, and OpenSpec state; `declarationlessLegacyEligible` (629-647) recognizes canonical scope-only declarationless records; `assessCloseReadiness` (around 622 and following) is the close readiness gate and stable blocker-code publisher. Preserve `computeStaleness`, `readOpenSpecState`, apply/verify/task readers, sequence-gap detection, and synchronization/conflict checks.
- `ein-pi/agent/lib/sdd-close.ts`: `CloseOptions` (31), `normalizeLegacyReason` (35-39), `closeChange` (51-114), `CloseResult.legacyEscape` are the archive boundary. It validates safe names, source/archive collision, readiness blockers, and filesystem move. Existing `force + declarationless-record + no non-spec blockers + valid reason` is the declarationless legacy escape; retain it and do not turn force into a general bypass.
- `ein-pi/agent/extensions/ein-ai.ts`: `performSddClose` (1186), `handleSddClose` (1203), `/ein:sdd-close`, and `ein_sdd_close` share the close path. The tool exposes `change`, `force`, `reason`; any new path must be explicitly selected, bound to the named change, and auditable. `ein_sdd_check` calls `lintChange`; `/ein:sdd-check` aliases `/ein:sdd-audit` via `handleSddAudit` and must remain artifact lint, not a close bypass.
- `cc-ein/sdd-cli/cli.ts`: `checkCmd` (137) runs `lintChange`; `closeCmd` (148) invokes shared `closeChange` with `--force`; dispatch routes `check` and `close`. Keep identical core semantics and exit/report behavior; no CLI-only bypass.

## Evidence seam

Design must choose the smallest deterministic repository-local marker/evidence contract. It must be explicitly supplied/selected, identify the named legacy change, require a non-empty normalized audit reason, and require fresh evidence containing a plain statement that delivery occurred outside SDD plus concrete verification tied to current repository state. Missing, stale, ambiguous, malformed, generic, copied, or fabricated evidence fails closed. Scope-only plus the approved declarationless state remains the only eligible shape; declaration markers, `sync-report.md`, local delta specs, fabricated lifecycle artifacts, pending/failed/stale verify, incomplete apply, pending tasks, OpenSpec pending/conflict, unsafe names, and archive collisions deny.

## Tests affected

- Extend `tests/sdd-close.test.ts`: it already covers freshness, declarationless recognition, invalid reasons, normal result shape, multiple blockers, conflicts, and no-mutation failures. Add allowed reconciliation and denied signal/reason/evidence/shape cases.
- Extend `tests/sdd-router.test.ts`: it already covers `assessCloseReadiness` blocker codes and exact declarationless eligibility. Add only the new deterministic reconciliation classification; preserve all existing unresolved/conflict/pending/synchronized expectations.
- If registration/parameters change, inspect `tests/agent-tools-contract.test.ts`. If CLI behavior is exposed, add focused CLI/subprocess coverage; no direct `closeCmd`/`checkCmd` coverage was found. Do not broaden status/next or memory tests unless their observable contract changes.

## Preserved guards

Ordinary close still requires complete apply, fresh passing verify, fresh summary, zero pending tasks, artifact order, safe name, non-collision archive, synchronization/conflict/sequence guards. Existing declarationless legacy escape remains. Ordinary incomplete/declared records, absent or malformed explicit signal, blank/sentinel/overlong reason, stale/non-concrete verification, summary without outside-SDD statement, evidence not bound to change/current repository, and general `--force` all fail closed.

No source, test, build, close, or archive operation was performed.

## Ledger

ledger:
  reads:
    - { path: "EIN.md", lines: 83, estimated_tokens: 900 }
    - { path: "openspec/changes/archive-out-of-flow-delivery/scope.md", lines: 83, estimated_tokens: 1250 }
    - { path: "openspec/changes/archive-out-of-flow-delivery/specs/sdd-lifecycle/spec.md", lines: 43, estimated_tokens: 580 }
    - { path: "openspec/changes/docs-site-shell/scope.md", lines: 130, estimated_tokens: 1900 }
    - { path: "ein-pi/agent/lib/sdd-router.ts", lines: 647, estimated_tokens: 5000 }
    - { path: "ein-pi/agent/lib/sdd-close.ts", lines: 114, estimated_tokens: 1100 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts", lines: 1390, estimated_tokens: 8500 }
    - { path: "cc-ein/sdd-cli/cli.ts", lines: 460, estimated_tokens: 3900 }
    - { path: "tests/sdd-close.test.ts", lines: 445, estimated_tokens: 3900 }
    - { path: "tests/sdd-router.test.ts", lines: 380, estimated_tokens: 3600 }
    - { path: "SKILL.md files (5 injected paths)", lines: 515, estimated_tokens: 4800 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 15000, reads: 11 }
  budget_source: packet
  codegraph_queries: 8

skill_resolution: paths-injected
