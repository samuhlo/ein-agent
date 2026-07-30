# Tasks — readonly-scout-contract

status: ready
blocked_by: none

## // 001. Portable scout contract and seven-phase exclusion

- [x] 1.1 Add the portable `ein-scout` user-agent frontmatter and evidence-only report instructions; add exact negative lifecycle assertions without modifying any of the seven `sdd-*` agents.
  - production paths: `ein-pi/core/agents/ein-scout.md`
  - test paths: `tests/agent-tools-contract.test.ts`, `tests/sdd-phase-runtime-contract.test.ts`, `tests/sdd-flow-contract.test.ts`, `tests/sdd-reconcile.test.ts`
  - skills: `architecture`, `bun`
  - why: Establish the static read-only contract and prove installation/discovery never grants SDD membership.
  - learn: A tool declaration is a capability allowlist, while lifecycle membership is a separate seven-name contract.
  - architecture: Keep scout as a standalone user agent; preserve the existing `scope → map → design → tasks → apply → verify → close` order, router, reconcile, and chain unchanged.
  - avoid: Adding scout to phase maps, `SDD_AGENT_NAMES`, chain definitions, or relying on prompt wording as enforcement.
  - acceptance: Frontmatter declares exactly `read, grep, find`, explicit empty extensions, fresh/default inheritance defenses, and real timeout/turn/tool-call budget fields; tests prove mutation/delegation/provider/MCP tools absent and `ein-scout` absent from phase order, router, reconcile, and chain while the seven-phase flow is byte-for-byte behaviorally unchanged.
  - verify: `bun test tests/agent-tools-contract.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts`
  - forecast: production 35–60 lines; tests 90–140 lines; docs/generated 0 lines.

## // 002. Deterministic launch and report-validation boundary

- [x] 2.1 Create the pure scout-contract boundary and wire it into the parent Pi pre/post hooks so only a direct foreground scout launch is normalized and only one locally validated structured report is accepted.
  - production paths: `ein-pi/agent/lib/scout-contract.ts`, `ein-pi/agent/extensions/ein-ai.ts`
  - test paths: `tests/readonly-scout-contract.test.ts`
  - skills: `architecture`, `nodejs-best-practices`, `bun`
  - why: The canonical agent frontmatter must be the immutable extension-isolation source, while the adapter deterministically rejects unsafe invocation forms and malformed evidence.
  - learn: Trust boundaries combine declarative capabilities that callers cannot override with fail-closed validation after execution.
  - architecture: `ein-scout.md` solely declares empty extensions; `scout-contract.ts` owns capability checks, exact normalized fields, call tracking, schema, UTF-8/report-reference validation; `ein-ai.ts` remains thin hook wiring.
  - avoid: A read-count proxy, per-run runtime capability receipt, generic acceptance validation, a shell filter, a new SDD phase, or duplicating extension policy in call input and frontmatter.
  - acceptance: The canonical `ein-scout.md` empty `extensions` frontmatter is the extension-isolation source and is backed by current `pi-subagents` contract/static assertions; the scout call schema has no `extensions` override, so parent callers cannot weaken it. Preserve `context: fresh`, `maxRuntimeMs: 120000`, `turnBudget: { maxTurns: 12, graceTurns: 2 }`, `toolBudget: { hard: 30, soft: 24, block: "*" }`, canonical output schema, and `acceptance: none`; nested/chain/parallel/background/resume forms block before launch and the adapter enforces direct foreground-only forms and report validation. Remove the superseded `extensions: []` call-input injection and per-run runtime-capability receipt assertion from current source/tests. Tests prove mutation tools absent, static empty-extension compatibility, valid cited output accepted, and malformed, oversized, multiple, unreferenced, uncertainly-missing, invalid-line, missing, escaping, or symlink-escaping output rejected. Accept unpinned dependency drift as residual risk, with doctor/static checks where possible.
  - verify: `bun test tests/readonly-scout-contract.test.ts tests/agent-tools-contract.test.ts`
  - forecast: production 145–190 lines; tests 150–220 lines; docs/generated 0 lines.

## // 003. Authoritative installed non-SDD inventory

- [x] 3.1 Align scout distribution and diagnostics with the source-scan/generated-manifest authority, preserving the independent seven-agent SDD set and the legacy no-manifest compatibility fallback.
  - production paths: `installer/src/core/verify.ts`, `ein-pi/agent/extensions/ein-doctor.ts`, `ein-pi/agent/lib/model-config.ts`
  - test paths: `tests/installed-agent-inventory.test.ts`, `tests/model-config.test.ts`, `tests/agent-tools-contract.test.ts`, `tests/sdd-phase-runtime-contract.test.ts`
  - skills: `architecture`, `nodejs-best-practices`, `bun`
  - why: Bundle/install/doctor/model consumers must agree on installed non-SDD agents without creating another lifecycle authority.
  - learn: A source scan plus generated manifest is authoritative; compatibility mirrors are checked receipts, not competing inventories.
  - architecture: Leave `installer/scripts/bundle-template.ts` list-free and scan-driven; add scout only to the named non-SDD fallback/recommendation/doctor diagnostics while `SDD_AGENTS` remains exactly seven.
  - avoid: Hand-maintained bundle lists, putting scout in `settings.json`, or adding it to SDD agent name sets for discoverability.
  - acceptance: Exact tests bind source agent scan to staged `agents/`, `assets/agents/`, and `template-manifest.json`; manifest-driven install, no-manifest fallback, doctor diagnostics of the declared empty-extension contract and current `pi-subagents` compatibility (not a per-run runtime probe), and model discovery/recommendation all include scout; the seven SDD agents remain unchanged.
  - verify: `bun test tests/installed-agent-inventory.test.ts tests/model-config.test.ts tests/agent-tools-contract.test.ts tests/sdd-phase-runtime-contract.test.ts && cd installer && bun run bundle-template && bun run typecheck`
  - forecast: production 70–105 lines; tests 80–130 lines; generated manifest/bundle receipt regenerated by command (report separately, do not hand-edit).

## // 004. Synchronize the lifecycle delta honestly

- [x] 4.1 Narrow the existing lifecycle delta from unsupported “read bounds” wording to the enforced tool-call, wall-clock, report-byte, citation, and seven-phase exclusion contract without touching runtime source.
  - production paths: none
  - test paths: `tests/readonly-scout-contract.test.ts`, `tests/sdd-phase-runtime-contract.test.ts`, `tests/sdd-flow-contract.test.ts`, `tests/sdd-reconcile.test.ts`
  - docs/generated paths: `openspec/changes/readonly-scout-contract/specs/sdd-lifecycle/spec.md`
  - skills: `cognitive-doc-design`, `bun`
  - why: The current delta overclaims an installed read-count bound that the runtime does not expose.
  - learn: Specifications must name the mechanism actually enforced, not a more attractive proxy.
  - architecture: Keep OpenSpec as the canonical lifecycle record; document scout as advisory evidence outside lifecycle machinery.
  - avoid: Claiming read/file/token ceilings, semantic-truth validation, an OS sandbox, or any source change in this synchronization group.
  - acceptance: The delta says hard **tool-call budget** with `block: "*"`, wall-clock and 16384-byte report limits, local fail-closed validation, and no scout phase/router/reconcile/chain membership; it contains no “enforced read bounds” claim.
  - verify: `bun test tests/readonly-scout-contract.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts`
  - forecast: production 0 lines; tests 0–10 regression lines; docs 10–25 lines; generated 0 lines.

## // 005. Integrated security, regression, and workload gate

- [x] 5.1 Run the focused contract, inventory, lifecycle, installer, and workload checks; preserve unrelated paths and stop before apply if measured production churn exceeds the 400-line review budget.
  - production paths: none
  - test paths: `tests/readonly-scout-contract.test.ts`, `tests/installed-agent-inventory.test.ts`, `tests/agent-tools-contract.test.ts`, `tests/model-config.test.ts`, `tests/sdd-phase-runtime-contract.test.ts`, `tests/sdd-flow-contract.test.ts`, `tests/sdd-reconcile.test.ts`
  - skills: `bun`, `nodejs-best-practices`
  - why: The boundary is only safe if static capabilities, normalized runtime behavior, evidence validation, inventories, and unchanged lifecycle all regress together.
  - learn: Security claims require adversarial regression checks and an honest production-diff gate.
  - architecture: Verification observes the contract across boundaries; it does not add runtime behavior or lifecycle authority.
  - avoid: Full-suite churn, external package modification, shell/provider enablement, unrelated-path cleanup, or proceeding when production insertions plus deletions exceed 400.
  - acceptance: Focused regressions prove all required attack cases and the existing seven-phase flow; bundle/typecheck succeed; production/config/agent changes are measured separately from tests/docs/generated output, and apply pauses for a delivery decision if the production total exceeds 400 lines.
  - verify: `bun test tests/readonly-scout-contract.test.ts tests/installed-agent-inventory.test.ts tests/agent-tools-contract.test.ts tests/model-config.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts && cd installer && bun run typecheck && bun run bundle-template`
  - forecast: production total 250–355 lines (stop before apply if measured insertions + deletions exceed 400); tests 320–500 lines; docs 10–25 lines; generated manifest/bundle receipt reported separately.
