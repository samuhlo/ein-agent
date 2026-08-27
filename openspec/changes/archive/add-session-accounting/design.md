# Design: add-session-accounting

**Change:** `add-session-accounting`
**Phase:** design
**Lane:** micro
**TDD:** strict

## Canonical spec context

| path | sha256 | bytes |
| --- | --- | --- |
| `openspec/specs/agent-accounting/spec.md` | not computed (no shell in this phase) | 1729 (`wc -c` to confirm in APPLY) |

Read: the canonical `agent-accounting` spec (4 scenarios) plus the change-local
delta, byte-identical in scenario content. 1 of the 3 allowed files, far under
32 KiB. Digests are declared uncomputed rather than invented: this executor has
no shell, and a fabricated hash is exactly the credible-and-false failure this
change exists to prevent.

## A. Proposal

### Intent

Turn the session data Ein already writes to disk into a report that answers one
question honestly: what does running Ein actually cost in money, prompt and
sequence tokens, turns and failures — and how much of that answer is measured
versus missing. The number is decision input for hardware purchase and for moving
a phase to a local model, so coverage and snapshot identity are part of the
number, not footnotes.

### Scope

**In** — the two modules, their mirror tests and one rendering command; see the
table below and §C.1 for the boundary between them.

**Out (non-goals)**

- Claude Code's session store.
- UI, panels, graphs, TUI.
- `model-config.ts` and model routing — untouched.
- New instrumentation. This change only reads bytes Ein already writes.
- Forecasting, budgets, budget enforcement.
- Any write to the session store. The store module is read-only by construction.
- Run duration, compactions and task outcome: deferred to a later change.

### Affected areas

| file | role |
| --- | --- |
| `ein-pi/agent/lib/session-accounting.ts` | new, `[CORE]` aggregator: pure, no I/O, takes parsed records |
| `ein-pi/agent/lib/session-accounting-store.ts` | new, the edge: walks the tree, reads JSONL and `*_meta.json`, never throws |
| `tests/session-accounting.test.ts` | new, mirror test (APPLY slice 1) |
| `tests/session-accounting-store.test.ts` | new, mirror test (APPLY slice 2) |
| `ein-pi/agent/extensions/ein-ai.ts` | one `pi.registerCommand` block appended, rendering only |
| `specs/agent-accounting/spec.md` (delta) | extended: 1 MODIFIED + 7 ADDED (§C.7) |

Precedent followed: `reviewed-area-ledger.ts` + `-store.ts` for the logic/I-O
split, `sessions.ts` for the walk (per-call root resolution, best-effort reads).

### Risks

1. **A credible false number.** The dominant risk. Artifacts sum ~$68 while the
   tree partition sums ~$137: the same money through two overlapping lenses.
   Adding them double-counts, picking one understates. Mitigated by
   single-channel precedence (§C.3) and coverage as a required field.
2. **Silent zero.** A missing transcript, a corrupt `meta.json` or an
   unattributable model collapsing to `0` would look like a measurement.
   Mitigated by the `unknown`/`partial` states and by asserting that an empty
   corpus reports `unknown`, never `complete` over zero.
3. **Untrusted bytes.** Foreign files, possibly truncated mid-write by a live
   session. Mitigated by narrowing every field from `unknown`, no `as`, bounded
   reads, and limits that degrade to `partial` instead of hanging or dropping.
4. **An unidentified snapshot.** The corpus grows, so two runs of the report are
   not comparable unless each states what it saw. Mitigated by R13.
5. **p95 on n=2.** Meaningless but printable. Mitigated by exporting `n` on every
   stat and by a fixed, tested percentile rule (§C.5).

### Rollback

Two new files plus one command block. Deleting the two `lib/` modules, the two
tests and the `registerCommand` block restores the previous behaviour exactly:
nothing else imports them, and no existing module changes. No persisted state,
no migration, no schema on disk. The extended spec delta (§C.7) is text under
`openspec/`, reverted by the same commit. `git revert` is sufficient.

### Success criteria

See §D.

## B. Spec

The requirements below refine the four canonical `agent-accounting` scenarios and
add observable behaviour those scenarios do not accept: per-model attribution,
output tokens, the three-way failure taxonomy, snapshot identity and the query
command. **The delta is therefore extended** — 1 MODIFIED, 7 ADDED (§C.7).

### R1 — Fail-closed coverage (refines `fail-closed-unknown-metrics`)

The system MUST attach a coverage record to every emitted figure, carrying
`status` (`complete` | `partial` | `unknown`), `attributed`, `total`, and the set
of provenances that produced it. Coverage status MUST be derived only as:
`attributed === total && total > 0` → `complete`; `0 < attributed < total` →
`partial`; `attributed === 0` → `unknown`. The system MUST NOT emit a numeric
value for a figure whose coverage is `unknown`.

- **Given** a sessions root that is empty or absent
- **When** the report is generated
- **Then** every figure reports `status: "unknown"` with `attributed: 0`, and no
  figure reports the value `0`

### R2 — Provenance is mandatory and typed (refines `parent-subagent-cost-partition`)

Every figure MUST declare its provenance from the closed set `transcript` |
`artifact` | `tree`. `tree` MUST only be the provenance of structural facts —
parent/subagent membership and run counts — and MUST NEVER be the provenance of
a token or cost figure.

- **Given** a session tree with parent transcripts and subagent artifacts
- **When** the partition is requested
- **Then** parent and subagent totals each carry their own coverage and their own
  provenance, and the structural classification is reported as `tree`

### R3 — Single-channel cost attribution (refines `parent-subagent-cost-partition`)

A run MUST contribute cost through exactly one channel, chosen by the precedence
`transcript` > `artifact`. The system MUST NOT sum a transcript-derived cost and
an artifact-derived cost for the same run. The report MUST expose how many runs
were attributed through each channel and how many were attributed through none.

- **Given** a subagent run with both a readable transcript and a readable
  `meta.json`, each carrying a cost
- **When** the cost total is computed
- **Then** only the transcript figure is counted, the run is recorded against the
  `transcript` channel, and the artifact figure is not added

### R4 — Absent cost is not zero cost

The system MUST distinguish "no cost field present" from "cost reported as 0". A
figure whose samples all lack a cost field MUST report `unknown`. A figure whose
samples all report `0` MUST report `0` with `complete` coverage — the expected
normal case for a local model, and not a failure.

- **Given** a corpus whose every attempt reports `cost.total: 0`
- **When** the cost total is computed
- **Then** the total is `0` with `status: "known"` and `complete` coverage

### R5 — Both cost paths (refines `fail-closed-unknown-metrics`)

The system MUST read cost from `message.usage.cost.total` and, when absent, from
`usage.cost.total`. A value that is not a finite number `>= 0` MUST be treated as
absent, not as `0`.

- **Given** one message using `message.usage.cost.total` and another using
  `usage.cost.total`
- **When** the run cost is computed
- **Then** both messages contribute and the run is attributed once

### R6 — Peak prompt and peak sequence are two metrics (modifies `peak-context-window-per-model`)

"Context window" alone is ambiguous — the KV cache grows with the generated
tokens too — so the system MUST report two independent statistics, each with its
own coverage and its own name:

- **Peak prompt tokens**: `max(input + cacheRead + cacheWrite)` over a single
  message of the run — what must be resident before generation starts.
- **Peak sequence tokens**: the same turn including its output — what the cache
  holds when generation ends. The system MUST use `usage.totalTokens` when the
  message reports it and MUST derive `input + cacheRead + cacheWrite + output`
  when it does not, recording per stat how many samples came from each source.

A message missing any component of the metric it feeds MUST be ineligible as a
sample for that metric and MUST NOT be read as `0`; ineligibility for one metric
MUST NOT disqualify the message from the other. Both statistics MUST report
`mean`, `p95`, `max` and `n`, per run and per (run, model).

- **Given** a run whose largest turn reports `input`, `cacheRead`, `cacheWrite`,
  `output` and `usage.totalTokens`
- **When** the peaks are computed
- **Then** the run contributes one prompt sample equal to the prompt sum and one
  sequence sample equal to `usage.totalTokens` recorded as `reported`, and each
  stat carries its own `mean`, `p95`, `max`, `n` and coverage

### R7 — Turns per run (refines `turnos-per-run-aggregation`)

Turns MUST come only from `modelAttempts[].usage.turns` in `meta.json`. A run
contributes a turns sample only when every entry of `modelAttempts` reports a
finite `turns >= 0`; otherwise the run counts toward `total` and contributes no
value. Per model, the sample unit is the attempt; per agent and overall, the
sample unit is the run (sum over its attempts).

- **Given** a run whose `modelAttempts` has two entries and only one reports
  `usage.turns`
- **When** the turns stat is computed
- **Then** the run contributes no sample, `total` still counts it, and coverage
  becomes `partial`

### R8 — Three failure modes, counted separately

Trouble MUST be reported as three independent tallies, never merged into one
"failures and retries" number:

1. **Run failure** — `exitCode !== 0`, with `exitCode` a finite number.
2. **Model fallback** — more than one entry in `modelAttempts`.
3. **Process rerun** — a `run-N` directory with `N > 0` under the same `runId`.

Each tally MUST carry its own `undetermined` count and its own coverage: a
missing or malformed `exitCode` makes the failure tally undetermined without
touching the other two, and symmetrically. The report MUST expose the highest
observed `run-N` index. An undetermined run MUST NEVER be counted as a success,
as a non-fallback, or as a non-rerun.

- **Given** an artifact whose `exitCode` is missing, on a run that has a `run-3`
  directory and a single `modelAttempts` entry
- **When** outcomes are counted
- **Then** the failure tally increments `undetermined` and its coverage becomes
  `partial`, the fallback tally records a non-fallback with `complete` coverage,
  and the rerun tally records one rerun with `maxRunIndex` at least `3`

### R9 — Unattributable models keep their money

A transcript message whose model cannot be resolved — no preceding `model_change`
event, or a `model_change` never followed by a message — MUST be attributed to a
`null` model bucket. Its cost MUST still count toward run and partition totals.
The system MUST NOT distribute unattributed cost across known models.

- **Given** a transcript with messages before any `model_change` event
- **When** the per-model breakdown is produced
- **Then** a `null`-model entry carries those figures, per-model coverage is
  `partial`, and no known model absorbs them

### R10 — Bounded, non-throwing reads

The store MUST NOT throw for any filesystem or parse condition. Scan-count,
per-file byte and per-run message limits MUST be explicit constants. Exceeding a
limit MUST degrade the affected record to a truncated state that yields `partial`
coverage; it MUST NOT silently drop the record.

- **Given** a transcript whose final line is truncated mid-write
- **When** the corpus is read
- **Then** the parsed lines are kept, the transcript is marked `partial`, the
  unparsed line is counted, and the run's coverage is `partial`

### R11 — Deterministic output

For identical corpus input the report MUST be byte-identical: fixed key order,
models sorted by name with the `null` bucket last, agents sorted by name with the
`null` bucket last. `[CORE]` MUST NOT read a clock or a locale; the snapshot's
`generatedAt` enters as corpus data supplied by the store (R13).

- **Given** the same corpus read twice
- **When** both reports are serialised
- **Then** the two serialisations are equal

### R12 — Read-only query surface

The command MUST render the aggregate produced by the modules above and nothing
else: no computation, no filtering logic, no persistence, no write to the session
store. Every printed figure MUST show its coverage; an `unknown` figure MUST be
printed as unknown and never as `0`.

- **Given** a project whose runs have no cost data
- **When** the command runs
- **Then** the cost line reads as unknown with its coverage, and no `0` is shown

### R13 — The report identifies its snapshot

The corpus grows continuously, so two reports are only comparable if each says
which corpus it saw. The report MUST carry a snapshot identity block with at
least: generation timestamp, the minimum and maximum corpus timestamps observed,
sessions and transcripts examined, artifacts found, files corrupt or absent, runs
attributed versus unattributable, and the store's `discovery` counters
(`scanned`, `skipped`, `scanLimitExceeded`). Any field that cannot be determined
MUST be reported as unknown, never as `0`.

- **Given** a corpus whose transcripts carry no readable timestamp
- **When** the report is generated
- **Then** the identity block reports the corpus interval as unknown, still
  reports the artifacts counted and the discovery counters, and no field is
  filled with `0` to stand in for a value that was not determined

## C. Decisions

### C.1 Two modules, because `[CORE]` cannot do I/O

`session-accounting.ts` carries the `[CORE]` header and imports nothing from
`node:fs`; `session-accounting-store.ts` owns every syscall and the clock. That
split is what lets the interesting logic (coverage, precedence, percentiles,
taxonomy) be tested on plain objects, and it is why APPLY can ship slice 1
complete before any fixture filesystem exists. The store exposes a composed
entry point — the `evaluateWorkspaceLedger` pattern — so the command has one
call site:

```
readSessionCorpus(options)   -> SessionCorpus     // I/O only
buildAccountingReport(corpus) -> AccountingReport // pure, [CORE]
readAccountingReport(options) -> AccountingReport // composition, store module
```

The sessions root is resolved **per call**, not at module load:
`join(process.env.EIN_PI_AGENT_HOME ?? AGENT_DIR, "sessions")`. `AGENT_DIR` is
captured when its module loads, and tests move the home between cases — this is
the exact bug `sessions.ts` already documents and avoids.

### C.2 The data contract between store and core

Shapes are `Readonly`, every absent value is `| null` rather than defaulted, and
everything from disk enters as `unknown`, narrowed by local predicates
(`isRecord`, `finiteNonNegative`, `nonEmptyString`) as in `reviewed-area-ledger.ts`.

```
Provenance   = "transcript" | "artifact" | "tree"
RunRole      = "parent" | "subagent"
SampleUnit   = "run" | "run-model" | "attempt"

RunRef       = { project: string; sessionId: string; role: RunRole;
                 runId: string | null; runDir: string | null;
                 runIndex: number | null }      // N of run-N; N > 0 = process rerun

UsageSample  = { input: number | null; output: number | null;
                 cacheRead: number | null; cacheWrite: number | null;
                 total: number | null;          // usage.totalTokens when reported
                 cost: number | null }          // null = field absent, NOT zero

TranscriptMessage = { model: string | null; timestamp: string | null;
                      usage: UsageSample }

ArtifactAttempt   = { model: string | null; usage: UsageSample | null;
                      turns: number | null }

ArtifactRecord    = { agent: string | null; exitCode: number | null;
                      attemptedModels: readonly string[];
                      attempts: readonly ArtifactAttempt[] | null;
                      integrity: "ok" | "corrupt" }

RunObservation    = { ref: RunRef;
                      transcript: "present" | "partial" | "missing" | "unreadable";
                      messages: readonly TranscriptMessage[];
                      artifact: ArtifactRecord | null }

Discovery         = { scanned: number; skipped: number;
                      scanLimitExceeded: boolean }

SessionCorpus     = { store: "present" | "absent";
                      generatedAt: string;      // ISO-8601; the store owns the clock
                      runs: readonly RunObservation[];
                      counts: { sessions: number; transcripts: number;
                                artifacts: number; corrupt: number;
                                missing: number };
                      discovery: Discovery }
```

The result side, where coverage is structural rather than decorative:

```
Coverage = { status: "complete" | "partial" | "unknown";
             attributed: number; total: number;
             provenance: readonly Provenance[] }        // sorted, deduped

Sources  = { reported: number; derived: number }   // per-sample origin

Stat     = { status: "known"; unit: SampleUnit; n: number; mean: number;
             p95: number; max: number; sources: Sources; coverage: Coverage }
         | { status: "unknown"; unit: SampleUnit; n: 0;
             sources: Sources; coverage: Coverage }

Total    = { status: "known"; value: number; coverage: Coverage }
         | { status: "unknown"; coverage: Coverage }

Known<T> = { status: "known"; value: T } | { status: "unknown" }

Tally    = { count: number; undetermined: number; coverage: Coverage }

Outcomes = { failures: Tally; modelFallbacks: Tally; processReruns: Tally;
             maxRunIndex: Known<number> }

ChannelUse = { transcript: number; artifact: number; unattributed: number }

Slice    = { runs: number; cost: Total; outputTokens: Total;
             peakPromptTokens: Stat; peakSequenceTokens: Stat;
             turnsPerRun: Stat; outcomes: Outcomes;
             channels: ChannelUse; coverage: Coverage }

ModelAccounting = { model: string | null } & Slice
AgentAccounting = { agent: string | null } & Slice

Snapshot = { generatedAt: string;
             corpusFrom: Known<string>; corpusTo: Known<string>;
             sessions: Known<number>; transcripts: Known<number>;
             artifacts: Known<number>;
             corruptFiles: number; missingFiles: number;
             runsAttributed: number; runsUnattributable: number;
             discovery: Discovery }

AccountingReport = { schemaVersion: 1;
                     store: "present" | "absent";
                     snapshot: Snapshot;
                     overall: Slice;
                     partition: { parent: Slice; subagent: Slice };
                     byModel: readonly ModelAccounting[];
                     byAgent: readonly AgentAccounting[];
                     coverage: Coverage }
```

`model: string | null` rather than a `"unattributed"` sentinel: a string literal
unioned with `string` collapses to `string` and the compiler would stop helping.
The `null` bucket is a real, sortable, last-ordered entry.

`Total`, `Stat` and `Known<T>` are discriminated unions, so an unknown figure has
no `value` field to read. The type system, not a convention, prevents printing a
phantom `0` — including for the snapshot fields R13 may not determine.

`sources` says where each sample came from: `reported` when the corpus stated the
figure, `derived` when it was computed from components. Only `peakSequenceTokens`
mixes both (`usage.totalTokens` vs. the summed turn); keeping the field uniform
across stats costs two integers and removes a special case.

### C.3 The coverage and provenance model — the core of the change

Three corpus facts made this structural rather than decorative: artifacts sum
~$68 while the tree partition sums ~$137 (artifacts are a **sample**, not a
census); ~$73 is unattributable to any model; some runs have no transcript at all.

Hence the single-channel rule (R3) plus `ChannelUse`, so the $68/$137 gap reads
as "artifacts covered N of M runs" rather than as a discrepancy or a $205 sum.
Hence `tree` as a structural-only provenance (R2): it says which runs exist and
which are children, never how many tokens they cost, but it stays in the enum
because an unreadable project directory makes the partition `partial` even when
every figure inside is `complete`. Hence the `null`-model bucket (R9): spreading
unattributed money pro rata would produce exactly the credible-and-false number
this change exists to prevent.

Coverage derivation is a single function with three branches (R1) — the only
place `complete` can be produced — and `attributed === 0` yields `unknown` even
when `total === 0`: an empty corpus is not perfectly measured.

### C.4 Metric definitions, unambiguous

| metric | source | sample unit | rule |
| --- | --- | --- | --- |
| peak prompt tokens | transcript | run (per model: run-model) | `max(input + cacheRead + cacheWrite)` over one message; a message missing any of the three is ineligible |
| peak sequence tokens | transcript | run (per model: run-model) | `usage.totalTokens` when reported (`sources.reported`), else `input + cacheRead + cacheWrite + output` (`sources.derived`); missing any summand with no reported total → ineligible |
| turns per run | `modelAttempts[].usage.turns` | run (per model: attempt) | run contributes only if **every** attempt reports turns |
| run failures | `exitCode !== 0` | run | non-numeric `exitCode` → `undetermined` in this tally only |
| model fallbacks | `modelAttempts.length > 1` | run | missing `modelAttempts` → `undetermined` in this tally only |
| process reruns | `run-N` directory, `N > 0` | run | unparseable index → `undetermined`; corpus today: 25 rerun runs, deepest `run-9` |
| output tokens | transcript, else artifact | run | same single-channel precedence as cost |
| cost | `message.usage.cost.total`, else `usage.cost.total` | run | derived and optional; `0` is a valid measured value, absent is `unknown` |
| parent/subagent | tree structure | run | parent = `<project>/<ts>_<uuid>.jsonl`; child = `<project>/<ts>_<uuid>/<runId>/run-N/session.jsonl` |

Peak prompt sizes what must be resident before generation; peak sequence sizes
what the KV cache holds at the end of the turn. A single "context window" number
would answer neither question honestly, which is why R6 splits them.

Turns carry two sample units on purpose, and every `Stat` prints its `unit`: an
attempt has exactly one model, so per-model turns can only be an attempt
statistic, while "turns per run" for an agent must sum the run's attempts.

### C.5 The percentile rule

**Nearest-rank, no interpolation.** Sort ascending, take
`index = clamp(ceil(p / 100 * n) - 1, 0, n - 1)`.

- `n = 0` → `status: "unknown"`. No `mean`, no `p95`, no `max`.
- `n = 1` → `mean = p95 = max = ` the single observation.
- `n = 2` → `ceil(0.95 * 2) - 1 = 1` → `p95 = max`. Expected, tested, documented.
- Generally `p95 = max` for all `n < 20`: a property of nearest-rank, not a bug.

Interpolation (linear, R-7, Excel) was rejected because at n=2 it invents a value
never observed — the same class of error as reporting a missing cost as `0`.
Since `p95 = max` below n=20 is easy to misread as significance, `n` is required
on every `Stat` and printed next to the figure: the consumer decides whether two
samples justify buying hardware, the module refuses to hide that it was two.
`mean` is the plain arithmetic mean, unrounded in `[CORE]`; rounding is rendering.

### C.6 Store layout, boundaries and bounds

- Root: `join(process.env.EIN_PI_AGENT_HOME ?? AGENT_DIR, "sessions")`, per call.
- Parent transcript: `<root>/<project>/<ts>_<uuid>.jsonl`.
- Subagent transcript: `<root>/<project>/<ts>_<uuid>/<runId>/run-N/session.jsonl`.
- Artifacts: `<root>/<project>/subagent-artifacts/<runId>_<agent>_meta.json`
  (319 in the corpus today).
- The `run-N` segment is parsed into `RunRef.runIndex` by an anchored
  `/^run-(\d+)$/`. `N > 0` is a process rerun (R8) — 25 in the corpus, deepest
  `run-9`. A directory that does not match yields `runIndex: null`, which counts
  as `undetermined` in the rerun tally and never as "not a rerun".
- `subagent-artifacts` is **not** a session directory and is excluded from the
  tree walk. Missing that exclusion would invent phantom runs.
- Project membership is decided by the parent transcript's own `cwd` field, never
  by the encoded directory name — `sessions.ts` already documents that those
  encodings are lossy and can collide. Children inherit their parent's project.
- The store owns the clock and the census: it stamps `generatedAt`, counts
  sessions, transcripts, artifacts, corrupt and missing files, and passes
  `discovery` through to the corpus so R13 can report it. `[CORE]` derives the
  corpus interval from the message timestamps it is given, never from the
  filesystem.
- Bounds: `MAX_PROJECTS_SCANNED`, `MAX_RUNS_SCANNED`, `MAX_TRANSCRIPT_BYTES`,
  `MAX_MESSAGES_PER_RUN`. Hitting one marks the record truncated → `partial`.
- Parsing is line-by-line. An unparseable line is counted and skipped, the
  transcript becomes `"partial"`, and the run is not abandoned — a live session's
  last line is routinely half-written.
- Model attribution walks the stream carrying the last `model_change` model.
  Messages before the first such event have `model: null`. A `model_change` with
  no following message contributes nothing at all.
- The store never throws. Every `ENOENT`, `EACCES`, symlink, non-file or decode
  failure becomes a status on a record.

### C.7 The spec delta is extended (reverses the earlier "no extension")

An earlier revision kept the delta at `added=4`, arguing the new requirements were
refinements. R8's third failure mode broke that: process reruns are observable
behaviour no existing scenario accepts, and the same is true of per-model
attribution, output tokens, snapshot identity and the query surface that scope
already promises. A delta that does not accept behaviour the change ships is a
gate that cannot fail.

The delta therefore becomes **1 MODIFIED + 7 ADDED** (11 scenarios total):

| op | scenario | why |
| --- | --- | --- |
| MODIFIED | `peak-context-window-per-model` | one ambiguous "window" → peak prompt + peak sequence (R6) |
| ADDED | `snapshot-identity-in-report` | R13; makes two reports comparable |
| ADDED | `single-channel-cost-attribution` | R3; the $68/$137 gap |
| ADDED | `unattributable-model-cost-bucket` | R9; the `null` bucket |
| ADDED | `output-tokens-per-model` | promised by scope, unaccepted today |
| ADDED | `run-failure-taxonomy` | R8; three tallies, three coverages |
| ADDED | `process-rerun-counting` | R8.3; `run-N`, N>0 |
| ADDED | `accounting-query-command` | R12; read-only rendering surface |

The other three canonical scenarios are unchanged and are re-declared verbatim,
because the delta file is rebuilt from the full operation set. This phase has no
shell, so the operations are written out for the coordinator to apply through
`cc-ein-sdd delta` + sync before APPLY starts; the design does not edit
`specs/agent-accounting/spec.md` or `sync-report.md` directly.

The command boundary still holds: anything beyond rendering — filters, flags that change what is computed,
persistence, a written report file — is further new behaviour and must go through
sync, not be improvised in the extension.

### C.8 Alternatives rejected

| alternative | why rejected |
| --- | --- |
| One module doing read + aggregate | A `[CORE]` module cannot do I/O, and the whole logic would then need a fixture filesystem to test. |
| A single "peak context window" figure | Ambiguous between prompt residency and end-of-turn cache size; sizing a local model needs both numbers. |
| One "failures and retries" counter | Merges three independent signals; a run that reruns nine times is not a model fallback. |
| `[CORE]` reading the clock for `generatedAt` | Breaks R11 determinism. The store stamps it and passes it as data. |
| Sum artifact cost + transcript cost | Double-counts the same subagent runs; would report ~$205 for ~$137 of spend. |
| Treat missing cost as `0` | Turns a gap into a measurement. The exact failure mode this change exists to prevent. |
| Distribute unattributed cost pro rata | Invents attribution. Produces a per-model table that is precise and wrong. |
| Interpolated percentiles | Manufactures unobserved values at n=2, where the sample is smallest and the temptation to over-read is greatest. |
| Drop runs with partial data | Silently shrinks the denominator, making coverage look better than it is. Partial data stays in `total`. |
| Cache the report on disk | Adds state, staleness and a write path to a read-only feature. |
| A `"unattributed"` string sentinel for model | Collapses to `string` under union; the compiler stops distinguishing it. `null` does not. |

## D. Success Criteria

APPLY runs in two slices; each slice is only done when its own gates and checks
pass. Gates 1-3 run on both slices, so slice 2 re-proves slice 1.

### Tool-verifiable gates

1. `bun run typecheck` (root) passes — covers `ein-pi/` and `cc-ein/`.
2. `cd installer && bun run typecheck` passes.
3. `bun test` passes with no pre-existing test broken.
4. Slice 1: `bun test tests/session-accounting.test.ts`; slice 2 adds
   `tests/session-accounting-store.test.ts`. Both written RED-first (strict TDD).
5. Style/`[CORE]` contract tests stay green: `session-accounting.ts` carries the
   `[CORE]` header block and imports nothing from `node:fs` / `node:path` I/O.

### Slice 1 — aggregator (`tests/session-accounting.test.ts`, pure fixtures)

- Empty corpus → every figure `status: "unknown"`, coverage `unknown`,
  `attributed: 0`; no figure equals `0`; snapshot fields unknown, not `0` (R13).
- All-zero explicit costs → `status: "known"`, `value: 0`, coverage `complete`
  (the local-model case is success, not failure).
- Run with both transcript and artifact cost → counted once, channel
  `transcript`, artifact figure not added.
- Both cost paths (`message.usage.cost.total` and `usage.cost.total`) attribute.
- Messages with no resolvable model → `null` bucket holds the cost, per-model
  coverage `partial`, known models unchanged.
- Peaks (R6): prompt sample = the three-component sum; sequence sample =
  `usage.totalTokens` when present (`sources.reported`) and the four-component
  sum when absent (`sources.derived`); a message missing `output` is ineligible
  for sequence yet still eligible for prompt; the two stats carry independent
  coverage.
- Percentiles: `n=0` → unknown; `n=1` → mean = p95 = max = the value; `n=2` →
  p95 = max; a ≥20-sample vector matches hand-computed nearest-rank.
- Turns: a run with one attempt missing `usage.turns` contributes no sample and
  keeps counting in `total`.
- Outcomes (R8): missing `exitCode` → `failures.undetermined` only, with
  `modelFallbacks` and `processReruns` untouched; two `modelAttempts` → one
  fallback; `runIndex: 3` → one rerun and `maxRunIndex` ≥ 3; `runIndex: null` →
  `processReruns.undetermined`.
- Snapshot (R13): corpus interval derived from the given message timestamps;
  no readable timestamp → interval unknown while counts stay reported;
  `discovery` is carried through unchanged from `SessionCorpus`.
- Coverage arithmetic: `attributed === total > 0` → complete; `0 < attributed <
  total` → partial; `attributed === 0` → unknown, including `total === 0`.
- Determinism: two serialisations of the same corpus (same `generatedAt`) are
  byte-identical; model and agent ordering puts the `null` bucket last.
- `tree` never appears as the provenance of a cost or token figure.

### Slice 2 — store and command

Store (`tests/session-accounting-store.test.ts`, temp-dir fixtures):

- Nonexistent sessions root → `store: "absent"` (distinct from an empty store).
- `EIN_PI_AGENT_HOME` moved between cases is honoured (per-call resolution).
- Parent/child paths classify correctly; `subagent-artifacts/` is not walked as a
  session directory.
- `run-N` parsing: `run-0` → `runIndex: 0`; `run-9` → `9`; a non-matching name →
  `null`. Counts and `discovery` reach the corpus; `generatedAt` is set.
- Run without `session.jsonl` → `transcript: "missing"`, run still present.
- Truncated final line → `transcript: "partial"`, earlier lines kept.
- Corrupt `meta.json` → `integrity: "corrupt"`, counted in `counts.corrupt`, no
  throw; `meta.json` without `modelAttempts` / `usage` → nulls, no throw.
- Unreadable file (permission or non-file) → `"unreadable"`, no throw.
- Bound exceeded → truncated flag set, records not silently dropped.

Command:

- One `pi.registerCommand` block in `ein-pi/agent/extensions/ein-ai.ts`,
  following the existing shape; renders only, no aggregation in the extension.
- Prints the snapshot identity header first, then the figures; an unknown figure
  prints as unknown with its coverage, never as `0`; `n` accompanies every
  percentile; peak prompt and peak sequence are labelled distinctly.

### Manual check on real data (after slice 2)

Run the command against the real `~/.pi-ein/agent/sessions/` corpus and confirm:
the snapshot reports the 319 artifacts and a bounded corpus interval; the
$68-vs-$137 gap reads as artifact-channel coverage, never as a contradiction and
never as a $205 total; the rerun tally surfaces the 25 rerun runs with
`maxRunIndex: 9`.

---

Design does not slice tasks and does not run tests. `sdd-apply` owns RED-GREEN
execution under strict TDD; the two typecheck gates and `bun test` are the exit
conditions.
