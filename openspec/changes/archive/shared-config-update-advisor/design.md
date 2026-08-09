# Design — shared-config-update-advisor

## A. Proposal

### Intent

Introduce the smallest deterministic, read-only contract that turns existing configuration, project-state, version, release, and installer-capability evidence into source-attributed advice. The launcher, Pi-Ein notice, and installer doctor will consume that contract without becoming configuration writers or update executors.

### Scope

**In scope**

- A pure advisor result with separate configuration and update facets, explicit uncertainty, provenance, reason, recommendation, and installer-owned handoff metadata.
- Status-preserving read adapters for B project state, work mode/model configuration, Pi update probes, installer marker/ownership, release metadata, and action capability.
- Migration of `EinUpdateAvailability` booleans so rejection, timeout, malformed data, and skipped checks are not represented as “no update”.
- Equivalent normalized semantics in the separate workbench/launcher, Pi-Ein notice, and installer doctor. Surface layout may differ.
- Focused deterministic tests for evaluation, normalization, rendering parity, no writes/spawns/action dispatch, privacy, and stale/error cases.

**Out of scope**

- Any install, update, repair, release, configuration write, background check scheduler, cache, or second project-state store.
- Moving installer logic into the launcher, making the launcher a universal updater, or changing installer transaction ownership.
- Expanding the in-process `ein-doctor` extension unless a later scoped change explicitly makes it a participating surface.
- Dashboard/navigation work, session/history transfer or persistence, cleaner/architect behavior, parallel writers, and all roadmap G–L work.

### Affected areas

- Shared contract/evaluator and evidence normalization: a new focused module under `ein-pi/agent/lib/`, with narrow status-preserving inspectors in `mode.ts` and `model-config.ts` only where existing readers currently erase evidence.
- Existing consumers: `ein-update-notice.ts`, `ein-banner.ts`, `workbench.ts`, and `ein-pi/workbench.ts`.
- Installer-owned read boundaries and doctor presentation: `installer/src/core/marker-v2.ts`, release/capability adapters beside installer core, `installer/src/core/verify.ts`, and `installer/src/cli/doctor.ts`. Mutation modules remain untouched.
- Focused Bun tests around update notice, workbench, release-state/read contracts, CLI/menu non-dispatch, and one predecessor E2E consistency case.

### Contract shape

The versioned result is immutable and contains two independent facets so one unavailable source does not erase valid evidence from the other:

- `configuration.status`: `current | incomplete | unavailable | unsupported | ambiguous | error`.
- `update.status`: `current | update-available | unavailable | unsupported | ambiguous | error`.
- Each facet carries a stable `reason` code, `freshness: current | stale | unknown`, and a bounded list of provenance entries. Provenance identifies the authority/source, observed quality, and normalized reason; it contains no raw path, response body, exception, environment value, token, or command output.
- `recommendation.kind`: `none | inspect-configuration | retry-read | resolve-ambiguity | installer-handoff | unsupported-action`.
- An optional handoff is data only: `{ owner: "installer", action: "install" | "update" | "repair" | "configure", actionId, performed: false }`. It is emitted only when fresh evidence proves the action and owner. `actionId` points to an existing installer-owned action; neither evaluator nor renderer resolves it by invoking a command.

The evaluator receives already-observed evidence and has no filesystem, network, clock, environment, process, cache, or global-state access. Freshness is supplied by the authoritative reader (including B’s exact-state/freshness result), making repeated evaluation of equal inputs byte-for-byte equal.

### Normalization rules

- `current` requires fresh, successful, mutually consistent evidence. Absence of an update, failed comparison, malformed marker, skipped/offline check, or timeout never establishes `current`.
- A fresh, valid comparison that proves a newer eligible version yields `update-available`; a successful comparison proving no newer version yields `current`.
- Missing required configuration yields `incomplete`. Missing optional overrides remain valid only when the existing authority supplies a known effective default (for example work mode’s canonical `solo` default), and provenance records that default.
- An explicitly unavailable source or disabled check yields `unavailable`; an explicitly unsupported capability or external owner yields `unsupported`; present-but-unreadable/invalid/throwing evidence yields `error`; conflicting valid values, version regression, or ambiguous ownership yields `ambiguous`.
- Stale evidence remains visible in provenance but cannot prove `current`, `update-available`, or a handoff. Stale evidence alone yields `unavailable` with `stale-evidence`; contradictory evidence yields `ambiguous`.
- Valid evidence from unaffected sources remains present even when another source fails. Raw failures are reduced to stable reason codes and safe bounded detail.

### Risks

- Existing mode/model and marker readers intentionally collapse malformed/missing cases; changing their established return behavior would cause unrelated regressions. The advisor therefore needs additive detailed inspectors, not semantic rewrites of current callers.
- Three presentation surfaces can drift if they derive labels or handoffs locally. They must render the normalized result and may vary only layout/suppression policy.
- Network results can become stale between observation and presentation. No cache is introduced; freshness and observation identity must travel with evidence, and stale results lose actionability.
- Cross-area production work can exceed the 400-line review budget. Keep implementation as review-sized internal work units; the Review Workload Guard determines delivery shape later from its production-line forecast.

### Rollback

Revert consumer wiring and the additive read adapters, restoring the former notice/doctor/workbench behavior; no state migration or cleanup is required because the advisor persists nothing. Keep installer transaction/marker writers untouched throughout. If compatibility requires a staged rollback, retain a temporary boolean-to-evidence adapter at the notice boundary, never inside the canonical evaluator.

### Success criteria

- Equal normalized evidence produces equal facet status, reason, provenance semantics, recommendation, ownership, and `performed: false` across launcher, notice renderer, and doctor.
- Current, update-available, incomplete, unavailable, unsupported, ambiguous, error, and stale cases are distinguishable and fail closed.
- Advisor reads produce no filesystem changes, child processes, installer action calls, caches, session records, or project-state projections.
- Output gives a safe installer-owned next step only when supported and never says an action started or completed.
- Rendered output excludes raw private paths, environment values, tokens, payloads, exceptions, opaque project references, and control sequences.

### Behavior declaration context

| Path | SHA-256 | UTF-8 bytes |
|---|---|---:|
| `openspec/changes/shared-config-update-advisor/specs/sdd-lifecycle/spec.md` | `5bea36625791674a680b8d53bfcf1074fca5a44c3afcae821109d089b8176685` | 2787 |

No additional domain spec was selected; the validated declaration remains within the canonical context budget.

## B. Spec

### Requirement 1 — Deterministic source-attributed contract

The system **MUST** return separate normalized configuration and update facets with explicit status, freshness, stable reason, provenance, recommendation, and ownership semantics, and equal inputs **MUST** produce equal results.

**Scenario:** Given identical normalized evidence from supported authorities, when two consumers evaluate it, then both receive the same configuration/update statuses, reasons, provenance semantics, and recommendation.

### Requirement 2 — Explicit current and update availability

The system **MUST** report configuration or update state as `current` only from fresh successful evidence, and **MUST** report `update-available` only from a fresh valid comparison proving a newer eligible version.

**Scenario:** Given valid current configuration, an unambiguous installed owner, and a fresh eligible release newer than the installed version, when advice is evaluated, then configuration is `current`, update is `update-available`, and any handoff is marked installer-owned and not performed.

### Requirement 3 — Configuration evidence normalization

The system **MUST** preserve missing required configuration as `incomplete`, unsupported configuration capability as `unsupported`, unreadable or invalid configuration as `error`, and conflicting authoritative values as `ambiguous`; it **MAY** treat an absent optional override as current only when the existing authority supplies a known effective default.

**Scenario:** Given a malformed higher-precedence mode file or invalid model-routing file, when advice is evaluated, then the affected configuration facet is not current, carries the normalized source and reason, and no write is attempted.

### Requirement 4 — Fail-closed update evidence

The system **MUST NOT** translate a timeout, rejection, missing/malformed marker, skipped check, unknown provider response, invalid release, version conflict, or ambiguous owner into `current` or an actionable update.

**Scenario:** Given a failed release request and a malformed marker while another configuration source remains valid, when advice is evaluated, then update is `unavailable`, `error`, or `ambiguous` as appropriate, valid configuration evidence remains visible, and no update handoff is emitted.

### Requirement 5 — Stale evidence and B authority

The advisor **MUST** consume B’s project snapshot and exact-state/freshness signals without re-projecting, caching, or competing with them; stale decisive evidence **MUST NOT** establish current state, update availability, or an actionable handoff.

**Scenario:** Given a B snapshot or update observation marked stale, when advice is evaluated, then stale provenance is preserved, the affected facet fails closed, and B remains the sole project-state authority.

### Requirement 6 — Advice/action separation

The system **MUST** keep install, update, repair, release, and mutating installer configuration behind installer-owned action boundaries. Guidance **MUST** identify the installer-owned action and **MUST NOT** request, start, spawn, dispatch, complete, or claim that action.

**Scenario:** Given an update is available and installer ownership/capability is proven, when guidance is rendered, then it points to the installer action, states that it was not performed, and no installer mutation owner is called.

### Requirement 7 — Consistent consumer semantics

The workbench/launcher, Pi-Ein notice, and installer doctor **MUST** consume the shared advisor result rather than derive status or ownership independently. Presentation **MAY** differ or suppress a non-actionable startup notification, but it **MUST NOT** change the underlying normalized meaning or treat silence as current.

**Scenario:** Given one advisor fixture supplied to all participating renderers, when each renders it, then status, reason, uncertainty, owner, and handoff meaning agree and none adds updater behavior.

### Requirement 8 — Boolean notice migration and startup safety

The Pi-Ein notice collector **MUST** replace boolean availability with status-preserving evidence; source failure or timeout **MUST** remain unavailable/error rather than false/current, while notice startup **MUST NOT** block or fail the host session.

**Scenario:** Given one update source times out and another proves an update, when the non-blocking notice completes, then the timed-out source remains explicitly uncertain, the proven source remains available, late results are ignored, and session startup continues without mutation.

### Requirement 9 — Read-only and private output

Advisor collection, evaluation, and rendering **MUST** be read-only and **MUST NOT** expose raw paths, payloads, exceptions, environment values, tokens, opaque state references, or terminal control characters.

**Scenario:** Given failures containing private paths, secrets, and control sequences, when any participating surface renders advice, then only bounded stable source/reason/action identifiers appear and all observed files and mutation-call counters remain unchanged.

## C. Decisions

### 1. One pure evaluator, authority-local adapters

The canonical contract/evaluator lives in a dependency-light `ein-pi/agent/lib` module because that module is already deployable with Pi-Ein and consumable by the workbench. Each authority keeps its read adapter beside itself: Ein config adapters inspect mode/model evidence; installer core adapts marker/release/ownership/capability evidence; Pi probes adapt provider/package results. Consumers depend inward on the contract. The evaluator does not import CLI commands, transactions, marker commits, config writers, package mutation, or surface code.

**Trade-off:** authority-local adapters add small translation seams, but prevent a shared module from acquiring filesystem/network/process powers or duplicating installer behavior.

### 2. B snapshot is an input, never an owned sub-state

The advisor accepts the already-produced `ProjectStateV1`/normalized freshness evidence by injection. It neither rereads OpenSpec/Git/EIN nor stores/projectors a derivative snapshot. This preserves B’s source attribution, exact-state authority, and no-competing-store guarantee.

### 3. Two facets instead of one lossy overall status

Configuration and update status remain independent. This is the smallest structure that can preserve a valid configuration result when release metadata is unavailable (and vice versa) without inventing precedence that hides evidence. Surface summaries may order severe statuses, but may not replace either facet.

### 4. Additive detailed readers

Existing `readMode`, model readers, and `readMarkerV2` retain compatibility behavior for current callers. Additive inspectors expose `missing`, `valid`, `invalid`, `unreadable`, precedence/default provenance, and normalized failures to the advisor. Release `Result` errors remain authoritative. This avoids broad configuration refactoring while eliminating evidence collapse only on the advisor path.

### 5. Handoffs are inert typed data

An installer handoff contains a closed action identifier and literal `performed: false`; it has no callback, executable, argv, URL, or function reference. Installer-owned code remains the only place that maps an action to execution. Surface renderers describe the handoff but cannot execute it through the advisor contract.

### 6. Renderer policy is separate from semantics

A shared semantic formatter supplies stable labels/reason/owner text. Workbench and doctor show both facets. The startup notice remains runtime-gated and non-blocking and may emit only useful attention, but its collector and renderer no longer convert uncertainty to “no update.” This keeps startup safe without weakening the contract.

### 7. Strict TDD seams

Pure evaluator and formatter tests form the first RED/GREEN boundary. Read adapters use injected filesystem, HTTP, clock/freshness, and package probes; mutation capabilities are absent from their input types. Integration fakes count writes, child spawns, and installer action dispatch. Contract fixtures are reused verbatim across all renderers, followed by one bounded E2E/no-write triangulation. No real network, provider process, release infrastructure, or installer mutation is used.

### 8. Review-sized internal work units

Implementation is organized into four review-sized internal work units: pure contract/evaluator; additive detailed read adapters; notice migration plus one consumer; remaining launcher/doctor parity and regression guards. Tests stay with the unit they verify. These units define implementation and review boundaries only; they do not prescribe delivery topology. At delivery, the Review Workload Guard exclusively determines delivery shape from its production-line forecast and applies its user decision gate when required.

### Alternatives rejected

- **Keep `{pi:boolean, ein:boolean}`:** rejected because false conflates current, timeout, rejection, malformed response, disabled checks, and unsupported capability.
- **Let each surface interpret evidence:** rejected because it recreates inconsistent authority and ownership claims.
- **Put updater callbacks in the advisor:** rejected because it violates read-only behavior and installer mutation ownership.
- **Create an advisor cache/store or extend B’s projector to own installer state:** rejected because F owns normalization only and B remains project-state authority.
- **Treat stale/unknown as current for quiet UX:** rejected because it is unsafe and contradicts the validated fail-closed delta.
- **Include the in-process doctor or roadmap G–L work now:** rejected as unnecessary scope and review risk.

## D. Success Criteria

### Observable acceptance checks

- Contract tests cover configuration current/incomplete/unavailable/unsupported/ambiguous/error and update current/update-available/unavailable/unsupported/ambiguous/error.
- Timeout, rejection, malformed response/marker, unknown comparison, ownership ambiguity, conflicting versions, and stale evidence never become current or actionable.
- Workbench, notice renderer, and installer doctor fixtures agree on normalized status, reason, freshness, ownership, and not-performed handoff semantics.
- Mode precedence/default and model legacy-path evidence are normalized without changing existing non-advisor reader behavior.
- Repeated collection/rendering leaves tracked config, installer marker, project state, session history, caches, and release state byte-identical; write/spawn/install/update/repair/configure counters remain zero.
- Rendered failures are bounded and contain no fixture secrets, absolute paths, raw exceptions/payloads, opaque state references, ANSI, carriage returns, or cursor controls.
- Installer CLI/menu regression tests prove advisor presentation cannot dispatch install or update.
- No source or test associated with dashboard, ledger (G), cleaner (H–I), architect (J–K), or parallelism (L) changes.

### Verification commands for later phases

```sh
bun test tests/ein-banner-updates.test.ts tests/minimal-workbench-launcher.test.ts
bun test tests/release-update-contract.test.ts tests/release-update-acquisition.test.ts tests/release-update-state-primitives.test.ts
bun test tests/release-update-cli.test.ts tests/release-update-integration.test.ts tests/updater-cli-entrypoints.test.ts tests/installer-runtime-menu.test.ts
bun test tests/beta-launcher-e2e-hardening.test.ts
cd installer && bun run typecheck
```

These commands are verification targets for apply/verify; they were not run during design.
