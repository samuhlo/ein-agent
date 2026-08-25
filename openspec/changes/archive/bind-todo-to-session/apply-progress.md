status: complete

# Apply progress — bind-todo-to-session

## Group 001 — Contrato versionado de session binding

Completed task 1.1 only. Added the pure V1 contract for session state, custom entries,
events, and launch metadata, including stable transport constants. Parsers reject extra
keys, coercions, unknown versions, unsafe change names, malformed JSON, and invalid
union shapes. Serializers emit canonical key order.

## TDD Cycle Evidence

| Behavior seam | Stage | Evidence |
|---|---|---|
| Exact V1 session-binding payloads fail closed and serialize canonically | RED | `bun test tests/sdd-session-binding.test.ts` — failed because the contract module was absent (0 pass, 1 fail). |
| Exact V1 session-binding payloads fail closed and serialize canonically | GREEN | Same focused command — 5 pass, 0 fail after minimal implementation. |
| Exact V1 session-binding payloads fail closed and serialize canonically | TRIANGULATE | Added a second valid and adversarial case for entry, event, and metadata unions; same command — 6 pass, 0 fail. |
| Exact V1 session-binding payloads fail closed and serialize canonically | REFACTOR | Consolidated exact-record guarding; final focused command — 6 pass, 0 fail, 34 assertions. |

Final focused command association: exact V1 session-binding payloads fail closed and
serialize canonically → `bun test tests/sdd-session-binding.test.ts` (6 pass, 0 fail).

## Group 002 — Restauración pura con autoridad del newest entry

Completed task 2.1 only. Added pure restore and revalidation transitions. The newest
matching custom entry is authoritative: clear wins, malformed/unknown/invalid bind
fails closed without scanning backward, and launch intent is eligible only when no
matching entry exists. Revalidation of a missing binding requests one V1 clear, then
remains unbound without duplicate persistence.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Newest matching entry exclusively controls restore; launch intent applies only with no entry | Filtered restore command failed on missing `restoreSessionBinding` (0 pass, 1 fail) | Filtered command passed (3 pass) | Full focused file passed with older-valid/malformed-newest and valid-newest cases (11 pass) | Consolidated unbound transitions while retaining source authority; final focused file passed (11 pass) |
| Invalid bound state requests at most one clear across revalidation | Filtered restore command failed on missing `revalidateSessionBinding` (0 pass, 1 fail) | Full focused file passed the first/second revalidation assertions (11 pass) | Same completed focused cycle also covered invalid then already-unbound evidence (11 pass) | Final focused file passed after transition cleanup (11 pass) |

Final focused command associations:
- Newest matching entry exclusively controls restore; launch intent applies only with no entry → `bun test tests/sdd-session-binding.test.ts` (11 pass, 0 fail).
- Invalid bound state requests at most one clear across revalidation → `bun test tests/sdd-session-binding.test.ts` (11 pass, 0 fail).

## Group 003 — Startup, resume e aislamiento de la overlay

Completed task 3.1 only. The overlay now owns a closure-local binding, restores only the
active session manager's newest authoritative entry, validates explicit active changes,
and never selects UI focus from sole-change filesystem fallback. Startup metadata is
captured/deleted once, project-bound, persisted when valid, and unavailable or invalid
bindings append at most one clear before painting an empty widget.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Fresh sessions stay empty while valid resumes restore only their own focus | Filtered session command failed fresh and two-manager restore (0 pass, 4 fail) | Filtered command passed fresh, isolated restore, malformed newest, and one-shot intent (4 pass) | Added clear, missing, archived, unsafe, unavailable inspection, and sole-change no-fallback; filtered command passed (5 pass) | Preserved one `refresh()` route and contained render failure; final filtered command passed (5 pass, 23 assertions) |
| Startup intent is consumed once and invalid bindings clear without leakage | Filtered session command left metadata present and failed malformed clearing (0 pass, 4 fail) | Filtered command passed deletion, persistence, non-reuse, and single clear (4 pass) | Invalid-state matrix and same-cwd isolation passed (5 pass) | Final focused command passed after cleanup (5 pass, 23 assertions) |

Final focused command associations:
- Fresh sessions stay empty while valid resumes restore only their own focus → `bun test tests/sdd-overlay-repaint.test.ts -t "session"` (5 pass, 0 fail).
- Startup intent is consumed once and invalid bindings clear without leakage → `bun test tests/sdd-overlay-repaint.test.ts -t "session"` (5 pass, 0 fail).

## Group 004 — Listener síncrono, repaint inmediato y limpieza de lifecycle

Completed task 4.1 only. The overlay rebinds exactly one validated event-bus listener to
the current session context, persists accepted bind/clear/invalidate transitions, clears
the paint cache, and repaints synchronously before `emit()` returns. Invalid and duplicate
events are ignored; another change cannot invalidate the focus. Session replacement
retires the old context, while shutdown unsubscribes the listener.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Accepted binding events persist and repaint in the emitter stack | Filtered event command failed all three new tests because no listener existed (0 pass, 3 fail) | Listener implementation passed append/paint ordering, validation, dedup, invalidation, and lifecycle tests (3 pass) | Added active clear coverage alongside invalid payload, foreign invalidation, two refreshes, and context replacement; filtered command passed (3 pass, 16 assertions) | Renamed the lifecycle operation to express rebind semantics; final filtered command passed (3 pass, 16 assertions) |
| Rebinding never leaks duplicate listeners or a retired session context | Filtered event command observed zero listeners and no replacement repaint (0 pass, 3 fail) | Rebind and shutdown cleanup passed with one live listener (3 pass) | Replacement plus post-shutdown emission remained isolated (3 pass) | Final focused command passed after naming cleanup (3 pass, 16 assertions) |

Final focused command associations:
- Accepted binding events persist and repaint in the emitter stack → `bun test tests/sdd-overlay-repaint.test.ts -t "event"` (3 pass, 0 fail).
- Rebinding never leaks duplicate listeners or a retired session context → `bun test tests/sdd-overlay-repaint.test.ts -t "event"` (3 pass, 0 fail).

## Group 005 — Bind explícito de `/ein:sdd-next <change>`

Completed task 5.1 only. `ein-ai` now publishes one exact V1 bind event only after
`/ein:sdd-next` resolves the explicitly named change as active. The overlay consumes the
event in the same emitter stack, appends the session entry, and repaints before the
command returns. Unnamed, unsafe, and inactive inputs publish nothing; router selection
logic remains untouched.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| A successful explicitly named `sdd-next` binds and repaints same-stack | Filtered command failed because no entry was appended (1 pass, 1 fail) | Minimal local publisher and post-resolution emission passed (2 pass) | Unsafe/inactive/unnamed cases plus `tests/sdd-router.test.ts` passed (2 filtered integration tests; 50 router tests) | Publisher remained closure-local and typed without added abstraction; final filtered command passed (2 pass, 6 assertions) |
| Failed or absent explicit selection never mutates session focus | RED run already passed the negative matrix while the success seam failed | GREEN preserved zero append/repaint for negative inputs | Added unsafe and inactive names and reran router explicit/sole/ambiguous contracts | Final filtered command passed unchanged (2 pass, 6 assertions) |

Final focused command associations:
- Successful named `sdd-next` binds and repaints before command return → `bun test tests/sdd-overlay-repaint.test.ts -t "sdd-next"` (2 pass, 0 fail).
- Failed or absent explicit selection does not bind → `bun test tests/sdd-overlay-repaint.test.ts -t "sdd-next"` (2 pass, 0 fail).

## Group 006 — Invalidación inmediata al cerrar el cambio enfocado

Completed task 6.1 only. A successful canonical SDD close now publishes the exact V1
`invalidate(change)` event immediately after the filesystem close succeeds. The overlay
clears and repaints a matching focus before the command returns; another focused change
and failed closes remain untouched. Repeated lifecycle refreshes add no duplicate clear.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Successful close immediately clears only the matching session focus | Filtered close command failed immediate ordering: clear happened only on later lifecycle refresh (4 pass, 1 fail) | Publishing invalidate after successful `closeChange` passed focused, foreign-focus, and failed-close cases (5 pass) | Added repeated lifecycle refreshes for both matching and foreign focus; filtered command passed (5 pass, 26 assertions) | Kept the existing closure-local publisher and close/render responsibilities separate; final filtered command passed (5 pass, 26 assertions) |
| Failed close never clears or repaints the current focus | RED negative case passed while the missing success event exposed the seam | GREEN retained the focused change with no appended clear | Foreign-focus success and repeated refreshes confirmed isolation | Final focused command passed unchanged |

Final focused command associations:
- Successful close immediately clears only the matching session focus → `bun test tests/sdd-overlay-repaint.test.ts -t "close"` (5 pass, 0 fail).
- Failed close never clears or repaints the current focus → `bun test tests/sdd-overlay-repaint.test.ts -t "close"` (5 pass, 0 fail).

## Group 007 — Metadata validada en planes Pi create

Completed task 7.1 only. Pi create intents may now carry typed session-binding intent;
`buildLaunchPlan` derives canonical one-shot metadata only when the safe change is an
exact active change for the exact project cwd. No-focus Pi and Claude plans remain
metadata-free, while malformed, mismatched, inactive/unavailable, resume, and Claude
binding attempts fail closed. Create argv remains `[]`.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Only validated Pi create focus produces canonical metadata without changing argv | Filtered binding command failed because metadata was absent and invalid intents were accepted (3 pass, 2 fail) | Typed Pi-create intent plus bounded derivation passed the filtered command (5 pass) | Added stable canonical serialization, free-JSON rejection, no-focus Pi/Claude absence, invalid name, cwd mismatch, inactive/unavailable, resume, and Claude cases (5 pass, 28 assertions) | Represented absent metadata as `undefined` rather than an empty-string sentinel; final filtered command passed (5 pass, 28 assertions) |

Final focused command association: validated Pi create focus alone produces canonical
one-shot metadata while all other launch branches remain unchanged → `bun test tests/runtime-session-adapters.test.ts -t "binding"` (5 pass, 0 fail).

## Group 008 — Guard cerrado de argv, entorno y tamper

Completed task 8.1 only. Launch execution now requires the original WeakMap-owned plan
and compares its complete top-level shape, project, argv, and environment against an
immutable snapshot. The reserved binding key is accepted only on its validated Pi-create
owner and is reparsed against the plan cwd; copies, added/removed/altered environment,
valid-looking argv substitutions, and coordinated cwd/provider/mode changes fail before
the executor. Create remains `[]`, Pi resume remains `["--session", uuid]`, and shell is false.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Original validated Pi-create metadata executes while copied or tampered plans fail pre-spawn | Focused two-file command failed bound execution and accepted coordinated resume tamper (51 pass, 2 fail) | Complete immutable plan snapshot and conditional metadata validation passed (53 pass) | Added metadata deletion, valid UUID substitution, exact argv declarations, and separate argv/key/value/cwd/provider mutations; focused command passed (54 pass, 295 assertions) | Tightened the Pi intent test type and retained one exact-record comparator; root typecheck and final focused command passed |

Final focused command association: original validated plan alone may execute, with exact
argv and conditional binding ownership → `bun test tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts` (54 pass, 0 fail).

## Group 009 — Captura temprana del foco en el controller

Completed task 9.1 only. The controller now snapshots its optional focused change at the
accepted continue action boundary, before continuity preparation awaits, and passes that
snapshot only through the extended `continueLaunch(provider, brief, focusedChange?)`
port. No-focus remains `undefined`; Pi and Claude route the same intent snapshot. Ordinary
create and picked resume retain their exact prior `launch` argument lists.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Continue launches with the focus confirmed before asynchronous preparation | Filtered continue command observed only provider and brief after focus changed during deferred prepare (0 pass, 1 fail) | Capturing before the await and passing the optional third argument made the focused test pass (1 pass) | Added no-focus, Claude, ordinary create, and picked-resume argument checks; filtered command passed (2 pass, 7 assertions) | Kept the signature change confined to `continueLaunch`; final filtered command passed (2 pass, 7 assertions) |

Final focused command association: continue launches with the pre-prepare focus while
ordinary create and picked resume remain unchanged → `bun test tests/terminal-app-controller.test.ts -t "continue"` (2 pass, 0 fail).

## Group 010 — Continue-as-new hasta el child Pi

Completed task 10.1 only. The entrypoint now receives the controller's captured focus,
revalidates exact active Pi focus at launch time, and gives the typed create intent to the
adapter. The resulting plan environment reaches `runContinueInPty` unchanged while the
brief remains a separate paste channel. Invalid Pi focus fails before the PTY runner;
no-focus Pi and Claude stay metadata-free. Direct create and picked resume still use the
ordinary launch route and its session reference.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Continue-as-new carries validated Pi focus as child metadata before the separate brief | Filtered binding command failed at import because `productionContinue` was not exported/threaded (0 pass, 1 fail) | Focused command passed valid Pi metadata, no-focus absence, Claude isolation, and stale pre-spawn refusal (2 pass) | Added unsafe focus and direct-create/picked-resume route isolation; focused command passed (3 pass, 16 assertions) | Reviewed the edge flow and kept PTY transport metadata-agnostic with no extra abstraction; final focused command passed (3 pass, 16 assertions) |

Final focused command association: validated Pi continue metadata is separate and
precedes brief delivery while invalid/direct/resume/provider-isolated paths remain clean
→ `bun test tests/terminal-app-pty.test.ts -t "binding"` (3 pass, 0 fail).

## Group 011 — Sanitización de metadata heredada en Fish

Completed task 11.1 only. The Fish launcher now erases inherited
`EIN_SDD_SESSION_BINDING_V1` once, before every dispatch branch. Ordinary Pi delegation,
terminal app startup, and reserved runner dispatch retain exact isolated homes and argv;
only the trusted validated child adapter may add the one-shot key again.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Fresh Fish entrypoints cannot pass stale one-shot binding metadata to ordinary children | Filtered command reached the direct Pi stub with inherited metadata and failed with exit 88 (0 pass, 1 fail) | One early targeted Fish erase passed direct delegation and app startup (1 pass, 4 assertions) | Added arbitrary spaced argv and reserved cleaner dispatch while retaining isolated homes; filtered command passed (1 pass, 6 assertions) | Reviewed the single erase placement; no restructuring or broader variable cleanup was warranted, and the completed focused command remained green |

Final focused command association: fresh Fish entrypoints erase stale binding metadata
while preserving exact forwarding → `bun test tests/surface-wiring.test.ts -t
"EIN_SDD_SESSION_BINDING_V1"` (1 pass, 0 fail, 6 assertions).

## Group 012 — Regresión focalizada y puertas amplias

Completed task 12.1 under the caller's explicit bounded gate. The contractual nine-file
regression suite and root typecheck are green. No production selection or renderer code
changed. Two real aggregate-gate defects were corrected only in focused test harnesses:
the overlay context now supplies the onboarding `select` method, and the PTY test imports
its outcome type and narrows optional launch metadata before parsing.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Combined binding regressions complete without leaked onboarding errors | Exact contractual command reported 212 pass, 0 fail, but 5 unhandled `ctx.ui.select` errors and exited 1 | Added the minimal fake UI selection; exact command passed 212/212 with 0 errors | `bun test tests/sdd-overlay-repaint.test.ts` passed 16/16 independently | Final exact contractual command passed 212/212, 996 assertions |
| Changed binding tests satisfy the root TypeScript contract | `bun run typecheck` failed on missing `LaunchOutcome` and optional metadata passed as required string | Imported the existing type and narrowed metadata; root typecheck passed | Final exact contractual suite exercised the corrected PTY and overlay tests together | No production cleanup was needed; final exact suite remained green |

Final focused command associations:
- Combined session binding preserves isolation and non-UI router/renderer behavior → exact
  nine-file `bun test` command from task 12.1 (212 pass, 0 fail).
- Changed tests satisfy root TypeScript contracts → `bun run typecheck` (pass).

The repository-wide `bun test` was intentionally not run because the caller explicitly
forbade the full repository suite for this apply slice; independent broad execution remains
verify-owned. This is the only verification-plan deviation. The unavailable macOS `timeout`
wrapper failed before test execution and did not affect the subsequently bounded tool runs.

## Files changed

`ein-pi/agent/lib/pi-contract.ts`
`ein-pi/agent/lib/sdd-session-binding.ts`
`tests/sdd-session-binding.test.ts`
`ein-pi/agent/extensions/ein-sdd-overlay.ts`
`ein-pi/agent/extensions/ein-ai.ts`
`tests/sdd-overlay-repaint.test.ts`
`ein-pi/agent/lib/runtime-session-adapters.ts`
`tests/runtime-session-adapters.test.ts`
`tests/runtime-session-resume.test.ts`
`ein-pi/agent/lib/terminal-app-controller.ts`
`tests/terminal-app-controller.test.ts`
`ein-pi/agent/surfaces/terminal-app-entrypoint.ts`
`tests/terminal-app-pty.test.ts`
`pi-ein/pi-ein.fish`
`tests/surface-wiring.test.ts`
`openspec/changes/bind-todo-to-session/tasks.md`
`openspec/changes/bind-todo-to-session/apply-progress.md`

## Deviations and residual risks

No design or production-semantics deviation. Bun and the injected discipline rules applied;
architecture constrained the regression fixes to test harnesses. Vitest and Nuxt-module APIs
were not applicable. Group 012 is complete with the exact contractual suite and root
typecheck green; the full repository suite was omitted only by explicit caller instruction.

## Verify remediation — Pi `appendEntry` contract declaration

Remediated only the diagnosed verify defect: `PI_EXTENSION_API` now declares the supported
`appendEntry` method in consistent sorted position. No tests, task checkboxes, or other
production semantics changed.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Every Pi extension API method used by Ein is declared and observable in the contract | Reused verify-owned failure: `bun test tests/pi-contract.test.ts` reported 17 pass, 1 fail; `appendEntry` was used but undeclared | After the one-line declaration patch, the focused file passed 18/18 with 44 assertions | The complete focused file passed again, covering both source-use scanning and fake installed-surface observation (18/18) | No cleanup was warranted beyond the sorted one-line declaration; final focused command remained 18/18 |

Final focused command association: every Pi extension API method used by Ein is declared
and observable in the contract → `bun test tests/pi-contract.test.ts` (18 pass, 0 fail).
Root gate: `bun run typecheck` passed (`tsc --noEmit`).

No deviation from the closed patch. Remaining apply tasks: none. Independent global gates
remain owned by `sdd-verify`; `status: complete` remains valid.
