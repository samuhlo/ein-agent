# Tasks — fix-overlay-repaint-recovery

status: ready
blocked_by: none

## // 001. Ship the single fleet surface policy

- [x] 1.1 RED: create `tests/subagent-widget-layout.test.ts` with a focused contract that reads the tracked extension configuration and expects `fleetViewPlacement: "aboveEditor"` plus `asyncWidget: false`.
  - skills: `ein-discipline`, `architecture`
  - why: The repository must first prove the package-owned fleet is above the editor and the duplicate legacy async surface is suppressed.
  - learn: A configuration test can protect an integration boundary without testing dependency internals.
  - architecture: Treat `ein-pi/agent/extensions/subagent/config.json` as Ein's owned input to `pi-subagents`; do not use `settings.json` for these package options.
  - avoid: Do not edit installed `pi-subagents`, infer same-container priority, or broaden the test into fleet rendering internals.
  - verify: `bun test tests/subagent-widget-layout.test.ts` fails only because the two shipped values are absent or incorrect.

- [x] 1.2 GREEN: add only `fleetViewPlacement: "aboveEditor"` and `asyncWidget: false` to `ein-pi/agent/extensions/subagent/config.json`, preserving all existing configuration.
  - skills: `ein-discipline`, `architecture`
  - why: These two fields select the persistent fleet surface and suppress the unplaced legacy widget at the smallest repository-owned seam.
  - learn: Prefer a dependency's supported configuration contract over patching its implementation.
  - architecture: Keep async execution and rendering owned by `pi-subagents`; Ein owns only the shipped policy.
  - avoid: Do not add these fields to `ein-pi/agent/settings.json`, disable the persistent fleet, or change installer code.
  - verify: `bun test tests/subagent-widget-layout.test.ts`

- [x] 1.3 TRIANGULATE/REFACTOR: make the contract explicitly prove the canonical tracked path and the exact two-option policy, without snapshots, dependency-source assertions, or duplicated config fixtures.
  - skills: `ein-discipline`, `architecture`
  - why: The test must fail if the policy drifts or moves to the non-consumed settings path while remaining resilient to unrelated config changes.
  - learn: Assert the narrow behavior contract, not the complete shape of a third-party configuration file.
  - architecture: The tracked extension config is the template-owned propagation source; installer merge behavior and user settings remain separate concerns.
  - avoid: Do not assert every config key, copy the JSON into a fixture, or introduce installer preservation behavior.
  - verify: `bun test tests/subagent-widget-layout.test.ts`

## // 002. Put TODO below the fleet boundary

- [x] 2.1 RED: extend `tests/sdd-overlay-repaint.test.ts` so its fake UI captures widget options and expects every Ein TODO paint to use the stable `ein-sdd` key with `placement: "belowEditor"`, while retaining startup repaint, unchanged-content deduplication, and no-UI no-call assertions.
  - skills: `ein-discipline`, `architecture`
  - why: The TODO placement change needs a failing behavioral test that also guards the working repaint invariants.
  - learn: Capture arguments at the UI boundary to test placement without coupling to terminal rendering internals.
  - architecture: Test the Ein extension's placement request; Pi remains responsible for composing widget regions.
  - avoid: Do not rewrite `renderSddOverlay`, weaken existing repaint assertions, or add timing/key-press simulation.
  - verify: `bun test tests/sdd-overlay-repaint.test.ts` fails only on the expected above-to-below placement mismatch.

- [x] 2.2 GREEN: change only the TODO widget placement request in `ein-pi/agent/extensions/ein-sdd-overlay.ts` from `aboveEditor` to `belowEditor`.
  - skills: `ein-discipline`, `architecture`
  - why: Fleet-above and TODO-below use Pi's fixed cross-region order instead of nondeterministic insertion order within one widget map.
  - learn: A stable existing boundary is often safer than introducing a new priority abstraction.
  - architecture: Preserve the extension's key, lifecycle handlers, `painted` reset, deduplication cache, and `hasUI` guard exactly as they are.
  - avoid: Do not change refresh events, repaint recovery, content generation, widget identity, or Pi's widget API.
  - verify: `bun test tests/sdd-overlay-repaint.test.ts`

- [x] 2.3 TRIANGULATE/REFACTOR: extend `tests/subagent-widget-layout.test.ts` with the minimal cross-region contract showing fleet above and TODO below are distinct ordered regions, independent of registration order.
  - skills: `ein-discipline`, `architecture`
  - why: Separate unit assertions for two options do not by themselves state the final deterministic ordering guarantee.
  - learn: Test the invariant created by composition boundaries rather than reproducing a dependency's rendering algorithm.
  - architecture: Keep the proof at the repository contract level: shipped fleet policy plus Ein's TODO placement request.
  - avoid: Do not import installed dependency files, model `Map` insertion order, add a shared placement abstraction, or alter `tests/sdd-overlay.test.ts` unless the implementation introduces a stable placement contract there.
  - verify: `bun test tests/subagent-widget-layout.test.ts tests/sdd-overlay-repaint.test.ts`

## // 003. Verify automated behavior and scope

- [x] 3.1 Run the focused layout and repaint contracts together after both production changes.
  - skills: `ein-discipline`
  - why: The ordering guarantee spans the shipped subagent policy and the TODO extension boundary.
  - learn: Focused tests provide fast evidence before the broader repository gate.
  - architecture: Verify the two owned seams together without exercising or modifying dependency internals.
  - avoid: Do not accept isolated green tests if their combined ordering contract fails.
  - verify: `bun test tests/subagent-widget-layout.test.ts tests/sdd-overlay-repaint.test.ts`

- [x] 3.2 Run the repository-wide test and root typecheck gates.
  - skills: `ein-discipline`
  - why: Configuration and extension changes can affect contracts outside the focused files, and Bun tests do not typecheck TypeScript.
  - learn: Test execution and static type validation are complementary gates.
  - architecture: Keep installer typecheck out of this bounded change because no installer production file is designed to change.
  - avoid: Do not treat focused tests as the final gate or run installer typecheck unless implementation has drifted into installer files.
  - verify: `bun test && bun run typecheck`

- [x] 3.3 Audit the final diff against the design boundary and confirm only the two owned production/config files and their two contract tests changed for implementation.
  - skills: `ein-discipline`, `architecture`
  - why: The accepted solution specifically excludes settings, installer, renderer, repaint-lifecycle, and installed-dependency edits.
  - learn: A scope audit proves restraint as well as correctness.
  - architecture: Configuration owns fleet policy; the overlay extension owns TODO placement; all other owners remain untouched.
  - avoid: Do not include changes under `node_modules`, an installed Ein home, `ein-pi/agent/settings.json`, installer production code, `renderSddOverlay`, or repaint event/cache logic.
  - verify: `git diff --name-only` plus a manual comparison with the pre-apply baseline and the four designed implementation/test paths.

- [x] 3.4 RED/GREEN/TRIANGULATE/REFACTOR: reproduce the intermittent frozen-corpus mismatch with an isolated repository whose `core.abbrev` is 8, then make corpus commit IDs exactly seven hexadecimal characters independently of Git abbreviation policy.
  - skills: `ein-discipline`, `bun`
  - why: `%h` and `rev-parse --short` choose a repository-dependent abbreviation length, so frozen bytes can drift while history is unchanged.
  - learn: Frozen data must derive fixed-width IDs from full object IDs instead of Git's adaptive display abbreviation.
  - architecture: Keep the correction at the corpus I/O boundary; do not update the frozen corpus or weaken byte equality.
  - avoid: Do not mutate root Git config, snapshots, installed paths, or unrelated runtime code.
  - verify: `bun test tests/apply-corpus-frozen.test.ts`

- [x] 3.5 Re-run the exact composite pre-PR gate after the deterministic abbreviation fix.
  - skills: `ein-discipline`, `bun`
  - why: The reported failure appeared only in the composite command and must be closed with the same invocation.
  - learn: A focused regression proves the cause; the original composite gate proves integration.
  - architecture: Keep deployment and interactive acceptance separate from automatable verification.
  - avoid: Do not substitute standalone commands for the requested composite gate.
  - verify: `bun test && bun run typecheck`

## // 004. Confirm deployed fleet liveness interactively

- [ ] 4.1 Use the supported install/update path to deploy the repository template, then confirm the deployed `<agent-dir>/extensions/subagent/config.json` contains fleet-above and legacy-disabled values without hand-editing the installed home.
  - blocked: The user explicitly chose BUILD ONLY and declined deployment/update of the active Ein installation. The official host template artifact was built with `cd installer && bun run bundle-template:host`; direct archive inspection found `fleetViewPlacement: "aboveEditor"` and `asyncWidget: false` in `./extensions/subagent/config.json` (SHA-256 `97c7cc2cdbe7ec493b60e1c08474b22962becdba96159951d054d0d37a9a3a4b`). No home or installed path was modified.
  - skills: `ein-discipline`, `architecture`
  - why: The design requires the template-owned configuration to survive the real managed deployment path.
  - learn: Verify propagation at the delivered boundary rather than assuming a tracked source file is enough.
  - architecture: The installer already replaces the managed `extensions/` subtree; this task observes that contract and does not add merge logic.
  - avoid: Do not copy the file manually, modify installer code, or change user-owned settings to manufacture success.
  - verify: `manual: inspect the supported install/update result at <agent-dir>/extensions/subagent/config.json and compare the two values with the tracked template.`

- [ ] 4.2 In an interactive `pi-ein` session with WORKING and TODO visible, launch one async subagent and confirm a single live fleet row appears above TODO, updates while the job runs, and both startup repaint and WORKING updates occur without a keypress.
  - pending: The user declined deployment, so the active installation was intentionally left unchanged and this interactive runtime check cannot be performed against the newly built artifact.
  - skills: `ein-discipline`
  - why: Final terminal composition and liveness depend on the installed Pi runtime and require an explicit visual acceptance check.
  - learn: Contract tests prove owned inputs; an interactive check proves the integrated terminal behavior users actually see.
  - architecture: Expect Pi's built-in WORKING region, then the above-editor fleet surface, then the below-editor TODO surface; the legacy async row must remain absent.
  - avoid: Do not accept duplicate async rows, TODO-before-fleet ordering, a keypress-dependent repaint, or a result produced by editing installed dependencies.
  - verify: `manual: record pass/fail for single fleet row, fleet-before-TODO order, live fleet updates, startup repaint, and keypress-free WORKING updates.`
