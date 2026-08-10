status: complete
scope_status: bounded
change: surface-wiring
phase: map

# Map — surface-wiring

## Scope boundary

This change wires the existing cleaner audit, bounded mutation flow, and workbench/launcher into explicit user-facing Pi and Claude surfaces. It does not alter cleaner contracts, mutation ownership/limits, workbench behavior, installer TUI, updater, terminal app, OpenSpec authority, or Git authority.

## Current structure and integration points

### Engines and contracts

- `ein-pi/agent/lib/cleaner-read-only-audit.ts`
  - Pure deterministic `auditCleanerReadOnly(input)`.
  - Input depends on `ProjectStateV1`, reviewed-area `Area`, `LedgerEvaluation`, and `EvidenceResolution`.
  - Output is immutable `cleaner-audit-report/v1`, explicitly `mode: read-only`, `appliedChanges: 0`, and findings with no writer/apply capability.
  - No runtime I/O or surface registration; no callers beyond its direct contract test were found.
- `ein-pi/agent/lib/cleaner-bounded-mutations.ts`
  - Pure contract/admission/application/completion functions: `admitCleanerBoundedMutation`, `applyCleanerBoundedMutation`, and `assessCleanerCompletion`.
  - Requires injected project-state, finding, target, single-writer, and verification/router adapters.
  - Enforces exact replacement, ownership, path restrictions, 400-line budget, preconditions, one-write/no-retry semantics, state transition, invalidation, and attributable verification.
  - Imports the audit finding type only; no runtime I/O or surface registration; current test coverage is direct module coverage.
- `ein-pi/workbench.ts`
  - Executable Pi-side launcher with exported `parseWorkbenchArgs` and `runWorkbenchEntrypoint`.
  - Production dependency assembly is local to this file and invokes `runWorkbench` from `ein-pi/agent/lib/workbench.ts`, with TTY gating and exit classification.
  - Existing direct tests cover argv, TTY failure, injected dependencies, and result mapping; the real Pi/Claude installed-surface seam is not covered.
- `ein-pi/agent/lib/workbench.ts`
  - Stateful interactive engine with injected project, input/output, runtime adapter, launch, advisor, doctor, and abort dependencies.
  - Runtime/provider selection supports both `pi` and `claude`; failures/cancellation are normalized to bounded outcomes.

### Pi surface

- `ein-pi/agent/extensions-manifest.json` currently loads core extensions (`ein-ai`, banner, brand, doctor, linear, paths, skill maintenance/registry, `sdd-init`); no cleaner or workbench extension is listed.
- `ein-pi/agent/extensions/ein-ai.ts` owns broad `/ein:*` command and SDD dispatch behavior, but current relevant command inventory does not expose cleaner engines or the standalone workbench.
- `ein-pi/agent/extensions/ein-skill-registry.ts` registers skill advisor tools/commands and is the existing skill-surface pattern; it does not reference cleaner engines.
- `pi-ein/pi-ein.fish` only isolates `PI_CODING_AGENT_DIR` and `EIN_PI_AGENT_HOME`, then delegates to `pi`; it is the clean-session launcher boundary, not a capability dispatcher.
- `ein-pi/agent/settings.json` points at the installed extension and skill directories. It contains no cleaner/workbench command declaration itself.

### Claude surface

- `cc-ein/sync.ts` is the authoritative compiler/deployer: translates `ein-pi/core/AGENTS.md` and `ein-pi/core/agents/*.md`, copies core skills, generates `CLAUDE.md`, installs `cc-ein-sdd`, and configures the isolated Claude home.
- Its parity machinery (`compileClaudeSurface`, `checkGeneratedParity`, runtime-token translation, routing validation) assumes Claude user-facing behavior is represented by generated coordinator/agent/skill assets.
- `cc-ein/cc-ein.fish` provides clean-session isolation via `CLAUDE_CONFIG_DIR` and puts the generated SDD binary on `PATH`; it does not expose cleaner/workbench capabilities.
- `cc-ein/CLAUDE.adapter.md` documents Claude-native tools and delegation, but has no cleaner/workbench surface contract.
- The existing Claude surface contains no runtime-native command/agent/skill that imports or dispatches the three named engines. Because the cleaner modules and Pi launcher live under `ein-pi/agent`, a clean installed Claude home cannot reach them by direct internal import.
- No dedicated `cc-ein` sync/surface test file was found in `tests/`; existing sync behavior is therefore a likely seam-test addition point, subject to design.

## Existing tests and missing seam coverage

- `tests/cleaner-read-only-audit.test.ts`: extensive deterministic/immutability/fail-closed contract coverage; direct import only.
- `tests/cleaner-bounded-mutations.test.ts`: extensive admission, writer, transition, uncertainty, and completion coverage; direct import only.
- `tests/minimal-workbench-launcher.test.ts`: covers `ein-pi/workbench.ts` exports and injected entrypoint behavior; it does not start `pi-ein`, invoke a registered Pi command, compile/deploy Claude assets, or invoke an installed Claude surface.
- `tests/beta-launcher-e2e-hardening.test.ts` and `tests/fixtures/beta-launcher-e2e-driver.ts`: existing PTY/fixture patterns for real workbench launcher behavior and isolated runtime homes. These are the nearest reusable clean-session harness points, but currently exercise `ein-pi/workbench.ts` directly.
- `tests/runtime-session-adapters.test.ts` and runtime fixture tests cover provider adapter contracts/isolation, not cleaner dispatch or user-facing command reachability.
- No tests were found that exercise cleaner modules through either Pi's registered command/skill surface or Claude's generated/deployed command/agent/skill surface.

## Dependency and data-flow map

1. User invokes an explicit Pi or Claude surface from an isolated launcher/session.
2. Surface adapter must gather/receive the existing evidence and construct the relevant engine input; the engines themselves must remain deterministic and injected.
3. Audit surface returns the versioned read-only report; mutation surface must preserve admission/application/completion boundaries and bounded diagnostics; workbench surface must preserve existing TTY/exit/cancellation semantics.
4. Claude deployment must carry the same public activation contract through `cc-ein/sync.ts` into the generated isolated home, without exposing repository-relative internal paths as the user contract.
5. Seam tests must prove dispatch to the intended engine and observable result/diagnostic for all three capabilities in both runtimes, or record an intentional runtime boundary difference.

## Blast radius

### Directly affected candidates

- Pi command/extension registration: `ein-pi/agent/extensions-manifest.json` plus the relevant extension module (likely `ein-ai.ts` or a focused new extension surface).
- Pi clean-session/user entrypoint: `pi-ein/pi-ein.fish` only if a new executable command is required; otherwise it remains an isolation boundary.
- Claude canonical surface inputs: `ein-pi/core/AGENTS.md`, one or more `ein-pi/core/agents/*.md` and/or `ein-pi/core/skills/*/SKILL.md`, and `cc-ein/CLAUDE.adapter.md` only if a runtime difference must be declared.
- Claude compiler/deployer: `cc-ein/sync.ts` only if the chosen surface needs explicit translation, binary packaging, or parity validation beyond existing generated assets.
- Seam tests under `tests/`, likely a new surface-specific test plus reuse/extension of runtime fixture and PTY helpers.

### Protected/non-target dependencies

- Cleaner engine contracts and direct tests are delivered dependencies, not redesign targets.
- `ein-pi/agent/lib/project-state.ts`, `reviewed-area-ledger.ts`, runtime-session adapters, and workbench core are integration dependencies; changes there would enlarge scope.
- Installer CLI/TUI, updater/release plumbing, vanilla `pi`/`claude`, and isolated-home ownership remain outside the blast radius.

## Open integration questions for design

- What is the smallest runtime-native public surface that can invoke all three capabilities while keeping the cleaner's evidence/adapters at the boundary?
- How does Claude invoke an engine that is not present in the deployed `~/.claude-ein` tree: a generated agent/skill calling a stable executable, a shared command bridge, or another explicit adapter seam?
- Which capability inputs are available from a clean session, and what bounded `unavailable`/`unknown` diagnostic is required when evidence or TTY/runtime prerequisites are absent?
- Can Pi and Claude share observable result serialization, or must the boundary explicitly label the runtime-specific dispatch difference?
- How will the test fixture install/sync both isolated surfaces without relying on the developer's current home or internal source paths?

## Constraints to carry forward

- Do not add capability, ownership, mutation budget, autonomous/parallel writer, architect mutation, or installer responsibility.
- Do not treat direct module tests as seam proof.
- Preserve fail-closed semantics: unavailable/unknown/error diagnostics must not become current/success.
- Preserve clean isolation: `pi-ein` and `cc-ein` only; vanilla runtimes remain untouched.

## Ledger Contract

ledger:
  reads:
    - { path: "openspec/changes/surface-wiring/scope.md", lines: 79, estimated_tokens: 1050 }
    - { path: "openspec/config.yaml", lines: 43, estimated_tokens: 430 }
    - { path: "EIN.md", lines: 77, estimated_tokens: 930 }
    - { path: "openspec/changes/surface-wiring/specs/surface-wiring/spec.md", lines: 27, estimated_tokens: 430 }
    - { path: "pi-ein/README.md", lines: 35, estimated_tokens: 430 }
    - { path: "cc-ein/README.md", lines: 59, estimated_tokens: 980 }
    - { path: "cc-ein/CLAUDE.md", lines: 91, estimated_tokens: 1450 }
    - { path: "cc-ein/CLAUDE.adapter.md", lines: 70, estimated_tokens: 1050 }
    - { path: "ein-pi/agent/lib/cleaner-read-only-audit.ts", lines: 302, estimated_tokens: 2350 }
    - { path: "ein-pi/agent/lib/cleaner-bounded-mutations.ts", lines: 320, estimated_tokens: 3400 }
    - { path: "ein-pi/workbench.ts", lines: 111, estimated_tokens: 1050 }
    - { path: "ein-pi/agent/extensions-manifest.json", lines: 12, estimated_tokens: 120 }
    - { path: "ein-pi/agent/settings.json", lines: 33, estimated_tokens: 340 }
    - { path: "ein-pi/core/AGENTS.md", lines: 46, estimated_tokens: 700 }
    - { path: "cc-ein/sync.ts", lines: 647, estimated_tokens: 4300 }
    - { path: "pi-ein/pi-ein.fish", lines: 11, estimated_tokens: 150 }
    - { path: "cc-ein/cc-ein.fish", lines: 18, estimated_tokens: 250 }
    - { path: "tests/cleaner-read-only-audit.test.ts", lines: 357, estimated_tokens: 3100 }
    - { path: "tests/cleaner-bounded-mutations.test.ts", lines: 470, estimated_tokens: 4200 }
    - { path: "tests/minimal-workbench-launcher.test.ts", lines: 330, estimated_tokens: 2700 }
    - { path: "ein-pi/core/agents/sdd-map.md", lines: 121, estimated_tokens: 1600 }
    - { path: "codegraph: cleaner engine query", lines: 0, estimated_tokens: 900 }
    - { path: "codegraph: workbench entrypoint query", lines: 0, estimated_tokens: 900 }
    - { path: "codegraph: Claude sync query", lines: 0, estimated_tokens: 900 }
    - { path: "codegraph: Pi surface query", lines: 0, estimated_tokens: 900 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 15000, reads: 25 }
  budget_source: scope.md

## Phase note

Mapping only; no tests, build, typecheck, or implementation was run. Next phase: `sdd-design`.
