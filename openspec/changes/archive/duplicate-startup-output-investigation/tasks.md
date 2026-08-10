# Tasks — duplicate-startup-output-investigation

status: ready
blocked_by: none

> Apply groups in order. The repository gate is Bun; `vitest` was loaded but skipped because this project requires `bun test` and no Vitest commands are appropriate. Do not add production builds or touch unrelated installer changes.

## // 001. Provenance event contract and recorder

- [x] 1.1 RED — Add `tests/startup-provenance.test.ts` expectations for a diagnostic run identity, per-event identity, event type, wall-clock and monotonic timestamps, process identity, optional extension source identity, parent identity, and runtime session identity represented as `unknown` when unavailable; use injected IDs/clocks so the contract is deterministic.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: Every later boundary needs one stable vocabulary instead of inventing incompatible fields or inferring provenance from counts.
  - learn: Explicit unknown values preserve uncertainty; an absent field must not silently become a fact.
  - architecture: Keep the contract and pure recorder in `ein-pi/agent/lib/startup-provenance.ts`; inject clocks, identity generation, and sinks rather than using global state or I/O.
  - avoid: Do not put Pi lifecycle logic, renderer assumptions, or a file writer in the foundational contract.
  - verify: `bun test tests/startup-provenance.test.ts` (RED expected before implementation); `cd installer && bun run typecheck`

- [x] 1.2 GREEN — Implement `ein-pi/agent/lib/startup-provenance.ts` with the narrow load, registration, `session_start`, notification-emission, and presentation event shapes, explicit observed/unavailable/unknown evidence states, parent links, and an opt-in recorder whose disabled path emits nothing.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: This establishes the shared contract required to correlate asynchronous events without changing startup behavior.
  - learn: A local injected recorder is safer than a telemetry framework or process-wide mutable registry.
  - architecture: The module is runtime-agnostic and deterministic; side-channel writing is supplied by the runtime edge and recording failure is represented as unavailable evidence.
  - avoid: Do not synthesize runtime session IDs, source paths, timestamps, or zero counts when the runtime cannot provide them.
  - verify: `bun test tests/startup-provenance.test.ts`; `cd installer && bun run typecheck`

- [x] 1.3 TRIANGULATE — Extend the focused contract tests for missing source/session metadata, required-versus-optional parent links, independent event IDs for repeated events, digest fields without full message storage, and sink failure that does not throw into the caller.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: These edge cases are the foundation for fail-closed classification and for preserving startup when diagnostics are incomplete.
  - learn: Provenance quality is determined by identity and parentage, not merely by how many records were emitted.
  - architecture: Keep failure and uncertainty semantics in the recorder contract so every consumer handles them consistently.
  - avoid: Do not make a failed sink look like a successful empty capture or make digest equality prove presentation attribution by itself.
  - verify: `bun test tests/startup-provenance.test.ts`; `cd installer && bun run typecheck`

- [x] 1.4 REFACTOR — Reduce the public surface to the smallest typed factory/recording API, retain deterministic injection seams, and confirm the module has no Pi, terminal, filesystem, or global-state dependency.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: Consumers should receive one narrow boundary and remain easy to remove during rollback.
  - learn: A diagnostic helper earns its place when it isolates evidence plumbing without becoming an application-wide abstraction.
  - architecture: `ein-pi/agent/lib/startup-provenance.ts` owns data semantics only; extension and capture edges own I/O.
  - avoid: Do not add generalized telemetry, broad loader tracing, or behavior-changing deduplication.
  - verify: `bun test tests/startup-provenance.test.ts`; `cd installer && bun run typecheck`

## // 002. Deterministic summary and fail-closed classifier

- [x] 2.1 RED — Add `tests/startup-provenance-classifier.test.ts` cases for two distinct loads of one resolved source with linked registrations, one load/registration/invocation/emission with two attributable presentations, and separate duplicate-registration, duplicate-event-delivery, and duplicate-emission patterns.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: The approved interpretation gates must be encoded before runtime traces can be trusted.
  - learn: The same visible text or count can arise from different causes; parent-linked identities distinguish them.
  - architecture: Test a pure classifier boundary in `ein-pi/agent/lib/startup-provenance-classifier.ts`, consuming only the provenance contract.
  - avoid: Do not classify from source call-site counts, manifest contents, or notification text equality alone.
  - verify: `bun test tests/startup-provenance-classifier.test.ts` (RED expected before implementation); `cd installer && bun run typecheck`

- [x] 2.2 GREEN — Implement pure summary/classification functions in `ein-pi/agent/lib/startup-provenance-classifier.ts` that derive independent stage counts and identities, validate parent links, and return supported loader/presentation/intermediate classifications only when the required evidence is complete.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: A deterministic classifier makes the later reproduction reproducible and prevents interpretation from depending on model judgment.
  - learn: Counts are useful summaries, but identity graph validation is the actual diagnostic decision boundary.
  - architecture: Keep summarization/classification stateless, side-effect-free, and separate from both the Pi extension and PTY capture.
  - avoid: Do not treat missing events as zero or conflate module evaluation, registration, invocation, emission, and presentation.
  - verify: `bun test tests/startup-provenance-classifier.test.ts`; `cd installer && bun run typecheck`

- [x] 2.3 TRIANGULATE — Add classifier tests removing each classification-critical stage and introducing stale, unknown, uncorrelated, or unknown-channel/source evidence; assert `unknown` for incomplete cases and distinct results for registration, lifecycle, and notification multiplicity.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: Fail-closed behavior is required to prevent a partial trace from becoming a false diagnosis.
  - learn: “No record observed” and “recorded zero” are different evidence states.
  - architecture: Require complete same-run provenance and valid parent links before any supported diagnosis; retain an explicit unknown result.
  - avoid: Do not let a matching digest, a pair of timestamps, or a presentation count override unknown provenance.
  - verify: `bun test tests/startup-provenance-classifier.test.ts`; `cd installer && bun run typecheck`

- [x] 2.4 REFACTOR — Make the summary and classification result vocabulary explicit, preserve independent stage counts, and keep all decisions derived from supplied evidence with no filesystem, renderer, or runtime access.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: The classifier must remain safe to run against fixtures and real captures without adding another source of evidence.
  - learn: Pure diagnostic interpretation is easier to triangulate than logic embedded in startup callbacks.
  - architecture: `startup-provenance-classifier.ts` owns interpretation only; event collection and visible-presentation observation stay outside it.
  - avoid: Do not add automatic remediation, notification suppression, or a fallback “best guess” status.
  - verify: `bun test tests/startup-provenance-classifier.test.ts`; `cd installer && bun run typecheck`

## // 003. Extension evaluation and registration provenance

- [x] 3.1 RED — In the focused `tests/ein-banner-updates.test.ts` seam, assert that an enabled diagnostic records one load event per evaluated banner module instance and one registration event per extension registration, with distinct IDs and registration-to-load parent links; assert that disabled diagnostics preserve the existing startup call behavior.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: This is the minimum evidence needed to separate duplicate module evaluation from repeated registration without changing the loader.
  - learn: A module load and a handler registration are separate lifecycle facts and must not share one count.
  - architecture: Instrument only `ein-pi/agent/extensions/ein-banner.ts` at its module-evaluation and extension-registration boundaries; use the contract’s opt-in side channel.
  - avoid: Do not infer active loading from `CORE_EXTENSIONS`, manifests, doctor checks, or the single source-level call expression.
  - verify: `bun test tests/ein-banner-updates.test.ts` (RED expected before implementation); `cd installer && bun run typecheck`

- [x] 3.2 GREEN — Add non-behavioral load/evaluation and registration events to `ein-pi/agent/extensions/ein-banner.ts`, retaining a module-instance load identity, creating a registration identity for each registration, linking registration to load, and carrying run/process/source/session metadata without claiming unavailable values.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: The runtime trace must reveal whether Pi evaluated the extension more than once or registered one evaluation more than once.
  - learn: Provenance belongs at the boundary where the fact occurs, not reconstructed later from downstream notification output.
  - architecture: Keep the banner’s existing export, registration, ordering, and startup behavior intact; emit only through the explicitly enabled structured diagnostic side channel.
  - avoid: Do not add loader changes, user-visible logs, notification text changes, or a second startup call path.
  - verify: `bun test tests/ein-banner-updates.test.ts`; `cd installer && bun run typecheck`

- [x] 3.3 TRIANGULATE — Exercise repeated registration, isolated/repeated module evaluation, unavailable source identity, disabled capture, and a throwing diagnostic sink; verify distinct identities where observed, `unknown`/unavailable evidence where necessary, and unchanged startup handling when recording fails.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: Timing-sensitive duplication and diagnostic failure must not be hidden by the instrumentation itself.
  - learn: A diagnostic must be observationally safe even when its own output path is unavailable.
  - architecture: Keep sink error containment at the extension edge and never allow trace failure to enter Pi’s lifecycle control flow.
  - avoid: Do not swallow a missing event by reporting a successful zero or reuse one registration ID for multiple registrations.
  - verify: `bun test tests/ein-banner-updates.test.ts`; `cd installer && bun run typecheck`

- [x] 3.4 REFACTOR — Keep module/load and registration event construction local to the banner boundary, remove duplicated metadata assembly where safe, and confirm no broad runtime or renderer tracing was introduced.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: The diagnostic should remain a removable, bounded seam rather than coupling the extension to a telemetry system.
  - learn: Small boundary instrumentation preserves rollback and reviewability.
  - architecture: `ein-banner.ts` owns only facts observable at extension evaluation/registration; the pure contract and classifier remain reusable consumers.
  - avoid: Do not alter extension discovery, manifest resolution, startup filtering, or banner rendering.
  - verify: `bun test tests/ein-banner-updates.test.ts`; `cd installer && bun run typecheck`

## // 004. Session-start, asynchronous correlation, and notification emission

- [x] 4.1 RED — Extend `tests/ein-banner-updates.test.ts` with focused cases that create a new invocation identity at every `session_start` entry, link it to the registration, record UI availability and CLI-filter outcomes before early returns, and preserve that identity through delayed/overlapping notice work to the event immediately before `ctx.ui.notify`.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: Async completion order and early filters otherwise make one invocation look like another or make skipped work look absent.
  - learn: Correlation IDs must cross the scheduling boundary; timestamps alone cannot establish parentage.
  - architecture: Instrument `ein-pi/agent/extensions/ein-banner.ts` for handler entry and `ein-pi/agent/lib/ein-update-notice.ts` for pass-through and notify-boundary provenance; detector internals remain untouched.
  - avoid: Do not move the notify call, await unrelated work, or use a module-global “current invocation.”
  - verify: `bun test tests/ein-banner-updates.test.ts` (RED expected before implementation); `cd installer && bun run typecheck`

- [x] 4.2 GREEN — Implement invocation and notification-emission provenance across the existing banner/notice seam: record a unique invocation linked to registration, retain UI/CLI observations, pass the correlation explicitly through asynchronous notice work, and record a unique emission with normalized message digest immediately before the actual `ctx.ui.notify` call.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: This supplies parent-linked evidence for one call rendered twice versus multiple invocations/emissions.
  - learn: Record the API-call event at the boundary immediately before calling the API, while carrying its origin from handler entry.
  - architecture: Keep correlation as explicit local data/parameter flow between the two modules; preserve notification content, ordering, timing, and existing failure behavior.
  - avoid: Do not store the full message solely for diagnostics, infer a presentation from notify success, or instrument detector internals.
  - verify: `bun test tests/ein-banner-updates.test.ts`; `cd installer && bun run typecheck`

- [x] 4.3 TRIANGULATE — Test one registration receiving two lifecycle events, delayed detector completion with overlapping invocations, no-UI/CLI-filtered sessions, detector failure/timeout, unavailable runtime session identity, disabled capture, and sink failure; assert exact parent links and that normal startup behavior continues.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: These cases distinguish duplicate event delivery and duplicate emission from duplicate loading while protecting fail-open startup behavior.
  - learn: A skipped or failed observation is evidence about availability, not evidence that the event count was zero.
  - architecture: The notice helper carries only the invocation correlation and records at its notify boundary; it does not own classification or presentation observation.
  - avoid: Do not label a detector failure as current, emit a synthetic notification event, or make diagnostic failure block startup.
  - verify: `bun test tests/ein-banner-updates.test.ts`; `cd installer && bun run typecheck`

- [x] 4.4 REFACTOR — Simplify the correlation plumbing while retaining explicit invocation/emission parentage, the before-call ordering assertion, normalized digest semantics, and the existing `startPiEinUpdateNotice` behavior when diagnostics are absent.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: A narrow optional diagnostic parameter prevents provenance concerns from spreading through unrelated startup logic.
  - learn: Optional observability should be additive: disabling it removes recording, not product control flow.
  - architecture: Keep lifecycle ownership in the banner, async pass-through and notify-boundary ownership in the notice helper, and interpretation in the classifier.
  - avoid: Do not introduce a global correlation store, alter terminal/banner scheduling, or deduplicate output before evidence exists.
  - verify: `bun test tests/ein-banner-updates.test.ts`; `cd installer && bun run typecheck`

## // 005. Independent PTY presentation evidence and final focused verification

- [x] 5.1 Prepare one bounded reproducible Pi-Ein startup capture in a PTY with diagnostics explicitly enabled, recording actual startup arguments/configuration, extension discovery result, PID/PPID, cwd, Pi version, effective `AGENT_DIR`, `EIN_PI_AGENT_HOME`, resolved extension source identity, and the structured side-channel run identity.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: Runtime loader configuration and visible presentation provenance cannot be proven by source inspection, manifests, or isolated notice tests.
  - learn: Presentation evidence must be collected independently from `ctx.ui.notify` emissions.
  - architecture: PTY/renderer capture owns visible occurrences; application instrumentation must not infer them from a successful API call.
  - avoid: Do not change notification/banner behavior, use a broad runtime trace, or treat the deployment manifest as the active discovery list.
  - verify: Before capture, run `bun test tests/ein-banner-updates.test.ts` and `cd installer && bun run typecheck`; run the actual Pi startup command under the repository’s PTY capture procedure and preserve the raw capture.

- [x] 5.2 Record each visible startup presentation independently with a capture identity, timestamp, normalized output digest, process/run provenance, and observed channel (`notification overlay`, `banner/stdout redraw`, or `unknown`), then join it to the structured application events without inventing missing parent links.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: One notify call with two visible occurrences must remain distinguishable from two notify calls with one occurrence each.
  - learn: A digest helps attribution but is not conclusive without time, process, run, and channel evidence.
  - architecture: Keep external presentation records separate from extension and notice events; feed both into the deterministic classifier only after validating their provenance.
  - avoid: Do not count terminal redraws as notifications, store full notification text solely for the diagnostic, or fill absent stages with zero.
  - verify: Re-run `bun test tests/startup-provenance-classifier.test.ts`; `cd installer && bun run typecheck`; manually confirm the capture has independent presentation records.

- [x] 5.3 Apply the classifier to the complete captured run and retain the per-run summary of load, registration, invocation, detector, emission, and presentation identities/counts; accept a supported loader/presentation/intermediate result only when its gate is complete, otherwise retain `unknown` with the missing/stale/uncorrelated stage.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: The investigation must distinguish the two open hypotheses without turning incomplete evidence into a diagnosis.
  - learn: Fail-closed classification is a successful diagnostic outcome when the evidence is insufficient.
  - architecture: Use the pure classifier as the sole interpretation boundary; the capture remains raw evidence and the runtime remains behavior-neutral.
  - avoid: Do not “repair” the trace by guessing session identity, source identity, channel, or parentage.
  - verify: `bun test tests/startup-provenance-classifier.test.ts`; `bun test tests/ein-banner-updates.test.ts`; `cd installer && bun run typecheck`

- [x] 5.4 Run the final repository gates and verify the diagnostic-disabled path remains behaviorally unchanged; confirm no production build was run and unrelated dirty installer files remain untouched.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: The phase succeeds only if the provenance diagnostic is focused, fail-closed, and non-behavioral across the repository.
  - learn: A reproducible evidence artifact is not complete until focused checks, repository checks, and change-safety checks all pass.
  - architecture: Verification covers the contract, classifier, extension edge, async notice edge, and external presentation boundary without expanding scope into fixes.
  - avoid: Do not suppress or fix duplicate output in this change, modify installer files to make checks pass, or add a production bundle/build step.
  - verify: `bun test`; `cd installer && bun run typecheck`; inspect `git status --short` and `git diff -- installer` against the pre-existing dirty state.
