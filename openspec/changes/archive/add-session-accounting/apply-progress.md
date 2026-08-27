status: complete

## Slice 1 — aggregator (`session-accounting.ts`)

Implemented the `[CORE]` pure aggregator per design §C.2/C.4/C.5 and R1-R13:
coverage derivation (single 3-branch function), single-channel cost/output
attribution (transcript > artifact, R3/R5), peak prompt/sequence stats with
`reported`/`derived` sources (R6), turns-per-run requiring all attempts to
report (R7), the three independent outcome tallies with `undetermined`
(R8), the `null`-model bucket (R9), nearest-rank percentiles with no
interpolation (C.5), deterministic ordering (models/agents, `null` last,
R11), and the snapshot identity block derived only from given data (R13,
no clock read).

### TDD Cycle Evidence

| stage | command | result |
| --- | --- | --- |
| RED | `bun test tests/session-accounting.test.ts` | module missing → 1 error, 0 pass (confirmed before implementation) |
| GREEN | `bun test tests/session-accounting.test.ts` | 21 pass, 0 fail, 89 expect() calls |
| TRIANGULATE | fixtures cover: empty corpus, all-zero cost, dual-channel run, both cost paths, null-model bucket + ordering, peak prompt/sequence (reported vs derived, partial eligibility), percentiles n=0/1/2/20, turns partial coverage, all three outcome tallies + undetermined, snapshot interval known/unknown, discovery passthrough, coverage arithmetic (complete/partial/unknown incl. total=0), determinism (byte-identical serialisation), agent ordering, `tree` never a cost/token provenance, `[CORE]` no-I/O contract | all in same GREEN run above |
| REFACTOR | switched `byModel` from whole-run bucketing to per-model run views (`perModelRunView`) so a model's cost sums only its own messages/attempts, not the full run | re-ran focused suite after refactor: 21 pass, 0 fail |

Behavior seam → final focused command:
- fail-closed empty corpus (R1) → `bun test tests/session-accounting.test.ts`
- single-channel cost/output attribution (R3/R5) → `bun test tests/session-accounting.test.ts`
- peak prompt vs peak sequence, reported/derived sources (R6) → `bun test tests/session-accounting.test.ts`
- turns-per-run all-attempts rule (R7) → `bun test tests/session-accounting.test.ts`
- three independent outcome tallies (R8) → `bun test tests/session-accounting.test.ts`
- null-model bucket keeps its cost (R9) → `bun test tests/session-accounting.test.ts`
- nearest-rank percentiles (C.5) → `bun test tests/session-accounting.test.ts`
- deterministic serialisation + ordering (R11) → `bun test tests/session-accounting.test.ts`
- snapshot identity block (R13) → `bun test tests/session-accounting.test.ts`
- `[CORE]` no-I/O, no-clock contract → `bun test tests/session-accounting.test.ts`

### Gates run

- `bun test tests/session-accounting.test.ts` → 21 pass, 0 fail.
- `bun test` (full suite) → 2718 pass, 0 fail, 13370 expect() calls (2697 pre-existing + 21 new; nothing broken).
- `bun run typecheck` (root) → clean, no errors.

### Deviations from design

None in scope/types. One implementation refinement not spelled out verbatim
in the design: per-model (`byModel`) slices are built from a per-run view
scoped to that model's own messages/attempts (`perModelRunView`), rather than
attributing the run's full cost to every model it touched — required so a
run mixing a `null`-model message and a known-model message doesn't double
the known model's cost. This follows R9's intent ("a null-model entry
carries those figures... no known model absorbs them") faithfully.

## Files changed

`ein-pi/agent/lib/session-accounting.ts`
`tests/session-accounting.test.ts`

## Slice 2 — store and command (`session-accounting-store.ts`, `ein:accounting`)

Implemented the edge module per §C.1/C.6: `readSessionCorpus()` walks the tree
per call (`EIN_PI_AGENT_HOME ?? AGENT_DIR`, same pattern as `sessions.ts`),
`readAccountingReport()` composes it with `buildAccountingReport` (the
`evaluateWorkspaceLedger` pattern). Parent transcripts (`<project>/<ts>_<uuid>.jsonl`)
and subagent transcripts (`<project>/<ts>_<uuid>/<runId>/run-N/session.jsonl`)
are walked separately from `subagent-artifacts/` (explicitly excluded from the
session-dir walk). `run-N` parsed by an anchored `/^run-(\d+)$/`; non-matching
directories yield `runIndex: null`. Project membership resolved from the
parent transcript's own `cwd` line, inherited by its children via a
per-project `stem -> project` map, falling back to the encoded directory name
when the parent is missing/unreadable. Cost read tolerates both
`message.usage.cost.total` (nested) and a line-level `usage.cost.total`
(alternate path, R5). Bounded reads: `MAX_PROJECTS_SCANNED`,
`MAX_RUNS_SCANNED`, `MAX_TRANSCRIPT_BYTES`, `MAX_MESSAGES_PER_RUN`,
`MAX_ARTIFACT_BYTES` — none throw; a truncated final line or an exceeded bound
degrades the transcript to `"partial"`, never dropped. Corrupt/oversized
`meta.json` degrades to `integrity: "corrupt"`, counted in `counts.corrupt`,
never thrown. Added one `pi.registerCommand("ein:accounting", ...)` block in
`ein-ai.ts` (same shape as the surrounding `ein:*` commands): renders the
snapshot header then `overall`/`parent`/`subagent` slices via small local
formatters (`formatTotal`/`formatStat`/`formatCoverage`), no computation, no
`0` printed for an unknown figure — pure presentation over the report the
store+core already produced (R12).

### TDD Cycle Evidence

| stage | command | result |
| --- | --- | --- |
| RED | `bun test tests/session-accounting-store.test.ts` | module missing → confirmed failing before implementation (no `session-accounting-store.ts` existed) |
| GREEN | `bun test tests/session-accounting-store.test.ts` | 17 pass, 0 fail, 37 expect() calls |
| TRIANGULATE | fixtures cover: absent vs empty-but-present store, per-call `EIN_PI_AGENT_HOME` resolution, parent role + cwd-derived project, `subagent-artifacts/` excluded from session walk, `run-N` parsing (`run-0`, `run-9`, non-matching → null) + discovery passthrough, missing `session.jsonl` (run still present), truncated final line → partial with earlier lines kept, corrupt `meta.json` (no throw), `meta.json` without `modelAttempts`/`usage` → nulls, non-file at expected transcript path → unreadable (no throw), both cost paths, model attribution via `model_change` (not a per-message field), a message-count sanity check, `generatedAt` presence, and one composition test (`readAccountingReport`) plus the empty-corpus fail-closed case (R1) | all in same GREEN run above |
| REFACTOR | none needed post-GREEN; kept as first-pass shape | re-ran focused suite: 17 pass, 0 fail |

Behavior seam → final focused command:
- absent vs empty store distinction (R10/C.6) → `bun test tests/session-accounting-store.test.ts`
- per-call `EIN_PI_AGENT_HOME` resolution → `bun test tests/session-accounting-store.test.ts`
- parent/child tree walk, `subagent-artifacts/` exclusion (C.6) → `bun test tests/session-accounting-store.test.ts`
- `run-N` index parsing (C.6) → `bun test tests/session-accounting-store.test.ts`
- missing/unreadable/partial transcript states, bounded no-throw reads (R10) → `bun test tests/session-accounting-store.test.ts`
- corrupt/absent-field `meta.json` handling → `bun test tests/session-accounting-store.test.ts`
- both cost-field paths + model-change attribution (R5, C.6) → `bun test tests/session-accounting-store.test.ts`
- store+core composition and R1 fail-closed empty corpus via the command path → `bun test tests/session-accounting-store.test.ts`
- `ein:accounting` command renders without recomputation (R12) → `bun run typecheck` (root; the command block type-checks against the report's discriminated unions) + manual read of the handler

### Gates run

- `bun test tests/session-accounting-store.test.ts` → 17 pass, 0 fail, 37 expect() calls.
- `bun test` (full suite) → 2735 pass, 0 fail, 13407 expect() calls (2718 pre-existing + 17 new; nothing broken).
- `bun run typecheck` (root) → clean, no errors.
- `cd installer && bun run typecheck` → clean, no errors.

### Deviations from design

None in scope. Two implementation decisions the design left open, resolved
conservatively: (1) `RunRef.sessionId` uses the session directory/file stem
(`<ts>_<uuid>`) rather than the transcript's internal `id` field, so a run is
still identifiable even when its transcript is missing/unreadable; (2) an
orphan `meta.json` with no matching `run-N` directory is still counted in
`counts.artifacts`/`counts.corrupt` (and in `discovery`) but does not spawn a
synthetic `RunObservation` — the walk is anchored on the directory structure,
per the "Run without `session.jsonl` → still present" scope wording, which
presumes a run directory exists.

### Manual check on real data

Not run in this slice — `openspec/changes/add-session-accounting/design.md`
§D reserves the real-corpus check (319 artifacts, 25 reruns, `run-9`) for
`sdd-verify`; this slice used only temp-dir fixtures per the design's fixture
constraint.

## Slice 3 — corrective: orphan artifacts now generate observations

Fixed the defect measured on the real corpus (63/320 artifacts had no
matching `run-N`, worth $34.53, silently dropped; agents falsely reported
`coverage: complete` against a truncated denominator). This directly
contradicts the Slice-2 "deviation" noted above; that deviation is now
reverted.

In `readSessionCorpus` (`session-accounting-store.ts`): each project's
`artifactsByRunId` is tracked against a `consumedArtifactRunIds` set,
populated when a `runId` is actually walked under a `sessionDir`. After the
`subDirs` walk, any artifact whose `runId` was never consumed gets a
synthetic `RunObservation`: `transcript: "missing"`, `messages: []`, `role:
"subagent"`, `runIndex: null`, `runDir: null`, `sessionId` falls back to the
`runId` (no session tree to derive it from), `artifact` set to the parsed
record (or the corrupt/nulled record — never skipped). No `[CORE]` change was
needed: `runCostOf`/`runOutputTokensOf` already fall back to the `artifact`
channel whenever `transcript` messages are empty, so single-channel
attribution (R3, transcript > artifact) and `channels.artifact` counting
worked immediately once the store emitted the observation.

### TDD Cycle Evidence

| stage | command | result |
| --- | --- | --- |
| RED | wrote 6 new tests in `session-accounting-store.test.ts` (orphan → synthetic run w/ provenance artifact; paired run unaffected/no regression; agent coverage denominator; channels sum invariant; corrupt/no-modelAttempts orphan → unattributed never 0) and rewrote the now-contradicted "subagent-artifacts is not walked" test; ran before implementing the store change | 1 fail expected (rewritten test), new tests fail against pre-fix store |
| GREEN | implemented the `consumedArtifactRunIds` tracking + orphan-emission loop | `bun test tests/session-accounting-store.test.ts` → 22 pass, 0 fail, 61 expect() calls |
| TRIANGULATE | orphan alone / orphan alongside a matched run / two orphans one corrupt+one empty-attempts / channels-sum invariant across mixed transcript+artifact+unattributed runs | all in same GREEN run above |
| REFACTOR | none needed; placement of the orphan loop (project-level, after `subDirs`, not nested inside it) was the one structural fix required mid-implementation | re-ran focused suite: 22 pass, 0 fail |

Behavior seam → final focused command:
- orphan artifact (no `run-N`) yields a synthetic observation, provenance `artifact` → `bun test tests/session-accounting-store.test.ts`
- paired artifact+`run-N` still resolves via `transcript`, figures unchanged (no regression on the 257 paired runs) → `bun test tests/session-accounting-store.test.ts`
- agent coverage denominator includes orphaned artifacts (no false `complete`) → `bun test tests/session-accounting-store.test.ts`
- `channels.transcript + channels.artifact + channels.unattributed === runs` invariant → `bun test tests/session-accounting-store.test.ts`
- corrupt/no-`modelAttempts` orphan → `unattributed`, never a phantom `0` cost → `bun test tests/session-accounting-store.test.ts`

### Gates run

- `bun test tests/session-accounting-store.test.ts` → 22 pass, 0 fail, 61 expect() calls.
- `bun test tests/session-accounting.test.ts` (unchanged, [CORE] untouched) → 21 pass, 0 fail, 89 expect() calls.
- `bun test` (full suite) → 2740 pass, 0 fail, 13431 expect() calls (2735 baseline + 5 net new; nothing broken).
- `bun run typecheck` (root) → clean.
- `cd installer && bun run typecheck` → clean.

### Deviations from design

None beyond reverting the Slice-2 deviation described above. `[CORE]`
(`session-accounting.ts`) was left untouched — it already had the right
fallback semantics for the `artifact` channel; scope note per the task's
CLOSED-scope clause: `session-accounting.ts`/its test were not modified,
because no adjustment was needed for it to admit `artifact` provenance in
coverage — it always did.

### Expected effect on the real corpus (not run in this slice; fixtures only)

Per the measured numbers in the task: **63 runs** should now enter via
`channels.artifact` (currently 0), and **$34.53** of previously invisible
cost should now appear in `overall.cost` and in the affected agents'
`byAgent[].cost`. The previously-`complete` agents whose artifact count
exceeded their `run-N` count should now report `partial` (or `complete` with
a correctly-widened denominator, if every one of that agent's artifacts is
now attributed) instead of a false `complete`. `channels.transcript` stays at
957 (untouched, single-channel precedence preserved for the 257 paired
runs).

## Files changed

`ein-pi/agent/lib/session-accounting.ts`
`tests/session-accounting.test.ts`
`ein-pi/agent/lib/session-accounting-store.ts`
`tests/session-accounting-store.test.ts`
`ein-pi/agent/extensions/ein-ai.ts`
