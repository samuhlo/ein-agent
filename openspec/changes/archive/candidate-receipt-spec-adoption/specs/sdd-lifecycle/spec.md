# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: candidate-receipt-emission-preconditions
title: Candidate receipt emission preconditions
requirement: The system MUST emit a candidate receipt only inside a repository with a resolvable HEAD, for a safe existing SDD change whose apply phase is complete and whose current verify evidence is fresh and passing.
Given: an SDD change exists and a candidate receipt is requested.
When: the system evaluates the repository, HEAD, change safety and existence, apply state, and current verify evidence.
Then: it emits only when every precondition is met; any absence, incomplete state, failing verify result, or stale evidence rejects without a receipt.

### Scenario: candidate-receipt-explicit-path-manifest
title: Candidate receipt explicit path manifest
requirement: The system MUST require an explicit, duplicate-free manifest of exact changed file paths, support added, modified, deleted, and renamed files, and reject broad or non-exact path selection.
Given: the caller declares the paths whose bytes compose the candidate.
When: the system validates the manifest against current tracked and untracked changes.
Then: it accepts concrete added, modified, or deleted files and renames declaring both old and new paths; it rejects empty or duplicate manifests, directories, absolute paths, .. escapes, magic pathspecs, nonexistent paths, or unchanged files.

### Scenario: candidate-receipt-isolated-candidate-tree
title: Candidate receipt isolated candidate tree
requirement: The system MUST build a deterministic candidate tree from HEAD and only the explicit manifest through an isolated temporary Git index, without mutating the real index or worktree.
Given: an exact validated manifest exists and unrelated staging may be present.
When: the system incorporates declared additions, modifications, deletions, and renames into a temporary index and writes the candidate tree.
Then: the tree SHA represents only HEAD plus declared bytes, the real staging and worktree remain intact, and the temporary index is removed on both success and error.

### Scenario: candidate-receipt-identity-and-atomic-publication
title: Candidate receipt identity and atomic publication
requirement: The system MUST atomically publish a local versioned receipt bound to the repository, worktree, change, HEAD, candidate tree, ordered paths, current verify report, and declared verification commands.
Given: emission preconditions and the candidate tree are valid.
When: the system creates the receipt.
Then: it binds repository and worktree identities, change, HEAD, branch, tree SHA, ordered paths and their digest, current verify-report digest, declared commands and their digest, and date; it publishes by atomic replacement under the git-dir rather than as versioned content.

### Scenario: candidate-receipt-fail-closed-current-evidence
title: Candidate receipt fail-closed current evidence
requirement: The system MUST fail closed when a candidate receipt is missing, corrupt, unsupported, internally inconsistent, mismatched to its repository, worktree, change, HEAD, paths, report, or commands, or stale relative to current apply and verify evidence.
Given: a consumer attempts to validate candidate-receipt evidence for a change.
When: the system loads and compares the receipt with its structure, version, digests, identity, and current SDD evidence.
Then: it accepts only a complete match; absence, read or JSON errors, invalid fields, unsupported version, inconsistent digest, distinct identity, missing or changed verify report, later apply, or invalidated precondition rejects.

### Scenario: candidate-receipt-tree-divergence
title: Candidate receipt tree divergence
requirement: The system MUST define candidateTreeMatches as true only when deterministic reconstruction from the receipt's exact manifest and current declared bytes yields the receipt's candidate tree SHA.
Given: a structurally usable receipt exists with an exact manifest and recorded tree SHA.
When: candidateTreeMatches reconstructs the candidate tree from current state using those paths.
Then: it returns true if and only if the reconstructed tree SHA matches; later changes to declared bytes return false.

### Scenario: candidate-receipt-tool-manifest-guidance
title: Candidate receipt tool manifest guidance
requirement: The system MUST treat paths discovered by the candidate-receipt tool as suggestions and MUST NOT emit a receipt until the caller supplies an explicit path manifest.
Given: ein_candidate_receipt is invoked for an active change without paths.
When: the tool inspects available changes.
Then: it returns separate tracked and untracked path suggestions for explicit selection without emitting; with an explicit manifest it delegates emission and communicates acceptance or rejection.

### Scenario: candidate-receipt-delivery-limit
title: Candidate receipt delivery limit
requirement: The system MUST NOT treat a candidate receipt as authorization or enforcement for commit, push, pull request, or any other delivery action, and MUST NOT provide a mechanical or non-SDD emission lane in this adoption.
Given: a valid candidate receipt exists or a request occurs outside the SDD cycle.
When: the system evaluates whether the receipt enables delivery or can be emitted without current SDD evidence.
Then: the receipt only attests to the verified candidate; it neither blocks nor authorizes delivery and does not enable a mechanical or non-SDD lane.
