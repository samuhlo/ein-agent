status: complete

## // 001. Portable scout contract and seven-phase exclusion

- Completed task 1.1.
- Added `ein-pi/core/agents/ein-scout.md` with exact `read, grep, find` tools, explicit empty extensions, fresh-context inheritance defenses, and runtime-supported timeout, turn, and tool-call budgets.
- Added focused negative capability/lifecycle assertions without changing the seven SDD agents, router, chain, inventory consumers, or specs.
- Verification: `bun test tests/agent-tools-contract.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts` — 79 pass, 0 fail.
- TDD: standard mode (`strict_tdd: false`).

## // 002. Deterministic launch and report-validation boundary

- Completed task 2.1.
- Removed the unsupported `extensions: []` subagent call-input injection. The normalizer strips any caller-supplied `extensions` field; `ein-scout.md` remains the sole explicit empty-extension declaration.
- Removed the unwired `assertScoutRuntimeCapabilities` function and its false runtime-proof test. No runtime extension-isolation claim is made.
- Added focused static assertions: canonical scout frontmatter remains `extensions: []`; current mapped `pi-subagents` parent `SubagentParams` schema has no `extensions` field; its launch source maps defined agent extensions to `--no-extensions`; and the normalized parent input exposes no extension property.
- Preserved direct foreground blocking, `context: fresh`, runtime/turn/tool-call budgets, output schema, `acceptance: none`, tracking, and report validation.
- Verification: `bun test tests/readonly-scout-contract.test.ts tests/agent-tools-contract.test.ts` — 13 pass, 0 fail; `cd installer && bun run typecheck` — pass; scoped `git diff --check` — pass.
- Residual risk: `pi-subagents` remains intentionally unpinned. Future package drift is accepted and only statically detectable where current source/schema checks observe it; it is not a proven per-run fact.

Remaining: groups 004–005 pending.

## // 003. Authoritative installed non-SDD inventory

- Completed task 3.1 in standard mode (`strict_tdd: false`).
- The installer keeps source scan + generated manifest authoritative; `bundle-template.ts` remains list-free. New inventory coverage executes the bundle and binds source `agents/` to staged `agents/`, `assets/agents/`, and `template-manifest.json`.
- Added `ein-scout.md` to only the explicit legacy non-SDD fallback. `SDD_AGENTS` remains the original seven.
- Doctor now identifies deployed scout as read-only research, audits exact declared tools and explicit empty extensions, and reports the current `pi-subagents` `--no-extensions` mapping as a static compatibility check, never a per-run probe or receipt.
- Model discovery remains filesystem-driven; scout is a user agent with a cheap/low recommendation and is not an SDD name.
- Files changed: `installer/src/core/verify.ts`, `ein-pi/agent/extensions/ein-doctor.ts`, `ein-pi/agent/lib/model-config.ts`, `tests/installed-agent-inventory.test.ts`, `tests/model-config.test.ts`, `tests/agent-tools-contract.test.ts`, `tests/sdd-phase-runtime-contract.test.ts`.
- Verification: `bun test tests/installed-agent-inventory.test.ts tests/model-config.test.ts tests/agent-tools-contract.test.ts tests/sdd-phase-runtime-contract.test.ts` — 50 pass, 0 fail.
- Verification: `cd installer && bun run bundle-template && bun run typecheck` — pass.
- Residual risk: `pi-subagents` is intentionally unpinned; doctor can diagnose the mapped installed static source only, not attest a particular scout run.

Remaining: groups 004–005 pending.

## // 004. Lifecycle delta synchronization

- Delta ready; sync pending. Updated only the change-local `sdd-lifecycle` delta to name the enforced hard tool-call budget (`block: "*"`), wall-clock/turn limits, 16384-byte report cap, strict tools, canonical empty-extension frontmatter/current compatibility, direct foreground fresh-context normalization, and local fail-closed evidence validation.
- The delta now excludes read/file/token bounds, semantic-truth validation, OS-sandbox claims, per-run capability probes, pinned-package guarantees, lifecycle membership, and scout architecture authority; unpinned dependency drift remains a residual risk.
- Task 4.1 remains unchecked pending group synchronization/completion; group 005 remains pending.
- Verification: scoped `git diff --check` — pass.
- Sync evidence: `sync-report.md` records `state: synchronized`, `conflicts: 0`, and only `sdd-lifecycle`; its domain `after` SHA-256 (`32d43166e65b622393f5dd0955e996dc2d29096eece911ee7f7833889d41d4ba`) matches `openspec/specs/sdd-lifecycle/spec.md`. No manifest digest comparison was used.
- Task 4.1 is checked complete. Group 005 remains pending.
- Verification: `bun test tests/readonly-scout-contract.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts` — 81 pass, 0 fail.

## // 005. Integrated security, regression, and workload gate

- Completed task 5.1 in standard mode (`strict_tdd: false`); no production, test, or spec edits were needed for this final verification group.
- Focused regression: `bun test tests/readonly-scout-contract.test.ts tests/installed-agent-inventory.test.ts tests/agent-tools-contract.test.ts tests/model-config.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts` — 103 pass, 0 fail, 322 expectations.
- Installer verification: `cd installer && bun run typecheck && bun run bundle-template` — pass; bundle output is unchanged in the working tree.
- Scoped `git diff --check` over the contract slice — pass.
- Contract coverage confirms strict tools and empty-extension static/current compatibility; direct fresh bounded launch; rejection of malformed, oversized, multiple, unreferenced, uncertainly missing, invalid-line, escaping, and symlink-escaping reports; valid cited report acceptance; inventory agreement; and scout exclusion from the unchanged seven-phase router, flow, and reconcile contracts.
- Workload measurement: production/config/agent `+206/-6 = 212` changed lines, tests `+200/-0 = 200`, docs/OpenSpec recorded separately, generated `0`; production is below the 400-line gate.
- Residual risk: `pi-subagents` remains intentionally unpinned. Static/doctor checks diagnose observable drift, but cannot attest extension isolation for an individual future run.
- Remaining tasks: none.
