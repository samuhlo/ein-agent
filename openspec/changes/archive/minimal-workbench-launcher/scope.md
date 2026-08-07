# Scope — minimal-workbench-launcher

## Outcome

Deliver a separate, minimal CLI/workbench for the beta launcher. It orchestrates a confirmed project and selected Pi or Claude runtime through the existing `ProjectStateV1` projector and runtime-adapter boundary, without becoming an installer TUI or a second owner of project, session, installer, or updater state.

## Scope packet

scope: Build the separate minimal CLI/workbench flow for project selection and confirmation, Pi/Claude selection, ProjectStateV1 status/phase/next/freshness display, capability-aware session choices, safe adapter launch, and compact read-only doctor access.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 120000

## Execution configuration

execution: auto
webfetch: false
strict_tdd: true

The existing `openspec/config.yaml` is authoritative for repository SDD configuration. It records strict TDD, Bun as the package manager, no reliable automatic test runner, and `cd installer && bun run typecheck` as the configured typecheck. This scope phase records those settings only; it does not run tests, builds, typechecks, or other verification commands.

## Problem statement

The roadmap promises a launcher that lets a user move from a selected project to a selected runtime while preserving source authority and runtime privacy. `ProjectStateV1` already normalizes project identity, OpenSpec progress, Git state, verification freshness, and runtime metadata; the adapter contract already supplies provider-specific capabilities, state-bound requests, and a non-shell launch boundary. The missing slice is the small orchestration surface that presents these facts and choices without duplicating installation, update, or private session logic.

## In scope

1. **Separate entrypoint and project confirmation**
   - Provide one CLI/workbench entrypoint separate from the installer TUI.
   - Present discoverable project candidates using existing project identity/state boundaries.
   - Require explicit selection and confirmation before runtime or session actions.
   - Bind the confirmed flow to the selected project identity and its `ProjectStateV1`.

2. **Runtime selection**
   - Offer Pi and Claude as the supported runtime choices.
   - Preserve provider-specific capability differences from `RUNTIME_CAPABILITY_MATRIX`.
   - Do not infer support from a shared method name or silently fall back to another runtime.

3. **Project-state presentation**
   - Consume, rather than recreate, `ProjectStateV1`.
   - Show the selected project's status context, active OpenSpec phase when known, next step when known, source quality/reason, and verification freshness.
   - Distinguish current, incomplete, ambiguous, unavailable, invalid, stale, absent, and other non-current values; never promote stale or unknown evidence.
   - Keep project identity and runtime context visible enough to confirm that subsequent actions use the intended project.

4. **Capability-aware session choices**
   - Offer bounded recent-session listing only where the selected adapter advertises and successfully validates listing (currently Pi; Claude remains explicit unsupported).
   - Offer request-only creation for supported providers without claiming a persisted session.
   - Offer resume only when the selected adapter advertises and validates a supported same-provider reference; current adapter evidence keeps resume fail-closed/unsupported for both providers.
   - Render unsupported, unavailable, cancelled, and normalized error outcomes explicitly, without transcript content, private paths, raw ids, or fabricated metadata.

5. **Safe runtime launch**
   - Launch only through the adapter's validated state-bound plan and non-shell executor (`buildLaunchPlan`/`executeLaunchPlan` boundary).
   - Pass the confirmed project and provider selection to the adapter; report only its normalized result.
   - Preserve fixed executable/argv and adapter-owned isolation; reject caller-controlled command strings, argv, shell interpolation, or guessed resume flags.
   - Leave installer files, updater state, shared project state, verification evidence, and private runtime histories unchanged.

6. **Compact doctor access**
   - Expose a compact doctor action that delegates to the existing read-only doctor surface (`ein_pi_doctor` or its established entrypoint contract).
   - Return to the workbench flow after the result or a bounded actionable unavailable diagnostic.
   - Keep installation, update, repair, and release ownership outside the workbench.

## Explicitly out of scope

- Expansion of the installer TUI.
- Any new UI framework dependency.
- Updater or updater configuration ownership.
- General configuration management.
- Full dashboard, general navigation, or tabs.
- Transcript/history migration, export, merge, or cross-runtime continuity.
- Parallel writers, agent parallelism, or worktree orchestration.
- Cleaner or architect behavior, including read/write mutations.
- Installer installation logic, runtime installation, repair, or update logic.
- Release changes, versioning, packaging, publishing, or remote publication.
- New persisted project/session state, session indexes, caches, or a second projector/state owner.

## Existing foundations and bounded dependencies

| Source | Role in this slice |
|---|---|
| `docs/roadmap-features-ein.md` | Canonical beta launcher intent, boundaries, dependencies, and exclusions. |
| `openspec/changes/archive/shared-project-state-contract/summary.md` | Delivered B contract and known ownership/verification guarantees. |
| `openspec/changes/archive/shared-project-state-contract/design.md` | B design decisions, privacy boundary, and launcher non-goals. |
| `openspec/changes/archive/runtime-session-adapters/summary.md` | Delivered C adapter capabilities, launch boundary, and known resume limitation. |
| `openspec/changes/archive/runtime-session-adapters/design.md` | C contract, provider asymmetry, state binding, and safe execution decisions. |
| `ein-pi/agent/lib/project-state.ts` | `ProjectStateV1` source-quality, OpenSpec phase/next, Git, verification, and runtime metadata projection. |
| `ein-pi/agent/lib/runtime-session-adapters.ts` | Provider matrix, list/create/resume requests, safe launch plan/executor, and normalized outcomes. |
| `ein-pi/agent/extensions/ein-ai.ts` | Existing Pi CLI/tool wiring, SDD status surface, and current `/ein:resume` behavior; read-only compatibility dependency. |
| `ein-pi/agent/extensions/ein-doctor.ts` | Existing read-only doctor tools and command entrypoints; workbench must delegate rather than absorb them. |
| `tests/shared-project-state.test.ts` | Focused B contract evidence for state shape, ambiguity, freshness, degradation, and privacy. |
| `tests/runtime-session-adapters.test.ts` | Focused C contract evidence for capabilities, project binding, privacy, unsupported resume, and safe launch. |

The two archived designs establish that B and C are complete predecessor slices. The new launcher must consume their contracts and must not reopen their ownership decisions.

## Acceptance boundaries for later phases

- A user can enter the separate workbench, select and confirm a project, choose Pi or Claude, and see the selected identity before session actions become available.
- The summary is derived from the confirmed `ProjectStateV1`; phase/next and verification freshness retain projector quality/reason values and visibly label uncertainty or staleness.
- Session actions are capability-aware: no Claude listing, no unsupported resume, no fabricated session references, and no private transcript/path exposure.
- Create/list/resume choices remain state-bound and safe; launch uses the adapter's fixed non-shell boundary and normalized result contract.
- Doctor is compact, read-only, actionable on unavailability, and returns control to the workbench without mutating installer-owned state.
- The launcher remains a separate orchestration surface and does not duplicate installation, updater, configuration, dashboard, tab, release, or publication logic.

## Risks and bounded decisions

- **Runtime asymmetry:** current C evidence supports Pi listing and both-provider create/launch, while resume is unsupported; the UI must expose this rather than imply parity.
- **Stale evidence:** Git/state changes can invalidate verification; presentation must preserve `ProjectStateV1.verification.freshness` and source reasons.
- **Ownership drift:** adding persistence, shell commands, installer calls, or a second status projector would violate B/C boundaries; later map/design must keep seams explicit.
- **Doctor coupling:** the existing doctor surface is Pi-oriented; the compact action must delegate or report bounded unavailability rather than reimplement diagnostics.

## Persisted behavior declaration provenance

The active canonical change already carries its sole validated behavior declaration at:

`openspec/changes/minimal-workbench-launcher/specs/sdd-lifecycle/spec.md`

Persisted delta provenance:

- format: `openspec-delta/v1`
- domain: `sdd-lifecycle`
- SHA-256: `54e49904fd3f739fa9be65e746bff48345e9c1a0f5a136e8ff319913357b80f8`
- bytes: `4220`
- scenarios: `workbench-launcher-capability-aware-sessions`, `workbench-launcher-compact-doctor`, `workbench-launcher-project-runtime-flow`, `workbench-launcher-safe-runtime-launch`, `workbench-launcher-state-freshness`

The complete persisted delta set was inspected and passes the existing declaration shape: all five scenarios are unique `ADDED` entries, every requirement begins with `The system MUST`, and each scenario has non-empty title, given, when, and then fields. The persisted delta is authoritative and was preserved byte-for-byte; no contradictory `spec_delta: none` declaration is added.

## Canonical OpenSpec context

Only the following selected canonical specification was read, within the three-file/32 KiB phase limit:

- path: `openspec/specs/sdd-lifecycle/spec.md`; sha256: `993e5cb40d0ac64af7d1dcca9f7ca3df0ca50362b5ed6cf638bf929a0ba8f7bf`; bytes: `29805`

## Phase boundary and handoff

This is a scope artifact only. No implementation, test execution, build, typecheck, apply-progress, or verify-report work belongs here. The map phase should identify the smallest separate entrypoint/orchestration seam, its project/runtime/session/doctor adapters, and focused behavior tests while preserving the exclusions and the persisted delta as authoritative.
