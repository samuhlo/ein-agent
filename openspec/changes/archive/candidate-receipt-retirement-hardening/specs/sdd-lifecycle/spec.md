# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED

### Scenario: candidate-receipt-durable-attempt
title: Validated delivery attempt survives restart only for its exact receipt
requirement: The system MUST persist a validated delivery attempt under the worktree git directory with repository ID, worktree ID, receipt fingerprint, and validated delivery HEAD; it MUST recover that attempt after restart only when every stored identity and the current active receipt match, and MUST fail closed for missing, corrupt, stale, or mismatched state.
Given: a post-commit boundary validates one delivery head for an active receipt.
When: retirement runs in the same or a later process.
Then: it may use only the matching durable attempt; emitting a replacement or completing matching retirement clears both durable and in-memory attempt state.

### Scenario: candidate-receipt-push-remote-and-bounded-observation
title: Retirement observes one explicit push destination within a bounded request
requirement: The system MUST resolve the explicit remote through `git remote get-url --push`, reject zero, multiple, malformed, or non-GitHub push URLs, and observe `gh pr view` through a timeout and AbortSignal-aware adapter that fails closed.
Given: a caller names a local remote and pull request.
When: retirement resolves the remote or queries GitHub.
Then: ambiguity, timeout, cancellation, command failure, or malformed output leaves the active receipt effective.

### Scenario: candidate-receipt-owner-matched-lock-and-durability
title: Lifecycle mutation has one owner and durable directory transitions
requirement: The system MUST serialize emission and retirement with a PID-and-token owner-matched lock, recover only an identified dead-owner lock through atomic quarantine, and fsync affected directories after rename or unlink on supported Linux and macOS platforms; unsupported directory fsync MUST block the transition explicitly.
Given: a receipt lifecycle operation needs to publish, replace, or remove evidence.
When: the lock is busy, orphaned, replaced, or the filesystem transition completes.
Then: a live or untrusted lock blocks, a proven orphan is recovered by at most one writer, a prior owner cannot release another owner's lock, and success is not reported before supported directory durability is requested.

### Scenario: candidate-receipt-durable-archive-ancestry
title: New archive ancestors are durable before terminal deactivation
requirement: The system MUST create each previously absent archive directory explicitly and fsync that directory and its parent before unlinking the active receipt on supported Linux and macOS platforms; unsupported directory synchronization or any directory synchronization error MUST block the transition.
Given: retirement needs a fingerprint archive directory that does not yet exist.
When: it publishes the receipt and retirement metadata before deactivation.
Then: every new ancestor and its parent are synchronized before the active slot is unlinked, and the active slot parent is synchronized after unlink; no success is reported on an unsupported platform or a failed directory fsync.

### Scenario: candidate-receipt-immutable-retirement-metadata
title: Retirement metadata publication never overwrites a concurrent writer
requirement: The system MUST publish `retirement.json` with the same immutable no-replace protocol as the archived receipt: a flushed temporary file, exclusive link or equivalent no-replace primitive, directory synchronization, and byte comparison on EEXIST.
Given: archive receipt bytes are complete and retirement metadata is about to be published.
When: another writer creates matching or conflicting metadata between local inspection and publication.
Then: matching bytes may be reused, conflicting or unreadable bytes block retirement, and the active slot remains effective without overwriting evidence.

### Scenario: candidate-receipt-terminal-cleanup-pending
title: Terminal unlink reports durable-attempt cleanup pending
requirement: The system MUST attempt to clear the matching durable delivery attempt after successful active-slot unlink and report `cleanupPending` with a retry instruction when that cleanup fails; a repeated already-retired call MUST retry cleanup, and no stale attempt may authorize a replacement receipt.
Given: archive publication and active-slot unlink have succeeded for a matching receipt.
When: durable attempt cleanup fails.
Then: the result truthfully records retirement with pending cleanup rather than a clean success or impossible rollback, session state is discarded, and replacement emission refuses to proceed while the stale durable attempt cannot be cleared.
