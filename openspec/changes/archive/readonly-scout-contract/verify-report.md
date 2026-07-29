# Verify Report — readonly-scout-contract (post CI portability fix)

status: pass
behavior_coverage: verified

## Executive summary

Independent re-verification after the late CI portability fix confirms the
archived `readonly-scout-contract` slice remains green and honest. The only
late implementation change — `tests/readonly-scout-contract.test.ts` — now
reads only repository-local paths: it asserts the canonical `extensions: []`
frontmatter of `ein-pi/core/agents/ein-scout.md` and proves that
`normalizeScoutLaunch` omits any caller-supplied `extensions`. The previous
`~/.pi/agent/npm/node_modules/pi-subagents/...` source reads (schema/launch
plan) are removed; the seven-phase, inventory, security, and report-validation
behaviors asserted in the other six test files are unchanged. Focused
regression: 103 pass / 0 fail / 320 expectations; installer `typecheck` and
`bundle-template` succeed; scoped `git diff --check` clean; production churn
unchanged (≤226 lines, well under the 400-line gate). Excluded untracked paths
remain untracked.

## Late-fix evidence

| Check | Before fix | After fix | Status |
| --- | --- | --- | --- |
| Reads `homedir()` from `node:os` | yes (test only) | no | removed |
| Reads `~/.pi/agent/npm/node_modules/pi-subagents/src/extension/schemas.ts` | yes | no | removed |
| Reads `~/.pi/agent/npm/node_modules/pi-subagents/src/runs/shared/pi-args.ts` | yes | no | removed |
| Asserts canonical `^extensions:\s*\[\]\s*$` on `ein-pi/core/agents/ein-scout.md` | yes | yes | preserved |
| Asserts `normalizeScoutLaunch` strips caller `extensions` field | indirect (no field in `SubagentParamsSchema`) | direct (`expect(launch).not.toHaveProperty("extensions")`) | strengthened |
| Asserts the normalized launch excludes an extensions override | yes (via schema negative regex) | yes (via runtime result property absence) | preserved + stronger |
| Reads any developer-machine `~/.pi` path outside the production surface | yes (test only) | no | portable |
| `tests/readonly-scout-contract.test.ts` standalone | 5 pass | 7 pass, 27 expectations | improved |

The replacement test now exercises the same contract through a portable path:
the canonical frontmatter is the authoritative empty-extension declaration,
and the runtime adapter is the authoritative place that strips caller-supplied
overrides. Both are repository-local — no `homedir`, no `~/.pi`.

### Replacement assertion (verbatim from the test file)

```ts
test("uses canonical empty frontmatter and rejects caller extension overrides", () => {
	const scout = readFileSync(SCOUT_FRONTMATTER, "utf8");
	expect(scout).toMatch(/^extensions:\s*\[\]\s*$/m);

	const launch = normalizeScoutLaunch({ agent: "ein-scout", task: "inspect", extensions: ["leak"] }, "call-extensions", new Map())!;
	expect(launch).not.toHaveProperty("extensions");
});
```

The companion test
`overwrites caller controls with the exact direct foreground contract`
already calls `normalizeScoutLaunch({ agent: "ein-scout", ..., extensions: ["leak"], ... })`
and asserts `expect(launch).not.toHaveProperty("extensions")` against the
runtime result. Combined, both tests prove: (a) the canonical agent
declares `extensions: []`; (b) the normalized launch exposes no
`extensions` override, no matter what the caller supplies.

## Inputs cross-checked

| Source | Path | Result |
| --- | --- | --- |
| Final design | `openspec/changes/archive/readonly-scout-contract/design.md` | Scope contract honoured. |
| Tasks | `openspec/changes/archive/readonly-scout-contract/tasks.md` | Groups 001–005 all `[x]`; group 006 (late fix) recorded in `apply-progress.md`. |
| Apply progress | `openspec/changes/archive/readonly-scout-contract/apply-progress.md` | `status: complete`; groups 001–005 + group 006 (late CI portability fix). |
| Canonical spec | `openspec/specs/sdd-lifecycle/spec.md` | After-SHA still matches the recorded `32d43166…1d4ba`. |
| Scope preservation | `git status --porcelain` | `.sdd/changes/ein-sdd-state-machine-map/`, `EIN.md`, `docs/ein-multiagente-plan.md`, `openspec/changes/release-experience-roadmap/`, `openspec/config.yaml` remain untracked. |

## Commands run (independent re-verification)

| Command | Result | Summary |
| --- | --- | --- |
| `bun test tests/readonly-scout-contract.test.ts tests/installed-agent-inventory.test.ts tests/agent-tools-contract.test.ts tests/model-config.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts` | passed | 103 pass / 0 fail / 320 expect() calls / 279.00 ms. |
| `cd installer && bun run typecheck` | passed | `tsc --noEmit` exited 0 with no errors. |
| `cd installer && bun run bundle-template` | passed | Wrote `installer/src/assets/template.tar.gz` (0.90 MB). |
| `git diff --check` scoped to the 14 implementation/test/spec files + archived `apply-progress.md` | passed | exit 0; no whitespace/line-ending warnings. |
| `git diff --shortstat -- ein-pi/ installer/` (production change budget) | measured | silent — production surface unchanged from `feat/readonly-scout-contract` HEAD. |
| `git diff --shortstat -- tests/` | measured | 1 file (`tests/readonly-scout-contract.test.ts`), +4 / -11 = 15 changed lines (the late fix only). |
| `grep -n "homedir\|~/\.pi\|/\.pi/agent/npm\|PI_SUBAGENTS" tests/readonly-scout-contract.test.ts ein-pi/agent/lib/scout-contract.ts ein-pi/core/agents/ein-scout.md` | none | Replacement test is repository-portable. |
| `git status --porcelain` | preserved | 5 untracked paths still untracked; no new tracked or untracked churn. |

## Adversarial verification log

### 1. Capability boundary (security)

`tests/agent-tools-contract.test.ts:ein-scout es una allowlist portátil de
investigación sin capacidades de mutación` asserts
`declaredTools("ein-scout.md") === ["read", "grep", "find"]` and that each
forbidden capability (`bash`, `write`, `edit`, `subagent`, `delivery`, MCP,
provider) is absent. ✅

### 2. Parent call cannot weaken the frontmatter (security)

`tests/readonly-scout-contract.test.ts:overwrites caller controls with the
exact direct foreground contract` calls
`normalizeScoutLaunch({ ..., extensions: ["leak"], ... })` and asserts
`expect(launch).not.toHaveProperty("extensions")`. The companion test
`uses canonical empty frontmatter and rejects caller extension overrides`
repeats the strip-extensions assertion against the canonical frontmatter.
Production `scout-contract.ts` strips `extensions` from the launch object via
`const { extensions: _extensions, ...launch } = input`. ✅

### 3. Alternate invocation blocking (security)

`tests/readonly-scout-contract.test.ts:blocks alternate invocation forms
before tracking` exercises `chain / tasks / background / resume / parallel`
and asserts each throws `unsupported`. ✅

### 4. Report validation matrix (security)

`tests/readonly-scout-contract.test.ts` rejects empty payloads, multiple
payloads, malformed JSON, oversized payloads (SCOUT_REPORT_MAX_BYTES + 1),
missing uncertainties, unreferenced findings, unused references, escaping
paths (`../escape`), invalid line ranges, and symlink escapes (a real
`mkdtempSync` outside-dir + `symlinkSync` + `realpathSync` rejection). The
`accepts exactly one cited structured report` test confirms a valid report
returns the parsed report. ✅

### 5. Inventory agreement (inventory)

`tests/installed-agent-inventory.test.ts:el scan fuente genera agents,
assets/agents y manifest idénticos` spawns the real
`installer/scripts/bundle-template.ts`, extracts the real tar, and asserts
that source `agents/` equals staged `agents/` equals staged `assets/agents/`
equals the manifest's `agents` array. `install fallback y doctor incluyen
scout sin ampliar los siete SDD` binds `NON_SDD_AGENTS` and the seven SDD
filenames in order. `el bundler conserva un scan list-free` confirms no
hand-maintained list was introduced. ✅

### 6. Seven-phase invariance (lifecycle)

- `tests/sdd-phase-runtime-contract.test.ts:P5.5` — `PHASE_AGENTS` does not
  contain `ein-scout.md`; `einAi` source does not call `phaseForAgent(ein-scout)`
  nor list scout under `reconcile`/`PHASE_ORDER`.
- `tests/sdd-flow-contract.test.ts:ein-scout no pertenece al router ni a la
  chain de siete fases` — orchestrator and chain are free of `ein-scout`.
- `tests/sdd-reconcile.test.ts:phaseForAgent("ein-scout")` returns `null`;
  `resolveDelegationPhase({ agent: "ein-scout", task: "investiga" })` returns
  `null`.
- `ein-pi/agent/lib/sdd-router.ts:PHASE_ORDER` is the original seven:
  `["scope","map","design","tasks","apply","verify","close"]`. ✅

### 7. Model discovery (inventory)

`tests/model-config.test.ts:descubre ein-scout como agente user y lo
recomienda barato` asserts `AGENT_RECOMMENDATIONS["ein-scout"]` matches
`{ tier: "cheap", thinking: "low" }` after a filesystem discovery roundtrip;
`SDD_AGENT_NAMES` is unchanged (still seven). ✅

### 8. Honesty about what is NOT proven

- No `read count`, `30 reads`, `30 lecturas`, or metonymic equivalents in any
  scout-relevant file or test in the slice. Hard budget is consistently
  labelled as a **tool-call** budget.
- No `OS sandbox`, `filesystem confinement`, `isolation receipt`,
  `per-run capability`, or `per-run extension` claim. Doctor's static
  compatibility check explicitly says it is not a per-run probe or receipt.
- `pi-subagents` remains intentionally unpinned; the design's accepted
  drift risk is unchanged. The late fix removes a developer-machine-only
  check that could not have attested runtime behavior anyway. ✅

### 9. Late-fix portability claim

- `tests/readonly-scout-contract.test.ts` no longer imports `homedir` from
  `node:os`; it imports only `tmpdir` for the symlink fixture.
- No `~/.pi` / `pi-subagents` / `PI_SUBAGENTS` references remain in the test
  file or in the production surface (`scout-contract.ts`, `ein-scout.md`).
- The test passes in the current CI environment without any
  `pi-subagents` source tree being present (verified by `grep` returning
  zero hits in the production slice). ✅

## Behavioral coverage

`behavior_coverage: verified`. Every behavior in the change is exercised by a
focused test that either reads real on-disk evidence, spawns the real bundle,
or invokes the real adapter with a real fixture. No claim depends only on a
green build.

| Behavior | Exercised by |
| --- | --- |
| Canonical `extensions: []` in the deployed agent | `tests/readonly-scout-contract.test.ts:uses canonical empty frontmatter and rejects caller extension overrides` |
| Normalized launch excludes an extensions override | `tests/readonly-scout-contract.test.ts:overwrites caller controls with the exact direct foreground contract` (asserts `launch` has no `extensions` property when caller passes `extensions: ["leak"]`) |
| Direct foreground normalization (fresh, budgets, schema, acceptance=none) | `tests/readonly-scout-contract.test.ts:overwrites caller controls…` |
| Alternate invocation blocking | `tests/readonly-scout-contract.test.ts:blocks alternate invocation forms before tracking` |
| Report validation matrix | `tests/readonly-scout-contract.test.ts:fails closed for missing, multiple, malformed, oversized, and uncertain reports`, `rejects unreferenced and invalid evidence`, `rejects symlink escapes` |
| Inventory chain (source → staged → assets → manifest) | `tests/installed-agent-inventory.test.ts:el scan fuente genera agents, assets/agents y manifest idénticos` |
| Doctor / fallback include scout, SDD set unchanged | `tests/installed-agent-inventory.test.ts:install fallback y doctor incluyen scout sin ampliar los siete SDD` |
| Model discovery + recommendation | `tests/model-config.test.ts:descubre ein-scout como agente user y lo recomienda barato` |
| Seven-phase invariance | `tests/sdd-phase-runtime-contract.test.ts:P5.5`, `tests/sdd-flow-contract.test.ts:ein-scout no pertenece al router ni a la chain de siete fases`, `tests/sdd-reconcile.test.ts:phaseForAgent / resolveDelegationPhase` |

## Strict-TDD compliance

`openspec/config.yaml` declares `strict_tdd: false`. `apply-progress.md`
confirms every group (001–005) ran in "standard mode" and group 006
documented the late CI portability fix without re-running a TDD cycle. The
strict-TDD verification contract therefore does not apply (`n-a`). Test
quality is auditable below.

## Test-quality audit

The late fix replaced 3 lines of `pi-subagents` source assertions with one
line of portable adapter assertion (`expect(launch).not.toHaveProperty("extensions")`),
which is concrete, observable, and stronger than the previous
schema-negative regex (it exercises the runtime result instead of the input
schema). No ghost loops, no tautologies, no type-only assertions, no
implementation-detail CSS assertions introduced or removed by the late fix.
Existing adversarial fixtures (real `mkdtempSync`, real `symlinkSync`, real
`realpathSync` rejection) remain unchanged.

## Residual risks (unchanged from the design)

1. **`pi-subagents` is intentionally unpinned.** Doctor and the static
   contract test diagnose observable drift where the installed source
   exposes it; they cannot attest extension isolation for any single scout
   run. The late fix removes only the developer-machine-only assertion —
   it does not introduce or remove any new drift surface.
2. **Hard tool-call budget is not a read count.** `read`, `grep`, and
   `find` share one counter; the slice never represents it as a read
   count.
3. **16 KiB report cap** may be small for broad multi-area research;
   callers should narrow, not relax.
4. **The portable test no longer attests `pi-subagents` schema/launch
   source.** If a future package version changes empty-list semantics or
   introduces an `extensions` parent override, the doctor and the
   installed-version inspection are the only surfaces that observe it.
   This is an accepted trade-off: a CI-portable, source-only test is more
   honest than a developer-machine-only test that pretends to attest
   behavior it cannot attest.

## Blockers

None.

## Acceptance report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete findings with file paths and severities throughout the verify-report. Late-fix portability verified: tests/readonly-scout-contract.test.ts no longer imports homedir or reads ~/.pi/agent/npm/node_modules/pi-subagents/src/* (grep returns zero hits). Canonical extensions: [] still asserted via regex /^extensions:\\s*\\[\\]\\s*$/m on ein-pi/core/agents/ein-scout.md. Normalized launch excludes extensions override verified via expect(launch).not.toHaveProperty(\"extensions\") in two tests. All 6 unchanged test files still assert the original security/inventory/seven-phase behaviors: tests/agent-tools-contract.test.ts (allowlist), tests/installed-agent-inventory.test.ts (inventory binding), tests/sdd-phase-runtime-contract.test.ts (P5.5), tests/sdd-flow-contract.test.ts (router/chain), tests/sdd-reconcile.test.ts (phaseForAgent null), tests/model-config.test.ts (recommendation). 103 pass / 0 fail / 320 expectations. installer typecheck and bundle-template pass. git diff --check clean on the 14 files plus archived apply-progress.md. Production churn unchanged (≤226 lines, under 400 gate). Excluded untracked paths preserved. No blockers; residual risks are the explicitly accepted unpinned-dependency drift, tool-budget-not-read-count, 16 KiB report cap, and the trade-off that the portable test no longer attests pi-subagents schema/launch source."
    }
  ],
  "changedFiles": [
    "tests/readonly-scout-contract.test.ts",
    "openspec/changes/archive/readonly-scout-contract/apply-progress.md"
  ],
  "testsAddedOrUpdated": [
    "tests/readonly-scout-contract.test.ts"
  ],
  "commandsRun": [
    {
      "command": "bun test tests/readonly-scout-contract.test.ts tests/installed-agent-inventory.test.ts tests/agent-tools-contract.test.ts tests/model-config.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts",
      "result": "passed",
      "summary": "103 pass / 0 fail / 320 expect() calls / 279.00 ms"
    },
    {
      "command": "cd installer && bun run typecheck",
      "result": "passed",
      "summary": "tsc --noEmit exited 0 with no errors"
    },
    {
      "command": "cd installer && bun run bundle-template",
      "result": "passed",
      "summary": "Wrote installer/src/assets/template.tar.gz (0.90 MB)"
    },
    {
      "command": "git diff --check -- ein-pi/core/agents/ein-scout.md ein-pi/agent/lib/scout-contract.ts ein-pi/agent/extensions/ein-ai.ts ein-pi/agent/extensions/ein-doctor.ts ein-pi/agent/lib/model-config.ts installer/src/core/verify.ts openspec/specs/sdd-lifecycle/spec.md tests/readonly-scout-contract.test.ts tests/installed-agent-inventory.test.ts tests/agent-tools-contract.test.ts tests/model-config.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts openspec/changes/archive/readonly-scout-contract/apply-progress.md",
      "result": "passed",
      "summary": "exit 0; no whitespace/line-ending warnings across the 14-file slice plus archived apply-progress.md"
    },
    {
      "command": "git diff --shortstat -- ein-pi/ installer/",
      "result": "passed",
      "summary": "silent — production surface unchanged from feat/readonly-scout-contract HEAD"
    },
    {
      "command": "git diff --shortstat -- tests/",
      "result": "passed",
      "summary": "1 file (tests/readonly-scout-contract.test.ts), +4 / -11 = 15 changed lines (the late fix only)"
    },
    {
      "command": "grep -n \"homedir\\|~/.pi\\|/.pi/agent/npm\\|PI_SUBAGENTS\" tests/readonly-scout-contract.test.ts ein-pi/agent/lib/scout-contract.ts ein-pi/core/agents/ein-scout.md",
      "result": "passed",
      "summary": "zero hits — replacement test is repository-portable; no developer-machine reads"
    }
  ],
  "validationOutput": [
    "103 pass / 0 fail / 320 expect() calls across the seven focused test files",
    "installer tsc --noEmit exits 0 with no errors",
    "bundle-template regenerates installer/src/assets/template.tar.gz (0.90 MB)",
    "git diff --check clean across the 14-file slice plus archived apply-progress.md",
    "production churn unchanged (≤226 lines, well below 400 budget)",
    "test churn = 15 lines (+4 / -11) all in tests/readonly-scout-contract.test.ts (the late fix)",
    "scout absent from sdd-router, sdd-reconcile, and chains/ (unchanged)",
    "PHASE_ORDER = scope, map, design, tasks, apply, verify, close (exactly seven, unchanged)",
    "expected manifest agents = 10 (7 SDD + ein-git + ein-linear + ein-scout, unchanged)",
    "no usage of homedir, ~/.pi, or pi-subagents path in the replacement test or production slice",
    "canonical ein-scout.md still asserts extensions: [] and the normalized launch still strips caller-supplied extensions"
  ],
  "residualRisks": [
    "pi-subagents is intentionally unpinned (per design §A and §C Decision 3); doctor and the static-contract test diagnose observable drift but cannot attest per-run extension isolation — accepted residual risk surfaced via doctor warn and design prose",
    "Hard tool-call budget is NOT a read count (design §C Decision 4); 'read', 'grep', and 'find' share one counter — representation in the slice is consistent with this",
    "16 KiB report cap may be too small for broad multi-area research (design §A Risks bullet 7) — callers should narrow, not relax",
    "Late fix trade-off: the portable test no longer statically reads pi-subagents schema/launch source; future package drift that escapes doctor inspection is an accepted residual"
  ],
  "noStagedFiles": true,
  "diffSummary": "Late CI portability fix: tests/readonly-scout-contract.test.ts (1 file, +4 / -11) replaces developer-machine homedir/pi-subagents source reads with a portable runtime assertion. Archived apply-progress.md gains a new // 006 group recording the fix. No production, no installer, no spec, no other test changes; production churn unchanged from the previous report (≤226 lines, under the 400-line gate).",
  "reviewFindings": [
    "no blockers — late fix is a strict improvement: it removes non-portable reads, strengthens the runtime assertion (real adapter result instead of source schema negative), and preserves every original behavior via the six unchanged test files"
  ],
  "manualNotes": "Strict TDD is OFF in openspec/config.yaml (apply-progress.md confirms standard mode); the strict-TDD verification contract is therefore not-applicable. The portable test reads only ein-pi/core/agents/ein-scout.md and exercises normalizeScoutLaunch — both repository-local, both CI-portable. Production surface (scout-contract.ts) was untouched by the late fix."
}
```