# Design: audited scope-only out-of-flow reconciliation

## A. Proposal

### Intent

Add one explicit, reusable but structurally narrow `scope-only-out-of-flow` reconciliation profile for scope-only records when fresh, repository-bound audit evidence proves delivery occurred outside SDD. Eligibility comes from exact record shape and spec evidence—not the change name—and admits both genuinely declarationless legacy records and records with exactly `spec_delta: none` plus a concrete declaration reason.

### Scope

In scope:

- A dedicated deterministic evidence artifact named `out-of-flow-reconciliation.json`.
- A required fresh `summary.md` that plainly records the out-of-flow delivery and its excluded lifecycle gaps.
- Explicit, equivalent profile/evidence/reason options on Pi and Claude close surfaces.
- Deterministic shape-based eligibility for either a genuinely declarationless scope or exactly `spec_delta: none` with a concrete declaration reason.
- Deterministic freshness, repository-state, and blocker classification.
- `docs-site-shell` as the first migration target and fixture, never as a production allowlist entry.
- Preservation of normal close and the existing declarationless legacy force escape.

Out of scope:

- Closing or modifying `docs-site-shell` in this change.
- Creating retrospective `map.md`, `design.md`, `tasks.md`, `apply-progress.md`, or `verify-report.md` for that record.
- General force-close behavior, name-based eligibility, broader legacy record shapes, command execution by the evidence parser, spec synchronization, or changes to `ein_sdd_check` lint semantics.

### Affected areas

- `ein-pi/agent/lib/sdd-router.ts`: classify exact profile eligibility and publish stable reconciliation blocker codes without weakening ordinary readiness.
- `ein-pi/agent/lib/sdd-close.ts`: accept the explicit options, validate reconciliation evidence before the archive move, and return distinguishable reconciliation evidence.
- A small deterministic shared reconciliation validator in `ein-pi/agent/lib/`, with no filesystem or process execution inside the validator.
- `ein-pi/agent/extensions/ein-ai.ts`: expose the Pi tool and slash-command options.
- `cc-ein/sdd-cli/cli.ts`: expose equivalent Claude CLI options and delegate to the same core close behavior.
- Focused close/router and surface-contract tests identified by `map.md` in the later apply phase.

### Risks

- A reusable profile could become a disguised force-close path if exact shape and spec-state gates are weakened.
- Declaration parsing could incorrectly admit a non-none, pending, conflicting, or local delta state, or conflate the declaration reason with the reconciliation audit reason.
- Timestamp-only freshness could bless evidence from a different repository state.
- Adding evidence beside a historically scope-only record could accidentally make it look like a normal mixed-phase SDD record.

### Rollback

Remove the new profile options, reconciliation validator/classification, and result field. Leave ordinary close readiness and `CloseResult.legacyEscape` untouched; records carrying reconciliation files then remain active and fail closed rather than being silently archived.

### Success criteria

A record can be archived through this profile only when its exact scope-only shape, allowed spec state, and matching evidence pass every reconciliation gate; its name cannot grant eligibility. `docs-site-shell` proves the first migration case, while ordinary incomplete, malformed, stale, conflicting, delta-bearing, or mixed-phase records remain blocked and Pi and Claude produce equivalent core decisions.

### Canonical spec context

No canonical `openspec/specs/<domain>/spec.md` path was explicitly recorded in `scope.md` or added as an exact mapped canonical path in `map.md`; therefore no canonical domain file is selected, hashed, truncated, or reconstructed here. This design uses the bounded change-local delta at `openspec/changes/archive-out-of-flow-delivery/specs/sdd-lifecycle/spec.md` as phase input, not as canonical context.

## B. Spec

### Requirement 1: explicit bounded profile

The system **MUST** recognize exactly one new profile value, `scope-only-out-of-flow`, and **MUST** require the caller to select it explicitly. The profile **MUST** be reusable for every record that satisfies its exact shape and evidence contract and **MUST NOT** consult a change-name or change-ID allowlist.

**Given** a scope-only record is requested by any safe change name  
**When** close is requested with `scope-only-out-of-flow`, the canonical evidence path, and a valid reason  
**Then** eligibility is determined from the record shape and validated evidence rather than its name or missing lifecycle artifacts.

### Requirement 2: dedicated evidence contract

The system **MUST** accept reconciliation evidence only from `openspec/changes/<change>/out-of-flow-reconciliation.json`. The UTF-8 JSON object **MUST** contain:

- `format: "ein-out-of-flow-reconciliation/v1"`;
- `profile: "scope-only-out-of-flow"`;
- `change`, exactly matching the selected close change;
- `auditReason`, exactly matching the caller's normalized valid reason;
- `createdAt`, as a valid non-future timestamp;
- `summary`, containing `path: "summary.md"`, SHA-256, and UTF-8 byte count;
- a non-empty `repositoryChecks` array whose entries have a stable check ID, the exact command or manual check performed, a passing outcome, completion time, an evidence reference, and the exact repository-state identity inspected;
- one top-level exact repository-state identity shared by every check.

Unknown versions, duplicate check IDs, missing fields, non-passing outcomes, unsafe paths, ambiguous references, or mismatched identities **MUST** fail closed. The validator **MUST NOT** execute evidence-supplied commands.

**Given** a reconciliation JSON file is missing, malformed, copied from another change, or carries checks for different repository states  
**When** the profile is evaluated  
**Then** close remains non-mutating and reports a deterministic reconciliation-evidence blocker.

### Requirement 3: valid auditable reason

The system **MUST** apply the existing audit-reason validity rules used by the declarationless legacy escape, including rejection of blank, sentinel, or overlong values. The explicit close reason and `auditReason` in the evidence **MUST** normalize to the same value. For a `spec_delta: none` scope, its concrete declaration reason **MUST** independently satisfy the existing declaration rules and **MUST NOT** replace either reconciliation audit reason.

**Given** otherwise valid evidence has an absent, invalid, or mismatched audit reason, or a `spec_delta: none` scope lacks a concrete declaration reason  
**When** close is requested  
**Then** reconciliation is denied and no declaration or audit reason is silently substituted for another.

### Requirement 4: fresh explicit summary

The system **MUST** require `openspec/changes/<change>/summary.md` to be fresh under the existing deterministic freshness policy and to match the hash and byte count in the evidence. Its content **MUST** include the exact plain statement `Delivery occurred outside SDD.`, name every intentionally excluded lifecycle artifact, include a `Repository verification` section referencing every `repositoryChecks[].id`, and include a `Successor changes` section containing named change IDs or the explicit value `None.`.

A generic completion statement, omitted gap, absent successor declaration, unmatched check reference, stale file, or hash/size mismatch **MUST NOT** satisfy the profile.

**Given** the summary says only that work is complete, omits `verify-report.md`, or references no current repository checks  
**When** reconciliation is assessed  
**Then** the summary is rejected as non-explicit or incomplete.

### Requirement 5: current repository binding

The system **MUST** independently compute the current exact repository-state identity and compare it with the evidence and every repository check reference. Evidence **MUST** be stale when its state differs, cannot be computed, is ambiguous, or any check predates the represented state. Missing, stale, unavailable, or mixed-state evidence **MUST NOT** be promoted to current.

**Given** passing checks were recorded and the relevant repository state later changes  
**When** close evaluates the evidence  
**Then** reconciliation is blocked as stale even if file timestamps are recent.

### Requirement 6: exact eligible record shape

The profile **MUST** accept only a readable scope-only record whose spec state is either (a) genuinely declarationless, with no declaration marker or local delta, or (b) exactly one valid `spec_delta: none` declaration with its own concrete declaration reason and no local delta. Eligibility **MUST** derive exclusively from this shape and the validated reconciliation evidence, never from the change name. A local delta, pending or conflicting spec state, `sync-report.md`, any non-none declaration, multiple or ambiguous declarations, or any retrospective map/design/tasks/apply/verify artifact **MUST** fail closed. Only `scope.md`, the required `summary.md`, and `out-of-flow-reconciliation.json` may participate in this profile.

**Given** `docs-site-shell` and a differently named record each have the same qualifying `spec_delta: none` scope-only shape and valid evidence  
**When** the profile evaluates both records, and one is then changed to carry a local delta, pending or conflicting state, non-none declaration, sync report, or lifecycle artifact  
**Then** the qualifying records receive the same decision regardless of name and the changed record is rejected by its shape or spec state.

### Requirement 7: preserve ordinary close and legacy escape

The system **MUST** leave default close readiness unchanged: ordinary close still requires complete apply, fresh passing verify, fresh summary, no pending tasks, correct artifact sequence, and passing synchronization/conflict guards. The existing `force` plus declarationless legacy escape **MUST** remain declarationless-only, retain its current requirement that every non-spec close gate pass, and continue returning `legacyEscape` evidence; admitting `spec_delta: none` to reconciliation **MUST NOT** broaden that escape. `force` and `scope-only-out-of-flow` are distinct modes; supplying both **MUST** fail as an ambiguous mixed-mode request.

**Given** an ordinary incomplete change or a `spec_delta: none` scope-only record is closed with force, reconciliation-shaped arguments without the selected profile, or both modes  
**When** readiness is evaluated  
**Then** all applicable ordinary, declarationless-escape, or mixed-mode blockers are reported and the active record is not archived.

### Requirement 8: equivalent explicit surfaces

The shared close contract **MUST** use `CloseOptions.reconciliationProfile` and `CloseOptions.reconciliationEvidencePath`. Pi `ein_sdd_close` **MUST** expose `reconciliationProfile`, `reconciliationEvidencePath`, and the existing `reason`; Pi `/ein:sdd-close` and Claude `cc-ein-sdd close` **MUST** expose the equivalent flags `--reconciliation-profile`, `--reconciliation-evidence`, and `--reason`. The evidence flag **MUST** resolve to the canonical artifact path above; arbitrary alternate locations are invalid.

Successful reconciliation **MUST** return `CloseResult.reconciliation` containing the profile, change, normalized reason, evidence path, summary identity, repository-state identity, and check IDs. It **MUST NOT** set or reinterpret `CloseResult.legacyEscape`.

**Given** equivalent Pi and Claude close requests name the same change, profile, canonical evidence, and reason  
**When** each adapter invokes close against the same repository state  
**Then** both receive the same core success or blocker classification, differing only in surface formatting and exit/report conventions.

### Requirement 9: deterministic non-mutation on denial

The system **MUST** validate safe naming, source existence, archive collision, profile eligibility, evidence, summary, and repository binding before moving any files. Denied reconciliation **MUST** leave the source and archive unchanged. `ein_sdd_check` and `/ein:sdd-check` **MUST** remain artifact lint/audit surfaces and **MUST NOT** gain archival or bypass behavior.

**Given** evidence is malformed, stale, or fails after another applicable blocker is found  
**When** close evaluates the request  
**Then** all deterministic applicable blockers are returned and no archive mutation occurs.

## C. Decisions

### 1. Separate reconciliation from force

`scope-only-out-of-flow` is a named profile rather than another interpretation of `force`. This keeps the existing declarationless escape stable and prevents accidental broadening of force semantics.

### 2. Use one machine-readable evidence artifact plus the existing summary name

`out-of-flow-reconciliation.json` owns identity, reason, freshness links, repository checks, and state binding. `summary.md` owns the human-readable delivery statement, excluded gaps, verification references, and successor-change narrative. Hash and byte-count binding prevents the two records from drifting.

### 3. Treat reconciliation files as closure evidence, not historical lifecycle artifacts

Eligibility first establishes that the historical lifecycle basis is scope-only and has one of two exact spec states: genuinely declarationless, or exactly `spec_delta: none` with a concrete declaration reason. The dedicated summary and evidence are then admitted solely as reconciliation closure evidence. Any local delta, pending or conflicting state, sync report, non-none declaration, or map/design/tasks/apply/verify reconstruction changes the eligible shape and denies reconciliation.

### 4. Keep deterministic logic in shared core

A pure validator receives parsed evidence, summary bytes/metadata, current repository identity, selected change, and normalized options, and returns classified evidence or blockers. Filesystem reads and archive moves remain at the close boundary; Pi and Claude adapters only translate explicit options.

### 5. Publish stable blocker families

The core should distinguish at least: unsupported/absent profile, mixed mode, ineligible shape or spec state, missing/malformed evidence, invalid or mismatched audit reason, invalid declaration reason, invalid/stale summary, non-passing or non-concrete checks, repository-state mismatch, unsafe name, and archive collision. These classifications are observable and shared across adapters.

### 6. Keep the first migration target separate from policy

`docs-site-shell` is the first target and fixture for the profile, not a production eligibility constant. The shared validator receives record facts and evidence, so equally shaped records receive the same result regardless of change name.

### Boundaries

- Reconciliation contract validation owns no command execution, Git mutation, spec synchronization, or archival.
- Router/readiness owns classification and blocker aggregation, not filesystem moves.
- Close owns safe path resolution, evidence reads, current-state acquisition, final validation, and the existing archive move.
- Runtime adapters own argument parsing and presentation only.
- `sdd-tasks` will slice implementation work; this design contains no executable task plan.

### Alternatives rejected

- **General `--force` bypass:** rejected because it would weaken ordinary task/apply/verify/spec guards.
- **Inference from scope-only absence:** rejected because missing artifacts are not delivery evidence and make activation accidental.
- **A change-name allowlist:** rejected because it creates a one-name backdoor; identical qualifying records must receive identical decisions from their shape and evidence.
- **Declarationless-only eligibility:** rejected because a valid `spec_delta: none` declaration with a concrete reason asserts no local delta and is compatible with the same narrow scope-only profile.
- **Accepting every declared record:** rejected because non-none, pending, conflicting, ambiguous, or local-delta states require ordinary synchronization and close guards.
- **Retrospective lifecycle artifacts:** rejected because fabricated map/apply/verify history would misrepresent how delivery occurred.
- **Free-form Markdown only:** rejected because change binding, reason matching, check identity, and repository freshness would be ambiguous.
- **Evidence JSON only:** rejected because reviewers also need a fresh plain-language summary that names gaps and successor work.
- **Arbitrary evidence path:** rejected because it weakens repository locality and makes copied or external evidence harder to audit.
- **Running commands from JSON during close:** rejected because close must not become an arbitrary command executor; it validates attributable evidence instead.
- **A generic profile for every legacy shape:** rejected because reusability does not relax the exact scope-only shape, allowed spec states, fresh evidence, or repository-binding gates.

### Skill fit

Architecture and cognitive-document-design guidance apply through a small shared deterministic boundary, explicit ownership, and scan-friendly requirements. Web UI, Nuxt, and skill-registry guidance do not apply because this change designs no UI/Nuxt surface and changes no skill inventory; Ein discipline applies through the bounded SDD artifact and deferred TDD execution.

## D. Success Criteria

- The `docs-site-shell` first-migration fixture is accepted with its valid `spec_delta: none` declaration and concrete declaration reason only when the canonical JSON artifact, matching valid audit reason, exact current repository-state identity, passing concrete check references, and fresh hash-bound summary also pass.
- A genuinely declarationless scope-only legacy fixture and any differently named fixture with the same qualifying shape and evidence receive the same profile decision; no production change-name allowlist exists.
- The summary visibly states `Delivery occurred outside SDD.`, names all excluded lifecycle artifacts, references all repository checks, and names successor changes or `None.`.
- Records with local deltas, pending or conflicting spec state, sync reports, non-none or ambiguous declarations, mixed-phase artifacts, malformed/absent evidence, invalid reasons, stale summaries, stale checks, mixed repository states, unsafe names, or archive collisions remain active and receive deterministic blockers.
- Normal close behavior and blocker expectations remain unchanged without reconciliation options.
- The existing declarationless-only `force` escape still requires all non-spec gates, still returns `legacyEscape`, does not admit `spec_delta: none`, and cannot be combined with reconciliation.
- Pi tool/slash-command and Claude CLI requests expose equivalent explicit options and resolve through the same core decision.
- Denied cases produce no source/archive mutation; successful reconciliation returns `CloseResult.reconciliation` distinct from `legacyEscape`.
- Later verification must include the focused close/router suites, surface-contract coverage when schemas change, relevant Claude CLI coverage when flags change, the repository-wide `bun test`, and `cd installer && bun run typecheck`. No verification command is run in this design phase.
