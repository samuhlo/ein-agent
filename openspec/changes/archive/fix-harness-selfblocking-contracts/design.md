# Design: fix-harness-selfblocking-contracts

**Lane:** micro · **TDD:** strict (ON) · **Phase:** design · **Date:** 2026-08-18
**Authority:** MANIFIESTO.md (`// 002` determinista, `// 004` arnés vs burocracia + prosa portante, `// 005` menor cambio correcto, `// 009.7` documento que contradice al código)

## Canonical spec context

| Path | Bytes | Digest |
| --- | --- | --- |
| `openspec/specs/scout-routing/spec.md` | not measured | not computed |

`scope.md` recorded **zero** canonical spec references and the micro lane has no `map.md`, so no
paths were injected. One exact path was read because layer 3 changes scout launch behavior and a
`scout-routing` domain spec exists — leaving it unread risked shipping a change that contradicts a
canonical spec (`// 009.7`). No other domain was read; `sdd-lifecycle` was **not** opened.
This executor has no shell, so SHA-256 and byte counts could not be computed — recorded as
uncomputed rather than invented (`// 007`: nothing is asserted that was not checked).

**Finding (load-bearing):** `use-independent-scouts-before-scope` requires "at most three scouts
with independent research angles"; its `Then` says *"the parent uses one to three scouts with
independent angles"* — it never requires them in **one turn**. Sequential launching satisfies the
spec. `readonly-scout-bounded-research-contract` requires normalizing *"only direct **foreground**
`ein-scout` launches"* — forcing `async: false` on the direct form **strengthens** conformance.
Layer 3 therefore needs no spec change, and the prompt must keep the phrase `one to three`.

---

## A. Proposal

### Intent

Stop the SDD harness from blocking its own delivery: seal the participant passage to the declared
apply scope instead of to the whole worktree, register the continuity checkpoint in `.gitignore`,
reject parallel scouts at launch instead of after burning them, and specify the `apply-progress.md`
grammar the passage parser actually reads.

### Scope

**In (4 bounded layers, closed by the user — no alternatives explored):**

1. `ein-pi/agent/lib/gitignore.ts` — ignore the continuity checkpoint; fix the header comment;
   repair the escaped fixture in `tests/sdd-participants.test.ts`.
2. `ein-pi/agent/lib/sdd-participants.ts` + `ein-pi/agent/lib/continuity-checkpoint.ts` +
   `ein-pi/agent/lib/continuity-handoff-lifecycle.ts` — scope-bounded passage seal.
3. `ein-pi/agent/lib/scout-contract.ts` + `ein-pi/agent/assets/orchestrator.md` — fail-at-launch
   sequential scouts.
4. `ein-pi/core/agents/sdd-apply.md` + `ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md` — the exact
   `Files changed` grammar as a bounded exception to the compactness rule.
5. `docs/guia-cleaner-architect-herramientas-deterministas.md` — the three passages that describe
   the old global seal (lines ~403, ~478, ~585).
6. `ein-pi/agent/lib/gitignore.ts` — ignore `.ein/continuity.json` (adhoc lane). Scope widened by
   one line, explicitly authorized by the user in-session on 2026-08-18 (identical self-blocking
   bug as the SDD lane's checkpoint, previously listed as out of scope below).

**Out (non-goals):**

- Changing `stateRef` semantics in `project-state.ts` for any other consumer.
- Changing the `fresh`/`stale` verification semantics at `continuity-checkpoint.ts:295`.
- Deriving the changed scope from `git diff` (a different architecture; discarded).
- Closing `update-astro-documentation`.

### Affected areas

| File | Layer | Nature |
| --- | --- | --- |
| `ein-pi/agent/lib/gitignore.ts` | 1 | one `ENTRIES` line + header comment |
| `tests/gitignore.test.ts` | 1 | new assertion |
| `tests/sdd-participants.test.ts` | 1, 2 | fixture repair + new behavior tests |
| `ein-pi/agent/lib/sdd-participants.ts` | 2 | seal computation and its 3 consumers |
| `ein-pi/agent/lib/continuity-checkpoint.ts` | 2 | seal format validator; remove `rebaseSddParticipants` |
| `ein-pi/agent/lib/continuity-handoff-lifecycle.ts` | 2 | carry participants instead of rebasing |
| `tests/continuity-checkpoint.test.ts` | 2 | seal-format acceptance |
| `tests/continuity-handoff-lifecycle.test.ts` | 2 | replaced behavioral assertion (lines 53-64) |
| `ein-pi/agent/lib/scout-contract.ts` | 3 | launch guard + `async: false` on the direct form |
| `ein-pi/agent/assets/orchestrator.md` | 3 | section substitution (byte-neutral or negative) |
| `tests/orchestrator-context-diet.test.ts` | 3 | prosa portante literals (lines 98-104) |
| `tests/readonly-scout-contract.test.ts` | 3 | launch-guard tests |
| `ein-pi/core/agents/sdd-apply.md` | 4 | bounded exception (byte-neutral) |
| `ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md` | 4 | executable grammar block |
| `docs/guia-cleaner-architect-herramientas-deterministas.md` | 5 | 3 passages aligned with the code |

### Risks

1. **Persisted-format break (layer 2).** `validParticipants` currently demands `git-v1:sha256:` for
   `beforeStateRef`, `cleaner.observedStateRef`, `cleaner.afterStateRef`,
   `architect.observedStateRef`. Rejecting the old format would brick every in-flight checkpoint
   (`readContinuityCheckpoint` → invalid → `passage()` throws "no valid current SDD continuity
   checkpoint"). Mitigation: the validator accepts **both** formats; `sdd-participants.ts` only ever
   **mints** the new one, and `passage()` (:75) re-mints on seal mismatch, so old participants
   self-heal on the next plan. There is exactly one live checkpoint on disk today
   (`openspec/changes/update-astro-documentation/continuity.json`).
2. **Losing the global rebase (layer 2).** Deleting `rebaseSddParticipants` moves the invalidation
   authority from the writer (continuity refresh) to the reader (`passage()` / `admit`). If any
   admission path could skip `passage()`, evidence would survive a scope change. Verified it cannot:
   `admitSddParticipantCall` calls `planSddParticipants` → `passage()` → `changedScope()` on every
   admission.
3. **Scout tracking leak (layer 3) — closed, not accepted.** Originally recorded as an accepted
   residual (a tool call that never emits a result would leave a `pending` entry until
   `session_shutdown`, `ein-ai.ts:673`, blocking every later scout for the rest of the session).
   Closed during apply: `scoutTracking.clear()` now also runs at the start of `pi.on("input", ...)`
   (`ein-ai.ts:679`), the user-turn boundary. R6/R7 together make this exact: R7 forces
   `async: false` on every normalized launch, so a legitimate scout cannot outlive the turn that
   launched it; clearing at turn start therefore only ever discards orphaned entries (cancelled or
   dead scouts), never a live one. The guard is now precisely "one scout per turn", matching D7's
   framing, and cannot survive past the turn that created it — no restart required.
4. **Prompt/agent byte budgets.** `tests/prompt-budget.test.ts` caps `orchestrator.md` at 43,011 B
   and `core/agents/*.md` at 83,042 B **and** fails when slack exceeds 15%. Layers 3 and 4 must be
   byte-neutral-or-negative; raising a budget is not authorized by this scope.
5. **Adjacent bug left open (out of scope).** The adhoc checkpoint is written to
   `.ein/continuity.json` (`continuity-checkpoint-store.ts:48`), which is **not** in `ENTRIES`
   either. Identical self-invalidation in the adhoc lane. Not fixed here — needs the user's
   authorization to widen the scope by one line.
6. **Already-tracked checkpoints.** `.gitignore` does not hide a file git already tracks. If any
   `continuity.json` is committed in the future, layer 1 stops working for it silently.

### Rollback

Per layer, independently revertible; no data migration, no schema version bump.

- Layer 1: remove the `ENTRIES` line. Note the checkpoint file stays on disk and becomes untracked
  again — no cleanup needed.
- Layer 2: revert the three source files. Persisted checkpoints minted with `sdd-scope-v1:` seals
  fail `validParticipants` after the revert → they are re-minted by `passage()` on the next plan.
  Cost of rollback = one Cleaner/Architect re-run per in-flight change, no corruption.
- Layer 3: revert `scout-contract.ts` and restore the prompt section together with its test literals
  (they are one unit — see Decisions).
- Layer 4/5: documentation-only revert.

### Success criteria

See section D.

---

## B. Spec

### R1 — The continuity checkpoint MUST NOT be visible to `git status`

The system MUST include a managed `.gitignore` entry covering `continuity.json` under
`openspec/changes/`, and `gitignoreBlock()` MUST be the single source of that entry.

- **Given** a project whose `.gitignore` was produced by `ensureEinGitignore()`
- **When** the SDD continuity checkpoint is written to `openspec/changes/<change>/continuity.json`
- **Then** `git status --untracked-files=all` does not report it and the global `stateRef` is
  unchanged by the write.

### R2 — The passage seal MUST be bounded to the declared apply scope

The system MUST seal an SDD participant passage with an identity derived **only** from the repo root
identity and, for each declared changed file, its path, `dev`, `ino`, `mode` and a SHA-256 digest of
its bytes. The seal MUST use the prefix `sdd-scope-v1:sha256:` and MUST NOT be derived from
`git status`, HEAD, branch, or any file outside the declared scope.

- **Given** a planned passage over `src/a.ts`
- **When** an unrelated untracked file is created anywhere else in the repository (for example
  `openspec/changes/<change>/memory-receipts.jsonl`)
- **Then** `admitSddParticipantCall` admits the participant and does **not** answer
  "source state is stale".

### R3 — The passage MUST still fail closed when the declared scope changes

The system MUST refuse admission when any declared changed file's bytes or filesystem identity
differ from those sealed at plan time.

- **Given** a planned passage over `src/a.ts`
- **When** `src/a.ts` is rewritten in place (same inode, same mode, different bytes) before admission
- **Then** `admitSddParticipantCall` returns the stale-source blocker and the participant does not
  run.

### R4 — Persisted participant seals MUST validate in both formats, and only the new one is minted

The system MUST accept `sdd-scope-v1:sha256:<64 hex>` **and** the legacy `git-v1:sha256:<64 hex>` in
`beforeStateRef`, `cleaner.observedStateRef`, `cleaner.afterStateRef` and
`architect.observedStateRef`, and MUST mint only `sdd-scope-v1:`. The validator for
`checkpoint.stateRef` and `verification.observedStateRef` MUST remain unchanged.

- **Given** a stored v2 checkpoint whose participants carry legacy `git-v1:` seals
- **When** it is parsed and then a passage is planned
- **Then** parsing succeeds and `passage()` re-mints the participants with an `sdd-scope-v1:` seal,
  clearing prior participant evidence.

### R5 — Continuity refresh MUST preserve participant evidence

The system MUST carry `sddParticipants` unchanged into a refreshed checkpoint and MUST NOT clear it
because the global `stateRef` moved.

- **Given** a checkpoint holding a completed Cleaner result
- **When** the continuity lifecycle refreshes after the global `stateRef` changed
- **Then** the stored `cleaner` evidence is still present and unchanged.

### R6 — A concurrent scout launch MUST fail before execution

The system MUST reject a scout launch when another scout tool call is already pending, with an
actionable message, before any delegation is executed. A relaunch with the same `toolCallId` MUST
NOT be rejected.

- **Given** one `ein-scout` launch already normalized and pending
- **When** a second `ein-scout` launch arrives with a different `toolCallId`
- **Then** normalization throws `ein-scout contract: …already pending…` and no second delegation
  runs.

### R7 — Every normalized scout launch MUST be foreground

The system MUST set `async: false` on both the `workflowScript` form and the direct form.

- **Given** a direct `{ agent: "ein-scout", task }` launch
- **When** it is normalized
- **Then** the returned launch contains `async: false`.

### R8 — The orchestrator prompt MUST describe sequential fan-out

The prompt MUST state that scouts run one call per turn, MUST keep the `one to three` bound
(canonical spec anchor) and MUST NOT grow the orchestrator byte budget.

- **Given** the installed `orchestrator.md`
- **When** the read-only fan-out section is read
- **Then** it states sequential one-per-turn launching, retains `one to three distinct fresh
  scouts` and `no OpenSpec artifacts`, and the file is ≤ 43,011 bytes.

### R9 — The `Files changed` grammar MUST be specified where it is produced and machine-checked

`sdd-apply.md` MUST require exactly one `## Files changed` section as a bounded, explicit exception
to its compactness rule; `SDD_ARTIFACT_GRAMMAR.md` MUST document the parsed contract with a fenced
canonical example, and that example MUST be accepted by `changedScope()`.

- **Given** the canonical example block in `SDD_ARTIFACT_GRAMMAR.md`
- **When** it is written as the `apply-progress.md` of a fixture change and a passage is planned
- **Then** the plan succeeds and the passage scope equals exactly the paths declared in the example.

### R10 — The Cleaner/Architect guide MUST NOT contradict the seal

The guide MUST describe the passage as bound to the declared scope's identity, not to the whole-tree
`stateRef`.

- **Given** `docs/guia-cleaner-architect-herramientas-deterministas.md`
- **When** the passage-creation, evidence-binding and glossary passages are read
- **Then** they describe a scope-bounded passage seal and no longer claim the passage is bound to
  the current global `stateRef`.

---

## C. Decisions

### D1 — Seal input: paths + inode identity + content digest (all three)

The seal is `sha256` over a canonical JSON payload of `["sdd-scope-v1", rootDev, rootIno,
...sortedPaths.map(p => [p, dev, ino, mode, sha256(bytes)])]`.

- **Identity alone is not enough.** The Cleaner rewrites a file in place: same `dev`/`ino`/`mode`,
  different bytes. Without the content digest, R3 breaks and the guarantee is silently lost. This is
  why R3's test is the one that fails first for a wrong implementation.
- **Content alone is not enough.** `changedScope()` already treats symlink swaps and inode
  substitution as attacks (`:45-47`, `:57`); dropping identity would weaken an existing guard.
- **HEAD and branch are deliberately excluded.** A commit that does not touch the declared bytes no
  longer invalidates a passage. Accepted: the passage asks "is this evidence about the same files?",
  not "is this the same commit". A branch switch that changes those files is still caught by the
  digest.
- **Cost:** one extra read per declared file (already `lstat`-ed), bounded by the declared scope.

### D2 — New prefix `sdd-scope-v1:sha256:`, not a reused `git-v1:`

Reusing `git-v1:` would make the value lie about its provenance (`// 002`: evidence carries its
provenance) and would silently pass `validStateRef`, hiding a format regression. The new prefix is
greppable and self-describing.

**Validators touched:** only `validParticipants` in `continuity-checkpoint.ts`, via a new
`validParticipantSeal = validStateRef(v) || /^sdd-scope-v1:sha256:[a-f0-9]{64}$/.test(v)`, applied
to the four participant fields. `validStateRef` itself, `checkpoint.stateRef` and
`verification.observedStateRef` are untouched — the global state ref keeps meaning exactly what it
means today. The task-text marker `/\[ein-sdd-participant\/v1 passage=… state=([^\]\s]+)\]/`
(`sdd-participants.ts:18`) already accepts the new value with no change.

**Legacy acceptance is a read-only concession**, not a dual-format regime: nothing mints `git-v1:`
participants after this change, and the first `passage()` call re-mints them (R4).

### D3 — The three seal fields move together

`beforeStateRef` (`:77`), `cleaner.afterStateRef` (`:145`) and `architect.observedStateRef` (`:144`)
all become scope seals, because `validParticipants` (`:247-249`) enforces their mutual equality
chain: cleaner observes `beforeStateRef`; architect observes `cleaner.afterStateRef` or
`beforeStateRef`. Mixing formats across those fields would make every checkpoint invalid. Consumers:

- `sdd-participants.ts:68` — `currentState = state(cwd)` → `scoped.seal`.
- `:88` — `stateRef: durable.cleaner?.afterStateRef ?? durable.beforeStateRef` (unchanged logic).
- `:122` and `:142` — `state(cwd)` → a recomputed scope seal (`changedScope(cwd, change).seal`).
  Recomputing (rather than caching) is deliberate: `changedScope()` re-runs its TOCTOU proof loop
  (`:57`) at admission and at completion.
- The private `state()` helper becomes unused and is removed (`// 004`: no dead code).

Note the throw surface does not widen: `admitSddParticipantCall` already reaches `changedScope()`
through `planSddParticipants` at `:120`, so the same failure modes already exist on that path.

### D4 — `rebaseSddParticipants` is removed, not adapted

Today `continuity-handoff-lifecycle.ts:160-161` rebases participants against the **global**
`stateRef`. With a scope seal, `terminal === stateRef` would never hold, so **every** continuity
refresh would wipe Cleaner/Architect evidence and force endless re-runs. Three options were weighed:

| Option | Verdict |
| --- | --- |
| Make the lifecycle recompute the scope seal | Rejected: pulls `changedScope()` (file reads, throws on missing `apply-progress.md`) into a hot refresh path that runs constantly. |
| Keep rebasing on the global ref | Rejected: guarantees permanent evidence loss. |
| **Remove the rebase; carry participants unchanged** | **Chosen.** |

The invalidation authority moves to the reader: `passage()` (`:75`) compares `applyId`, `scopeId`
and the seal on **every** plan, and every admission goes through it. That is strictly stronger than
the old writer-side rebase, which only fired on refresh. The surrounding block stays: participants
must still be carried into the freshly derived checkpoint via `withSddParticipants`, or a refresh
would drop them entirely; the `if (!derived.checkpoint.stateRef) return "refresh-failed"` guard is
kept unchanged (zero-risk, still fail-closed).

`rebaseSddParticipants` has no direct unit test; only the behavioral assertion at
`tests/continuity-handoff-lifecycle.test.ts:53-64` ("clears stale complete or blocked evidence")
encodes the old contract. That assertion is replaced by R5 — this is a **deliberate contract
change**, recorded here so it is not mistaken for a broken test.

### D5 — Layer 1 does NOT close the `fresh`→`stale` degradation (measured claim, bounded)

Asked explicitly, answered from the code, not from hope:

- `verificationFrom()` (`continuity-checkpoint.ts:163-165`) marks `fresh` only when the verification's
  observed ref equals the **current global** `stateRef`; `parseContinuityCheckpoint:295` re-checks that
  invariant on read.
- Layer 1 removes **one** source of drift — and the worst one, because the checkpoint rewrites
  itself on every refresh, i.e. a self-feeding loop.
- It does **not** remove the others: `memory-receipts.jsonl` (`sdd-memory-save.ts:134`) is still
  untracked inside `openspec/changes/<change>/`, and every normal artifact write
  (`apply-progress.md`, `verify-report.md`, `tasks.md`) legitimately moves the global `stateRef`.
- **Conclusion: layer 1 is necessary but not sufficient.** The `fresh` path still degrades to
  `stale` whenever anything is written to the repo after verification. This stays an **open,
  measurable risk**, deliberately out of scope. Measurement for a later slice (not run in this
  phase): two consecutive refreshes with no intervening repo write must both report `fresh`; a
  single artifact write in between must produce `stale`. Nothing here is claimed as verified —
  it is derived from reading the code and must be measured before being reported as fact (`// 007`).

Layer 2 does close **problem 4** (`memory-receipts.jsonl`) *for the passage seal*: that file is not
a declared path and does not feed `applyId`, so it can no longer invalidate a passage. It still
affects the global `stateRef`, which is the part left open above.

### D6 — `.gitignore` pattern: `openspec/changes/**/continuity.json`

`scope.md` wrote `openspec/changes/*/continuity.json`. One character is changed, with the reason
stated: `sdd-close` moves the whole change directory to `openspec/changes/archive/<change>/`
(`sdd-close.ts:64,194`), which a single `*` does not match — an ignored checkpoint would pop back
into `git status` (and into the archive commit) the moment the change closes. `**` matches zero or
more directories, so one entry covers both. The **what** is unchanged; this is the **how**.

The header comment stops claiming `openspec/changes/` is never ignored, and states the real
boundary: **the board is versioned; runtime state written inside it is not**.

### D7 — Layer 3: the guard lives in code, its retirement condition lives in a code comment

Placement inside `normalizeScoutLaunch`, after the `toolCallId` check and before `tracking.set`:
reject when any entry is `pending` under a **different** `toolCallId` (same id = idempotent
re-normalization of the same call, never rejected). Message names the rule so the parent can act:
`a scout is already pending; scouts run one per turn (sequential fan-out)`.

Note a scope correction: `ScoutTracking` is a bare `Map<string, string>` held module-wide
(`ein-ai.ts:179`) — there is **no** `sessionKey` in it. It is cleared at `session_shutdown` (`:673`,
unchanged) and also at the start of every user turn, `pi.on("input", ...)` (`:679`, added during
apply to close the tracking-leak risk above). The guard is therefore per-tracking-map, scoped to a
single turn in practice: an orphaned `pending` entry cannot survive past the turn that created it.

**Retirement condition (`// 004`) goes in a comment next to the guard, not in the prompt** — it
costs zero tokens per turn and lives with the mechanism it explains: *retire when the runtime can
bind N concurrent scout reports to N tool call ids (`scoutReportText` requires exactly one result,
`:160`) and a measured run shows scout wall-clock dominating. Until then a parallel batch cannot be
associated with its report and is rejected before it costs anything.*

The `orchestrator.md` section is **substituted, not extended** (byte-neutral or negative — the
budget test has ≤15% slack, so growth is not available). The heading becomes
`## Read-only fan-out (sequential)`; the body keeps `one to three distinct fresh scouts` (canonical
spec anchor), keeps `no OpenSpec artifacts`, adds the one-per-turn rule and the "rejected at launch"
fact, and drops the now-false "Parallelism buys wall-clock" sentence to pay for the longer heading.

**Prosa portante:** `tests/orchestrator-context-diet.test.ts:98-104` slices the prompt at
`"## Parallel read-only fan-out"` and asserts three literals. Prompt and test change in the **same
step** — the test is the mechanism, not a description of it. The new test keeps
`one to three distinct fresh scouts`, keeps `not.toMatch(/read-only \`sdd-map\`/)` and
`toContain("no OpenSpec artifacts")`, re-anchors the slice on the new heading, adds a match on the
one-per-turn phrase, and adds a negative assertion that the old heading is gone (proving
substitution, not accumulation).

### D8 — Layer 4: minimal contract in the agent, full grammar in the doc, executable in a test

The agent prompt is byte-budgeted (`core/agents/*.md` ≤ 83,042 B); `core/docs/` is not. So:

- `sdd-apply.md:64` — the sentence that today forbids "a dump of full file lists" is **rewritten**
  (not appended to) to carve the exception, staying byte-neutral: one `## Files changed` section is
  REQUIRED because it is the machine-read scope of the Cleaner/Architect passage; one path per line
  in backticks; it is the *only* permitted file list.
- `SDD_ARTIFACT_GRAMMAR.md` — the full parsed contract plus a fenced canonical example. This also
  fixes an existing contradiction: line 67 prescribes `Archivos tocados`, which the parser
  (`sdd-participants.ts:34`) does **not** accept.

**The grammar, exactly as parsed** (`sdd-participants.ts:31-58`):

1. Heading matched case-insensitively: `files changed`, `changed files`, `archivos modificados`,
   `archivos cambiados`, optional `#`-`######` prefix, optional trailing `:`, nothing else on the
   line. Canonical: `## Files changed`.
2. The section ends at the next markdown heading — so it must be followed by another heading.
3. **Every backticked span inside the section is parsed as a path.** No prose code spans, no
   commands, no inline `` `types` `` — this is the trap that makes a "helpful" sentence block apply.
4. Paths: repo-root-relative, `/` separator, no leading `/`, no `\`, no `.`/`..`/empty segments, no
   duplicates, at least one.
5. Each path must resolve to an existing **regular file** with no symlink component at admission —
   therefore a file deleted or renamed away by apply MUST NOT be listed.
6. No path segment may be one of `.atl`, `.git`, `.pi`, `build`, `coverage`, `dist`, `generated`,
   `node_modules`, `runtime`, `vendor`.

The doc's fenced example is asserted **executable**: the test extracts it and feeds it to
`planSddParticipants` (`// 002`: the check is computed, not a prose lint). A literal string match
would only prove the doc says something; this proves the doc is true.

### D9 — Layer order is a constraint, not a preference

Layer 1's RED (the fixture repair) must be observed **before** layer 2 lands, because a scope-bounded
seal makes the participant suite independent of `.gitignore` and would mask the very bug that
escaped. After layer 2, the durable guard for layer 1 is the `gitignoreBlock()` assertion; the
fixture repair remains as product-truth hygiene (measure the product, never a hand-written copy of
it). Order: **1 → 2 → 3 → 4 → 5**.

### Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Derive the scope from `git diff` | Explicitly discarded by the user; different architecture. |
| Make the global `stateRef` ignore runtime files | Would make `stateRef` lie to every other consumer (out of scope, `// 002`). |
| Reject legacy `git-v1:` participant seals outright | Bricks in-flight checkpoints with an opaque message; self-healing re-mint is fail-closed and cheaper. |
| Keep `rebaseSddParticipants` with a scope-seal argument | Drags file reads and throws into the hot refresh path for no added guarantee. |
| Put the scout retirement condition in `orchestrator.md` | Paid on every turn of every session; belongs next to the code it retires (`// 004`). |
| Enforce the `Files changed` grammar with a literal doc string match | Proves the doc says it, not that it works. |

---

## D. Success Criteria

### Strict TDD — the test that fails FIRST per layer, and why it does not fail today

| # | Layer | RED test | Why it passes / is absent today |
| --- | --- | --- | --- |
| T1 | 1 | `tests/gitignore.test.ts`: `gitignoreBlock()` contains `openspec/changes/**/continuity.json` | `ENTRIES` (`gitignore.ts:25`) holds only the four legacy entries; the suite only ever asserts those four. |
| T2 | 1 | `tests/sdd-participants.test.ts` fixture calls `ensureEinGitignore(cwd)` instead of hand-writing the line (`:21`); the participant suite then fails with "source state is stale" | The fixture hand-writes the ignore rule, so the **product's** entry list is never exercised — the exact escape recorded in `scope.md`. Must be observed **before** layer 2. |
| T3 | 2 | Passage survives an unrelated untracked write (R2) | Today `beforeStateRef` is `state(cwd)` over the whole tree (`project-state.ts:543,577`), so **any** untracked file flips it. |
| T4 | 2 | Passage dies on an in-place rewrite of a declared file, same inode (R3) | Passes today via the global ref — it is the RED that fails against an **identity-only** seal, so it is what forces the content digest into D1. |
| T5 | 2 | Persisted `beforeStateRef` matches `/^sdd-scope-v1:sha256:[a-f0-9]{64}$/` (R2/R4) | `validParticipants` (`continuity-checkpoint.ts:241`) demands `git-v1:`; without the validator change `withSddParticipants` returns `invalid-checkpoint` and `passage()` throws "participant checkpoint is invalid" — a distinct, diagnostic RED. |
| T6 | 2 | `tests/continuity-checkpoint.test.ts`: a v2 checkpoint carrying `sdd-scope-v1:` seals parses `ok` (R4) | `validStateRef` rejects the prefix → `invalid-checkpoint`. |
| T7 | 2 | `tests/continuity-handoff-lifecycle.test.ts`: refresh **preserves** cleaner evidence across a global `stateRef` change (R5) | The current test asserts the opposite (`:53-64`); `rebaseSddParticipants` clears it. |
| T8 | 3 | Second `normalizeScoutLaunch` with a different `toolCallId` and a pending entry throws (R6) | No pending check exists; `unsupportedForm` (`:38-51`) only rejects declared parallel/async **shapes**, after the fact. |
| T9 | 3 | Same-`toolCallId` relaunch does **not** throw (R6) | No guard exists yet — written together with T8 so the guard is not overtightened. |
| T10 | 3 | Direct-form launch carries `async: false` (R7) | `scout-contract.ts:74` returns the direct form without it; only the `workflowScript` branch (`:71-72`) sets it. |
| T11 | 3 | Rewritten fan-out literals in `tests/orchestrator-context-diet.test.ts` (R8) | The current test pins `"one to three distinct fresh scouts"` under `## Parallel read-only fan-out`; the new anchors do not exist until the prompt is substituted. |
| T12 | 4 | The fenced example in `SDD_ARTIFACT_GRAMMAR.md` is accepted by `planSddParticipants` and yields exactly its declared paths (R9) | The doc has no example block and prescribes `Archivos tocados`, which the heading regex (`:34`) rejects. |
| T13 | 4 | `sdd-apply.md` contains the canonical `## Files changed` requirement (R9) | Line 64 forbids file lists outright — the contradiction being fixed. |

### Observable checks

- `bun test` — full suite green, including the replaced assertions in
  `tests/continuity-handoff-lifecycle.test.ts` and `tests/orchestrator-context-diet.test.ts`.
- `tsc --noEmit` at the repository root (this gate covers `ein-pi` **and** `cc-ein`) and
  `cd installer && bun run typecheck` (the gate recorded in `openspec/config.yaml`). Both.
- `tests/prompt-budget.test.ts` green **without editing `ORCHESTRATOR_BUDGET_BYTES` or
  `CORE_AGENTS_BUDGET_BYTES`** — a raised budget in this change is a failed layer, not a passing one.
- `openspec/changes/*/continuity.json` and `openspec/changes/archive/*/continuity.json` do not appear
  in `git status --porcelain=v2 --untracked-files=all` in this repository.
- No production source keeps a reference to `rebaseSddParticipants` or to the removed `state()`
  helper in `sdd-participants.ts` (dead code is removed, not deprecated).

### Manual/measured checks (report as evidence, never as assumption)

- The `fresh`→`stale` degradation (D5) stays **open**: verify explicitly reports it as a known
  residual with the two-refresh measurement described in D5, or reports it as not measured. It must
  not be claimed as fixed.
- `docs/guia-cleaner-architect-herramientas-deterministas.md` lines ~403, ~478 and ~585 no longer
  describe the passage as bound to the whole-tree `stateRef` (R10).
