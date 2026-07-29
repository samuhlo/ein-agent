# Verify Report — readonly-scout-contract

status: pass
behavior_coverage: verified

## Executive summary

Adversarial verification of the `readonly-scout-contract` SDD slice confirms that
the implementation matches the final revised `design.md`, `tasks.md`, and the
narrowed change-local `sdd-lifecycle` delta. Focused regression proves every
required attack case (oversized / malformed / multiple / unreferenced /
no-uncertainty / escaping / symlink) and accepts exactly one valid cited report.
Bundle/manifest/install/doctor/model agree on `ein-scout`; router/reconcile/chain
still hold exactly seven SDD phases with no scout membership, no architecture
authority, and no false read-count, OS-sandbox, semantic-truth, per-run
isolation, or per-run extension-probe claim. Production churn is 226 changed
lines (well under the 400-line review budget); 200 test-line insertions and the
spec delta (14 lines) are reported separately.

## Inputs cross-checked

| Source | Path | Result |
| --- | --- | --- |
| Final revised design | `openspec/changes/readonly-scout-contract/design.md` (27022 bytes) | Used as scope contract. |
| Tasks | `openspec/changes/readonly-scout-contract/tasks.md` (5 groups, all checked) | Confirmed every subtask of groups 001–005 reports `[x]`. |
| Apply progress | `openspec/changes/readonly-scout-contract/apply-progress.md` | Status `complete`; groups 001–005 finished; line counts recorded. |
| Change-local delta | `openspec/changes/readonly-scout-contract/specs/sdd-lifecycle/spec.md` | Two `## ADDED` scenarios (`readonly-scout-bounded-research-contract`, `readonly-scout-remains-outside-sdd-lifecycle`) excluding read/file/token bounds, semantic-truth validation, OS-sandbox claims, lifecycle membership, and scout architecture authority. |
| Sync report | `openspec/changes/readonly-scout-contract/sync-report.md` | `state: synchronized`, `conflicts: 0`, only `sdd-lifecycle`; `after` SHA = `32d43166…1d4ba`. |
| Canonical spec | `openspec/specs/sdd-lifecycle/spec.md` | After-SHA matches sync report (`sha256sum` confirmed). |
| Scope preservation | `git status` | `.sdd/changes/ein-sdd-state-machine-map/`, `EIN.md`, `docs/ein-multiagente-plan.md`, `openspec/changes/release-experience-roadmap/`, `openspec/config.yaml` remain untracked/unmodified. |

## Spec coverage

Both change-local scenarios land in the canonical spec:

1. `readonly-scout-bounded-research-contract` — hard tool-call budget
   `toolBudget: { hard: 30, soft: 24, block: "*" }`, wall-clock
   `maxRuntimeMs: 120000`, turn budget, 16384-byte cap, fail-closed report
   validation, and the explicit "static contract, not a per-run probe"
   boundary. **The narrower wording (no "enforced read bounds") is honoured
   verbatim** — the change-local scenario names "tool-call", "wall-clock",
   "turn", and "16384-byte" limits only.
2. `readonly-scout-remains-outside-sdd-lifecycle` — `ein-scout` is inventoried
   but `MUST NOT` enter phase order, routing, reconciliation, state, or
   chain; its reports remain advisory only.

Both scenarios are observable in `tests/readonly-scout-contract.test.ts`,
`tests/installed-agent-inventory.test.ts`, `tests/sdd-flow-contract.test.ts`,
`tests/sdd-phase-runtime-contract.test.ts`, `tests/sdd-reconcile.test.ts`, and
`tests/model-config.test.ts`.

## Task completion status

| Group | Scope | Status |
| --- | --- | --- |
| // 001 (1.1) | Scout frontmatter + 7-phase negative assertions | Tasks closed; 79 pass verified. |
| // 002 (2.1) | Scout-contract boundary, no extension injection, no per-run probe | Tasks closed; 13 pass verified; `extensions: []` call-input removal and `assertScoutRuntimeCapabilities` removal present. |
| // 003 (3.1) | Source-scan/manifest authoritative inventory, 7 SDD intact | Tasks closed; 50 pass verified; `bundle-template` and `typecheck` verified. |
| // 004 (4.1) | Lifecycle delta narrowing; no source change | Tasks closed; 81 pass verified; delta wording audited below. |
| // 005 (5.1) | Integrated regression; production budget | Tasks closed; 103 pass total verified; production line count measured. |

## Commands run (independent verification)

| Command | Result | Summary |
| --- | --- | --- |
| `bun test tests/readonly-scout-contract.test.ts tests/installed-agent-inventory.test.ts tests/agent-tools-contract.test.ts tests/model-config.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts` | passed | 103 pass / 0 fail / 322 expectations (293 ms). |
| `cd installer && bun run typecheck` | passed | `tsc --noEmit` exited 0 with no errors. |
| `cd installer && bun run bundle-template` | passed | Wrote `installer/src/assets/template.tar.gz` (0.90 MB); working tree returns to clean (`bundle output is byte-identical to the pre-apply bundle`). |
| `git diff --check` (scoped to change surface) | passed | No whitespace/line-ending warnings. |
| `git diff --shortstat -- . ':(exclude)*…'` (production change budget) | measured | 7 files, 220 insertions, 6 deletions = 226 changed lines (under 400). |
| `git diff --shortstat -- tests/` | measured | 7 files, 200 insertions (reported separately, not counted toward budget). |
| `git diff --shortstat -- openspec/specs/sdd-lifecycle/spec.md` | measured | 1 file, 14 insertions (reported separately). |
| `sha256sum openspec/specs/sdd-lifecycle/spec.md` | matches sync | `32d43166…1d4ba` matches the `after` SHA in `sync-report.md`. |
| Static inspection: scout tools/extensions | matches | `tools: read, grep, find`, `extensions: []`, `defaultContext: fresh`, `inheritProjectContext: false`, `inheritSkills: false`, `timeoutMs: 120000`, `turnBudget: { maxTurns: 12, graceTurns: 2 }`, `toolBudget: { hard: 30, soft: 24, block: "*" }`. |
| Static inspection: `pi-subagents` SubagentParamsSchema | matches | Schema (lines 239+ in installed `extension/schemas.ts`) has no top-level `extensions` field — confirmed by the test's `expect(params).not.toMatch(/^\s*extensions\s*:/m)`. |
| Static inspection: `pi-subagents` launch plan | matches | `runs/shared/pi-args.ts:175` contains `input.extensions !== undefined`; `:252` contains `args.push("--no-extensions")`. The doctor reports the same static compatibility check and explicitly warns "no es una sonda ni recibo por ejecución". |
| Bundle inspection (`tar -tzf`) | matches | `agents/ein-scout.md`, `assets/agents/ein-scout.md`, `chains/ein-sdd.chain.md`, and only that chain — exactly as the design required. |
| `grep -in "read count\|read-count\|30 reads" ein-pi/core/agents/ein-scout.md ein-pi/agent/lib/scout-contract.ts ein-pi/agent/extensions/ein-ai.ts ein-pi/agent/extensions/ein-doctor.ts ein-pi/agent/lib/model-config.ts installer/src/core/verify.ts tests/` | none | No false read-count claim anywhere in the slice (only metonymic "reads" expected). |
| `grep -in "os sandbox\|filesystem confinement\|isolation receipt\|per-run capability\|per-run extension\|per-run probe"` | none | No false proof claim. Acceptable mentions: doctor warning text and the test's negative constraint, both of which PRECISELY describe the static contract. |
| `grep -rin "ein-scout" ein-pi/agent/lib/sdd-router.ts ein-pi/agent/lib/sdd-reconcile.ts ein-pi/agent/chains/` | none | Scout absent from router, reconcile, and chain. |
| `grep -n "PHASE_ORDER" ein-pi/agent/lib/sdd-router.ts` | matches | `["scope","map","design","tasks","apply","verify","close"]` — exactly seven. |
| Chain `^## sdd-` headers | matches | `tests/sdd-flow-contract.test.ts` asserts `chain.match(/^## sdd-/gm)` length is 7. |
| `phaseForAgent("ein-scout")` assertion | matches | `tests/sdd-reconcile.test.ts:phaseForAgent` returns `null` for `ein-scout` (and for `ein-git`, arbitrary, etc.). |

## Adversarial verification log

### 1. Scout capability boundary

- Frontmatter matches the design exactly: `tools: read, grep, find`,
  `extensions: []`, defense-in-depth (`defaultContext: fresh`,
  `inheritProjectContext: false`, `inheritSkills: false`), and the runtime
  budgets declared (`timeoutMs: 120000`, `turnBudget`, `toolBudget`).
- Body instruction forbids bash / writes / subagent / provider / MCP /
  extensions / OpenSpec mutation, and is `tools`-only.
- Negative assertions in `tests/agent-tools-contract.test.ts` cover each
  forbidden capability (`bash`, `write`, `edit`, `subagent`, `delivery`,
  `MCP`, `provider`) and an undeclared-tool fall-through. ✅

### 2. Parent call cannot weaken the frontmatter

- `normalizeScoutLaunch` overwrites `context` → `fresh`; inserts the exact
  budgets and `outputSchema`; strips any caller-supplied `extensions` before
  returning. Test
  `overwrites caller controls with the exact direct foreground contract`
  asserts each of these (and the absence of `extensions` on the returned
  launch).
- `tests/readonly-scout-contract.test.ts` then `require`s the installed
  `SubagentParamsSchema` to have no `extensions` field at top level — the
  schema literally omits it, so callers cannot reach an extension override
  through the public tool surface.
- `tests/readonly-scout-contract.test.ts` requires `runs/shared/pi-args.ts`
  to push `--no-extensions` when `input.extensions !== undefined`. The
  installed runtime ships both lines. ✅

### 3. Nested / chain / parallel / background / resume blocked

- `unsupportedForm` rejects any of: `chain`, `steps`, `tasks`, `parallel`,
  `background`, `resume`, `continuation`, `parentToolCallId`, or
  `foreground: false`. Test
  `blocks alternate invocation forms before tracking` covers
  `chain / tasks / background / resume / parallel`; the test for `steps`
  and `continuation` is implicit (same `every` predicate), and
  `ein-scout` is rejected from `task` arrays (since `task` is a property
  of each item in `tasks`/`steps`/`chain`, those are blocked before the
  array body is parsed). ✅

### 4. Report validation matrix

Adversarial cases asserted in
`tests/readonly-scout-contract.test.ts`:

| Case | Expected | Verified |
| --- | --- | --- |
| Empty payloads | throw `missing structured report` | ✅ `fails closed for missing, multiple, malformed, oversized, and uncertain reports` covers `[]`. |
| Multiple payloads | throw `multiple structured reports` | ✅ same test asserts `["...", "..."]` throws. |
| Malformed JSON (`"{"`) | throw `malformed structured report` | ✅ same test. |
| Oversized UTF-8 (`SCOUT_REPORT_MAX_BYTES + 1`) | throw `report exceeds 16384 UTF-8 bytes` | ✅ same test. |
| Missing uncertainty list (`uncertainties: []`) | throw (schema invalid) | ✅ same test. |
| Finding with `referenceIds: []` | throw (schema invalid) | ✅ `rejects unreferenced and invalid evidence`. |
| Unused reference id (`R2` not cited) | throw `unreferenced reference` | ✅ same. |
| Path escape (`../escape`) | throw `invalid reference` | ✅ same. |
| Invalid line range (`endLine: 99` > file length) | throw `reference line range is invalid` | ✅ same. |
| Symlink escape (link to `outside/secret.txt` then cite as `escape.txt`) | throw (escape-fail) | ✅ `rejects symlink escapes`. The fixture creates a real tmp dir + symlink; the validator `realpathSync`es the candidate and rejects when `relative(rootReal, actual)` starts with `..`. |
| Valid cited report | returns the parsed report | ✅ `accepts exactly one cited structured report`. |

The path validator additionally rejects absolute paths, NUL bytes, empty /
`..` / `.` segments; the reference ID regex enforces `R[1-9][0-9]*`; the
JSON Schema enforces uniqueness and item bounds (1–8 ids, 1–12 findings,
1–24 references, 1–8 uncertainties). **No ghost loops, no tautologies,
no type-only assertions.** ✅

### 5. Inventory / bundle / install / doctor / model agreement

- `tests/installed-agent-inventory.test.ts` spawns the real
  `installer/scripts/bundle-template.ts`, extracts the bundled tar, and
  asserts that `source/ein-pi/core/agents` equals `staging/agents` equals
  `staging/assets/agents` equals the manifest's `agents` array. Manifest
  contents inspection confirmed: `["ein-git.md","ein-linear.md",
  "ein-scout.md","sdd-apply.md","sdd-close.md","sdd-design.md",
  "sdd-map.md","sdd-scope.md","sdd-tasks.md","sdd-verify.md"]` and
  `chains: ["ein-sdd.chain.md"]` — i.e., scout is shipped in both the
  live `agents/` and the `assets/agents/` snapshot.
- `installer/src/core/verify.ts` lists
  `NON_SDD_AGENTS = ["ein-linear.md", "ein-git.md", "ein-scout.md"]` and
  uses `manifest?.agents?.length ? manifest.agents` to bind to the
  manifest. Doctor checks `sdd-*.md` separately; `tests/installed-agent-inventory.test.ts`
  asserts the seven SDD filenames appear in order.
- `ein-pi/agent/extensions/ein-doctor.ts` adds three `ein-scout` checks
  (`tools`, `extensions`, and `static extension contract`) and treats
  `ein-scout.md` as a "read-only research agent" in the legacy fallback;
  the static contract check is intentionally a `warn` and labels itself
  "no es una sonda ni recibo por ejecución" — exactly the residual-risk
  wording the design required.
- `ein-pi/agent/lib/model-config.ts` adds `ein-scout` to
  `AGENT_RECOMMENDATIONS` (tier: cheap, thinking: low) without touching
  `SDD_AGENT_NAMES` (still seven). `tests/model-config.test.ts` runs a
  discovery roundtrip and asserts `source: "user"` plus the
  recommendation entry. ✅

### 6. Seven-phase invariance

- `tests/sdd-phase-runtime-contract.test.ts:PHASE_AGENTS` lists the seven
  SDD files; `tests/sdd-flow-contract.test.ts` asserts
  `chain.match(/^## sdd-/gm)` length is 7. Both pass.
- `tests/sdd-reconcile.test.ts:phaseForAgent("ein-scout")` returns `null`
  and `resolveDelegationPhase({ agent: "ein-scout" })` returns `null`.
- `ein-pi/agent/lib/sdd-router.ts:PHASE_ORDER` is unchanged
  `["scope","map","design","tasks","apply","verify","close"]`.
- `tests/sdd-phase-runtime-contract.test.ts:P5.5` proves scout cannot gain
  phase membership through `phaseForAgent(ein-scout)`,
  `reconcilePhaseFailure` or `PHASE_ORDER`.
- `tests/sdd-flow-contract.test.ts:ein-scout no pertenece al router ni a la
  chain de siete fases` asserts both the orchestrator and the chain file
  are free of `ein-scout`. ✅

### 7. Honesty about what is NOT proven

- The design explicitly says the install contract is *static*, not a
  per-run probe. The reviewer (this report) confirms: no source or test
  claims a per-run extension-isolation receipt; doctor phrases it as a
  WARN with the exact "no es una sonda ni recibo por ejecución"
  caption; design §A "Accepted dependency drift" stays resident in the
  reported risks.
- The text "30 reads" / "read count" / "30 lecturas" is absent from
  every scout-relevant file and test in the slice. The hard budget is
  consistently labelled as a **tool-call** budget
  (`toolBudget: { hard: 30, ... block: "*" }`).
- No source claims a sandbox or "filesystem confinement". All `sandbox`
  occurrences are about the runner's `.pi-subagents/` workdir or the
  unrelated `context-mode` package.
- No source claims semantic-truth validation. Findings have a
  `claim` field and a `supports` field per reference; the adapter
  validates structural integrity, not truth, and the report explicitly
  returns the report as advisory evidence (no decision / recommendation
  field in `SCOUT_REPORT_SCHEMA`). ✅

### 8. Synchronized lifecycle spec

- Sync report says `state: synchronized`, `conflicts: 0`, only the
  `sdd-lifecycle` domain operation is `added=2`, and lists the
  after-SHA `32d43166e65b622393f5dd0955e996dc2d29096eece911ee7f7833889d41d4ba`.
- `sha256sum openspec/specs/sdd-lifecycle/spec.md` returns exactly that
  hash. ✅

## Behavioral coverage

`behavior_coverage: verified` for every behavioral claim in the slice:

| Behavior in the change | Exercised by |
| --- | --- |
| Frontmatter shape and exact `tools` / `extensions` | `tests/agent-tools-contract.test.ts:ein-scout es una allowlist portátil…`, `tests/installed-agent-inventory.test.ts:install fallback y doctor incluyen scout…` |
| Direct-foreground normalization (fresh, budgets, schema, acceptance=none, no extension override) | `tests/readonly-scout-contract.test.ts:overwrites caller controls with the exact direct foreground contract` |
| Alternate invocation blocking | `tests/readonly-scout-contract.test.ts:blocks alternate invocation forms before tracking` |
| Canonical empty frontmatter + no parent extension override (static evidence) | `tests/readonly-scout-contract.test.ts:uses canonical empty frontmatter and no parent extension override path` |
| Schema + byte cap + reference ID resolution + uncertainty + unused reference | `tests/readonly-scout-contract.test.ts:fails closed for missing, multiple, malformed, oversized, and uncertain reports`, `rejects unreferenced and invalid evidence` |
| Symlink escape and missing-file escape | `tests/readonly-scout-contract.test.ts:rejects symlink escapes` (real `mkdtempSync` + `symlinkSync`) |
| Inventory chain (source → staged → assets → manifest) | `tests/installed-agent-inventory.test.ts:el scan fuente genera agents, assets/agents y manifest idénticos` (spawns real `bun run bundle-template`) |
| Doctor / fallback / model discovery include scout, SDD set unchanged | `tests/installed-agent-inventory.test.ts:install fallback y doctor incluyen scout…`, `tests/model-config.test.ts:descubre ein-scout como agente user y lo recomienda barato` |
| Seven-phase invariance / scout absence from router, reconcile, chain | `tests/sdd-phase-runtime-contract.test.ts:P5.5`, `tests/sdd-flow-contract.test.ts:ein-scout no pertenece al router ni a la chain de siete fases`, `tests/sdd-reconcile.test.ts:phaseForAgent / resolveDelegationPhase` |

No claim in the design depends only on a green build: every behavior
exercised above either spawns the real bundle, reads real `.pi/` installed
files, validates real on-disk evidence, or asserts a real production
artefact against the contract.

## Strict-TDD compliance

`openspec/config.yaml` declares `strict_tdd: false` and `apply-progress.md`
confirms every group was executed in "standard mode" (`strict_tdd:
false`). The strict-TDD verification contract from the executor prompt
does not apply to this slice; TDD-compliance is therefore `not-applicable`.
Test quality is, however, auditable below.

## Test-quality audit (assertion standard)

Spotted during the adversarial pass:

- **Schema/byte/reference tests** assert with concrete `toThrow`
  matchers against real error messages (e.g. `"missing structured
  report"`, `"multiple structured reports"`, `"malformed structured
  report"`, `"report exceeds 16384 UTF-8 bytes"`, `"unreferenced
  reference"`, `"invalid reference"`, `"reference line range is
  invalid"`). No string tautology, no implementation-detail CSS
  assertions.
- **Inventory test** spawns the real bundler, extracts the real tar,
  and compares three real directories plus the manifest. No smoke-only
  assertions.
- **Symlink test** creates a separate temp directory and a real
  symlink; the validator must `realpathSync` and reject the escape.
  No mock or stub.
- **Frontmatter assertion** (`tests/agent-tools-contract.test.ts`) reads
  the actual `ein-scout.md` and matches it against the design's exact
  declared budget strings.
- **P5.5 negative** matches the empty-frontmatter / no-extension /
  no-PHASE_ORDER pattern via positive-regex and negative-regex; not a
  type-only assertion.
- **Orchestrator table consistency test** cross-checks the orchestrator
  markdown table against the deployed frontmatter row-by-row.

No findings of ghost loops, type-only assertions, smoke-only, or
implementation-detail CSS in this slice.

## Residual risks (accepted by design, surfaced here for the user)

1. **`pi-subagents` is intentionally unpinned.** Doctor and the static
   contract test diagnose observable drift where the installed source
   exposes it; they cannot attest extension isolation for any single
   scout run. This is the same risk the design calls out in §A
   "Accepted package drift" and §C "Decision 3".
2. **Tool budget is not a read count.** `read`, `grep`, and `find`
   share one tool-call counter; the "30 reads" framing is not enforced
   and is not claimed.
3. **The 16 KiB report cap** can be too small for broad multi-area
   research; callers should request narrow research.
4. **Verification report precedence.** The contract slice is the only
   thing this PR touches; the broader seven-phase flow remains
   byte-for-byte behaviorally unchanged and was already covered by
   the upstream `release/v0.23.0` baseline.

## Blockers

None.

## Acceptance report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete findings listed with file paths and severities throughout the verify-report: 7-phase invariance ✓ (sdd-router.ts:152, sdd-reconcile.ts:45, tests/sdd-phase-runtime-contract.test.ts:183, tests/sdd-flow-contract.test.ts:60-65), inventory chain ✓ (installer/src/core/verify.ts:80, 204-219, tests/installed-agent-inventory.test.ts:53-69), report validation matrix ✓ (tests/readonly-scout-contract.test.ts:60-97, ein-pi/agent/lib/scout-contract.ts:71-108), no false claims ✓ (grep audits for 'read count', 'os sandbox', 'per-run isolation' all return zero hits in scout surface), production 226 lines under 400-budget ✓, sync SHA verified ✓. No blockers; residual risks are the explicitly accepted unpinned-dependency drift, tool-budget-not-read-count, and 16-KiB cap, all surfaced per the design."
    }
  ],
  "changedFiles": [
    "ein-pi/core/agents/ein-scout.md",
    "ein-pi/agent/lib/scout-contract.ts",
    "ein-pi/agent/extensions/ein-ai.ts",
    "ein-pi/agent/extensions/ein-doctor.ts",
    "ein-pi/agent/lib/model-config.ts",
    "installer/src/core/verify.ts",
    "openspec/specs/sdd-lifecycle/spec.md",
    "tests/readonly-scout-contract.test.ts",
    "tests/installed-agent-inventory.test.ts",
    "tests/agent-tools-contract.test.ts",
    "tests/model-config.test.ts",
    "tests/sdd-phase-runtime-contract.test.ts",
    "tests/sdd-flow-contract.test.ts",
    "tests/sdd-reconcile.test.ts"
  ],
  "testsAddedOrUpdated": [
    "tests/readonly-scout-contract.test.ts",
    "tests/installed-agent-inventory.test.ts",
    "tests/agent-tools-contract.test.ts",
    "tests/model-config.test.ts",
    "tests/sdd-phase-runtime-contract.test.ts",
    "tests/sdd-flow-contract.test.ts",
    "tests/sdd-reconcile.test.ts"
  ],
  "commandsRun": [
    {
      "command": "bun test tests/readonly-scout-contract.test.ts tests/installed-agent-inventory.test.ts tests/agent-tools-contract.test.ts tests/model-config.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts",
      "result": "passed",
      "summary": "103 pass / 0 fail / 322 expectations (293 ms)"
    },
    {
      "command": "cd installer && bun run typecheck",
      "result": "passed",
      "summary": "tsc --noEmit exited 0 with no errors"
    },
    {
      "command": "cd installer && bun run bundle-template",
      "result": "passed",
      "summary": "Wrote installer/src/assets/template.tar.gz (0.90 MB); working tree clean afterwards (byte-identical to pre-apply bundle)"
    },
    {
      "command": "git diff --check",
      "result": "passed",
      "summary": "No whitespace/line-ending warnings"
    },
    {
      "command": "git diff --shortstat -- . ':(exclude)*.test.*' ':(exclude)*.spec.*' ':(exclude)**/tests/**' ':(exclude)**/__tests__/**' ':(exclude)**/e2e/**' ':(exclude)*.snap' ':(exclude)*-lock.*' ':(exclude)dist/**' ':(exclude).output/**' ':(exclude).nuxt/**' ':(exclude)coverage/**' ':(exclude)*.min.*'",
      "result": "passed",
      "summary": "Production churn 220 insertions / 6 deletions = 226 changed lines (under 400-budget gate)"
    },
    {
      "command": "sha256sum openspec/specs/sdd-lifecycle/spec.md",
      "result": "passed",
      "summary": "32d43166…1d4ba — matches the `after` SHA in sync-report.md"
    }
  ],
  "validationOutput": [
    "103 pass / 0 fail / 322 expectations across the seven focused test files",
    "installer tsc --noEmit exits 0 with no errors",
    "bundle-template regenerates an identical template.tar.gz (working tree returns to clean)",
    "git diff --check clean across the contract slice",
    "production churn = 226 lines (< 400); tests = 200 lines (reported separately); docs/OpenSpec = 14 lines (reported separately)",
    "scout absent from sdd-router, sdd-reconcile, and chains/ (grep returns zero hits)",
    "PHASE_ORDER = scope, map, design, tasks, apply, verify, close (exactly seven)",
    "expected agents = 10 in template-manifest.json (7 SDD + ein-git + ein-linear + ein-scout)",
    "doctor text declares scout as read-only research agent AND warns explicitly that the static-extension-contract check is NOT a per-run probe or receipt",
    "no usage of 'read count', 'OS sandbox', 'isolation receipt', or 'per-run capability' anywhere in the scout surface"
  ],
  "residualRisks": [
    "pi-subagents is intentionally unpinned (per design §A and §C Decision 3); doctor and the static-contract test diagnose observable drift but cannot attest per-run extension isolation — accepted residual risk surfaced via doctor warn and design prose",
    "Hard tool-call budget is NOT a read count (design §C Decision 4); 'read', 'grep', and 'find' share one counter — representation in the slice is consistent with this",
    "16 KiB report cap may be too small for broad multi-area research (design §A 'Risks' bullet 7) — callers should narrow, not relax",
    "Verification report touches only the contract slice; broader seven-phase invariants are byte-for-byte behaviorally unchanged and were already covered by the upstream release/v0.23.0 baseline"
  ],
  "noStagedFiles": true,
  "diffSummary": "Adds canonical ein-scout.md + scout-contract.ts + 7 new/updated tests and integrates scout into installer verify, doctor, model recommendations, and openspec lifecycle spec (2 new scenarios). 7 modified production files (74 ins / 6 del = 80 changes) + 2 new production files (146 ins) = 220 ins / 6 del / 226 changed production lines; 7 test files modified/added (200 ins); 1 spec delta (14 ins).",
  "reviewFindings": [
    "no blockers — all 6 adversarial checks pass: (a) capability boundary, (b) parent cannot weaken, (c) alternate-form blocking, (d) report validation matrix, (e) inventory agreement, (f) seven-phase invariance + honesty about what is NOT proven (no read-count, no OS sandbox, no per-run isolation receipt)"
  ],
  "manualNotes": "Strict TDD is OFF in openspec/config.yaml (apply-progress.md confirms standard mode); the strict-TDD contract is therefore not-applicable and the assertion-quality audit above substitutes for it. The bundled template.tar.gz is byte-identical to the pre-apply bundle because the contract is fully reproducible."
}
```
