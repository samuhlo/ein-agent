# EIN Product Roadmap

EIN-Pi is the flagship and primary product. Packaged deterministic acceptance proves Cleaner and Architect in Pi. Finish the active continuity work, then strengthen the installer control plane and launcher before revisiting Claude Cleaner/Architect parity.

The product direction is deliberately narrow:

1. Preserve the accepted packaged Pi Cleaner and Architect behavior; live credentialed semantic smoke remains optional and separate.
2. Stabilize the active provider-neutral Pi↔Claude continuity work.
3. Complete the installer control plane.
4. Improve the launcher while preserving its controller and legacy renderer.
5. Defer bounded Claude Cleaner/Architect parity until those product foundations are stable.

## Current Status

| Area | Status | Current truth |
|---|---|---|
| EIN-Pi | `primary` | Pi is the architecture target and the first runtime for all new behavior. |
| Cleaner | `accepted in packaged Pi` | Deterministic packaged acceptance covers the internal Pi workflow, bounded mutation safety, evidence collectors, and isolated runtime closure. Live credentialed semantic smoke remains optional and separate. |
| Architect | `accepted in packaged Pi` | Deterministic packaged acceptance covers the named read-only Pi workflow and its bounded evidence and plan contracts. Live credentialed semantic smoke remains optional and separate. |
| SDD integration | `accepted in packaged Pi` | Deterministic acceptance covers independent participation and the fixed apply→Cleaner→Architect→verify order. Provider-neutral reconstruction remains continuity work. |
| Provider-neutral continuity | `stabilizing` | Complete and verify the active WU1-WU9 continuity bytes before opening the next product front. See [`plan-continuidad-pi-claude.md`](plan-continuidad-pi-claude.md). |
| Claude parity | `deferred` | Cleaner and Architect remain intentionally excluded from Claude until installer and launcher priorities are complete. |
| Installer | `active next priority` | Targets, backups, update journal, rollback, acquisition checks, doctor, and uninstall foundations exist. The first control-plane unit adds one authoritative read-only install inventory and exact dry-run; execution consumes it in WU2. |
| Launcher | `follows installer` | Shared project state, sessions, launch plans, update status, and isolated Pi/Claude flows exist. Preserve the controller and legacy renderer. |
| OpenTUI migration | `stopped` | Functional acceptance passed, but startup and distribution costs failed mandatory gates. No production migration is authorized. |

## Product Boundaries

### What EIN is building

- One Cleaner implementation used by the `ein-cleaner` Pi subagent.
- One Architect implementation used by the `ein-architect` Pi subagent.
- Natural-language invocation inside an active Pi session.
- Optional control commands inside Pi for explicit invocation and activation state.
- Small deterministic helpers that reduce token use and constrain unsafe behavior.
- Minimal Claude-native assets later, solely to reproduce proven Pi behavior.

### Simplicity Rules

1. Build for Pi first.
2. Keep Cleaner and Architect inside the parent agent runtime.
3. Keep deterministic collectors and contracts internal.
4. Share logic instead of duplicating Pi and Claude engines.
5. Add abstraction only after concrete duplication proves it necessary.
6. Prefer bounded workflows and explicit state over platform layers.

### Deterministic-First Rule

Cleaner and Architect must obtain computable facts before spending model tokens interpreting them. Internal tools calculate metrics, coverage, duplication, dependency graphs, source fingerprints, scope boundaries, and other verifiable evidence. The model interprets those facts, identifies semantic concerns, prioritizes findings, plans changes, and performs only justified work.

This ordering is mandatory because it reduces token use while improving repeatability and auditability. It must not reduce quality: deterministic collectors cannot replace semantic reasoning when meaning, intent, responsibility, or architectural tradeoffs require model judgment. Weak heuristics must be reported as incomplete evidence, not promoted into conclusions.

Minimal acceptance uses representative equivalent scenarios. For each scenario, record the deterministic evidence supplied to the model, verify that the model does not reconstruct equivalent computable facts, and confirm that required semantic inspection and outcome quality are preserved. Tool choice and numeric thresholds remain deferred to the owning workflow units.

### Non-Goals

This roadmap explicitly rejects:

- external Cleaner or Architect CLI programs;
- public Cleaner or Architect JSON or machine APIs;
- standalone runner UX for either subagent;
- a generic capability platform;
- a generic provider registry;
- duplicated Pi and Claude Cleaner or Architect engines;
- OpenCode support in the current roadmap; it is explicitly deferred;
- exposing deterministic collectors as product surfaces;
- enabling Architect by default or bypassing the selected project profile;
- Architect source mutation in v1;
- autonomous cross-project mutation;
- reopening the renderer decision.

OpenCode is only a deferred future possibility. Consider a provider abstraction after a third runtime creates real duplication and the Pi/Claude seams are proven.

## Target Pi Architecture

```text
user in EIN-Pi
  |
  | natural language or optional /ein controls
  v
parent orchestrator
  |-- ein-scout
  |-- ein-cleaner
  `-- ein-architect
        |
        v
internal deterministic tools
  |-- project and scope discovery
  |-- source-state fingerprints
  |-- coverage and complexity collectors
  |-- duplication evidence
  |-- CodeGraph facts
  `-- bounded write and verification helpers
```

The parent orchestrator owns routing, activation state, SDD sequencing, and user-visible progress. Named subagents own their workflows and semantic judgment. Deterministic tools collect facts, enforce boundaries, and verify state without becoming user-facing products.

The implementation must not fork Cleaner or Architect logic by runtime. Pi owns the first complete behavior. Claude later receives the smallest native prompt, agent, hook, or command assets needed to produce the same visible workflow.

## Invocation Inside Pi

Users invoke subagents through normal conversation:

- "Ask Cleaner to audit the files changed in this task."
- "Have Cleaner improve this module without changing behavior."
- "Ask Architect to inspect the dependency direction under `src/core`."
- "Have Architect validate this refactoring plan."

Optional controls provide predictable activation and direct routing:

```text
/ein:cleaner <request>
/ein:architect <request>
/ein:cleaner on|off|status
/ein:architect on|off|status
```

These are controls inside Pi, not shell commands. Natural language remains the primary interaction.

## Independent Activation

EIN-Pi onboarding asks once per project for one automatic SDD participation profile and persists it in `.pi/ein/agents.json`. Missing configuration is an onboarding essential. `Use recommended` writes Balanced only when the file is missing and never overwrites an existing choice. `/ein:onboard` reconfigures the profile later; no SDD flow asks again.

Profiles are ordered and presented as:

1. **Balanced (recommended/default):** Cleaner on, Architect off.
2. **Thorough:** Cleaner on, Architect on.
3. **Manual:** Cleaner off, Architect off.

An existing Cleaner-off, Architect-on combination is shown honestly as `custom` until the user selects a supported profile. The startup banner renders persisted values as `CLEANER auto:on/off` and `ARCH auto:on/off`.

A simple project-local `.pi/ein/agents.json` shape is sufficient:

```json
{
  "agents": {
    "cleaner": { "enabled": true },
    "architect": { "enabled": false }
  }
}
```

Project configuration provides the automatic default for new sessions. `/ein:cleaner on|off` and `/ein:architect on|off` remain session overrides only and never rewrite the project profile. The `status` control reports the effective value and whether it comes from project configuration or a session override.

Activation controls automatic SDD participation only. While `off`, a direct natural-language request or `/ein:cleaner <request>` / `/ein:architect <request>` may invoke any supported mode, including Cleaner improve. Explicit invocation still follows every normal scope, write, freshness, verification, and safety requirement.

## SDD Sequencing

When enabled, the exact order is:

```text
sdd-apply -> ein-cleaner -> ein-architect -> sdd-verify
```

The orchestrator skips disabled subagents without changing the relative order:

| Cleaner | Architect | Sequence |
|---|---|---|
| off | off | `sdd-apply -> sdd-verify` |
| on | off | `sdd-apply -> ein-cleaner -> sdd-verify` |
| off | on | `sdd-apply -> ein-architect -> sdd-verify` |
| on | on | `sdd-apply -> ein-cleaner -> ein-architect -> sdd-verify` |

SDD wiring must reuse the same subagents as direct existing-code requests. It must not create SDD-specific Cleaner or Architect implementations.

Failures are explicit. A blocked or failed enabled subagent prevents verification from claiming a complete workflow unless the user deliberately disables or resolves it.

## Milestone 1: Pi Subagents (Deterministically Accepted)

**Outcome:** Cleaner and Architect work as named internal Pi subagents, can inspect existing code, and participate independently in SDD. Packaged deterministic acceptance is complete; live credentialed semantic smoke is optional evidence and does not reopen this milestone.

### Cleaner Workflow

Cleaner improves maintainability without changing product behavior. It supports two modes inside Pi: read-only audit and bounded improvement.

```text
scope request
  -> deterministic evidence
  -> semantic audit
  -> bounded plan
  -> optional writes
  -> focused verification
  -> progress update
```

#### Audit

Cleaner should:

- validate the project root and requested scope;
- discover relevant language and test tooling;
- collect deterministic evidence before semantic inspection or planning;
- collect available coverage, complexity, CRAP, and duplication evidence;
- inspect naming, responsibility, coupling, dead code, readability, and semantic duplication;
- distinguish measured facts from agent judgment;
- rank findings by evidence, risk, and likely value;
- report unsupported or missing evidence honestly.

Audit performs no source writes.

#### Improve

Cleaner may improve code only after it has a bounded scope and plan. It should:

- preserve observable behavior;
- own an exact file set for the run;
- reject stale evidence or changed preconditions;
- avoid files outside the approved scope;
- make small, reviewable changes;
- run focused checks and project-required verification;
- report incomplete or failed verification rather than claiming success;
- retain enough recovery information for the bounded write set.

Cleaner must not add product features, redesign architecture, or expand the requested scope silently.

#### Existing-Code Scope

Users can ask Cleaner to inspect a directory, module, changed-file set, feature boundary, or another explicit scope from inside Pi. Cleaner rejects ambiguous roots and unbounded requests before collecting expensive evidence or writing files.

#### Progress and Freshness

Cleaner keeps a lightweight project-local progress record containing:

- reviewed scope;
- source-state fingerprint;
- important findings and disposition;
- completed improvements;
- verification evidence;
- freshness or invalidation state.

Fresh areas may be skipped on later broad audits. Changed or explicitly requested areas are reviewed again. The progress record is an internal efficiency aid, not a public API.

#### Optional Teaching

Cleaner can explain significant improvements when teaching is enabled. Teaching output should focus on transferable reasoning, avoid repeating recorded lessons, and never alter execution or safety decisions.

### Architect Workflow

Architect v1 is read-only. It audits, plans, and validates architecture without modifying source files.

```text
scope request
  -> CodeGraph and repository facts
  -> architectural interpretation
  -> findings or plan
  -> read-only validation
```

Architect should inspect:

- module and package boundaries;
- dependency direction and cycles;
- high-level policy coupled to low-level details;
- encapsulation and information hiding;
- accidental public surfaces;
- ownership and responsibility boundaries;
- invariants that a proposed change must preserve;
- useful property-test suggestions such as round trips, idempotence, ordering, conservation, and boundary constraints.

Every architectural claim must trace to graph or repository facts. Architect labels inference, uncertainty, and missing evidence separately.

Architect must gather reusable graph and repository facts before model interpretation. It must not spend model context reconstructing facts that internal tools can calculate, and it must not treat graph topology or metric thresholds as substitutes for semantic architectural judgment.

Architect plans should describe proposed boundaries, affected modules, migration order, risks, invariants, verification, and unresolved decisions. Validation checks plan consistency and evidence freshness only. Architect v1 has no path that writes or reorganizes source code.

### Pi Definition of Done

- Pi discovers and routes to both named subagents.
- Natural-language requests and optional controls produce the same workflows.
- Automatic participation follows the persisted onboarding profile, while session overrides remain independent.
- Cleaner audit works on explicit existing-code scope.
- Cleaner improve enforces bounded writes, freshness, and verification.
- Cleaner progress and optional teaching are usable without affecting safety.
- Architect audits, plans, and validates with traceable graph facts.
- Architect performs no source mutation.
- Cleaner and Architect collect computable evidence before model interpretation.
- Deterministic-first execution measurably avoids redundant model analysis without dropping required semantic inspection.
- All four SDD toggle combinations follow the exact sequence table.
- Representative packaged Pi scenarios prove behavior, cancellation, failure reporting, and resume paths without requiring model credentials.

## Milestone 2: Stabilize Provider-Neutral Continuity

**Outcome:** Users continue work between fresh native Pi and Claude sessions through a bounded neutral checkpoint. Finish and verify the current continuity units without expanding them into Cleaner/Architect parity.

The canonical continuity plan is [`docs/plan-continuidad-pi-claude.md`](plan-continuidad-pi-claude.md). Continuity derives current project facts, persists a privacy-safe checkpoint, and injects a bounded resume brief; it never converts transcripts or claims exact session equivalence. The terminal app's **Continue in Pi/Claude** action belongs to this milestone and is distinct from native Resume.

Pi deterministic acceptance has passed. Cleaner and Architect parity remains deferred until after installer and launcher work. When resumed, it must add only the minimum Claude-native assets required for:

- named Cleaner and Architect access;
- equivalent natural-language behavior;
- equivalent optional controls where Claude supports them;
- independent disabled-by-default activation;
- the same SDD order and skip behavior;
- equivalent scope, freshness, write, and verification safety;
- equivalent progress and failure visibility.

Shared Cleaner and Architect logic remains singular. Claude-specific prompts, hooks, packaging, or runtime glue may differ, but they must not redefine workflow semantics.

Parity means equivalent user-visible outcomes on representative packaged scenarios. It does not require identical private session mechanisms or runtime internals.

Do not extract a generic adapter layer during this milestone. If a third runtime is pursued later and creates concrete duplication, extract the smallest abstraction from the proven Pi and Claude seams.

## Milestone 3: Installer Control Plane

**Outcome:** The installer manages Pi, Claude, shared EIN assets, updates, diagnosis, and removal as one coherent, recoverable lifecycle.

Keep the existing TypeScript/Bun installer and improve it incrementally; do not start a Go rewrite while lifecycle contracts are still moving:

- one authoritative inventory of managed assets and ownership;
- deterministic plans for install, update, repair, selective uninstall, and full uninstall;
- dry-run that matches the exact planned transaction;
- sibling staging before replacement;
- checksum and structure verification before commit;
- atomic replacement followed by byte and metadata readback;
- durable journal and persistent backups across interruption;
- complete rollback of the affected transaction boundary;
- doctor that separates observation, recommendation, and mutation;
- selective removal that preserves unrelated runtimes and user-owned files;
- independent release signatures in addition to SHA-256;
- preflight and post-publication verification for supported targets.

A future Go installer-only spike becomes eligible if the downloadable asset remains above 30 MiB, cold `--version` or dry-run p95 remains above 200 ms, Windows becomes committed and Bun misses acceptance, or repeated filesystem/signal defects persist. Cut over only if the spike preserves these contracts, clearly deletes the replaced TypeScript command, and meets native distribution and latency goals.

### Installer Definition of Done

- Pi-only, Claude-only, combined, repair, update, and removal use one planner.
- Every managed write has an owner, staged artifact, verification, readback, and rollback source.
- Fault injection proves recovery from acquisition, staging, replacement, readback, and journal failures.
- Doctor reports coherent state from managed inventory, not markers alone.
- Selective uninstall proves the retained runtime still works.
- Published assets pass signature, checksum, lifecycle, and rollback verification.

## Milestone 4: Launcher Last

**Outcome:** The launcher presents stable project and managed-state information after the underlying contracts are proven.

The launcher remains a consumer, not the owner of subagent logic, runtime execution, or installer transactions. It may later show project configuration, activation status, subagent progress, sessions, updates, and installer health. The earlier continuity milestone may add only the bounded **Continue in Pi/Claude** action and its isolation fix; that exception does not authorize a general launcher redesign.

The legacy renderer remains the production path. OpenTUI migration stays stopped because startup and distribution costs failed the approved gates. This roadmap authorizes no renderer migration, new renderer dependency, or reopening of that decision.

Go remains only a measured launcher fallback for demonstrated startup, terminal, or platform failures. Any such spike must preserve the current controller and legacy renderer boundaries.

### Launcher Definition of Done

- Launcher status matches authoritative project and installer state.
- Actions delegate to their owning runtime or installer boundary.
- Configuration writes validate, apply atomically, and read back.
- Direct Pi and Claude launch paths remain usable without the launcher.
- The legacy renderer remains shipped and supported.

## Milestone 5: Deferred Claude Cleaner/Architect Parity

**Outcome:** After continuity, installer, and launcher foundations are stable, Claude reproduces proven Pi behavior without a second engine or generic provider framework.

- Pi remains the reference behavior.
- Claude passes the same user-visible scenario matrix.
- Claude uses the shared Cleaner and Architect implementations.
- Runtime-specific assets stay small and isolated.
- No provider registry or future-runtime contract is introduced.
- Packaged Pi and Claude installations preserve their isolated launch paths.

## Reviewable Work Units

Each work unit should deliver one observable behavior with its tests, fixtures, documentation, runtime evidence, and rollback boundary. Keep authored changes below 400 changed lines where practical, and split larger work by behavior rather than file type.

Every unit records:

- the exact user-visible outcome;
- explicit scope and non-goals;
- focused automated verification;
- at least one representative runtime scenario;
- failure and rollback behavior;
- changed-line count and a split decision when over budget.

Do not combine Cleaner, Architect, SDD wiring, Claude parity, installer transactions, or launcher presentation into one cross-cutting unit.

## Next Work Units

Stabilize continuity WU1-WU9, then deliver installer control-plane units beginning with the canonical read-only install inventory and exact dry-run. WU2 makes real install execution consume that plan. Launcher improvements follow; continuity WU10 Cleaner/Architect Claude parity remains deferred.

Claude Cleaner and Architect parity is not present today. It begins only in the bounded parity unit after the shared continuity contracts and provider-native switching paths are proven.

## Measurable Roadmap Definition of Done

- Each milestone passes its listed Definition of Done before the next starts.
- Packaged deterministic Pi acceptance is complete; optional credentialed semantic smoke remains separate.
- Provider-neutral continuity passes its packaged matrix before Cleaner and Architect Claude parity is claimed.
- Automatic participation follows the persisted onboarding profile and remains independently overridable per session.
- Cleaner writes stay bounded and behavior-preserving.
- Architect v1 remains read-only.
- Deterministic tools remain internal implementation details.
- Deterministic evidence precedes model reasoning wherever facts are computable.
- Token savings never justify replacing necessary semantic judgment with weak heuristics.
- No speculative provider or capability platform appears in product surfaces.
- Installer lifecycle claims include failure-injection and packaged evidence.
- Launcher work preserves the OpenTUI STOP and legacy renderer.

## Remaining Decisions

The owning work units still need evidence for:

- the location, retention, freshness, and version-control policy for progress records;
- Architect's safe programmatic CodeGraph adapter, plus the minimum graph facts and confidence labels for findings;
- ecosystem-specific property-test suggestions;
- the independent signing technology and trust-root rotation policy.

These future decisions do not claim the CodeGraph adapter or ecosystem-specific guidance is implemented. They cannot change the Pi-first order, expose external subagent surfaces, bypass the selected project profile, authorize Architect mutation, or reopen the renderer migration.

## Deterministic Cleaner Collector Program

The collector program was implemented as direct, independently reviewable work units in this order:

1. Common evidence contracts plus safe JavaScript/TypeScript, Bun, Vitest, Vue, and Astro detection.
2. Fresh test-result collection from Bun JUnit and Vitest JSON/JUnit.
3. Common LCOV coverage normalization for Bun and Vitest.
4. Function-level JavaScript/TypeScript complexity with Vue script-block and Astro frontmatter/script extraction.
5. CRAP derived only from exactly bound fresh complexity and coverage.
6. Structural duplication spike and adapter, evaluating jscpd without adding a dependency until evidence supports it.
7. Compact Cleaner Audit integration.
8. Packaged Pi acceptance.

Initial target matrix: plain `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, and `.tsx`; Vue `.vue`; Astro `.astro`; Bun test/JUnit/LCOV; and Vitest JSON/JUnit/LCOV. Units 1-8 and their packaged deterministic acceptance are complete in Pi. This acceptance does not claim live credentialed semantic smoke or Claude parity.

## Document Authority

This file is the single canonical roadmap for product direction, sequencing, status, and target architecture. Historical roadmaps, proposals, spikes, and archived SDD artifacts preserve evidence of earlier work but do not override it.
