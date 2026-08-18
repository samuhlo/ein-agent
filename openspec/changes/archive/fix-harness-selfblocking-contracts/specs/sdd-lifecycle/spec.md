# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: sdd-participant-passage-scope-bounded-seal
title: Seal the participant passage to the declared apply scope
requirement: The system MUST seal an SDD participant passage with an identity derived only from the repository root identity and, for each declared changed file, its path, device, inode, mode, and content digest, and MUST NOT derive that seal from the whole-tree Git status, HEAD, branch, or any file outside the declared scope.
Given: a participant passage planned over one declared changed file
When: an unrelated untracked file is written elsewhere in the repository before admission
Then: the participant is admitted and the passage is not reported as stale source state

### Scenario: sdd-participant-passage-fails-on-declared-scope-change
title: Refuse admission when the declared scope changed
requirement: The system MUST refuse participant admission when the bytes or the filesystem identity of any declared changed file differ from the values sealed at plan time.
Given: a participant passage planned over one declared changed file
When: that file is rewritten in place with the same inode and mode but different bytes
Then: admission returns the stale-source blocker and the participant does not run

### Scenario: sdd-participant-seal-accepts-legacy-and-mints-scoped
title: Accept persisted legacy seals while minting only scope-bounded ones
requirement: The system MUST accept both the scope-bounded seal and the legacy whole-tree seal when parsing persisted participant fields, MUST mint only the scope-bounded seal, and MUST leave the checkpoint and verification state-reference validators unchanged.
Given: a stored continuity checkpoint whose participants carry legacy whole-tree seals
When: the checkpoint is parsed and a participant passage is planned
Then: parsing succeeds, the participants are re-minted with a scope-bounded seal, and the prior participant evidence is cleared

### Scenario: sdd-participant-evidence-survives-continuity-refresh
title: Preserve participant evidence across a continuity refresh
requirement: The system MUST carry recorded SDD participant evidence unchanged into a refreshed continuity checkpoint and MUST NOT discard it because the whole-tree state reference moved.
Given: a continuity checkpoint holding a completed cleaner result
When: the continuity lifecycle refreshes after the whole-tree state reference changed
Then: the stored cleaner evidence is still present and unchanged

### Scenario: sdd-runtime-state-not-seen-as-repository-change
title: Keep SDD runtime state out of the repository change surface
requirement: The system MUST manage an ignore entry covering the SDD continuity checkpoint written under the OpenSpec change board, including archived change directories, and MUST expose that entry from the single managed ignore block.
Given: a project whose ignore file was produced by the managed ignore block
When: the SDD continuity checkpoint is written under a change directory or that directory is archived
Then: the checkpoint is not reported as an untracked repository change and the whole-tree state reference is unchanged by the write

### Scenario: sdd-apply-progress-declares-changed-files
title: Declare the passage scope in apply-progress
requirement: The system MUST require exactly one changed-files section in the apply progress artifact, listing each repository-relative path in backticks, as the machine-read scope of the participant passage and as the only permitted file list in that artifact.
Given: an apply progress artifact written to the documented changed-files grammar
When: a participant passage is planned from that artifact
Then: the plan succeeds and the passage scope equals exactly the declared paths
