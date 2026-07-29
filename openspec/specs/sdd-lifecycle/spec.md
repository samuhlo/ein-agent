# OpenSpec Specification
format: openspec-spec/v1
domain: sdd-lifecycle

## Scenario: apply-default-acceptance-none
title: Normal apply does not require an acceptance report
requirement: The system MUST inject `acceptance: none` for normal apply work and MUST NOT require or claim an acceptance report for that mode, while preserving the independent `sdd-verify` final gate.
Given: an SDD change enters normal or mechanical apply work without an explicit verified override.
When: the apply contract and runtime handoff are evaluated.
Then: acceptance is none, no acceptance report is required, and the change still proceeds to independent sdd-verify.

## Scenario: apply-explicit-verified-override
title: Verified apply remains an evidence-bearing exception
requirement: The system MUST treat `acceptance: verified` as an explicit exceptional override and MUST require fresh re-execution and evidence for that mode.
Given: an apply request explicitly selects the verified acceptance override.
When: apply completion is assessed.
Then: completion requires the specified checks to be re-executed and their evidence recorded; the normal acceptance-none default does not satisfy the override.

## Scenario: candidate-receipt-archive-before-deactivate
title: Exact receipt bytes are archived before deactivation
requirement: The system MUST publish and verify the active receipt bytes byte-for-byte in a collision-safe fingerprint archive, with separate matching retirement metadata, before removing the active slot; partial publication, conflicting bytes or metadata, or active removal failure MUST fail closed.
Given: retirement has passed its initial identity and completion checks.
When: archive publication or active-slot removal is attempted.
Then: the active slot remains effective until exact archived bytes and matching immutable metadata are complete; an interrupted transition may leave both active and archived evidence but must never leave neither, and no conflict is overwritten.

## Scenario: candidate-receipt-attempt-rotation
title: Stale attempt state cannot authorize another candidate
requirement: The system MUST clear current-session attempt state before publishing a replacement receipt, retain a matching attempt until retirement deactivates its receipt, clear it after successful deactivation, and compare attempt fingerprint to current raw receipt bytes at every authorization decision.
Given: an attempt was created for an earlier receipt and a later receipt or candidate becomes current.
When: the stale attempt is presented to a delivery or retirement decision.
Then: fingerprint mismatch blocks its use, and no validated delivery head from the earlier candidate authorizes the later receipt.

## Scenario: candidate-receipt-bound-retirement-evidence
title: Retirement evidence binds the current candidate and delivery identity
requirement: The system MUST bind first-time retirement to the SHA-256 of the current active receipt bytes, the matching attempt fingerprint and validated delivery head, current repository and worktree identities, and the exact remote repository, base ref, head ref, pull-request number and URL observed for completion.
Given: an active receipt, attempt, repository/worktree, and pull-request observation are available.
When: retirement evidence is evaluated.
Then: every bound identity must resolve and match the same candidate and merged pull request; any missing, corrupt, ambiguous, or mismatched value blocks retirement.

## Scenario: candidate-receipt-delivery-limit
title: Candidate receipt delivery enforcement
requirement: The system MUST keep user-intent authorization separate from candidate-content authorization, MUST enforce candidate receipt identity for verified SDD delivery, and MUST allow trivial or mechanical delivery only through an explicit declaration that no verification receipt applies.
Given: a delivery action is requested with an existing user-intent grant.
When: the system determines whether commit, push, or pull-request delivery may proceed.
Then: the unchanged intent grant authorizes only the action, a matching candidate receipt authorizes only verified content, and an explicitly declared trivial or mechanical delivery neither emits nor claims verification evidence.

## Scenario: candidate-receipt-durable-archive-ancestry
title: New archive ancestors are durable before terminal deactivation
requirement: The system MUST create each previously absent archive directory explicitly and fsync that directory and its parent before unlinking the active receipt on supported Linux and macOS platforms; unsupported directory synchronization or any directory synchronization error MUST block the transition.
Given: retirement needs a fingerprint archive directory that does not yet exist.
When: it publishes the receipt and retirement metadata before deactivation.
Then: every new ancestor and its parent are synchronized before the active slot is unlinked, and the active slot parent is synchronized after unlink; no success is reported on an unsupported platform or a failed directory fsync.

## Scenario: candidate-receipt-durable-attempt
title: Validated delivery attempt survives restart only for its exact receipt
requirement: The system MUST persist a validated delivery attempt under the worktree git directory with repository ID, worktree ID, receipt fingerprint, and validated delivery HEAD; it MUST recover that attempt after restart only when every stored identity and the current active receipt match, and MUST fail closed for missing, corrupt, stale, or mismatched state.
Given: a post-commit boundary validates one delivery head for an active receipt.
When: retirement runs in the same or a later process.
Then: it may use only the matching durable attempt; emitting a replacement or completing matching retirement clears both durable and in-memory attempt state.

## Scenario: candidate-receipt-emission-preconditions
title: Receipt evidence resolves one live or archived change
requirement: The system MUST resolve candidate receipt evidence from exactly one live or archived SDD change location and MUST fail closed when neither or both locations exist.
Given: candidate receipt emission or validation names an SDD change.
When: the system resolves receipt preconditions and evidence paths.
Then: it uses the uniquely resolved live or archived change; an archived change is eligible only with complete apply, fresh passing verify, and a current close summary, while ambiguity blocks delivery without silently preferring a location.

## Scenario: candidate-receipt-explicit-path-manifest
title: Candidate receipt explicit path manifest
requirement: The system MUST require an explicit, duplicate-free manifest of exact changed file paths, support added, modified, deleted, and renamed files, and reject broad or non-exact path selection.
Given: the caller declares the paths whose bytes compose the candidate.
When: the system validates the manifest against current tracked and untracked changes.
Then: it accepts concrete added, modified, or deleted files and renames declaring both old and new paths; it rejects empty or duplicate manifests, directories, absolute paths, .. escapes, magic pathspecs, nonexistent paths, or unchanged files.

## Scenario: candidate-receipt-explicit-retirement-trigger
title: Retirement is an explicit deterministic operation
requirement: The system MUST expose candidate-receipt retirement through an explicit deterministic operation with explicit change, receipt fingerprint, remote, base ref, head ref, and pull-request identity, and MUST NOT infer retirement from prose, keywords, age, branch movement, or a later delivery request.
Given: an active candidate receipt appears eligible for retirement.
When: no explicit retirement operation with the required identities is invoked.
Then: the receipt remains active regardless of user wording, elapsed time, local HEAD movement, or overlap with later work.

## Scenario: candidate-receipt-fail-closed-current-evidence
title: Candidate receipt fail-closed current evidence
requirement: The system MUST fail closed when a candidate receipt is missing, corrupt, unsupported, internally inconsistent, mismatched to its repository, worktree, change, HEAD, paths, report, or commands, or stale relative to current apply and verify evidence.
Given: a consumer attempts to validate candidate-receipt evidence for a change.
When: the system loads and compares the receipt with its structure, version, digests, identity, and current SDD evidence.
Then: it accepts only a complete match; absence, read or JSON errors, invalid fields, unsupported version, inconsistent digest, distinct identity, missing or changed verify report, later apply, or invalidated precondition rejects.

## Scenario: candidate-receipt-fresh-network-truth
title: First-time retirement requires fresh remote truth
requirement: The system MUST obtain completion evidence through a fresh in-operation remote observation and MUST fail closed when GitHub or the selected remote is unavailable, unauthenticated, malformed, stale or caller-supplied, unresolved, unmerged, forked, or divergent from the explicit identities.
Given: an active receipt whose caller supplies a pull-request identity.
When: the retirement operation observes the remote completion state.
Then: it accepts only a freshly resolved same-repository merged pull request with a non-empty merge result and a recorded head OID equal to the validated delivery head; otherwise the active receipt remains.

## Scenario: candidate-receipt-idempotent-retirement
title: Already-retired calls verify immutable local evidence
requirement: The system MUST treat repeated retirement of the same fingerprint as an idempotent already-retired result only after verifying exact archived payload bytes and all stored retirement identities, and MUST NOT overwrite conflicting archive evidence or claim a new remote observation.
Given: the active slot is absent and a retired archive is addressed by the explicit receipt fingerprint.
When: the same retirement operation is repeated.
Then: matching payload bytes and metadata return already-retired without mutation; missing, corrupt, or mismatched archive evidence fails closed.

## Scenario: candidate-receipt-identity-and-atomic-publication
title: Candidate receipt identity and atomic publication
requirement: The system MUST atomically publish a local versioned receipt bound to the repository, worktree, change, HEAD, candidate tree, ordered paths, current verify report, and declared verification commands.
Given: emission preconditions and the candidate tree are valid.
When: the system creates the receipt.
Then: it binds repository and worktree identities, change, HEAD, branch, tree SHA, ordered paths and their digest, current verify-report digest, declared commands and their digest, and date; it publishes by atomic replacement under the git-dir rather than as versioned content.

## Scenario: candidate-receipt-immutable-retirement-metadata
title: Retirement metadata publication never overwrites a concurrent writer
requirement: The system MUST publish `retirement.json` with the same immutable no-replace protocol as the archived receipt: a flushed temporary file, exclusive link or equivalent no-replace primitive, directory synchronization, and byte comparison on EEXIST.
Given: archive receipt bytes are complete and retirement metadata is about to be published.
When: another writer creates matching or conflicting metadata between local inspection and publication.
Then: matching bytes may be reused, conflicting or unreadable bytes block retirement, and the active slot remains effective without overwriting evidence.

## Scenario: candidate-receipt-invalid-attempt-or-receipt
title: Missing or invalid active evidence cannot retire
requirement: The system MUST keep the active receipt effective when its raw bytes cannot be read, parsed, freshly validated or matched to the explicit and attempt fingerprints, or when the attempt or validated delivery head is missing or mismatched.
Given: an active slot with missing, corrupt, replaced or mismatched receipt or attempt evidence.
When: first-time retirement is requested.
Then: retirement is blocked without deleting or reclassifying the active evidence and without falling back to mechanical-unverified delivery.

## Scenario: candidate-receipt-isolated-candidate-tree
title: Candidate receipt isolated candidate tree
requirement: The system MUST build a deterministic candidate tree from HEAD and only the explicit manifest through an isolated temporary Git index, without mutating the real index or worktree.
Given: an exact validated manifest exists and unrelated staging may be present.
When: the system incorporates declared additions, modifications, deletions, and renames into a temporary index and writes the candidate tree.
Then: the tree SHA represents only HEAD plus declared bytes, the real staging and worktree remain intact, and the temporary index is removed on both success and error.

## Scenario: candidate-receipt-mechanical-overlap-lifecycle
title: Mechanical overlap remains blocked until safe retirement
requirement: The system MUST continue applying an active receipt to later mechanical delivery that overlaps its manifest until explicit retirement succeeds, and after retirement MUST evaluate that delivery under its own unchanged declaration, grant and identity gates without claiming candidate verification.
Given: a later mechanical delivery touches a path in an old active receipt manifest.
When: the delivery is evaluated before and after an attempted retirement.
Then: it remains blocked before retirement and after any failed retirement; only after successful retirement does the old receipt cease to apply, without itself authorizing the action or representing it as verified.

## Scenario: candidate-receipt-owner-matched-lock-and-durability
title: Lifecycle mutation has one owner and durable directory transitions
requirement: The system MUST serialize emission and retirement with a PID-and-token owner-matched lock, recover only an identified dead-owner lock through atomic quarantine, and fsync affected directories after rename or unlink on supported Linux and macOS platforms; unsupported directory fsync MUST block the transition explicitly.
Given: a receipt lifecycle operation needs to publish, replace, or remove evidence.
When: the lock is busy, orphaned, replaced, or the filesystem transition completes.
Then: a live or untrusted lock blocks, a proven orphan is recovered by at most one writer, a prior owner cannot release another owner's lock, and success is not reported before supported directory durability is requested.

## Scenario: candidate-receipt-push-remote-and-bounded-observation
title: Retirement observes one explicit push destination within a bounded request
requirement: The system MUST resolve the explicit remote through `git remote get-url --push`, reject zero, multiple, malformed, or non-GitHub push URLs, and observe `gh pr view` through a timeout and AbortSignal-aware adapter that fails closed.
Given: a caller names a local remote and pull request.
When: retirement resolves the remote or queries GitHub.
Then: ambiguity, timeout, cancellation, command failure, or malformed output leaves the active receipt effective.

## Scenario: candidate-receipt-retirement-concurrent-revalidation
title: Concurrent mutation aborts deactivation
requirement: The system MUST serialize cooperating receipt emission and retirement and MUST immediately revalidate active bytes, attempt state, repository/worktree identity and fresh remote completion evidence before deactivation.
Given: retirement has archived an initially matching receipt while the active slot still exists.
When: the receipt, attempt, local identity, or normalized remote observation changes before active-slot removal, or the lifecycle lock cannot be safely acquired.
Then: deactivation is aborted, the active gate remains effective, the conservative archive may be retained for exact retry, and no fallback retirement occurs.

## Scenario: candidate-receipt-successful-retirement
title: Proven merged delivery retires its exact active receipt
requirement: The system MUST retire an active receipt when and only when its current bytes, matching validated attempt, local identities, explicit pull-request identities, and fresh merged completion evidence all match and archive publication completes.
Given: the active receipt and attempt identify the same validated delivery head and the explicitly identified same-repository pull request is freshly observed as merged with that head OID.
When: the explicit retirement operation completes all persistence and revalidation steps.
Then: it returns a deterministic retired result, preserves the original bytes in the retired archive, removes only the matching active slot, and clears the matching attempt.

## Scenario: candidate-receipt-terminal-boundary
title: Only a bound merged pull request is terminal
requirement: The system MUST keep an active candidate receipt effective after a successful commit, push, or pull-request creation/update and MUST permit retirement only when a fresh remote observation proves that the exact validated delivery head belongs to the identified merged pull request.
Given: an active candidate receipt and a delivery attempt with a validated delivery head.
When: only commit, push, or pull-request creation/update has succeeded, or the identified pull request is not merged.
Then: retirement is blocked and the active receipt remains effective; only a freshly observed merged pull request whose recorded head OID equals the validated delivery head satisfies the supported terminal boundary.

## Scenario: candidate-receipt-terminal-cleanup-pending
title: Terminal unlink reports durable-attempt cleanup pending
requirement: The system MUST attempt to clear the matching durable delivery attempt after successful active-slot unlink and report `cleanupPending` with a retry instruction when that cleanup fails; a repeated already-retired call MUST retry cleanup, and no stale attempt may authorize a replacement receipt.
Given: archive publication and active-slot unlink have succeeded for a matching receipt.
When: durable attempt cleanup fails.
Then: the result truthfully records retirement with pending cleanup rather than a clean success or impossible rollback, session state is discarded, and replacement emission refuses to proceed while the stale durable attempt cannot be cleared.

## Scenario: candidate-receipt-tool-manifest-guidance
title: Candidate receipt tool manifest guidance
requirement: The system MUST treat paths discovered by the candidate-receipt tool as suggestions and MUST NOT emit a receipt until the caller supplies an explicit path manifest.
Given: ein_candidate_receipt is invoked for an active change without paths.
When: the tool inspects available changes.
Then: it returns separate tracked and untracked path suggestions for explicit selection without emitting; with an explicit manifest it delegates emission and communicates acceptance or rejection.

## Scenario: candidate-receipt-tree-divergence
title: Candidate receipt tree divergence
requirement: The system MUST define candidateTreeMatches as true only when deterministic reconstruction from the receipt's exact manifest and current declared bytes yields the receipt's candidate tree SHA.
Given: a structurally usable receipt exists with an exact manifest and recorded tree SHA.
When: candidateTreeMatches reconstructs the candidate tree from current state using those paths.
Then: it returns true if and only if the reconstructed tree SHA matches; later changes to declared bytes return false.

## Scenario: canonical-close-readiness
title: Canonical close readiness requires synchronized evidence except for one declarationless legacy escape
requirement: The system MUST block close when canonical spec evidence is unresolved, pending, malformed, stale, or conflicted, except that force MAY admit only an unresolved declarationless legacy record after all non-spec close gates pass and a valid audit reason is supplied; assessment and close MUST NOT synchronize or rewrite specs.
Given: a canonical SDD change has otherwise passing task, apply, verify, summary, naming, source, and archive-destination gates, while its canonical spec evidence is synchronized, pending, conflicted, malformed, stale, or unresolved.
When: close readiness is evaluated normally or with force and an audit reason.
Then: normal close requires synchronized evidence; pending, conflict, malformed, and stale evidence always blocks; only the exact unresolved declarationless legacy shape may close with force and a valid reason, returning distinguishable legacy evidence without reclassifying or synchronizing the spec state.

## Scenario: canonical-context-budget
title: Scope and design use bounded canonical context
requirement: The system MUST resolve only explicit canonical domain hints within a three-file and 32 KiB UTF-8 budget
Given: scope or design receives canonical domain hints for an OpenSpec change
When: it builds canonical spec context
Then: it records each exact path SHA-256 and byte count or blocks with a narrower-selection request without truncation

## Scenario: delivery-receipt-divergence-routes-to-verify
title: Content divergence fails closed and routes to verify
requirement: The system MUST block delivery and visibly route the change back to verify whenever candidate identity is absent, uncertain, stale, malformed, or divergent at a required delivery boundary.
Given: verified SDD delivery reaches one of the four content-identity gates.
When: the required identity cannot be proven equal to the candidate receipt.
Then: the requested delivery action does not proceed, the mismatch boundary and reason are visible, and the next required lifecycle action is verify without automatic recovery or receipt refresh.

## Scenario: delivery-receipt-four-boundary-gates
title: Candidate identity is checked at four delivery boundaries
requirement: The system MUST validate verified candidate content independently before commit, after commit against `HEAD^{tree}`, before push, and before opening or updating a pull request.
Given: verified SDD content has a structurally valid current candidate receipt and delivery intent is authorized.
When: delivery crosses each commit, post-commit, push, and pull-request boundary.
Then: each boundary performs its own current identity check, and no earlier successful check substitutes for a later check.

## Scenario: delivery-receipt-mechanical-declaration
title: Mechanical delivery is explicit and unverified
requirement: The system MUST require trivial or mechanical delivery without a candidate receipt to be explicitly declared and MUST NOT represent that path as verified SDD delivery.
Given: a delivery is classified as trivial or mechanical and no verification receipt applies.
When: delivery authorization is evaluated.
Then: the no-verification declaration is visible, no candidate receipt is fabricated or implied, and the existing user-intent grant remains required and unchanged.

## Scenario: delivery-receipt-post-commit-hook-mutation
title: Post-commit validation detects hook mutation
requirement: The system MUST compare the resulting `HEAD^{tree}` to the receipt candidate tree after commit processing and hooks complete.
Given: pre-commit candidate identity matched the receipt.
When: commit processing or a hook changes the content recorded by the commit.
Then: the post-commit gate detects the unequal tree, blocks subsequent push and pull-request delivery, and routes back to verify.

## Scenario: delivery-receipt-pr-head-match
title: Pull-request head must match validated delivery head
requirement: The system MUST block opening or updating a pull request when its effective head differs from the head whose content identity passed the pre-PR gate.
Given: a pull request is about to be opened or updated for validated delivery content.
When: the system resolves the local and effective pull-request head identities.
Then: it proceeds only when the effective PR head is the validated delivery head; any different or unresolvable head blocks the operation and routes back to verify.

## Scenario: early-phase-status-distinguishes-pending-artifacts-from-blockers
title: Status suppresses only future task absence during early phases
requirement: The system MUST treat absent `tasks.md` as pending work rather than a blocker while the recommended phase is scope, map, or design, and MUST surface actionable task, apply, and verify blockers once their downstream phases are reached.
Given: an SDD change is in an early phase without `tasks.md`, or has reached tasks, apply, or verify with an actionable artifact problem.
When: lifecycle status or next-step diagnostics are resolved.
Then: early-phase diagnostics do not report absent `tasks.md` as a blocker, while absent, unreadable, malformed, or blocked tasks and incomplete or blocked apply and failed or unknown verify outcomes remain visible at their applicable downstream phases.

## Scenario: explicit-sdd-startup-bootstraps-config-and-enters-scope
title: Explicit SDD startup creates or preserves configuration before scope
requirement: The system MUST create missing OpenSpec configuration during an explicit SDD request, MUST preserve the exact existing `openspec/config.yaml` bytes when configuration already exists, and MUST continue the original request to `sdd-scope` without requiring manual initialization.
Given: a user explicitly requests SDD and `openspec/config.yaml` is either absent or already contains user-provided bytes.
When: SDD startup preparation completes.
Then: a missing configuration is created, existing configuration bytes are unchanged, and the original request continues to `sdd-scope` without requiring `/sdd-init`, a repeated request, or a separate initialization confirmation.

## Scenario: forced-close-explicit-legacy-escape
title: Declarationless unresolved legacy close is narrow and auditable
requirement: The system MUST allow forced close only for an unresolved spec state caused solely by the declarationless legacy record shape after all non-spec close-readiness gates pass, and MUST distinguish that result from normal close by returning legacy escape evidence and a non-empty valid reason.
Given: a canonical legacy SDD change has an unresolved state caused solely by a readable declarationless scope, no delta document, no sync-report.md, all non-spec close-readiness gates pass, and the caller explicitly supplies force and a valid audit reason.
When: forced close readiness and archival are evaluated.
Then: the system may archive through the legacy escape, returns distinguishable legacy evidence with the reason without reclassifying or synchronizing the unresolved state, and does not weaken normal close or admit incomplete modern changes.

## Scenario: forced-close-preserves-readiness-gates
title: Forced close cannot archive incomplete or unverified work
requirement: The system MUST preserve task, apply, verify, summary, and canonical-spec readiness gates when forced close is requested and MUST NOT archive a change with pending tasks, incomplete apply, missing, failing, or stale verify evidence, missing or stale summary evidence, or an OpenSpec conflict.
Given: an SDD change is not fully close-ready because one or more required lifecycle conditions are incomplete, absent, failing, stale, or conflicted.
When: close is requested with force enabled.
Then: the change remains active, every applicable blocker is reported, and force does not classify or archive the change as complete.

## Scenario: legacy-sdd-fallback
title: Legacy SDD changes retain their lifecycle
requirement: The system MUST preserve legacy lifecycle behavior when changes resolve through the .sdd fallback
Given: a project has only a .sdd changes directory with valid legacy artifacts
When: its status or close readiness is evaluated
Then: canonical spec declarations are not required and no canonical specs deltas or reports are written under .sdd

## Scenario: structured-run-cost-attribution-and-provenance
title: SDD cost aggregates are attributable, truthful, and reproducible
requirement: The system MUST use the local delegation hook to mint and persist structured flowId, exact changeId, canonical phase, runId, attempt, retry ordinal, and timestamps, and MUST bind a receipt only to one exact changed canonical phase artifact and one stable-read new or changed producer metadata artifact. It MUST fail closed and persist no receipt when phase or metadata candidates are zero, multiple, unreadable, unstable, mismatched, or otherwise ambiguous; task text, prefixes, substrings, filenames, agent names, and later prose MUST NOT supply identity. The system MUST preserve independent reported, estimated, or unavailable states for input, output, cache-read, cache-write, provider cost, estimated cost, and duration; unqualified usage.cost MUST be neither provider-reported nor estimated cost. It MUST validate and deduplicate local sidecars before aggregation, expose sorted exact memberRunIds for change, phase, and attempt/retry aggregates, keep cache metrics separate, and make an incomplete metric unavailable rather than zero or a partial total. Metadata without a valid local sidecar MUST be visibly excluded as legacy or rejected. Status MUST retain existing lifecycle fields and the realCost compatibility slot while exposing the provenance ledger; costUsd MUST alias only complete provider-reported cost. The adapter MUST preserve the existing conservative timeout reconciliation as its sole authority and MUST NOT introduce numeric token or cost gates or external package changes.
Given: SDD runs include similar change names, retries, later prose mentions, zero, multiple, unreadable, unstable, or ambiguous candidates, partial provider metrics, unqualified usage.cost, legacy metadata without sidecars, or timeout reconciliation observations.
When: the local hook records a receipt or status produces change, phase, or attempt/retry aggregates.
Then: only the locally owned exact stable bindings determine membership; rejected candidates create visible bounded problems and no receipt; each accepted run is counted at most once in every applicable aggregate; metric provenance remains distinct; unavailable values are not rendered as zero or partial totals; provider cost is never inferred from usage.cost or estimates; legacy records do not contribute; aggregate memberRunIds reproduce each total; and lifecycle status compatibility, routing, acceptance, and timeout reconciliation behavior remain unchanged.
