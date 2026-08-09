status: partial
scope_status: bounded
change: shared-config-update-advisor
phase: map

# Roadmap F map

## Outcome

Roadmap F has a usable shared state foundation and several existing read seams, but no shared configuration/update advisor contract. The smallest safe implementation is a new pure read-only advisor seam that consumes the existing project-state snapshot plus installer-owned read evidence, then is rendered by workbench, Pi-Ein notice, and installer doctor without calling mutation owners.

## Authorities and seams

| Area | Existing authority / exact symbols | Mapping implication |
|---|---|---|
| Shared project state | `ein-pi/agent/lib/project-state.ts`: `ProjectStateV1`, `ProjectStateSource`, `ProjectStateQuality`, `ProjectStateReasonCode`, `ProjectVerificationState`, `ProjectRuntimeState`, `projectProjectState` | Reuse this source-attributed quality/reason/freshness model. Do not create a second project-state store or cache. Existing state is read-only and fail-closed for missing, malformed, ambiguous, stale, and unavailable Git/OpenSpec/EIN evidence. |
| Project config | `ein-pi/agent/lib/mode.ts`: `modeConfigPath`, `globalModeConfigPath`, `readMode`, `writeMode`; `ein-pi/agent/lib/model-config.ts`: `modelConfigPath`, `ModelConfigFileResult`, model readers | These are existing configuration authorities. Advisor must read/normalize their status, never call `writeMode` or model save paths. Project-over-global mode precedence and legacy model path behavior must remain authoritative, not be reimplemented casually. |
| Installer paths/marker | `installer/src/core/paths.ts`: `derivePiInstallPaths`, `isValidInstallMarker`, `resolvePiInstallContext`, `INSTALL_MARKER`; `installer/src/core/version.ts`: `INSTALLER_VERSION`, `readMarkerAt`, `readMarker`, `latestInstallerTag`, `writeMarker` | Marker/version/release evidence is installer-owned. Read through injectable/read-only seams; do not use `writeMarker`. Missing or malformed marker is not current. `latestInstallerTag` is best-effort and currently collapses failure to null, so an adapter must preserve unavailable evidence rather than infer up-to-date. |
| Rich release/ownership evidence | `installer/src/core/release-types.ts`: `MarkerV1`, `MarkerV2`, `OwnershipMarker`, `UpdateOutcome`, `classifyOwnership`; `installer/src/core/marker-v2.ts`: `readMarkerV2`, `classifyOwnership`; `installer/src/core/release-record.ts`: `fetchLatestRelease`, `fetchReleaseByTag`, parsing/error boundaries | Prefer the v2 marker/ownership semantics where available. Preserve `legacy-standalone` and `ownership-ambiguous`; do not silently resolve conflicting owners or versions. Release HTTP parse/network errors are explicit `UpdateStageError` values and should map to unavailable/invalid advice. |
| Mutation owner | `installer/src/cli/update.ts`: `runUpdate`, `refreshPi`; `installer/src/core/transaction.ts`: update transaction and commit/deploy paths; `installer/src/cli/install.ts`: install orchestration; `installer/src/core/marker-v2.ts`: `commitMarkerV2` | These are action boundaries only. Advisor may return an installer-owned handoff/command identifier, but must not import/call `runUpdate`, install runners, transaction/deploy, `commitMarkerV2`, or dependency refreshers. |
| Installer doctor | `installer/src/core/verify.ts`: `DoctorReport`, `runDoctor`; `installer/src/cli/doctor.ts`: `renderReport`, `runDoctorCommand`; `installer/src/cli/menu.ts`: `runMenu` dispatches doctor/update/install | Doctor currently reads deployed filesystem/config and presents diagnostics; it is a relevant installer-adjacent surface but must remain separate from mutation commands. Integration should add equivalent advisor output without making `runDoctorCommand` execute updates. |
| Pi update notice | `ein-pi/agent/lib/ein-update-notice.ts`: `EinUpdateAvailability`, `collectPiEinUpdates`, `startPiEinUpdateNotice`, `renderPiEinUpdateNotice`; consumers in `ein-pi/agent/extensions/ein-banner.ts` | This is a duplicate/weak update interpretation: booleans, timeout/error collapse to false, and commands are rendered as if available. Replace or wrap its source/result path with the shared advisor semantics while preserving runtime gating (`isPiEinRuntime`) and non-blocking startup. |
| Launcher/workbench | `ein-pi/workbench.ts`: `productionDependencies`; `ein-pi/agent/lib/workbench.ts`: `renderProjectState`, `renderDoctorResult`, `runWorkbench`, `WorkbenchDependencies` | Workbench is presentation/orchestration. Production currently projects `projectProjectState` and hardcodes doctor as unavailable; it has no updater logic. Add an injected advisor read/render seam, keeping launcher free of installer implementation and action execution. |
| In-process doctor | `ein-pi/agent/extensions/ein-doctor.ts`: `doctorReport`, `doctorSmokeReport`, `scoutStaticContract` and filesystem/config checks | This is a second diagnostic presenter with duplicated read/parse helpers and default-on-parse-failure behavior. Treat it as a participating surface only if the existing extension surface is intended by design; feed shared advisor output rather than creating another evaluator. |

## Error and ambiguity boundaries

- `ProjectStateQuality` already distinguishes `absent`, `incomplete`, `ambiguous`, `legacy`, `stale`, `unbound`, and `unavailable`; `ProjectStateReasonCode` supplies deterministic reasons such as `read-error`, `parse-error`, `state-mismatch`, and `ambiguous-selection`.
- `readMarkerV2` returns null for missing, unreadable, malformed, or invalid marker data; this must become unknown/unavailable or ambiguous advice, never current.
- `classifyOwnership` explicitly yields `legacy-standalone` or `ownership-ambiguous`; ownership ambiguity must block an actionable update recommendation.
- `collectPiEinUpdates` currently uses `false` for rejection/timeout and combines binary/package checks (`pi: binary || packages`), which loses provenance and cannot distinguish unavailable from current. This is the highest-risk duplicate to retire or adapt.
- `fetchRecord`/`fetchLatestRelease` distinguish invalid response, invalid tag, HTTP, ineligible release, and network failures. Advisor normalization must retain source quality/reason and fail closed.
- `projectProjectState` can expose stale verification (`verification.freshness`) and conflicting OpenSpec selection; advisor must not promote stale/ambiguous state into a safe action.
- `ein-doctor` currently treats absent/broken optional settings as defaults in `doctorReport`; this is presentation-specific and must not become advisor authority.

## Existing tests and focused additions

Existing coverage to extend rather than duplicate:

- `tests/ein-banner-updates.test.ts`: isolated runtime gate, current boolean update rendering, timeout/rejection fail-open, notification behavior. Convert/add cases for source provenance, unavailable vs current, ownership handoff, and no mutation.
- `tests/minimal-workbench-launcher.test.ts`: deterministic project-state rendering, stale/unknown/ambiguous state preservation, compact doctor bridge, injected dependencies and read-only repeated doctor actions. Add advisor rendering consistency and installer-owned handoff assertions.
- `tests/release-update-contract.test.ts`, `tests/release-update-acquisition.test.ts`, `tests/release-update-cli.test.ts`, `tests/release-update-integration.test.ts`, `tests/release-update-state-primitives.test.ts`, `tests/release-update-transaction.test.ts`: marker ownership, release acquisition, CLI/action behavior, state primitives, transaction boundaries. Add read-only advisor fixtures at the contract boundary, not calls to real updater paths.
- `tests/helpers/fake-update-caps.ts`: deterministic fake HTTP/fs/template/child capabilities; suitable for unavailable, malformed, conflicting, and no-write snapshots. Do not import production mutation helpers into the advisor tests.
- `tests/installer-runtime-menu.test.ts` and `tests/updater-cli-entrypoints.test.ts`: action dispatch/ownership regression guards; assert advisor presentation cannot dispatch install/update.
- `tests/beta-launcher-e2e-hardening.test.ts` and `tests/fixtures/beta-launcher-e2e-driver.ts`: predecessor E2E baseline; use only for one end-to-end consistency/no-write scenario after pure contract coverage exists.

## Smallest review-sized implementation surface

Keep production work under the 400-line review budget and split as follows:

1. **Contract/evaluator slice (pure):** one new shared advisor module under the existing `ein-pi/agent/lib` or an explicitly shared installer-safe module; types for source-attributed config/update state, recommendation, quality/reason, ownership, and read-only handoff; deterministic evaluator tests. No filesystem/network writes.
2. **Read adapters slice:** narrow injectable adapters around `readMode`/model config status, `projectProjectState`, marker/version reads, release metadata reads, and capability/ownership evidence. Preserve all error states and use `fakeUpdateCaps`; no imports from CLI action modules.
3. **One integration slice:** workbench `WorkbenchDependencies` + `renderProjectState`/advisor presentation, or Pi-Ein update notice (choose one in design); prove equivalent semantics and explicit installer-owned-next-step text.
4. **Remaining surfaces/regression slice:** second surface (`ein-banner` or installer doctor), then focused no-write and ownership tests. Keep installer action code untouched except type-safe read-only exposure if strictly necessary.

## Focused commands for later phases (not run in map)

- `bun test tests/ein-banner-updates.test.ts tests/minimal-workbench-launcher.test.ts`
- `bun test tests/release-update-contract.test.ts tests/release-update-acquisition.test.ts tests/release-update-state-primitives.test.ts`
- `bun test tests/release-update-cli.test.ts tests/release-update-integration.test.ts tests/updater-cli-entrypoints.test.ts tests/installer-runtime-menu.test.ts`
- `bun test tests/beta-launcher-e2e-hardening.test.ts`
- `cd installer && bun run typecheck`

## Constraints for design handoff

- No universal/advanced updater, background/automatic update, update execution, repair/install mutation, release publication, cache/store, session/history mutation, or launcher-owned installer logic.
- The advisor must be pure/read-only from the consumer perspective; tests should snapshot relevant files and assert no `UpdateCaps.fs` writes, no child spawn, and no action-owner invocation.
- Surface renderers may differ in layout/language, but normalized state, recommendation, ownership, uncertainty, and reason must be identical for equivalent input.
- Do not infer “current” from absence of update evidence, failed network checks, legacy markers, malformed config, conflicting versions, stale verification, or unsupported capability.

ledger:
  reads:
    - { path: "openspec/changes/shared-config-update-advisor/scope.md", lines: 153, estimated_tokens: 2500 }
    - { path: "openspec/changes/shared-config-update-advisor/specs/sdd-lifecycle/spec.md", lines: 51, estimated_tokens: 650 }
    - { path: "docs/roadmap-features-ein.md", lines: 82, estimated_tokens: 1100 }
    - { path: "ein-pi/agent/lib/project-state.ts", lines: 700, estimated_tokens: 6200 }
    - { path: "ein-pi/agent/lib/mode.ts", lines: 109, estimated_tokens: 850 }
    - { path: "ein-pi/agent/lib/model-config.ts", lines: 130, estimated_tokens: 1100 }
    - { path: "ein-pi/agent/lib/workbench.ts", lines: 220, estimated_tokens: 1900 }
    - { path: "ein-pi/workbench.ts", lines: 105, estimated_tokens: 900 }
    - { path: "ein-pi/agent/lib/ein-update-notice.ts", lines: 144, estimated_tokens: 1050 }
    - { path: "ein-pi/agent/extensions/ein-banner.ts", lines: 220, estimated_tokens: 650 }
    - { path: "ein-pi/agent/extensions/ein-doctor.ts", lines: 145, estimated_tokens: 1100 }
    - { path: "installer/src/core/paths.ts", lines: 155, estimated_tokens: 1250 }
    - { path: "installer/src/core/version.ts", lines: 76, estimated_tokens: 650 }
    - { path: "installer/src/core/release-types.ts", lines: 84, estimated_tokens: 600 }
    - { path: "installer/src/core/marker-v2.ts", lines: 144, estimated_tokens: 1200 }
    - { path: "installer/src/core/release-record.ts", lines: 79, estimated_tokens: 700 }
    - { path: "installer/src/cli/update.ts", lines: 176, estimated_tokens: 1400 }
    - { path: "installer/src/cli/doctor.ts", lines: 55, estimated_tokens: 450 }
    - { path: "installer/src/cli/menu.ts", lines: 100, estimated_tokens: 700 }
    - { path: "tests/ein-banner-updates.test.ts", lines: 174, estimated_tokens: 1500 }
    - { path: "tests/minimal-workbench-launcher.test.ts", lines: 380, estimated_tokens: 3500 }
    - { path: "tests/helpers/fake-update-caps.ts", lines: 74, estimated_tokens: 650 }
  webfetch_used: false
  budget_consumed: { tokens: 15000, reads: 22 }
  budget_exceeded: true

skill_resolution: paths-injected
