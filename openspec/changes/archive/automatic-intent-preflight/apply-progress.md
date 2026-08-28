status: complete

# Apply progress — automatic-intent-preflight

## // 001. Core puro de decisión de intención

Completed tasks: 1.1, 1.2, 1.3.

Implemented a pure, I/O-free intent decision contract with stable reason codes, canonical material normalization and deterministic SHA-256 keys. Added fail-closed activation/classification, declared-lane precedence, protected bypass evaluation, and declarative normal/small interaction plans.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Equivalent intent facts produce one canonical material key | `bun test tests/sdd-intent-preflight.test.ts --test-name-pattern 'material\|canonical\|key'` → failed: module absent | Same command → 4 passed | Added independent objective, boundary, and completion changes plus empty-slot counterexamples | Replaced locale-sensitive sorting with lexical canonical ordering; final same command → 4 passed |
| Only positively proven small work takes the small route | `bun test tests/sdd-intent-preflight.test.ts --test-name-pattern 'classif\|lane\|bypass\|read-only'` → failed: module absent | Same command → 6 passed | Added unknown documentation evidence and protected-risk/bypass counterexamples | Narrowed protected reason type after typecheck feedback; final same command → 6 passed |
| Normal asks at most three decisions and small emits one restatement | `bun test tests/sdd-intent-preflight.test.ts --test-name-pattern 'question\|third\|small\|restatement'` → failed: module absent | Same command → 4 passed | Added non-material third-decision counterexample alongside defaulted decision | Kept plans as immutable declarative data; final same command → 4 passed |

### Verification

- `bun test tests/sdd-intent-preflight.test.ts` → 12 passed, 0 failed.
- `bun run typecheck` → passed after narrowing the protected reason union.
- `git diff --check -- ein-pi/agent/lib/sdd-intent-preflight.ts tests/sdd-intent-preflight.test.ts` → passed.

## // 002. Persistencia compatible y procedencia del lane

Completed tasks: 2.1, 2.2.

Extended the existing `preflight.json` codec with an optional version-1 intent branch covering confirmed, automatic-small, and bypassed resolutions. Intent validation is independent: malformed, unknown, partial, and future intent is omitted while valid historical TDD metadata survives unchanged.

Added lane inspection evidence without changing `SddLane`, `lane.json`, or `LANE_PHASES`. A valid matching classified intent exposes classified provenance; any existing legacy, mismatched, or corrupt lane file remains an authoritative declaration, while absent state stays unknown/default.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Historical TDD survives optional versioned intent decoding | Focused record command failed because intent was not serialized or decoded | Same command passed round-trips and fail-closed branch cases | Added unknown author/origin, empty material fields, invalid key/date, and future-version counterexamples | Consolidated validation into an isolated decoder; final `bun test tests/sdd-preflight-record.test.ts --test-name-pattern 'legacy\|intent\|partial\|future\|round-trip'` → 6 passed |
| Lane provenance preserves declarations over classification | Combined focused command failed on missing inspection/provenance APIs | Same command passed matching classified and corrupt/mismatched declaration cases | Added absent lane, explicit declaration, and immutable phase-list counterexamples | Kept provenance out of lane schema and derived it from inspection plus intent; final `bun test tests/sdd-lane.test.ts tests/sdd-preflight-record.test.ts --test-name-pattern 'declared\|classified\|corrupt\|phase'` → 3 passed |

### Verification

- `bun test tests/sdd-preflight-record.test.ts tests/sdd-lane.test.ts` → 35 passed, 0 failed.
- `bun run typecheck` → passed.
- Scoped `git diff --check` → passed.

## // 003. Flujo propietario de preflight por cambio

Completed tasks: 3.1, 3.2, 3.3.

Added the sole intent owner operation in `sdd-preflight.ts`: it rereads before writing, adopts concurrent resolutions, preserves valid TDD, materializes only classified lanes, and never persists pending normal intent or invents missing TDD. Added inherited material-slot patching, canonical-key reuse/reopen, and per-session/change in-flight deduplication.

Replaced per-change TDD/lane selectors with normal, small, and protected-bypass outcomes. Normal exposes two base questions plus at most one material third and requires final confirmation; small emits one non-question line; session execution/memory preferences and technical TDD defaults remain separate.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Closed intent is persisted once while pending/competing state is adopted safely | Owner exports were absent, so focused tests failed at module load | Implemented owner persistence and focused cases passed | Added missing-TDD, corrupt/declared lane, protected bypass, and classified-lane update counterexamples | Centralized lane authority in the owner; final `bun test tests/sdd-preflight-per-change.test.ts --test-name-pattern 'persist\|reread\|adopt\|pending\|lane'` → 9 passed |
| Equivalent material reuses while changed or uncertain material reopens | Material patch/owner exports were absent | Added inherited patching and material-key comparison | Added objective, criterion, explicit boundary removal, uncertain equivalence, classified-lane transition, and concurrent calls | Kept canonicalization in the existing pure core; final `bun test tests/sdd-preflight-per-change.test.ts --test-name-pattern 'reuse\|material\|paraphrase\|reopen\|in-flight'` → 8 passed |
| Normal, small, bypass, and TDD-default flows replace technical selectors | Existing TDD/lane selector test failed | Removed per-change selectors and implemented route outcomes | Added material third question, protected bypass, one-line small, and no-selector TDD default cases | Separated compatibility stance projection from intent interaction; final `bun test tests/sdd-preflight-per-change.test.ts tests/sdd-preflight-tdd-gate.test.ts --test-name-pattern 'normal\|small\|confirm\|third\|bypass\|TDD'` → 16 passed |

### Verification

- `bun run typecheck` → passed.
- Focused files: 24 tests passed, 0 failed.
- Scoped `git diff --check` → passed.

No adapter, coordinator policy, router, or Claude wiring was changed in this group.

## // 004. Activación única y continuidad del adapter Pi

Completed task: 4.1.

Wired Pi input to the shared intent owner. Unambiguous reads bypass; uncertain modifications fail closed; bounded text may resolve small or safe bypass. Normal interaction is emitted as one plain-text turn plus explicit confirmation. Pending input is handled before agent construction, while `before_agent_start` only injects a blocker and `tool_call` permits read-only evidence tools only.

Resolved/adopted flows return through `resolveSddNext` and `sddNextHandoff`. Explicit SDD startup retains create-if-absent OpenSpec bootstrap; `sdd-init` now bootstraps without opening a secondary preflight interaction.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Only input initiates intent while secondary hooks block | Focused // 004 command → 5 failed on absent owner/gates | Same command → 80 passed | Added read-only, uncertain, small, safe/protected bypass cases | Replaced modal draft with plain-text state flow; final focused command → 83 passed |
| Resolved intent resumes through the existing router | RED lacked `continueAfterPiIntent` | GREEN asserted `resolveSddNext` + `sddNextHandoff` | Covered confirmed, small, and bypass owner outcomes | Final `bun test tests/sdd-preflight-per-change.test.ts tests/sdd-flow-contract.test.ts tests/sdd-next-dispatcher.test.ts tests/sdd-config-bootstrap.test.ts` → 83 passed |
| Bootstrap preserves existing OpenSpec config without another interaction | RED found `sdd-init` still invoking `ensureSddPreflight` | GREEN removed that secondary interaction | Both Pi entry surfaces use the shared create-if-absent bootstrap; byte-preservation regression remains green | Final focused command above → 83 passed |

### Verification

- `bun run typecheck` → passed.
- Scoped `git diff --check` → passed.
- No router, phase sequence, verify, close, delivery, or Claude adapter code changed.
- Residual: pre-name resolutions remain session-local; secondary hooks reattempt durable adoption once an active change and valid preflight record exist.

## // 005. Adapter Claude CLI y paridad entre runtimes

Completed tasks: 5.1, 5.2.

Converted the Claude preflight surface into a thin call to `resolveSddIntentPreflight`, always setting only Claude authorship while leaving classification, adoption, materiality, serialization, and intent writes to the shared owner. Legacy `--tdd`, `--lane`, and `--force` behavior remains available through a minimal shared stance-write seam.

Explicit `--lane` now records declared authority even when its value matches a previously classified lane. The owner rereads before writes, preserves valid TDD and legacy records, and retains intent `resolvedBy`, material key, and resolution metadata. Runtime parity tests prove both Pi→Claude and Claude→Pi adoption without rewriting authorship or asking again.

Corrective 5.2 wiring now makes the documented public preflight dispatch await the single Claude intent entry before the compatibility stance query/write. Structured stdin can carry resolved Claude evidence; empty-input probes adopt existing records or fail closed as normal pending. The shared entry renders normal/automatic-small outcomes and covers safe bypass, while subsequent legacy flags retain declared-lane and TDD authority.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Claude delegates intent resolution and adopts Pi handoffs | Focused // 005 command failed because `runClaudeIntentPreflight` was absent | Shared-owner adapter implemented; both handoff directions passed | Added reverse Claude→Pi adoption and retained-author assertions | Kept the adapter structural and headless; final `bun test tests/claude-change-stance.test.ts tests/sdd-intent-runtime-parity.test.ts` → 15 passed |
| Explicit Claude lane declarations preserve stance and intent provenance | RED failed on the missing shared stance writer seam | CLI stopped importing the record writer and explicit lanes became declared | Added matching-classified-lane and byte-stable legacy Pi record counterexamples | Consolidated TDD/lane writes in one owner operation; final focused command above → 15 passed |
| Public Claude preflight enters intent before stance compatibility | `bun test tests/claude-change-stance.test.ts tests/sdd-intent-runtime-parity.test.ts` → failed: public orchestrator export absent | Public dispatch awaited `runClaudeIntentPreflight` before `runPreflightCommand`; focused command passed | Added pending-normal, automatic-small, safe-bypass, and subsequent explicit-lane cases | Extracted one public orchestrator without duplicating classification or persistence; final same command → 18 passed |

### Verification

- `bun test tests/claude-change-stance.test.ts tests/sdd-intent-runtime-parity.test.ts` → 18 passed, 0 failed.
- `bun run typecheck` → passed.
- Scoped `git diff --check` → passed.
- No coordinator policy or generated Claude surface changed; those remain in group // 006.

## // 006. Política coordinadora, evidencia y verificación final

Completed tasks: 6.1, 6.2, 6.3.

Published the automatic intent preflight once in shared coordinator policy: bounded activation, stored-resolution adoption, declared-lane precedence, normal/small/bypass interaction limits, explicit confirmation, writer ownership, and return to the existing router. Replaced Claude's standing TDD/lane questionnaire with a runtime-specific single invocation and regenerated `ein-cc/CLAUDE.md` through `compileClaudeSurface`.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Both coordinators publish one automatic preflight without invoking the human-only intent channel | `bun test tests/core-parity-coordinator.test.ts tests/claude-change-stance.test.ts tests/sdd-intent-runtime-parity.test.ts` → 2 policy/parity failures, 31 passed | Same command after source and generated-surface changes → 33 passed | Added source-boundary, generated-count, stored-adoption, old-questionnaire absence, and `/ein:intent` separation assertions | No further refactor was warranted; final same command → 33 passed |
| Planning preflight consumes persisted/default TDD without a selector or gate re-ask | Verification RED: `bun test tests/sdd-planning-acceptance.test.ts` → 10 passed, 2 legacy expectation failures | Updated names, fixtures, and exact assertions; command → 11 passed, 1 triangulation failure (`ask` projects to `auto`) | Corrected the persisted legacy-mode expectation while retaining zero-question assertions before and after both gates | Final `bun test tests/sdd-planning-acceptance.test.ts` → 12 passed, 0 failed |

### Delta and canonical audit

- `intent-confirmation-persistence-routing`: owner/reuse/router evidence is in // 003; // 006 publishes confirmation, `preflight.json`, writer, and router ownership.
- `intent-explicit-bypass-risk-boundary`: protected bypass cases passed in // 003; shared policy preserves normal for protected or unknown risk.
- `intent-lane-precedence-and-classification`: classification/provenance evidence is in // 001–003; policy preserves declared-lane authority and fail-closed normal fallback.
- `intent-normal-adaptive-questions`: // 003 proves two base questions, optional material third, and no TDD selector; coordinator parity now enforces that surface.
- `intent-small-restatement-continues`: // 003 proves one non-question line and router continuation; coordinator parity now publishes it once.
- Canonical `explicit-sdd-startup-bootstraps-config-and-enters-scope` remains unchanged: // 004's focused bootstrap/flow command passed 83 tests, and // 006 changes no canonical spec, bootstrap, phase, verify, delivery, or router code.

### Verification

- Focused // 006 command → 33 passed, 0 failed.
- Corrective 6.3 command → 12 passed, 0 failed.
- `bun run typecheck` → passed.
- Scoped `git diff --check` → passed.
- TDD stance source: `preflight.json` declares `strict`; the config default was not used to invent it.
- Skills applied: `ein-discipline` and `intent-channel`; `nuxt-ui`, `readme-style`, and `skill-registry` were inapplicable because this slice changes no UI, README, or skill inventory.

## Files changed

`ein-pi/agent/lib/sdd-intent-preflight.ts`
`tests/sdd-intent-preflight.test.ts`
`ein-pi/agent/lib/sdd-preflight-record.ts`
`tests/sdd-preflight-record.test.ts`
`ein-pi/agent/lib/sdd-lane.ts`
`tests/sdd-lane.test.ts`
`ein-pi/agent/lib/sdd-preflight.ts`
`tests/sdd-preflight-per-change.test.ts`
`tests/sdd-preflight-tdd-gate.test.ts`
`ein-pi/agent/extensions/ein-ai.ts`
`ein-pi/agent/extensions/sdd-init.ts`
`tests/sdd-flow-contract.test.ts`
`tests/sdd-next-dispatcher.test.ts`
`tests/sdd-config-bootstrap.test.ts`
`ein-cc/sdd-cli/cli.ts`
`tests/claude-change-stance.test.ts`
`tests/sdd-intent-runtime-parity.test.ts`
`ein-pi/core/AGENTS.md`
`ein-cc/CLAUDE.adapter.md`
`ein-cc/CLAUDE.md`
`tests/core-parity-coordinator.test.ts`
`tests/sdd-planning-acceptance.test.ts`
`openspec/changes/automatic-intent-preflight/tasks.md`
`openspec/changes/automatic-intent-preflight/apply-progress.md`

## Deviations and remaining work

No design deviation across apply groups. All apply-owned tasks are complete; the focused matrix, full suite, both final typechecks, fresh diff check, review forecast, and delivery remain owned by `sdd-verify` or later phases.
