# Verify report — engram-deterministic-contract

status: pass
behavior_coverage: verified

## Executive summary

The bounded remediation closes the previous R4 blocker. The production provider used by `createSddMemoryLifecycle()` now resolves identity in the required order: canonical valid `origin` fetch remote, exactly one valid fetch remote when `origin` is absent, sorted Git root commits, then `unknown`. The no-remote factory test injects reversed root IDs and proves the stable sorted-root `ein-root-...` ID reaches the fake Engram transport.

No path, basename, package, branch, session, guessed identity, network fetch, real Engram binary, MCP endpoint, database, or `~/.engram-pi` path was used. Unknown/no-commit cases remain no-call paths. The complete focused fake-process/fake-transport contract matrix passes.

## Blocker disposition

**Closed:** the prior report found that production lifecycle construction never supplied root commits. `sdd-preflight.ts` now uses an injectable bounded argument-array Git capability (`git -C <cwd> rev-list --max-parents=0 --all`, `shell: false`, 1,500 ms timeout, 16 KiB ceiling) only after the remote precedence is exhausted. Its output is passed to the existing sorted-root identity policy. Failure, no commits, or no repository resolve to `unknown`, so `MemoryLifecycle` makes no Engram call.

## Required validation commands

1. `timeout 300 bun test tests/engram-memory-contract.test.ts tests/engram-memory-lifecycle.test.ts`
   - PASS — 22 tests, 99 assertions.
2. `timeout 300 bun test tests/sdd-preflight-tdd-gate.test.ts tests/sdd-close.test.ts tests/sdd-router.test.ts`
   - PASS — 46 tests, 98 assertions.
3. `timeout 300 bun test tests/sdd-flow-contract.test.ts tests/review-workload-guard.test.ts`
   - PASS — 30 tests, 83 assertions.
4. `timeout 300 git diff --check`
   - PASS — no output.

The requested commands were executed with the mandatory 300-second timeout wrapper. No build, full suite, web request, real Engram/MCP operation, Git network operation, or `~/.engram-pi` read/write ran.

## Spec coverage

| Contract | Evidence | Result |
|---|---|---|
| R1/R2: E0/E1/E2 truthfulness; OpenSpec canonical | Flow/preflight/doctor contract tests | Pass |
| R3: legacy preference normalization; optional notebook | Preflight tests | Pass |
| R4: canonical origin → one remote → sorted roots → unknown | Pure identity tests plus injected production-factory no-remote test | Pass |
| R4 no-commit/unknown no Engram call | Lifecycle unknown-project fake transport test | Pass |
| R5: project-scoped isolation | Fake transport project argument/filtering checks | Pass |
| R6/R7: argv-only process boundary, `shell: false`, timeout/caps/normalization | Fake process suite | Pass |
| R8: finite budgets, caching, no retries | Lifecycle fake tests | Pass |
| R9/R10: supported retrieval seams and advisory-only injection | Session and map/design/apply/verify lifecycle tests | Pass |
| R11–R14: structured content, redaction/noise policy, topics/upsert/dedup, freshness | Lifecycle fake tests | Pass |
| R15–R17: safe receipts, post-gate save, archive-first close fallback, non-blocking failure | Lifecycle/close/router tests | Pass |

## Behavioral coverage and assertion quality

`behavior_coverage: verified` — injected fake-process and fake-transport tests exercise the changed production factory path, including reversed root IDs, the exact derived `ein-root-...` project ID, and the fake transport call. They also exercise the deterministic E2 adapter/lifecycle, security policy, degradation, receipts, and OpenSpec-continuity paths.

This is fake-verified deterministic E2 behavior, not real-deployment evidence. No installed Engram CLI compatibility, live notebook persistence, or real Git/Engram process interaction was confirmed. The tests contain behavioral assertions on identity precedence, exact project propagation, process argv/cancellation/caps, and gate ordering; they are not type-only or smoke-only tests.

## Strict TDD

`openspec/config.yaml` sets `strict_tdd: false`; a TDD Cycle Evidence table and strict assertion audit are not mandatory. The focused tests named in `apply-progress.md` exist and passed in this verification.

## Task completion

`tasks.md` marks tasks 1.1 through 6.1 complete. The focused matrix and the remediation factory test support that completion claim.

## Workload and repository state

The recorded final ledger is runtime/internal-contract `+1,001/-50`, focused tests `+586/-5`, and OpenSpec artifacts `+530` before subsequent progress/report additions. The production change exceeds the 400-line review budget; the deterministic Review Workload Guard must determine delivery shape before any PR. No files are staged.

## Remaining risks

- Real Engram CLI availability, output compatibility, and persistence remain unverified by design.
- E2 is limited to enabled session and mapped `map`, `design`, `apply`, and `verify` preparation, post-clean-gate saves, and archive-first close fallback; other lifecycle points remain E0/E1.
- Root discovery intentionally fails closed to `unknown` on Git errors, timeout, oversized output, no commits, or invalid identity input.

## README handoff gate and next recommendation

`readme-release-ia` may now consume the fake-verified E2 evidence, but may claim only an optional bounded project notebook with OpenSpec canonical. It must not claim real-environment retrieval, installation compatibility, or persistence.

**Next recommendation:** send this report and `handoff.md` to the required reviewer, then have the delivery workflow run the deterministic Review Workload Guard and choose the required PR shape before any README or release claim.
