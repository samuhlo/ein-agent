# Design — thin-parent-research-routing

## A. Proposal

### Intent

Make the parent route broad pre-scope research to read-only `ein-scout` using deterministic thresholds and a bounded research packet, then reuse accepted cited evidence instead of rediscovering it. Keep `sdd-map` scoped-only and preserve the existing v0.24.4 scout handoff and seven-phase SDD lifecycle.

### Scope

**In scope**

- Tighten the existing parent routing policy for the four-file and two-source-class triggers.
- Cap parent work at two routing reads before delegation and two material spot-checks after accepting a report.
- Define one bounded `RESEARCH PACKET` contract and up to three independent pre-scope scouts.
- Forward accepted findings, references, and uncertainties into parent reasoning without automatic rediscovery.
- Add focused static contract coverage to the existing orchestrator suites.
- Minimally teach `ein-scout` to obey packet roots and budgets while returning only its existing report schema.

**Out of scope**

- Changes to `ein-scout-report/v1`, report validation, direct structured-output handoff, empty-extension behavior, smoke infrastructure, launch normalization, or retry behavior.
- Engram/Context7 adapters or claims that those sources were retrieved.
- SDD phase order, router, reconciliation, state, lifecycle artifacts, installer release metadata, or application features.
- A new routing abstraction or runtime packet parser; this is a prompt-contract change with focused contract tests.

### Canonical spec context

| Path | SHA-256 | UTF-8 bytes |
|---|---|---:|
| `openspec/specs/scout-routing/spec.md` | `092046def4134777dd7f1ade247c37d2a8ea11b3498f5b4453b11d49fafa9a9f` | 2458 |

Selection total: 1 file and 2458 bytes, within the 3-file / 32 KiB limit.

### Affected areas

- `ein-pi/agent/assets/orchestrator.md` — authoritative routing thresholds, packet ownership, evidence reuse, assessment boundary, and scout fan-out.
- `ein-pi/core/agents/ein-scout.md` — minimal packet-consumption wording; no schema change.
- `tests/orchestrator-context-diet.test.ts` — routing, no-repeat, spot-check, fan-out, and no-state prompt contracts.
- `tests/orchestrator-scope-gate.test.ts` — packet bounds and scoped-only `sdd-map` contract.

The handoff/runtime owners (`ein-pi/agent/lib/scout-contract.ts`, `ein-pi/agent/extensions/ein-ai.ts`) and their smoke/contract tests are regression boundaries, not change surfaces.

### Risks

- Ambiguous packet wording could make a scout emit `severity`, `alternatives`, or `candidate_slices` as unsupported top-level fields, which the closed validator would correctly reject.
- Static prompt tests prove the written routing contract, not model compliance at runtime.
- “Routing read,” “source class,” and “material spot-check” could be interpreted inconsistently unless defined beside the thresholds.
- A packet runtime ceiling of 300000 ms could be mistaken for the effective runtime, although v0.24.4 normalization remains the stricter 120000 ms limit.

### Rollback

Revert the orchestrator/scout prompt-contract commit and its focused test changes together. No data migration, schema rollback, lifecycle cleanup, release rollback, or OpenSpec-state repair is required because the change introduces no runtime state and does not modify the scout handoff.

### Success criteria

- Four-or-more-file understanding and research spanning two source classes route to `ein-scout`.
- The parent performs at most two routing reads before delegation and at most two material spot-checks after accepting a valid report.
- Each scout receives a bounded packet; pre-scope fan-out is one to three scouts with distinct angles.
- Accepted cited findings and explicit uncertainties are reused without automatic parent rediscovery.
- Read-only assessment creates no SDD/OpenSpec change, and `sdd-map` remains available only after bounded scope exists.
- The scout returns only valid `ein-scout-report/v1` fields; parent synthesis owns severity, alternatives, and optional candidate slices.
- Existing handoff, validation, empty-extension, smoke, SDD lifecycle, and release behavior remain unchanged.

## B. Spec

### Requirement 1 — deterministic delegation thresholds

The system **MUST** route pre-scope understanding to read-only `ein-scout` when the work requires evidence from four or more distinct files. The system **MUST** also route to `ein-scout` when research combines at least two source classes among repository, project memory, and external documentation. Source classes describe requested evidence, not proven adapter availability.

**Scenario**

- **Given** a pre-scope request needs a roadmap file, memory evidence, external documentation, and possible slicing input,
- **When** the parent classifies the research route,
- **Then** it delegates the research to `ein-scout` rather than opening a broad parent exploration or creating SDD state.

### Requirement 2 — bounded parent reads

Before dispatching research that meets a delegation threshold, the parent **MUST** perform no more than two routing reads. A routing read is a bounded retrieval used to identify the concrete question, allowed roots, or source classes; it is not permission to investigate the answer.

**Scenario**

- **Given** the parent can identify that a request needs evidence from at least four files,
- **When** it prepares delegation,
- **Then** it stops after at most two routing reads and sends a bounded research packet.

### Requirement 3 — bounded research packet

Each pre-scope scout request **MUST** include a `RESEARCH PACKET` with a concrete question, allowed repository roots, an optional specific memory query, optional bounded documentation topics, and finite budgets. The packet **MUST** set ceilings of `max_reads: 20`, `max_output_bytes: 12288`, and `max_runtime_ms: 300000`; the existing launch normalizer’s stricter `maxRuntimeMs: 120000` **MUST** remain effective and unchanged.

The packet **MUST** distinguish two ownership sections:

- **Scout evidence:** existing schema-valid findings, references, and explicit uncertainties only.
- **Parent synthesis intent:** severity classification, comparison of a bounded set of alternatives, and optional candidate slices.

The system **MUST NOT** represent parent synthesis intent as new scout report fields. Packet roots and budgets **MUST** narrow a scout run and **MUST NOT** expand its existing tool, runtime, report-size, or schema limits.

**Scenario**

- **Given** the parent delegates bounded research that may later inform alternatives or slices,
- **When** it constructs the packet,
- **Then** the scout is asked only for supported cited evidence and uncertainties, while severity, bounded alternatives, and optional candidate slices are explicitly reserved for parent synthesis after validation.

### Requirement 4 — preserve the closed report contract

`ein-scout` **MUST** return exactly the existing closed `ein-scout-report/v1` shape: `version`, `summary`, `summaryReferenceIds`, `findings`, `references`, and `uncertainties`. It **MUST NOT** emit top-level `severity`, `alternatives`, or `candidate_slices` fields. Sources **MUST** be represented by existing validated references; the parent **MAY** assign severity to accepted findings during synthesis.

**Scenario**

- **Given** a packet asks for evidence useful for severity, alternatives, or candidate slices,
- **When** the scout returns its report,
- **Then** the report contains only existing schema fields and the parent derives any decision-oriented output from accepted cited evidence.

### Requirement 5 — accepted-evidence reuse and spot-checks

After accepting a locally validated cited scout report, the parent **MUST** forward its accepted findings, references, and explicit uncertainties into subsequent routing or scoping. It **MUST NOT** automatically repeat searches or reread the evidence set. The parent **MAY** perform one or two spot-checks, but each check **MUST** target a material claim whose correctness could change the route, scope, or stated risk.

**Scenario**

- **Given** a valid scout report contains cited findings and a material uncertainty,
- **When** the parent continues toward a response or bounded scope,
- **Then** it reuses that evidence, performs no broad rediscovery, and performs at most two material spot-checks.

### Requirement 6 — bounded independent pre-scope fan-out

When parallel pre-scope research is useful, the parent **MUST** use no more than three foreground `ein-scout` calls with fresh context and distinct, non-overlapping research angles. It **MUST NOT** use `sdd-map` or another SDD phase agent for speculative pre-scope exploration.

**Scenario**

- **Given** repository, memory, and documentation questions can be investigated independently,
- **When** the parent chooses fan-out,
- **Then** it launches one to three distinct scouts and does not launch speculative `sdd-map` branches.

### Requirement 7 — scoped-only map and stateless assessment

A read-only assessment **MUST NOT** create an OpenSpec change, phase artifact, or SDD lifecycle state. `sdd-map` **MUST** remain reserved for an existing change with bounded scope produced through the normal scope gate. The SDD phase order **MUST** remain exactly `scope → map → design → tasks → apply → verify → close`.

**Scenario**

- **Given** a user asks for a read-only assessment before committing to a change,
- **When** the parent researches and synthesizes the answer,
- **Then** it uses the scout lane without creating SDD state; only a later committed, bounded change may proceed through `sdd-scope` and then `sdd-map`.

### Requirement 8 — compatibility preservation

The change **MUST NOT** alter v0.24.4 direct structured-output handoff, fail-closed report validation, extension-empty compatibility, opt-in live smoke, SDD routing/reconciliation, release metadata, or release workflow behavior. Existing focused regression coverage **SHOULD** remain green without being rewritten to accept new report fields.

**Scenario**

- **Given** the new prompt routing contract is installed,
- **When** existing scout handoff and lifecycle regression checks run,
- **Then** their expected schema, validation failures, launch normalization, lifecycle order, smoke contract, and release behavior remain unchanged.

## C. Decisions

### 1. Preserve the schema; move decision-shaped output to the parent

The roadmap’s output vocabulary spans two responsibilities. Cited factual findings, sources, and uncertainties fit `ein-scout-report/v1`; severity judgments, alternatives, and candidate slices do not. The smallest truthful boundary is:

- Scout owns factual claims, validated repository references, and explicit uncertainty.
- Parent owns severity classification, bounded comparison, and optional slicing after accepting the report.

“Source” is satisfied by the report’s existing `references` and finding `referenceIds`, not by a new field. Alternatives may enter a packet only as a bounded comparison question or parent synthesis intent; the scout may gather facts about named options but may not recommend one. Candidate slices are never requested as a scout report field; the parent may derive them from accepted evidence.

This interpretation keeps the strict change delta consistent without changing it: its “requested outputs” describe the end-to-end research packet outcome, while this design assigns each output to the component that can truthfully produce it. No delta revision is required.

### 2. Reuse the existing authoritative routing section

The parent policy remains in the existing Work Routing Ladder, Parent read discipline, and Parallel read-only fan-out sections. No second router, packet library, or runtime state machine is introduced. Tests continue to inspect the authoritative installed prompt.

### 3. Use prompt ceilings without weakening runtime ceilings

The roadmap packet ceilings remain `20` reads, `12288` output bytes, and `300000` ms. They are request-level maxima, not capability grants. Existing runtime normalization still enforces 120000 ms, 12 turns plus 2 grace turns, and 30 hard tool calls; the existing validator still enforces its closed schema and 16384-byte outer maximum. The stricter applicable limit always wins.

### 4. Keep assessment and SDD ownership separate

Pre-scope research belongs to `ein-scout` and parent synthesis and creates no canonical artifact. Once the user commits to a bounded change, `sdd-scope` owns `scope.md`; only then does `sdd-map` own impact mapping and `map.md`. Scout evidence is advisory and has no architecture, implementation, delivery, or lifecycle authority.

### 5. Prefer focused static contract tests

The behavior being changed is an installed prompt contract, so the two existing orchestrator suites are the smallest focused seam. Existing deterministic runtime/schema tests remain regression guards rather than being modified. This avoids inventing a runtime routing engine merely to make prompt policy executable.

### Alternatives rejected

- **Expand `ein-scout-report/v1`:** rejected because schema/handoff changes are explicitly out of scope and would reopen completed fail-closed validation and smoke work.
- **Encode unsupported fields inside claim strings:** rejected because it only disguises a schema expansion, weakens validation semantics, and implies structure the adapter does not provide.
- **Let the scout propose alternatives or slices:** rejected because the scout contract forbids recommendations, designs, implementation plans, and lifecycle actions.
- **Use `sdd-map` before scope:** rejected because it writes lifecycle state and recreates the contradiction Slice 05 removes.
- **Add runtime routing code:** rejected because the identified gap is in the authoritative prompt policy and existing static tests already guard that surface.

## D. Success Criteria

### Observable acceptance

- Prompt-contract tests recognize both delegation triggers: at least four files or at least two requested source classes.
- The authoritative parent policy states the exact limits: two pre-delegation routing reads, 20 packet reads, 12288 packet output bytes, 300000 packet runtime milliseconds subject to the unchanged 120000 runtime normalizer, two post-acceptance material spot-checks, and three independent scouts.
- The packet contract names concrete question, roots, optional specific memory query, optional bounded documentation topics, scout evidence fields, and parent synthesis ownership.
- The parent policy forbids automatic rediscovery after accepting cited evidence and requires forwarding explicit uncertainties.
- Pre-scope fan-out uses only scouts, while `sdd-map` remains behind the bounded scope gate.
- Read-only assessments explicitly create no OpenSpec or SDD state.
- Scout instructions prohibit unsupported report fields and retain evidence-only authority.
- No production changes occur in the handoff, validator, extension-empty, smoke, lifecycle, reconciliation, or release surfaces.
- Actual production changed lines remain at or below 400, with test lines reported separately before PR delivery.

### Verification commands for later phases

- `bun test tests/orchestrator-context-diet.test.ts`
- `bun test tests/orchestrator-scope-gate.test.ts`
- Regression guard: `bun test tests/readonly-scout-contract.test.ts`
- Type guard: `cd installer && bun run typecheck`

No tests or builds are run during design.
