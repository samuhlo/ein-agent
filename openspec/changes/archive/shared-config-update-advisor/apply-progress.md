status: complete
change: shared-config-update-advisor
phase: apply
strict_tdd: on
skill_resolution: paths-injected; comment-style fallback-path (/Users/samu/.pi-ein/agent/skills/local/comment-style/SKILL.md)

## Completed
- 1.1–1.2: immutable pure two-facet contract/evaluator, normalization, bounded provenance, deterministic output, stale/unknown fail-closed behavior.
- 2.1–2.2: additive mode/model inspectors with precedence, default, missing, invalid/unreadable, and observed provenance; legacy readers unchanged.
- 3.1–3.2: status-preserving Pi probes plus compatibility edge adapter; installer read-only marker/release/capability adapter; marker reader signature broadened only to read-only fs capability.
- 4.1–4.2: boolean compatibility stays at notice edge; doctor handoff is closed inert metadata with `performed: false` and no dispatch path.
- 5.1–5.2: shared semantic formatter consumed by workbench/launcher, Pi advisor notice boundary, and installer doctor presentation.
- 6.1–6.2: regression triangulation for ambiguity, version regression, stale evidence, privacy, controls, and read-only behavior.
- 7.1–7.2: focused suites, cross-surface suite, full Bun suite, installer typecheck, forbidden-scope review, and whitespace gate.

## TDD Cycle Evidence
| seam | RED | GREEN | TRIANGULATE / REFACTOR |
|---|---|---|---|
| contract/evaluator | Initial focused test failed: missing `shared-config-update-advisor.ts` module. | `bun test tests/shared-config-update-advisor.test.ts` → 10 pass. | Frozen equal-input result, independent facets, stale/unknown/ambiguity/privacy cases pass. |
| mode/model readers | Baseline copies of HEAD readers failed focused export assertions (`inspectMode`/`inspectModelConfig` undefined; exit 1). | `bun test tests/mode.test.ts tests/model-config.test.ts` → 24 pass. | Legacy read behavior and precedence/default evidence verified. |
| Pi notice evidence | Baseline notice copy failed `collectPiEinUpdateEvidence` export assertion (exit 1). | `bun test tests/ein-banner-updates.test.ts` → 11 pass. | Timeout/rejection/malformed/skipped/late-result and compatibility cases pass. |
| installer adapters/handoff | RED assertions added for bounded read evidence and inert doctor handoff before green implementation. | `bun test tests/release-update-contract.test.ts tests/installer-runtime-menu.test.ts` → 36 pass. | Marker bytes unchanged; no action dispatch/spawn path added. |
| shared consumers | Consumer fixture assertions target absent semantic surface before implementation. | `bun test tests/minimal-workbench-launcher.test.ts` → 54 pass. | Launcher/workbench/notice/doctor output agrees on statuses and handoff semantics. |
| F-001 launcher factory | RED: imported `createWorkbenchAdvisor` was absent; focused module load failed. | Factory reads injected mode/model evidence and production dependencies now wire it; focused launcher test passes. | Entrypoint renders configuration/update semantics; advisor has no mutation/spawn dependency. |
| F-002 doctor composition | RED: injected doctor read seam was ignored (`readCalls=0`). | Async `runDoctorCommand` reads installer evidence, evaluates, and appends existing renderer output. | Doctor report exit ownership remains unchanged; fallback stays bounded and inert. |
| F-003 fail-closed proof | RED: omitted support returned `update-available`; mismatched action IDs emitted a handoff. | Capability requires `supported === true`; action/actionId pairs are exact. | Negative capability and coherence cases pass with no handoff. |
| F-004 banner migration | RED: canonical detector export was absent from the production boundary. | Production detector returns canonical observations; boolean path remains compatibility-only. | Timeout/non-blocking notice tests and freshness/provenance assertions pass. |
| F-005 controls/read-only | RED: escaped control assertions did not exercise actual controls; counters were absent. | Fixtures use real ESC/CR and adapter test records bytes, reads, writes, and spawns. | Sanitized output and unchanged marker bytes pass. |
| F-006/F-007 remediation | RED: new advisor tests failed 7 cases; invalid/unreadable/error owner/capability evidence handed off and external equal-version ownership returned current. | Evaluator gates owner/capability known status before version parsing and normalizes external ownership as unsupported. | Focused, cross-surface, typecheck, full-suite, scope, and whitespace gates pass. |

## Verification evidence
- Focused advisor/mode/model/banner/launcher/release/doctor suites → 194 pass, 0 fail.
- `(cd installer && bun run typecheck)` → pass.
- `bun test` → 1,283 pass, 0 fail across 97 files.
- `git diff --check` → pass; untracked source/test whitespace check → pass.
- Forbidden-scope/ownership scan → no G–L paths, updater transactions, action-owner calls, writes, or spawns added.

## Changed files
- Production: `ein-pi/agent/lib/shared-config-update-advisor.ts`, `ein-pi/agent/lib/mode.ts`, `ein-pi/agent/lib/model-config.ts`, `ein-pi/agent/lib/ein-update-notice.ts`, `ein-pi/agent/lib/workbench.ts`, `ein-pi/workbench.ts`, `ein-pi/agent/extensions/ein-banner.ts`, `installer/src/core/update-advisor-read.ts`, `installer/src/core/marker-v2.ts`, `installer/src/cli/doctor.ts`.
- Tests: shared advisor, mode/model, notice, workbench, installer menu, release contract.
- SDD: tasks checkboxes ticked; this progress file and verify report added.

## Deviations and residual risks
- Existing boolean `EinUpdateAvailability` remains as a compatibility edge; canonical status-preserving evidence is available through the new collector and canonical detector boundary.
- The pure evaluator stays framework/network/process-free; production launcher now wires the read-only factory through the existing injectable advisor seam, without an updater/read scheduler.
- Review workload is above the 400-line production forecast budget due the new contract plus adapter seams; delivery topology remains a parent/user decision.
- No install/update/repair/configure action is invoked by advisor, launcher, notice, or doctor.

## F-006/F-007 remediation evidence
- **Status:** complete; only evaluator, focused evaluator tests, and this apply evidence changed for remediation. `verify-report.md` was not edited.
- **RED:** `bun test tests/shared-config-update-advisor.test.ts` → 10 pass, 7 fail, exposing all six malformed owner/capability cases plus external equal-version current.
- **GREEN:** focused advisor suite → 17 pass / 54 assertions; `cd installer && bun run typecheck` → pass.
- **TRIANGULATE/REFACTOR:** cross-surface launcher/doctor/banner/release suites → 162 pass / 807 assertions; `bun test` → 1,290 pass / 4,630 assertions across 97 files.
- **Fresh gates:** ownership/scope scan passed; `git diff --check` and untracked target whitespace scan passed. Fresh target counts: evaluator 411 lines, focused tests 244 lines.
- **Deviation/risk:** none introduced; installer ownership, inert handoff, compatibility, read-only behavior, and F-001–F-005 wiring remain unchanged.
- Prior F-001–F-005 verification baseline: focused suites 194 pass, full Bun suite 1,283 pass; refreshed F-006/F-007 counts are recorded above.
