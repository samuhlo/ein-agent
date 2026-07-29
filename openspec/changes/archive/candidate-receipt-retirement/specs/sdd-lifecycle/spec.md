# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED

### Scenario: candidate-receipt-terminal-boundary
title: Only a bound merged pull request is terminal
requirement: The system MUST keep an active candidate receipt effective after a successful commit, push, or pull-request creation/update and MUST permit retirement only when a fresh remote observation proves that the exact validated delivery head belongs to the identified merged pull request.
Given: an active candidate receipt and a delivery attempt with a validated delivery head.
When: only commit, push, or pull-request creation/update has succeeded, or the identified pull request is not merged.
Then: retirement is blocked and the active receipt remains effective; only a freshly observed merged pull request whose recorded head OID equals the validated delivery head satisfies the supported terminal boundary.

### Scenario: candidate-receipt-explicit-retirement-trigger
title: Retirement is an explicit deterministic operation
requirement: The system MUST expose candidate-receipt retirement through an explicit deterministic operation with explicit change, receipt fingerprint, remote, base ref, head ref, and pull-request identity, and MUST NOT infer retirement from prose, keywords, age, branch movement, or a later delivery request.
Given: an active candidate receipt appears eligible for retirement.
When: no explicit retirement operation with the required identities is invoked.
Then: the receipt remains active regardless of user wording, elapsed time, local HEAD movement, or overlap with later work.

### Scenario: candidate-receipt-bound-retirement-evidence
title: Retirement evidence binds the current candidate and delivery identity
requirement: The system MUST bind first-time retirement to the SHA-256 of the current active receipt bytes, the matching attempt fingerprint and validated delivery head, current repository and worktree identities, and the exact remote repository, base ref, head ref, pull-request number and URL observed for completion.
Given: an active receipt, attempt, repository/worktree, and pull-request observation are available.
When: retirement evidence is evaluated.
Then: every bound identity must resolve and match the same candidate and merged pull request; any missing, corrupt, ambiguous, or mismatched value blocks retirement.

### Scenario: candidate-receipt-fresh-network-truth
title: First-time retirement requires fresh remote truth
requirement: The system MUST obtain completion evidence through a fresh in-operation remote observation and MUST fail closed when GitHub or the selected remote is unavailable, unauthenticated, malformed, stale or caller-supplied, unresolved, unmerged, forked, or divergent from the explicit identities.
Given: an active receipt whose caller supplies a pull-request identity.
When: the retirement operation observes the remote completion state.
Then: it accepts only a freshly resolved same-repository merged pull request with a non-empty merge result and a recorded head OID equal to the validated delivery head; otherwise the active receipt remains.

### Scenario: candidate-receipt-successful-retirement
title: Proven merged delivery retires its exact active receipt
requirement: The system MUST retire an active receipt when and only when its current bytes, matching validated attempt, local identities, explicit pull-request identities, and fresh merged completion evidence all match and archive publication completes.
Given: the active receipt and attempt identify the same validated delivery head and the explicitly identified same-repository pull request is freshly observed as merged with that head OID.
When: the explicit retirement operation completes all persistence and revalidation steps.
Then: it returns a deterministic retired result, preserves the original bytes in the retired archive, removes only the matching active slot, and clears the matching attempt.

### Scenario: candidate-receipt-archive-before-deactivate
title: Exact receipt bytes are archived before deactivation
requirement: The system MUST publish and verify the active receipt bytes byte-for-byte in a collision-safe fingerprint archive, with separate matching retirement metadata, before removing the active slot; partial publication, conflicting bytes or metadata, or active removal failure MUST fail closed.
Given: retirement has passed its initial identity and completion checks.
When: archive publication or active-slot removal is attempted.
Then: the active slot remains effective until exact archived bytes and matching immutable metadata are complete; an interrupted transition may leave both active and archived evidence but must never leave neither, and no conflict is overwritten.

### Scenario: candidate-receipt-idempotent-retirement
title: Already-retired calls verify immutable local evidence
requirement: The system MUST treat repeated retirement of the same fingerprint as an idempotent already-retired result only after verifying exact archived payload bytes and all stored retirement identities, and MUST NOT overwrite conflicting archive evidence or claim a new remote observation.
Given: the active slot is absent and a retired archive is addressed by the explicit receipt fingerprint.
When: the same retirement operation is repeated.
Then: matching payload bytes and metadata return already-retired without mutation; missing, corrupt, or mismatched archive evidence fails closed.

### Scenario: candidate-receipt-invalid-attempt-or-receipt
title: Missing or invalid active evidence cannot retire
requirement: The system MUST keep the active receipt effective when its raw bytes cannot be read, parsed, freshly validated or matched to the explicit and attempt fingerprints, or when the attempt or validated delivery head is missing or mismatched.
Given: an active slot with missing, corrupt, replaced or mismatched receipt or attempt evidence.
When: first-time retirement is requested.
Then: retirement is blocked without deleting or reclassifying the active evidence and without falling back to mechanical-unverified delivery.

### Scenario: candidate-receipt-attempt-rotation
title: Stale attempt state cannot authorize another candidate
requirement: The system MUST clear current-session attempt state before publishing a replacement receipt, retain a matching attempt until retirement deactivates its receipt, clear it after successful deactivation, and compare attempt fingerprint to current raw receipt bytes at every authorization decision.
Given: an attempt was created for an earlier receipt and a later receipt or candidate becomes current.
When: the stale attempt is presented to a delivery or retirement decision.
Then: fingerprint mismatch blocks its use, and no validated delivery head from the earlier candidate authorizes the later receipt.

### Scenario: candidate-receipt-mechanical-overlap-lifecycle
title: Mechanical overlap remains blocked until safe retirement
requirement: The system MUST continue applying an active receipt to later mechanical delivery that overlaps its manifest until explicit retirement succeeds, and after retirement MUST evaluate that delivery under its own unchanged declaration, grant and identity gates without claiming candidate verification.
Given: a later mechanical delivery touches a path in an old active receipt manifest.
When: the delivery is evaluated before and after an attempted retirement.
Then: it remains blocked before retirement and after any failed retirement; only after successful retirement does the old receipt cease to apply, without itself authorizing the action or representing it as verified.

### Scenario: candidate-receipt-retirement-concurrent-revalidation
title: Concurrent mutation aborts deactivation
requirement: The system MUST serialize cooperating receipt emission and retirement and MUST immediately revalidate active bytes, attempt state, repository/worktree identity and fresh remote completion evidence before deactivation.
Given: retirement has archived an initially matching receipt while the active slot still exists.
When: the receipt, attempt, local identity, or normalized remote observation changes before active-slot removal, or the lifecycle lock cannot be safely acquired.
Then: deactivation is aborted, the active gate remains effective, the conservative archive may be retained for exact retry, and no fallback retirement occurs.

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
