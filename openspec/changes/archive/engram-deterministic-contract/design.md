# DESIGN — Deterministic optional Engram notebook

## A. Proposal

### Intent
Add an **E2 deterministic, optional Engram notebook** to Ein through one injectable CLI adapter. Ein will retrieve bounded project-scoped context at supported SDD/session seams and save only concise, policy-approved knowledge after a successful SDD gate or final close, while OpenSpec remains the canonical full record.

### Problem statement
Ein currently has E0 installation/configuration and E1 prompt guidance, but no executable retrieval/save contract. The `artifactStore: openspec | engram | both` preference overstates behavior because only OpenSpec persists SDD artifacts. This design adds deterministic calls and honest receipts without making Engram a phase gate.

### Scope
In scope:
- Engram v1.16.1 CLI transport using `engram search` and `engram save --topic`.
- Stable project identity/isolation and topic keys; bounded retrieval; structured saves; redaction/noise and staleness policies; normalized outcomes.
- Retrieval during SDD preflight/session preparation and immediately before mapped SDD phase agents.
- Saves after a requested phase artifact passes `ein_sdd_check`, plus a final close-summary fallback in `ein:sdd-close`.
- Safe receipts in tool results, preflight/status output, and an OpenSpec change sidecar.
- Replacement of the dishonest artifact-store preference with an optional memory mode.
- Focused tests using fake transports only.

Out of scope:
- Replacing OpenSpec, storing complete artifacts, or making memory mandatory.
- A custom MCP client, direct Engram database access, or Pi programmatic MCP invocation.
- README/release claims; `readme-release-ia` remains the downstream consumer after E2 verification.
- Installer, package-manager, dependency, backend, updater, banner, Homebrew, or broad prompt refactors.
- Real Engram reads/writes in automated or manual verification.
- Deterministic non-SDD “meaningful discovery” detection. Such saves remain E1-triggered unless they use the same policy-controlled local save entry point; phase closure and close are the E2 lifecycle claims here.

### Affected areas
| Area | Responsibility |
|---|---|
| `ein-pi/agent/lib/engram-cli.ts` | Injectable argument-array runner and Engram v1.16.1 CLI adapter. |
| `ein-pi/agent/lib/memory-contract.ts` | Types, budgets, identity, topics, filtering/redaction, normalization, stale policy. |
| `ein-pi/agent/lib/memory-lifecycle.ts` | Session budgets, retrieval/save orchestration, dedup receipts, non-blocking degradation. |
| `ein-pi/agent/lib/sdd-preflight.ts` | Replace artifact-store choice with optional memory mode; prepare session context. |
| `ein-pi/agent/extensions/ein-ai.ts` | Inject context in `before_agent_start`; save after `ein_sdd_check`; close fallback; status. |
| `ein-pi/core/agents/*`, `ein-pi/agent/assets/orchestrator.md` | Supply a concise structured phase summary and report receipts honestly. |
| `tests/engram-memory*.test.ts`, existing preflight/close tests | Fake-transport matrix and compatibility regressions. |

No MCP configuration changes: Pi has no native programmatic MCP call seam from an extension, and the CLI provides the required deterministic boundary.

### Risks
- Human-oriented CLI output may change; tolerant parsing must still fail closed on malformed or capped output.
- Remote changes intentionally change identity and can make prior memory unreachable; reusing old identity could leak across projects.
- Secret detection can over-redact legitimate text or miss unknown credential shapes.
- Stored prose can carry prompt injection; bounded plain-text normalization and an advisory wrapper reduce but cannot eliminate it.
- Adding an optional side effect to read-only `ein_sdd_check` must be explicit and must never alter lint success.
- The total lifecycle/policy change may exceed the production-line review budget even when implementation units stay bounded.

### Rollback
Disable memory mode by default, remove lifecycle calls and the CLI adapter, and retain OpenSpec artifacts and archives unchanged. Receipt sidecars may remain as historical diagnostics or be removed independently. Legacy preflight values continue to normalize to OpenSpec-only behavior.

### Success criteria
- Fake adapters prove one bounded, project-scoped retrieval per supported lifecycle key and one bounded save attempt after a successful gate/close.
- Every operation has exactly one normalized status; only `saved` permits persistence wording.
- Missing binary, empty output, timeout, cap, malformed output, nonzero exit, unknown project, filtering, and save failure never block OpenSpec progression or close.
- Repeated writes use the same project/topic; equal content does not append duplicates and changed content updates the topic.
- Tests touch no real Engram database.

## B. Spec

### B1. Capability and canonical record
**R1.** The system **MUST** distinguish:
- **E0 configured:** Engram is declared/installable/diagnosable; no retrieval or persistence claim.
- **E1 prompt-advised:** a model is asked to use memory; no deterministic lifecycle or persistence claim.
- **E2 deterministic:** Ein invokes the CLI adapter at a named lifecycle point, enforces identity/policy/budgets, and returns a normalized receipt.

The selected E2 claim is: **when optional memory is enabled, Ein deterministically performs bounded retrieval for mapped SDD session/phase preparation and attempts structured topic-key upsert only after a successful phase gate or final close.** Everything else remains E0/E1.

Scenario — claim truthfulness:
- **Given** Engram is installed but no E2 lifecycle operation returned a receipt
- **When** status or preflight is rendered
- **Then** only configured/available E0 state is reported and the system **MUST NOT** claim retrieval or persistence.

**R2.** OpenSpec **MUST** remain the canonical complete SDD record in every memory mode. Engram **MUST NOT** be described as an artifact store.

Scenario — OpenSpec continuity:
- **Given** retrieval or save returns `empty`, `unavailable`, or `failed`
- **When** an SDD phase advances or a verified change closes
- **Then** OpenSpec continues and its full artifact remains authoritative.

### B2. Preference semantics and compatibility
**R3.** New preflight state **MUST** use `memoryMode: "off" | "engram"`; OpenSpec is unconditional and not selectable. UI copy **MUST** say optional project notebook, not artifact storage. Default/headless mode **MUST** be `off` unless an established session preference explicitly enables it.

| Legacy value | Normalized meaning |
|---|---|
| `openspec` | OpenSpec canonical; memory off. |
| `engram` | OpenSpec canonical; optional notebook on; never Engram-only artifacts. |
| `both` | Same as `engram`; deprecated alias, not a distinct mode. |

Scenario — legacy compatibility:
- **Given** a caller supplies legacy `artifactStore: "engram"` or `"both"`
- **When** preferences normalize
- **Then** OpenSpec stays enabled and `memoryMode` becomes `engram` without a full-artifact claim.

### B3. Project identity
**R4.** Before any Engram command, the system **MUST** resolve exactly one non-secret identity in this order: valid canonical `origin` fetch remote; exactly one valid fetch remote if `origin` is absent; sorted root-commit set for a no-remote repository with commits; otherwise `unknown`, with no Engram invocation.

Remote canonicalization **MUST** remove credentials/userinfo, query, fragment, protocol spelling, trailing `.git`, and redundant separators before hashing. External values are `ein-git-<first 20 hex chars of SHA-256(canonical remote)>` or `ein-root-<first 20 hex chars of SHA-256(sorted root commits)>`. Package names, basenames, session IDs, and absolute paths **MUST NOT** be fallback identities. Moving a checkout retains identity; changing a remote creates a new one. Multiple non-origin remotes are ambiguous and **MUST NOT** be guessed.

Scenario — unknown or ambiguous project:
- **Given** a non-Git directory, empty no-remote repository, or multiple remotes without `origin`
- **When** retrieval or save is requested
- **Then** `skipped/unknown_project` returns, with no Engram process or project creation.

**R5.** Every search/save **MUST** include `--project <resolved-id>` and `--scope project`. Output explicitly naming another project **MUST** be discarded as malformed/cross-project data.

Scenario — project isolation:
- **Given** identical topics in two fake project identities
- **When** one identity retrieves or upserts the topic
- **Then** only that identity reaches the transport and no other-project result is surfaced.

### B4. CLI adapter and normalization
**R6.** There **MUST** be one injected CLI adapter seam. Production **MUST** pass executable plus argument array directly to a subprocess API with `shell: false`; shell interpolation **MUST NOT** be used. The adapter **MUST NOT** invoke MCP or the Engram database directly.

```text
engram search <query> --project <project-id> --scope project --limit 5
engram save <title> <content> --type <allowed-type> --project <project-id> --scope project --topic <topic-key>
```

Retrieval **MAY** add `--type` only for one intentionally requested allowlisted type. `engram context [project]` remains E0 evidence but is rejected for E2 retrieval because it lacks a result limit. `save --topic` is the deterministic upsert seam.

Scenario — available retrieval:
- **Given** the fake adapter exits zero with relevant project-scoped output
- **When** mapped lifecycle preparation runs
- **Then** exactly one search argument array is observed and bounded context returns as `retrieved`.

**R7.** Transport normalization **MUST** produce exactly one result according to this table:

| Observation | Retrieval | Save | Safe code |
|---|---|---|---|
| Spawn `ENOENT` | `unavailable` | `unavailable` | `binary_missing` |
| Policy/lifecycle prevents call | `skipped` | `skipped` | bounded policy code |
| Exit 0, usable retrieval | `retrieved` | n/a | `ok` |
| Exit 0, no entries after notice filtering | `empty` | n/a | `no_results` |
| Valid bounded exit-0 save | n/a | `saved` | `acknowledged` |
| Timeout | `failed` | `failed` | `timeout` |
| Stdout/stderr cap crossed | `failed` | `failed` | `output_cap` |
| Other nonzero exit | `failed` | `failed` | `nonzero_exit` + numeric code |
| NUL/binary/control-corrupt or unusable output | `failed` | `failed` | `malformed_output` |
| Other spawn/OS error | `failed` | `failed` | `spawn_error` |

Exit zero acknowledges save; bounded stdout is sanitized and checked for malformed/error payload but **MUST NOT** be matched to one complete literal. ANSI and anchored Engram update-notice lines are removed. A separate update notice neither creates a result nor fails a successful exit.

Scenarios — transport outcomes:
- **Given** a missing binary **When** retrieval/save runs **Then** `unavailable` returns and OpenSpec continues.
- **Given** a timeout **When** cancellation runs **Then** the child is killed, `failed/timeout` returns without retry, and OpenSpec continues.
- **Given** nonzero exit **When** normalized **Then** `failed/nonzero_exit` returns without payload text.
- **Given** corrupt, capped, or unusable exit-0 output **When** parsed **Then** `failed/malformed_output` or `failed/output_cap` returns, never success.
- **Given** exit zero with only an update notice **When** parsed **Then** retrieval is `empty`, not fabricated memory.

### B5. Bounds and lifecycle call flow
**R8.** Budgets **MUST** be finite and enforced before/inside the adapter:

| Budget | Retrieval | Save |
|---|---:|---:|
| Calls/lifecycle key | 1 | 1 |
| Results | 5 | 1 acknowledgement |
| Query/title | 256 UTF-8 bytes | title 160 UTF-8 bytes |
| Stdout / stderr | 16 KiB / 4 KiB | 4 KiB / 2 KiB |
| Context/content | 6 KiB injected | 4 KiB structured |
| Timeout / retries | 1,500 ms / 0 | 1,500 ms / 0 |
| Session cap | 5 retrievals | 10 saves: seven phase/close keys + at most three durable discoveries |

Crossing pre-call/session budget returns `skipped/budget_exhausted`; crossing a running output cap terminates the child and returns `failed/output_cap`. Failure **MUST NOT** broaden queries or retry saves.

Scenario — bounded output:
- **Given** more than five fake results or the byte cap
- **When** retrieval runs
- **Then** at most five results/6 KiB are injectable, while transport-cap breach fails instead of injecting truncation as fact.

**R9.** Executable seams define this call flow:

```text
SDD input -> runSddPreflight/ensureSddPreflight -> resolveProjectIdentity
  -> MemoryLifecycle.prepare("session", sessionKey) -> adapter.search
  -> normalize/filter/stale policy -> cache receipt + bounded context
before_agent_start -> infer named SDD phase -> infer explicit change or sole active change
  -> prepare(phase, sessionKey + project + change + phase)
  -> append advisory block + receipt to systemPrompt
phase agent writes artifact -> orchestrator calls ein_sdd_check(change, phase, candidate)
  -> lint -> if artifact exists with zero errors: validate/filter -> topic -> adapter.save
  -> return lint + receipt; append safe receipt sidecar
summary.md -> ein_sdd_check -> ein:sdd-close validates/archives OpenSpec
  -> absent successful close-topic receipt: one bounded save from linted summary.md
  -> report close and memory independently
```

Session retrieval runs once after preflight enables memory. Phase retrieval supports `map`, `design`, `apply`, and `verify`, the current named-agent seams. A resumed session has a new key and **MAY** retrieve once for that phase. There is no per-command/tool/subagent retrieval. Scope/tasks/close retrieval and arbitrary non-SDD work remain E1 until separately wired and verified. Ambiguous change inference returns `skipped/ambiguous_change` with no injection.

Scenario — resumed phase:
- **Given** a later session resumes `sdd-design` for one explicit change
- **When** `before_agent_start` runs
- **Then** one fresh design retrieval is allowed and repeated starts reuse its cached receipt/context.

**R10.** Retrieval is advisory. Injected context **MUST** be wrapped with project, freshness, receipt status, and the rule that user instructions, source/configuration, and OpenSpec override memory. Memory **MUST NOT** be injected as system instructions.

Scenario — stale/conflicting memory:
- **Given** memory conflicts with OpenSpec or exceeds the stale threshold
- **When** context is prepared
- **Then** current evidence wins, stale text is labeled/discarded, and memory cannot advance or block a phase.

### B6. Saves, topics, filtering, and freshness
**R11.** Save candidates **MUST** be structured and use one allowlisted type: `decision | architecture | bugfix | pattern | config | discovery | learning`. Allowed fields are `type`, `stableId`, `title`, `summary`, optional `rationale`/`evidence`, `change`, `phase`, and safe provenance (artifact path, timestamp, digest); extras are discarded. Raw prompts, chats, logs, commands, code, diffs, test output, and full artifacts **MUST NOT** be accepted.

Scenario — noise rejection:
- **Given** a candidate dominated by logs, diff/code, commands, tests, or per-command progress
- **When** policy validation runs
- **Then** `skipped/noise_rejected` returns and fake save receives no call.

**R12.** Secret filtering **MUST** precede topic/content generation, transport, and diagnostics. The denylist covers private keys, bearer/basic authorization, passwords, cookies, common API/token formats, and secret-like environment assignments (`*_TOKEN`, `*_KEY`, `*_SECRET`, `*_PASSWORD`, credentials). High-confidence key blocks are rejected; redactable fragments become `[REDACTED]`; non-meaningful remnants are skipped. Receipts **MUST NOT** contain raw candidates/process output.

Scenario — secret filtering:
- **Given** token, API key, private key, authorization, password, cookie, and secret-environment fixtures
- **When** save is attempted
- **Then** no original value reaches arguments/diagnostics; result is redacted-and-saved or `skipped/secret_detected`.

**R13.** Topic keys **MUST** be generated, never accepted as caller input:
- SDD: `sdd/<validated-change>/<scope|map|design|tasks|apply-progress|verify-report|close>`.
- Durable: `<family>/<slug>-<hash8>`; `slug` is lowercase ASCII from NFKC-normalized `stableId`, capped at 48 characters, and `hash8` is SHA-256 of the complete normalized `stableId`.
- Families include `decision`, `architecture`, `bug`, `constraint`, `pattern`, `discovery`, `learning`; `bugfix` maps to `bug`, configuration constraints to `constraint`.

Topics exclude content hashes so corrections update the same topic; suffixes prevent normalized/truncated collisions. Project plus topic is the upsert key.

Scenario — dedup/upsert:
- **Given** equal project/topic/digest **When** save repeats **Then** a prior local `saved` receipt permits `skipped/duplicate`; otherwise the same topic upserts.
- **Given** changed approved content for the same project/topic **When** saved **Then** one save with that same topic updates/supersedes the entry.

**R14.** Retrieval freshness **MUST** use tool timestamps when present: ≤30 days is `fresh`, 31–180 is visibly `stale`, and >180 is discarded. Missing/invalid age is `unverified`, never fact. At most two stale/unverified entries fit within the five-result cap. A current topic supersedes older same-topic entries; only the newest valid entry is injected.

Scenario — stale memory:
- **Given** 200-day, 60-day, and unknown-age fake entries
- **When** freshness policy runs
- **Then** the first is discarded, others labeled `stale`/`unverified`, and none overrides current evidence.

### B7. Receipts and non-blocking behavior
**R15.** Save status is exactly `saved | skipped | unavailable | failed`; retrieval status is exactly `retrieved | empty | skipped | unavailable | failed`. `retrieved` means bounded working context, never persistence. Receipts **MUST** contain only operation, status, safe reason, lifecycle key, project hash, optional topic, counts/bytes, duration, timestamp, and optional digest. They **MUST NOT** contain raw stdout/stderr, payloads, secrets, or full paths outside a safe project-relative artifact path.

Scenario — zero false success:
- **Given** save is filtered, unavailable, timed out, malformed, or nonzero
- **When** rendered
- **Then** no UI/orchestrator/artifact says “saved”; only `saved/acknowledged` permits it.

**R16.** `ein_sdd_check` **MUST** return receipts in `details.memory` without changing lint success. Change receipts **SHOULD** append to `openspec/changes/<change>/memory-receipts.jsonl` and travel with or append under the archive. `/ein:status` and preflight **SHOULD** show latest safe status. Receipt-write failure **MUST NOT** gate memory or OpenSpec.

Scenario — save failure after valid artifact:
- **Given** artifact lint passes and fake save fails
- **When** `ein_sdd_check` returns
- **Then** lint remains successful, memory status is `failed`, a safe receipt is attempted, and progression remains possible.

**R17.** Close **MUST** report archive and memory independently; successful archive is not rolled back for memory failure. A same-digest saved close topic **MAY** yield `skipped/duplicate`; otherwise one bounded fallback save runs.

Scenario — close save:
- **Given** linted `summary.md`, successful `closeChange`, and no matching successful close receipt
- **When** close completes
- **Then** one `sdd/<change>/close` save is attempted and reported without changing close success.

## C. Decisions

### C1. CLI adapter, not MCP
**Decision:** Use an argument-array adapter around Engram v1.16.1: `search` provides project/scope/limit and `save --topic` deterministic upsert. CLI text requires defensive normalization, but this is the smallest testable seam; Pi lacks a native extension API for arbitrary MCP calls.

**Rejected:** Custom MCP client, which duplicates protocol/session/error handling; direct DB access, which couples Ein to schema and bypasses the supported CLI.

### C2. One external boundary; functional policy modules
**Decision:** One injectable `EngramTransport` exposes normalized `search(input, budget)` and `save(input, budget)`. Production owns subprocess details; lifecycle/policy consume normalized results; tests inject fakes and never resolve/spawn `engram`. Identity and policy remain pure functions, not class hierarchies.

### C3. Bind retrieval to actual hooks
**Decision:** Use `ensureSddPreflight` once per session and `before_agent_start` for phase retrieval/injection; session/change/phase keys coalesce repeats.

**Rejected:** “Every material action/command” hooks, because current seams cannot classify every future parent action without brittle prompt parsing.

### C4. Bind persistence to the deterministic gate
**Decision:** Extend `ein_sdd_check` with optional `phase` and structured `memoryCandidate`; ordering is lint, policy, save. Existing callers remain lint-only and receive `skipped/no_candidate` rather than invented persistence.

**Boundary:** Agents/orchestrator supply concise candidates; deterministic code authorizes/invokes; full artifacts never reach Engram.

**Rejected:** Prompt-only E1 saves, which cannot prove invocation, ordering, acknowledgement, or safe failure.

### C5. Keep close canonical and memory optional
**Decision:** `ein:sdd-close` archives OpenSpec first; close-summary save is secondary and non-blocking, with same-digest receipts preventing duplicates.

**Rejected:** Mandatory memory or rollback on save failure, which would make the notebook a gate.

### C6. Prefer identity isolation over guessing
**Decision:** Canonical remote fingerprint, then root-commit fingerprint, else skip; never basename/package identity or guessed project creation. Remote/history rewrites may lose continuity, safer than merging projects. Explicit override needs a later design.

### C7. Topic upsert, not search-before-save
**Decision:** Every save uses stable `--topic`; a local successful digest receipt may skip exact repeats, while changed content updates the same topic.

**Rejected:** Search-then-write dedup, which doubles calls, races, and duplicates confirmed topic upsert.

### C8. Fail closed for content, open for workflow
**Decision:** Reject suspicious payload/output as memory while SDD/OpenSpec continues; expose codes/counts, not content.

### C9. Honest preference semantics
**Decision:** `memoryMode` replaces `artifactStore`; OpenSpec is always on. Legacy values normalize at the compatibility boundary but disappear from new UI/prompt language.

**Rejected:** Keeping three relabeled choices, because `engram`/`both` still imply complete artifact storage.

### C10. Migration and compatibility
- Existing OpenSpec changes/archives need no migration; session-local preferences need no persistent data migration.
- Legacy `artifactStore` is accepted for one compatibility window.
- Existing `ein_sdd_check({ change })` stays lint-only; E2 save requires phase/candidate or close fallback.
- Existing Engram MCP configuration remains valid E0 configuration but is unused by E2.
- Receipt sidecars are additive and ignored by the current router/linter.
- README claims remain blocked until fake-transport verification proves E2 for `readme-release-ia`.

### C11. Bounded implementation units
| Unit | Production estimate | Test estimate |
|---|---:|---:|
| CLI adapter, normalization, identity/topic/filter policy | 220–320 | 220–340 |
| Preflight/phase/check/close lifecycle and receipts | 180–280 | 180–300 |
| Preference/status truthfulness and compatibility wording | 60–120 | 60–120 |

These are implementation boundaries, not a delivery decision. The Review Workload Guard **MUST** measure actual production/test/generated lines and exclusively determines the delivery shape.

## D. Success Criteria

### Observable acceptance checks
1. Fake search receives one exact project/scope/limit argument array and injects at most five results/6 KiB.
2. Empty is `empty`; missing binary is `unavailable`; timeout, nonzero, cap, and malformed output are `failed` with safe codes.
3. Unknown/ambiguous identity is `skipped/unknown_project` with zero Engram calls.
4. A candidate cannot reach save until its artifact exists and has zero lint errors.
5. Save receives only allowlisted type, structured/redacted content, resolved project/scope, and generated topic.
6. Only normalized zero-exit acknowledgement reports `saved`; all other paths avoid persistence wording.
7. Same project/topic/content deduplicates; changed content upserts the same topic; projects never share calls/results.
8. Secret/noise fixtures never appear in fake arguments, receipts, diagnostics, or injected context.
9. Stale/unknown-age entries follow policy and cannot override user/source/configuration/OpenSpec.
10. Memory absence/failure preserves all SDD phases, close, and archive behavior.
11. Close reports archive/memory independently and attempts at most one fallback close save.
12. Preflight/status say optional notebook/memory, never Engram artifact store; legacy modes normalize honestly.
13. Tests use only fake transports and no real Engram DB/subprocess discovery/read/save/update/delete.
14. `readme-release-ia` receives only verified E2 evidence after close; public docs stay unchanged here.

### Verification after implementation
From repository root with Bun:

```text
bun test tests/engram-memory-contract.test.ts tests/engram-memory-lifecycle.test.ts
bun test tests/sdd-preflight-tdd-gate.test.ts tests/sdd-close.test.ts tests/sdd-router.test.ts
bun test tests/
```

Review Workload Guard measurement is required before delivery and exclusively determines delivery shape. No test, build, web access, real Engram call, or database mutation belongs to this design phase.
