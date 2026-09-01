# Design — install-journal-execution-boundary

status: complete
change: install-journal-execution-boundary
phase: design

## A. Proposal

### Intent

Convertir el diario en una cadena legible donde las decisiones puras puedan probarse sin disco y los efectos puedan seguirse de arriba abajo: inspeccionar, admitir o crear, ejecutar, persistir y finalizar o revertir.

### Success criteria

- `install-journal.ts` queda como fachada de reexports sin política ni efectos.
- Codec, política, persistencia y ejecución tienen un dueño único y dependencias dirigidas hacia el contrato.
- CLI y coordinador usan exactamente la misma clasificación de reanudación.
- Las transiciones no tocan filesystem, señales ni handlers.
- El schema, bytes, errores y API pública son compatibles.
- Suite completa, ambos typechecks y pruebas enfocadas pasan.

### Rollback

Las PRs son apiladas y cada una preserva la API. Revertir ejecución devuelve el coordinador a la fachada; revertir persistencia devuelve el glue; revertir política restaura las copias; revertir codec restaura el módulo inicial. No existe migración de datos.

## B. Spec

### Requirement: canonical codec is the only byte translator

The system MUST accept stored journal bytes only when they decode to a structurally valid, reachable journal and exactly match the canonical encoding of that journal.

Given canonical, malformed, non-canonical and semantically unreachable journal bytes
When the installer decodes stored journal evidence
Then only the canonical valid and reachable journal is returned, and every other input produces the stable recovery-required error

### Requirement: one pure resume policy serves every caller

The system MUST classify resume eligibility identically before the CLI starts effects and before the journaled executor mutates the plan.

Given a matching completed journal, the supported pre-mutation Pi retry, the supported retirement retry, or any other non-complete valid journal
When the CLI and executor ask whether work may continue
Then both use one pure policy that distinguishes the supported cases and rejects every ambiguous case before a handler runs

### Requirement: journal transitions are pure and reachable

The system MUST derive prepared, pending, completed, failed, interrupted and globally complete journals without filesystem or handler effects, while preserving bounded detail and required recovery identity.

Given a validated journal and one supported execution event
When policy applies the event
Then it returns a new reachable journal, leaves the input unchanged and never carries obsolete pending, recovery or failure detail into a completed state

### Requirement: persistence composes codec and atomic store

The system MUST inspect and publish journals through one persistence boundary that composes canonical encoding with the existing bounded atomic store and preserves stable public errors.

Given missing, invalid or valid stored bytes and successful or failing store operations
When persistence inspects or publishes a journal
Then it returns missing, invalid or valid evidence and maps publication failure to journal-write-failed without exposing raw filesystem errors

### Requirement: execution owns effects but not policy

The system MUST coordinate handlers, checkpoints, interruption signals, rollback and finalization using the pure policy and persistence boundaries, preserving the existing observable lifecycle.

Given a fresh plan, either supported retry, a handler failure, a persistence failure, an interruption or successful global completion
When journaled execution runs
Then it performs only admitted handlers, persists each required checkpoint, removes both signal handlers, and invokes rollback or finalization at most once according to the proven terminal outcome

## C. Decisions

### 1. Codec includes composed validation

`install-journal-codec.ts` owns `validateInstallJournal`, `encodeInstallJournal` and `parseInstallJournal`. It depends on contract, shape and reachability only. Parse catches every decoding, introspection and canonicality failure and emits `InstallJournalError("recovery-required")`.

### 2. Resume returns a kind, not a boolean pair

`classifyInstallJournalResume(journal, plan)` returns `pre-mutation-retry`, `retirement-retry` or `null`. A closed vocabulary prevents callers from combining two predicates differently and lets execution choose the corresponding handler behavior without rediscovering the reason.

### 3. Named transitions instead of a generic reducer framework

The policy exports domain functions for prepare, entry pending/completed/failed, interruption and global completion. They may share private helpers, but no generic event bus or repository abstraction is introduced.

Every produced journal is validated before it crosses persistence. Tests assert input immutability and reachability directly.

### 4. Persistence owns public IO translation

`install-journal-persistence.ts` exports `inspectInstallJournal` and an internal/public-by-module `publishInstallJournal`. It composes `inspectStoredInstallJournal`/`publishStoredInstallJournal` with the codec. Store remains responsible for paths and atomic bytes.

### 5. Execution receives concrete modules

`install-journal-execution.ts` imports policy and persistence directly. Dependency injection remains limited to the existing `options.fs`, transaction ID, signals, progress and lifecycle seams used by tests and production.

### 6. Facade compatibility

`install-journal.ts` reexports the same public values and types as before. New policy/codec helpers are imported from their owning modules by internal consumers; they do not expand the installer CLI surface accidentally.

## D. Acceptance matrix

- Codec fixtures exercise exact bytes, trailing newline, whitespace, malformed UTF-8/JSON shape and unreachable state.
- Policy fixtures exercise fresh preparation, backup retry, retirement retry, unsupported recovery and every transition.
- Existing integration tests remain the authority for store faults, reentry, signals, rollback and finalization.
- Architecture checks confirm the facade contains no implementation and the new pure modules do not import filesystem, executor or CLI.
- The focused command is `bun test tests/install-journal-codec.test.ts tests/install-journal-policy.test.ts tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts tests/architecture-boundaries.test.ts`.
- Root `bun test`, `bun run typecheck` and installer typecheck pass before close.
