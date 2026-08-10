# Design — surface-wiring

## A. Proposal

### Intent

Expose the delivered cleaner audit, bounded cleaner mutation flow, and workbench through one small surface runner, reached by the existing `pi-ein` and `cc-ein` launchers. Both runtime adapters use the same capability protocol and engine code; only their packaging and launcher prefix differ.

### Scope

**In scope**

- Exact user commands under both isolated launchers:
  - `pi-ein cleaner audit` / `cc-ein cleaner audit`
  - `pi-ein cleaner mutate` / `cc-ein cleaner mutate`
  - `pi-ein cleaner complete` / `cc-ein cleaner complete`
  - `pi-ein workbench` / `cc-ein workbench`
- One deployable surface runner that validates requests, assembles existing authority-owned adapters, invokes the delivered engines, and normalizes bounded diagnostics.
- A versioned JSON request/result seam for the non-interactive cleaner commands.
- Installed-home and clean-session seam coverage for Pi and Claude.
- Behavior-preserving extraction of the workbench entrypoint assembly only where required so the root launcher and installed surface call the same implementation.

**Out of scope / non-goals**

- New cleaner rules, mutation primitives, automatic finding selection, declaration generation, verification execution, retries, rollback writes, or additional ownership.
- Any change to the 400-line mutation ceiling, exact-replacement semantics, one-target/one-writer limit, evidence freshness rules, or completion predicate.
- A new evidence store, finding cache, cleaner ledger, or alternate project/Git/OpenSpec authority.
- In-session slash commands, a new agent hierarchy, or separate Pi/Claude implementations; launcher subcommands are the smallest sufficient public surface.
- Installer TUI integration, launcher feature growth, updater work, terminal-app work, architect mutation, or parallel writers.
- Touching vanilla `pi`, vanilla `claude`, their homes, or private session histories.

### Affected areas

- `ein-pi/agent/surfaces/` — new runtime-edge runner and, if needed, shared workbench entrypoint assembly. This boundary may perform process/filesystem I/O; cleaner and workbench domain modules remain unchanged.
- `ein-pi/workbench.ts` — retained public launcher, reduced only to a compatibility entrypoint if its production assembly must move into the deployable surface closure.
- `pi-ein/pi-ein.fish` and `cc-ein/cc-ein.fish` — exact reserved-subcommand dispatch; all other arguments continue to the underlying runtime unchanged.
- `cc-ein/sync.ts` — compile/install the shared surface runner into the isolated Claude home and fail the required sync if it cannot be deployed.
- Installer payload/template inventory — package the same runner closure for clean Pi and Claude installations; this is deployment plumbing, not installer UI ownership.
- `tests/` and isolated-home fixtures — real launcher-to-runner-to-engine seam coverage for all capabilities and both runtimes.

The existing engine files remain behavior owners and SHOULD NOT require contract changes:

- `ein-pi/agent/lib/cleaner-read-only-audit.ts`
- `ein-pi/agent/lib/cleaner-bounded-mutations.ts`
- `ein-pi/agent/lib/project-state.ts`
- `ein-pi/agent/lib/reviewed-area-ledger.ts`
- `ein-pi/agent/lib/reviewed-area-ledger-store.ts`
- `ein-pi/agent/lib/workbench.ts`

### Risks

- **Evidence availability:** no production evidence resolver is currently wired; missing or invalid normalized evidence can make audit findings unresolved and mutation admission blocked. The surface must report this, never manufacture `verified` evidence.
- **Writer race/symlink swap:** a filesystem adapter can introduce a TOCTOU gap around the delivered precondition checks. The adapter must stay project-root-bound, refuse links/non-regular targets, perform one synchronous write, and preserve `mutation-uncertain` after indeterminate writes.
- **Packaging drift:** Pi may execute shipped Bun source while Claude executes a compiled binary. Both must be built from the same runner source and protocol version, and installed-surface tests must detect missing or stale payloads.
- **Launcher argument collision:** reserving `cleaner` and `workbench` changes how those first arguments are interpreted. Dispatch must match only the documented namespace and otherwise preserve existing passthrough.
- **TTY ownership:** workbench is interactive and must preserve its existing non-TTY diagnostic and exit classification rather than pretending activation succeeded.

### Rollback

Remove the reserved launcher dispatch and deployed runner, restore the previous pass-through wrappers, and restore `ein-pi/workbench.ts` if a compatibility extraction was made. No migration or persistent surface state is introduced. A source mutation already admitted through the cleaner is not automatically rolled back; it remains an explicit SDD/Git concern under the existing mutation contract.

### Success criteria

- Clean isolated Pi and Claude homes expose the four commands without repository-relative or installed internal paths in user-facing help.
- Equivalent cleaner requests reach the same engines and return the same versioned result semantics in both runtimes.
- Workbench reaches the existing entrypoint and preserves help, TTY gating, cancellation, output, and exit codes.
- Missing evidence, stale state, malformed input, unsupported activation, and deployment failure remain explicit and fail closed.
- Seam tests fail if a wrapper, packaged runner, dispatcher, or engine connection is removed, while existing direct engine tests remain unchanged.

## B. Spec

### R1. Explicit clean-session activation

The system **MUST** expose the cleaner audit, bounded mutation flow, and workbench as explicit subcommands of both isolated runtime launchers. A user **MUST NOT** need to know a repository path, installed module path, or TypeScript import name. Arguments outside the reserved `cleaner` and `workbench` namespaces **MUST** retain the existing launcher passthrough behavior.

**Scenario — clean launcher activation**

- **Given** a clean isolated Pi or Claude installation,
- **When** the user invokes a documented cleaner or workbench subcommand,
- **Then** the launcher dispatches to the shipped surface runner and reaches the selected engine, while an unrelated invocation still starts the underlying runtime as before.

### R2. Shared cleaner audit semantics

The audit surface **MUST** obtain the current B-owned project projection and G-owned canonical ledger evaluation at invocation time, accept only bounded normalized area/evidence inputs, and call `auditCleanerReadOnly`. It **MUST NOT** reinterpret a ledger reference as verified evidence, accept a caller-supplied project state as authority, or expose any writer. Its successful result **MUST** preserve `cleaner-audit-report/v1`, `mode: read-only`, `appliedChanges: 0`, and the engine's uncertainty labels.

**Scenario — audit with unavailable evidence**

- **Given** a canonical project and ledger area but no valid normalized evidence resolution,
- **When** either runtime invokes `cleaner audit`,
- **Then** the same audit engine returns an unresolved or unavailable observation with zero applied changes, and neither runtime upgrades the evidence to current or verified.

### R3. Explicit bounded mutation stages

The mutation surface **MUST** keep application and completion separate. `cleaner mutate` **MUST** require one explicit SDD apply declaration, one exact selected finding identity, and the normalized inputs needed to recompute that finding against fresh B/G/H state; it **MUST NOT** select or generate a finding or declaration. `cleaner complete` **MUST** consume the resulting transition, attributable verification record, fresh B state, and existing router verification view; it **MUST NOT** run verification commands itself.

**Scenario — admitted mutation remains incomplete**

- **Given** one fresh reviewed finding and a valid bounded declaration whose exact preconditions hold,
- **When** `cleaner mutate` is invoked through either runtime,
- **Then** the writer is invoked at most once and the observable result is `verification-required` or `mutation-uncertain`, never `complete`; completion requires a later `cleaner complete` invocation bound to the resulting state.

### R4. Mutation safety at the surface boundary

The filesystem adapter **MUST** resolve the selected project root canonically, constrain the target beneath it, reject symlinks and non-regular/restricted targets, expose one synchronous writer, and perform no retry or compensating write. Invalid, stale, ambiguous, oversized, out-of-area, architect, or unverifiable requests **MUST** preserve the engine's blocked/uncertain reason and perform zero unauthorized writes.

**Scenario — stale or unsafe target**

- **Given** a stale finding, changed digest, symlink, path escape, or target outside the declared area,
- **When** either runtime invokes `cleaner mutate`,
- **Then** the request fails closed with a stable bounded reason and the target writer is not called.

### R5. Workbench behavior preservation

The workbench surface **MUST** call the existing workbench entrypoint assembly rather than duplicate workbench behavior. It **MUST** preserve project argument parsing, the 20-candidate bound, TTY gating, runtime selection, cancellation semantics, bounded diagnostics, and exit classification. It **MUST NOT** move installer/update ownership into the workbench.

**Scenario — non-TTY workbench activation**

- **Given** a clean installed surface without interactive stdin or stdout,
- **When** either runtime invokes `workbench`,
- **Then** the existing entrypoint is reached, emits its bounded non-TTY guidance, performs no dependency effects, and exits with the existing usage classification.

### R6. Observable parity with declared adapter differences

The cleaner protocol version, validation, engine dispatch, statuses, reason codes, and result payloads **MUST** be identical across Pi and Claude. The only intentional differences **MUST** be declared as launcher prefix and packaging transport: Pi may execute shipped Bun source, while Claude may execute a standalone binary compiled from that same source. Runtime adapters **MUST NOT** translate a blocked, unknown, unavailable, stale, uncertain, or failed outcome into success/current.

**Scenario — equivalent runtime requests**

- **Given** equivalent clean-home fixtures and byte-equivalent cleaner requests,
- **When** the Pi and Claude launcher adapters dispatch them,
- **Then** their normalized outputs and exit semantics match after excluding only the declared launcher identity, or the test fails as undeclared drift.

### R7. Versioned and bounded surface protocol

Cleaner requests and normalized surface diagnostics **MUST** carry a version, capability, and explicit status/reason. The runner **MUST** reject unsupported versions, unknown keys that could widen authority, oversized inputs, malformed JSON, and control/private error leakage with a bounded usage or unavailable result. Process exit **SHOULD** distinguish processed domain outcomes from activation/usage failures; workbench exits **MUST** continue to use its existing classifier.

**Scenario — malformed surface request**

- **Given** an unsupported, oversized, or malformed cleaner request,
- **When** either launcher passes it to the runner,
- **Then** no engine writer or workbench dependency is invoked and the user receives the same bounded versioned diagnostic without raw internal paths or exceptions.

### R8. Installed seam evidence and isolation

The system **MUST** test each capability through the real Pi and Claude launcher adapters and deployed runner artifact, not only through direct module imports. Fixtures **MUST** use temporary isolated homes and stubbed runtime executables, **MUST NOT** depend on the developer's home or checkout paths as the user contract, and **MUST** prove vanilla runtime homes remain untouched.

**Scenario — missing deployed runner is detectable**

- **Given** a clean-session fixture in which the deployed surface runner is absent or cannot be compiled,
- **When** installation/sync or launcher activation is exercised,
- **Then** the operation reports a required unavailable/failure state and the seam test fails rather than silently launching a different implementation.

### Spec context receipts

Canonical context reused from `scope.md` (1 file, 28,941 bytes; within the 3-file/32 KiB limit):

| path | SHA-256 | bytes |
|---|---|---:|
| `docs/roadmap-features-ein.md` | `279b3600e566227aa2961a09ecc6cec7bc7138499cdee0b0df0c2001d33ad818` | 28941 |

No mapped `openspec/specs/<domain>/spec.md` addition was supplied or read. The existing change delta at `openspec/changes/surface-wiring/specs/surface-wiring/spec.md` was used as behavior-delta input, not as a canonical-domain receipt.

## C. Decisions

### 1. One runner, two launcher adapters

Use one surface runner for validation, authority-owned adapter assembly, engine dispatch, and cleaner result normalization. `pi-ein` and `cc-ein` only recognize the reserved subcommands and locate their isolated shipped runner.

**Trade-off:** the wrappers gain a small dispatch branch, but this avoids separate Pi extension logic, Claude prompt logic, and parity-by-documentation. The launcher prefix (`pi-ein` versus `cc-ein`) is an explicit runtime difference; capability semantics are shared.

### 2. Keep runtime edges thin and domain engines unchanged

The surface runner owns I/O and dependency construction. H owns read-only audit semantics; I owns admission/application/completion; B/G/router own current state, evidence evaluation, and verification freshness; workbench owns interactive behavior. The runner may translate transport errors but **MUST NOT** restate domain policy.

| Boundary | Owns | Does not own |
|---|---|---|
| Runtime launcher adapter | reserved command dispatch, isolated runner location | cleaner/workbench policy |
| Surface runner | request protocol, fresh adapter assembly, bounded rendering | evidence truth, mutation selection, verification execution |
| B/G/H/I/router | existing state, evidence, finding, mutation, completion semantics | runtime activation syntax |
| Workbench entrypoint | TTY/process/dependency assembly and exit mapping | installer/updater behavior |
| Sync/installer payload | shipping the same runner closure | capability decisions |

### 3. Recompute cleaner authority at invocation

A carried finding identifies intent but cannot authorize a write. The mutation adapter rereads B state and G ledger/evidence, reruns H for the declared area, and lets I validate exact identity and preconditions. No surface-owned cache or persistent report is added.

**Trade-off:** repeated reads are intentional and can block more often; this is preferable to treating stale session context as current authority.

### 4. Use a narrow JSON protocol only for cleaner transport

Cleaner activation is non-interactive and benefits from deterministic fixtures and exact diagnostics. Workbench remains its existing plain-text interactive interface and exit contract. The protocol wraps transport/activation status while preserving versioned engine results rather than inventing replacement cleaner outcomes.

**Trade-off:** callers must provide explicit normalized evidence/declaration records. That ceremony is required by G/I ownership and is safer than model-generated implicit authorization.

### 5. Package one source with explicit parity checks

Pi and Claude deployment may differ mechanically, but both artifacts originate from the same runner source and import closure. Claude sync treats compilation as required; Pi's template treats the runner as required. Protocol/version checks and installed-home fixtures detect stale or missing payloads.

### Alternatives rejected

- **Separate Pi extension and Claude skill implementations:** duplicates orchestration and makes semantic drift likely; no current capability requires different business logic.
- **Prompt-only skill/agent surfaces:** cannot prove dispatch to the TypeScript engines and can silently reinterpret blocked evidence.
- **Directly expose internal module paths:** violates the user contract and cannot work from a clean Claude home.
- **Add cleaner actions to `auditCleanerReadOnly`:** breaks H's read-only capability boundary.
- **One-call mutate-and-verify:** violates I's apply/verify separation and strict-TDD ownership.
- **Trust a prior audit report or persisted finding cache:** can authorize stale evidence and creates a second authority.
- **Duplicate workbench production dependencies in the runner:** risks launcher drift; a behavior-preserving shared entrypoint seam is smaller.
- **Modify installer TUI or build the terminal app now:** belongs to later roadmap blocks and expands the mapped scope.

### Skill applicability

The architecture and Ein-discipline guidance apply: use a small functional boundary, thin adapters, explicit ownership, and no speculative hierarchy. Nuxt Modules, Next.js, Nuxt UI, and README-style guidance do not apply because this design changes no web framework, UI component, Nuxt module, or README artifact.

## D. Success Criteria

### Observable acceptance

| Check | Acceptable observation |
|---|---|
| Pi reachability | A temporary clean Pi home invokes audit, mutate, complete, and workbench through `pi-ein`; no internal path appears in help/output. |
| Claude reachability | A synced temporary Claude home invokes the same capabilities through `cc-ein`; a missing/failed runner compilation is a required failure. |
| Audit seam | A supplied current fixture reaches `auditCleanerReadOnly` and preserves report version/read-only/zero-change fields; unavailable evidence stays unresolved. |
| Mutation seam | A valid fresh fixture reaches `applyCleanerBoundedMutation` exactly once, returns `verification-required`, and completion remains separate. |
| Safety seam | Stale, malformed, ambiguous, out-of-area, symlink, changed-precondition, writer-failure, and wrong-verification fixtures preserve distinct fail-closed outcomes and writer-call bounds. |
| Workbench seam | Help, non-TTY, cancellation, candidate bounds, and normal/operational/usage exits match `runWorkbenchEntrypoint`. |
| Runtime parity | Equivalent Pi/Claude cleaner fixture outputs match except for the declared launcher/package identity. |
| Isolation | Fixtures do not read or mutate real `~/.pi`, `~/.claude`, `~/.pi-ein`, or `~/.claude-ein`; vanilla launchers remain untouched. |
| Scope preservation | Existing H/I/workbench contracts and direct tests pass without widened capabilities, ownership, budgets, or installer UI behavior. |

### Required verification commands

Known checks for apply/verify (not executed during design):

```sh
bun test tests/surface-wiring.test.ts
bun test tests/cleaner-read-only-audit.test.ts tests/cleaner-bounded-mutations.test.ts tests/minimal-workbench-launcher.test.ts tests/reviewed-area-ledger.test.ts
bun test
cd installer && bun run typecheck
```

A manual clean-home check SHOULD invoke both launcher prefixes for audit and workbench help/non-TTY behavior and compare cleaner output for equivalent fixtures. Verification evidence must identify the exact runner protocol version and installed artifact under test; direct engine-only success is insufficient.
