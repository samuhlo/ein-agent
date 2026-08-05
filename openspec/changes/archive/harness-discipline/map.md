status: partial
scope_status: bounded
change: harness-discipline
phase: sdd-map
budget_source: packet
budget_exceeded: false

# Map — harness-discipline

## Scope and OpenSpec anchors

The scope is bounded to four coordinated harness-discipline changes: extending the SDD guard hook to enforce active-change context, implementing a git-safe allowlist to reduce confirmation friction for read-only operations, detecting and warning about dirty working trees at deployment, and excluding `openspec/` artifacts from PR line-count budgets. All changes are scoped to harness-only (cc-ein + ein-pi/agent/lib shared code, no installer/runtime/domain mutation). The structured delta adds `sdd-enforce`, `git-safe-commands`, `working-tree-hygiene`, and `review-artifact-exclusion` under `harness-discipline`; no canonical `openspec/specs/` rewrite is required because the delta domain is new.

Preserve `openspec/config.yaml`, `EIN.md`, closed changes in archive/, all installer behavior, runtime checksums, release assets, and generic filesystem/git abstractions. Non-goals remain installer E2E, CI changes, SDD artifact rewrites, interactive UI dialogs, and relaxation of destruction-prevention guarantees.

## Exact paths and contracts — AREA 1 (Force SDD flow compliance / Guard hook)

### Guard hook injection site: `cc-ein/sync.ts:159-172`

`sync.ts` reads `cc-ein/settings.json`, bakea the absolute path to `<DEST>/bin/cc-ein-sdd` (where `DEST` defaults to `~/.claude-ein`), and injects a `PreToolUse` hook into `settings.json` with:
- Matcher: `"Bash"` (only shell commands; does NOT intercept Read, Write, Edit, or subagent task delegation).
- Command: `"${guardBin}" guard` with timeout 10 (CloudCode settings syntax).
- The injected object must be idempotent: re-running sync does not duplicate hooks.

**Limitation (hard boundary):** The hook fires ONLY on Bash tool calls. It cannot intercept:
- File read/write/edit operations (different tools, different hook event).
- Task delegation to subagents (toolName is `Task`, not `Bash`; no hook event available yet for Task/ToolUse delegation in Claude Code as of this map).
- Commands run outside Claude Code (local shells, CI, other IDEs).

### Guard logic: `cc-ein/sdd-cli/cli.ts:104-118`

The `guardCmd()` function:
1. Reads JSON from stdin (Claude Code `PreToolUse` hook envelope).
2. Parses `tool_input.command` (the bash string).
3. Calls `evaluateDeniedCommand(command)` and `commandRequiresConfirmation(command)` from `guardrails.ts`.
4. Emits JSON to stdout with `hookSpecificOutput.permissionDecision` ∈ `{ allow | ask | deny }` and `permissionDecisionReason`.

Current behavior:
- If denied: emits `deny` with reason.
- If confirmation-required: emits `ask` with reason.
- If neither: **emits no output** (line 117: "sin match → sin salida") and Cloud Code continues with its own permission flow.

**Incertitude 1A (to resolve in design):** Does the guard's decision logic need to also detect **active SDD change context** and emit `ask` with "start a change first" if no active change is detected? The scope says yes (line 37-38), but the current implementation does not do this check. The design must clarify: should `guardCmd()` call `resolveSddStatus(cwd)` and block commands outside an active context, or should that check live elsewhere (e.g., a separate preflight hook)?

**Incertitude 1B (to resolve in design):** Can the PreToolUse hook emit a warning/notification SEPARATE from the permission decision (e.g., dirty-tree warning as a toast/log), or must all guard output be the JSON decision? If only JSON is permitted, the dirty-tree warning must either (a) be part of the decision envelope, (b) go to stderr, or (c) move to a different injection point.

**Incertitude 1C (to resolve in design):** The existing code path assumes `command` can be missing or unparseable (line 109 catches silently). Is this acceptable, or should malformed hook input trigger an audit log?

### Grant bypass for delivery agents: `guardrails.ts:123-157` + `cli.ts:104`

The guard reads `evaluateDeniedCommand` and `commandRequiresConfirmation`, but does **not** check for an active delivery grant. In Pi, `confirmCommand()` (guardrails.ts:183-214) consumes a grant via `consumeDelegatedDelivery(ctx.cwd)` for headless subagent flows. In Claude Code, the `guard` command has no `ctx.hasUI`, so:
- If a delivery grant file exists at `~/.pi/ein/delivery-grant.json` (scope says subagent ein-git creates it), the guard should consume it and allow the command.
- **Incertitude 1D:** Should `guardCmd()` call `consumeDelegatedDelivery()` to bypass confirmation for delegated pushes? The scope accepts this (line 39: "do not break existing grant-based subagent flows"), but the current implementation does not check grants.

## Exact paths and contracts — AREA 2 (Git safe-list allowlist)

### Current deny-only model: `cc-ein/settings.json:5-13`

Today only `permissions.deny` exists with 5 regex patterns:
- `Bash(git push --force:*)`, `Bash(git push -f:*)`, `Bash(git push --force-with-lease:*)`
- `Bash(rm -rf /:*)`, `Bash(rm -rf ~:*)`

**No positive allowlist (ALLOW_PATTERNS) exists yet.** Scope decides: auto-permit `status, diff, log, add, commit, branch` (without `-D`); ask for `push` (any variant), `rebase`, `branch -D` (destructive); deny `push --force`, `reset --hard`, `branch -D`.

### Pattern definitions: `ein-pi/agent/lib/guardrails.ts:34-49`

- `DENIED_BASH_PATTERNS` (line 34-41): 6 patterns for `rm -rf /|~|$HOME|..`, `git reset --hard`, `git clean -fd`, `git push --force`, `chmod -R 777`, `chown -R`.
- `CONFIRM_BASH_PATTERNS` (line 43-49): 5 patterns for `git push`, `git rebase`, `git branch -D`, `npm publish`, `pi remove`.

No `ALLOW_BASH_PATTERNS` yet.

### Decision logic: `cli.ts:110-117`

```
if (denied) → deny
else if (confirmation-required) → ask
else → allow (implicit in line 117, "sin match")
```

**Incertitude 2A (to resolve in design):** Implement `ALLOW_BASH_PATTERNS` in `guardrails.ts` and update `cli.ts` to check:
```
if (matches ALLOW) → allow
else if (matches DENY) → deny
else if (matches CONFIRM) → ask
else → allow (default permissive for non-git)
```

**Incertitude 2B (to resolve in design):** Allowlist patterns must distinguish:
- `git branch` (list/create, allowed) vs `git branch -D` (delete, denied)
- `git add` (staged, allowed) vs `git add -A` (might be allowed too — clarify intent)
- `git commit` (local, allowed) vs does not apply (no destructive flag variant to exclude)

Current `CONFIRM_BASH_PATTERNS:46` uses `/\bgit\s+branch\s+-D\b/` which correctly catches `-D` only. The allowlist must use negative lookahead or explicit flag checks (e.g., `/\bgit\s+branch\b(?!.*-D)/) to permit `branch` without `-D`.

**Incertitude 2C (to resolve in design):** Test allowlist matching against real git workflows:
- `git add .` (with space and dot)
- `git add --patch` (interactive, allowed or not?)
- `git commit -m "msg"` (quoted message)
- `git diff --staged` (with flag)
- `git branch -b feature/x` (create; must not match `-D`)
- `git branch -D stale` (delete; must match)

### Settings structure: `settings.json` future structure

Scope and design must clarify whether `permissions` becomes:
```json
{
  "permissions": {
    "allow": ["Bash(git status:*)", "Bash(git diff:*)", ...],
    "deny": [...],
    "confirm": [...]
  }
}
```
or remains a simpler deny-only structure with the allowlist living only in code (`ALLOW_BASH_PATTERNS`).

## Exact paths and contracts — AREA 3 (Git initialization + dirty-tree warning)

### Baseline detection: `ein-pi/agent/lib/git-baseline.ts:26-86`

Exports:
- `readGitBaseline(cwd): GitBaseline` — calls `git rev-parse --is-inside-work-tree`, `git status --porcelain`, `git reflog`, `git stash list`; returns `{ isRepo, dirty, stashes, recentReset }`.
- `renderGitBaselineLine(baseline): string | null` — formats a warning line for preflight output.

Current behavior:
- `isRepo` ← checks if cwd is inside a git repository.
- `dirty` ← true if `git status --porcelain` returns non-empty (staged or unstaged changes).
- `stashes` ← count of stash entries.
- `recentReset` ← looks back 15 entries in reflog for a `reset:` action (can orphan work).

Already suitable for reading; can be reused directly.

### Git initialization: `cc-ein/sync.ts` (location TBD)

**Incertitude 3A (to resolve in design):** Where exactly should `git init` run?
- **Option A (after settings.json write, line 172):** In sync-time, before any SDD flow.
  - Pro: Guarantees repo exists for all subsequent reads.
  - Con: Might initialize where not intended (CI, read-only .git, symlinked).
- **Option B (in the scope phase):** First SDD step reads baseline, detects no repo, initializes.
  - Pro: Explicit, can be skipped via env flag.
  - Con: Pushes initialization logic into an SDD phase (potential cross-concern).

Scope says "detect if target Code directory is inside a git repository. If not, run `git init`" (line 62-63) but does not pin the location. The reference mentions "deployment step" (line 67).

**Incertitude 3B:** CI environment safety. If `.git` is mounted read-only in a Docker/CI environment, `git init` will fail but should not break the flow. Design must specify: should sync's git init be best-effort (catch and log), or should it hard-fail if initialization is required but not possible?

**Incertitude 3C:** Idempotency. Re-running sync with an existing repo must not reinitialize (current git init behavior will silently do nothing, which is safe).

### Dirty-tree warning output: `git-baseline.ts:88-106` + injection point TBD

`renderGitBaselineLine(baseline)` returns:
- `null` if not a repo.
- A multi-line warning if `recentReset` is detected (suspicious history).
- A clean-start message if repo exists and no recent reset.

The string is already formatted for human consumption. **Incertitude 3D:** Where should this warning be emitted?
- Option A: `sync.ts` logs it to stdout/stderr after calling `readGitBaseline()`.
- Option B: Guard includes it in the `permissionDecision` envelope (but that bloats the hook).
- Option C: Separate preflight check outside the guard (e.g., called by the coordinator before first phase).

Scope says "emit a visible warning on coordinator startup or early in the SDD flow" (line 65); no specific channel is mandated, so design has flexibility.

**Incertitude 3E:** Warning frequency. Should the warning emit once per session, or every time the guard runs? Scope suggests "once per session" (line 67) but does not pin a deduplication mechanism.

## Exact paths and contracts — AREA 4 (Exclude openspec/ from review-forecast)

### Current state: `ein-pi/agent/lib/review-forecast.ts:18-31`

`PRODUCTION_EXCLUDES` is a readonly array of pathspec entries for `git diff`:
```typescript
const PRODUCTION_EXCLUDES = [
  ":(exclude)*.test.*",
  ":(exclude)*.spec.*",
  ":(exclude)**/tests/**",
  ":(exclude)**/__tests__/**",
  ":(exclude)**/e2e/**",
  ":(exclude)*.snap",
  ":(exclude)*-lock.*",
  ":(exclude)dist/**",
  ":(exclude).output/**",
  ":(exclude).nuxt/**",
  ":(exclude)coverage/**",
  ":(exclude)*.min.*",
] as const;
```

Does NOT include `":(exclude)openspec/**"`.

### Usage: `review-forecast.ts:74-86`

`reviewForecast(cwd, base?)` calls `diffShortstat(cwd, range, [".", ...PRODUCTION_EXCLUDES])` (line 78). Adding the pathspec here is a single point of mutation.

### Change required: PRODUCTION_EXCLUDES addition

Add one entry: `":(exclude)openspec/**"`.

**Incertitude 4A (to resolve in design):** Confirm that the pathspec syntax `:(exclude)openspec/**` is valid for `git diff` on both ubuntu (GitHub Actions) and macOS runners. The map uses this syntax from the existing entries; if testing reveals a need to adjust the pattern (e.g., trailing slash vs no slash), design must document.

**Incertitude 4B:** Are there existing tests that hardcode the value of `PRODUCTION_EXCLUDES` or the count of entries? A grep for `PRODUCTION_EXCLUDES` should find any test assertions that would break if the array is mutated. The spec mentions "Bun's built-in `bun:test` framework" and `tests/i18n-parity.test.ts` as a precedent; a similar test may exist for review-forecast or pathspec validation.

## Integration and colision points

Files with multiple changes across areas (must coordinate in a single commit):
- `cc-ein/settings.json` — Areas 1 (hook), 2 (allowlist structure, if moved to settings).
- `cc-ein/sync.ts` — Areas 1 (hook injection), 3 (git init + warning call).
- `cc-ein/sdd-cli/cli.ts` — Areas 1 (guard active-change detection, grant bypass), 2 (allowlist decision).
- `ein-pi/agent/lib/guardrails.ts` — Areas 1 (guard call site unchanged), 2 (ALLOW_BASH_PATTERNS definition).
- `ein-pi/agent/lib/review-forecast.ts` — Area 4 (PRODUCTION_EXCLUDES addition).

The order of if-checks in `cli.ts:110-117` must be: allow → deny → confirm → default-allow (not the current order).

## What the guard CANNOT enforce (hard limits)

- **File operations:** The hook fires only on Bash; Read/Write/Edit tools are separate hook event types. File system safety (symlink following, atomic writes) is outside guard scope.
- **Subagent delegation:** The `Task` tool invokes subagents; no PreToolUse hook intercepts this yet in Claude Code (as far as discoverable from the codebase). Scope accepts this (line 36 says "preserve grant-based subagent flows exist"), implying delegation already works outside the guard.
- **Async confirmation outside CI:** The guard is deterministic and headless (stdout-only JSON). It cannot open a modal, wait for user input, or retry with different parameters. The confirmation UX is handled by Claude Code's native permission system, which consumes the JSON decision.
- **CI/production shells:** Commands run outside Claude Code (local terminals, CI scripts, other IDEs) never see the guard. This is intentional (scope says "harness-only").

## Handoff to design/apply

Design must resolve:
1. **Active-change detection:** Should `guardCmd()` shell out to `cc-ein-sdd status` to detect active changes, or read `openspec/changes/` directly? If the latter, what's the contract for "active" (any change with artifacts present, or only phase ∉ {close, done})?
2. **Grant consumption:** Should `guardCmd()` call `consumeDelegatedDelivery(cwd)` to permit delivery-delegated pushes?
3. **Allowlist patterns:** Implement `ALLOW_BASH_PATTERNS` with explicit test cases for boundary conditions (e.g., `git branch` vs `git branch -D`).
4. **Dirty-tree warning channel:** Decide whether to log via stdout, stderr, a JSON envelope field, or separate preflight call.
5. **Git init timing and safety:** Sync-time (Option A) vs scope-phase (Option B); best-effort vs hard-fail on CI read-only repos.
6. **Review-forecast pathspec:** Test `:(exclude)openspec/**` on both CI platforms and confirm no test breakage.
7. **Settings structure:** If allowlist moves to `settings.json`, define the schema (nested `allow`/`deny`/`confirm` arrays or inline patterns).

Apply phase will add focused Bun integration tests for each area; verify will run `bun test` and spot-check git operations against new guard logic.

## Verification plan

- **Apply phase:** Implement guard active-change detection, ALLOW_BASH_PATTERNS, git init + warning, openspec pathspec addition. Add Bun tests for:
  - Active-change detection (with and without openspec/changes/).
  - Grant bypass (mock delivery-grant.json, confirm it's consumed).
  - Allowlist matching (git status, diff, add, commit, branch without `-D`; all should allow).
  - Confirmation patterns (git push, rebase, branch -D should require ask).
  - Denial patterns (force-push, reset --hard should deny).
  - Git init idempotency (re-running sync does not reinitialize).
  - Dirty-tree warning output format and frequency.
  - Review-forecast exclusion (PR with mixed app + openspec mutations shows correct budget).
- **Verify phase:** Run `bun test`; confirm guard JSON output is valid; spot-check git operations (git status, git push) against new guard; verify review-forecast with openspec mutations; confirm git init on fresh directory and does not corrupt existing repo; confirm dirty-tree warning is visible and actionable.
- **Close:** Archive to `openspec/changes/archive/harness-discipline/` and update `EIN.md` with new guard policy and allowlist decision rules.

## Ledger Contract

ledger:
  reads:
    - { path: "openspec/changes/harness-discipline/scope.md", lines: "1-150", estimated_tokens: 3000 }
    - { path: "openspec/changes/archive/installer-safe-secret-writes/map.md", lines: "1-110", estimated_tokens: 2200 }
    - { path: "cc-ein/sync.ts", lines: "1-180", estimated_tokens: 2800 }
    - { path: "cc-ein/sdd-cli/cli.ts", lines: "1-175", estimated_tokens: 2400 }
    - { path: "ein-pi/agent/lib/guardrails.ts", lines: "1-320", estimated_tokens: 4200 }
    - { path: "cc-ein/settings.json", lines: "1-15", estimated_tokens: 150 }
    - { path: "ein-pi/agent/lib/git-baseline.ts", lines: "1-107", estimated_tokens: 1600 }
    - { path: "ein-pi/agent/lib/review-forecast.ts", lines: "1-100", estimated_tokens: 1400 }
    - { path: "ein-pi/agent/lib/sdd-router.ts", lines: "1-80", estimated_tokens: 1000 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 18750, reads: 9 }

## Skill application

- `ein-discipline`: Applied for SDD bounded mapping, phase boundary, multi-area coordination, and handoff clarity.
- No project-specific skills required; no injected skill paths; `skill_resolution: none`.

## Scope phase boundary

This artifact maps scope only. It creates no code, tests, configuration, schemas, or verification artifacts. The sole outputs are this map and clarified handoff points for design. The four coordinated changes (guard active-change, allowlist, git-init + warning, openspec exclusion) are implementation detail deferred to apply and verify phases.
