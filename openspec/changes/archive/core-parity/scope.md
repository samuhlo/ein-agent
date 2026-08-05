# Scope — core-parity

## SCOPE PACKET

```yaml
scope: Implement the roadmap's core-parity slice so Claude Code is generated from the canonical Ein core, synchronization fails loudly on unknown tools, untranslated runtime tokens, and agent-model routing drift, Claude exposes deterministic OpenSpec delta synchronization, and a core-to-Claude parity test protects the generated surfaces. Track EIN.md and the core-parity state in docs/roadmap-beta.md; do not implement installer-beta or any unrelated runtime work.
budget_allocated:
  max_tokens: 18000
  max_reads: 30
  max_runtime_ms: 900000
```

## Execution context

- **Execution mode:** interactive. The parent owns the human gate between planning and apply; this scope phase performs no implementation or delivery action.
- **Strict TDD:** enabled (`openspec/config.yaml` has `strict_tdd: true`). Apply must use RED → GREEN → TRIANGULATE → REFACTOR and record evidence in `apply-progress.md`; this phase does not run tests.
- **Canonical behavior domain:** `sdd-lifecycle` (`openspec/specs/sdd-lifecycle/spec.md`, 13,428 bytes, SHA-256 `7fca9adb82460b90024474ea4eb105a99a4bcc0fe78ff1c7c5f181af508e73e6`). The generated delta file `openspec/changes/core-parity/specs/sdd-lifecycle/spec.md` is the sole behavior declaration for this change and contains six validated ADDED operations.
- **Configuration:** existing `openspec/config.yaml` is preserved. It records the Node.js/TypeScript ESM stack, Bun package manager, `strict_tdd: true`, and the configured installer typecheck command; its test-runner fields are blank and are stale relative to the repository evidence below.
- **Observed testing convention:** root `bunfig.toml` preloads `tests/preload-env.ts`; repository tests use Bun's built-in `bun:test` runner and are discovered by `bun test`. This scope records the runner but does not execute it.
- **Existing typecheck context:** `cd installer && bun run typecheck` is the configured installer check. Installer behavior and sources are outside this change.

## Objective

Make the canonical Ein core and the Claude Code adapter behave as one maintained surface without pretending that Pi and Claude are identical runtimes. The generated Claude coordinator document must come from a shared source plus an explicit Claude adaptation boundary; sync must reject drift instead of silently copying unsupported names; Claude's SDD CLI must expose the same deterministic OpenSpec synchronization already available in the Pi core; and tests must detect parity regressions.

The change also tracks the repository context introduced by the roadmap: add the currently untracked `EIN.md` to the maintained project board and update `docs/roadmap-beta.md` only to record the core-parity slice's state/evidence when the later phases provide it.

## In scope

### 1. Generated Claude coordinator surface

- Establish the canonical coordinator source and the explicit Claude-only adaptation boundary needed for generation.
- Make `cc-ein/CLAUDE.md` a generated adapter output rather than an independently authoritative full brain.
- Preserve legitimate runtime differences (Claude's native tools, `cc-ein-sdd`, and Claude-specific delegation/configuration) as explicit adaptation data instead of merging Pi and Claude into one runtime.
- Keep the existing `<!-- ein:harness-discipline:start/end -->` boundary available to generation so the prior hardening content is not silently discarded.
- Ensure synchronization is deterministic and repeatable: the same canonical inputs produce the same generated Claude content.

### 2. Fail-closed synchronization validation

- Replace best-effort unknown tool passthrough in `cc-ein/sync.ts` with an explicit mapping/allowance check. An unknown agent tool must identify the source agent and fail synchronization rather than reaching Claude as a literal unsupported tool.
- Replace silent gaps in the hardcoded `AGENT_MODELS` table with validation against the canonical agent inventory. A new canonical agent without routing, or a stale routing entry for an absent agent, must fail loudly with actionable identity information.
- Replace the manually maintained `CC_NOTE` escape hatch for Pi-only concepts with an explicit adaptation/translation registry or equivalent deterministic validation. Any untranslated `ein_*` tool token or Pi-only runtime concept in generated content must fail synchronization rather than being silently inert.
- Preserve successful translation for the currently supported Pi tools, Claude MCP tool mappings, SDD CLI tokens, and the existing agent model/effort choices.
- Preserve atomicity/idempotence expectations of the sync: validation failures must not claim a successful parity result or leave a silently accepted partial generated surface.

### 3. Claude-side OpenSpec synchronization

- Add `sync` (or the equivalent explicit command name agreed in design) to `cc-ein-sdd`.
- The command must delegate to the shared deterministic filesystem synchronizer (`synchronizeOpenSpecFilesystem`) for a named existing change, not to a bridge script or a second synchronization algorithm.
- Surface synchronized, conflict, malformed, and operational failure outcomes through deterministic CLI output and exit status suitable for Claude agents and the close gate.
- Keep `status`, `check`, and `close` behavior unchanged except for the command help/dispatch surface required to expose sync.
- Do not make close or status implicitly synchronize specs; synchronization remains an explicit operation and canonical close evidence remains governed by the existing lifecycle rules.

### 4. Core-to-Claude parity protection

- Add focused Bun tests, following the structure of `tests/i18n-parity.test.ts`, that inspect the canonical core and generated/translated Claude surfaces.
- Cover generated coordinator provenance and adapter-boundary preservation.
- Cover supported tool translation, unknown-tool rejection, untranslated runtime-token rejection, and agent-model inventory/routing drift.
- Cover deterministic output/idempotence and the Claude CLI sync command's success, conflict, and failure paths without invoking a live Claude account or external API.
- Keep tests deterministic and fixture-based; do not add network, installer, Docker, or release tests to this slice.

### 5. Tracking files

- Add the existing repository-root `EIN.md` to the tracked project context without replacing its curated content or allowing generated refreshes to erase it.
- Update `docs/roadmap-beta.md` only for the `core-parity` status/evidence and its known boundary; do not pull `installer-beta` work into this change and do not mark implementation/verification complete before those phases actually provide evidence.

## Acceptance criteria

- [ ] `cc-ein/CLAUDE.md` is generated from a canonical coordinator source plus an explicit Claude adaptation boundary; a source change is reflected by the next deterministic sync.
- [ ] An unmapped canonical agent tool causes synchronization to fail with the agent/tool identified; it is never silently copied into generated Claude frontmatter.
- [ ] An untranslated Pi-only `ein_*` token or runtime concept causes synchronization to fail with its source identified; no best-effort literal survives as a successful result.
- [ ] A canonical agent inventory/routing mismatch (missing or stale model routing) fails synchronization instead of silently using an incomplete hardcoded table.
- [ ] The sync remains deterministic and idempotent for valid inputs, and its failure path does not report parity success.
- [ ] `cc-ein-sdd sync <change>` uses the shared OpenSpec filesystem synchronizer and distinguishes synchronized, conflict, malformed, and operational failure outcomes through its documented output/exit contract.
- [ ] `cc-ein-sdd status`, `check`, and `close` retain their current lifecycle behavior; no implicit sync is introduced.
- [ ] Focused parity tests cover source generation, adaptation/mapping validation, routing drift, deterministic output, and CLI sync outcomes using Bun's `bun:test` runner.
- [ ] `EIN.md` is tracked and `docs/roadmap-beta.md` records only the bounded core-parity tracking update.
- [ ] No installer, release, Docker E2E, unrelated CI, or runtime-unification change is included.

## Planned TDD and verification handoff

Scope does not run tests, build, typecheck, or implementation. The apply phase must:

1. Write focused failing tests first for each acceptance seam (RED), including malformed and drift fixtures.
2. Implement the smallest source/adapter/CLI changes needed to turn those tests green (GREEN).
3. Run the focused tests plus the root Bun suite and check that generated outputs are stable across repeated syncs (TRIANGULATE).
4. Refactor only after evidence is green, retaining the tests as the parity contract (REFACTOR).

The verify phase should use the repository runner `bun test` (with the root preload), inspect the generated-output diff and CLI exit/output contract, and run `cd installer && bun run typecheck` only as a regression check if the final implementation changes shared payload/type surfaces. No check is claimed as run by this scope phase.

## Current seams and likely implementation surface

- `cc-ein/sync.ts`: current tool translation, body token replacement, `CC_NOTE`, hardcoded `AGENT_MODELS`, and agent generation are the main validation/generation seams.
- `cc-ein/CLAUDE.md`: current hand-maintained Claude coordinator document; it becomes generated output within the agreed source/adaptation design.
- `cc-ein/sdd-cli/cli.ts`: current `status|check|close|guard` dispatch; it already imports the shared SDD/OpenSpec core and is the bounded seam for explicit sync.
- `ein-pi/agent/lib/openspec-spec-sync-fs.ts`: existing deterministic filesystem synchronizer; reuse it rather than creating a parallel Claude implementation.
- `ein-pi/core/agents/`: canonical phase-agent inventory used by the existing sync; routing validation must derive from this inventory.
- `ein-pi/core/AGENTS.md` and the coordinator-source design selected in map/design: canonical source/adaptation inputs must be decided without making Pi and Claude identical.
- `tests/i18n-parity.test.ts`: prior art for deterministic source-parity assertions.
- `EIN.md`, `docs/roadmap-beta.md`: tracking-only outputs for this slice.

## Non-goals and hard boundaries

- **No installer-beta:** no `installer/` source, flags, version, release, checksum, secret, lockfile, or installer E2E changes.
- **No runtime fusion:** do not merge Pi and Claude into one brain with no adaptation layer; legitimate differences remain explicit.
- **No unrelated core refactor:** do not rewrite the SDD router, guardrails, delivery gate, Linear integration, MCP behavior, or skill catalog except where the bounded generation/translation contract requires a direct seam change.
- **No implicit synchronization:** status, close, and guard must not begin writing canonical specs as a side effect.
- **No hand-written canonical delta:** this child writes no `openspec/changes/core-parity/specs/*/spec.md`; the generated delta file `openspec/changes/core-parity/specs/sdd-lifecycle/spec.md` is already present and is the sole behavior declaration for this change.
- **No implementation in scope:** this artifact is the scope phase only; no source, tests, generated files, apply progress, verify report, or close summary is produced here.
- **No broad documentation rewrite:** only the explicit tracking updates to `EIN.md` and `docs/roadmap-beta.md` belong here.
- **No delivery:** no commit, push, release, or PR is part of this phase.

## Risks and map/design questions

- **Canonical coordinator split:** map/design must choose the smallest shared-source shape that preserves Pi notes and Claude adaptation without duplicating the full brain.
- **Validation false positives:** runtime-specific prose may include ordinary `ein_*` text; the registry must distinguish supported adaptation tokens from genuinely untranslated tool/runtime references.
- **Routing policy drift:** model/effort defaults may be represented in frontmatter or a separate registry; whichever source is selected must make missing and stale entries observable.
- **Generated-file ownership:** apply must avoid hand-editing generated `cc-ein/CLAUDE.md`; generated markers and refresh behavior must be tested.
- **CLI outcome contract:** map/design must pin exact exit codes and output for conflict versus malformed/operational errors before apply.
- **Tracking ambiguity:** `EIN.md` is currently untracked and its curated placeholders remain; tracking it must not be mistaken for completing its content.
- **Delta declaration:** the generated delta file `openspec/changes/core-parity/specs/sdd-lifecycle/spec.md` is the sole behavior declaration for this change; no parent serialization gate remains for map/design.

## Canonical delta operations

The generated delta file `openspec/changes/core-parity/specs/sdd-lifecycle/spec.md` is the sole declaration for this change. It contains the following single-domain operation set for `sdd-lifecycle`; these are behavior deltas only, and tracking-document changes are not OpenSpec scenarios.

```yaml
domain: sdd-lifecycle
operations:
  - kind: ADDED
    scenario:
      id: core-coordinator-source-generates-claude-brain
      title: Claude coordinator brain is generated from canonical core
      requirement: The system MUST generate the Claude coordinator brain from a canonical coordinator source plus an explicit Claude adaptation block during synchronization, and MUST NOT treat a separately hand-maintained full cc-ein/CLAUDE.md as authoritative.
      given: the canonical coordinator source and Claude adaptation block are present and a synchronization is requested
      when: the synchronization compiles the coordinator surface for Claude Code
      then: the generated cc-ein/CLAUDE.md reflects the canonical source and adaptation boundary, and a source change is observable in the next generated output without manual copying
  - kind: ADDED
    scenario:
      id: core-sync-rejects-unknown-agent-tools
      title: Unknown agent tools fail synchronization
      requirement: The system MUST fail core synchronization when a canonical agent declares a tool without an explicit Claude mapping or approved runtime mapping, instead of copying the unknown tool name into generated frontmatter.
      given: a canonical agent includes an unmapped tool name
      when: synchronization translates agent frontmatter
      then: synchronization exits unsuccessfully with the agent and tool identified, and no successful generated artifact claims parity
  - kind: ADDED
    scenario:
      id: core-sync-rejects-untranslated-runtime-tokens
      title: Untranslated runtime tokens fail synchronization
      requirement: The system MUST fail core synchronization when canonical agent or coordinator content contains a Pi-only ein_* tool token or runtime concept without an explicit Claude adaptation rule, instead of leaving the token literal or silently treating it as inert.
      given: canonical agent or coordinator content contains an untranslated Pi-only token or runtime concept
      when: synchronization translates or generates the Claude surface
      then: synchronization exits unsuccessfully with the source token and location identified, and the generated surface is not accepted as synchronized
  - kind: ADDED
    scenario:
      id: core-sync-rejects-agent-routing-drift
      title: Agent-model routing drift fails synchronization
      requirement: The system MUST fail core synchronization when the canonical agent inventory and Claude model-routing declarations differ, including a canonical agent without routing or a stale routing entry, instead of silently using an incomplete hardcoded table.
      given: the canonical agent inventory has a missing or stale Claude model-routing declaration
      when: synchronization builds Claude agent frontmatter
      then: synchronization exits unsuccessfully with the routing mismatch identified and does not claim a complete Claude agent surface
  - kind: ADDED
    scenario:
      id: core-parity-check-covers-generated-surfaces
      title: Core-to-Claude parity is checked deterministically
      requirement: The system MUST provide a deterministic core-to-Claude parity check that detects drift in the canonical coordinator, generated coordinator, tool mappings, translated runtime tokens, and agent-model routing.
      given: canonical core inputs, Claude adaptation inputs, and generated Claude surfaces are available
      when: the parity check evaluates the supported core surface
      then: matching inputs pass, while source, mapping, translation, or routing drift reports a failure naming the mismatched surface
  - kind: ADDED
    scenario:
      id: claude-sdd-syncs-openspec-delta
      title: Claude SDD CLI synchronizes canonical OpenSpec deltas
      requirement: The system MUST expose a sync command in the Claude SDD CLI that deterministically synchronizes a named existing change through the shared OpenSpec filesystem synchronizer and returns a distinct success, conflict, or failure result without a bridge script.
      given: an existing OpenSpec change has a structured delta for one or more canonical domains
      when: Claude invokes cc-ein-sdd sync for that change
      then: the shared synchronizer updates canonical specs and its report on success, reports a conflict without overwriting conflicting canonical bytes, or returns a failure status for malformed or operational errors
```

## Scope phase boundary

This artifact defines the bounded core-parity slice and its SDD/testing context. It writes no implementation, tests, generated coordinator, canonical delta spec, apply-progress artifact, verify report, or close summary. The generated delta file is the sole behavior declaration for this scope; no parent serialization gate blocks map/design.
