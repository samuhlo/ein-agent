# Design — optimize-tdd-verify

## A. Proposal

### Intent

Reduce redundant final verification work without weakening strict TDD, independent verification, or close readiness. Apply keeps bounded RED → GREEN → TRIANGULATE → REFACTOR cycles; verify creates a fresh per-run command plan, retains one focused command association per behavior seam, and executes each exact normalized command once.

### Scope

In scope:

- Clarify the apply evidence contract so each behavior seam has a concise observable label and one final focused command after the last GREEN or REFACTOR check.
- Clarify the verify contract for per-run command inventory, conservative normalization, duplicate merging, fresh execution, evidence, and relevant global checks.
- Extend focused prompt/phase-boundary contract coverage for these rules.

Out of scope:

- Production application behavior, a general command scheduler, lifecycle-router or close-gate redesign, and unrelated repository refactors.
- Cross-run caches, result reuse, timestamp/hash freshness heuristics, or accepting apply results as final evidence.
- Production builds in apply. Verify may run a production build only when the current change explicitly requires one and its environment is available.
- Changes to `openspec/config.yaml`; its blank test command lists and installer-only typecheck remain inputs, not a reason to invent repository-wide checks.

### Affected areas

- `ein-pi/core/agents/sdd-apply.md`: behavior-seam and final-focused-command evidence, while preserving focused strict-TDD cycles and the apply build boundary.
- `ein-pi/core/agents/sdd-verify.md`: command-plan construction, exact normalization, de-duplication, global-check disposition, fresh execution, and evidence reporting.
- `tests/sdd-tdd-phase-boundary.test.ts`: focused contract coverage for apply/verify ownership and the optimized verify plan.
- `openspec/config.yaml`: read-only source of configured checks; no edit is planned.

The router, guardrails, preflight, and close implementation remain unchanged because the mapped code has no command-planning or execution seam there. A deterministic helper is not added because no runtime executor would consume it; an unused helper would create dead code without enforcing agent behavior.

### Risks

- Aggressive normalization could merge shell commands whose quoting, environment, or working-directory semantics differ.
- Vague behavior-seam labels could conceal missing focused coverage or make command selection arbitrary.
- A duplicate command serving several seams or global roles could be reported as several executions rather than one shared fresh result.
- Relevance judgments for global checks could accidentally omit a required close check when configuration and change-specific instructions disagree.

### Rollback

Revert the apply/verify prompt-contract and focused contract-test changes. No production state, cache, artifact schema migration, router state, or configuration change requires cleanup; the previous behavior resumes, including potentially redundant verify executions.

### Success criteria

Apply still documents and performs focused strict-TDD cycles and never runs a production build. Verify independently inventories current obligations, maps exactly one final focused command to every behavior seam, merges identical normalized commands across all roles, runs every unique scheduled command once in the current verify run, and records one fresh result with all covered seams and roles. Strict-TDD auditing and the existing passing-verify close gate remain mandatory.

## B. Spec

### Spec context

`scope.md` records no canonical `openspec/specs/<domain>/spec.md` reference, and `map.md` adds no explicit canonical domain hint. Canonical context is therefore **0 files / 0 UTF-8 bytes**, with no path, SHA-256, or byte-count entries to record. This design implements the authoritative change delta at `openspec/changes/optimize-tdd-verify/specs/sdd-lifecycle/spec.md`; it does not promote that delta to canonical context.

### R1 — One final focused command per behavior seam

The system **MUST** represent each behavior seam as a concise observable behavior in apply evidence and **MUST** associate it with exactly one final focused command from the completed TDD cycle. Verify **MUST** retain that association while merging entries with the same normalized command, so one execution **MAY** provide fresh evidence for several seams.

**Scenario:** Given apply evidence names two distinct behavior seams whose final focused command is identical, when verify builds the current run plan, then both seams remain associated with that command and the command is scheduled once.

### R2 — Exact, conservative command de-duplication

Within one verify run, the system **MUST** normalize a command only by removing surrounding whitespace from its executable command string, **MUST** preserve all internal characters and ordering, and **MUST** merge only exact matches of that normalized string. The system **MUST NOT** infer equivalence across aliases, reordered flags, different quoting, environment prefixes, or working-directory setup. An empty normalized command **MUST NOT** be scheduled.

**Scenario:** Given repeated command strings that differ only in surrounding whitespace and another command that differs internally, when verify normalizes and de-duplicates the plan, then the surrounding-whitespace variants become one entry and the internally different command remains separate.

### R3 — Fresh independent verify evidence

The system **MUST** construct and execute a new command plan for every verify run. It **MUST** execute every unique scheduled command in the current working tree and **MUST NOT** use apply results, earlier verify results, timestamps, file hashes, or workflow-level cached outcomes as a substitute for execution. Ordinary internal caching performed by an invoked tool **MAY** remain enabled unless the required command contract explicitly disables it; such caching **MUST NOT** cause verify to skip invoking the command.

**Scenario:** Given apply or a previous verify report records a passing copy of a command in the current plan, when verify assesses the current working tree, then it invokes that command again and records only the current run result as final evidence.

### R4 — Relevant global checks run once

Verify **MUST** inventory global-check candidates from current OpenSpec configuration and explicit design/task verification requirements, **MUST** classify each candidate as scheduled or not relevant with a reason, and **MUST** schedule every relevant global check. It **MUST** merge a relevant global check with any identical normalized focused command and **MUST** execute each resulting unique command exactly once. Apply **MUST NOT** absorb global checks into its focused loop and **MUST NOT** run production builds.

**Scenario:** Given a typecheck appears in both scalar and list configuration and an identical command also covers a focused seam, when verify builds and executes its plan, then one plan entry records both roles, one fresh execution occurs, and no duplicate runs occur in apply or verify.

### R5 — TDD audit and close gate remain authoritative

When strict TDD is active, verify **MUST** audit RED, GREEN, TRIANGULATE, and REFACTOR evidence, test existence, assertion quality, and behavior coverage before reporting success. Missing seam evidence, a required unscheduled check, a failed command, or stale/substituted evidence **MUST** prevent an unqualified passing report. Close **MUST** continue to require the current lifecycle's passing verify report and **MUST NOT** accept de-duplication metadata as a bypass.

**Scenario:** Given command de-duplication succeeds but apply lacks a final focused command for one behavior seam, when verify audits strict-TDD evidence and close readiness is evaluated, then verify reports the evidence gap and close remains blocked.

## C. Decisions

### 1. Model seams in apply evidence, but keep freshness in verify

A behavior seam is a short observable contract, such as “duplicate focused commands execute once while both seams retain evidence,” not a task number, file name, or implementation symbol. Apply records the seam and the final focused command already exercised after the last GREEN/REFACTOR step; recording it does not add another apply run. Verify checks the seam against the design, changed tests, and actual code before using the command in its plan.

**Trade-off:** this adds two explicit evidence fields but avoids a new artifact or schema. Apply provides traceability, while verify remains the only owner of final fresh execution.

### 2. Use a many-to-one command plan

Verify first inventories focused seam-command associations and relevant global checks. It trims surrounding command whitespace, rejects empty values, then merges exact normalized matches while preserving first-seen order and unioning seam, source, and role metadata. It validates that every seam has exactly one focused association and every required global check has a disposition before execution.

The verify report records one row per unique execution with the normalized command, roles, covered seams, and current result. A command shared by several obligations runs once; its one result applies to every recorded association.

### 3. Keep normalization deliberately narrow

Only surrounding whitespace is normalized. Internal whitespace, shell quoting, flags, environment prefixes, and `cd` setup remain part of command identity. Commands with different execution contexts must express those contexts in their command strings and remain distinct.

**Rejected:** shell parsing or semantic equivalence detection. It would be error-prone, platform-sensitive, and capable of merging commands that do different work.

### 4. Resolve global relevance from declared current inputs

Configuration and explicit design/task verification requirements form the global-check inventory. Verify may mark a configured check not relevant only with a reportable changed-area reason; explicit required checks cannot be downgraded by that judgment. In this change, the configured installer typecheck is not automatically relevant to prompt-only `ein-pi` and test-contract changes, and blank global command lists do not justify inventing a full suite or build.

### 5. Change prompt contracts, not lifecycle infrastructure

The agent prompts are the existing execution boundary. The router and close gate consume phase outcomes and artifacts but do not schedule commands, so this slice leaves them unchanged. The existing phase-boundary contract test is the smallest cohesive place to lock the new wording and preserve apply/verify ownership.

**Rejected:** adding a pure command-plan helper without a concrete runtime caller. It would test an algorithm the verifier does not execute and create false confidence. **Rejected:** adding a cross-run cache or freshness timestamp/hash, because either would weaken independent execution and violate the delta.

### Boundaries

- **`sdd-apply.md`:** focused cycle execution, seam labels, final focused command traceability, and no production build.
- **`sdd-verify.md`:** independent seam validation, per-run inventory, normalization, de-duplication, execution, evidence, strict-TDD audit, and global relevance decisions.
- **`apply-progress.md`:** records apply history and candidate final focused commands; it never proves final freshness.
- **`verify-report.md`:** records the current run's unique command plan, associations, results, audit outcome, and blockers.
- **Configuration/design/tasks:** declare candidate or required checks; they do not provide execution evidence.
- **Router/guardrails/close:** retain existing phase progression and passing-verify readiness rules.

Architecture, Ein discipline, and documentation-writing guidance apply through a small prompt-contract slice, explicit ownership, active voice, and no speculative abstraction. VueUse, web-quality-audit, and Nuxt UI guidance do not apply because this change has no Vue, browser-quality, or UI surface.

## D. Success Criteria

- Apply guidance still requires RED → GREEN → TRIANGULATE → REFACTOR for each assigned seam, records one final focused command per seam, limits repeated/full checks, and forbids production builds.
- Verify guidance defines surrounding-whitespace-only normalization, exact-match merging, many-to-one seam associations, one execution per unique command, and a fresh plan for every run.
- The verify report contract exposes one current result per unique command and preserves all focused/global roles without presenting one execution as several.
- Every behavior seam has exactly one final focused command association; missing or ambiguous associations fail strict-TDD verification rather than being hidden by a broader suite.
- Every explicit required global check is scheduled; configured candidates judged irrelevant have a concrete reportable reason; each scheduled global check executes once after cross-role de-duplication.
- Prior apply/verify results, timestamps, hashes, and workflow caches never replace current invocation. Apply evidence remains audit input only.
- Existing strict-TDD auditing, behavior-coverage reporting, verify failure behavior, and close readiness remain unchanged and cannot be bypassed by command-plan metadata.
- Focused contract verification succeeds with `bun test tests/sdd-tdd-phase-boundary.test.ts` after that test covers both the optimized verify plan and the preserved apply/verify boundary.
- Manual inspection confirms no changes to `openspec/config.yaml`, lifecycle router/guardrails/close code, production application code, or apply build behavior.
