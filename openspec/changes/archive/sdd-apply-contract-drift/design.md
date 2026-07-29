# Design: align the `sdd-apply` acceptance contract

## A. Proposal

### Intent

Align the written `sdd-apply` prompt with the runtime's existing `acceptance: none` default. Normal apply work will not require an acceptance report, while an explicit `acceptance: verified` override remains evidence-bearing and `sdd-verify` remains the independent final behavioral and freshness gate.

### Scope

**In scope**

- Replace the contradictory unconditional acceptance language in the apply prompt with separate default-`none` and explicit-`verified` contracts.
- Tighten the focused prompt contract test so drift between those two modes is detected.
- Validate the existing runtime injection, orchestration guidance, and adjacent planning/build-hygiene contracts without changing them.

**Out of scope / non-goals**

- Runtime injection or normalization changes.
- Changes to `sdd-verify`, close freshness, candidate-receipt freshness, apply execution, model selection/thinking, turn budgets, or phase ownership.
- New dependencies, test infrastructure, acceptance levels, report formats, or broad documentation cleanup.
- Changes to the orchestrator unless a concrete contradiction is discovered during apply; the map found its current semantics correct.

### Affected areas

The minimal candidate edit set from `map.md` is:

| File | Intended change |
|---|---|
| `ein-pi/core/agents/sdd-apply.md` | Make `acceptance: none` the normal written contract, remove the general acceptance-report obligation for that mode, and retain fresh evidence/report requirements only for explicit `verified`. |
| `tests/sdd-phase-runtime-contract.test.ts` | Replace the broad acceptance-report fragment assertion with mode-specific contract assertions and retained `sdd-verify` authority. |

Preserved non-regression surfaces are `ein-pi/agent/lib/sdd-preflight.ts`, `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/assets/orchestrator.md`, `tests/sdd-cost-block-e.test.ts`, `tests/sdd-planning-acceptance.test.ts`, and `tests/subagent-build-hygiene.test.ts`.

### Canonical specification context

The design reuses the sole canonical reference selected by scope; no mapped domain additions are needed.

| Domain | Path | SHA-256 | Bytes |
|---|---|---|---:|
| `sdd-lifecycle` | `openspec/specs/sdd-lifecycle/spec.md` | `ba81a1c1e07334514cb089246b81458071d5fc13ddf9e5818b881b21b3297559` | 24622 |

Selection total: 1 file and 24,622 UTF-8 bytes, within the 3-file / 32 KiB limit. The change-local delta at `openspec/changes/sdd-apply-contract-drift/specs/sdd-lifecycle/spec.md` defines the two acceptance-mode scenarios refined below.

### Risks

- Removing acceptance-report language too broadly could erase the evidence obligation for explicit `verified` runs.
- Weak fragment assertions could pass while the prompt again implies that `verified` is normal.
- Wording that treats apply acceptance as final verification could weaken the independent `sdd-verify` and close-freshness boundaries.
- Over-editing already-correct runtime or orchestrator code could introduce behavior outside this correction.

### Rollback

Revert the two candidate-file edits. No runtime state, migration, dependency, or data rollback is required; the existing runtime default remains unchanged throughout.

### Success criteria

The apply prompt, runtime contract tests, and orchestrator guidance agree that `none` is the default; no report is required or claimed for that mode; explicit `verified` requires fresh check execution and honest evidence; and independent fresh `sdd-verify` remains mandatory before close.

## B. Spec

### Requirement 1: default apply acceptance

The system **MUST** inject `acceptance: none` for a direct `sdd-apply` delegation that omits acceptance, **MUST** preserve an explicitly supplied acceptance value, and **MUST NOT** require or claim an `acceptance-report` when the effective level is `none`.

**Scenario: normal apply uses no acceptance report**

- **Given** normal or mechanical apply work is delegated without an explicit acceptance override,
- **When** the runtime handoff and apply completion contract are evaluated,
- **Then** the effective acceptance level is `none`, completion does not require or claim an acceptance report, and apply reports only its ordinary phase artifacts and envelope.

### Requirement 2: verified remains exceptional and evidence-bearing

The system **MUST** treat `acceptance: verified` as an explicit exceptional override. For that mode, the runner **MUST** freshly re-execute the declared verification commands, and apply **MUST** provide honest evidence in the acceptance report and **MUST NOT** bypass or weaken failing checks.

**Scenario: explicit verified override requires evidence**

- **Given** an apply delegation explicitly selects `acceptance: verified` and declares verification commands,
- **When** apply completion is assessed,
- **Then** the runner re-executes those commands, the run records the required acceptance evidence, and a failing command results in rejection or an honest blocked outcome rather than a fabricated success.

### Requirement 3: verify retains lifecycle authority

The system **MUST** keep `sdd-verify` as the independent final behavioral gate and freshness authority after apply, regardless of whether apply used `none` or explicit `verified`. Apply acceptance **MUST NOT** replace, merge with, or bypass fresh verification and the close guard.

**Scenario: apply completion still proceeds to independent verify**

- **Given** apply has completed under either supported acceptance mode,
- **When** the SDD lifecycle determines the next behavioral gate and later close readiness,
- **Then** `sdd-verify` independently runs the required checks, and close remains blocked without fresh passing verify evidence.

### Requirement 4: focused drift protection

Focused contract tests **MUST** distinguish the default `none` path from the explicit `verified` path, **MUST** retain coverage that runtime injection does not overwrite an explicit override, and **MUST** assert `sdd-verify` ownership without broadening into unrelated lifecycle behavior.

**Scenario: contradictory prompt wording is rejected**

- **Given** the runtime injector, apply prompt, and orchestrator define the acceptance handoff,
- **When** the focused contract tests run,
- **Then** they fail if the prompt again makes `verified` or an acceptance report universal, if the runtime stops preserving explicit `verified`, or if the written flow stops identifying `sdd-verify` as the independent gate.

## C. Decisions

### 1. Correct documentation and regression coverage, not runtime behavior

`ensureApplyAcceptance()` already injects `level: "none"` only for a direct `sdd-apply` delegation with no explicit acceptance and preserves explicit overrides. The `tool_call` hook already invokes it before dispatch. The defect is therefore contract drift in `sdd-apply.md`, not a normalization bug.

**Trade-off:** leaving runtime code untouched minimizes blast radius; its behavior remains protected by the existing E1 tests rather than duplicate implementation changes.

### 2. Express two explicit modes in the apply prompt

The acceptance section will lead with the normal `none` path and state that it carries no acceptance-report obligation. A separate conditional branch will retain runner re-execution, evidence/report, and honest-failure rules for explicit `verified`.

**Boundary:** the apply prompt owns executor obligations for each received mode; the runner owns re-execution for `verified`; `sdd-verify` owns final behavioral verification and freshness.

### 3. Strengthen the existing prompt contract test

`tests/sdd-phase-runtime-contract.test.ts` will assert mode-specific semantics rather than merely checking that the words `acceptance-report` appear. `tests/sdd-cost-block-e.test.ts` remains the direct executable regression for default injection and explicit-value preservation.

**Trade-off:** this avoids a new test file or shared abstraction for two prompt checks. Assertions should target the acceptance section's stable semantic markers, not reproduce whole paragraphs.

### 4. Preserve already-correct orchestration guidance

The orchestrator already documents default `none`, exceptional `verified`, and dedicated `sdd-verify` ownership. It is a validation surface, not a candidate edit.

### Alternatives rejected

- **Change runtime normalization:** rejected because it already implements the requested behavior.
- **Remove all acceptance-report references:** rejected because explicit `verified` still requires evidence.
- **Make apply acceptance the final gate:** rejected because it violates lifecycle separation and freshness authority.
- **Add a shared schema/helper or dependency:** rejected as unnecessary for a prompt-and-contract correction.
- **Broaden documentation cleanup or update adjacent tests:** rejected because the map found no semantic contradiction there.

## D. Success Criteria

Acceptance requires all of the following observable checks:

- `ein-pi/core/agents/sdd-apply.md` identifies omitted acceptance as runtime-defaulted to `none` and does not instruct a `none` run to emit an acceptance report.
- The same prompt makes `verified` conditional on an explicit override and retains fresh runner re-execution, evidence/report, and no-gaming/blocked-on-failure behavior for that mode.
- `tests/sdd-phase-runtime-contract.test.ts` fails for either drift direction: a universal report/verified obligation or loss of the exceptional verified evidence contract.
- Existing runtime coverage confirms that omitted apply acceptance becomes `none`, while explicit `verified` is not overwritten.
- Existing orchestration coverage continues to identify `sdd-verify` as the independent runtime gate; planning acceptance and build-hygiene behavior remain unchanged.
- No production/runtime, model-routing, dependency, verify, close, scope, map, or delta file is modified.
- The focused verification command passes:

```bash
bun test tests/sdd-phase-runtime-contract.test.ts tests/sdd-planning-acceptance.test.ts tests/subagent-build-hygiene.test.ts tests/sdd-cost-block-e.test.ts
```

No test suite or build is run during design; execution evidence belongs to apply and verify.
