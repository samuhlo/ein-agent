# Design — harness-discipline

## A. Proposal

### Intent

Make the cc-ein harness deterministic where determinism is actually available: a flag-aware git allowlist that removes confirmation friction without weakening any existing block, a single honest channel for repository/working-tree state, and OpenSpec artifacts removed from the review line budget. Enforcement of the SDD flow itself is tightened only where a mechanism can guarantee it; everything else is declared as model compliance, not sold as a gate.

### Scope

In scope:

- A new allowlist layer in `ein-pi/agent/lib/guardrails.ts`, consumed only by `cc-ein/sdd-cli/cli.ts`, with whole-command evaluation and per-subcommand flag inspection.
- Decision ordering in `guardCmd()`: deny, then confirmation, then allowlist promotion, then no output.
- A read-only allowlist in `cc-ein/settings.json` covering only pure-read git subcommands, plus the unchanged deny list.
- Repository presence and working-tree cleanliness reported by `cc-ein-sdd status`, with best-effort repository bootstrap bounded to directories that already hold OpenSpec change artifacts.
- One `":(exclude)openspec/**"` entry in `PRODUCTION_EXCLUDES` (`ein-pi/agent/lib/review-forecast.ts`).
- A marker-delimited block in `cc-ein/CLAUDE.md` stating the allowlist policy so the coordinator stops asking for what the mechanism already permits.

Out of scope (non-goals):

- Any change to `DENIED_BASH_PATTERNS`, `CONFIRM_BASH_PATTERNS`, or `confirmCommand()` behavior; Pi runtime decisions stay byte-identical.
- Blocking bash commands because no SDD change is active (rejected, see Decision 1).
- An "auto mode" toggle for git confirmations (explicitly discarded by the user).
- Grant consumption in the Claude Code guard (rejected, see Decision 6).
- Hooks for `Edit`, `Write`, or `Task`; installer, release, CI, and Docker surfaces.
- Rewriting `cc-ein/CLAUDE.md` prose beyond the delimited block.

### Affected areas

- `ein-pi/agent/lib/guardrails.ts` — new pure `commandIsExplicitlyAllowed()` plus its pattern/flag tables.
- `cc-ein/sdd-cli/cli.ts` — `guardCmd()` decision order and envelope contract; `statusCmd()` working-tree block and bootstrap.
- `ein-pi/agent/lib/git-baseline.ts` — new pure renderer for the working-tree line (existing `renderGitBaselineLine` untouched).
- `ein-pi/agent/lib/review-forecast.ts` — one pathspec entry.
- `cc-ein/settings.json` — read-only allow array.
- `cc-ein/CLAUDE.md` — one delimited block.
- `tests/` — `guardrails.test.ts`, `review-workload-guard.test.ts`, `git-baseline.test.ts`, and one new `tests/harness-discipline.test.ts` for the cli-level decision contract.

### Coordinator assumption (declared, not verified here)

A future change `core-parity` is expected to turn `cc-ein/CLAUDE.md` into a generated file derived from `ein-pi/core/AGENTS.md`; today they are two hand-written brains that already diverged. This design therefore treats prose as the weakest available lever and pushes every enforceable rule into `cc-ein/settings.json` and `cc-ein/sdd-cli/cli.ts`. The single `CLAUDE.md` edit is wrapped in `<!-- ein:harness-discipline:start -->` / `<!-- ein:harness-discipline:end -->` so `core-parity` can regenerate, relocate, or drop it without unpicking any mechanism. If that assumption is wrong, nothing in areas 1, 2, 3, or 4 needs redesign — only the block's home changes.

### Risks

- Whole-command allowlisting is conservative: `git log --oneline | head -20` will not be promoted and falls back to Claude Code's own permission flow. Friction is reduced, not eliminated.
- Claude Code's `permissions.allow` entries are prefix matchers and cannot express flag exclusions; putting `git branch` or `git commit` there would auto-approve `git branch -D` and `git commit --amend` whenever the hook binary is absent. Mitigated by keeping those three subcommands hook-only.
- Bootstrapping a repository from `cc-ein-sdd status` is a side effect in a command otherwise read-only. Bounded to `openspec/changes/` being present, skippable, reported, and reversible.
- Reading SDD state inside the guard adds filesystem work on the deny/ask path; bounded to the paths already read by `resolveSddStatus`.

### Rollback

Revert the five source files and the delimited `CLAUDE.md` block. There is no persisted state, no schema, and no migration: the allowlist is a pure function, the working-tree block is rendered output, and the pathspec entry only affects a number that is recomputed on every call. A stale compiled `bin/cc-ein-sdd` is corrected by re-running `bun cc-ein/sync.ts`.

### Success criteria

- No command that matches a denied or confirmation-required pattern can be promoted by the allowlist, in any composition.
- The six safe git subcommands run without a confirmation prompt when the whole command is safe.
- `cc-ein-sdd status` reports repository presence and working-tree cleanliness exactly once, and no other surface repeats it.
- `reviewForecast()` returns the same production count for identical source changes regardless of OpenSpec artifact size.
- `bun test` and the installer typecheck stay green.

### Canonical OpenSpec context

| Domain | Path | SHA-256 | UTF-8 bytes |
| --- | --- | --- | --- |
| `sdd-lifecycle` | `openspec/specs/sdd-lifecycle/spec.md` | not computed in this phase | not computed in this phase |

`scope.md` recorded zero canonical files. This design adds exactly one, the base for the declared delta domain, read to confirm that no existing `sdd-lifecycle` scenario is contradicted or duplicated. The digest and byte count are left uncomputed rather than estimated: this executor has no shell available, and a fabricated digest is worse than an absent one. Selection: 1 file, well inside the 3-file / 32 KiB limit. The change delta lives in `openspec/changes/harness-discipline/specs/sdd-lifecycle/spec.md`.

## B. Spec

### Requirement 1 — Decision precedence

The guard MUST evaluate denied patterns first, confirmation-required patterns second, and the allowlist only third; an allowlist match MUST NOT approve a command that also matches a denied or confirmation-required pattern anywhere in its text.

**Scenario — mixed command**

- **Given** a shell command containing both an allowlisted subcommand and a guarded one, such as `git status && git push`
- **When** the guard evaluates it
- **Then** it emits `ask` (or `deny` for a destructive match) and never `allow`

### Requirement 2 — Whole-command allowlist

The guard MUST promote a command to `allow` only when every operator-separated segment is an allowlisted git subcommand with no blocked flag, and the command contains no command substitution or redirection.

**Scenario — unsafe neighbour**

- **Given** `git status && rm -rf node_modules`, or `git diff > /tmp/out`, or ``git commit -m "`id`"``
- **When** the guard evaluates it
- **Then** it emits no decision, leaving Claude Code's native permission flow in charge

### Requirement 3 — Flag inspection

The guard MUST refuse to promote an allowlisted subcommand that carries a mutating, history-rewriting, or interactive flag, including flags bundled into a single short-option token.

**Scenario — branch deletion**

- **Given** `git branch -d x`, `git branch -D x`, `git branch --delete x`, `git branch -r -d origin/x`, or `git branch -rd origin/x`
- **When** the guard evaluates it
- **Then** none of them is promoted to `allow`, while `git branch`, `git branch -a`, `git branch -v`, `git branch --show-current`, and `git branch feature/x` are

### Requirement 4 — Envelope contract

The guard MUST emit at most one decision object per invocation, MUST exit successfully when the hook payload is absent or unparseable, and MUST NOT emit any output field it has not verified against the host.

**Scenario — malformed payload**

- **Given** stdin carries invalid JSON, an empty object, or a payload without `tool_input.command`
- **When** the guard runs
- **Then** it writes nothing to stdout, exits 0, and the outer `settings.json` deny list remains the effective protection

### Requirement 5 — SDD state is advisory

The guard MAY attach current SDD state to a decision it has already taken, and MUST NOT create a new decision on the basis of that state.

**Scenario — no active change**

- **Given** no active change exists under `openspec/changes/`
- **When** an arbitrary bash command is evaluated
- **Then** the decision is exactly what the pattern layers produced, with no added `ask`, and any state text appears only inside an existing `deny`/`ask` reason

### Requirement 6 — Single working-tree channel

The system MUST report repository presence and working-tree cleanliness through `cc-ein-sdd status` output only, and MUST NOT duplicate that report in the permission-decision envelope or the sync step.

**Scenario — dirty tree**

- **Given** the working tree has uncommitted changes
- **When** `cc-ein-sdd status` runs
- **Then** its output carries one working-tree block naming the uncommitted state and the stash/commit remedy, routing is unaffected, and the exit code is unchanged

### Requirement 7 — Best-effort bootstrap

The system MUST attempt `git init` only when the directory is not inside a repository, holds `openspec/changes/`, has no `.git` entry, and no opt-out is set; failure MUST degrade to a reported notice.

**Scenario — unavailable initialization**

- **Given** initialization is impossible because the location is read-only, `git` is missing, or `.git` exists but is unreadable
- **When** `cc-ein-sdd status` runs
- **Then** it reports the repository as absent with the failure reason and completes normally without throwing or changing its exit code

### Requirement 8 — OpenSpec outside the review budget

The system MUST exclude every path under `openspec/` from the production line count used by the review-size forecast.

**Scenario — mixed diff**

- **Given** a range containing production source changes plus changes under `openspec/config.yaml` and `openspec/changes/<id>/design.md`
- **When** `reviewForecast()` measures it
- **Then** `production` counts only the source lines, and the OpenSpec lines appear in neither `production` nor `tests`

## C. Decisions

### 1. No bash command is blocked for lacking an active SDD change

The scope asked the guard to emit `ask` outside an active change. Rejected. The `PreToolUse` matcher is `Bash`, so the gate would stop `cc-ein-sdd status` itself, every read-only inspection, and the small-direct-change path that `CLAUDE.md` explicitly sanctions, while leaving `Edit`, `Write`, and `Task` completely open. It buys friction on the compliant path and nothing on the path it claims to close. The guard instead reads `resolveSddStatus(cwd)` in-process and appends the current change and next phase to reasons it was already emitting. That is advisory context, declared as such in Requirement 5.

### 2. Precedence is deny, then confirm, then allow

The map proposed allow-first. Rejected: allow-first makes total safety depend on every allow pattern being perfectly narrow, so one sloppy regex silently shadows the destructive set. With allow evaluated last, the allowlist is a promotion of last resort and cannot shadow anything. `git add . && git push` is the case that settles it: allow-before-confirm would auto-approve the push.

### 3. Segment-based whole-command evaluation, not substring matching

An allow pattern that merely finds a safe substring approves everything around it. The allowlist splits the command on `&&`, `||`, `;`, `|`, and newlines, trims each segment, and requires every segment to match an anchored `^git\s+<sub>\b` pattern with clean flags. Any segment containing `` ` ``, `$(`, `<`, `>`, or `>>` disqualifies the whole command. The fallback is never a weaker decision — it is silence, which returns control to Claude Code's own flow.

### 4. Explicit flag token sets instead of negative lookahead

The map warned that lookahead for `-D` is error-prone; it is also blind to bundled short options. Flags are checked as tokens: an exact match against a blocked long/short list, plus a per-letter scan of any `^-[A-Za-z]+$` token so `-rd` is caught like `-r -d`.

- `branch`: blocked `-d`, `-D`, `--delete`, `-m`, `-M`, `--move`, `-f`, `--force`, `--edit-description`; blocked letters `d`, `D`, `m`, `M`, `f`.
- `commit`: blocked `--amend`, `--no-verify`, `-e`, `--edit`, `-i`, `--interactive`; additionally requires a non-interactive message source (`-m`, `--message`, `-F`, `--file`, `-C`, `--reuse-message`), because a headless `git commit` with no message opens an editor and hangs the tool call.
- `add`: blocked `-p`, `--patch`, `-i`, `--interactive`, `-e`, `--edit` — same headless-hang reason.
- `status`, `diff`, `log`: no blocked flags; they do not mutate.

`git branch -d` is not promoted even though it is not in `CONFIRM_BASH_PATTERNS`; it simply keeps today's behavior. The confirmation and denial tables are not touched, so this change is strictly additive to safety.

### 5. Ownership boundary: new pure function, Pi runtime untouched

`guardrails.ts` gains `commandIsExplicitlyAllowed(command: string): boolean` and its tables. `confirmCommand()` does not call it, so Pi's interactive and headless behavior is unchanged; only `cc-ein/sdd-cli/cli.ts` consults it. The allowlist is a Claude Code permission optimization, not a security policy, and the file boundary says so.

### 6. No delivery-grant consumption in the Claude Code guard

Rejected. `~/.pi/ein/delivery-grant.json` is minted by Pi's `subagent` tool interception (`confirmDelegatedDelivery`), which does not exist in cc-ein — `sync.ts` even injects a note telling cc-ein agents that `.pi/ein/*` does not apply. Nothing in cc-ein ever mints a grant, so consuming one would only open a cross-harness side channel: a grant minted by a Pi session in the same directory would silently un-ask a `git push` in a Claude Code session. In Claude Code, a subagent's Bash call surfaces its prompt in the parent session natively, so `ask` already works headlessly.

### 7. `settings.json` carries read-only subcommands only

Two independent layers, deliberately asymmetric. `settings.json` keeps working when `bin/cc-ein-sdd` is missing or its build failed, but its matchers are prefix-based and cannot exclude a flag; `Bash(git branch:*)` would therefore auto-approve `git branch -D`. So `allow` receives only `git status`, `git diff`, `git log`, whose entire flag space is harmless, and the three write subcommands stay hook-only. The `deny` array is unchanged. If the hook is absent, `git commit` prompts again — the fail-safe direction.

### 8. `cc-ein-sdd status` is the single working-tree channel

The map flagged duplication across sync, guard, and preflight. Sync is wrong because it deploys to `~/.claude-ein`, not the project, so it never sees the tree that matters. The guard envelope is wrong because it would repeat the warning on every bash call, which is how a warning becomes invisible. `status` is the only surface the coordinator is contractually required to read between phases, it already runs in the project directory, and it runs about seven times per change rather than once per command — so no deduplication state file is needed, and none is added.

Rendering lives in a new pure exported function in `git-baseline.ts`; `renderGitBaselineLine` is left alone because it belongs to Pi's preflight output. The new renderer covers the `dirty` signal that the existing one ignores.

### 9. Bootstrap is bounded, opt-outable, and never fatal

`git init` runs from `statusCmd()` only when all of: `readGitBaseline(cwd).isRepo` is false, `openspec/changes/` exists, no `.git` path exists, `CC_EIN_NO_GIT_INIT` is unset, and `CI` is unset. The `openspec/changes/` condition ties initialization to "substantial work is already happening here" instead of to any directory someone runs `status` in. The `.git`-exists condition is the read-only/corrupt case: if `rev-parse` fails while `.git` is present, the location is never touched. Execution is `execFileSync` with a bounded timeout and ignored stdio inside try/catch; on failure the status output reports `repo: none` plus the reason and the exit code is unchanged.

Alternatives rejected: initializing in `sync.ts` (wrong directory, install-time, invisible to the project); initializing inside the scope phase (pushes an environment concern into a planning phase and only helps changes that reach scope).

### 10. One pathspec entry, no syntax variant

`":(exclude)openspec/**"` uses the same magic-pathspec form as the eleven existing entries. `execFileSync` runs with `shell: false`, so the pattern reaches git unexpanded and is parsed by git itself, not by a platform shell; `**/tests/**` already proves the `**` form works on both CI runners today. No platform-specific variant is planned. A trailing `/**` matches everything inside the directory, so both `openspec/config.yaml` and `openspec/changes/<id>/design.md` are excluded.

Confirmed for incertitude 4B: no existing test pins the array contents or its length. `tests/review-workload-guard.test.ts:82` asserts only that the file *contains* the substring `:(exclude)*.test.*`, and line 76 asserts the prompts do *not* contain it. Adding an entry breaks neither.

### 11. Delta shape: ADDED only

The delta adds eight scenarios to `sdd-lifecycle`. There is no `## MODIFIED` or `## REMOVED` section because no existing scenario in `openspec/specs/sdd-lifecycle/spec.md` is contradicted, narrowed, or duplicated — they cover acceptance modes, close readiness, canonical context budget, status diagnostics, startup bootstrap, and the legacy escape, none of which touch shell permissions, working-tree state, or the review budget. Inventing a modification to make the document look symmetric would corrupt the canonical spec. The domain is `sdd-lifecycle` because `scope.md` declared it; areas 2 and 4 stretch that domain slightly, which is accepted rather than resolved by contradicting scope mid-flow.

## D. Success Criteria

### Hard-gated by mechanism

- Destructive commands are denied by the hook and, independently, by `settings.json` `permissions.deny`.
- `git push`, `git rebase`, `git branch -D`, `npm publish`, `pi remove` still produce `ask`.
- Promotion to `allow` requires every segment safe, every flag clean, no substitution or redirection.
- Deny and confirm can never be shadowed by the allowlist, in any command composition.
- Malformed hook input never blocks and never throws.
- `openspec/**` lines never enter the production count.
- Repository presence and working-tree cleanliness appear on every `cc-ein-sdd status`.
- `cc-ein-sdd check` and `close` gates are unchanged and still deterministic.

### Depends on model compliance, not gated

- Entering the SDD flow for substantial work at all.
- Delegating phases to subagents: the `Task` tool is invisible to a `Bash` matcher.
- Not editing source inline: `Edit` and `Write` are different tools, and gating them would block all work including the SDD artifacts themselves.
- Reading and acting on the working-tree warning.
- Anything executed outside Claude Code — local shells, CI, other editors — never reaches the guard.

This split is the honest ceiling of area 1. No claim in this design says the harness can force delegation or prevent inline implementation.

### Observable checks

- Precedence: `git status && git push` asks; `git status; git push --force` denies; `git add . && git push` asks.
- Segments: `git status && git diff` allows; `git status && rm -rf node_modules` emits nothing; `git diff > /tmp/x` emits nothing; `git commit -m "$(id)"` emits nothing.
- Branch flags: `-d`, `-D`, `--delete`, `-r -d`, `-rd`, `-M` are not promoted; bare, `-a`, `-v`, `--show-current`, and `feature/x` are.
- Commit flags: `-m "msg"` allows; `--amend`, `--no-verify`, and a bare `git commit` are not promoted.
- Add flags: `git add .` and `git add -A` allow; `-p` and `-i` are not promoted.
- Envelope: invalid JSON, `{}`, and a missing command each produce empty stdout and exit 0.
- Status: clean tree renders one line; dirty tree renders the warning with the stash/commit remedy; a non-repo temp directory without `openspec/changes/` is not initialized; the same directory with `openspec/changes/` is; `CC_EIN_NO_GIT_INIT=1` suppresses it; a directory with an unreadable `.git` is never touched.
- Forecast: a temp repo with 3 production lines plus a nested `openspec/changes/x/design.md` and a depth-1 `openspec/config.yaml` reports `production: 3`.
- `settings.json` deployed by sync contains the read-only allow entries and no `Bash(git branch:*)` or `Bash(git commit:*)`.
- `cc-ein/CLAUDE.md` contains exactly one well-formed `ein:harness-discipline` marker pair.

### Required later-phase verification, from the repository root

```sh
bun test
cd installer && bun run typecheck
```

No tests, builds, typechecks, or source changes were performed during this design phase.

### Skill application

- `ein-discipline`: applied to phase boundary, bounded record, and the hard-gate/model-compliance split.
- `comment-style`: applied to the code shapes described here — the flag tables and the precedence order carry the reason (shadowing, headless editor hang, prefix-matcher blindness), never a restatement of the code.
- No installer, Nuxt, or domain skills apply: this change has no such surface.
