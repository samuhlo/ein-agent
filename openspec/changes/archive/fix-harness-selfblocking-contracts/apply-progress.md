status: complete

## Layer 1 scope widened — adhoc lane, explicit user authorization (2026-08-18)

The coordinator authorized, on the user's explicit instruction in this session, extending layer 1
to also ignore the adhoc-lane checkpoint (`.ein/continuity.json`, written by
`continuity-checkpoint-store.ts:48` when `mode: "adhoc"`) — the identical self-blocking bug as the
SDD-lane checkpoint, previously recorded in `design.md` Risks/Out-of-scope as "not authorized in
this scope". This was not my initiative; `design.md` was edited surgically (moved item 6 from `Out`
to `In` with the date and authorization, no other rewriting) so the artifact does not contradict
what was built.

Same TDD standard: RED first (`tests/gitignore.test.ts` asserting `gitignoreBlock()` contains
`.ein/continuity.json` — failed, entry absent from `ENTRIES`), then GREEN (added the entry + a
header-comment line naming the adhoc source). Before choosing the pattern, verified the real
`upsertBlock()` behavior against this repo's own `.gitignore`, which already carries a manual
`/.ein/` line **outside** the managed block (line 29, not tagged by any Ein-authored legacy
marker). Result: the managed block gains `.ein/continuity.json` as a separate line; the two rules
coexist (broad manual `/.ein/` + narrow managed `.ein/continuity.json`) without conflicting or
duplicating each other's *effect twice in the same place* — `stripLegacy` was deliberately left
untouched, because it exists to strip a specific former Ein-authored artifact
(`# Local Pi runtime state` header + `.atl/`), not to guess at arbitrary untagged user lines; doing
so would risk stripping unrelated content in other repos. Added
`upsertBlock() no duplica una regla /.ein/ preexistente fuera del bloque gestionado` in
`tests/gitignore.test.ts` to lock this behavior in. The residual redundancy in *this* repo's own
`.gitignore` (the manual `/.ein/` line is now superseded by the managed entry) is left as-is —
removing a line outside the managed block is a manual cleanup, not something the tool does.

Files touched by this amendment: `ein-pi/agent/lib/gitignore.ts` (already listed below),
`tests/gitignore.test.ts` (already listed below), `openspec/changes/fix-harness-selfblocking-contracts/design.md`.

## Layer 1 — `.gitignore` covers the continuity checkpoint (T1, T2)

Only layer 1 executed in this pass; layers 2-5 pending per D9 order constraint.

### TDD Cycle Evidence

| Stage | Command | Result |
| --- | --- | --- |
| RED | `bun test tests/sdd-participants.test.ts` (after repairing the fixture at `tests/sdd-participants.test.ts:21` to call `ensureEinGitignore(cwd)` instead of hand-writing `openspec/changes/*/continuity.json`) | 11 fail / 10 pass. Real failure: `SDD participant blocked: source state is stale; request a fresh participant plan.` — matches the reported bug (`ein-cleaner` looping on stale state). |
| GREEN | Added `openspec/changes/**/continuity.json` to `ENTRIES` in `ein-pi/agent/lib/gitignore.ts` and rewrote the header comment (no longer claims `openspec/changes/` is unconditionally unignored). | `bun test tests/gitignore.test.ts tests/sdd-participants.test.ts` → 29 pass / 0 fail. |
| TRIANGULATE | Added `tests/gitignore.test.ts`: `gitignoreBlock()` contains `openspec/changes/**/continuity.json` (T1). | Passes together with the repaired fixture test (T2) in the same run above. |
| REFACTOR | None needed — one-line `ENTRIES` addition plus comment rewrite; no structural change to `upsertBlock`/`ensureEinGitignore`. | n/a |

### Behavior seam → final focused command

- `.gitignore` ignores the SDD continuity checkpoint (T1) → `bun test tests/gitignore.test.ts`
- Participant fixtures measure the product's `ensureEinGitignore()`, not a hand-copied line, so `admitSddParticipantCall` is not stale-blocked by an untracked checkpoint (T2) → `bun test tests/sdd-participants.test.ts`
- `.gitignore` ignores the adhoc-lane checkpoint without duplicating an existing out-of-band `/.ein/` rule → `bun test tests/gitignore.test.ts`

### Full-suite / typecheck gate (after both the base layer-1 fix and the adhoc-lane amendment)

- `bun test` (full, 169 files): 2217 pass, 1 fail. The one failure
  (`Claude continuity supervisor > runs real PTY Claude-to-fresh-provider handoffs and native-exit fallback`)
  is pre-existing and environment-related (PTY hook `SOURCEARGV` blocked by an unrelated hook
  decision) — reproduced identically on `git stash` (before any of this change's edits), confirming
  it is unrelated to layer 1 and not a regression.
- `tsc --noEmit` at repo root: clean, no errors.

### Deviations from design

None. D6's `**` pattern used as specified; D9 order respected (fixture RED observed before any
`gitignore.ts` edit).

## Layer 2 — scope-bounded participant passage seal (T3, T4, T5, T6, T7 / R2, R3, R4, R5, D1-D4)

`sdd-participants.ts`: `changedScope()` now also returns `seal`, a `sdd-scope-v1:sha256:` digest
over `[rootDev, rootIno, ...sortedDeclaredPaths.map(p => [path, dev, ino, mode, sha256(bytes)])]`
(D1). `passage()`'s `currentState` is this scoped seal, not `state(cwd)` (whole-tree `git.stateRef`)
— the private `state()` helper is now dead and removed (D3). `admitSddParticipantCall` and
`completeSddParticipantCall` recompute `changedScope(cwd, change).seal` at admission/completion
instead of reading global git state (D3 `:122`/`:142`), so a stale-source rejection is decided by
the *declared scope's* current bytes+identity, not by anything outside it — fail-closed (R3) is
unchanged, only its evidence source moved.

`continuity-checkpoint.ts`: added `validParticipantSeal = validStateRef(v) || /^sdd-scope-v1:sha256:[a-f0-9]{64}$/.test(v)`,
applied to `beforeStateRef`, `cleaner.observedStateRef`, `cleaner.afterStateRef`,
`architect.observedStateRef` in `validParticipants` (D2). `checkpoint.stateRef` and
`verification.observedStateRef` validators untouched. `rebaseSddParticipants` deleted (D4) —
no production or test reference remains.

`continuity-handoff-lifecycle.ts`: `refreshOnce()` no longer rebases participants against the
global `stateRef`; it carries the stored `sddParticipants` unchanged into the freshly derived
checkpoint via `withSddParticipants` (D4). The `if (!derived.checkpoint.stateRef) return
"refresh-failed"` guard is kept verbatim.

### TDD Cycle Evidence (layer 2)

| Stage | Command | Result |
| --- | --- | --- |
| RED | Wrote T3/T5 in `tests/sdd-participants.test.ts`, T6 in `tests/continuity-checkpoint.test.ts`, and replaced the T7/R5 assertion in `tests/continuity-handoff-lifecycle.test.ts` (deliberate contract change, D4); `git stash` of only the 3 layer-2 source files, tests kept in place; ran `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts tests/continuity-handoff-lifecycle.test.ts` | 4 fail / 49 pass — exactly the 4 new/replaced assertions fail against pre-layer-2 code, everything else still passes. |
| GREEN | `git stash pop` (restored layer-2 source), reran the same 3 files | 53 pass / 0 fail. |
| TRIANGULATE | T4 (in-place rewrite, same inode, dies) already existed pre-layer-2 as "Architect receives fresh post-Cleaner state and stale handoffs reject" and still passes against the new seal — proves fail-closed (R3) survived the seal swap without a dedicated new test. | Included in the GREEN run above. |
| REFACTOR | None needed beyond the D1-D4 rewrite itself; no further structural pass required. | n/a |

### Behavior seam → final focused command

- Passage seal ignores unrelated untracked writes outside the declared scope (R2/T3) → `bun test tests/sdd-participants.test.ts`
- Passage still fails closed on an in-place rewrite of a declared file, same inode (R3/T4) → `bun test tests/sdd-participants.test.ts`
- Persisted `beforeStateRef` carries the `sdd-scope-v1:sha256:` prefix (R2/R4/T5) → `bun test tests/sdd-participants.test.ts`
- `validParticipants` accepts `sdd-scope-v1:` seals on all four participant fields (R4/T6) → `bun test tests/continuity-checkpoint.test.ts`
- Continuity refresh carries `sddParticipants` unchanged across a global `stateRef` change (R5/T7) → `bun test tests/continuity-handoff-lifecycle.test.ts`

### Full-suite / typecheck gate (after layer 2)

- `bun test` (full, 169 files): 2216 pass, 5 fail. All 5 pre-existing and unrelated to this change,
  reproduced identically with the layer-2 source files stashed:
  `Claude continuity supervisor > runs real PTY Claude-to-fresh-provider handoffs and native-exit
  fallback` (PTY/environment, already known); 4 `release update cli`/`release update integration`
  tests that assert the running binary's embedded `INSTALLER_VERSION` (`v0.71.0`) appears in a
  rendered banner — unrelated string/version drift, not touched by this change.
- `tsc --noEmit` at repo root: clean.
- `cd installer && bun run typecheck`: clean.
- `grep -rn "rebaseSddParticipants" ein-pi/ tests/`: no matches (dead code fully removed, D4/D9).

### Deviations from design

None observed. D1-D4 implemented as specified; D9 order respected (layer 2 built and RED-checked
after layer 1's fixture repair was already in place).

## Layer 3 — scout launch fails closed before execution (T8, T9, T10, T11 / R6, R7, R8, D7)

`scout-contract.ts`: `normalizeScoutLaunch` now rejects a second scout launch while any entry in
`tracking` is `"pending"` under a **different** `toolCallId` — checked right after the toolCallId
guard and before `tracking.set`, i.e. at launch, never after burning a delegation (R6). A relaunch
that reuses the same `toolCallId` is untouched (idempotent re-normalization). The retirement
condition for this guard lives as a code comment next to it (D7), not in the prompt. The direct-form
branch (`agent: "ein-scout"`) now also sets `async: false`, matching the `workflowScript` branch
(R7) — previously only the script form forced foreground.

`orchestrator.md`: `## Parallel read-only fan-out` substituted (not extended) with
`## Read-only fan-out (sequential)` — keeps `one to three distinct fresh scouts` and
`no OpenSpec artifacts` (canonical-spec anchor, unchanged per `use-independent-scouts-before-scope`),
adds "one scout per turn" and the reject-before-run fact, drops the now-false "Parallelism buys
wall-clock" sentence to stay byte-neutral (R8). `tests/prompt-budget.test.ts` stays green with no
budget constant change.

### TDD Cycle Evidence (layer 3)

| Stage | Command | Result |
| --- | --- | --- |
| RED | Added T8 (second launch while one pending throws), T9 (same-`toolCallId` relaunch does not throw), T10 (direct-form carries `async: false`) to `tests/readonly-scout-contract.test.ts`; ran `bun test tests/readonly-scout-contract.test.ts` before touching `scout-contract.ts` | 15 pass / 2 fail — T8 and T10 fail exactly as predicted (no pending guard existed; direct form omitted `async: false`); T9 passed trivially (no guard yet), written together with T8 per design so the guard isn't overtightened. |
| GREEN | Added the pending-guard loop + `async: false` on the direct-form return in `scout-contract.ts` | `bun test tests/readonly-scout-contract.test.ts` → 17 pass / 0 fail. |
| TRIANGULATE | Rewrote T11 in `tests/orchestrator-context-diet.test.ts` to re-anchor on the new heading, assert the old heading is gone, and match the new one-per-turn phrase; ran it against the prompt before editing `orchestrator.md` | RED confirmed (`toContain("## Parallel read-only fan-out")` failed as expected since the assertion inverted to `.not.toContain`). Then substituted the prompt section → `bun test tests/orchestrator-context-diet.test.ts tests/prompt-budget.test.ts` → 33 pass / 0 fail. |
| REFACTOR | None needed — one guard clause, one field addition, one prompt-section substitution; no structural rework required. | n/a |

### Behavior seam → final focused command

- A concurrent scout launch is rejected before any delegation runs (R6/T8) → `bun test tests/readonly-scout-contract.test.ts`
- A relaunch reusing the same tool call id is never rejected (R6/T9) → `bun test tests/readonly-scout-contract.test.ts`
- Every normalized scout launch is foreground, including the direct form (R7/T10) → `bun test tests/readonly-scout-contract.test.ts`
- The orchestrator prompt describes sequential one-per-turn fan-out and keeps the canonical spec phrase and byte budget (R8/T11) → `bun test tests/orchestrator-context-diet.test.ts tests/prompt-budget.test.ts`

### Full-suite / typecheck gate (after layer 3)

- `bun test` (full, 169 files): 2219 pass, 5 fail. All 5 pre-existing and unrelated to this change
  (unchanged from the layer-2 baseline above): 1 PTY handoff test (environment) + 4
  `tests/release-update-integration.test.ts` assertions that expect the literal string `v0.71.0` in
  a banner that renders the version as ASCII art — no installer file is in this change's diff.
- `tsc --noEmit` at repo root: clean, no errors.

### Deviations from design

None. D7 implemented exactly as specified (guard placement, message wording, retirement condition
as a code comment); the prompt substitution is byte-neutral-or-negative as required by Risk 4.

## Layer 3 amendment — orphaned `pending` scout entry closed, no longer an accepted residual (coordinator directive)

Verified the exact leak the coordinator named: `scoutTracking` (`ein-ai.ts:179`) was only cleared at
`session_shutdown` (`:673`); a cancelled scout or a subagent that dies without emitting a
`tool_result` never reaches `acceptTrackedScoutResult`, so its `pending` entry survived and R6 then
rejected every later launch for the rest of the session — a third self-block, unacceptable per
`design.md` Risk 3 (previously recorded as "accepted"). Checked `acceptTrackedScoutResult`
(`scout-contract.ts:178-182`): `tracking.delete(toolCallId)` runs unconditionally right after the
`has` check, before the `isError` branch and before `validateScoutReport` — so success, error, and
invalid-report-throw all already clean up; the only leak is a tool call that never reaches this
function at all, confirming the fix belongs at the turn boundary, not inside `scout-contract.ts`.

Fix: `scoutTracking.clear()` added as the first statement inside `pi.on("input", async (event, ctx)
=> { ... })` in `ein-ai.ts` (`:679`) — runs unconditionally on every user turn, before any
side-effecting logic in that handler. Verified this cannot drop a live scout: R7 already forces
`async: false` on every normalized launch, so a legitimate scout completes (and self-deletes via
`acceptTrackedScoutResult`) within the same turn that launched it; clearing at the next turn's start
therefore only ever discards orphans. `design.md` Risk 3 and D7's `sessionKey` note were corrected to
record the risk as closed, not residual.

### TDD Cycle Evidence (amendment)

| Stage | Command | Result |
| --- | --- | --- |
| RED | Added a source-wiring test to `tests/readonly-scout-contract.test.ts` asserting the `pi.on("input", ...)` handler body in `ein-ai.ts` matches `/scoutTracking\.clear\(\)/`, plus a behavioral test proving an orphaned `pending` entry blocks the next launch until the tracking map is cleared | `bun test tests/readonly-scout-contract.test.ts` → 18 pass / 1 fail — the source-wiring test failed exactly as expected (no `scoutTracking.clear()` in the `input` handler yet); the behavioral test passed trivially (it only proves `Map.clear()` semantics, kept as the mechanism proof). |
| GREEN | Added `scoutTracking.clear()` at the top of the `pi.on("input", ...)` handler in `ein-ai.ts` | `bun test tests/readonly-scout-contract.test.ts` → 19 pass / 0 fail. |
| TRIANGULATE | Re-read `acceptTrackedScoutResult` to confirm all three return paths (success, `isError`, thrown validation error) already delete the tracking entry before this amendment — no double-fix needed there. | Confirmed by inspection (`scout-contract.ts:178-182`); no code change required, recorded as evidence. |
| REFACTOR | None needed — a single one-line guard placed at an existing hook's entry point. | n/a |

### Behavior seam → final focused command

- An orphaned `pending` scout entry does not survive past the user turn that created it (R6 residual risk closed) → `bun test tests/readonly-scout-contract.test.ts`
- `acceptTrackedScoutResult` clears tracking on every return path (success/error/invalid-report) — verified by inspection, no new test needed → `bun test tests/readonly-scout-contract.test.ts`

### Full-suite / typecheck gate (after the amendment)

- `bun test` (full, 169 files): 2221 pass, 5 fail — same 5 pre-existing, unrelated failures as the
  layer-3 baseline above (1 PTY handoff test + 4 `release-update-integration` version-string
  assertions); no regressions introduced by the amendment.
- `tsc --noEmit` at repo root: clean, no errors.

## Layer 4 — `Files changed` grammar fixed where it is produced and machine-checked (T12, T13 / R9, D8)

`sdd-apply.md:64`: the sentence forbidding "a dump of full file lists" is rewritten (not appended)
to carve a bounded, explicit exception: one `## Files changed` section is REQUIRED because it is
the machine-read Cleaner/Architect scope (`changedScope()`), not prose. Trimmed to stay inside the
`core/agents/*.md` byte budget after the addition (see gate below). `SDD_ARTIFACT_GRAMMAR.md`: fixed
the existing contradiction (line 67 prescribed `Archivos tocados`, which the heading regex rejects)
by renaming the minimal section to `Files changed`, and added the full parsed grammar (heading
forms, section boundary, backtick-only path extraction, path canonicalization rules, restricted
segments) plus a fenced canonical example (D8).

The doc example is proven executable, not just described: a new test in `tests/sdd-participants.ts`
extracts the fenced block from the doc file itself, writes it as a fixture's `apply-progress.md`,
and asserts `planSddParticipants` succeeds with exactly the declared path. A second test asserts
`sdd-apply.md` contains `## Files changed` + `REQUIRED` and no longer contains the old blanket-ban
phrase.

### TDD Cycle Evidence (layer 4)

| Stage | Command | Result |
| --- | --- | --- |
| RED | Added the doc-extraction test (T12) and the prompt-contradiction test (T13) to `tests/sdd-participants.test.ts` before editing the doc/prompt | Both failed: T12 on "no fenced block found" / heading mismatch (`Archivos tocados`), T13 on the still-present "never a dump of full file lists" phrase. |
| GREEN | Rewrote `sdd-apply.md:64` and added the `Files changed` grammar section + canonical example to `SDD_ARTIFACT_GRAMMAR.md` | `bun test tests/sdd-participants.test.ts` → all pass, including T12/T13. |
| TRIANGULATE | `tests/prompt-budget.test.ts` caught the prompt addition pushing `core/agents/*.md` over budget (+363 B); iteratively trimmed the exception sentence (kept "REQUIRED", the grammar-doc pointer, and the one-path-per-line rule) until back under 83,042 B with no budget-constant change. | `bun test tests/prompt-budget.test.ts` green at 83,042/83,042 B (0 slack). |
| REFACTOR | None beyond the trims above — no structural change to either file. | n/a |

### Behavior seam → final focused command

- The grammar doc's canonical `Files changed` example is accepted by `planSddParticipants` with exactly its declared paths (R9/T12) → `bun test tests/sdd-participants.test.ts`
- `sdd-apply.md` requires `## Files changed` instead of forbidding file lists outright (R9/T13) → `bun test tests/sdd-participants.test.ts`
- `core/agents/*.md` stays within its byte budget after the exception was carved (Risk 4) → `bun test tests/prompt-budget.test.ts`

## Layer 5 — Cleaner/Architect guide no longer describes the passage as bound to the global `stateRef` (R10)

`docs/guia-cleaner-architect-herramientas-deterministas.md`: the SDD-passage-creation example
(previously line 478, "El coordinador... crea un pasaje ligado al `stateRef` actual") now describes
the scope-bounded seal (`sdd-scope-v1:sha256:` over path, inode identity and content digest per
declared file), not the whole-tree `stateRef`. The glossary (previously around line 585) gained a
new entry, `Sello del pasaje SDD`, distinguishing it explicitly from the general `stateRef` entry
immediately above it, so a reader cannot conflate the two. The general "Frescura Git e identidades
inmutables" tool section (around line 403) and Architect's own plan-linking passage (around line
200) were deliberately left untouched: both describe the general `state()`/`stateRef` tool and
Architect's own (unchanged) plan seal, neither of which this design touches (D2: `validStateRef`,
`checkpoint.stateRef` and `verification.observedStateRef` are untouched).

### Manual/measured check

- Read all three passages named in `design.md` (~403, ~478, ~585) directly: 478 (passage-creation)
  and 585 (glossary) corrected; 403 confirmed out of scope (general tool doc, not the SDD passage) —
  reported here as the measured outcome per R10's Given/When/Then, not assumed.

## Full-suite / typecheck gate (final, layers 1-5 complete)

- `bun test` (full, 169 files): 2223 pass, 5 fail. All 5 pre-existing and unrelated to this change,
  unchanged from every prior layer's baseline: 1 PTY handoff test (environment) + 4
  `tests/release-update-integration.test.ts` assertions expecting the literal string `v0.71.0` in a
  banner rendered as ASCII art.
- `tsc --noEmit` at repo root: clean, no errors.
- `bun test tests/prompt-budget.test.ts`: green, `core/agents/*.md` = 83,042 B (exactly at budget,
  0 B slack) — no budget constant was raised.

### Deviations from design

None. D8's layered contract (agent = minimal + REQUIRED, doc = full grammar + executable example)
implemented as specified; D9's order (1→2→3→4→5) respected throughout.

## Files changed

- `ein-pi/agent/lib/gitignore.ts`
- `tests/gitignore.test.ts`
- `tests/sdd-participants.test.ts`
- `openspec/changes/fix-harness-selfblocking-contracts/design.md`
- `ein-pi/agent/lib/sdd-participants.ts`
- `ein-pi/agent/lib/continuity-checkpoint.ts`
- `ein-pi/agent/lib/continuity-handoff-lifecycle.ts`
- `tests/continuity-checkpoint.test.ts`
- `tests/continuity-handoff-lifecycle.test.ts`
- `ein-pi/agent/lib/scout-contract.ts`
- `ein-pi/agent/assets/orchestrator.md`
- `ein-pi/agent/extensions/ein-ai.ts`
- `tests/readonly-scout-contract.test.ts`
- `tests/orchestrator-context-diet.test.ts`
- `ein-pi/core/agents/sdd-apply.md`
- `ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md`
- `docs/guia-cleaner-architect-herramientas-deterministas.md`
