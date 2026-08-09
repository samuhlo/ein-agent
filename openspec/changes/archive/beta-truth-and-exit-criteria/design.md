# Design: canonical beta truth and exit criteria

## A. Proposal

### Intent

Reconcile the repository’s documentation around one current beta-status record before launcher work begins. The change makes `docs/roadmap-beta.md` the maintained source for current beta truth and measurable A–E exit criteria, while preserving `docs/roadmap-features-ein.md` as the authority for prioritization and dependency order.

### Problem statement

Current public and planning documents mix an old 0.40.0 release snapshot, unfinished historical changes, broader launcher ideas, and current installer capabilities. Without a bounded reconciliation, later launcher work could mistake an installer release for launcher completion or revive obsolete updater, dashboard, configuration, and installer-ownership promises.

### Scope

**In scope**

- Refresh `docs/roadmap-beta.md` into the maintained beta-status and acceptance record.
- Record installer 0.42.0 as the current repository release baseline without calling the A–E launcher path complete.
- Preserve the A → B → C → D → E dependency order, the requirement/posterior/discarded-for-beta classification, and BE-01 through BE-06.
- Correct current-facing release, runtime, ownership, and E2E wording in `README.md` and `installer/README.md`.
- Mark stale claims as historical or superseded and retain their evidence limits instead of altering archived evidence or changelog history.

**Non-goals**

- No launcher, shared-state projector, runtime adapter, session operation, doctor integration, freshness algorithm, or launcher E2E implementation.
- No installer, workflow, release, tag, checksum, test, build, typecheck, or publication change.
- No broad rewrite of the feature catalog, canonical A–L roadmap, changelog, archived SDD evidence, or unrelated dirty files.
- No claim that a workflow ran remotely, native macOS passed, or release assets were verified unless separate evidence proves it.
- No behavior spec delta. Future behavior belongs to B–E.

### Affected areas

| Area | Intended change |
|---|---|
| `docs/roadmap-beta.md` | Own the current beta baseline, classification matrix, A–E order, evidence boundaries, exclusions, and BE-01–BE-06. |
| `README.md` | Correct current release/runtime wording and link readers to the maintained beta record without advertising the future launcher as implemented. |
| `installer/README.md` | Describe current isolated Pi/Claude installer selection and label existing E2E as installer E2E while retaining installer ownership. |
| All other files | Read-only evidence or out of scope. |

No product source or test file is relevant to this documentation-only change; the map already bounds the release and E2E evidence used by the documentation.

### Canonical spec context

The scope declares `canonical_spec_domains: none known` and `spec_delta: none`. No canonical behavior spec is selected or read.

| Path | SHA-256 | UTF-8 bytes |
|---|---:|---:|
| None | N/A | 0 |

Selection total: **0 files, 0 bytes**. No behavior delta file will be created.

### Risks

- Readers may still equate installer 0.42.0 with launcher beta completion.
- Historical local verification may be overstated as native-platform or remote-workflow evidence.
- Repeating the full beta contract in multiple files may create a new source-of-truth conflict.
- Broader catalog ideas may leak back into A–E acceptance criteria.

### Rollback

Revert only the reconciliation edits in the three allowed documentation files. Do not revert or normalize pre-existing working-tree changes, and do not modify canonical roadmap, changelog, workflow, E2E, release, or archived SDD evidence during rollback.

### Success criteria

The maintained beta record identifies the 0.42.0 installer baseline, states that B–E are not evidenced complete, preserves all classifications and BE-01–BE-06, and labels historical evidence limits. The two READMEs agree with that record and current installer ownership without duplicating the full contract or promising an implemented launcher.

## B. Spec

### REQ-01 — One maintained beta truth

The documentation set **MUST** designate `docs/roadmap-beta.md` as the maintained source for current beta status and A–E exit criteria. It **MUST** treat `docs/roadmap-features-ein.md` as the higher authority for prioritization and A–L dependency order, and **MUST NOT** create a competing roadmap.

**Scenario**

- **Given** a reader wants to determine whether the beta launcher path is complete,
- **When** the reader follows the repository documentation,
- **Then** the reader reaches one maintained beta-status record that applies the canonical roadmap’s A–E order and does not infer readiness from another stale document.

### REQ-02 — Current baseline remains distinct from beta readiness

The maintained beta record **MUST** identify installer **0.42.0** as the current repository release baseline, supported by the local tag, package version, source version marker, and changelog heading recorded in scope. It **MUST** state that this baseline and the completed `core-parity` and `installer-beta` foundations do not prove B, C, D, or E complete.

**Scenario**

- **Given** installer 0.42.0 and historical foundation evidence exist,
- **When** a reader assesses launcher readiness,
- **Then** the documentation reports the foundation as current evidence but reports the A–E launcher path as incomplete until every applicable exit gate is satisfied.

### REQ-03 — Beta classification is complete and bounded

The maintained beta record **MUST** preserve the scope’s requirement/posterior/discarded-for-beta classifications without widening them:

- **Requirements:** project plus Pi/Claude selection; active OpenSpec change, phase, and next step; list/create/resume/launch session operations; compact doctor access; deterministic normalized project state; continuity through normalized state; exact-code-state verification freshness; and launcher-specific success, failure, and stale-verification E2E.
- **Posterior or beta-excluded:** launcher configuration mutation; universal or advanced updater behavior; per-session summaries; arbitrary future agents; cleaner/architect processes; and safe parallelism.
- **Discarded for beta:** full dashboard/general TUI; expansion of the installer TUI into the launcher; launcher-owned installation/update logic; private conversation-history migration; parallel writers; and cleaner/architect mutations.

A discarded item **MUST** mean excluded from unplanned A–E acceptance, not erased from future consideration.

**Scenario**

- **Given** a historical catalog proposes a broad TUI, updater, configuration editor, or additional agents,
- **When** a reviewer compares that proposal with the maintained beta record,
- **Then** the proposal is visibly posterior or discarded for beta and does not become an implicit launcher acceptance criterion.

### REQ-04 — Exit criteria are measurable gates

The maintained beta record **MUST** publish BE-01 through BE-06 as gates, not as claims of current completion:

- **BE-01:** one traceable record contains the baseline, matrix, A–E order, exclusions, evidence references, and reconciliation of stale claims.
- **BE-02:** B defines authoritative project/OpenSpec/EIN/Git/runtime/freshness state, explicit known/incomplete/unavailable/stale representations, invalidation semantics, and exclusion of private histories.
- **BE-03:** C exposes honest Pi/Claude list/create/resume/launch capabilities or deterministic capability/error states without false lifecycle equivalence or history transfer.
- **BE-04:** D completes the minimal project/runtime workbench, OpenSpec next-step visibility, common session operations, compact doctor, and stale/incomplete-state presentation without absorbing installer or post-beta responsibilities.
- **BE-05:** E reproducibly covers launcher success, failure, incomplete state, actionable diagnostics, and invalidation after a relevant code-state change for the exact state checked; installer E2E cannot substitute for it.
- **BE-06:** the release candidate’s package/source/changelog/tag/workflow/checksum evidence agrees, required CI and launcher E2E correspond to the exact candidate, gaps remain explicit, and publication stays within authorized GitHub Actions delivery.

**Scenario**

- **Given** a future release candidate has current installer metadata,
- **When** the team evaluates the A–E beta path,
- **Then** beta completion is accepted only when BE-01 through BE-06 have state-specific evidence and any manual or platform gap is recorded rather than inferred away.

### REQ-05 — Historical claims are reconciled without rewriting history

Current-facing docs **MUST** correct or qualify stale claims, and the maintained beta record **MUST** identify the time/context in which superseded claims were true or believed. Archived SDD artifacts and `CHANGELOG.md` **MUST** remain immutable evidence for this change; residual limits from `installer-beta` and `core-parity` **MUST** remain visible.

The record **MUST NOT** convert a local historical pass into native macOS, live-provider, remote workflow, or publication evidence. It **SHOULD** link to the original evidence rather than copy or sanitize it.

**Scenario**

- **Given** the old roadmap says `core-parity` is pending, 0.40.0 is latest, E2E never ran, and non-interactive runtime selection is unavailable,
- **When** the roadmap is reconciled against current and archived evidence,
- **Then** those statements are labeled historical or superseded, their original evidence remains unchanged, and any unresolved verification boundary remains explicit.

### REQ-06 — Public docs stay thin and truthful

`README.md` and `installer/README.md` **MUST** describe `--runtime pi|claude|both` only as a current installer capability and **MUST NOT** advertise the future launcher as implemented. They **MUST** preserve installer ownership of installation, update, release, and installer doctor behavior, and **MUST** distinguish installer E2E from future launcher E2E.

The READMEs **SHOULD** point to the maintained beta record instead of duplicating its matrix and exit criteria.

**Scenario**

- **Given** a new reader starts from either README,
- **When** the reader reviews current capabilities,
- **Then** the reader can identify the supported Pi/Claude installer surface and current release without mistaking the installer menu or installer E2E for the beta launcher.

### REQ-07 — Documentation-only boundary

The change **MUST** edit project documentation only in `docs/roadmap-beta.md`, `README.md`, and `installer/README.md`. It **MUST NOT** alter product code, tests, specs, workflows, E2E, release metadata, canonical roadmap, idea catalogs, changelog, archived evidence, or unrelated working-tree state.

The change **MUST** retain `spec_delta: none` because it changes no observable product behavior.

**Scenario**

- **Given** the repository contains dirty, untracked, and historical inputs,
- **When** this reconciliation is applied,
- **Then** the reviewable project-document patch is confined to the three allowed files and no behavior or historical evidence artifact changes.

## C. Decisions

### Decision 1 — Separate prioritization authority from status authority

`docs/roadmap-features-ein.md` remains canonical for prioritization, scope, and sequence. `docs/roadmap-beta.md` becomes canonical only for current beta status, evidence reconciliation, classifications, and exit gates. This split prevents contradictory status claims without duplicating the A–L roadmap.

### Decision 2 — Keep the full contract in one file

The classification matrix and BE-01–BE-06 live in `docs/roadmap-beta.md`. The root and installer READMEs carry only current-facing facts, ownership boundaries, and a reference to the maintained record. This is the smallest correction that avoids future drift.

### Decision 3 — Preserve history through annotation and immutable evidence

Stale roadmap statements are not silently deleted as though they never existed. The maintained record identifies them as historical or superseded, states the newer evidence and date/release context, and preserves residual limitations. Archived SDD reports and changelog entries are never edited to make the story cleaner.

### Decision 4 — Evidence definitions remain conservative

Workflow files prove that checks exist, not that runs passed. Installer E2E proves installer deployment scenarios, not launcher behavior. Local archived passes remain bounded by their recorded native-platform, shared-Bun-branch, live-provider, and remote-publication gaps.

### Decision 5 — A defines gates; B–E own behavior

A owns documentation truth, classification, and acceptance boundaries. B owns shared-state and freshness semantics; C owns runtime session adapters; D owns the minimal launcher; E owns launcher-specific E2E. Installer surfaces retain installation, update, release, and existing doctor ownership.

### Decision 6 — No canonical behavior delta

`spec_delta: none` is retained. A documentation-only reconciliation does not create or modify `openspec/specs/<domain>/spec.md`; behavior design starts in the later B–E changes.

### Alternatives rejected

- **Treat installer 0.42.0 as beta completion:** rejected because no completion evidence exists for B–E.
- **Make the idea catalog the beta contract:** rejected because it contains broader, non-authoritative proposals.
- **Copy the full matrix into every README:** rejected because duplication would create multiple drifting truths.
- **Rewrite archived reports or changelog entries:** rejected because that would erase evidence boundaries and historical context.
- **Design launcher internals now:** rejected because it crosses the A phase boundary and invents behavior that belongs to B–E.

### Skill applicability

The architecture skill supports the simplicity-first, bounded ownership decisions. Cognitive document design and document-writer guidance support answer-first structure, complete prose, and reviewable tables. Frontend design, Nuxt, and web-design-guidelines do not apply because this change has no UI, Nuxt, or web-surface implementation or audit.

## D. Success Criteria

The change is acceptable only when all of the following observable checks pass:

1. The project-document patch contains exactly `docs/roadmap-beta.md`, `README.md`, and `installer/README.md`; unrelated pre-existing working-tree state is unchanged.
2. `docs/roadmap-beta.md` names 0.42.0 as the current installer baseline and explicitly says this is not evidence that B–E or the launcher beta path are complete.
3. `docs/roadmap-beta.md` contains the complete requirement/posterior/discarded-for-beta classification and all six uniquely labeled gates, BE-01 through BE-06.
4. The A–E order is explicit: A truth gate, B shared state, C runtime adapters, D minimal launcher, E launcher E2E hardening.
5. The record distinguishes installer E2E from launcher E2E and retains the archived evidence gaps: native macOS was unavailable for `installer-beta`, one shared-Bun failure branch was unasserted, no real remote 0.41.0 publication was claimed, and live Claude MCP was outside `core-parity` verification.
6. Every stale current-facing claim is either corrected or marked historical/superseded. No unqualified text says that 0.40.0 is current, `core-parity` or `installer-beta` is pending, `--runtime` is unavailable, or existing installer E2E proves launcher E2E.
7. Both READMEs describe the isolated Pi and Claude installer surface consistently, mention `--runtime pi|claude|both` only as installer behavior, preserve installer ownership, and do not claim a launcher exists.
8. The canonical roadmap, catalog, changelog, archived changes, workflow/E2E files, release metadata, product code, tests, and canonical specs have no change attributable to this reconciliation.
9. No behavior delta file exists for this change, and the design/apply record retains `spec_delta: none`.
10. Markdown has no whitespace errors. No test, build, or typecheck is required because the accepted patch changes documentation only.

Known verification commands for the later verification phase are:

```bash
git diff --check -- docs/roadmap-beta.md README.md installer/README.md
git diff --name-only -- docs/roadmap-beta.md README.md installer/README.md
grep -nE 'BE-0[1-6]' docs/roadmap-beta.md
grep -nF '0.42.0' docs/roadmap-beta.md README.md
grep -nF -- '--runtime pi|claude|both' README.md installer/README.md
```

The file-name command must report the three allowed project docs and no other project-document output for this change. Semantic review must confirm the classifications, evidence qualifiers, and historical annotations; string matching alone is insufficient.
