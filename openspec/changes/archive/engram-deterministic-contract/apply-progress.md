status: complete

# Apply progress — engram-deterministic-contract

## Completed

- Completed group `// 001`, task 1.1. `EngramTransport` exposes typed `search` and `save` outcomes with finite timeout/output budgets through the sole injected process capability.
- Completed group `// 002`, task 2.1. Added pure canonical project identity resolution: valid `origin` fetch remote, exactly one fetch remote, sorted root commits, otherwise `unknown` with no identity guessing.
- Added generated SDD and durable hashed topic policies, candidate allowlisting/redaction/noise rejection, freshness filtering, and safe receipts without raw payloads or diagnostics.
- Added `MemoryLifecycle`, which owns five-retrieval/ten-save session limits, per-key retrieval caching, 5-result/6 KiB context bounds, 4 KiB saves, generated-topic upserts, and local successful-digest dedup. It never search-before-saves.
- Marked only tasks 1.1 and 2.1 complete in `tasks.md`.
- Completed group `// 003`, task 3.1. Enabled preflight starts one non-blocking session preparation through the injected `MemoryLifecycle.prepare` service; its receipt/context is cached by session.
- Mapped `sdd-map`, `sdd-design`, `sdd-apply`, and `sdd-verify` starts infer an explicit or sole active change, prepare one phase key per session/project/change/phase, and append only a bounded, delimited UNTRUSTED ADVISORY MEMORY block for retrieved entries.
- Unknown projects, disabled mode, unmapped agents, ambiguous changes, empty/unavailable/failed results, and thrown lifecycle calls leave prompts, agent starts, and OpenSpec routing unchanged. Advisory text labels stale/unverified data and states that user instructions, source/configuration, and OpenSpec prevail.
- Marked only tasks 1.1, 2.1, and 3.1 complete in `tasks.md`.
- Completed group `// 004`, task 4.1. `ein_sdd_check` preserves its lint result while accepting an optional explicit phase plus concise structured candidate only after every present artifact and the named artifact have zero errors; `details.memory` adds a safe receipt without changing lint truth.
- Added generated SDD save topics, successful-digest dedup, safe best-effort JSONL receipt sidecars, and truthful skipped/unavailable/failed outcomes. Candidate fields are bounded/allowlisted and exclude full artifacts, code, diffs, test output, commands, and prompts through the existing policy plus the new structured seam.
- `ein:sdd-close` keeps `closeChange` as the untouched deterministic archive operation, then validates archived `summary.md`, skips a matching acknowledged close receipt, or makes one non-blocking close fallback. Archive success is independent of memory/receipt outcomes.
- Marked only tasks 1.1, 2.1, 3.1, and 4.1 complete in `tasks.md`.
- Completed group `// 005`, task 5.1. Replaced the selectable artifact-store preference with `memoryMode: "off" | "engram"`; headless/default sessions remain `off`, and legacy `openspec → off` plus `engram|both → engram` normalize only at the preflight boundary.
- OpenSpec is now rendered as the unconditional canonical full SDD record. UI, preflight prompt, notification, and SDD status call Engram an optional project notebook and explicitly keep configuration/tool discovery at E0 rather than treating it as retrieval or saving.
- Aligned the orchestrator and every SDD phase-agent contract: E0 is configured/diagnosable, E1 is prompt/advice or tool availability, and E2 requires a named deterministic adapter invocation plus its truthful receipt. Agents may supply concise candidates or report supplied receipts, but never claim deterministic persistence themselves.
- Marked only tasks 1.1, 2.1, 3.1, 4.1, and 5.1 complete in `tasks.md`; group `// 006` remains untouched and unchecked.

## Files changed

- `ein-pi/agent/lib/memory-contract.ts` — group 1 transport contract plus group 2 identity, policy, bounds, topic, freshness, and receipt types/functions.
- `ein-pi/agent/lib/engram-cli.ts` — group 1 injected child-process adapter and normalization.
- `ein-pi/agent/lib/memory-lifecycle.ts` — group 2 session-scoped retrieval/save orchestration.
- `tests/engram-memory-contract.test.ts` — group 1 fake-process behavioral matrix.
- `tests/engram-memory-lifecycle.test.ts` — group 2 fake transport/identity lifecycle matrix; no subprocess, Git, network, or memory mutation.
- `openspec/changes/engram-deterministic-contract/tasks.md` — tasks 1.1 and 2.1 checked only.
- `ein-pi/agent/lib/sdd-preflight.ts` — group 3 injected lifecycle bridge, safe Git-config project identity input, session/phase cache keys, and advisory renderer.
- `ein-pi/agent/extensions/ein-ai.ts` — group 3 preflight lifecycle injection plus mapped-agent/change inference and advisory prompt append.
- `tests/engram-memory-lifecycle.test.ts` — group 3 fake-transport lifecycle, caching, resumed-session, advisory, and non-injection coverage; no subprocess, Git, network, or memory mutation.
- `openspec/changes/engram-deterministic-contract/tasks.md` — tasks 1.1, 2.1, and 3.1 checked only.
- `openspec/changes/engram-deterministic-contract/apply-progress.md` — cumulative report.
- `ein-pi/agent/lib/sdd-memory-save.ts` — group 4 concise candidate gate, receipt allowlist, best-effort JSONL append, and acknowledged close-digest lookup.
- `ein-pi/agent/extensions/ein-ai.ts` — group 4 post-lint phase upsert, `details.memory`, and archive-first close fallback wiring.
- `ein-pi/agent/lib/memory-contract.ts` — group 4 safe skipped-reason vocabulary.
- `tests/engram-memory-lifecycle.test.ts` — group 4 fake lifecycle gate, generated-topic upsert/dedup, and receipt safety coverage.
- `tests/sdd-close.test.ts` — group 4 archived close-receipt/dedup and failed-sidecar non-blocking coverage.
- `openspec/changes/engram-deterministic-contract/tasks.md` — task 4.1 checked only.
- `ein-pi/agent/lib/sdd-preflight.ts` — group 5 `memoryMode` state/default/UI/prompt normalization, canonical OpenSpec wording, and E0-only tool-capability language.
- `ein-pi/agent/extensions/ein-ai.ts` — group 5 memory-mode gates and SDD status line that reports an optional notebook without a retrieval/save claim.
- `ein-pi/agent/assets/orchestrator.md` — group 5 E0/E1/E2 and candidate/receipt ownership contract.
- `ein-pi/core/agents/sdd-{scope,map,design,tasks,apply,verify,close}.md` — group 5 notebook contract; agents do not self-claim deterministic persistence.
- `tests/sdd-preflight-tdd-gate.test.ts` — group 5 legacy normalization and canonical OpenSpec/optional-notebook prompt assertions.
- `tests/sdd-flow-contract.test.ts` — group 5 text contracts rejecting E1-as-E2 claims across the orchestrator and all SDD agents.
- `tests/review-workload-guard.test.ts`, `tests/git-baseline.test.ts`, `tests/engram-memory-lifecycle.test.ts` — group 5 test-fixture migration from removed `artifactStore` state to `memoryMode`.
- `openspec/changes/engram-deterministic-contract/tasks.md` — task 5.1 checked only; group 6 remains unchecked.
- `openspec/changes/engram-deterministic-contract/apply-progress.md` — cumulative group 5 evidence.

## Verification evidence

- `timeout 120 bun test tests/engram-memory-contract.test.ts` — passed earlier: 8 tests, 28 assertions.
- `timeout 120 bun test tests/engram-memory-contract.test.ts tests/engram-memory-lifecycle.test.ts` — passed: 17 tests, 67 assertions.
- Fake inputs prove canonical remote/root determinism, unknown/ambiguous no-call behavior, project-scoped args, generated topic upserts, successful-digest dedup, bounded calls/results/context/save content, stale/unverified advisory entries, redaction/rejection before transport, and no search-before-save.
- `timeout 120 bun test tests/engram-memory-lifecycle.test.ts tests/sdd-preflight-tdd-gate.test.ts tests/sdd-router.test.ts` — passed: 35 tests, 112 assertions.
- Group 3 fake transport evidence proves session and mapped phase `prepare` invocation, one search per repeated key, a fresh search for a resumed session key, pinned project propagation through the lifecycle transport, stale advisory labeling, and no advisory injection for disabled, unmapped, ambiguous, empty, unavailable, timeout, or malformed results.
- `timeout 120 bun test tests/engram-memory-lifecycle.test.ts tests/sdd-close.test.ts tests/sdd-router.test.ts` — passed: 55 tests, 155 assertions. Fake lifecycle coverage proves no save for errorful/missing/invalid gates; one generated phase topic save, same-digest dedup, changed-content upsert, safe receipt field allowlisting, and acknowledged-only close duplicate recognition. Close/archive and router regression coverage passed without an Engram process or database.
- `git diff --check` and `git diff --cached --check` passed. No files are staged.
- `bun test tests/sdd-preflight-tdd-gate.test.ts tests/sdd-flow-contract.test.ts tests/review-workload-guard.test.ts` — passed: 33 tests, 92 assertions. It proves headless-compatible `memoryMode: off`, legacy normalization, unconditional OpenSpec prompt/status wording, no prompt-only E1 persistence claim, and review-workload wording continuity. No build, full suite, web request, or real Engram call/write ran.

## Line budget

- Group 1 production: 311 added lines (`memory-contract.ts` 55, `engram-cli.ts` 256); focused tests: 173 added lines.
- Group 2 production: 231 added lines (`memory-contract.ts` +140, `memory-lifecycle.ts` +91), within its <=260 forecast; focused tests: 138 added lines, within its <=280 forecast.
- Group 3 production: 172 added lines and 2 removed lines (`sdd-preflight.ts` +120/-1, `ein-ai.ts` +52/-1), within its <=180 forecast; focused tests: 85 added lines.
- Group 4 production: approximately 218 additions (`ein-ai.ts`, `sdd-memory-save.ts`, and one reason union); focused tests: 119 additions (`engram-memory-lifecycle.test.ts`, `sdd-close.test.ts`). Within its <=220 production forecast.
- Cumulative ledger before group 5: approximately 932 production additions, 2 production removals, and 515 focused-test additions.
- Group 5 ledger: 2 runtime files plus 8 internal-contract Markdown files and 5 focused-test files changed; no dependency, package metadata, MCP configuration, public README, installer, updater, banner, Homebrew, build output, or archived artifact changed. Delivery review measurement remains the deterministic Review Workload Guard's responsibility.

## Deviations

- No behavioral deviation from the design. Group 1 exceeded its forecast because the adapter retains stream collection, cancellation, ANSI filtering, and safe parsing inside its one external boundary.

## Remaining

- Group `// 005` is complete and checked. Group `// 006` is now complete and checked.

## Group // 006 completion

- Ran the full requested focused fake-process/fake-transport matrix. It covers pinned array argv with `shell: false`, 1,500 ms timeout cancellation, retrieval/save caps, update-notice tolerance, malformed output, and unavailable versus failed normalization.
- The lifecycle matrix covers unknown-project no-call behavior, project isolation, generated `--topic` upserts, successful-digest dedup, secret/noise rejection, stale/unverified retrieval, one-call/key caching, post-gate receipts, and non-blocking degradation.
- Preflight, router, and close tests prove OpenSpec continues for empty/unavailable/failed memory paths; close archives before receipt-sidecar behavior. Flow contracts now lock preflight, status, and doctor to E0 wording unless an E2 adapter receipt exists.
- Corrected one group 1–5 wording defect exposed by that contract: doctor previously implied that memory persisted merely because its CLI was available. It now reports availability/configuration as E0 only and never as retrieval or persistence.
- Created `handoff.md` for `readme-release-ia`. It is factual: verified fake-only E2 seams and test commands, OpenSpec canonical behavior, E0/E1 limits, no real-memory evidence, and explicit non-claims.
- Marked task 6.1 checked; `tasks.md` remains `status: ready`.

## Final verification

- `bun test tests/engram-memory-contract.test.ts tests/engram-memory-lifecycle.test.ts` — passed: 21 tests, 98 assertions.
- `bun test tests/sdd-preflight-tdd-gate.test.ts tests/sdd-close.test.ts tests/sdd-router.test.ts` — passed: 46 tests, 98 assertions.
- `bun test tests/sdd-flow-contract.test.ts tests/review-workload-guard.test.ts` — passed: 30 tests, 83 assertions.
- No real `engram` binary, MCP client, network, private notebook, or `~/.engram-pi` path was invoked or accessed. No build or full suite ran.

## Final line ledger

- Current change runtime/internal-contract files: 1,001 additions and 50 removals (tracked diff plus four new runtime modules).
- Focused tests: 586 additions and 5 removals (tracked test diff plus the two new fake-only Engram suites).
- OpenSpec artifacts for this change before this final progress append: 530 added lines (`tasks.md`, `design.md`, prior `apply-progress.md`, and `handoff.md`); this final entry is additive.
- No dependencies, lockfiles, README, installer, MCP configuration, backend, updater/banner/Homebrew, build output, or real-memory state changed. No files are staged.

## Residual limitations

- E2 evidence is deterministic but fake-only; it does not establish a live Engram installation, compatibility, or stored notebook content.
- Only enabled session plus `map`, `design`, `apply`, and `verify` preparation seams, clean artifact gates, and archive-first close fallback are E2. Other lifecycle points remain E0/E1.
- OpenSpec remains the mandatory canonical full artifact store; Engram remains optional and bounded.

## Remediation — production root identity fallback

- Corrected the production provider behind `createSddMemoryLifecycle()` in `ein-pi/agent/lib/sdd-preflight.ts`: it now resolves a valid `origin` fetch remote first, then exactly one valid fetch remote, then Git root commits, otherwise `unknown`.
- Added a bounded, argument-array Git capability (`git -C <cwd> rev-list --max-parents=0 --all`) with `shell: false`, a 1,500 ms timeout, and a 16 KiB output ceiling. The capability is injectable through the lifecycle factory; no path, package, branch, session, guessed identity, or network fetch is used.
- Added focused factory coverage in `tests/engram-memory-lifecycle.test.ts`. A fake no-remote repository and injected fake Git roots in reverse order prove the factory hashes sorted roots into the expected `ein-root-...` project ID and supplies that ID to a fake Engram transport. The test invokes neither real Git nor Engram.

## Remediation verification

- `bun test tests/engram-memory-contract.test.ts tests/engram-memory-lifecycle.test.ts` — passed: 22 tests, 99 assertions.
- `bun test tests/sdd-preflight-tdd-gate.test.ts tests/sdd-close.test.ts tests/sdd-router.test.ts` — passed: 46 tests, 98 assertions.
- `bun test tests/sdd-flow-contract.test.ts tests/review-workload-guard.test.ts` — passed: 30 tests, 83 assertions.
- `git diff --check` — passed with no output.
- No build, full suite, web request, real Engram operation, Git network operation, dependency change, or staged file was used.
