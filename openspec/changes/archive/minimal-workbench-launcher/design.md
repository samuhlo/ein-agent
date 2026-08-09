# Design — minimal workbench launcher

## Design inputs

This design consumes the existing `ProjectStateV1` and runtime-adapter contracts; it does not reopen their ownership. The current projector export is `projectProjectState(request: ProjectStateRequest): ProjectStateV1`. The current runtime contract exposes the provider capability matrix, state-bound list/create/resume requests, `buildLaunchPlan`, and `executeLaunchPlan` with an injectable non-shell executor.

### Canonical specification context

| Path | SHA-256 | UTF-8 bytes |
|---|---|---:|
| `openspec/specs/sdd-lifecycle/spec.md` | `993e5cb40d0ac64af7d1dcca9f7ca3df0ca50362b5ed6cf638bf929a0ba8f7bf` | 29,805 |

The one-file selection is within the three-file/32 KiB limit. The authoritative active delta remains `openspec/changes/minimal-workbench-launcher/specs/sdd-lifecycle/spec.md` (`54e49904fd3f739fa9be65e746bff48345e9c1a0f5a136e8ff319913357b80f8`, 4,220 bytes) and is not modified by this phase.

Skill application: architecture, Ein discipline, cognitive document design, and terminal-relevant accessibility guidance informed this design. Next.js and web-interface guidance are not applicable because this is a Bun terminal entrypoint with no web or Next.js surface; no web guideline fetch is needed.

## A. Proposal

### Intent

Provide the smallest separate, keyboard-driven Bun workbench that confirms one projected project, selects Pi or Claude, presents state honestly, and delegates session and launch operations to the existing adapter boundary. The workbench remains a transient orchestrator, not an installer screen, state store, or runtime-history owner.

### Scope

In scope:

- A pure orchestration module at `ein-pi/agent/lib/workbench.ts` with injected candidates, prompts, output, projector, adapters, launch functions, abort signal, and doctor delegate.
- An executable thin entrypoint at `ein-pi/workbench.ts`. It is the repository-local bin (`bun ein-pi/workbench.ts [--project <root>]...`), parses arguments, enforces TTY rules, binds built-in line input/stdio/default dependencies, and maps results to process exit codes.
- Repeatable `--project` candidates, defaulting to the current directory, normalized and de-duplicated in argument order with a fixed maximum of 20. There is no filesystem-wide discovery or project index.
- Explicit project selection and confirmation, runtime selection, concise state/capability output, supported session choices, safe launch confirmation, and compact delegated doctor access.
- A focused orchestration test seam at `tests/minimal-workbench-launcher.test.ts`.

Exact non-goals:

- Expansion of the installer TUI.
- Any new UI framework dependency.
- Updater or updater configuration ownership.
- General configuration management.
- Full dashboard, general navigation, or tabs.
- Transcript/history migration, export, merge, or cross-runtime continuity.
- Parallel writers, agent parallelism, or worktree orchestration.
- Cleaner or architect behavior, including read/write mutations.
- Installer installation logic, runtime installation, repair, or update logic.
- Release changes, versioning, packaging, publishing, remote publication, or global package-bin registration.
- New persisted project/session state, session indexes, caches, or a second projector/state owner.

### Affected areas

| Area | Planned responsibility |
|---|---|
| `ein-pi/agent/lib/workbench.ts` | Pure flow, safe view models, deterministic result/exit classification |
| `ein-pi/workbench.ts` | Bun executable, argv/TTY/readline/stdio and production dependency wiring |
| `tests/minimal-workbench-launcher.test.ts` | Focused strict-TDD behavior tests using fakes |
| Existing project state, runtime adapters, and doctor surface | Read-only dependencies; no ownership or contract change |
| Installer files/package metadata | Untouched |

### Deterministic flow

1. The entrypoint accepts only `--project <root>` (repeatable) and `--help`. Unknown/missing values and more than 20 candidates are usage errors. With no candidate, `process.cwd()` is the sole candidate.
2. Interactive flow requires TTY stdin and stdout. Non-TTY invocation prints one actionable diagnostic and exits without projecting, prompting, reading sessions, invoking doctor, or launching. `--help` remains non-interactive and exits successfully.
3. Candidate roots are resolved, normalized, de-duplicated by first occurrence, and projected in that order with `projectProjectState`. Projection exceptions, wrong schema versions, and unavailable/invalid identity are rendered as normalized candidate failures. No candidate is silently selected; even one usable candidate requires a numbered selection and an explicit confirmation.
4. Output identifies candidates by a basename label plus stable ordinal; absolute cwd, repository root, Git paths, and change paths are retained only in the bound state and are not printed. The confirmed immutable `ProjectStateV1` snapshot and derived `ProjectBinding` remain paired for the run.
5. The project summary shows OpenSpec selection, `quality/reason`, phase or `unknown`, next or `unknown`, Git clean/dirty/unknown plus source quality/reason, and verification effective outcome, freshness, and quality/reason. Exact non-current tokens are shown; color never changes meaning.
6. The user selects exactly Pi or Claude. Capabilities are rendered in stable `list, create, resume, launch` order from the selected adapter/matrix. Unsupported cells are visible but are not executable menu choices.
7. The bounded action menu is: supported list, supported create, a resume choice only when resume is advertised and a same-provider reference from a successful list in this confirmed flow is available, doctor, or exit. Pi currently lists; Claude does not. Both currently provide request-only create; neither currently resumes.
8. Session rows show only ordinal and UTC ISO modification time. Opaque references remain internal and are passed back only to the same selected adapter; the workbench accepts no manually entered reference. Create success is labelled “request prepared (not persisted)”, not “session created”.
9. A successful create/resume request still requires a default-no launch confirmation naming the safe project label, provider, and mode. The workbench passes the unchanged confirmed state and adapter-produced intent to `buildLaunchPlan`, then passes only a successful plan to `executeLaunchPlan`.
10. Doctor invokes an injected bridge to the existing read-only `ein_pi_doctor`/established doctor command contract. The bridge exposes only bounded check name/status and overall status; it does not recompute checks or import installer repair/install/update functions. Missing callable access becomes an actionable `unavailable` result, after which the same menu resumes.
11. Launch is terminal for the workbench. It reports only the normalized adapter outcome/code. Exit zero means only that the adapter-observed process boundary exited zero; it does not claim a persisted session, runtime semantic success, refreshed project state, or fresh verification. Provider-owned terminal I/O and any runtime-owned history after handoff are not captured, copied, interpreted, or persisted by the workbench.

Exit mapping is closed and deterministic:

| Exit | Meaning |
|---:|---|
| `0` | Help, explicit normal exit, or normalized launch process exit zero |
| `1` | Unrecoverable operational failure, no usable candidate, or terminal normalized launch failure/unavailability |
| `2` | Invalid invocation/input contract or interactive invocation without TTY stdin/stdout |
| `130` | Prompt EOF/cancel/SIGINT, aborted signal, or adapter `cancelled` launch |

A “no” confirmation returns to the preceding bounded choice and is not cancellation. Recoverable list/create/resume/doctor outcomes are shown and return to the action menu; they do not fabricate success.

### Risks

- A projected snapshot can become stale before launch. The workbench labels it as a snapshot, never upgrades freshness, and ends after launch rather than reusing it.
- The existing doctor implementation may not expose a callable safe bridge in every runtime. The workbench must degrade to `unavailable`, not duplicate diagnostics.
- A child runtime can emit private content or write provider-owned history after handoff. The workbench neither captures nor claims control over that provider boundary.
- A repository-local Bun executable is not a globally installed bin. Packaging and release wiring remain deliberately outside this slice.

### Rollback

Remove the two new workbench files and focused test, and remove any repository-local executable permission added to `ein-pi/workbench.ts`. No migration, cache, installer repair, session cleanup, or state rollback is required because the workbench creates no persistence and changes no installer/package ownership.

### Success criteria

A TTY user can explicitly confirm one candidate, select either provider, read an honest compact state/capability summary, exercise only supported choices, delegate doctor, and launch only after a second confirmation. Tests demonstrate non-TTY/cancellation behavior, closed exit codes, privacy-safe rendering, current provider asymmetry, state freshness preservation, and that only a validated non-shell plan reaches an injected executor.

## B. Spec

### Requirement 1 — Separate, explicit project/runtime flow

The system **MUST** expose the workbench as a separate Bun entrypoint, **MUST** require explicit selection and confirmation of a projected project before Pi/Claude and session actions, and **MUST NOT** route through or extend the installer TUI.

**Scenario — Confirm before orchestration**

- **Given** one or more ordered project candidates and the existing projector,
- **When** a user enters the workbench,
- **Then** no runtime/session operation is called until one usable `ProjectStateV1` candidate is selected and confirmed, and the selected safe identity remains visible.

### Requirement 2 — Honest state presentation

The system **MUST** present the confirmed snapshot’s OpenSpec selection, source quality/reason, known phase/next, Git status quality, verification outcome, and verification freshness without guessing or promoting non-current evidence.

**Scenario — Preserve uncertain and stale values**

- **Given** a state whose sources are incomplete, ambiguous, unavailable, stale, invalid, absent, or current,
- **When** its summary is rendered,
- **Then** the exact applicable quality/reason/freshness tokens and known phase/next appear, while unknown values are labelled `unknown` and stale evidence is never shown as current.

### Requirement 3 — Capability-driven session choices

The system **MUST** derive list/create/resume choices from the selected adapter’s evidence-based capabilities and actual normalized results, **MUST** preserve Pi/Claude unsupported operations, and **MUST NOT** infer parity, fallback providers, fabricate metadata, or accept manually entered references.

**Scenario — Preserve current provider asymmetry**

- **Given** the current matrix where Pi lists, Claude does not, both create request-only, and neither resumes,
- **When** either provider is selected,
- **Then** capability output explicitly identifies those differences, only supported actions are executable, and any unsupported/unavailable result remains explicit.

### Requirement 4 — Private session metadata stays private

The system **MUST** render session results using bounded ordinals and modification times only, **MUST** keep opaque references internal and same-provider scoped, and **MUST NOT** output transcripts, raw references/ids, private source paths, environment/home values, executable paths, or raw provider/process errors.

**Scenario — List without disclosure**

- **Given** a successful Pi list containing opaque references and modification times,
- **When** recent sessions are displayed or selected,
- **Then** the user sees numbered recency metadata while the reference is used only internally with Pi and no private field reaches launcher output.

### Requirement 5 — Safe confirmed launch

The system **MUST** require a default-no launch confirmation and launch only by passing the confirmed state plus adapter-produced intent through `buildLaunchPlan` and a successful plan through `executeLaunchPlan`; it **MUST NOT** accept command strings, caller argv, shell interpolation, guessed resume flags, or caller-selected executables/environments.

**Scenario — Execute only a validated plan**

- **Given** a confirmed project/provider and successful supported intent,
- **When** the user confirms launch,
- **Then** the injected executor receives the adapter-owned fixed executable, empty argv, confirmed cwd, isolated environment, `shell: false`, and abort signal, or no executor call occurs and a normalized failure is shown.

### Requirement 6 — Partial process-boundary honesty

The system **MUST** describe create as request-only and launch outcomes as normalized process-boundary observations, and **MUST NOT** claim session persistence, semantic runtime success, refreshed state, refreshed verification, or ownership of provider terminal/history behavior.

**Scenario — Do not overclaim process exit**

- **Given** a runtime process exits zero or returns a normalized failure/cancellation,
- **When** the workbench reports the outcome,
- **Then** it reports only that closed outcome and exits accordingly without changing or re-projecting the confirmed state.

### Requirement 7 — Existing doctor surface only

The system **MUST** invoke compact doctor access through an injected bridge to the existing read-only doctor surface, **MUST** return to the action menu after its bounded result, and **MUST NOT** duplicate checks or acquire installation, update, repair, release, or installer-state ownership.

**Scenario — Doctor delegates or degrades**

- **Given** the doctor bridge is available or unavailable,
- **When** doctor is selected,
- **Then** existing bounded check statuses or one actionable unavailable diagnostic are shown and control returns without any installer mutation.

### Requirement 8 — TTY, cancellation, and exit behavior

The system **MUST** avoid prompts and side effects without TTY stdin/stdout, **MUST** map normal, operational, usage, and cancellation outcomes to `0`, `1`, `2`, and `130` respectively, and **MUST** stop launch when confirmation, EOF, SIGINT, or abort cancels the flow.

**Scenario — Non-interactive invocation fails closed**

- **Given** stdin or stdout is not a TTY,
- **When** the interactive entrypoint is invoked,
- **Then** one actionable diagnostic is emitted, exit `2` is returned, and no projector, adapter, doctor, or executor dependency is called.

### Requirement 9 — Testable, transient orchestration

The system **MUST** inject input, output, candidate/projector, adapter, launch-executor, signal, and doctor boundaries into the core flow and **MUST NOT** write project, OpenSpec, Git, installer, updater, session, transcript, cache, or workbench-selection state.

**Scenario — Fakes prove no hidden boundaries**

- **Given** deterministic fake prompts, projector, adapters, executor, doctor, and output sink,
- **When** success, unsupported, unavailable, error, and cancellation paths run,
- **Then** outputs and exit results are deterministic and no real process, prompt, filesystem write, runtime store, or installer function is used.

### Requirement 10 — Accessible terminal output

The system **MUST** use a linear keyboard-only prompt flow, stable numbered options, plain-text status words, one prompt at a time, and readable bounded lines; meaning **MUST NOT** depend on color, cursor movement, animation, icons, or terminal clearing.

**Scenario — Readable without visual styling**

- **Given** color is disabled or output is read sequentially by assistive technology,
- **When** project, state, capability, error, and confirmation content is presented,
- **Then** labels and ordering convey the complete meaning without color or spatial cursor positioning.

## C. Decisions

### Architecture and boundaries

| Decision | Owner and trade-off |
|---|---|
| Pure function/module orchestration, not classes or a UI framework | `workbench.ts` owns only transient control flow and view-model sanitization. Injected functions keep it small and directly testable. |
| One immutable confirmed snapshot per run | `project-state.ts` remains the only projector. The workbench does not refresh or merge state; ending after launch avoids pretending the snapshot remains fresh. |
| Direct repository-local Bun executable | `ein-pi/workbench.ts` is both thin entrypoint and local bin. No installer menu, package metadata, bundle, release, or global-bin change is needed in this slice. |
| Built-in line input | The entrypoint uses Bun/Node built-ins behind the injected prompt interface. This avoids a new UI dependency and keeps prompts accessible and mockable. |
| Capability descriptors gate visibility; adapter results gate success | The selected `RuntimeSessionAdapter` remains the session authority. A method name alone never implies support. |
| References are internal selection tokens | Users select numbered list rows; raw opaque references never become input/output. Same-provider adapter validation remains mandatory. |
| Launch boundary stays entirely in C | The workbench cannot construct or edit a process plan. `buildLaunchPlan` and `executeLaunchPlan` own executable, argv, cwd, env, shell, abort, and normalization. |
| Doctor is linked, never copied | A small injected presentation bridge calls the existing read-only doctor contract and returns bounded statuses. If no safe callable surface exists, `unavailable` is the correct behavior. |
| Installer remains lifecycle owner | Installer CLI/menu/package files are untouched. Workbench doctor access cannot call installer install/update/repair functions. |
| Output is intentionally lossy | Safe labels, enums, counts, ordinals, and times are shown; paths, references, transcript/process details, and raw diagnostics are withheld. This improves privacy at the cost of less low-level troubleshooting detail. |

### Alternatives rejected

- **Add a workbench branch to the installer TUI:** rejected because it mixes launch/session orchestration with installation lifecycle ownership.
- **Register a package/global bin now:** rejected because packaging, release, publishing, and versioning are explicit non-goals; the executable Bun entrypoint is sufficient for this slice.
- **Use Clack, Ink, or another TUI framework:** rejected because line prompts satisfy the flow and no new UI dependency is allowed.
- **Discover projects by scanning directories or persisting recents:** rejected because it creates privacy, ordering, and second-store concerns. Explicit roots plus cwd are deterministic.
- **Recompute status in the renderer:** rejected because `ProjectStateV1` already owns quality, reason, phase, next, Git, and freshness semantics.
- **Show all adapter methods as equal:** rejected because C intentionally preserves unsupported Claude list and both-provider resume.
- **Accept pasted session references or guess resume flags:** rejected because it bypasses provider/project provenance and C currently fails resume closed.
- **Spawn runtime commands directly:** rejected because command construction or a generic shell/process helper would bypass the validated non-shell adapter boundary.
- **Duplicate doctor checks in the workbench:** rejected because diagnosis already has an owner and duplication would drift toward installer/repair ownership.
- **Capture or parse child output:** rejected because provider output can contain private data and process exit does not establish semantic session success.

## D. Success Criteria

### Observable acceptance

| Seam | Acceptable observation |
|---|---|
| Entry/confirmation | Ordered candidates are projected; no runtime call occurs before explicit selection and confirmation; one candidate is not auto-confirmed. |
| State summary | Fixtures for current, absent, incomplete, ambiguous, unavailable, stale, unbound, and invalid-reason states retain exact source/freshness meaning and known phase/next. |
| Capabilities | Pi list is executable, Claude list is explicitly unsupported, create is request-only for both, and resume is explicitly unsupported for both. |
| Privacy | Output contains no fixture cwd/root/private path, opaque reference, transcript marker, environment/home/executable value, or raw thrown/process text. |
| Launch | A fake executor receives only a real adapter-built plan with empty argv and `shell: false`; mismatch, unavailability, rejection, cancellation, signal, and nonzero exit remain normalized. |
| Doctor | The existing-surface delegate is called once, compact success/failure/unavailable output returns to the same menu, and installer mutation functions are absent. |
| TTY/exit | Non-TTY exits `2` without dependency calls; cancellation exits `130`; no usable project and terminal launch failure exit `1`; explicit exit and process exit zero return `0`. |
| Accessibility | Snapshot output is understandable as sequential plain text with no ANSI/color/cursor assumptions and with stable numbered choices and explicit status words. |
| No writes | Before/after fixtures show no launcher-owned changes to project, OpenSpec, Git, installer, updater, runtime-session, transcript, or cache state. Provider-owned behavior after successful process handoff is not attributed to the launcher. |

### Strict-TDD and verification evidence

Strict TDD is required. Acceptance evidence must show RED before production implementation, the smallest GREEN behavior, TRIANGULATE coverage across Pi/Claude plus stale/ambiguous/cancel/error variants, and REFACTOR with the focused suite still green. Predecessor projector and adapter suites remain contract evidence; the new focused suite tests orchestration rather than duplicating their internals.

No reliable test runner command is configured in `openspec/config.yaml`, so this design does not invent one; the tasks/apply phase must establish the repository-supported focused Bun invocation before RED. The only configured quality command currently known is `cd installer && bun run typecheck`; it may detect installer regressions but does not replace focused workbench tests or type coverage for the new `ein-pi` files. No tests, builds, or typechecks are run in this design phase.
