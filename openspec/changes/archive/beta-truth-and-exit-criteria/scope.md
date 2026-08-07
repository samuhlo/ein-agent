# Scope: beta-truth-and-exit-criteria

## SCOPE PACKET

```yaml
scope: Reconcile the repository's beta truth against the canonical A–L feature roadmap and current release evidence, publish explicit A–E beta exit criteria and requirement/posterior/beta-discard classifications, and bound the documentation-only corrections needed before launcher implementation.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 300000
```

## Execution context

- **Execution mode:** interactive. This scope phase performs no implementation, documentation update, test/build, release, commit, or delivery action.
- **Web:** disabled (`webfetch: false`). Release claims are limited to repository-local tags, files, workflows, and archived SDD evidence.
- **Strict TDD:** enabled in the existing `openspec/config.yaml`. It is recorded for later phases only; this change is documentation-only and this scope phase does not run the test suite.
- **Working-tree safety:** the pre-existing dirty/untracked state is preserved. In particular, do not revert, stage, delete, or rewrite `docs/ein-multiagente-plan.md`, `docs/review-workload-guard.md`, `docs/borrador_nuevas_feats_EIN.md`, `docs/ein_futuras_features.md`, or `docs/roadmap-features-ein.md`. The new SDD artifact is the only file written by this phase.

## Project and testing context

The existing `openspec/config.yaml` is preserved. It records a Node.js/TypeScript ESM installer project, Bun as package manager, GitHub Actions, `strict_tdd: true`, and `cd installer && bun run typecheck` as the configured typecheck. Its test-runner fields are blank/stale relative to repository evidence: `.github/workflows/ci.yml` runs the root Bun suite with `bun test`, and the repository contains Bun tests with `tests/preload-env.ts`. No test, build, or typecheck was run in this scope phase.

The relevant release/E2E conventions are bounded as follows:

- CI runs the root Bun suite and installer typecheck on Ubuntu and macOS.
- The installer release workflow is tag-driven by `installer-v*`, typechecks, builds four targets, runs a compiled Claude-payload smoke, generates checksums, and publishes through GitHub Actions.
- The installer E2E workflow is manual (`workflow_dispatch`) and invokes `./e2e/docker-test.sh` in an Ubuntu runner; it is not evidence of the future launcher E2E contract.
- The current `e2e/docker-test.sh` metadata defines four installer scenarios: invalid runtime, default Pi, Claude-only, and Both, with valid scenarios repeated for convergence and Both checking Pi before Claude.

## Canonical OpenSpec context and delta decision

No canonical behavior domains were provided in the task (`canonical_spec_domains: none known`), so no `openspec/specs/<domain>/spec.md` path was selected or read. This change records planning truth and documentation bounds only; it does not alter observable product behavior. The scope therefore uses the required `spec_delta: none` declaration at the end of this artifact and creates no change delta file.

The distinction is intentional: the future launcher, shared state, runtime adapters, and launcher E2E are behavior changes belonging to roadmap changes B–E, not to this documentation reconciliation.

## Objective

Establish one reviewable answer to these questions before any launcher implementation starts:

1. What is the repository's current release and implementation baseline?
2. What exactly is promised by beta in the canonical roadmap, and what is not?
3. Which older documents describe historical work, proposals, or stale release state rather than current acceptance criteria?
4. Which small documentation updates are required so a launcher design cannot accidentally revive an obsolete MVP, updater, dashboard, or installer ownership model?

This change must leave product code, workflows, installer behavior, E2E behavior, and existing project docs untouched during scope. Later apply work, if approved, is limited to the documentation files named under **Bounded apply outputs**.

## Authority order

When sources disagree, later phases must use this order and record the reconciliation rather than silently choosing a convenient claim:

1. `docs/roadmap-features-ein.md` — canonical prioritization and A–L dependency order. It is the source for beta scope, exclusions, and the fact that A precedes B–E.
2. Current release metadata — `installer/package.json`, `installer/src/core/version.ts`, the newest local `installer-v*` tag, and the current `CHANGELOG.md` heading. This is the source for the repository's release baseline, not for launcher readiness.
3. Archived SDD evidence — `openspec/changes/archive/core-parity/{summary,verify-report}.md` and `openspec/changes/archive/installer-beta/{summary,verify-report}.md`, interpreted as historical phase evidence and with their residual gaps retained.
4. `.github/workflows/*`, `e2e/*`, and installer README metadata — evidence of available checks and surfaces, never proof that a future launcher exists or that a remote workflow was executed.
5. `docs/roadmap-beta.md`, `README.md`, `installer/README.md`, and `docs/ein_futuras_features.md` — documentation to reconcile. They are not allowed to override the canonical roadmap or current release metadata when stale.

`docs/roadmap-features-ein.md` is itself an untracked input in the current working tree, but it remains authoritative for this task by explicit user instruction. Do not modify it or infer that untracked means non-canonical.

## Current beta truth

### Baseline that is evidenced now

- The repository's current local release baseline is **installer 0.42.0**: the newest local `installer-v*` tag is `installer-v0.42.0`, `installer/package.json` reports `0.42.0`, `installer/src/core/version.ts` reports `0.42.0`, and `CHANGELOG.md` starts with `[0.42.0] - 2026-08-05`.
- The current baseline includes the installer/runtime groundwork documented in the 0.41.0 changelog entry: explicit `--runtime pi|claude|both`, isolated Pi/Claude installation surfaces, and installer Docker scenario metadata for invalid, Pi, Claude, and Both. This is installer readiness evidence, not launcher beta completion.
- Archived `core-parity` evidence reports `status: pass`, `behavior_coverage: verified`, generated Claude/core parity, and explicit Claude-side OpenSpec synchronization. The old statement that `core-parity` is still pending is therefore historical/stale.
- Archived `installer-beta` evidence reports a local pass with `behavior_coverage: partial`; its recorded residuals include unavailable native macOS execution, one unasserted shared-Bun failure branch, and no claim of a real remote 0.41.0 workflow/release dispatch. The later local 0.41.0/0.42.0 release metadata does not erase those evidence boundaries; it only establishes the current repository baseline.
- The release and installer E2E workflows are available, but the workflow files alone do not prove a live GitHub run. The repository must not claim a remote E2E or release-asset verification unless a separately captured run proves it.

### What is not evidenced as complete

The allowed evidence contains no completion record for the canonical roadmap's B, C, D, or E slices. Therefore beta is **not ready to claim completion** merely because installer 0.42.0, core parity, or installer E2E groundwork exists. The current truth is:

> The installer and Pi/Claude workbench foundation have current release evidence, while the promised beta launcher path remains a future A–E sequence. A is a documentation gate; B defines shared state; C provides runtime adapters; D builds the minimal workbench launcher; E provides launcher-specific E2E hardening.

The existing installer E2E scenarios must not be counted as E. They exercise installer runtime selection and filesystem deployment, not project selection, OpenSpec phase projection, session lifecycle, runtime switching, or verification-freshness invalidation in a launcher.

## Beta requirement classification

The following matrix is the contract that later design/tasks phases must preserve. “Requirement” means it belongs to the A–E beta promise; “posterior” means it may be revisited after beta or in a named later roadmap slice; “discarded for beta” means it must not become an implicit acceptance criterion for A–E. A discarded item is not necessarily forbidden forever; it is forbidden as an unplanned beta expansion.

| Proposal or claim | Classification | Canonical handling | Boundary for later work |
|---|---|---|---|
| Select a project and select Pi or Claude | Requirement | D, using B/C | The minimum flow is project + supported runtime selection; no additional runtime is implied. |
| Show active OpenSpec change/phase and next step | Requirement | B/D | OpenSpec is the authority for active work; unknown/incomplete state must be visible. |
| List, create, resume, and launch runtime sessions | Requirement | C/D | Pi and Claude expose a common surface without pretending their private lifecycle is identical. |
| Compact access to doctor | Requirement | D | Read/diagnose through the existing installer/doctor ownership; do not move installation logic into the launcher. |
| Deterministic shared project-state projection | Requirement | B | Normalize project, phase, next step, EIN context, exact Git state, runtime capabilities/references, and verification freshness. |
| Continuity between Pi and Claude through normalized project state | Requirement | B/C/D | Transfer project state, never private conversation history; resume/switch must expose the state used. |
| Verification evidence tied to the exact code state and invalidated after relevant Git changes | Requirement | B/E | The launcher must not present old verification as current after a relevant code-state change. |
| Launcher-specific E2E for success, failure, and stale verification | Requirement | E | Evidence must be reproducible and tied to the exact state checked. Installer E2E alone is insufficient. |
| Edit all project/global configuration from the launcher | Posterior | The old feature catalog's MVP wording is superseded; configuration sharing is a later design concern, not an A–E acceptance item | Revisit only through a bounded post-beta change; B may expose context without granting mutation ownership. |
| Universal/advanced updater and update checking for every runtime | Posterior / beta-excluded | F is the named post-beta `shared-config-update-advisor`; the canonical roadmap explicitly excludes universal/advanced updater from beta | A–E may show existing installer boundaries but must not implement or promise updater ownership. |
| One-sentence summaries for every prior session | Posterior | Present in the idea catalog, absent from the canonical launcher minimum | Do not require it for D unless a later change explicitly adopts it. |
| Support for arbitrary future agents beyond Pi and Claude | Posterior | Current supported surfaces are Pi and Claude; no generic runtime promise is made | Design extension points only if they do not widen beta scope. |
| Cleaner and architect processes | Posterior | F–K cover advisor, ledger, read-only audits, and guarded mutations after beta | No launcher beta acceptance may depend on cleaner/architect behavior. |
| Safe parallelism with isolated worktrees and ownership rules | Posterior | L is maturity work after K | Do not promise parallel writers or shared-working-tree safety in beta. |
| Full dashboard/general TUI, LazyVim-like navigation, or broad terminal application | Discarded for beta | The canonical roadmap promises a minimal CLI/workbench, not a general TUI | Keep D small and reviewable; no dashboard/navigation expansion. |
| Expanding the installer's TUI into the launcher | Discarded for beta | The launcher is a separate CLI/workbench | Installer owns installation and update; launcher only orchestrates its bounded doctor access. |
| Launcher-owned installation/update implementation | Discarded for beta | The roadmap explicitly preserves installer ownership | No duplicated installer paths, package management, release logic, or updater transaction. |
| Migrating or exposing private conversation histories across runtimes | Discarded for beta | Runtime sessions remain private; continuity transfers normalized project state | A resume may identify its source state but may not claim history migration. |
| Parallel writers or cleaner/architect mutations in the beta launcher | Discarded for beta | Explicitly outside the beta promise and deferred to later slices | Any future mutation requires its own SDD scope, ownership, and fresh verification. |

## Explicit A–E beta exit criteria

These criteria define “ready to call the A–E beta path complete.” They are gates, not a claim that the repository currently satisfies them.

### BE-01 — Reconciled truth and traceability

- A maintained beta record contains the classification matrix, current release baseline, A–E dependency order, explicit exclusions, and links/references to the evidence used.
- Every historical claim from `docs/roadmap-beta.md`, README release pointers, or the feature catalog is either corrected, marked historical, or clearly labeled non-authoritative.
- Current release evidence is separated from beta readiness: an installer release is not evidence that the launcher path is complete.
- No stale document is used as an acceptance criterion without a named reconciliation decision.

### BE-02 — Shared project-state contract exists and is unambiguous

- B defines the authoritative source and representation for project identity, active OpenSpec change/phase/next step, stable EIN context, exact Git state, runtime capabilities/references, and verification freshness.
- The representation distinguishes known, incomplete, unavailable, and stale values instead of inventing a current state.
- The contract states which changes invalidate which verification evidence and how that invalidation is surfaced.
- Private Pi/Claude conversation histories are explicitly outside the shared state.

### BE-03 — Pi and Claude session adapters expose an honest common surface

- C supports list/create/resume/launch for both supported runtimes or reports a deterministic capability/error state where a runtime cannot perform an operation.
- Runtime differences, errors, and capability limits remain visible; a common interface does not imply identical lifecycle semantics.
- A resume or runtime switch identifies the normalized project state used and never claims that private conversation history was transferred.

### BE-04 — Minimal workbench launcher is complete without absorbing the installer

- D allows a user to select a project and Pi or Claude, see the active OpenSpec phase and next step, manage the common session operations, and reach compact doctor diagnostics.
- The launcher uses B's state contract and C's adapters rather than a second source of truth.
- It presents incomplete or stale verification visibly.
- It does not implement installation, update transactions, universal updater behavior, full dashboard navigation, cleaner/architect mutations, or parallel writers.

### BE-05 — Launcher E2E hardening is reproducible and freshness-aware

- E covers the minimum success path from project/runtime selection through session launch.
- E covers runtime/session errors, unavailable or incomplete project state, and actionable diagnostics.
- E changes the relevant code state after verification and proves that the previous evidence is marked stale/invalid rather than inherited automatically.
- E evidence identifies the exact repository/code state verified and is reproducible without relying on private conversation history or a live external provider.
- Installer E2E remains a separate prerequisite/regression signal; it cannot replace launcher E2E.

### BE-06 — Release evidence is current and honest at the beta boundary

- The release candidate's package version, source version marker, changelog entry, tag, workflow outputs, and checksums agree before publication.
- CI and the required launcher E2E evidence pass for the exact candidate state; any manual workflow or native-platform gap is recorded rather than inferred away.
- Publication occurs only through the repository's GitHub Actions release workflow and only after the normal delivery authorization/review gates. This scope does not publish or dispatch anything.

## Bounded apply outputs (documentation-only)

Later apply for this change may edit only the following existing project docs, and only to reconcile the facts and criteria above:

1. **`docs/roadmap-beta.md`** — refresh the historical pre-0.41 status, identify `core-parity` and `installer-beta` as completed historical foundations with their residual evidence boundaries, establish the 0.42.0 repository baseline, add the A–E beta truth/matrix/exit criteria, and distinguish installer E2E from future launcher E2E.
2. **`README.md`** — correct the stale 0.40.0 release/source-of-truth references and align the public runtime/ownership wording with the current Pi + Claude isolated surfaces. Include `--runtime pi|claude|both` only as a current installer capability; do not advertise the future launcher as implemented.
3. **`installer/README.md`** — correct the Pi-only/legacy path and capability descriptions that conflict with the current isolated Pi + Claude installer and runtime selection metadata; retain the release workflow boundary and document E2E as installer E2E, not launcher beta proof.

The following are evidence or planning inputs and are **not** apply outputs for A:

- `docs/roadmap-features-ein.md` remains the canonical prioritization source and is read-only for this change.
- `docs/ein_futuras_features.md` remains a detailed idea catalog, not a beta contract. Do not broadly rewrite it or convert its old MVP list into acceptance criteria. If a future edit is desired, create a separate bounded documentation change.
- `CHANGELOG.md` is current release evidence through 0.42.0; do not rewrite historical release entries as part of A.
- `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `.github/workflows/installer-release.yml`, `e2e/docker-test.sh`, and `e2e/Dockerfile.ubuntu` are evidence only; no workflow, E2E, or product-code change belongs in A.
- Archived `core-parity` and `installer-beta` SDD artifacts are evidence only; do not mutate archived history.

No new project roadmap, launcher code, state contract, adapter, test, E2E scenario, workflow, release, or canonical OpenSpec spec is created by this change.

## Risks and handoff questions

- **Release-versus-beta confusion:** 0.42.0 is a current installer baseline, not a beta-launcher verdict. Map/design must keep those labels separate.
- **Historical evidence drift:** archived installer-beta verification intentionally recorded partial coverage and no remote publication claim. Later phases must not turn its local pass into universal platform or workflow evidence.
- **Catalog inflation:** `docs/ein_futuras_features.md` contains a broader launcher/TUI/updater/configuration wishlist. The canonical roadmap narrows it; map/design must not reintroduce those ideas through acceptance prose.
- **Installer ownership leakage:** the launcher may call compact doctor, but install/update logic stays in installer surfaces.
- **Freshness ambiguity:** BE-05 depends on B defining what a relevant code-state change is. A must require the decision to be explicit, not invent the field semantics.
- **Dirty input protection:** the canonical roadmap and feature catalog are currently untracked inputs, while unrelated tracked docs are deleted. No phase may clean or normalize that state as collateral work.

### Handoff to map/design

Map only the bounded documentation reconciliation and acceptance-record shape. Preserve the authority order, current release baseline, feature classification, BE-01–BE-06 gates, and exact apply file list. Do not map launcher implementation, shared state, runtime adapters, installer changes, workflow dispatch, release publication, or broad catalog cleanup. A should be complete before B is designed.

## Scope phase boundary

This artifact is the complete scope output for `beta-truth-and-exit-criteria`. It writes no product code, no existing project documentation, no tests/build output, no workflow/release metadata, no OpenSpec behavior delta, no `apply-progress.md`, and no `verify-report.md`.

## Spec delta declaration
spec_delta: none
spec_delta_reason: This change only records beta truth and bounds future documentation updates, so it changes no observable behavior.
