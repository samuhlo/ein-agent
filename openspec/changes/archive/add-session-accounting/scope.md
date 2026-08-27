# Scope: add-session-accounting

## Change Summary

Add deterministic session accounting module to Ein that aggregates cost, context window, token usage, and model attribution across Pi agent runs. This enables measurement of computational budgets independent of cloud provider pricing, with explicit coverage reporting and fail-closed error handling for incomplete data.

**Change focus**: Core logic only (ein-pi/agent/lib/), reading already-persisted session metadata and transcripts; no UI, no new instrumentation, no model-config changes.

## Constraints & Standards

- **Stack**: Bun, TypeScript strict (no `any`, `type` over `interface`, no `as` assertions except where unavoidable)
- **Determinism**: Pure logic in `ein-pi/agent/lib/<module>.ts` with mirror test in `tests/<module>.test.ts`
- **Naming**: kebab-case for files/dirs; English code + Spanish comments
- **Error handling**: FAIL-CLOSED — unknown/partial states, never 0 or false census
- **Typecheck**: Two gates — `bun run typecheck` at root and `cd installer && bun run typecheck` must both pass
- **Testing**: Bun test runner; strict TDD (all logic has tests before application)
- **Lane**: micro (SCOPE → DESIGN → APPLY → VERIFY → CLOSE; no MAP, no TASKS)

## Scope: What Is In

1. **Two modules, split by I/O** — a `[CORE]` module does no I/O, so the reader
   cannot live inside it. Precedent in-repo: `reviewed-area-ledger.ts` (logic) +
   `reviewed-area-ledger-store.ts` (I/O). DESIGN owns the exact boundary.

   a. **Aggregator** (`ein-pi/agent/lib/session-accounting.ts` [CORE]) — pure, no I/O
      - Receives already-parsed records as parameters
      - Computes metrics per agent, per model, and parent/child partition
      - Normalises both cost paths: `message.usage.cost.total` and `usage.cost.total`
      - Derives coverage (partial vs. complete) and provenance (transcript vs. artifact)

   b. **Reader/store** (edge module, e.g. `session-accounting-store.ts`) — all I/O
      - Reads Pi sessions from `~/.pi-ein/agent/sessions/` (respecting `EIN_PI_AGENT_HOME`)
      - Parses transcript JSONLs and `subagent-artifacts/*_meta.json` files
      - Walks the session tree to establish the parent/child relation
      - Model: `ein-pi/agent/lib/sessions.ts` (a reader, deliberately NOT marked `[CORE]`)

2. **Metrics produced** (per agent, per model, and overall parent/subagent split):
   - **Peak context window** (max input+cacheRead+cacheWrite in one message) — mean, p95, max
   - **Turnos per run** (from `usage.turns` in meta.json) — mean, p95, max
   - **Failures & retries** (`exitCode !== 0`, `modelAttempts.length > 1`)
   - **Output tokens** (per model, aggregated)
   - **Cost in $** (derived, optional, may be 0 or missing)
   - **Parent/subagent partition** (by session tree structure)

3. **Test coverage** (mirror in `tests/session-accounting.test.ts`)
   - Both cost paths: `message.usage.cost.total` and `usage.cost.total`
   - Corrupted/missing meta.json, no `modelAttempts`, missing `usage`
   - Run without `_transcript.jsonl`
   - `model_change` events not followed by message (unattributable ~$73 in real corpus)
   - Percentiles on samples of n=1, n=2
   - Empty/nonexistent session directory
   - Partial transcript (truncated file, E/S errors during read)

4. **Minimal query surface** (ein-pi/agent/extensions/ein-ai.ts pattern)
   - Command to fetch aggregated metrics for a project or run
   - Report coercion & coverage status
   - Follow existing 20+ command registration pattern

## Scope: What Is Out

- Claude Code session store (read Pi store first; CC sessions deferred to next phase)
- UI, panels, graphs, TUI
- Changes to model-config.ts or model routing
- New instrumentation (this change reads only what is already written)
- Any logic beyond reading & aggregation (e.g., forecasting, budget enforcement)

## Edge Cases & Known Corpus Signals

From real data on `~/.pi-ein/agent/sessions/`:

- Two cost paths in use; must tolerate both
- ~$73 unattributable (model_change not followed by message)
- ~$68 in subagent-artifacts (sample only, not census)
- ~$137 from session tree partition (includes artifacts)
- Some runs lack `_transcript.jsonl` (E/S or truncation)
- `meta.json` occasionally missing `modelAttempts` or `usage.turns`
- Sample sizes may be very small (n=1 or n=2 for percentiles)

## Budget Allocation

```yaml
scope: |
  Aggregate Pi session metadata (transcripts + subagent artifacts) into
  deterministic cost/context/token metrics per agent/model with coverage
  reporting and fail-closed error handling. No UI, no new instrumentation.
  
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 300000
  
context_signals:
  - Existing sessions.ts reader (ein-pi/agent/lib/sessions.ts) as adapter model
  - Existing runtime-session-adapters.ts for transcript/meta parsing precedent
  - CI/test infrastructure already passing (bun test, two typecheck gates)
  - Project conventions: kebab-case, CORE logic + mirror test, fail-closed
  
strict_tdd: true
lane: micro
```

## Notes on Spec Delta

This change introduces new behaviour (aggregation + metrics computation), so it
carries a spec delta. **It is already declared and synchronised** in this phase:

- `specs/agent-accounting/spec.md` — domain `agent-accounting`, 4 ADDED scenarios
  (fail-closed coverage, parent/subagent partition, peak context window, turns per run)
- `sync-report.md` — `state: synchronized`, `added=4 modified=0 removed=0`, 0 conflicts

DESIGN extends this delta only if it introduces behaviour the four scenarios do not
already cover (e.g. the query command surface).

---

**Scope packet prepared**: Ready for DESIGN phase.
Carril: micro | TDD: strict | Next: cc-ein-sdd check && sdd-design
