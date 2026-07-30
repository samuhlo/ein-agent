# Map — structured SDD cost provenance

status: completed
scope_status: bounded
change: sdd-cost-ledger-provenance
phase: map
skill_resolution: paths-injected
budget_exceeded: true

ledger:
  reads:
    - { path: /home/samuhlo/.pi/agent/skills/local/branch-pr/SKILL.md, lines: 156, estimated_tokens: 1300 }
    - { path: /home/samuhlo/.pi/agent/skills/local/cognitive-doc-design/SKILL.md, lines: 47, estimated_tokens: 550 }
    - { path: /home/samuhlo/.pi/agent/skills/downloaded/drizzle/SKILL.md, lines: 300, estimated_tokens: 2900 }
    - { path: /home/samuhlo/.pi/agent/skills/local/ein-discipline/SKILL.md, lines: 101, estimated_tokens: 1250 }
    - { path: /home/samuhlo/.pi/agent/skills/downloaded/pinia/SKILL.md, lines: 43, estimated_tokens: 500 }
    - { path: codegraph:explore:cost-ledger-end-to-end, lines: 500, estimated_tokens: 3500 }
    - { path: openspec/changes/sdd-cost-ledger-provenance/scope.md, lines: 61, estimated_tokens: 1050 }
    - { path: docs/sdd-cost-plan.md, lines: 180, estimated_tokens: 2600 }
    - { path: tests/sdd-real-cost-provenance.test.ts, lines: 142, estimated_tokens: 1800 }
    - { path: tests/sdd-cost-block-e.test.ts, lines: 105, estimated_tokens: 1250 }
    - { path: tests/sdd-cost-block-g.test.ts, lines: 53, estimated_tokens: 700 }
    - { path: openspec/specs/sdd-lifecycle/spec.md, lines: 281, estimated_tokens: 7000 }
    - { path: openspec/changes/sdd-cost-ledger-provenance/specs/sdd-lifecycle/spec.md, lines: 12, estimated_tokens: 350 }
    - { path: codegraph:explore:router-cost-and-status, lines: 400, estimated_tokens: 2500 }
    - { path: codegraph:explore:extension-invocation-and-producer, lines: 340, estimated_tokens: 2200 }
    - { path: codegraph:explore:cost-model-and-status-rendering, lines: 430, estimated_tokens: 3000 }
    - { path: codegraph:explore:delegation-reconciliation-and-metadata, lines: 390, estimated_tokens: 2500 }
    - { path: codegraph:explore:artifact-metadata-fields, lines: 350, estimated_tokens: 1800 }
    - { path: ein-pi/agent/lib/sdd-router.ts#SddRealCost/readSddRealCost, lines: 73, estimated_tokens: 900 }
    - { path: tests/sdd-status-output.test.ts, lines: 157, estimated_tokens: 1900 }
    - { path: tests/sdd-phase-runtime-contract.test.ts, lines: 168, estimated_tokens: 2000 }
    - { path: tests/sdd-reconcile.test.ts, lines: 176, estimated_tokens: 2200 }
    - { path: ein-pi/agent/extensions/ein-ai.ts#status-and-reconciliation-hooks, lines: 95, estimated_tokens: 1100 }
    - { path: ein-pi/agent/lib/sdd-reconcile.ts, lines: 177, estimated_tokens: 2100 }
  webfetch_used: false
  budget_consumed: { tokens: 46300, reads: 24 }

> Budget was exceeded while loading required canonical context and directly connected runtime evidence. This is a bounded partial map; no further exploration was performed.

## Outcome and canonical delta

The declared `sdd-lifecycle` delta requires exact `flowId`, `changeId`, `phase`, and `runId`; timestamps; metric provenance; separate input/output/cache-read/cache-write; unavailable rather than zero; reported cost distinct from estimates; exact deduplicated membership for phase/retry/change aggregates; and preservation of the existing timeout reconciliation. It expressly excludes numeric gates and a second reconciliation design.

`branch-pr`, Drizzle, and Pinia rules are not applicable: this phase opens no PR and maps no ORM or store work. `cognitive-doc-design` was applied to make this review map scannable; `ein-discipline` applies the OpenSpec phase boundary.

## Current end-to-end path

1. The orchestrator delegates a named SDD phase through the external `pi-subagents` runtime. The local contract deliberately does **not** pass `output`/`outputMode` for direct phase delegation because relative output resolves in `.pi-subagents/` sandbox rather than the repository. Phase executors persist their canonical OpenSpec artifact themselves.
2. `ein-ai.ts` observes the local `subagent` tool call, derives one phase with `resolveDelegationPhase`, and snapshots that phase's artifact mtimes before the run.
3. The external package writes scratch run metadata under `.pi-subagents/artifacts/*_meta.json`. The only in-repo cost consumer is `readSddRealCost(cwd, change)` in `sdd-router.ts`; this repository does not own the package's metadata schema or writer.
4. On `/ein:sdd-status` and `ein_sdd_status`, `ein-ai.ts` calls `readSddRealCost` for the selected change, returns it in tool `details.realCost`, and renders `compactRealCost`. The command has the same renderer. Existing status tests duplicate the old formatter and therefore require alignment or replacement when the renderer changes.
5. If the runner reports a failed subagent result, `ein-ai.ts` uses the pre-run snapshot and `reconcilePhaseFailure`. It can convert the result to success only for exactly one new/rewritten, readable, lint-clean artifact for that phase; original error and warnings remain visible.

## Current attribution and data-loss points

| Boundary | Current behavior | Required correction |
|---|---|---|
| Invocation → external runtime | No mapped structured flow/change/run metadata is added to the subagent input. `readExplicitSddChange` can inspect direct event fields but falls back to task regex. | Generate/propagate structured identity at the local delegation boundary; external support is required for it to survive into meta files. Missing identity must make attribution unavailable/excluded, never prose fallback. |
| Meta reader | Lists every `*_meta.json`; accepts string `agent` and `task`; includes a record when `task.includes(change)`. | Replace substring matching: `feat-x` currently captures `feat-x-more` and any later task mention. Require exact structured identity and phase validation. |
| Run identity/retries | Filename is ignored; every matching file is a distinct run. Test fixtures model retries only as task text and filename suffix. | Use stable `runId` as dedupe key; retain retry/attempt identity separately so retries are auditable and aggregates name exact member runs. |
| Metrics | Reads `usage.input`, `usage.output`, `usage.cost`, `durationMs`; absent/non-number becomes `0`. | Model each field as reported, estimated, or unavailable. Preserve provider input/output/cache-read/cache-write separately, timestamp each receipt/observation, and never display unavailable as zero. |
| Cost | `usage.cost` is rendered `$0.00` when absent; no source/provenance exists. | Keep provider-reported cost separate from an explicitly labelled estimate; do not derive or label estimates as provider billing. |
| Aggregation/rendering | Change aggregate is totals plus `byAgent`, sorted by token count. It has no phase/retry grouping and no member IDs. | Build aggregates from a one-time deduped run set and expose member identity for change/phase/retry. Renderer must convey availability/provenance rather than unconditional numeric totals. |

## Exact current contracts and compatibility constraints

- `SddRealCost` is consumed by three `ein-ai.ts` call sites. Its present shape is scalar totals (`runs`, input/output, cost, duration), `byAgent`, and `problems`; changing it affects the status tool details contract as well as text rendering.
- Existing fixtures intentionally use the legacy `{ agent, task, usage: { input, output, cost, turns }, durationMs }` shape. The migration must decide an explicit compatibility outcome: legacy metadata has no structured identity and therefore cannot truthfully be attributed under the new rule. Do not silently retain task matching merely to preserve old tests.
- Status currently distinguishes phase-artifact ledger estimates from inference totals in copy, but it still calls the latter “real cost” and fills missing provider values with zero. Preserve this conceptual separation while making provenance explicit.
- `.pi-subagents/` is ignored scratch state, not canonical OpenSpec evidence. Any durable/reproducible ledger representation must be designed deliberately; this map does not prescribe its storage.
- `sdd-phase-runtime-contract.test.ts` protects direct artifact persistence and sandbox behavior. New invocation metadata must not reintroduce `output`/`outputMode` or move canonical artifact ownership to a parent fallback.

## Timeout reconciliation: preserve unchanged

The existing implementation is a single conservative reconciliation path in `sdd-reconcile.ts`, called from the `ein-ai.ts` `tool_result` hook only when a direct `subagent` result is an error:

- snapshots only canonical phase artifacts before the run;
- accepts only one changed/new artifact by strict mtime comparison;
- rejects no candidate, multiple candidates, unreadable artifacts, and lint errors;
- preserves runner error text and artifact warnings; and
- declines chain/parallel ambiguity because `resolveDelegationPhase` must resolve exactly one phase.

This handles a timeout/final-read failure after useful work without retrying and double-paying. The new ledger must associate observations without replacing, bypassing, or weakening this function. In particular, reconciled completion is not permission to merge two observations of one run: dedupe must remain identity-based.

## Minimum likely blast radius

1. `ein-pi/agent/lib/sdd-router.ts` — replace the legacy reader/types/aggregate logic and expose structured receipt/aggregate membership.
2. `ein-pi/agent/extensions/ein-ai.ts` — attach identity at delegation start if the external input supports it; consume/render the new truthful aggregate; retain snapshot/reconciliation hook unchanged.
3. External `pi-subagents` package/runtime — actual producer of `*_meta.json`; must accept and persist supplied identity, timestamp, retry/run identity, and provider usage/cache/provenance fields. This is outside this repository and is the primary integration risk.
4. `tests/sdd-real-cost-provenance.test.ts` — replace prose attribution fixtures with collision, later-mention, unavailable, provenance, cache, retry/dedupe, and reproducible-member tests.
5. `tests/sdd-status-output.test.ts` plus any direct status contract tests — update expected output/details for availability and provenance.
6. `tests/sdd-reconcile.test.ts` — regression-only coverage proving timeout reconciliation remains the same path; do not redesign it.

`docs/sdd-cost-plan.md` is historical/product rationale. Update it only if design decides documentation must no longer state or imply the legacy “real cost” semantics; it is not a runtime dependency.

## Focused verification commands for the later apply/verify phases

- `bun test tests/sdd-real-cost-provenance.test.ts`
- `bun test tests/sdd-status-output.test.ts`
- `bun test tests/sdd-reconcile.test.ts`
- `bun test tests/sdd-phase-runtime-contract.test.ts`
- `cd installer && bun run typecheck`

Not run in map phase.

## Risks and decisions needed in design

- **External producer gap:** no in-repo source establishes which `pi-subagents` metadata extension fields are accepted or whether it assigns a stable run ID. Design must inspect/package-coordinate that contract before promising end-to-end attribution.
- **Identity ownership:** `flowId` must distinguish independent SDD flows, while `runId` identifies one execution observation and retry identity identifies a new attempt. Reusing a tool-call ID blindly may fail across process/session boundaries.
- **Partial metrics:** provider schemas vary. Preserve raw provider field names/source or a documented normalized mapping and mark unsupported values unavailable; zero is valid only when provider explicitly reports zero.
- **Deduplication:** dedupe before all aggregation levels from the same stable key, then retain exact member records; never dedupe by agent, phase, filename, timestamp, or task text.
- **Status compatibility:** tool consumers may inspect `details.realCost`; version/add fields compatibly or update all internal consumers/tests together. Text must not claim provider billing when only estimates exist.
- **No gate creep:** aggregate/accounting changes must not add numeric budget enforcement.

## Next phase

Run `sdd-design` with an explicit decision on the external `pi-subagents` metadata schema/extension point, legacy-record treatment, structured identity generation, and durable receipt/aggregate representation.
