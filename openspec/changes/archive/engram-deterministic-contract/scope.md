# Deterministic Engram contract

Make Ein's Engram integration deterministic, optional, bounded, observable, and honest. OpenSpec remains the canonical full SDD record; Engram is only a project-scoped notebook for concise reusable knowledge.

## SCOPE PACKET

```yaml
scope: Make Ein's Engram integration an optional, bounded, observable E2 capability: retrieve concise project-scoped context at defined lifecycle points and save structured reusable knowledge only after meaningful discoveries or phase closure, with explicit outcomes and safe degradation. Keep OpenSpec canonical, validate the real Engram MCP/tool surface before design, and prevent user-facing memory claims from exceeding verified behavior.
change_name: engram-deterministic-contract
webfetch: false
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Known baseline

Treat these facts as established; `sdd-map` should validate only the concrete seams needed by the design rather than broadly rediscovering the repository:

- `ein-pi/agent/mcp.json` configures Engram lazily.
- The installer detects, installs, and verifies Engram.
- `sdd-preflight.ts` detects writable tool names and offers `openspec | engram | both`, but the selection is primarily prompt text.
- Orchestrator instructions tell models and subagents to search and save only when tools are available.
- Ein has no deterministic search/save adapter or verified lifecycle calls today.
- The project previously had no Engram memories.
- The active Engram MCP surface may include project discovery, context/search, save/update, prompt/session operations, and diagnostics. Map/design must verify actual names, inputs, outputs, and failure behavior before implementation.
- `openspec/config.yaml` exists with `strict_tdd: false`; this scope does not alter it.
- `.pi/ein/atl/skill-registry.md` exists.

## Capability claim levels

| Level | Permitted claim | Evidence required |
|---|---|---|
| **E0 — configured** | Engram is declared or installable as an optional MCP dependency. | Configuration/installer evidence only. No claim that Ein searched or saved memory. |
| **E1 — prompt-advised** | Instructions ask a model to use Engram when suitable and available. | Prompt/instruction evidence. No deterministic lifecycle or persistence claim. |
| **E2 — deterministic** | Ein invokes a verified adapter at named lifecycle points, enforces project identity and budgets, records an explicit operation outcome, and degrades safely. | Focused fake-tool tests plus verification of the implemented adapter/lifecycle seams. |

This change targets **E2** for the bounded behavior below. Any behavior not wired and verified at E2 must remain labeled E0 or E1. Configuration, tool discovery, or advisory prompt text alone never upgrades a claim to E2.

## Intended E2 lifecycle

The map/design phases must bind these logical points to real executable seams. Calls must be owned by deterministic code, not left solely to model compliance.

### Retrieval points

Perform at most one bounded retrieval for a given phase/run at each of these points:

1. **Project/session work entry:** before Ein proposes or plans a material project action after project identity is established.
2. **Before SDD map:** retrieve decisions, constraints, prior bug knowledge, and relevant completed summaries for the current project/change.
3. **Before SDD design:** retrieve only context relevant to design decisions and known constraints for the current change.
4. **Before SDD apply:** retrieve the accepted change context and reusable implementation constraints before source mutation begins.
5. **Before SDD verify:** retrieve only verification-relevant constraints, known failure causes, and the accepted change context.
6. **Resumed important work:** when a later session resumes one of the above phases, permit one fresh bounded retrieval for that phase/run; do not retrieve before every command, tool call, or subagent action.

Retrieval is advisory. Current source, current OpenSpec artifacts, and current user instructions take precedence over memory.

### Save/update points

Attempt a structured save or update only at these points:

1. **Meaningful discovery:** a durable architectural/product decision, reusable constraint, or diagnosed bug cause and fix is established with evidence.
2. **SDD phase closure:** after scope, map, design, tasks, apply, verify, or close completes, save a concise structured summary of the completed phase.
3. **Supersession:** when a durable entry is replaced, update or supersede its stable topic rather than append an indistinguishable duplicate.

Do not save speculative thoughts, transient progress, every command result, raw logs, full code, diffs, test output, chat transcripts, or full OpenSpec artifacts.

### Observable operation outcomes

Every retrieval and save/update attempt must produce one machine-observable outcome and enough safe diagnostic context to explain it:

| Outcome | Meaning |
|---|---|
| `saved` | The verified tool acknowledged the intended save/update. This is the only outcome that permits a “saved” claim. |
| `skipped` | Policy intentionally prevented the operation, such as no meaningful content, duplicate content, secret/noise filtering, exhausted budget, or no applicable lifecycle point. |
| `unavailable` | Engram or the required operation is absent/not discoverable. Continue with OpenSpec and local project context. |
| `failed` | A discovered operation was invoked but returned an error, invalid response, or timeout. Continue non-blockingly and expose a concise safe diagnostic. |

Retrieval may use the same outcome vocabulary: `saved` means successful context capture into Ein's bounded working context, not persistence. Map/design may introduce a more semantically precise success label only if the external observable contract remains unambiguous and does not create a false persistence claim.

## Contract requirements

### Canonical record and degradation

- OpenSpec is always the canonical complete SDD record.
- Engram is optional and non-blocking. Empty results, absence, timeouts, malformed responses, search failures, and save failures must not stop OpenSpec scope/map/design/tasks/apply/verify/close continuity.
- Engram must not become a prerequisite for normal Ein operation or phase progression.
- Artifact-store/preflight wording must not suggest that selecting Engram replaces the required OpenSpec record. Any existing `openspec | engram | both` choice must be reconciled with this invariant.
- No phase may claim persistence unless its deterministic save/update returned `saved`.

### Project isolation and stable keys

- Resolve one stable, non-secret project identity before retrieval or persistence. Map/design must choose and document deterministic precedence using verified project/tool surfaces, including behavior for absent or changed remotes and moved working directories.
- Every search, save, update, and deduplication operation must be scoped to that project identity.
- Cross-project results must be rejected even if their text or topic matches.
- Use stable topic families, at minimum:
  - `sdd/<change>/scope`
  - `sdd/<change>/map`
  - `sdd/<change>/design`
  - `sdd/<change>/tasks`
  - `sdd/<change>/apply-progress`
  - `sdd/<change>/verify-report`
  - `sdd/<change>/close`
  - `decision/<stable-slug>`
  - `bug/<stable-slug>`
  - `constraint/<stable-slug>`
- Repeated writes to the same project/topic/content must deduplicate or update rather than create noisy duplicates.

### Stale-memory handling

- Retrieved entries must retain enough provenance or age metadata to identify potentially stale knowledge when the tool provides it.
- Stale or conflicting memory is advisory and must be marked or discarded; it must never silently override current user instructions, source, configuration, or OpenSpec.
- A superseding durable decision updates or explicitly supersedes the stable topic so future retrieval does not present both entries as equally current.
- If freshness cannot be established, the consumer must treat the entry as unverified context rather than fact.

### Filtering and bounds

- Filter secrets and credentials before persistence, including tokens, API keys, private keys, authorization headers, passwords, cookies, and secret-like environment values. A filtered payload must not be recoverable from diagnostics.
- Reject raw logs, full source files, diffs, command transcripts, generated output, and low-value per-command status.
- Store concise summaries with explicit type, project identity, stable topic, change/phase when applicable, summary, and safe provenance/freshness metadata.
- Map/design must set concrete per-lifecycle budgets for maximum tool calls, result count, payload size, and timeout. Defaults must be small and finite; no unbounded search or retry loop is allowed.
- Search failure must not trigger speculative broad queries. Save failure must not trigger duplicate writes without an idempotent retry rule.

## Focused verification matrix

All automated tests must use injected fake tools/adapters. Tests must not discover, read, create, update, or delete real Engram memories.

| Scenario | Required evidence |
|---|---|
| Available with relevant results | One bounded project-scoped retrieval occurs at the named lifecycle point; results are capped and safely surfaced. |
| Available with empty results | Operation completes honestly with no fabricated context and OpenSpec flow continues. |
| Unavailable | Outcome is `unavailable`; no retry storm or phase blocker; OpenSpec flow continues. |
| Search failure/invalid response/timeout | Outcome is `failed`; safe diagnostic is observable; OpenSpec flow continues. |
| Save acknowledged | Outcome is `saved` only after verified acknowledgement and only for allowed structured content. |
| Save failure | Outcome is `failed`; no “saved” wording; OpenSpec flow continues. |
| Skipped save | Noise, non-meaningful content, exhausted budget, or policy rejection yields `skipped` with no tool mutation. |
| Dedup/update | Repeating the same project/topic/content does not append duplicates; superseding content follows the defined update rule. |
| Project isolation | Identical topics in two fake projects cannot leak through search, update, or deduplication. |
| Stable identity | The chosen identity precedence behaves deterministically for the mapped remote/path cases. |
| Secret filtering | Representative token, key, header, password, cookie, and environment-secret fixtures never reach fake-tool payloads or diagnostics. |
| Noise filtering | Logs, full code/diffs, command output, and per-command status are rejected. |
| Stale/conflicting memory | Stale content is marked/discarded and cannot override current OpenSpec/source/user context. |
| Call/result bounds | Caps and timeout behavior are enforced; retries cannot exceed the declared budget. |
| OpenSpec continuity | Scope and later phase artifacts remain canonical and can proceed for empty, unavailable, search-failure, and save-failure paths. |
| Claim truthfulness | Preflight/status/documentation wording distinguishes E0, E1, and verified E2 and never equates configuration with persistence. |

## Acceptance criteria

1. Map/design document the actual callable Engram discovery, search/context, save/update, diagnostic, and project surfaces before choosing an adapter shape.
2. Deterministic code, not prompt compliance alone, owns the bounded retrieval and save/update calls at the lifecycle points listed above.
3. Each operation reports exactly one explicit outcome: `saved`, `skipped`, `unavailable`, or `failed`, with no false “saved” claim.
4. OpenSpec remains canonical and every tested Engram absence/failure path preserves phase continuity.
5. Searches and writes are isolated by stable project identity and stable topic; deduplication, supersession, and stale-memory rules are tested.
6. Secret/noise filtering occurs before fake-tool invocation and before diagnostics are emitted.
7. Concrete call, result, payload, timeout, and retry budgets are implemented and verified.
8. Preflight and internal documentation claims match the achieved capability level; E0/E1 behavior is not described as E2.
9. The focused fake-tool matrix covers available, empty, unavailable, search failure, save failure, deduplication, project isolation, secret filtering, and OpenSpec continuity without mutating real memory.
10. `readme-release-ia` is named as the downstream consumer and remains blocked from publishing deterministic Engram search/save claims until this change's E2 behavior is verified.

## Downstream truthfulness gate

`readme-release-ia` is the explicit downstream consumer of this contract. It may describe only the final verified claim level:

- Before E2 verification, README memory language must remain limited to honest E0/E1 optional-integration wording.
- A lazy MCP declaration, successful installation, tool-name detection, or prompt instruction is insufficient evidence for deterministic retrieval or persistence.
- README rewriting is not part of this change. The verified contract and evidence are handed off to `readme-release-ia` after this change closes.

## Non-goals

- Rewriting or forking the Engram backend.
- Making memory mandatory or blocking work when it is absent.
- Storing complete OpenSpec artifacts, source files, diffs, logs, transcripts, or test output in Engram.
- Replacing OpenSpec as the canonical SDD record.
- Rewriting README or publishing new user-facing memory claims.
- Updater, release-banner, Homebrew, or unrelated release-experience work.
- Real Engram memory mutation in automated or manual verification tests.
- Broad prompt, orchestrator, installer, MCP, or SDD refactors unrelated to the deterministic boundary.
- Web/network research or dependency/package-manager changes.

## Review workload forecast and decomposition

This change is likely to exceed the **400 production-line review budget** if the adapter, lifecycle wiring, preflight truthfulness, diagnostics, and policy filtering land together. Initial forecast: **450–750 production changed lines**, plus **350–650 test lines**. Map/design must replace this range with a seam-based estimate before tasks; it must not enlarge scope to consume the range.

Plan chained, independently verifiable work units if the refined production estimate remains above 400 lines:

1. **Contract boundary and policy:** project identity, stable topics, budgets, filtering, deduplication, explicit outcomes, and a fake adapter harness. No lifecycle-wide rollout.
2. **Deterministic lifecycle integration:** wire bounded retrieval/save points and prove OpenSpec continuity across available/empty/unavailable/failure paths.
3. **Truthfulness and handoff:** align preflight/internal claims with verified behavior and produce the contract evidence consumed later by `readme-release-ia`; do not rewrite README.

Keep behavior and its focused tests in the same work unit. If any slice still forecasts above 400 production lines, split by executable seam rather than by file type.

## Mapping boundaries and exit condition

`scope` is complete when this artifact is accepted. `sdd-map` must stay within the Engram boundary, SDD lifecycle call sites, preflight/status claim surfaces, project identity source, and focused fake-tool test seams. It must not scan unrelated updater/banner/Homebrew work or mutate archived/untracked files.

The change is ready for design only when map has verified the real MCP/tool contracts, identified deterministic call owners, and produced a concrete per-operation budget and refined review forecast. No code, tests, builds, network calls, or Engram writes belong to this phase.
