# Design — truthful SDD cost provenance

## A. Proposal

### Intent

Bind each attributable SDD subagent run to a locally owned structured identity and immutable source-byte receipt, then build truthful, reproducible cost aggregates from those receipts. Because this repository does not own `pi-subagents` or its `_meta.json` writer, Ein will observe that external boundary without adding unsupported tool input fields or changing canonical phase artifacts.

### Scope

**In:** a deterministic adapter at the existing `ein-ai.ts` before/after delegation hooks; durable local sidecars; exact flow/change/phase/run/attempt identity; timestamps; normalized metric provenance; deduplication and phase/attempt/change membership; status tool/details and human rendering; visible legacy and ingestion problems.

**Out:** changing `pi-subagents`; adding fields to its tool input or metadata schema; parsing task prose; changing phase artifact ownership; changing timeout reconciliation; pricing-table work; numeric token/cost gates; modifying historical cost claims in `docs/sdd-cost-plan.md`.

### Affected areas

| Candidate | Responsibility |
|---|---|
| `ein-pi/agent/lib/sdd-cost-provenance.ts` (new) | Own identity minting, before/after snapshots, stable source binding, sidecar persistence, metric normalization, dedupe, aggregation, and problem records. |
| `ein-pi/agent/extensions/ein-ai.ts` | Call the adapter at existing `subagent` hooks and render the returned ledger; retain the existing reconciliation call and ordering semantics. |
| `ein-pi/agent/lib/sdd-router.ts` | Remove the prose-based reader; re-export or thinly delegate the compatibility API to the provenance module. |
| `ein-pi/agent/lib/i18n/strings.ts` | Replace “real cost” copy with truthful ledger/provider/estimate/unavailable labels, if localized labels cannot use existing keys. |
| `tests/sdd-real-cost-provenance.test.ts` | Producer observation, binding, normalization, dedupe, collision, legacy, and failure coverage. |
| `tests/sdd-status-output.test.ts` | Human output and details compatibility coverage using the real formatter rather than a divergent duplicate where practical. |
| `tests/sdd-reconcile.test.ts`, `tests/sdd-phase-runtime-contract.test.ts` | Regression-only proof that reconciliation and direct phase artifact persistence remain unchanged. |

No producer package or canonical phase artifact is a candidate file.

### Canonical context

| Path | SHA-256 | UTF-8 bytes |
|---|---|---:|
| `openspec/specs/sdd-lifecycle/spec.md` | `69a39d0fffdeb64f71e29b3183cf7d7e6230b5b4efd8ecb22ff5f10a06c4a6d4` | 28,121 |

The selection remains 1 of 3 files and 28,121 of 32,768 bytes; no additional domain was needed.

### Risks

- A run that produces no uniquely changed canonical phase artifact cannot be tied to a change without guessing and will remain visibly unattributed.
- Concurrent or unrelated writers in `.pi-subagents/artifacts/` can make source selection ambiguous; the required response is exclusion, not best-effort matching.
- The current `usage.cost` field has no in-repo contract proving provider billing or estimate semantics; treating it as either would overclaim.
- Local runtime state may be deleted by users. Status must then report no local receipts rather than reconstruct identity from prose.
- Existing tool consumers may assume numeric `details.realCost.*` fields; truthful `null` values require a documented compatibility transition.
- File timestamps alone are insufficient identity. Stable reads and byte digests add I/O at delegation boundaries.

### Rollback

Remove the hook calls and new provenance module, restore the prior router export and status formatter, and delete local ledger state under `.pi/ein/sdd-cost-ledger/`. Canonical phase artifacts and `sdd-reconcile.ts` require no rollback because this design does not change them. Rollback restores legacy visibility but also restores its known untruthful attribution, so it is an operational escape only.

### Success criteria

A run is counted only after one exact phase artifact and one exact new/changed stable `_meta.json` are bound to a local identity; all other observations remain excluded with a visible reason. Every displayed total can be recomputed from its sorted member run IDs and per-run metrics without prose matching, invented zeroes, provider-cost fabrication, or reconciliation changes.

## B. Spec

### Requirement 1 — local ownership of run identity

The system **MUST** locally mint and persist `flowId`, exact `changeId`, canonical `phase`, globally unique `runId`, one-based phase `attempt`, zero-based `retryOrdinal`, `startedAt`, `endedAt`, and `observedAt`. It **MUST NOT** add unsupported identity fields to the external `subagent` input or claim that `pi-subagents` persisted them.

**Given** one direct SDD phase delegation reaches the existing hooks, **when** exactly one changed phase artifact and one external metadata candidate are observed, **then** Ein persists a complete locally owned identity and timestamps without mutating the external invocation schema.

### Requirement 2 — exact source and change binding

The system **MUST** bind a receipt to exactly one stable-read `_meta.json` basename, UTF-8 byte count, SHA-256 digest, and observed file identity, and to exactly one changed canonical artifact for the resolved phase and exact change directory. It **MUST** fail closed on zero, multiple, unstable, unreadable, mismatched, or ambiguous candidates and **MUST NOT** use task text, prefixes, substrings, filenames, agent names, or later prose as change identity.

**Given** changes `foo` and `foo-bar` exist and either task later mentions the other name, **when** metadata is ingested, **then** only the exact changed phase artifact determines `changeId`, and prose cannot add or move a receipt.

### Requirement 3 — durable flow identity

The system **MUST** create one flow manifest for one local change-directory incarnation, bind it to exact `changeId` plus filesystem directory identity, and reuse that `flowId` only while the same incarnation remains current. Missing, conflicting, or multiple matching manifests **MUST** block attribution.

**Given** an old change named `foo` is archived and a new `foo` directory is later created, **when** the new flow first binds a run, **then** it receives a different `flowId` and cannot inherit the archived flow's runs.

### Requirement 4 — normalized metric truth

For input tokens, output tokens, cache-read tokens, cache-write tokens, provider cost, estimated cost, and duration, the system **MUST** persist a discriminated value with provenance `reported`, `estimated`, or `unavailable`, plus an exact source pointer or unavailability reason. Numeric zero **MUST** be retained only when explicitly reported or estimated; missing, invalid, negative, non-finite, or unsupported fields **MUST** be unavailable. Provider cost **MUST** remain separate from estimates.

**Given** metadata reports input/output but has no supported cache or provider-billing fields, **when** it is normalized, **then** input/output are reported from their exact JSON pointers while cache and provider cost are unavailable, not zero; an estimate, if a separately supported estimator exists, remains separately labelled.

### Requirement 5 — no ambiguous cost semantics

The system **MUST NOT** classify the current unqualified `usage.cost` value as provider-reported billing or as an estimate until an owned or documented external contract establishes that meaning. It **MAY** preserve its raw pointer/digest as an ingestion problem, but **MUST** leave both normalized cost fields unavailable in the initial adapter.

**Given** a current legacy-shaped metadata file contains `usage.cost: 0.25` without source semantics, **when** it is bound or inspected, **then** status does not display `$0.25` as provider cost or estimate and exposes the semantic gap.

### Requirement 6 — dedupe and reproducible aggregation

The system **MUST** validate and deduplicate receipts before any aggregation. An identical repeated receipt for the same `runId` and source binding **MUST** count once; conflicting records for one `runId` **MUST** exclude that run with a problem. Change, phase, and attempt/retry aggregates **MUST** be computed from the same deduplicated set and **MUST** expose sorted exact `memberRunIds`.

**Given** status reads duplicate observations or conflicting sidecars, **when** it aggregates, **then** no run is counted twice, conflicts are visible, and selecting the listed member IDs reproduces every accepted aggregate exactly.

### Requirement 7 — aggregate availability

An aggregate metric **MUST** be `unavailable` with `value: null` when any member lacks that metric, rather than presenting a partial subtotal as a total. When every member is available, it **MUST** be `reported` if all members are reported and `estimated` if any member is estimated. Provider-cost aggregates **MUST NOT** include estimated-cost values.

**Given** two phase members have reported input and only one has cache-read data, **when** the phase aggregate is rendered, **then** input is summed as reported and cache-read is unavailable; the per-run receipts still show which member lacked it.

### Requirement 8 — legacy and failed-ingestion visibility

Metadata without a valid local sidecar **MUST** be excluded from aggregates. The system **MUST NOT** backfill identity from prose and **MUST** expose bounded problem summaries for legacy, rejected, unreadable, and ambiguous observations without treating them as lifecycle blockers.

**Given** pre-migration `_meta.json` files mention an exact change name in `task`, **when** status reads the ledger, **then** they remain excluded and status reports legacy metadata with no structured binding.

### Requirement 9 — status compatibility and rendering

`ein_sdd_status` **MUST** retain `details.status`, `details.activeChanges`, `details.plan`, and the `details.realCost` slot during migration; it **SHOULD** also expose the same versioned object as `details.costLedger`. Deprecated scalar fields **MUST** be `null` when unavailable, `costUsd` **MUST** alias only complete provider-reported cost, and the new object **MUST** expose receipts, metric provenance, aggregates, member IDs, and problems. Human output **MUST** distinguish reported provider cost, estimates, and unavailable values and **MUST NOT** call the ledger “real cost.”

**Given** a status consumer uses lifecycle fields and a human views partial metrics, **when** status is returned, **then** lifecycle fields remain compatible while the ledger renders `n/a`/provenance truthfully and the details object provides reproducible membership.

### Requirement 10 — reconciliation and gates remain unchanged

The provenance adapter **MUST** observe the original tool result independently and **MUST NOT** alter, replace, bypass, or broaden `reconcilePhaseFailure`. The existing strict-mtime, exactly-one-artifact, readable, lint-clean reconciliation remains the sole authority for converting a failed runner result. This slice **MUST NOT** introduce numeric token or cost gates.

**Given** a runner errors after writing one valid phase artifact, **when** the result hook runs, **then** cost binding may record the observation and the unchanged reconciliation path alone decides whether the phase result is converted; ledger values never affect routing or acceptance.

## C. Decisions

### Decision summary

| Decision | Choice and trade-off |
|---|---|
| External boundary | Use a local observer/adapter. The external package is not modified and no undocumented input field is invented. This sacrifices attribution for ambiguous runs in exchange for truth. |
| Module boundary | One functional module owns identity, metric parsing, persistence, dedupe, and aggregation. `ein-ai.ts` is a hook/rendering edge; `sdd-router.ts` is a compatibility facade. |
| Storage | Store versioned flow manifests, immutable run sidecars, and bounded problem records under ignored local state `.pi/ein/sdd-cost-ledger/v1/`, separate from `.pi-subagents/artifacts/`. This survives producer artifact cleanup when local Ein state remains, without changing canonical phase artifacts or versioned OpenSpec records. |
| Change proof | Resolve `changeId` from exactly one new/rewritten canonical artifact for the resolved phase. A run with no such artifact is unattributable; a unique active change alone is not proof of intent. |
| Flow proof | Bind a flow manifest to `changeId`, normalized change path, and directory `dev`/`ino` identity. A new same-named directory starts a new flow. |
| Run/attempt | Mint UUID `runId` before delegation. Under one flow, assign `attempt = 1 + max(phase attempts)` and `retryOrdinal = attempt - 1` under serialized flow persistence. The ordinal describes execution order, not a prose-inferred causal retry. |
| Source proof | Snapshot existing `*_meta.json` byte identities before delegation; after result, stable-read candidates that are new or changed. Exactly one is required. Never parse basename/task for identity. |
| Cost semantics | Initially normalize only fields whose current shape is established in-repo (`usage.input`, `usage.output`, `durationMs`). Cache metrics are unavailable. `usage.cost` is semantically ambiguous and excluded from both provider and estimate fields with a problem. |
| Aggregation | Sidecars are the local receipt of record. Validate/dedupe once, then derive every grouping with explicit sorted members. No aggregate silently uses currently mutated producer bytes. |
| Status migration | Keep outer lifecycle/details keys; add a versioned ledger and nullable deprecated aliases. Truth is preferred over preserving misleading numeric zeroes. |

### Data shapes

Illustrative TypeScript contract (field names may be refined during apply, semantics may not):

```ts
type Provenance = "reported" | "estimated" | "unavailable";
type Metric =
  | { value: number; provenance: "reported" | "estimated"; source: { artifactSha256: string; jsonPointer: string } }
  | { value: null; provenance: "unavailable"; reason: string };

type FlowManifestV1 = {
  schemaVersion: 1;
  flowId: string;
  changeId: string;
  changeDirectory: { relativePath: string; dev: string; ino: string };
  createdAt: string;
};

type RunReceiptV1 = {
  schemaVersion: 1;
  identity: {
    flowId: string;
    changeId: string;
    phase: "scope" | "map" | "design" | "tasks" | "apply" | "verify" | "close";
    runId: string;
    attempt: number;
    retryOrdinal: number;
  };
  timestamps: { startedAt: string; endedAt: string; observedAt: string };
  producerArtifact: {
    relativePath: string;
    basename: string;
    byteCount: number;
    sha256: string;
    fileIdentity: { dev: string; ino: string; mtimeMs: number };
    agent: string | null; // informational only; never attribution identity
  };
  phaseArtifact: { relativePath: string; byteCount: number; sha256: string };
  metrics: {
    inputTokens: Metric;
    outputTokens: Metric;
    cacheReadTokens: Metric;
    cacheWriteTokens: Metric;
    providerCostUsd: Metric;
    estimatedCostUsd: Metric;
    durationMs: Metric;
  };
  problems: string[];
};

type AggregateV1 = {
  key: { flowId: string; changeId: string; phase?: string; attempt?: number; retryOrdinal?: number; agent?: string };
  memberRunIds: string[];
  metrics: RunReceiptV1["metrics"];
};

type SddCostLedgerV1 = {
  schemaVersion: 1;
  flow: FlowManifestV1 | null;
  runs: number;
  memberRunIds: string[];
  receipts: RunReceiptV1[];
  changeAggregate: AggregateV1 | null;
  byPhase: AggregateV1[];
  byAttempt: AggregateV1[];
  byAgent: AggregateV1[]; // compatibility view, derived from the same deduped members
  problems: Array<{ code: string; message: string; count?: number }>;
  // Migration aliases only: never fabricated.
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
};
```

`source.jsonPointer` is an allowlisted documented pointer, never a guessed provider field. Sidecars persist normalized values plus the exact source digest, so a later task edit, metadata rewrite, or producer cleanup cannot change an existing aggregate.

### State transitions

1. **Ignored:** non-SDD or multi-phase delegation; no identity claim is made.
2. **Observing:** before delegation, resolve exactly one canonical phase, mint `runId`/`startedAt`, snapshot phase artifacts and stable external metadata identities, and retain observation state by `toolCallId`.
3. **Candidate resolution:** after delegation, record `endedAt`/`observedAt`; independently find changed phase artifacts and new/changed stable metadata files.
4. **Rejected:** if either side is zero, multiple, unreadable, unstable, or mismatched, write a bounded problem record and no run receipt. Unbound metadata remains legacy/unattributed.
5. **Flow bound:** resolve or atomically create exactly one flow manifest for the exact change-directory incarnation; conflict rejects.
6. **Persisted:** allocate the phase attempt under serialized flow persistence and atomically create the immutable run sidecar. Existing identical source binding is idempotent; conflicting ownership rejects.
7. **Aggregated:** load valid sidecars for the current flow, reject unsupported/conflicting records, dedupe by `runId`, sort membership, then derive change/phase/attempt aggregates.
8. **Rendered:** expose the same ledger to tool details and human formatting. Problems affect accounting visibility only, never lifecycle routing.

The existing `tool_result` reconciliation runs after observation using its current snapshot, candidate, lint, and result-rewrite rules. Provenance does not make reconciliation decisions.

### Failure matrix

| Condition | Receipt | Aggregate/status behavior |
|---|---|---|
| Phase resolves to zero or multiple phases | None | Ignore as unsupported delegation; no phase identity guessed. |
| Zero changed phase artifacts | None | Record `change-unresolved`; run is unattributed. |
| Multiple changed phase artifacts | None | Record `change-ambiguous`; name candidates only as diagnostics. |
| Zero new/changed metadata candidates | None | Record `producer-meta-missing`. |
| Multiple metadata candidates | None | Record `producer-meta-ambiguous`; bind none. |
| Metadata changes during stable read | None | Record `producer-meta-unstable`; retry is a later explicit delegation, not an automatic read loop. |
| Flow manifest missing | Create atomically | Continue only after exact directory identity is persisted. |
| Flow manifest conflict/duplicate | None | Exclude and report `flow-ambiguous`. |
| Sidecar write collision with identical bytes | Existing receipt reused | Count once. |
| Same `runId` or source file identity conflicts | Conflicting run excluded | Visible dedupe/conflict problem; no winner chosen. |
| Missing/invalid metric | Receipt retained | That field is unavailable; aggregate becomes unavailable if it includes the member. |
| Unqualified `usage.cost` | Receipt retained | Both cost fields unavailable; semantic problem visible. |
| Legacy metadata without sidecar | None | Excluded; bounded legacy count/problem visible; no prose fallback. |
| Local ledger absent/deleted | None | “No attributable receipts”; never reconstruct from external task text. |
| Runner error with valid artifact | Independent receipt possible | Existing reconciliation alone decides phase success. |
| Any token/cost threshold exceeded | Unchanged | No gate exists in this slice. |

### Migration and compatibility

- No legacy backfill is permitted: old metadata lacks exact structured identity.
- Existing metadata remains readable only as evidence that legacy records exist; it contributes no metrics.
- New receipts start opportunistically with the first unambiguous post-delegation observation.
- `readSddRealCost` and `SddRealCost` may remain deprecated exports delegating/aliasing the new versioned ledger so in-repo imports migrate without duplicate parsing.
- `details.realCost` remains present for compatibility and `details.costLedger` becomes the preferred name. Legacy scalar aliases return a complete value or `null`; `costUsd` never carries an estimate.
- `status`, `activeChanges`, `plan`, phase routing, and command behavior remain unchanged. Accounting problems are visible warnings, not `nextRecommended` blockers.
- Unknown sidecar schema versions are excluded with a problem; they are never partially interpreted.

### Delta correction required later

The current delta is directionally correct but too shallow: “runs include structured metadata” can be read as requiring unsupported producer fields and it does not define local ownership, ambiguous-candidate failure, legacy exclusion, aggregate availability, or status compatibility. During spec synchronization, without changing domains, refine `openspec/changes/sdd-cost-ledger-provenance/specs/sdd-lifecycle/spec.md` to state exactly that:

1. when the external producer cannot persist identity, the local hook adapter **MUST** mint it and bind exactly one stable new/changed metadata artifact plus one exact changed phase artifact;
2. zero/multiple/unstable candidates **MUST** fail closed and task prose **MUST NOT** be a fallback;
3. unqualified `usage.cost` **MUST NOT** be provider cost or estimate;
4. incomplete aggregate metrics **MUST** be unavailable and every grouping **MUST** list exact deduplicated members; and
5. legacy records are excluded with visible problems while status compatibility, reconciliation, and the absence of numeric gates remain explicit.

Do not edit the delta in this phase.

### Alternatives rejected

- **Modify `pi-subagents` metadata writer:** external ownership; unavailable in this repository and would make this slice non-deliverable.
- **Inject `flowId`/`changeId`/`runId` into tool input:** no established external schema support; violates the boundary contract.
- **Continue task matching with exact regex:** still prose-derived and vulnerable to later mentions; cannot establish flow/run identity.
- **Use metadata basename or timestamp as run/change identity:** producer naming is not owned and timestamps collide or drift.
- **Aggregate directly from `_meta.json` on every status:** later rewrites/prose and producer cleanup would change history.
- **Store cost inside `scope.md`, `map.md`, or other canonical phase artifacts:** changes phase ownership and contaminates lifecycle evidence.
- **Treat missing metrics as zero or sum partial members:** creates false totals.
- **Add a pricing estimator now:** no requested pricing contract and no gate needs it; YAGNI.
- **Refactor timeout reconciliation into the ledger:** duplicates responsibility and risks the existing conservative behavior.

## D. Success Criteria

The change is acceptable only when all of the following are observable:

- `foo` and `foo-bar` produce disjoint receipts and aggregates even when either name appears in the other's task or later metadata prose.
- One run receipt exposes complete flow/change/phase/run/attempt identity, three timestamps, phase-artifact binding, and producer basename/byte count/SHA-256 binding.
- Zero, multiple, unstable, or ambiguous metadata/change candidates create no attributable receipt and surface a deterministic problem.
- Re-reading status, duplicate sidecars, and timeout reconciliation observations do not increase a run's count; conflicting duplicate identity excludes the run.
- Every change, phase, and attempt/retry aggregate lists sorted exact member run IDs, and recomputing from those receipts yields the same metrics.
- Input, output, cache read, and cache write are separate. Missing values and incomplete aggregates are `unavailable`/`null`, while explicitly reported zero remains zero.
- Provider cost and estimated cost are separate; current unqualified `usage.cost` is not shown as either.
- Legacy `_meta.json` records are excluded without task/prose fallback and produce a visible bounded warning.
- `ein_sdd_status` retains lifecycle detail keys and the `realCost` migration slot, exposes the versioned ledger, and human output no longer labels inference accounting as “real cost.”
- Accounting warnings do not change `nextRecommended`, acceptance, close readiness, or any numeric gate because no numeric gate is added.
- The existing reconciliation regression cases still prove strict mtime, exactly one changed artifact, readable/lint-clean content, original error visibility, and no chain/parallel ambiguity.

Known later-phase verification commands (not run during design):

```bash
bun test tests/sdd-real-cost-provenance.test.ts
bun test tests/sdd-status-output.test.ts
bun test tests/sdd-reconcile.test.ts
bun test tests/sdd-phase-runtime-contract.test.ts
cd installer && bun run typecheck
```
