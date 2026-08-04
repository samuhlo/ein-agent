# Design — add-installer-runtime-menu

## A. Proposal

### Intent

Add the bounded B2 installer choice for **Pi**, **Claude Code**, or **both**, and execute each selected runtime path exactly once. Preserve Pi's isolated deployment and recovery behavior while making Claude synchronization deterministic in repository and standalone installer execution.

### Scope

In scope:

- A runtime prompt after the existing interactive **Install** action.
- Target-scoped prerequisites, deployment/sync, launchers, markers, secrets, and doctor behavior.
- Safe legacy Pi EIN detection and migration before final Pi target resolution.
- Deterministic packaged access to the established `cc-ein` synchronization source.
- Focused tests for selection, isolation, migration gating, launchers, orchestration, and failure propagation.

Out of scope:

- B3 update banners, update detection, and `pi-ein update --all` changes.
- New runtime targets, a new Claude implementation, broad installer redesign, or changes to non-install menu actions.
- Installing vanilla Claude or changing the established optional integrations beyond making their failure classification explicit.

### Affected areas

- `installer/src/cli/menu.ts` and `installer/src/cli/install.ts` for target selection and orchestration.
- The Pi path/context boundary used by paths, deployment, snapshot/restore, marker writing, and doctor.
- Small installer-core seams for runtime orchestration, EIN launcher installation, and packaged asset staging.
- Installer asset-generation/build plumbing and declarations for the embedded runtime payload.
- `cc-ein/sync.ts` only where needed to expose reliable required-operation exit status.
- Focused Bun tests under `tests/`.

### Risks

- Import-time `AGENT_DIR` capture could deploy back into the legacy directory after migration.
- `cc-ein/sync.ts` currently treats some work as best-effort, so process success could conceal an incomplete required payload.
- A standalone binary cannot rely on the caller's working directory or an adjacent repository checkout.
- In a both-target install, one runtime may succeed while the other fails; reporting must not imply atomicity.

### Rollback

Revert the installer, sync-status, and asset-packaging changes and rebuild the installer artifact. At runtime, Pi keeps its existing snapshot/restore behavior; the migration's existing pre-move backup remains the recovery source if migration itself must be undone. A failed Claude path does not roll back a successful Pi path or delete pre-existing Claude state; temporary staging is always removed and the Claude failure remains explicit and retryable.

### Success criteria

The menu offers all three targets without changing cancellation or non-TTY behavior; selected paths run once and unselected paths do not run. Pi uses the isolated directory after safe migration gating, Claude uses packaged source from arbitrary working directories, launcher writes are idempotent, and any selected target failure produces an overall non-zero result with per-target status.

## B. Spec

### Spec context

`scope.md` records no canonical `openspec/specs/<domain>/spec.md` reference. Canonical context is therefore **0 files / 0 bytes**, with no SHA-256 entries to record. This design implements the authoritative change delta at `openspec/changes/add-installer-runtime-menu/specs/installer-runtime/spec.md`; it does not promote that delta to canonical context.

### R1 — Interactive target selection

The system **MUST** prompt for exactly one of Pi, Claude Code, or both after the interactive Install action, while direct `ein install` **MUST** retain Pi as its default and existing menu cancellation/non-TTY behavior **MUST** remain unchanged.

**Scenario:** Given the lifecycle menu is interactive, when the user chooses Install and selects or cancels the runtime prompt, then the chosen target is passed once to installation, or cancellation exits cleanly without running either runtime.

### R2 — Target isolation and shared work

The system **MUST** run only selected runtime paths, **MUST** run each selected path at most once, and **MUST** resolve the shared Bun prerequisite no more than once per installation. Pi-only dependencies, mode/secrets work, marker writing, and Pi doctor **MUST NOT** run for Claude-only installation.

**Scenario:** Given faked Pi and Claude runners, when Pi, Claude Code, and both are selected in turn, then call counts are respectively `(1,0)`, `(0,1)`, and `(1,1)`, with one shared Bun preparation per run.

### R3 — Legacy Pi migration and final path resolution

The system **MUST** derive stable legacy and isolated paths from the active home, validate the legacy marker using the existing EIN marker contract, and run the existing migration only for a positively identified legacy EIN installation. Migration detection and execution **MUST** occur before final Pi target resolution; after migration, all Pi snapshot, deploy, template, package, marker, launcher, rollback, and doctor operations **MUST** use one newly resolved explicit Pi path context. A migration failure **MUST** stop the Pi path before deployment.

**Scenario:** Given a vanilla legacy directory, a malformed marker, a valid legacy EIN marker, or a migration conflict, when Pi installation starts, then the first two states are preserved without migration, the valid EIN state is migrated before the isolated context is resolved, and the conflict fails the Pi path without deploying through a stale path.

### R4 — Pi installation behavior

The system **MUST** preserve the existing Pi prerequisite, snapshot/rollback, isolated template deployment, declared-package, optional secret, marker, and doctor semantics, and **MUST** install `pi-ein.fish` at `~/.config/fish/functions/pi-ein.fish`.

**Scenario:** Given the Pi path is selected and migration gating has completed, when Pi installation succeeds, then EIN is deployed and verified through the final isolated path, the Pi marker is written there, and the Pi launcher exists at its Fish function destination.

### R5 — Deterministic Claude payload and synchronization

The system **MUST** build an embedded runtime payload from the established source tree containing `cc-ein/`, `pi-ein` launcher/migration assets, and the exact `ein-pi` source closure required by `cc-ein/sync.ts` and its SDD CLI. For Claude installation it **MUST** extract that payload to a temporary root, invoke `bun cc-ein/sync.ts` with that root as the deterministic working context, observe the process result, and clean staging in all outcomes. It **MUST NOT** search the caller's current directory or silently fall back when payload resolution fails.

**Scenario:** Given a standalone installer launched from an unrelated working directory, when Claude Code is selected, then the embedded payload is staged with repository-relative layout, Bun runs the staged `cc-ein/sync.ts`, and missing/corrupt payload or staging failure is reported as Claude failure.

### R6 — Claude failure semantics

The system **MUST** treat source reads, core `~/.claude-ein` writes, agent/skill synchronization, settings/instruction generation, and SDD CLI compilation as required sync operations whose failure yields a non-zero sync result. Optional Context7/Engram availability or MCP configuration **MAY** remain warning-only. The installer **MUST** install `cc-ein.fish` only after required sync succeeds, **MUST** fail the Claude path if sync or launcher installation fails, and **MUST NOT** infer success from log text.

**Scenario:** Given the Claude path is selected, when a required sync operation exits non-zero or the launcher write fails, then Claude is reported failed and the overall install is non-zero; when only an optional integration fails, then a warning is shown and successful core sync plus launcher installation may complete the path.

### R7 — Launcher ownership and idempotence

The system **MUST** create `~/.config/fish/functions` when necessary and **MUST** write only the selected EIN launcher file from packaged content. Repeating installation **MUST** leave identical launcher content unchanged, and unrelated Fish functions **MUST NOT** be modified.

**Scenario:** Given a temporary Fish functions directory containing an unrelated function, when either EIN launcher is installed twice, then the named EIN file has exact packaged content, the second write is idempotent, and the unrelated function remains unchanged.

### R8 — Both-target result aggregation

For both, the system **MUST** run Pi then Claude exactly once, **MUST** continue to Claude even if Pi fails, and **MUST** return failure if either target fails while reporting each result independently. It **MUST NOT** roll back a successful independent target because the other target failed.

**Scenario:** Given Pi succeeds and Claude fails, or Pi fails and Claude succeeds, when both is selected, then both paths run once in Pi-then-Claude order, their individual outcomes are shown, and the overall result is failure without cross-runtime rollback.

## C. Decisions

### 1. Resolve the Pi target after migration

Legacy detection uses home-relative source/destination paths that do not depend on `AGENT_DIR`. A valid legacy installation is migrated first; only then is a `PiInstallContext` resolved and passed through all path-sensitive Pi operations. This removes stale import-time path capture from the B2 call graph without redesigning unrelated path consumers.

**Trade-off:** several Pi operations need an explicit context seam, but this is safer and more testable than mutating globals or choosing an ordering that can deploy back into the moved legacy path.

### 2. Keep menu choice separate from CLI flags

The menu owns the new prompt and passes a typed target to installation. Direct `ein install` defaults to Pi, preserving its current contract; no new public target flag is introduced because B2 only requires interactive selection.

### 3. Use one small orchestrator with independent target results

A shared preparation stage resolves Bun once, followed by target runners. Both runs Pi then Claude and aggregates typed results; Pi's existing local rollback remains local. Continuing after one target fails gives useful partial progress and clear retry behavior without pretending the two external runtimes form a transaction.

### 4. Embed and stage the established Claude source closure

The installer build creates a single runtime-assets archive, preserving repository-relative paths required by `sync.ts`. The installer extracts it to a temporary root and invokes `bun cc-ein/sync.ts` there. Launchers and the existing Pi migration asset come from the same versioned payload.

**Rejected:** resolving `cc-ein/` from `process.cwd()` or an adjacent checkout, because standalone and arbitrary-cwd execution would be nondeterministic. **Rejected:** reimplementing sync inside the installer, because it would create a second Claude implementation and exceed B2.

### 5. Make required sync work fail closed

`cc-ein/sync.ts` owns classification of its internal operations: core payload generation and compilation are required and must affect exit status; optional integrations remain warnings. The installer owns process-status and launcher-status aggregation. This preserves optional setup while preventing a success claim for an incomplete core runtime.

### 6. Reuse a narrow launcher helper

A small helper owns destination calculation, parent creation, exact named-file replacement, and idempotence. CLI orchestration owns which launcher is selected and how errors are reported. No generic file-deployment framework or class hierarchy is added.

### Boundaries

- **Menu:** prompt values and cancellation only.
- **Install orchestrator:** shared Bun preparation, target ordering, exactly-once execution, and result aggregation.
- **Pi runner/context:** migration gating, final path resolution, existing Pi lifecycle, and Pi launcher.
- **Claude runner:** payload staging, child-process invocation, launcher sequencing, and target result.
- **`cc-ein/sync.ts`:** required-versus-optional internal exit semantics.
- **Asset build/resolver:** payload inventory, embedding, extraction, and cleanup.
- **Launcher helper:** EIN-owned Fish files only.
- **B3/update behavior:** unchanged and outside every boundary above.

Nuxt Modules, Drizzle, and Nuxt Studio skills do not apply because this change is a Bun installer/runtime flow with no Nuxt module, database, or CMS surface. Architecture and Ein discipline apply through bounded seams, explicit ownership, and focused verification.

## D. Success Criteria

- Runtime options visibly contain Pi, Claude Code, and both; cancellation and non-TTY behavior match the existing installer.
- Pi-only and Claude-only runs have no unselected-runtime side effects; both runs Pi then Claude once each and reports partial failure accurately.
- A vanilla or malformed-marker `~/.pi/agent` is preserved; valid legacy EIN migrates before a fresh isolated Pi context is resolved; migration failure prevents deployment.
- All Pi path-sensitive operations use the same final isolated context, and existing Pi rollback and doctor semantics remain intact.
- Standalone Claude installation succeeds from an arbitrary working directory using the embedded payload, and payload/staging/sync/launcher failures cannot be reported as success.
- Required Claude sync operations affect process status; optional integration failures remain explicit warnings.
- Both launchers are installed idempotently at their exact Fish destinations without changing unrelated functions.
- Focused tests use fake runners/processes and temporary homes; they cover the three selections, exactly-once ordering, shared Bun deduplication, Pi path isolation, valid/invalid legacy gating, launcher ownership, packaged asset inventory/staging, required/optional Claude outcomes, and aggregate failures.
- Required verification commands are `cd installer && bun run typecheck` and `bun test tests/installer-runtime-menu.test.ts`. If packaged-asset coverage is split into a second focused file, run it explicitly in the same focused Bun invocation. No broad build or full test suite is required for B2 acceptance unless the apply phase adds a safe packaged-installer smoke fixture.
