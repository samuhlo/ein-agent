# Tasks — harness-discipline

status: ready
blocked_by: none

## // 001. Pure function: `commandIsExplicitlyAllowed()` with flag inspection and segment splitting

- [x] 1.1 Add RED tests in `tests/guardrails.test.ts` covering allowlist matching: whole-command parsing with operator splits (`&&`, `||`, `;`, `|`, newline), per-subcommand flag inspection (long flags, short flags, bundled short flags), rejection of command substitution and redirection (`` ` ``, `$(`, `<`, `>`), and assertion that safe git subcommands (status, diff, log) are promotable while destructive variants (branch -D, commit --amend, add -i) are not.
  - skills: `ein-discipline`, `comment-style`
  - why: Encodes the entire allowlist matching contract before the function exists; establishes proof that flag bundling (`-rd`) and negation logic (allow-before-deny) are handled correctly.
  - learn: Bundled short flags must be scanned letter-by-letter; a single dangerous flag in a bundle disqualifies the whole command. Whole-command evaluation means every operator-separated segment must be safe.
  - architecture: `commandIsExplicitlyAllowed()` owns pattern matching, flag inspection, and segment splitting; it is pure and has no side effects or file I/O. Callers pass the raw command string; the function returns a boolean only.
  - avoid: Using negative lookahead regex; instead use explicit flag token lists (short and long) and per-letter scanning of `^-[A-Za-z]+$` bundles. Do not attempt to validate message content in git commit or make the function interpreter-aware.
  - verify: `bun test tests/guardrails.test.ts`

- [x] 1.2 GREEN-implement `commandIsExplicitlyAllowed(command: string): boolean` in `ein-pi/agent/lib/guardrails.ts`, including: a helper to split on operators and trim, a per-subcommand flag-inspection table (branch/commit/add/status/diff/log), letter-by-letter scanning of short-flag bundles, and rejection logic for command substitution and redirection metacharacters. The function returns `true` only when all segments match allowlisted subcommands with zero blocked flags and no metacharacters.
  - skills: `ein-discipline`, `architecture`, `comment-style`
  - why: Supplies the predicate that guards will call for allowlist decisions, ready for precedence evaluation.
  - learn: Flag rejection is explicit, not a regex lookahead; bundled short flags expose dangers that standalone short flags hide. Comments must explain why each flag is blocked (history rewriting, mutating, interactive editor hang).
  - architecture: Export as a pure function from guardrails.ts alongside existing decision patterns; do not modify `confirmCommand()` or Pi runtime. The guard in `cc-ein/` will call this; Pi will not.
  - avoid: Storing patterns in settings.json (they belong in code); reusing Pi's confirmation patterns (allowlist is a separate safety layer); changing DENIED_BASH_PATTERNS or CONFIRM_BASH_PATTERNS.
  - verify: `bun test tests/guardrails.test.ts`

- [x] 1.3 TRIANGULATE edge cases and platform-neutral parsing: empty command string, single-segment vs. multi-segment commands with all-safe and mixed-safety segments, flags with values (`-m "msg"`), subcommand aliases (if any), and correct rejection of `git commit` without a message source. REFACTOR only for naming/duplication; flag tables and precedence remain unchanged.
  - skills: `ein-discipline`, `architecture`
  - why: Confirms the function's invariants across the full matrix before consuming it in the guard.
  - learn: A command like `git commit -m "msg"` is promotable; a bare `git commit` opening an editor is not. Multi-segment commands with a single bad segment (e.g., `git status && git reset --hard`) must be rejected.
  - architecture: Keep the function deterministic; it never reads files or consults state. Tests inject realistic git workflows.
  - avoid: Permission-bit fixtures or assuming umask; focus on command parsing and flag presence.
  - verify: `bun test tests/guardrails.test.ts`

## // 002. Pure function: `renderWorkingTreeLine()` for single-channel reporting

- [x] 2.1 Add RED tests in `tests/git-baseline.test.ts` proving the new renderer: returns `null` for non-repo state, returns a formatted line (or multi-line string) for a clean repo baseline, and returns a warning block for dirty state (uncommitted changes) with actionable guidance (stash or commit), and preservation of all lstat classification guarantees (no symlink traversal in the renderer itself, since classification is upstream in `readGitBaseline()`).
  - skills: `ein-discipline`, `architecture`
  - why: Establishes the sole channel for working-tree reporting before it is wired into status output; proves formatting is human-readable and actionable.
  - learn: A dirty-tree warning must suggest immediate remedies (stash or commit) without alarming about intentional staged changes.
  - architecture: The renderer is pure; it takes a `GitBaseline` object and returns formatted string or null. `readGitBaseline()` remains unchanged; it owns the lstat logic. The renderer has no side effects and no external dependencies.
  - avoid: Calling readGitBaseline in the renderer; duplicating classification logic; emitting warnings in multiple places (this renderer is the ONLY place dirty-tree text is created).
  - verify: `bun test tests/git-baseline.test.ts`

- [x] 2.2 GREEN-export `renderWorkingTreeLine(baseline: GitBaseline): string | null` from `ein-pi/agent/lib/git-baseline.ts`. The function formats a repo-presence and dirty-state summary: null for non-repo, a clean-state summary if repo is present and not dirty, and a multi-line warning if dirty (including stash/commit guidance). No external calls; pure function.
  - skills: `ein-discipline`, `architecture`, `comment-style`
  - why: Creates the foundational format that `statusCmd()` will output, guaranteeing single-channel reporting.
  - learn: The renderer owns display; classification (isRepo, dirty, recentReset) is owned by readGitBaseline(). Separation means renderWorkingTreeLine can format freely without re-reading files.
  - architecture: Export alongside `readGitBaseline()`. Do NOT modify `renderGitBaselineLine()` (Pi's preflight output lives there). The new renderer is consumed only by `statusCmd()`.
  - avoid: Calling readGitBaseline again; adding color codes or log levels here; calling out to git.
  - verify: `bun test tests/git-baseline.test.ts`

- [x] 2.3 TRIANGULATE cross-platform formatting (Windows line endings, POSIX). REFACTOR to keep the output tight and actionable without changing the classification contract.
  - skills: `ein-discipline`, `architecture`
  - why: Ensures formatting is durable on all CI platforms.
  - learn: Platform-specific line endings belong here, not in readGitBaseline.
  - architecture: Tests use cross-platform newline expectations.
  - avoid: Bloating the message or adding diagnostic fields that belong in debug logs.
  - verify: `bun test tests/git-baseline.test.ts`

## // 003. Guard decision precedence: deny → confirm → allow → none, with SDD state as advisory and no cross-harness grant consumption

- [x] 3.1 Add RED tests in `tests/harness-discipline.test.ts` covering the decision order: a command matching DENY emits deny and not allow (even if it would allow-list); a command matching CONFIRM emits ask and not allow; a command matching ALLOW emits allow and not ask/deny; a malformed JSON payload emits no decision and exits 0; no active SDD change emits the same decision as a normal command (state text appears only in the reason, not a new decision); and a delivery-grant file does not bypass the confirmation (grant consumption is NOT implemented in cc-ein).
  - skills: `ein-discipline`, `comment-style`
  - why: Establishes proof that the decision layer is precedent-safe and that SDD state is truly advisory, not gating.
  - learn: Deny always wins over allow. Precedence is a core invariant; testing it first ensures no refactor can break it. SDD state enriches reasons, not decisions.
  - architecture: The test mocks stdin/stdout JSON, calls `guardCmd()` directly, and inspects the decision envelope. No file I/O except configuration reading (deterministic fixture setup).
  - avoid: Implementing grant consumption in cc-ein (Requirement 6 explicitly rejects this); testing via shell subprocess (use direct function calls).
  - verify: `bun test tests/harness-discipline.test.ts`

- [x] 3.2 GREEN-refactor `cc-ein/sdd-cli/cli.ts:guardCmd()` to implement the decision precedence and envelope contract: parse JSON from stdin, extract `tool_input.command`, call `evaluateDeniedCommand()`, then `commandRequiresConfirmation()`, then `commandIsExplicitlyAllowed()`, emit deny/ask/allow accordingly, call `resolveSddStatus(cwd)` to read active-change context (Decision 1) and append it to the reason (not to the decision itself), ensure malformed input (missing command, invalid JSON) emits nothing and exits 0, and confirm the decision object contains only verified fields (permissionDecision and permissionDecisionReason).
  - skills: `ein-discipline`, `architecture`, `comment-style`
  - why: Wires the allowlist into the guard's actual evaluation path, enforcing precedence and advisory state semantics.
  - learn: No new decision is created by the absence of an active change; SDD state enriches reasons. Malformed input must be silent (not an audit log), so the outer settings.json deny list remains the fallback protection.
  - architecture: The decision order is: deny → confirm → allow. If none match, emit no output. Read SDD status only after a decision is taken, for reason enrichment. The envelope is immutable after decision is resolved.
  - avoid: Creating a new decision for "no active change"; consuming delivery-grant files; adding fields to the decision that are not verified.
  - verify: `bun test tests/harness-discipline.test.ts`

- [x] 3.3 TRIANGULATE: test all four case of mixed commands (deny + allow, confirm + allow, confirm + deny, all allow), dirty-tree warning in the reason, and correct JSON escaping of control characters. REFACTOR for clarity without changing precedence or envelope shape.
  - skills: `ein-discipline`, `architecture`
  - why: Confirms that decision precedence is robust across the full matrix and envelope is always valid JSON.
  - learn: Mixed commands like `git status && git reset --hard` must be denied (deny wins). The reason string is the only place for context enrichment.
  - architecture: Keep the precedence order clear in the code with comment markers; test assertions verify the order.
  - avoid: Adding new decision types or envelope fields; weakening the deny/confirm precedence.
  - verify: `bun test tests/harness-discipline.test.ts`

## // 004. Status command: repository bootstrap and working-tree reporting channel

- [x] 4.1 Add RED tests in `tests/harness-discipline.test.ts` covering `statusCmd()` behavior: directory outside a repository with `openspec/changes/` present runs `git init` and succeeds; directory outside a repo with no `openspec/changes/` does NOT run git init; directory already inside a repo does NOT reinitialize; initialization failure (read-only, git missing, .git unreadable) is caught and reported as `repo: none` with the error reason; `CC_EIN_NO_GIT_INIT` env flag suppresses initialization; `CI` env flag suppresses initialization; output includes the working-tree line from `renderWorkingTreeLine()` exactly once (no duplication in sync or guard).
  - skills: `ein-discipline`, `architecture`
  - why: Establishes proof that bootstrap is bounded (only when artifacts exist), best-effort (failures are reported, not fatal), and single-channel (status is the only place dirty-tree output appears).
  - learn: Git init is conditional on `openspec/changes/` existing, not on any directory. The working-tree line is the ONLY place the dirty state is reported across all harness surfaces.
  - architecture: Bootstrap logic lives in `statusCmd()`; rendering lives in the pure function from 002. The status command reads baseline, optionally initializes, and formats output. No duplication in sync.ts or guard.
  - avoid: Initializing in sync.ts (wrong directory), initializing unconditionally, or adding dirty-tree warnings elsewhere.
  - verify: `bun test tests/harness-discipline.test.ts`

- [x] 4.2 GREEN-update `cc-ein/sdd-cli/cli.ts:statusCmd()` to: check if `cwd` is a git repo via `readGitBaseline(cwd).isRepo`; if not a repo, check for `openspec/changes/` existence; if both conditions are met and neither `CC_EIN_NO_GIT_INIT` nor `CI` are set, attempt `git init` via `execFileSync('git', ['init'], { cwd })` with a bounded timeout and silent stdout/stderr; catch errors and report them as `repo: none` with the failure reason; after bootstrap (or if already repo), call `readGitBaseline(cwd)` and `renderWorkingTreeLine(baseline)` and include the result in status output; ensure the output line is included exactly once.
  - skills: `ein-discipline`, `architecture`, `comment-style`
  - why: Makes working-tree state visible at the one point the coordinator reads before each phase, with best-effort initialization for fresh directories.
  - learn: Initialization is bounded by artifact presence; opt-out flags allow CI to skip it. The rendered line is the ONLY place this state appears.
  - architecture: The bootstrap seam is narrow (one conditional call to git init in statusCmd); the output seam is one call to renderWorkingTreeLine. Keep both deterministic and side-effect minimal.
  - avoid: Initializing automatically in sync (separate concern); duplicate working-tree reporting in guard or sync; failing hard on initialization errors.
  - verify: `bun test tests/harness-discipline.test.ts`

- [x] 4.3 TRIANGULATE: test initialization in fresh temp directories on both ubuntu and macOS runners, verify `.git` directory exists after successful init, confirm existing repo is never reinitialized, test with CI=1 and CC_EIN_NO_GIT_INIT=1 set. REFACTOR to keep bootstrap minimal and focused.
  - skills: `ein-discipline`, `architecture`
  - why: Confirms bootstrap works and is idempotent on all platforms before relying on it.
  - learn: Re-running statusCmd in the same directory never reinitializes if `.git` already exists.
  - architecture: The logic is deterministic; tests use isolated temporary directories.
  - avoid: Testing against real user git config; assuming any .git format or structure.
  - verify: `bun test tests/harness-discipline.test.ts`

## // 005. Review-forecast exclusion: OpenSpec artifacts stay outside production budget

- [x] 5.1 Add RED test in `tests/review-workload-guard.test.ts` (new or existing coverage) asserting: a temporary repository with 3 production source lines, plus nested `openspec/changes/x/design.md` and `openspec/config.yaml`, when measured by `reviewForecast()`, reports `production: 3` (openspec lines do not count as production, tests, or any budget category).
  - skills: `ein-discipline`, `architecture`
  - why: Proves that the pathspec exclusion works end-to-end, not just in the pattern definition.
  - learn: OpenSpec artifacts are measured separately from production and tests and do not affect the review budget.
  - architecture: The test creates a temp git repo with mixed source and openspec files, calls `reviewForecast()`, and asserts the production count is correct.
  - avoid: Touching real repositories; testing only the pathspec syntax without validating the forecast math.
  - verify: `bun test tests/review-workload-guard.test.ts`

- [x] 5.2 GREEN-add one line to `ein-pi/agent/lib/review-forecast.ts:PRODUCTION_EXCLUDES`: `":(exclude)openspec/**"`. Verify the array syntax is unchanged; the entry is immutable and added in the correct position (alphabetically after `dist/**` or as design specifies).
  - skills: `ein-discipline`, `architecture`
  - why: Removes OpenSpec artifacts from the production line count, ensuring the review budget is not inflated by tooling.
  - learn: Pathspec `:(exclude)openspec/**` uses the same magic-pathspec form as existing entries and is parsed by git, not the shell.
  - architecture: The array remains readonly; the entry is appended to the end or placed in order as the array documents.
  - avoid: Changing the pathspec format; adding variants for different platforms (git handles the magic syntax portably).
  - verify: `bun test tests/review-workload-guard.test.ts`

- [x] 5.3 TRIANGULATE: run `bun test` and confirm no existing test in `review-workload-guard.test.ts` breaks (especially line 82 substring assertions). Verify on both ubuntu and macOS CI that `git diff --shortstat -- . :(exclude)openspec/**` produces expected output for a mixed repo. REFACTOR to keep the entry minimal.
  - skills: `ein-discipline`, `architecture`
  - why: Confirms the pathspec works on both CI platforms and does not break existing assertions.
  - learn: Existing tests may check for the presence of other pathspec patterns; a new entry must not break those.
  - architecture: The test is deterministic and uses git directly.
  - avoid: Assuming pathspec syntax varies by platform; testing in the shell (git parses magic pathspecs).
  - verify: `bun test tests/review-workload-guard.test.ts`

## // 006. Sync hook verification: guard hook injection already in place

- [x] 6.1 Verify that `cc-ein/sync.ts:159-172` correctly injects the `PreToolUse` hook for Bash commands with `"${guardBin}" guard` and the idempotency check prevents duplicate hook entries.
  - skills: `ein-discipline`, `architecture`
  - why: Confirms the hook is correctly deployed so the guard can intercept bash commands.
  - learn: The hook injection is idempotent; re-running sync does not duplicate hooks.
  - architecture: The hook is injected into `settings.json` as a pre-tool-use matcher for Bash only. The command points to the compiled `cc-ein-sdd` binary.
  - avoid: Re-implementing the injection; focus on verifying it is present and idempotent.
  - verify: Inspect `sync.ts` logic and verify via manual inspection or existing test coverage.

## // 007. Settings.json: allowlist permissions entries for read-only git subcommands

- [x] 7.1 Add RED test coverage in existing `tests/` verifying that `settings.json` after sync contains `"Bash(git status:*)"`, `"Bash(git diff:*)"`, `"Bash(git log:*)"` in the `permissions.allow` array, and does NOT contain `"Bash(git branch:*)"`, `"Bash(git commit:*)"`, or `"Bash(git add:*)"` (those are protected by the hook only); confirm the `permissions.deny` array is unchanged.
  - skills: `ein-discipline`, `architecture`
  - why: Ensures the allowlist is correctly deployed to settings.json so Claude Code can fast-path pure-read commands.
  - learn: Status, diff, and log are safe to auto-permit (no flags block them). Branch, commit, and add require the hook to inspect flags. Push, rebase, and force patterns stay in deny.
  - architecture: The allowlist lives in two places: simple subcommands (status/diff/log) in settings.json for resilience, and flag-aware inspection in the guard hook for branch/commit/add.
  - avoid: Putting `Bash(git branch:*)` or `Bash(git commit:*)` in settings.json (they would auto-approve `-D` and `--amend`); changing deny or confirm patterns.
  - verify: Manual inspection of `cc-ein/settings.json` or test of sync output.

- [x] 7.2 GREEN-ensure `cc-ein/settings.json` is updated with the `permissions.allow` array containing exactly: `"Bash(git status:*)"`, `"Bash(git diff:*)"`, `"Bash(git log:*)"`. The array is written by `sync.ts` alongside the deny and confirm entries (unchanged). The structure is read-only and deployed to `~/.claude-ein/settings.json` on sync.
  - skills: `ein-discipline`, `architecture`
  - why: Supplies the minimal set of auto-permitted git commands that are universally safe.
  - learn: Settings.json prefix matchers cannot express flag exclusions (Requirement 7 mitigation), so branch/commit/add stay in the hook only.
  - architecture: The allowlist is symmetric: `settings.json` carries what is safe with no flags; the guard carries what is safe with specific flags present.
  - avoid: Adding write subcommands to settings.json; changing the deny array.
  - verify: Manual inspection of the generated settings.json file.

## // 008. Documentation: CLAUDE.md allowlist policy marker block

- [x] 8.1 Add a well-formed `<!-- ein:harness-discipline:start -->` ... `<!-- ein:harness-discipline:end -->` HTML comment block in `cc-ein/CLAUDE.md`, documenting the allowlist policy: which git subcommands are auto-permitted (status, diff, log with any flags; add/commit/branch with flag inspection); which require confirmation (push, rebase); which are denied (force-push, reset --hard, branch -D); and a note that this is enforced by the guard hook, not by manual discipline.
  - skills: `comment-style`, `ein-discipline`
  - why: Declares the mechanism to the coordinator so they stop asking for what the guard already permits, and documents the policy for future maintainers.
  - learn: The marker block allows `core-parity` to regenerate CLAUDE.md without unpicking this specific decision.
  - architecture: The block is prose only; no mechanism depends on it. It is a human-facing declaration, not a gate.
  - avoid: Listing every flag or case (that lives in code); changing prose outside the marker block.
  - verify: Manual inspection of the marker block and its placement in CLAUDE.md.

---

## Execution order (topological, parallelizable groups noted)

**Parallel batch 1** (no dependencies):
- **001**: Pure function `commandIsExplicitlyAllowed()` — ficheros: `guardrails.ts`, `tests/guardrails.test.ts`
- **002**: Pure function `renderWorkingTreeLine()` — ficheros: `git-baseline.ts`, `tests/git-baseline.test.ts`
- **005**: Review-forecast exclusion — ficheros: `review-forecast.ts`, `tests/review-workload-guard.test.ts`
- **006**: Sync hook verification — ficheros: `sync.ts` (inspection only)

**Serial batch 2** (depends on 001):
- **003**: Guard decision precedence — ficheros: `cli.ts`, `tests/harness-discipline.test.ts` (depends on 001)

**Serial batch 3** (depends on 002, 003):
- **004**: Status command bootstrap and reporting — ficheros: `cli.ts`, `tests/harness-discipline.test.ts` (depends on 002, 003)

**Serial batch 4** (depends on 003, 004):
- **007**: Settings.json allowlist — ficheros: `settings.json` (depends on 001, 003 being in place)

**Final batch**:
- **008**: CLAUDE.md documentation — ficheros: `cc-ein/CLAUDE.md` (no code dependencies; can go last)

## Scenario coverage map

| Scenario | Primary Task | Supporting Tasks |
|---|---|---|
| guard-allowlist-flag-inspection | 001 | 003 (precedence) |
| guard-allowlist-whole-command | 001 | 003 (precedence) |
| guard-decision-precedence | 003 | 001 (allowlist) |
| guard-envelope-degrades-open | 003 | — |
| guard-ignores-cross-harness-delivery-grants | 003 | — |
| guard-sdd-state-is-advisory | 003 | — |
| openspec-artifacts-excluded-from-review-budget | 005 | — |
| repository-bootstrap-is-best-effort | 004 | — |
| working-tree-signal-single-channel | 004 | 002 (renderer) |

## File collision serialization

Files touched by multiple tasks must be mutated in this order to avoid conflicts:

1. **guardrails.ts**: Task 001 only (add pure function; no modification to existing patterns)
2. **git-baseline.ts**: Task 002 only (add new export; no modification to existing readGitBaseline)
3. **cli.ts**: Tasks 003 and 004 in sequence (Task 003 updates guardCmd; Task 004 updates statusCmd)
4. **review-forecast.ts**: Task 005 only (one-line addition to PRODUCTION_EXCLUDES)
5. **sync.ts**: Task 006 only (verification; no expected changes)
6. **settings.json**: Task 007 only (add permissions.allow array after sync structure is finalized)
7. **CLAUDE.md**: Task 008 only (add marker block at end)

Each task writes `openspec/changes/harness-discipline/apply-progress.md` with RED/GREEN/TRIANGULATE/REFACTOR breakpoints as work proceeds.
