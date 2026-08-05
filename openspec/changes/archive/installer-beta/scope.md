# Scope: installer-beta

## SCOPE PACKET
scope: Bounded installer-runtime delivery in the fixed order runtime flag, focused Pi+Claude E2E coverage, macOS installer version display, and preparation of installer 0.41.0 with CHANGELOG metadata; GitHub workflow dispatch and release publication are explicitly outside apply.
budget_allocated:
  max_tokens: 18000
  max_reads: 30
  max_runtime_ms: 180000

## Execution constraints
- execution_mode: automatic
- strict_tdd: true
- webfetch: false
- This is a scope artifact only; do not implement code, run tests/builds, dispatch GitHub workflows, tag, or publish a release in this phase.
- The existing generated behavior delta is the sole spec-delta declaration. Do not rewrite or add another declaration:
  - `openspec/changes/installer-beta/specs/installer-runtime/spec.md`

## Project and testing context
- Stack: Node.js/TypeScript ESM installer with Bun as package manager and GitHub Actions around release delivery.
- Existing SDD testing configuration reports no reliable test runner or configured unit/integration/E2E commands.
- Configured typecheck for later phases: `cd installer && bun run typecheck`.
- Strict TDD remains enabled: later implementation must establish focused failing coverage before the corresponding behavior changes, then pass and triangulate it.

## Canonical OpenSpec context
The following exact references were used and must remain authoritative for mapping and design:

| path | SHA-256 | bytes |
| --- | --- | ---: |
| `openspec/specs/installer-runtime/spec.md` | `2e124d82b7fe5e6cf2ca07ea9141caaf92140e4652afb0ffd47cfee5edcd801c` | 4079 |
| `openspec/changes/installer-beta/specs/installer-runtime/spec.md` | `9271e5503948c9b8d5bbb53c963aed3ffd16291b0d87b749395e0edb886c1419` | 1322 |

The change delta adds the non-interactive runtime-selection contract and consistent macOS version-display contract. Existing canonical behavior for Pi installation, Claude installation, checksum verification, safe secret writes, safe shell-RC writes, and interactive runtime selection remains protected.

## Ordered scope

### 1. Runtime flag
Add/verify non-interactive `ein install --yes` selection for exactly `--runtime pi`, `--runtime claude`, and `--runtime both`.
- Omitted runtime defaults to the current Pi-only behavior.
- `pi`, `claude`, and `both` invoke only their selected target paths.
- `both` preserves the existing Pi-then-Claude order.
- Unsupported runtime values fail before any installation path runs.
- Interactive runtime selection remains intact and is not replaced by the flag.

### 2. Pi+Claude E2E coverage
Add focused end-to-end coverage for Pi-only defaulting, Claude-only selection, and ordered `both` selection, including failure propagation at the runtime boundary.
- Exercise the existing Pi and Claude integration surfaces rather than introducing a second installer architecture.
- Keep checksum strictness, safe secret-file writes, safe shell-RC writes, package-manager assumptions, and Pi isolated-agent/legacy-migration behavior as regression invariants.
- Do not weaken or bypass checksum validation or filesystem safety to make E2E setup pass.

### 3. macOS version display
Make the running installer binary display its installer SemVer consistently on macOS, matching the existing Linux version contract.
- Cover the version or interactive-banner surface used by a supported macOS binary.
- Retain the existing template-version probe wherever it is still required; do not create a separate public display version.

### 4. Prepare 0.41.0/CHANGELOG
Prepare release metadata for installer `0.41.0` and its changelog entry while keeping the release pointers aligned:
- `installer/package.json`
- `installer/src/core/version.ts`
- root `CHANGELOG.md`

This is preparation only. Actual GitHub Actions dispatch, tagging, asset verification, release publication, and any remote delivery require explicit later authorization and are outside apply.

## Invariants and non-goals
### Must preserve
- Current Pi behavior, including isolated-agent resolution and legacy EIN migration semantics.
- Strict bootstrap checksum verification before execution/publication.
- Safe secret and shell-RC writes, including refusal of unsafe filesystem targets and atomicity guarantees.
- Bun/package-manager usage and the existing installer/package architecture.
- Existing Claude Code installation behavior and interactive runtime choices.

### Explicitly exclude
- Unrelated refactors, broad architecture cleanup, or core-parity work.
- Changes to unrelated runtimes or future version targets.
- Workflow dispatch, tagging, publishing, or other GitHub delivery actions.
- Broad test-runner migration; use the smallest focused E2E harness compatible with the existing project setup in later phases.

## Handoff to map
Map only the bounded installer runtime flag/selection seam, its Pi+Claude E2E surfaces, the macOS version-display seam, and the three 0.41.0 release metadata pointers. Reuse the references and budget above; do not broaden discovery beyond those areas.
