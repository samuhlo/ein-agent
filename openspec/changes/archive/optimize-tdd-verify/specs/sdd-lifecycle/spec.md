# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: verify-deduplicates-final-focused-commands
title: Verify runs one final focused command per behavior seam
requirement: The system MUST deduplicate identical final focused verification commands before execution while retaining one final focused command for each distinct behavior seam and preserving its independent evidence.
Given: Strict TDD apply evidence names focused commands for one or more behavior seams, and the independent verify phase receives those commands among its relevant checks.
When: sdd-verify builds its final command plan.
Then: Each identical command is scheduled and executed at most once, each distinct behavior seam retains one final focused command, and the resulting evidence identifies the command and seam without relying on apply results.

### Scenario: verify-preserves-fresh-independent-evidence
title: Verify reruns commands without result caching
requirement: The system MUST execute the deduplicated verification plan freshly in each sdd-verify run and MUST NOT reuse cross-run results, timestamps, file hashes, or cached command outcomes as behavioral evidence.
Given: A prior apply or verify run recorded a passing command whose exact command may also appear in the current verification plan.
When: sdd-verify assesses the current working tree and close readiness.
Then: The current verify run starts fresh execution for every scheduled command, records independent current evidence, and does not treat prior results or cache metadata as a substitute.

### Scenario: verify-retains-tdd-audit-and-close-gate
title: Command deduplication does not weaken TDD or close gates
requirement: The system MUST preserve strict-TDD evidence auditing and the independent fresh sdd-verify close gate when deduplicating commands.
Given: strict_tdd is active and an apply artifact claims RED, GREEN, TRIANGULATE, and REFACTOR evidence for the assigned focused tests.
When: sdd-verify audits the change and the lifecycle evaluates close readiness.
Then: Verify still audits the TDD evidence and behavioral coverage, close still requires a fresh passing verify report, and deduplication never bypasses a required check or permits stale evidence.

### Scenario: verify-runs-global-checks-once
title: Verify executes relevant global checks once
requirement: The system MUST execute each relevant global verification check once in sdd-verify and MUST keep production-build checks out of the sdd-apply focused-test loop.
Given: A change has strict-TDD focused-test evidence and the verification plan includes relevant global checks such as typechecking, linting, a full suite, or a production build.
When: The SDD lifecycle executes apply and then independent sdd-verify.
Then: Apply runs only its bounded focused checks, while verify schedules and executes each relevant global check once without weakening any required close check.
