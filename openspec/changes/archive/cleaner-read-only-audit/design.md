# Design — cleaner-read-only-audit

## A. Proposal

### Intent

Add the smallest read-only cleaner audit boundary: a pure function that consumes one B-owned `ProjectStateV1` projection and bounded G-owned reviewed-area assessments, then returns deterministic, traceable findings. The audit reports observations, possible opportunities, and unresolved questions without applying or implying any change.

### Scope

**In scope**

- A narrow cleaner-domain module, expected at `ein-pi/agent/lib/cleaner-read-only-audit.ts`.
- A pure audit entrypoint over already-acquired B and G values; it accepts no workspace path or I/O service.
- Findings with a stable identity, severity, classification, repository-relative location or area identity, exact observed Git state identity when available, G outcome/freshness/reason, privacy-safe evidence references, and deterministic uncertainty text.
- Project/ledger eligibility findings and bounded cleaner opportunities supported solely by explicit audit rules over B/G data.
- Focused contract tests, expected at `tests/cleaner-read-only-audit.test.ts`, in the apply phase.

**Out of scope / non-goals**

- Defining speculative cleanup heuristics not supported by the B/G contracts.
- Applying, preview-applying, staging, approving, repairing, refreshing, or persisting a suggestion.
- Reimplementing B projection, G normalization/evaluation, evidence resolution, or a second state/ledger authority.
- Reading arbitrary source contents, resolving raw evidence, or exposing prompts, transcripts, secrets, absolute workspace paths, or private session data.
- Roadmap I bounded mutations, roadmap J architect behavior, and broad cleaner/skill maintenance.

### Affected areas

- **New production seam:** `ein-pi/agent/lib/cleaner-read-only-audit.ts`.
- **New focused contract tests:** `tests/cleaner-read-only-audit.test.ts`.
- **Consumed without modification:** `ein-pi/agent/lib/project-state.ts`, `ein-pi/agent/lib/reviewed-area-ledger.ts`, and the read result types from `ein-pi/agent/lib/reviewed-area-ledger-store.ts`.
- The existing writer exports in `reviewed-area-ledger-store.ts` and cleaner-like writers in `ein-skill-maintenance.ts` remain outside the audit dependency graph.

### Risks

- A stale or unverifiable G assessment could be presented as current or approved.
- A finding could leak an absolute path or evidence payload under the guise of traceability.
- Stable-looking suggestions could be mistaken for applied changes.
- A future convenience dependency could introduce filesystem, Git, ledger, network, or external-system mutation into the audit path.
- Over-broad “opportunity” rules could turn ordinary Git changes into unsupported cleanup claims.

### Rollback

Remove the new audit module, its tests, and any read-only caller wiring. There is no data migration, cache, ledger update, Git operation, or external side effect to reverse; B, G, repository, and OpenSpec state remain authoritative and unchanged.

### Success criteria

- Equivalent B/G inputs produce byte-equivalent report data: identical finding IDs, classification, severity, ordering, confidence, and uncertainty text.
- Every finding has a bounded area or repository-relative source location and explicit state/evidence traceability, including explicit unavailable values.
- Non-current, missing, invalid, stale, ambiguous, or unavailable state/evidence never becomes a current fact, approval, or actionable cleanup claim.
- The report always states `appliedChanges: 0`, and every finding states `applied: false`.
- The audit has no reachable filesystem writer, Git command, ledger writer, SDD writer, process executor, network client, persistence callback, or external-system client.
- Before/after contract checks show no changes to repository bytes, ledger bytes, SDD artifacts, Git index/worktree/HEAD/config/refs, input objects, or external systems.

## B. Spec

### Spec context provenance

- Behavioral delta read: `openspec/changes/cleaner-read-only-audit/specs/sdd-lifecycle/spec.md`.
- Canonical baseline was intentionally **not selected as phase context**: `openspec/specs/sdd-lifecycle/spec.md`, SHA-256 `ff1c0d1274b517d16785e94db921c3b58036f5643b631b1bcfb1a9796c50cb9d`, 39,387 UTF-8 bytes. It exceeds the shared 32 KiB limit recorded by scope; this design does not truncate or claim to have loaded it.
- No mapped canonical domain additions were supplied. The design relies on the bounded change delta plus the mapped B/G public contracts.

### Requirement 1 — Read-only boundary

The system **MUST** expose the cleaner audit as a pure, read-only operation over supplied B and G values. It **MUST NOT** receive or invoke a repository writer, filesystem writer, Git executor, ledger/evidence writer, SDD/OpenSpec writer, cleaner writer, network client, persistence store, or external-system client.

**Scenario**

- **Given** a B projection, applicable G assessments, and a caller that also possesses mutation-capable services,
- **When** the caller requests the cleaner audit,
- **Then** the audit can consume only the declared B/G data, returns a report, and no mutation-capable service is accepted or invoked.

### Requirement 2 — Explicit mutation prohibitions

The system **MUST NOT** create, edit, delete, rename, chmod, stage, commit, reset, checkout, push, synchronize, refresh, repair, cache, or otherwise mutate:

1. repository files or directories;
2. the reviewed-area ledger or evidence;
3. B project-state inputs or any cleaner-owned state;
4. OpenSpec/SDD artifacts or lifecycle state;
5. Git worktree, index, HEAD, history, refs, configuration, or remotes; or
6. network, user-level, process-global, or other external systems.

The system **MUST NOT** import or call `replaceWorkspaceLedger`/`replaceReviewedAreaLedger`, `writeEinMd`, `cleanSkills`, skill installation/update writers, Git delivery/staging/mutation paths, model/mode/config writers, or OpenSpec synchronizers. Mutation intent supplied outside the declared input contract **MUST** be structurally unreachable; an adapter that validates untyped input **MUST** reject it rather than execute it.

**Scenario**

- **Given** snapshots of repository, ledger, SDD, Git, input-object, and external-observer state,
- **When** an audit runs, including through an untyped caller that attempts to supply an apply/write callback,
- **Then** the callback is rejected or unreachable, the report records zero applied changes, and every snapshot remains unchanged.

### Requirement 3 — Traceable findings

The system **MUST** return zero or more findings in a versioned report. Every finding **MUST** include:

- `id`: a deterministic `cleaner-finding-v1:sha256:<64-hex>` identity;
- `rule`: a closed, stable rule code;
- `classification`: `observed-fact`, `inferred-opportunity`, or `unresolved-question`;
- `severity`: `info`, `warning`, or `error`;
- `areaId` and canonical repository-relative selectors when area-bound, or a closed project-state source key when project-level;
- observed B state identity as a valid `stateRef`, or an explicit unavailable/unknown state identity with reason;
- G `outcome`, `freshness`, and `reason` when area-bound;
- only opaque evidence reference/digest values already provided by G, or an explicit evidence-unavailable status;
- closed confidence and deterministic uncertainty text;
- `applied: false`.

A finding **MUST NOT** contain raw evidence, source contents, absolute paths, reviewer identity, prompts, transcripts, secrets, session history, or free-form private metadata.

**Scenario**

- **Given** a bounded area assessment with a repository-relative selector, exact B state identity, and privacy-safe G evidence reference,
- **When** the audit emits a finding for that area,
- **Then** the finding identifies the area/path, severity, state reference, G assessment, and opaque evidence reference without exposing evidence content or private paths.

### Requirement 4 — Facts, opportunities, and questions remain distinct

The system **MUST** represent direct B/G observations as `observed-fact`, rule-supported cleanup suggestions as `inferred-opportunity`, and missing or non-current preconditions as `unresolved-question`. It **MUST NOT** label a Git change alone as a cleanup opportunity, and it **MUST NOT** represent any finding as approval, human review, verification success, or an applied change beyond what B/G explicitly and currently establish.

Each inferred opportunity **MUST** name the bounded rule that produced it and **MUST** remain a suggestion with `applied: false`. In this slice, rules **SHOULD** be limited to state/evidence eligibility and explicit B/G-supported cleaner observations; broader cleanup heuristics require a separate behavior delta.

**Scenario**

- **Given** B reports a changed repository path but no explicit cleaner rule establishes that the path is removable or obsolete,
- **When** the audit classifies the input,
- **Then** it may report the path as an observed fact or unresolved question but does not claim a cleanup opportunity or applied fix.

### Requirement 5 — Fail-closed uncertainty

The system **MUST** preserve B source quality/reason and G outcome/freshness/reason. Missing `stateRef`, incomplete/non-current Git projection, and stale, invalid, unavailable, ambiguous, unknown, mismatched, or unverifiable evidence **MUST** remain visible as an `unresolved-question` and **MUST NOT** produce a current actionable opportunity, current review claim, or approval.

**Scenario**

- **Given** a G evaluation is stale, invalid, unavailable, or unknown, or B lacks a complete current Git identity,
- **When** the audit runs,
- **Then** the report emits deterministic uncertainty with the original reason and does not promote the condition to a current finding or approval.

### Requirement 6 — Deterministic identity and ordering

The system **MUST** derive finding identity only from canonical, privacy-safe semantic fields: report/rule version, area ID or closed source key, sorted selectors, classification, relevant B state identity/quality/reason, G outcome/freshness/reason, and opaque evidence reference/digest status. It **MUST NOT** include timestamps, object insertion order, absolute workspace paths, random values, or process/session identity.

Findings **MUST** be sorted using a specified UTF-8 byte order over area/source key, rule, location, and finding ID. Equivalent normalized inputs in any input order **MUST** return equivalent deeply immutable output.

**Scenario**

- **Given** two semantically equivalent B/G inputs whose area assessments or selectors arrive in different orders,
- **When** both are audited,
- **Then** their reports have identical finding IDs, classifications, severities, ordering, confidence, uncertainty text, and zero-change statement.

### Requirement 7 — Human-review and evidence boundary

The system **MUST** defer reviewed-area meaning to G. Session existence, artifact presence, automation success, verification output, or cleaner-rule success **MUST NOT** create or upgrade a reviewed/approved claim. Only G's exact `reviewed/current` outcome bound to the observed B state may be reported as current review evidence, and even that **MUST NOT** be called approval.

**Scenario**

- **Given** an OpenSpec artifact and successful automation exist but G reports no record or unverifiable evidence,
- **When** the audit runs,
- **Then** it reports the G condition as unreviewed or unresolved and does not infer human review or approval.

### Requirement 8 — Unambiguous no-change report

The system **MUST** return a report-level `mode: "read-only"`, `appliedChanges: 0`, and a stable no-change statement. It **MUST NOT** expose an apply method or encode proposed content as if it had been written. It **MAY** provide a human-readable suggestion only when the same finding retains its traceability, uncertainty, and `applied: false` fields.

**Scenario**

- **Given** one or more inferred opportunities are found,
- **When** the report is consumed,
- **Then** every opportunity is visibly a suggestion, the report records zero applied changes, and no repository or external state changes.

## C. Decisions

### 1. One pure domain function, no path-based audit service

Use one narrow function such as `auditCleanerReadOnly(input): CleanerAuditReportV1`. Its declared input contains a readonly B `ProjectStateV1` and readonly, bounded G-owned area/evaluation/evidence projections. Acquisition happens outside the cleaner audit: B may project once and G may read/evaluate once through their existing read-only seams.

This keeps authority with B/G and makes mutation capabilities absent by construction. The cleaner module does not accept `cwd`, call `projectProjectState`, read the workspace ledger, shell out, or resolve evidence itself.

### 2. Reuse G outcomes rather than reinterpret ledger semantics

G owns area canonicalization, evidence matching, transition validity, and reviewed/stale/unknown meaning. H only maps those closed outcomes into finding classification, severity, confidence, and uncertainty templates. H must not infer a historical transition from B's current `git.changes`.

### 3. Stable value object report

Return a deeply immutable, versioned value object. IDs are SHA-256 hashes of canonical semantic fields, and ordering is explicit UTF-8 byte ordering. Fixed reason-to-message templates keep uncertainty deterministic. No timestamp or run/session ID is included because exact B `stateRef` plus area/evidence identity provides traceability without nondeterminism.

### 4. Minimal rule surface

Each opportunity comes from a closed, named pure rule. Ordinary dirty/changed state is not itself a cleanup rule. This slice establishes state/evidence eligibility and the finding envelope; any new repository-content heuristic needs an explicit later behavior delta rather than a generic plugin system.

### 5. Ownership boundaries

- **B (`project-state.ts`) owns:** projection, source quality/reason, exact Git identity, and current changes.
- **G (`reviewed-area-ledger*.ts`) owns:** ledger parsing/reading, bounded areas, evidence validation, transitions, and review outcome/freshness/reason.
- **H (`cleaner-read-only-audit.ts`) owns:** pure classification, severity/confidence templates, deterministic IDs/order, privacy-safe output projection, and the explicit zero-change report.
- **Caller owns:** invoking B/G read-only seams and supplying their normalized results; it receives data only and must not pass writers into H.
- **Roadmap I owns:** any selected finding mutation, its SDD slice, updated evidence, and verification.

### 6. Alternatives rejected

- **Reuse `skills clean --yes`:** rejected because it deletes directories and concerns skill maintenance, not audit classification.
- **Inject a generic filesystem/Git/ledger service:** rejected because it creates a mutation capability and a second authority.
- **Let H call the ledger writer in “dry-run” mode:** rejected because writer reachability violates the boundary and dry-run semantics can drift.
- **Create a cleaner state store/cache:** rejected because it adds persistence, stale identity risk, and unnecessary ownership.
- **Plugin/strategy framework for future rules:** rejected by YAGNI; closed pure rules are sufficient for this bounded slice.
- **Use timestamps or random run IDs:** rejected because they break equivalent-input determinism; B state identity is the trace anchor.
- **Treat every Git change as a cleanup opportunity:** rejected because B describes state, not removability or obsolescence.

### Skill applicability

- `ein-discipline` and `architecture` apply: this design keeps the SDD boundary explicit and chooses the smallest domain function without speculative patterns.
- `vitest` is not applied because existing contracts use `bun:test` and this phase neither writes nor runs tests.
- `web-design-guidelines` and `vueuse` are not applicable because the slice has no web UI or Vue/Nuxt surface.

## D. Success Criteria

The change is acceptable when later apply/verify evidence demonstrates all of the following:

1. Valid current B/G fixtures produce traceable findings with stable ID, rule, classification, severity, area/path, exact state identity, G status, privacy-safe evidence status, confidence, uncertainty, and `applied: false`.
2. Stale, invalid, unavailable, ambiguous, missing, mismatched, and unknown fixtures remain unresolved with their reason visible and cannot produce current review, approval, or actionable opportunity claims.
3. Equivalent normalized inputs, including reordered areas/selectors, produce deeply equal reports and canonical ordering.
4. Report-level output is always read-only with `appliedChanges: 0` and an explicit no-change statement.
5. Before/after snapshots prove repository files, ledger/evidence bytes, OpenSpec/SDD artifacts, Git worktree/index/HEAD/config/refs, input values, and observed external systems are unchanged.
6. Dependency/import checks prove the H module has no filesystem mutation API, child-process/Git executor, ledger replacement export, OpenSpec synchronizer, cleaner writer, network client, persistence store, or callback injection seam.
7. An untyped mutation callback cannot be reached; if an adapter accepts untyped input, mutation-intent fields are rejected deterministically.
8. Existing B and G contract behavior remains unchanged. No reliable repository-wide test command is configured in `openspec/config.yaml`; the apply/tasks phases must identify the focused Bun invocation rather than treating `cd installer && bun run typecheck` as coverage for this `ein-pi` module.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "The design review finding names openspec/changes/cleaner-read-only-audit/design.md with info severity; residual risks are recorded separately, and the designed finding contract requires repository-relative paths and severity for every emitted finding."
    }
  ],
  "changedFiles": [
    "openspec/changes/cleaner-read-only-audit/design.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [],
  "validationOutput": [
    "Design was checked manually against scope.md, map.md, the declared behavior delta, B/G public contracts, existing B/G tests, and openspec/config.yaml.",
    "No test, build, typecheck, or source implementation command was run because this is the design phase."
  ],
  "residualRisks": [
    "No concrete repository-content cleanup heuristic exists in the current delta; broader opportunity rules need a later explicit behavior delta.",
    "Read-only safety depends on keeping all future acquisition and writer capabilities outside the H dependency graph.",
    "The canonical sdd-lifecycle baseline exceeds the 32 KiB context limit and was not loaded."
  ],
  "noStagedFiles": true,
  "diffSummary": "Added the bounded design for a pure deterministic cleaner audit over B/G data with explicit mutation prohibitions and zero-change output.",
  "reviewFindings": [
    "info: openspec/changes/cleaner-read-only-audit/design.md - no blockers; the proposal explicitly excludes repository, ledger, SDD, Git, cleaner-state, and external-system mutations."
  ],
  "manualNotes": "Only design.md was written; source and tests were not edited."
}
```
