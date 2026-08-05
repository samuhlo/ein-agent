# Scope — harness-discipline

## SCOPE PACKET

```yaml
scope: Enforce Ein harness discipline by extending the SDD guard hook, introducing a git-safe allowlist for auto-permitted commands (status/diff/log/add/commit/branch), initializing missing repos, surfacing dirty-tree warnings, and excluding openspec/ from PR line-count budgets. Four coordinated changes to guardrails.ts, settings.json, sync.ts, and review-forecast.ts improve determinism and reduce friction for bounded SDD workflows.
budget_allocated:
  max_tokens: 18000
  max_reads: 35
  max_runtime_ms: 900000
```

## Objective

Harden the Ein coordinator's execution discipline by (1) forcing compliance with the SDD flow unless explicitly opted out, (2) safe-listing read-only and local-only git operations, (3) detecting and warning about dirty working trees, (4) and excluding tooling artifacts from review budgets. The changes are scoped to harness-only and do not alter installer behavior or runtime semantics.

## Current project context

- **Stack:** This is the ein-agent workbench: a Node.js/TypeScript ESM project split across `cc-ein/` (Claude Code adapter), `ein-pi/` (the canonical agent core), and `tests/` (Bun integration). The CLI harness `cc-ein-sdd` is compiled from TypeScript in `cc-ein/sdd-cli/cli.ts`.
- **Package manager/build:** Bun (`installer/bun.lock`); typecheck via `cd installer && bun run typecheck` and test via `bun test` from the repository root (runs all test files under `tests/`).
- **Testing convention:** Bun's built-in `bun:test` framework; tests use standard describe/test/expect; integration tests are isolated with temporary directories and fixtures. CI runs on ubuntu-latest and macos-latest (`.github/workflows/ci.yml`).
- **Current seams:** 
  - `cc-ein/sync.ts:159-172`: Hook PreToolUse injected into settings.json; currently executes `cc-ein-sdd guard` for Bash commands.
  - `cc-ein/sdd-cli/cli.ts:93-100`: The `guardCmd()` function exists but is minimal; it parses stdin and emits allow/ask/deny decisions.
  - `ein-pi/agent/lib/guardrails.ts:34-87`: Defines DENIED_BASH_PATTERNS and CONFIRM_BASH_PATTERNS; no allowlist concept yet.
  - `cc-ein/settings.json:5-13`: Only has a deny list (force-push, rm -rf); no positive allowlist.
  - `ein-pi/agent/lib/git-baseline.ts:26-28`: Already exports `isRepo` and `dirty` signals via `readGitBaseline()`.
  - `ein-pi/agent/lib/review-forecast.ts:18-31`: Defines PRODUCTION_EXCLUDES but does not exclude `openspec/`.
- **SDD configuration:** `openspec/config.yaml` exists with `strict_tdd: true`, Bun/TypeScript markers, and blank test runners (the harness does not define app-level test commands). This scope reads it but does not rewrite it.
- **Baseline hygiene:** Only untracked file is `EIN.md`; it is preserved and not part of this change.

## In scope

### 1. Force SDD flow compliance (Extend guard hook)

- Extend `cc-ein/sdd-cli/cli.ts:104-110` guardCmd() to detect when a Bash command is run outside a valid SDD change context (i.e., no active change directory or change closed).
- If no active change is detected and the command is not a read-only git operation (status, diff, log) or a whitelisted SDD initialization command (e.g., cc-ein-sdd status, cc-ein-sdd init), emit `decision: ask` with a prompt redirecting the user to start a change first.
- The guard reads the SDD state deterministically (check `openspec/changes/` for a current active change; use `cc-ein-sdd status` exit code as a secondary signal if needed).
- Do not break existing grant-based subagent flows (delivery grants issued by the parent remain valid).
- Preserve the exit contract: allow/ask/deny as JSON emitted to stdout; stderr for diagnostics only.

### 2. Git safe-list allowlist (Reduce confirmation friction for safe commands)

- Refactor `cc-ein/settings.json` permissions from deny-only to include a positive allowlist of auto-permitted git operations.
- Auto-permit (decision: allow) without user confirmation:
  - `git status` (any flags)
  - `git diff` (any flags, including --staged)
  - `git log` (any flags)
  - `git add` (staged, no destructive intent)
  - `git commit` (local, already permitted by allow—no confirmation required)
  - `git branch` (local listing/creation; exclude `-D` which is destructive)
- Keep requiring confirmation (decision: ask) for:
  - `git push` (any variant; requires explicit approval)
  - `git push --force` / `git push --force-with-lease` (denied outright; cannot override)
  - `git rebase` (can rewrite history; requires approval)
  - `git reset --hard` (destructive; denied outright)
  - `git branch -D` (destructive; denied outright)
- Implement the allowlist by adding a new ALLOW_BASH_PATTERNS array in `ein-pi/agent/lib/guardrails.ts`, and extend the guard logic to check allow before confirm before deny.
- The decision logic in `cc-ein/sdd-cli/cli.ts:104-120` becomes: if command matches ALLOW_PATTERNS → allow; else if DENY_PATTERNS → deny; else if CONFIRM_PATTERNS → ask; else → allow (default permissive for non-git).

### 3. Git initialization + dirty-tree warning (Detect unsafe state)

- In `cc-ein/sync.ts` (deployment step), detect if the target Code directory is inside a git repository. If not, run `git init` to initialize the repo.
- After initialization (or if repo already exists), call `readGitBaseline()` from `ein-pi/agent/lib/git-baseline.ts` to detect if there are uncommitted changes (dirty tree).
- If the tree is dirty (from a prior failed run, stale branch, etc.), emit a visible warning on coordinator startup or early in the SDD flow (e.g., in the scope phase). The warning must mention the user can stash or commit before proceeding.
- This does NOT abort the flow; it is informational to prevent silent data loss.
- Implementation location: inject the check into `cc-ein/sync.ts` (likely after settings.json is written) and/or add it to the `cc-ein-sdd guard` decision envelope for visibility.

### 4. Exclude openspec/ from review-forecast (Reduce false-positive budgets)

- Update `ein-pi/agent/lib/review-forecast.ts:18-31` PRODUCTION_EXCLUDES array to add `":(exclude)openspec/**"`.
- This ensures that changes to the SDD artifact store (scope.md, map.md, design.md, tasks.md, delta specs, apply/verify reports) do not count toward the PR review budget.
- The presupposition: a 400-line PR (default budget) with 200 lines of app code and 200 lines of openspec/ artifacts should show `production: 200` (not 400).
- The call graph is: `reviewForecast()` at line 74 calls `diffShortstat()` with PRODUCTION_EXCLUDES; adding the pathspec here is the single point of mutation.

## Acceptance criteria

- [ ] The guard hook emits `ask` with a clear message when a bash command is attempted outside an active SDD change (or when the command is not whitelisted), and subagent delivery grants bypass this check.
- [ ] Safe git operations (status, diff, log, add, commit, branch —list/create only) are auto-permitted by the allowlist and do not trigger a confirmation dialog.
- [ ] Destructive git operations (force-push, reset --hard, branch -D, clean -fd) remain denied or ask for confirmation as before; the allowlist does not weaken existing guarantees.
- [ ] If no git repo exists at Code deployment time, `git init` is run; if a dirty tree is detected, a visible warning is emitted before the SDD flow starts.
- [ ] The warning mentions uncommitted changes and provides guidance (stash/commit); it does not block the flow but ensures the user is aware.
- [ ] `openspec/` is excluded from `reviewForecast()` production line counts; a PR with identical app code but different openspec artifacts will show the same budget number.
- [ ] Test coverage for the guard logic includes: active-change detection, grant-bypass verification, allowlist matching (git status, diff, add, commit, branch), confirmation patterns (push, rebase), and denial patterns (force-push, reset --hard, branch -D).
- [ ] The guard's JSON envelope remains valid for Claude Code PreToolUse hook consumption; decision logic is deterministic (no external API calls).
- [ ] Existing workflows (app deployment, installer tests, CI/CD) are unaffected by the new guard or git-init logic.
- [ ] Dirty-tree warning text is clear, actionable, and does not alarm if the user intentionally has staged changes.

## Shared concern: file collision risk

The following files have multiple changes across the four areas and must be mutated in a single, coordinated commit to avoid conflicts:
- `cc-ein/settings.json`: Areas 1, 2 (hook behavior + allowlist permissions).
- `cc-ein/sync.ts`: Areas 1, 3 (deployment + git-init + warning injection).
- `cc-ein/sdd-cli/cli.ts`: Areas 1, 2 (guard logic + allowlist decision path).
- `ein-pi/agent/lib/guardrails.ts`: Areas 1, 2 (allowlist patterns + decision logic).
- `cc-ein/README.md`: May need updates to document the new guard behavior and allowlist (optional in this scope; consider in design phase).

All mutations are coordinated and sequenced in the apply phase to ensure deterministic test execution and single commit.

## Non-goals and hard boundaries

- **Installer changes**: No mutations to installer binaries, runtime behavior, secret handling, shell-RC export, or checksum verification. The installer-beta change is separate.
- **Release/CI changes**: No version bump, no release assets, no .github/workflows changes, no Docker E2E, no macOS runtime flags.
- **SDD artifact mutations**: No rewriting `openspec/config.yaml`, no editing closed changes, no altering spec domains or delta structures. The scope.md and map.md are inputs to this change, never outputs beyond the current working change.
- **Relaxation of discipline**: The purpose is to *enforce* SDD, not weaken it. The allowlist exists to reduce confirmation fatigue for objectively safe operations; it must not become a loophole.
- **Generic filesystem or git abstraction**: The git-init and dirty-tree logic are minimal, scoped to harness deployment and pre-flow warnings, not a new fs library.
- **Interactive prompts or UI changes**: The guard emits JSON for Claude Code; the dirty-tree warning is a log/toast, not a blocking dialog. No new Claude Code UI extensions.
- **No SDD flow execution**: This scope phase creates no new apply, verify, or close artifacts. Test coverage and implementation belong to apply phase only.

## Mapping handoff

The map phase should confirm:
- **Guard active-change detection strategy**: Does `cc-ein-sdd status [change]` exit 0 when active, 1 when not? Can the guard read `openspec/changes/` directly, or must it shell out to the status command?
- **Allowlist regex patterns**: Capture `git status`, `git diff --staged`, `git add .`, `git commit`, `git branch -b feature`, but reject `git branch -D`. Are simple word-boundary patterns sufficient, or do we need lookahead for destructive flags?
- **Grant bypass mechanism**: The guard must preserve the delivery grant flow (subagent ein-git with grant in place bypasses the active-change check). How does the guard detect an active delivery grant?
- **Git-init location and timing**: Should `git init` happen in `cc-ein/sync.ts` (deployment time) or in the first SDD phase (scope)? If deployment, test that it does not break CI environments where .git is read-only.
- **Dirty-tree warning output**: Emit to stderr, log, or as part of the PreToolUse decision envelope? Coordinate with CC's logging/notification API.
- **Review-forecast pathspec correctness**: Confirm that `git diff --shortstat -- . :(exclude)openspec/**` produces the expected output; test with mixed app + openspec mutations.
- **Integration with strict TDD**: No tests run in scope; apply phase will record strict-TDD RED/GREEN coverage for all four areas.

## Verification plan

- **Apply phase**: Implement the four changes; add focused Bun integration tests for guard logic (active-change detection, grant bypass, allowlist matching), git-init safety, dirty-tree warning output, and review-forecast exclusion.
- **Verify phase**: Run `bun test` on new test files; confirm guard JSON output is valid; spot-check git operations (status, push) against new guard logic; verify `reviewForecast()` with openspec mutations; confirm `git init` works on a fresh directory and does not corrupt an existing repo; confirm dirty-tree warning is visible on startup.
- **Close**: Archive the change in `openspec/changes/archive/harness-discipline/` and update `EIN.md` with the new allowlist policy.
- This scope phase creates no code, tests, or output artifacts.

## Canonical OpenSpec context

The behavior delta for guard, allowlist, git-init, and review-forecast changes is declared in `openspec/changes/harness-discipline/specs/sdd-lifecycle/spec.md`; therefore, this document intentionally has no `spec_delta: none` declaration.

Selection uses 0 explicit canonical files from `openspec/specs/` and 0 of the shared 32,768 UTF-8-byte limit prior to this scope (the delta will be recorded in the design phase under the sdd-lifecycle domain).

## Skill application

- `ein-discipline`: Applied for SDD scope definition, phase boundary, and review of coordinated multi-file changes.
- **No project-specific skills required**: This is a harness-only change; no installer, deployment, or domain-specific skills are needed.
- **No injected skills**: Parent did not list skills to load; fall back to core SDD behavior.

## Scope phase boundary

This artifact defines scope only. It creates no application code, tests, build artifacts, typecheck output, network requests, `apply-progress*`, or `verify-report*` artifacts. The sole intended artifacts are this scope and the structured delta under the sdd-lifecycle domain. The guard, allowlist, git-init, and review-forecast changes are implementation detail deferred to apply and verify phases.

## Risks

- **Guard blocking legitimate flows**: If the active-change detection is too strict, users with multiple branches or stalled changes may find the guard blocks them unnecessarily. Mitigation: grant-bypass must work correctly; status command must be fast and reliable; allow read-only git commands.
- **Allowlist false positives**: A regex that matches `git branch -b` but also matches `git branch -D` by accident would leak destructive operations. Mitigation: test patterns explicitly; prefer negative lookahead or word boundaries; apply patterns in order (allow before confirm before deny).
- **Git-init side effects**: Running `git init` in a shared or CI environment could initialize a repo where none is intended. Mitigation: check that .git does not already exist; log the action; make it skippable via an env flag if needed.
- **Dirty-tree warning fatigue**: If the warning is too aggressive, users may ignore it. Mitigation: emit only once per session, not per command; include actionable guidance (stash/commit); use log level INFO not WARN to avoid alarming.
