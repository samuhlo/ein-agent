---
change: add-intent-channel
phase: apply
---

status: complete

## Summary

All 7 groups implemented per tasks.md, in order (001 → 002 → {003,004} → 005 →
006 → 007). Purely additive except the one manifest line. No edits to any
forbidden file (`sync.ts`, `CLAUDE.md`, `CLAUDE.adapter.md`, `AGENTS.md`,
`orchestrator.md`, `style-contract.ts`, `~/.claude-ein/`, `~/.pi-ein/`).

## Files changed

`ein-pi/agent/lib/intent-channel.ts`
`ein-pi/core/skills/local/intent-channel/SKILL.md`
`ein-pi/agent/extensions/ein-intent.ts`
`ein-pi/agent/extensions-manifest.json`
`ein-cc/commands/ein/intent.md`
`ein-cc/commands/ein/eh.md`
`tests/intent-channel.test.ts`
`tests/intent-channel-parity.test.ts`
`tests/sdd-router.test.ts`

## TDD Cycle Evidence (groups 001, 002, 003/004, 005)

| Group | Behavior seam | RED | GREEN | TRIANGULATE | Final focused command |
|---|---|---|---|---|---|
| 001 | pure module exports resolve names/paths/builders | import of `intent-channel.ts` failed — module missing | module created, all unit assertions pass | safe/unsafe names ×6, legacy fallback dir, both skill-path resolvers | `bun test tests/intent-channel.test.ts` → 12 pass |
| 001/002 | SKILL.md structural contract (frontmatter, sections, vocab, attribution, first-round heading) | contract tests failed reading nonexistent SKILL.md | SKILL.md written, all 6 contract tests pass | initial miss on exact vocabulary phrase ("los hechos los busco yo...") caught and fixed | same run above |
| 003 | Pi registers both commands with busy guard | n/a (built directly per group order; grep gate below is the acceptance check) | `grep -c registerCommand` = 2; typecheck initially failed (`ctx.sendUserMessage` doesn't exist — it's `pi.sendUserMessage`), fixed | — | `bun run typecheck` → 0 errors |
| 004 | Claude command files declare frontmatter, `eh.md` empty `allowed-tools` | n/a (structural files, verified by grep) | both files present, `allowed-tools: ""` on eh.md | — | `grep 'intent-channel'`/`grep allowed-tools` |
| 005 | command presence parity | ran against already-built surfaces (order note sequences 005 after {003,004}); no RED observed for presence, but the "triangulation" test explicitly injects a fake one-sided command name and asserts the divergence is caught | 3 tests green | fake `ein:only-on-one-side` correctly detected as missing-on-Claude | `bun test tests/intent-channel-parity.test.ts` → 8 pass |
| 005 | skill identity resolves to same source, no collision, no silent bogus match | same as above | 3 tests green | second local skill (`comment-style`) resolves to a distinct, non-colliding pair; bogus name doesn't match | same run |
| 005 | no protocol restatement in surfaces | initial RED: descriptions in `intent.md`/`ein-intent.ts` accidentally repeated "árbol de decisiones" / "frontera" — real failure, fixed by rewording | 2 tests green after rewording | — | same run |

Groups 006 and 007 are verification groups per the tasks.md note: no RED to
record, only assertions against unchanged behavior.

## Group 006 — zero-cost / router-unchanged verification

- R4 (zero fixed prompt cost): `grep -rn intent-channel` across `ein-pi/core/AGENTS.md`,
  `ein-cc/CLAUDE.adapter.md`, generated `ein-cc/CLAUDE.md`, `assets/orchestrator.md`
  → zero matches. `bun test tests/style-contract.test.ts tests/style-parity-claude.test.ts`
  → 10 pass (fixed list unchanged).
- R6/R7 (router untouched by intent.md, phase optional): added a new
  `describe("intent.md es invisible para el router (R6/R7)")` block to the
  existing `tests/sdd-router.test.ts` (no separate `sdd-router-audit.test.ts`
  exists in this repo, so the case landed in the one router suite that does).
  4 parametrized states × with/without `intent.md`, plus an artifact-map
  absence check and a no-block check on empty state.
  `bun test tests/sdd-router.test.ts` → 56 pass (was 50; +6 new cases).

## Group 007 — integration checks

- `bun ein-cc/sync.ts --dry` → `comandos desplegados: 5` (was 3: handoff,
  settings, status; now +intent,+eh) and `skills copiadas: ~51` (+1 for
  `intent-channel`). Note: sync's dry-run log doesn't print individual
  filenames (only counts), so the task's literal
  `grep -E '(intent|eh|SKILL)'` matched nothing on stdout; the deployment
  claim is verified instead via the count delta, since editing sync.ts's
  logging was out of scope.
- `bun run typecheck` (root) → clean, after fixing `ctx.sendUserMessage` →
  `pi.sendUserMessage` (the only real type error found in this apply).
- `cd installer && bun run typecheck` → clean.
- `bun test` (full suite) → 2807 pass, 0 fail, 202 files.

## Deviations from design

- None beyond the wording adjustments in group 005's TRIANGULATE step
  (removing two vocabulary phrases from the Claude/Pi surface files so R1's
  no-restatement test passes honestly).

## Manual verification (R11–R13)

Not performed in apply — explicitly deferred to `sdd-verify`/`verify-report.md`
per the tasks.md manual-verification section; these require a live transcript,
which this phase does not run.

## Remaining tasks

None. All 17 checkboxes in `tasks.md` are ticked.
