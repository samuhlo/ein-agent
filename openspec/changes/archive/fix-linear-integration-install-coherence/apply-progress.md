status: complete

# Apply progress — fix-linear-integration-install-coherence

## // 001. Contrato fundacional de estado Linear

Completed tasks: 1.1, 1.2, 1.3.

The canonical module now resolves the global authority from an explicit installer `agentDir`, then `EIN_PI_AGENT_HOME`, then `PI_CODING_AGENT_DIR`, retaining the legacy home fallback. Read and inspection APIs accept the same explicit authority. Malformed JSON is preserved as invalid evidence, I/O failure as unreadable, and an explicit invalid `linear` key cannot silently fall back to legacy `mode`.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Global Linear authority follows explicit and isolated agent homes | Focused test failed on explicit path and both environment homes | Optional `agentDir` plus ordered isolated-home resolution passed | Explicit and both environment paths remain distinct | No further abstraction added; `bun test tests/linear-integration.test.ts` passed 18/18 |
| Operational compatibility and fail-closed inspection preserve distinct evidence | Focused test exposed malformed JSON as unreadable and unreadable-global setup failure before production support | Inspection separates parse-invalid from read-unreadable while resolver remains tolerant | Unknown `linear` with valid legacy `mode` produced a second RED, then passed after enforcing key priority | Kept one parser authority; `bun test tests/linear-integration.test.ts` passed 18/18 |

Verification:
- `bun test tests/linear-integration.test.ts` — pass, 18 tests.
- `bun run typecheck` — pass.

Deviations from design: none.

Remaining tasks: groups // 004 through // 009.

## // 002. Persistencia canónica y entrada de archive en deploy

Completed tasks: 2.1, 2.2, 2.3.

Deploy now accepts the canonical Linear selection and writes it through the shared global path authority for the effective `agentDir`. Its archive input is selectable while embedded production calls and staged fixtures continue through one extraction, templating, merge, persistence, and cleanup pipeline. The legacy `skipLinear` caller remains compatible until the CLI boundary migrates in group // 004.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Staged deploy persists its injected `off/on` selection and payload | Parametrized staged deployments received `{ mode: "team" }` instead of exact `{ linear }` | Deploy accepted canonical selection plus archive input; exact state and fixture-only binary passed through the single pipeline | Distinct `off` and `on` cases both proved state and archive provenance | Kept one path resolver and one deploy path; `bun test tests/installed-agent-inventory.test.ts` passed 5/5 |

Verification:
- `bun test tests/installed-agent-inventory.test.ts tests/linear-integration.test.ts` — pass, 23 tests.
- `bun test tests/installed-agent-inventory.test.ts` — pass, 5 tests.
- `cd installer && bun run typecheck` — pass.

Deviations from design: none.

Remaining tasks: groups // 004 through // 009.

## // 003. Texto contractual del plan de instalación

Completed tasks: 3.1, 3.2.

The existing `skipLinear` flag remains an internal plan input, while the observable deploy reason now reports `Linear integration off/on`. Rendered and serialized plans no longer expose `solo/team` or the internal flag name.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Install plans expose canonical Linear integration vocabulary | New focused assertions received `solo mode` instead of `Linear integration off` | The deploy reason translates the existing boolean once to `off/on` | Both boolean values assert distinct canonical reasons and reject `solo/team` in rendered and serialized output | No schema or flag refactor added; `bun test tests/install-plan.test.ts` passed 15/15 |

Verification:
- `bun test tests/install-plan.test.ts` — pass, 15 tests.
- `cd installer && bun run typecheck` — pass.

Deviations from design: none.

Remaining tasks: groups // 004 through // 009. Apply intentionally stopped before // 004.

## // 004. Prompt, default y resumen del installer

Completed tasks: 4.1, 4.2, 4.3.

The installer now treats `LinearIntegration` as the CLI decision from an “Integración Linear” `off/on` selection through deploy and summary. `--yes`, `--no-linear`, and Claude-only paths default to `off`; the plan derives its legacy `skipLinear` boolean once, while deploy receives the canonical value directly. Current installer output no longer presents Solo/Team or `/ein:mode team` instructions.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Installer selection, defaults, deploy handoff, and summary preserve one canonical Linear decision | Focused test failed because the canonical selection and summary boundary did not exist | `off/on` selection, `off` defaults, exact summary, and `{ linear }` deploy handoff passed | Interactive `off/on`, `--yes`, explicit opt-out, injected deploy capture, and staged persistence exercise distinct boundaries | Removed the Team confirmation branch and confined `skipLinear` to plan/compatibility; `bun test tests/installer-runtime-menu.test.ts tests/install-plan.test.ts tests/installed-agent-inventory.test.ts` passed 68/68 |

Verification:
- `bun test tests/installer-runtime-menu.test.ts` — pass, 48 tests.
- `bun test tests/installer-runtime-menu.test.ts tests/install-plan.test.ts tests/installed-agent-inventory.test.ts` — pass, 68 tests.
- `cd installer && bun run typecheck` — pass.

Deviations from design: none.

Remaining tasks: groups // 005 through // 009. Apply intentionally stopped before // 005.

## // 005. Doctor del installer sobre bundle staged

Completed tasks: 5.1, 5.2, 5.3.

The installer doctor now replaces retired Solo/Team checks with the deployed canonical module, the dynamic `readLinearIntegration → buildEinPrompt → linearDirective` chain, and fail-closed inspection of the effective `agentDir` authority. The staged regression deploys the real generated archive before each real doctor execution and mutates one seam per negative case.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Staged installer doctor accepts the current Linear chain and rejects broken deployed evidence | Real staged deploy reached the obsolete doctor, where all new Linear checks were absent | Canonical module, dynamic prompt, directive, and inspected evidence checks passed for deployed `off/on` | Missing module/read/directive plus unknown, malformed, and unreadable evidence each failed only its contractual check | Kept checks local to the installer doctor and reused canonical inspection; `bun test tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts` passed 13/13 |

Verification:
- `bun test tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts` — pass, 13 tests.
- `cd installer && bun run typecheck` — pass.

Deviations from design: none.

Remaining tasks: groups // 006 through // 009. Apply intentionally stopped before // 006.

## // 006. Doctor del runtime con paridad observable

Completed tasks: 6.1, 6.2, 6.3.

The runtime doctor now reports the same canonical module, dynamic read/build/directive chain, and fail-closed effective Linear evidence decisions as the installer doctor while retaining its own grouped text output. Its smoke-report boundary accepts an explicit deployed agent directory for staged verification and defaults to the active runtime directory in production.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Runtime and installer doctors make matching Linear health decisions | The staged parity test failed because the runtime report was not exposed and still required retired Solo/Team artifacts | Runtime checks consumed canonical inspection and passed for deployed `off/on` | Both doctors ran over the same missing module/read/directive plus unknown, malformed, and unreadable evidence mutations with identical focal PASS/FAIL | Kept presentation independent and only parameterized the runtime filesystem boundary; `bun test tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts tests/linear-integration.test.ts` passed 31/31 |

Verification:
- `bun test tests/installed-agent-inventory.test.ts` — pass, 6 tests.
- `bun test tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts tests/linear-integration.test.ts` — pass, 31 tests.
- `bun run typecheck` — pass.

Deviations from design: none.

Remaining tasks: groups // 007 through // 009. Apply intentionally stopped before // 007.

## // 007. Punteros inmutables de alpha.4

Completed task: 7.1.

The installer package version, runtime `INSTALLER_VERSION`, and leading Spanish changelog entry now agree on `0.82.0-alpha.4`. The changelog covers canonical selection/persistence, aligned doctors, and the staged installation regression. The release contract test remains unedited and version-agnostic.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Alpha.4 release pointers are coherent and describe the repaired installation flow | The exact focused command passed the version-agnostic contract test, then failed its alpha.4 package assertion while all pointers still held alpha.3 | Updating only the three authorized pointers made the complete command pass | Package metadata, runtime constant, leading changelog heading, and release contract independently agree | No abstraction or test pin added; `bun test tests/release-asset-contract.test.ts && test "$(bun -e 'console.log(require("./installer/package.json").version)')" = "0.82.0-alpha.4" && grep -q 'INSTALLER_VERSION = "0.82.0-alpha.4"' installer/src/core/version.ts && grep -m1 '^## ' CHANGELOG.md | grep -q '0.82.0-alpha.4'` passed 13/13 plus all pointer checks |

Verification:
- Exact task 7.1 focused verification — pass, 13 tests and all alpha.4 pointer checks.

Deviations from design: none.

Remaining tasks: groups // 008 through // 009. Apply intentionally stopped before // 008.

## // 008. Puertas finales de apply y verify

Completed tasks: 8.1, 8.2, 8.3.

The exact focused behavior/release suite, the full repository suite, and both independent TypeScript graphs are green. No production source changed in this group, no focused check exposed a defect, and no RED/GREEN cycle was triggered. No production build or publication command ran; the post-check working-tree inventory contains only the expected change files and OpenSpec artifacts, with no generated build artifact.

Verification:
- `bun test tests/linear-integration.test.ts tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts tests/install-plan.test.ts tests/installer-runtime-menu.test.ts tests/release-asset-contract.test.ts` — pass, 107 tests across 6 files.
- `bun test && bun run typecheck` — pass, 2589 tests across 188 files; root `tsc --noEmit` passed.
- `cd installer && bun run typecheck` — pass, installer `tsc --noEmit`.
- `git status --short` — only expected source/test/docs/OpenSpec changes; no build artifacts.

Deviations from design: none.

Remaining apply tasks: none. Group // 009 is delivery follow-up outside apply and runs only after independent verification passes.

## Files changed

`ein-pi/agent/lib/linear-integration.ts`
`tests/linear-integration.test.ts`
`installer/src/core/deploy.ts`
`tests/installed-agent-inventory.test.ts`
`installer/src/core/install-plan.ts`
`tests/install-plan.test.ts`
`installer/src/cli/install.ts`
`tests/installer-runtime-menu.test.ts`
`installer/src/core/verify.ts`
`tests/template-agent-inventory.test.ts`
`ein-pi/agent/extensions/ein-doctor.ts`
`installer/package.json`
`installer/src/core/version.ts`
`CHANGELOG.md`
`openspec/changes/fix-linear-integration-install-coherence/tasks.md`
`openspec/changes/fix-linear-integration-install-coherence/apply-progress.md`
