# OpenSpec Specification
format: openspec-spec/v1
domain: sdd-lifecycle

## Scenario: candidate-receipt-delivery-limit
title: Candidate receipt delivery enforcement
requirement: The system MUST keep user-intent authorization separate from candidate-content authorization, MUST enforce candidate receipt identity for verified SDD delivery, and MUST allow trivial or mechanical delivery only through an explicit declaration that no verification receipt applies.
Given: a delivery action is requested with an existing user-intent grant.
When: the system determines whether commit, push, or pull-request delivery may proceed.
Then: the unchanged intent grant authorizes only the action, a matching candidate receipt authorizes only verified content, and an explicitly declared trivial or mechanical delivery neither emits nor claims verification evidence.

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

## Scenario: candidate-receipt-fail-closed-current-evidence
title: Candidate receipt fail-closed current evidence
requirement: The system MUST fail closed when a candidate receipt is missing, corrupt, unsupported, internally inconsistent, mismatched to its repository, worktree, change, HEAD, paths, report, or commands, or stale relative to current apply and verify evidence.
Given: a consumer attempts to validate candidate-receipt evidence for a change.
When: the system loads and compares the receipt with its structure, version, digests, identity, and current SDD evidence.
Then: it accepts only a complete match; absence, read or JSON errors, invalid fields, unsupported version, inconsistent digest, distinct identity, missing or changed verify report, later apply, or invalidated precondition rejects.

## Scenario: candidate-receipt-identity-and-atomic-publication
title: Candidate receipt identity and atomic publication
requirement: The system MUST atomically publish a local versioned receipt bound to the repository, worktree, change, HEAD, candidate tree, ordered paths, current verify report, and declared verification commands.
Given: emission preconditions and the candidate tree are valid.
When: the system creates the receipt.
Then: it binds repository and worktree identities, change, HEAD, branch, tree SHA, ordered paths and their digest, current verify-report digest, declared commands and their digest, and date; it publishes by atomic replacement under the git-dir rather than as versioned content.

## Scenario: candidate-receipt-isolated-candidate-tree
title: Candidate receipt isolated candidate tree
requirement: The system MUST build a deterministic candidate tree from HEAD and only the explicit manifest through an isolated temporary Git index, without mutating the real index or worktree.
Given: an exact validated manifest exists and unrelated staging may be present.
When: the system incorporates declared additions, modifications, deletions, and renames into a temporary index and writes the candidate tree.
Then: the tree SHA represents only HEAD plus declared bytes, the real staging and worktree remain intact, and the temporary index is removed on both success and error.

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
title: Canonical spec evidence gates close
requirement: The system MUST block close when canonical spec evidence is unresolved, pending, malformed, stale, or conflicted
Given: an OpenSpec change has canonical spec declaration and synchronization evidence
When: close readiness is assessed including with legacy force
Then: only synchronized evidence permits close and the assessment does not synchronize or rewrite specs

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

## Scenario: legacy-sdd-fallback
title: Legacy SDD changes retain their lifecycle
requirement: The system MUST preserve legacy lifecycle behavior when changes resolve through the .sdd fallback
Given: a project has only a .sdd changes directory with valid legacy artifacts
When: its status or close readiness is evaluated
Then: canonical spec declarations are not required and no canonical specs deltas or reports are written under .sdd
