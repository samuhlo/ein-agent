# Design: provenance for duplicate startup output

## A. Proposal

### Intent

Introduce the smallest opt-in, non-behavioral diagnostic needed to determine whether duplicate Ein startup output comes from duplicate extension loading/registration, repeated lifecycle delivery, repeated notification calls, or downstream presentation. The current observation of one source-level call site is not a diagnosis.

### Problem statement

The current evidence cannot correlate a visible startup presentation with the extension instance, `session_start` invocation, and `ctx.ui.notify` call that produced it. Consequently, neither loader duplication nor renderer duplication can be confirmed, and absent evidence could be mistaken for a zero count.

### Scope

In scope:

- A bounded structured trace for one reproducible Pi-Ein startup run.
- Independent identities and counts for extension load/registration, `session_start` invocation, and notification emission.
- Independent PTY/renderer-side presentation observations sufficient to compare API calls with visible output.
- A fail-closed classification based on parent-linked provenance.

Out of scope:

- Fixing or suppressing duplicate output.
- Changing notification content, ordering, timing semantics, startup filtering, banner behavior, loader behavior, or renderer behavior.
- Broad runtime tracing, detector internals, roadmap work, installer changes, or treating the manifest/doctor inventory as active-loader evidence.

### Affected areas

- `ein-pi/agent/extensions/ein-banner.ts`: extension evaluation/registration and `session_start` provenance boundaries.
- `ein-pi/agent/lib/ein-update-notice.ts`: correlation across the asynchronous notice path and the boundary immediately before `ctx.ui.notify`.
- Startup PTY capture and focused diagnostic verification: visible-presentation evidence and classification checks.
- `tests/ein-banner-updates.test.ts` or an equally focused diagnostic test seam: preservation of existing notice behavior and fail-closed provenance behavior.

### Risks

- Diagnostic I/O may perturb startup timing and hide or create a timing-sensitive symptom.
- Terminal redraws may be misclassified as notification presentations unless channel and digest provenance are captured.
- Lost correlation across the asynchronous notice path may falsely suggest independent invocations.
- Partial traces may appear conclusive if missing stages are treated as zero.

### Rollback

Remove the opt-in trace hooks, correlation plumbing, capture fixture, and focused diagnostic assertions. Because the diagnostic MUST NOT alter normal startup behavior, rollback requires no data migration or behavior restoration.

### Success criteria

A single bounded startup capture produces a per-run evidence summary with explicit status and parent-linked identities at every required stage. Complete evidence can distinguish duplicate load/registration from duplicate presentation; incomplete or ambiguous evidence produces `unknown`, never a guessed diagnosis.

## B. Spec

### Canonical spec context

No canonical specification file was referenced by `scope.md`; it declares `spec_delta: none`. Selection: 0 files, 0 bytes; no SHA-256 values apply. This design specifies temporary diagnostic observability and does not change product behavior.

### R1. Correlated diagnostic run

The system MUST assign each enabled diagnostic startup capture a diagnostic run identity and MUST record, for every observed event, an event identity, event type, wall-clock and monotonic timestamps, process identity, resolved extension source identity when available, and parent identity when applicable. A runtime session identity MUST be recorded when exposed by the runtime; if it is not exposed, that field MUST be `unknown` rather than synthesized as a fact.

**Scenario:** Given diagnostic capture is enabled for one startup, when events are recorded across the startup path, then they share a diagnostic run identity and retain their own event and parent identities without claiming an unavailable runtime session identity.

### R2. Extension load and registration provenance

The system MUST record module evaluation/load and extension registration as distinct event types. Each observed load MUST have a load identity; each observed registration MUST have a registration identity linked to its load identity. The per-run summary MUST report identities and independently derived counts for both types.

**Scenario:** Given the same resolved extension source is evaluated twice and each evaluation registers a handler, when the trace is summarized, then it contains two distinct load identities and two linked registration identities rather than one event with a count of two.

### R3. `session_start` invocation provenance

The system MUST assign a new invocation identity on every `session_start` handler entry and link it to the registration identity whose handler ran. The trace MUST preserve the UI availability and CLI-filter outcome as observed fields so skipped invocations are not confused with missing invocations.

**Scenario:** Given one registered handler receives `session_start` twice, when both entries are observed, then the summary reports one registration and two distinct invocation identities linked to it.

### R4. Notification emission provenance

Immediately before each actual `ctx.ui.notify` call, the system MUST record a unique notification-emission identity linked to the originating `session_start` invocation across the asynchronous notice path. It MUST also record a normalized message digest and observed session/run provenance without storing the full message solely for this diagnostic.

**Scenario:** Given one `session_start` invocation reaches `ctx.ui.notify` once after asynchronous work, when the call boundary is reached, then exactly one emission identity is recorded and linked to that invocation before the API call occurs.

### R5. Independent presentation evidence

The diagnostic capture MUST count visible startup presentations independently of notification emissions. Each observed presentation MUST have a capture identity, timestamp, normalized output digest, process/run provenance, and an observed channel classification such as notification overlay, banner/stdout redraw, or `unknown`.

**Scenario:** Given one recorded notification emission is visibly presented twice, when the PTY/renderer capture is summarized, then it reports one emission identity and two presentation identities without converting the presentation count into extra notification calls.

### R6. Fail-closed interpretation

The classifier MUST use identities and parent links, not counts alone. It MUST report:

- loader duplication supported only when complete evidence shows distinct load identities for the same resolved extension source in one startup run, with their linked registrations;
- renderer duplication supported only when complete evidence shows one load, one registration, one handler invocation, one notification emission, and multiple attributable presentation identities;
- a distinct intermediate pattern when duplication occurs at registration, event delivery, or notification emission instead; and
- `unknown` when any evidence required for a conclusion is missing, stale, uncorrelated, or has an unknown channel/source.

Missing events MUST NOT be counted as zero.

**Scenario:** Given a capture has one notification emission and two visible occurrences but lacks reliable load or presentation-channel evidence, when it is classified, then the result is `unknown`, not renderer duplication.

### R7. No behavior change

The diagnostic MUST be opt-in and MUST use a structured side channel rather than the startup notification or terminal presentation channel. With diagnostics disabled, user-visible startup behavior and control flow MUST remain unchanged; with diagnostics enabled, recording failure MUST preserve behavior while marking the affected evidence unavailable.

**Scenario:** Given the diagnostic sink is disabled or fails, when Pi-Ein starts, then existing startup handling continues unchanged and the failed/missing diagnostic stage is not reported as successful evidence.

## C. Decisions

### Architecture decisions and trade-offs

- **One narrow provenance vocabulary:** use load, registration, lifecycle invocation, notification emission, and visible presentation events. This is enough to locate multiplicity without a general telemetry framework.
- **Separate load from registration:** two registrations from one evaluation indicate a different failure mode from two module evaluations and MUST NOT be labeled loader duplication.
- **Propagate correlation through the async seam:** the originating handler invocation identity is attached before notice scheduling and retained until the notify boundary; timestamps alone are insufficient.
- **Hash presentation content:** normalized digests support attribution while avoiding unnecessary capture of notification text. A digest match alone is not conclusive without run, time, and channel provenance.
- **External presentation observation:** PTY/renderer capture owns visible-occurrence counts; application instrumentation does not infer rendering from a successful notify call.
- **Fail closed:** summaries distinguish `observed`, `unknown`, and, only where positively established, zero. Absence of a record is not evidence that an event did not occur.

### Responsibility boundaries

| Boundary | Responsibility |
| --- | --- |
| Extension entry | Record load/evaluation and registration identities. |
| `session_start` handler | Create invocation identity and record filter/UI observations. |
| Notice path | Carry correlation only; detector internals remain outside this diagnostic. |
| `ctx.ui.notify` boundary | Record attempted API-call identity and message digest immediately before the call. |
| PTY/renderer capture | Record visible presentation occurrences and observed channel. |
| Deterministic summarizer/classifier | Derive per-run counts and apply the interpretation gates without guessing. |
| Later apply/verify phases | Implement under strict TDD and collect real reproduction evidence; this design phase does neither. |

### Alternatives rejected

- **Count only `ctx.ui.notify` calls:** rejected because one call can be rendered twice and two calls can share identical text.
- **Use only source call-site count, manifest contents, or doctor verification:** rejected because none proves runtime load or presentation multiplicity.
- **Use timestamps without identities:** rejected because asynchronous overlap cannot establish parentage reliably.
- **Instrument detector internals or the entire loader/renderer:** rejected as broader than the smallest diagnostic needed.
- **Deduplicate notifications preemptively:** rejected because it changes behavior before the cause is known and could hide loader or event-delivery defects.

### Skill applicability

Architecture, Ein discipline, and cognitive document design informed the minimal boundary-led, reviewable artifact. GSAP plugins and Nuxt were not applicable to the Pi runtime diagnostic; skill-registry actions were skipped because no skills changed and no delegation was performed.

## D. Success Criteria

- A controlled startup run yields separate observed/unknown counts plus identities for extension loads, registrations, `session_start` invocations, notification emissions, and visible presentations.
- Every notification emission can be traced to one handler invocation and registration when evidence is complete; every registration can be traced to one load.
- A two-load trace and a one-emission/two-presentation trace produce different supported classifications; duplicate registration, duplicate event delivery, and duplicate emission remain separate outcomes.
- Removing any classification-critical stage from otherwise identical evidence changes the result to `unknown`, not zero or a supported diagnosis.
- Normal startup content, filtering, ordering, and notification behavior are unchanged when diagnostics are disabled, and diagnostic sink failure does not block startup.
- Later apply/verify must satisfy focused strict-TDD checks and the repository gate `bun test`, then perform one manual PTY startup capture with the actual startup arguments, discovery result, process/environment provenance, and effective extension source. No test, build, typecheck, or reproduction is run in this design phase.
