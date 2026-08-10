# Tasks — surface-wiring

status: ready
blocked_by: none

## // 001. Shared surface runner contract

- [x] 1.1 Define the versioned cleaner request/result protocol and shared runner entrypoint in `ein-pi/agent/surfaces/` (new runner source file named by the implementer within this mapped boundary), including capability/status/reason validation, bounded JSON handling, and explicit adapter interfaces for authority reads, mutation writing, and workbench invocation.
  - skills: `architecture`, `ein-discipline`
  - why: A single contract is required for Pi/Claude parity and keeps transport validation separate from domain ownership.
  - learn: Versioned seams make malformed or future requests fail closed instead of widening authority implicitly.
  - architecture: The surface runner owns protocol parsing, adapter assembly, dispatch, and bounded diagnostics; existing cleaner/workbench engines remain behavior owners.
  - avoid: Do not duplicate cleaner policy in launchers or introduce a second evidence store/cache.
  - strict-TDD: RED—add focused protocol tests for supported capabilities, unknown keys, malformed/oversized input, and bounded diagnostics; GREEN—implement the minimal contract and runner entrypoint; TRIANGULATE—test equivalent inputs and fail-closed outcomes across capability branches; REFACTOR—keep transport types and dispatch helpers small without changing engine semantics.
  - verify: `bun test tests/surface-wiring.test.ts --test-name-pattern 'protocol|request|diagnostic'`

## // 002. Authority-owned cleaner read adapters

- [x] 2.1 Implement the runner's fresh authority read adapter assembly against `ein-pi/agent/lib/project-state.ts` and `ein-pi/agent/lib/reviewed-area-ledger.ts`, passing normalized evidence/declarations and preserving the audit boundary.
  - skills: `architecture`, `ein-discipline`
  - why: The surface must recompute B/G/H/I state at invocation time and expose no autonomous selection, verification execution, retry, or rollback.
  - learn: A carried finding is intent only; fresh authority state authorizes admission.
  - architecture: I/O and dependency construction stay at the runner edge; B/G/H/I/router semantics remain in their existing modules.
  - avoid: Do not alter the protected engine files or reinterpret ledger references as verified evidence.
  - strict-TDD: RED—add adapter tests for unavailable evidence, stale findings, and valid admission; GREEN—wire the existing pure engines with injected read adapters; TRIANGULATE—exercise blocked, uncertain, verification-required, and successful audit normalization; REFACTOR—remove duplicated read assembly while preserving ownership boundaries.
  - verify: `bun test tests/surface-wiring.test.ts --test-name-pattern 'audit|authority'`

## // 003. Authority-owned cleaner mutation adapters

- [x] 3.1 Complete the runner's bounded cleaner adapter assembly against `ein-pi/agent/lib/reviewed-area-ledger-store.ts`, `ein-pi/agent/lib/cleaner-read-only-audit.ts`, and `ein-pi/agent/lib/cleaner-bounded-mutations.ts`, passing normalized evidence/declarations and preserving mutation and completion boundaries.
  - skills: `architecture`, `ein-discipline`
  - why: The surface must authorize only bounded writes after fresh authority reads and keep mutation separate from completion.
  - learn: Exact preconditions authorize one bounded write; completion is a distinct authority decision.
  - architecture: I/O and dependency construction stay at the runner edge; ledger, audit, mutation, and completion semantics remain in their existing modules.
  - avoid: Do not alter the protected engine files or reinterpret ledger references as verified evidence.
  - strict-TDD: RED—add adapter tests for one-write mutation and separate completion; GREEN—wire the existing pure engines with injected mutation adapters; TRIANGULATE—exercise blocked, uncertain, verification-required, and successful mutation/completion normalization; REFACTOR—remove duplicated mutation assembly while preserving ownership boundaries.
  - verify: `bun test tests/surface-wiring.test.ts --test-name-pattern 'mutate|complete'`

## // 004. Workbench seam

- [x] 4.1 Extract only the production dependency assembly needed to share `runWorkbenchEntrypoint` between `ein-pi/workbench.ts` and the deployable surface runner, retaining the existing public launcher entrypoint and behavior.
  - skills: `architecture`, `ein-discipline`
  - why: Workbench activation must reach one implementation while preserving TTY gating, cancellation, diagnostics, and exit classification.
  - learn: Compatibility entrypoints can preserve callers while moving only assembly across a deployment seam.
  - architecture: `ein-pi/workbench.ts` remains the public compatibility entrypoint; the shared surface owns invocation wiring, not workbench policy.
  - avoid: Do not duplicate workbench dependencies or move installer/updater behavior into the runner.
  - strict-TDD: RED—extend `tests/minimal-workbench-launcher.test.ts` to prove both entrypoints share assembly and preserve non-TTY/exit behavior; GREEN—extract the minimal assembly; TRIANGULATE—cover help, cancellation, candidate bound, runtime selection, and operational/usage exits; REFACTOR—keep the compatibility wrapper thin.
  - verify: `bun test tests/minimal-workbench-launcher.test.ts`

## // 005. Pi launcher adapter

- [x] 5.1 Add the reserved `cleaner` and `workbench` dispatch to `pi-ein/pi-ein.fish`, locating the shipped runner without exposing repository-relative paths and preserving passthrough for all unrelated first arguments.
  - skills: `architecture`, `ein-discipline`
  - why: Clean Pi sessions need explicit user-facing activation for all four documented commands.
  - learn: Namespace matching at the launcher edge prevents collisions while leaving vanilla runtime behavior untouched.
  - architecture: The fish wrapper only dispatches reserved namespaces; runner validation and capability policy stay shared.
  - avoid: Do not add cleaner logic to the fish script or change vanilla `pi`/existing passthrough behavior.
  - strict-TDD: RED—add fixture tests for all Pi commands, unrelated passthrough, malformed requests, and missing runner; GREEN—implement exact namespace dispatch; TRIANGULATE—verify installed-home execution and bounded activation failures; REFACTOR—minimize shell branching and keep paths isolated.
  - verify: `bun test tests/surface-wiring.test.ts --test-name-pattern 'Pi|pi-ein|passthrough'`

## // 006. Claude adapter and packaging seams

- [x] 6.1 Extend `cc-ein/sync.ts` to compile/deploy the same runner closure into the isolated Claude home and fail required sync when compilation or payload installation fails.
  - skills: `architecture`, `ein-discipline`
  - why: Claude must reach the identical protocol and engines from a clean home despite its different packaging transport.
  - learn: Packaging differences are acceptable only when they originate from one source and are checked as required inputs.
  - architecture: Sync/installer payload owns shipping and parity checks; it does not decide capability outcomes.
  - avoid: Do not add installer TUI behavior, alternate Claude business logic, or silently fall back to another implementation.
  - strict-TDD: RED—add sync tests for successful payload, missing/stale runner, and compile failure; GREEN—package the shared source/compiled artifact; TRIANGULATE—verify protocol version and import closure parity; REFACTOR—reuse existing sync/parity machinery rather than creating a parallel deployer.
  - verify: `bun test tests/surface-wiring.test.ts --test-name-pattern 'Claude|sync|payload|compile'` and `cd installer && bun run typecheck`

- [x] 6.2 Add reserved `cleaner` and `workbench` dispatch to `cc-ein/cc-ein.fish`, preserving unrelated runtime passthrough and isolated `CLAUDE_CONFIG_DIR` behavior.
  - skills: `architecture`, `ein-discipline`
  - why: The Claude launcher must expose the same commands while retaining its adapter-only role.
  - learn: Runtime parity is observable behavior parity, not identical transport implementation.
  - architecture: The wrapper selects the deployed runner; the runner remains the sole shared capability implementation.
  - avoid: Do not invoke source imports from a checkout or leak internal installed paths in user output.
  - strict-TDD: RED—add clean-home fixture tests for command dispatch, passthrough, and absent runner; GREEN—implement the minimal fish dispatch; TRIANGULATE—compare normalized Pi/Claude results excluding declared identity; REFACTOR—keep environment setup and dispatch explicit.
  - verify: `bun test tests/surface-wiring.test.ts --test-name-pattern 'Claude|cc-ein|parity|passthrough'`

## // 007. Installed seam and isolation coverage

- [x] 7.1 Add `tests/surface-wiring.test.ts` plus isolated-home fixtures using the mapped launcher/PTY patterns to exercise audit, mutate, complete, and workbench through real Pi and Claude adapters, including safety failures, missing deployment, parity, and vanilla-home isolation.
  - skills: `ein-discipline`, `architecture`
  - why: Direct engine tests cannot prove launcher registration, packaging, clean-session reachability, or isolation.
  - learn: Seam tests must execute the deployed artifact and real adapter path, not merely import the engine.
  - architecture: Tests own temporary homes and stub executables; production engines and vanilla homes remain untouched.
  - avoid: Do not depend on developer homes, checkout paths, or replace seam tests with direct imports.
  - strict-TDD: RED—write failing real-launcher scenarios; GREEN—connect fixtures to both deployed surfaces; TRIANGULATE—cover malformed/stale/symlink/oversized/writer-failure and workbench TTY/exit cases; REFACTOR—deduplicate fixture setup without weakening isolation assertions.
  - verify: `bun test tests/surface-wiring.test.ts` and `bun test`
