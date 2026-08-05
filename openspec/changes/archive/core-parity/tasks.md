# Tasks — core-parity

status: ready
blocked_by: none

## // 001. Establish the canonical Claude coordinator contract

- [x] 1.1 Add the explicit Claude adaptation source at `cc-ein/CLAUDE.adapter.md`, keeping Claude-native tools, `cc-ein-sdd`, delegation/configuration, and exactly one `ein:harness-discipline` block in the adapter boundary rather than duplicating shared policy.
  - skills: `architecture`, `document-writer`
  - why: The generated coordinator needs a named, reviewable runtime boundary while `ein-pi/core/AGENTS.md` remains the shared policy source.
  - learn: A generated projection stays maintainable when shared policy and runtime-specific adaptation have separate ownership.
  - architecture: `ein-pi/core/AGENTS.md` owns shared coordinator policy; `cc-ein/CLAUDE.adapter.md` owns Claude-only content; `cc-ein/CLAUDE.md` is output only.
  - avoid: Keeping a second full hand-maintained Claude brain or making Pi and Claude textually identical.
  - verify: `bun test tests/core-parity.test.ts`
  - RED: Add fixture assertions for missing provenance/adaptation markers and lost harness-discipline content; record the failing test in `apply-progress.md`.
  - GREEN: Add the minimal adapter input and generation contract needed to satisfy those assertions.
  - TRIANGULATE: Run `bun test tests/core-parity.test.ts` and compare two generated outputs byte-for-byte.
  - REFACTOR: Remove duplicated policy or incidental formatting while retaining provenance and exactly one ordered harness block; rerun the focused test.

## // 002. Make core-to-Claude generation fail closed

- [x] 2.1 Update `cc-ein/sync.ts` to compile `cc-ein/CLAUDE.md` from `ein-pi/core/AGENTS.md` plus `cc-ein/CLAUDE.adapter.md`, with deterministic ordering, provenance, explicit adaptation markers, and validation before promotion.
  - skills: `architecture`, `ein-discipline`
  - why: Synchronization must produce reproducible Claude surfaces without treating the checked-in output as authoritative or accepting partial output.
  - learn: Validate the complete in-memory surface before replacing any generated or deployed bytes.
  - architecture: `cc-ein/sync.ts` owns compilation, translation registries, routing-set validation, and the promotion gate; canonical agent files under `ein-pi/core/agents/` remain inventory inputs.
  - avoid: Writing files first and discovering parity failures afterward, or introducing a second canonical inventory.
  - verify: `bun test tests/core-parity.test.ts tests/agent-frontmatter-json.test.ts tests/agent-tools-contract.test.ts`
  - RED: Add mutation fixtures in `tests/core-parity.test.ts` for supported mappings, unknown tools, untranslated `ein_*`/runtime markers, missing and stale routes, source drift, generated drift, and unchanged prior output on rejection; record failures.
  - GREEN: Implement exact mapping/allowance, scoped runtime registry, bidirectional routing validation, deterministic generation, and pre-promotion failure diagnostics (`PARITY_UNKNOWN_TOOL`, `PARITY_UNTRANSLATED_TOKEN`, `PARITY_ROUTING_MISSING`, `PARITY_ROUTING_STALE`).
  - TRIANGULATE: Run the focused parity and existing agent-contract tests; perform two valid syncs in temporary `CC_EIN_HOME` trees and verify identical bytes, then verify a rejected fixture leaves the prior tree unchanged.
  - REFACTOR: Consolidate registries/parsers without broad substring heuristics or wildcard exemptions; rerun focused tests and inspect generated diff.

- [x] 2.2 Keep the generated checked-in coordinator at `cc-ein/CLAUDE.md` synchronized with the canonical source and adapter, without hand-editing generated content.
  - skills: `ein-discipline`, `document-writer`
  - why: The repository needs a reviewable generated artifact whose provenance and adaptation boundary are continuously parity-checked.
  - learn: Generated files should be refreshed by their compiler and protected by a byte-level parity assertion.
  - architecture: `cc-ein/CLAUDE.md` is a generated projection; changes belong in `ein-pi/core/AGENTS.md`, `cc-ein/CLAUDE.adapter.md`, or compiler rules.
  - avoid: Treating manual edits to the output as a source of truth.
  - verify: `bun test tests/core-parity.test.ts`
  - RED: Add an assertion that compiled bytes equal checked-in `cc-ein/CLAUDE.md` and that source mutation changes output deterministically.
  - GREEN: Refresh the generated artifact through the implemented compiler path.
  - TRIANGULATE: Run the parity test twice and inspect `git diff -- cc-ein/CLAUDE.md` for only expected generated changes.
  - REFACTOR: Normalize final newline/line endings and marker placement without changing semantics; rerun the parity test.

## // 003. Expose explicit Claude OpenSpec synchronization

- [x] 3.1 Add `sync <change>` dispatch and the exact JSON/exit contract to `cc-ein/sdd-cli/cli.ts`, calling `synchronizeOpenSpecFilesystem` from `ein-pi/agent/lib/openspec-spec-sync-fs.ts` directly and leaving `status`, `check`, `close`, and `guard` non-mutating.
  - skills: `architecture`, `ein-discipline`
  - why: Claude needs the same deterministic OpenSpec delta synchronization without a bridge script or parallel algorithm.
  - learn: Keep a CLI adapter thin: classify arguments and outcomes while the shared filesystem synchronizer owns planning, writes, conflicts, and rollback.
  - architecture: `cc-ein/sdd-cli/cli.ts` owns command/output/exit adaptation; `ein-pi/agent/lib/openspec-spec-sync-fs.ts` remains the sole filesystem synchronization engine.
  - avoid: Adding implicit sync to lifecycle commands or duplicating OpenSpec synchronization logic in Claude.
  - verify: `bun test tests/core-parity.test.ts tests/openspec-specs.test.ts tests/sdd-close.test.ts tests/harness-discipline.test.ts` and `bun build --compile cc-ein/sdd-cli/cli.ts --outfile /tmp/cc-ein-sdd`
  - RED: Add fixture-driven CLI tests for synchronized, idempotent, conflict, malformed/not-found/unsafe, operational failure, wrong arity, and no-implicit-sync outcomes; record exact stdout/stderr/exit failures.
  - GREEN: Implement the explicit dispatch, stable JSON key order, normalized repository-relative fields, and exits 0/2/3/4/64 while delegating all filesystem behavior.
  - TRIANGULATE: Run focused CLI and existing OpenSpec/lifecycle tests, compile the CLI, and execute fixture invocations to confirm conflict preserves canonical bytes and success is idempotent.
  - REFACTOR: Isolate output classification/normalization from dispatch without changing the contract; rerun focused tests and compile check.

## // 004. Add deterministic parity regression coverage

- [x] 4.1 Complete fixture-based parity coverage in `tests/core-parity.test.ts` for coordinator provenance, adapter preservation, tool translation/rejection, runtime-token validation, routing drift, deterministic output, generated drift, CLI outcomes, and lifecycle non-synchronization.
  - skills: `ein-discipline`, `cognitive-doc-design`
  - why: The six behavior scenarios need a durable Bun-native regression contract without network, installer, Docker, or live Claude dependencies.
  - learn: Mutation fixtures prove fail-closed behavior more reliably than only testing the happy path.
  - architecture: Tests inspect canonical inputs, adaptation inputs, generated surfaces, and CLI seams through deterministic temporary fixtures; they do not become another implementation.
  - avoid: Adding broad release/installer tests or relying on external Claude accounts and APIs.
  - verify: `bun test tests/core-parity.test.ts && bun test`
  - RED: Write each missing assertion first and capture its named failure in `apply-progress.md`.
  - GREEN: Keep the suite green as production groups implement each seam.
  - TRIANGULATE: Run the focused suite, relevant regression files, and root `bun test`; compare repeated generation and CLI JSON output.
  - REFACTOR: Deduplicate fixture helpers only after all behavior is green, preserving source/agent/tool identity in diagnostics.

## // 005. Track the bounded work unit

- [x] 5.1 Preserve the curated content of `EIN.md` and record only truthful core-parity state/evidence in `docs/roadmap-beta.md`, leaving installer-beta and unrelated roadmap content untouched.
  - skills: `work-unit-commits`, `document-writer`, `cognitive-doc-design`
  - why: Repository tracking must reflect this slice without implying implementation or verification that later phases have not evidenced.
  - learn: Tracking documentation is a separate work unit and must not be confused with a behavioral scenario.
  - architecture: `EIN.md` remains project context with its curated/AUTO boundaries; `docs/roadmap-beta.md` records bounded core-parity evidence only.
  - avoid: Filling placeholders, rewriting the roadmap broadly, or marking completion before apply/verify evidence exists.
  - verify: `git diff --check -- EIN.md docs/roadmap-beta.md` and manual confirmation that no `installer/` paths changed.
