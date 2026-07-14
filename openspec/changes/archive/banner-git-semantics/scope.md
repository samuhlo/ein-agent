# Truthful Git semantics in the agent banner

Replace the banner's ambiguous Git shorthand with a compact contract that keeps local worktree changes separate from the branch's commit relation to its configured upstream. The banner must remain fast, localized, useful at narrow widths, and honest when upstream information is pending or unavailable.

## SCOPE PACKET

```yaml
scope: Replace the ambiguous agent-banner Git display (`GIT … ○N`, vague `⚠ pull`) with a truthful compact semantic contract that clearly separates local worktree state from upstream commit state. Define exact units and wording for local changes and upstream relations, preserve asynchronous non-blocking behavior, localization, and narrow-width degradation, and produce a verified handoff for `readme-release-ia` without editing README.
change_name: banner-git-semantics
webfetch: false
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Known baseline

Treat this evidence as established; mapping should validate only the bounded implementation seams rather than rediscover the repository broadly.

- Agent-banner Git logic lives in `ein-pi/agent/extensions/ein-banner.ts`.
- The current `computeGitSync()` counts lines from `git status --porcelain` and renders values such as `○3`. That value is three porcelain status entries, not three commits and not a guaranteed unique-file count.
- Existing remote states include synced, ahead/unpushed, a vague pull state that can collapse behind and diverged, local-only, and unknown.
- Remote lookup is already deferred/asynchronous.
- This banner is independent of the installer TUI version banner changed by the updater workstream.

## User-visible semantic contract

The implementation may refine punctuation and translated wording during design, but it must preserve these concepts and units.

### 1. Local worktree state

Local state is reported independently of upstream state.

| State | Required meaning | Required compact wording concept |
|---|---|---|
| Clean | No entries from porcelain status. | `local clean` |
| Staged | Count of porcelain entries whose index status is changed. | `staged N` |
| Unstaged | Count of porcelain entries whose worktree status is changed. | `unstaged N` |
| Untracked | Count of untracked porcelain entries. | `untracked N` |
| Mixed | Show the applicable staged, unstaged, and untracked categories together; do not collapse them into an unexplained circle count. | `staged N · unstaged N · untracked N` as space permits |

Local counts are **porcelain status entries classified by status column**, not commits. A single entry may be both staged and unstaged and therefore appear in both category counts; category counts must not be presented as an additive unique-file total. If an aggregate local count is retained at any width, it must be explicitly labeled as status entries or local changes and must not use commit-like or unexplained decorative notation.

### 2. Upstream commit relation

Upstream state is the commit relation to the branch's configured local tracking ref. Counts are commits derived from ahead/behind ancestry; they do not claim that the remote server was contacted or fetched during rendering.

| State | Required meaning | Required compact wording concept |
|---|---|---|
| Synced | Zero commits ahead and zero behind the configured tracking ref. | `upstream synced` |
| Ahead | Local branch is ahead only. | `ahead N commits` |
| Behind | Local branch is behind only. | `behind N commits` |
| Diverged | Both sides contain commits absent from the other. | `ahead N · behind M commits` or equally explicit localized text |
| Local-only / no upstream | A branch exists but has no configured upstream. | `no upstream` or `local branch` |
| Detached | `HEAD` is detached; branch/upstream claims are not applicable. | `detached HEAD` |
| Loading | The asynchronous probe has not completed. | `upstream loading` |
| Unavailable / error | Git or tracking-ref information could not be read. | `upstream unavailable` or `upstream unknown` |
| Offline | Use `offline` only when that condition is actually distinguishable; never translate an arbitrary process error into a network claim. | `upstream offline` only with evidence |

Behind and diverged must remain distinct. The old vague `pull` wording is not an acceptable replacement because it hides whether local-only commits also exist and sounds like an action rather than a state.

## In scope

1. Define a small, explicit state model that keeps worktree categories and upstream commit relation as separate values.
2. Update banner computation and rendering for clean, staged, unstaged, untracked, mixed, synced, ahead, behind, diverged, no-upstream, detached, loading, and unavailable/error states.
3. Preserve deferred asynchronous upstream probing and cached/stateful refresh behavior; banner rendering itself must not perform network work or block on Git.
4. Use locally available Git metadata only. No implicit `fetch`, `pull`, `push`, or other repository mutation is allowed.
5. Preserve the existing bilingual/localized convention. New user-visible terms must have equivalent supported-language variants rather than mixed-language fallback strings.
6. Preserve narrow-terminal behavior through progressive degradation:
   - keep local and upstream concepts distinguishable;
   - prefer meaningful text over decorative circles;
   - remove optional detail before removing the state label;
   - never degrade behind or diverged into a misleading synced/ahead state.
7. Add deterministic tests using fake Git/process results and controlled asynchronous completion; tests must not depend on a real remote, network access, or mutations to the repository under test.
8. Produce verification evidence suitable for the exact downstream consumer `readme-release-ia`. README work remains blocked until this change's wording and behavior are verified.

## Acceptance criteria

- [ ] Local worktree state and upstream commit relation are computed, modeled, and rendered independently.
- [ ] No local count can reasonably be read as a commit count: local units are named and upstream counts explicitly use commits.
- [ ] Clean, staged-only, unstaged-only, untracked-only, and mixed local states have deterministic coverage.
- [ ] Ahead and behind commit counts are accurate, and diverged displays both counts without collapsing to `pull`.
- [ ] Synced means zero ahead and zero behind relative to the configured local tracking ref; it does not imply a network refresh.
- [ ] No-upstream/local-only and detached HEAD are explicit and are not reported as synced, loading forever, or generic pull states.
- [ ] Loading is visible while the deferred probe is unresolved; unavailable/error remains truthful and does not fabricate counts.
- [ ] `offline` is shown only when supported by evidence; otherwise the banner uses unavailable/unknown wording.
- [ ] Rendering performs no network operation and does not synchronously wait for remote/upstream probing.
- [ ] Supported locales express equivalent semantics, and narrow widths retain truthful labels while dropping optional detail first.
- [ ] Focused tests use fake Git/process behavior for clean, staged, unstaged, untracked, mixed, ahead, behind, diverged, local-only, detached, loading, and unavailable/error scenarios.
- [ ] Verification records the accepted wording and state table as the handoff to `readme-release-ia`; README is not edited in this change.

## Non-goals and hard boundaries

- Git mutations or repository-management actions, including fetch, pull, push, commit, checkout, branch creation/deletion, or upstream configuration.
- Branch-management UI or recommendations about how users should resolve divergence.
- Installer updater semantics or the installer TUI version banner.
- README rewriting or other `readme-release-ia` implementation.
- Homebrew, Engram, release publication, release automation, or unrelated banner redesign.
- Broad changes to banner layout, color system, branding, or non-Git status indicators.
- Real-network or real-remote tests.
- Rewriting, deleting, staging, or otherwise disturbing unrelated untracked work or merged updater/Engram code.

## Review workload forecast

- **Production target:** below 400 changed production lines.
- **Expected production surface:** the existing agent-banner Git state computation/rendering seam plus localization data only if that data is stored separately.
- **Test surface:** focused fake process/Git cases; test lines are reported separately from the 400-line production budget.
- **Risk level:** medium, because the visible copy, asynchronous state transitions, Git edge cases, and narrow-width behavior interact.
- **Delivery shape:** one PR is preferred if production work stays below 400 lines. Split only if mapping reveals an independently reviewable prerequisite; do not inflate this scope.

Suggested review order:

1. Validate the state model and units before visual punctuation or color.
2. Review asynchronous transitions and error truthfulness.
3. Review localization and narrow-width degradation.
4. Review deterministic scenario coverage and the `readme-release-ia` handoff gate.

## Risks

- Local tracking refs can be stale without a fetch. Wording must describe the known tracking relation, not imply live remote freshness.
- Porcelain categories can overlap for an entry changed both in the index and worktree. The UI must not imply that category counts add up to unique files.
- Aggressive width reduction can erase the distinction between worktree and upstream state. Degradation must remove detail before semantics.
- A generic Git-process failure does not prove the machine is offline. Error copy must avoid inventing a network diagnosis.
- Tests that shell out to a real repository or remote would be flaky and could mutate developer state; injected/fake process results are required.

## Exit condition for scope

This scope is ready for `sdd-map` when mapping remains bounded to the agent-banner Git computation/rendering path, its localization seam, and deterministic fake-process tests. Documentation work must remain assigned to `readme-release-ia` and cannot start until this change has an accepted verification report.
