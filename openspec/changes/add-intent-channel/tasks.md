---
change: add-intent-channel
phase: tasks
created: 2026-08-28T00:00:00Z
status: ready
blocked_by: none
---

# Tasks — add-intent-channel

status: ready
blocked_by: none

## // 001. Pure module: `intent-channel.ts` + unit and contract tests

- [x] 1.1 Create `ein-pi/agent/lib/intent-channel.ts` with canonical exports
  - skills: TypeScript/ESM modules, type safety, pure functions
  - why: Core shared logic (command names, skill name, path builders, artefact resolution) that both Pi and Claude surfaces use; pure TypeScript allows unit testing without runtime dependencies
  - learn: RED — test file tries to import exports (names, builders, path resolver) and fails because module doesn't exist. GREEN — export minimal: const arrays for command names, skill name, builder functions that return objects (never write). TRIANGULATE — multiple cases (empty string, valid change names, dangerous paths). REFACTOR — consolidate helpers, export types.
  - architecture: Module is pure logic only; surfaces (extension + .md files) import and call it. Builders construct kickoff message shapes; callers invoke them. No filesystem I/O here.
  - avoid: Importing Pi or Claude internals; making builders async or side-effectful; hiding constants in functions
  - verify: `bun test tests/intent-channel.test.ts`

- [x] 1.2 Write unit tests for path validation and safe-name filtering
  - skills: `bun test` assertions, type inference, error handling
  - why: Validate artefact path resolver (R9) and confirm builders never write before confirmation (R8). Path resolver must gate on existing `isSafeChangeName` and honor `openspec/changes` → `.sdd/changes` fallback.
  - learn: RED — test imports `resolveIntentPath`, calls with `../../etc`, expects rejection; builder calls return shapes, no side effects. GREEN — wrapper around `isSafeChangeName` returns rejection for archive/bad chars; fallback to `.sdd/changes` works. TRIANGULATE — test archive, `//`, `\`, `..`, empty string, valid names; test both fallback paths.
  - architecture: Tests import real `isSafeChangeName` from sdd-router (no mocking); test isolation via fixtures only
  - avoid: Mocking isSafeChangeName; testing file writes in this unit test (that's integration)
  - verify: `bun test tests/intent-channel.test.ts`

- [x] 1.3 Write contract tests validating `SKILL.md` structure within test suite
  - skills: File I/O, YAML parsing, regex/text search
  - why: Verify R10 (artefact shape), R5 (user-invoked contract statement), R15 (attribution), R16 (language vocabulary), R17 (first-round section addressable). These are structural rules, not behavior — can be machine-checked.
  - learn: RED — test tries to read SKILL.md (not yet created), parse frontmatter, assert sections exist and vocabulary keywords present; all fail. GREEN — SKILL.md exists and passes structure checks. TRIANGULATE — test verifies frontmatter keys (name, description, license), required sections in order (`## /ein:intent`, `## /ein:eh`, `## Artefact template`), Spanish vocabulary keywords (`árbol de decisiones`, `frontera`, `ronda`), last non-empty line contains attribution to Matt Pocock / grilling.
  - architecture: Contract tests live in same file as unit tests; they read disk (SKILL.md) and validate structure, no code execution
  - avoid: Testing behavior (R11/R12 are manual); testing exact prose match instead of vocabulary presence; assuming SKILL.md exists before creating it
  - verify: `bun test tests/intent-channel.test.ts` (both unit + contract tests pass together)

## // 002. Skill: `ein-pi/core/skills/local/intent-channel/SKILL.md`

- [x] 2.1 Create `SKILL.md` with frontmatter, sections, and artefact template
  - skills: Skill format (YAML frontmatter, Markdown structure), bilingual prose (Spanish rules + English identifiers)
  - why: Single source of truth for protocol (R1); both Pi and Claude surfaces reference it, never restate it. Sets contract that `/ein:intent` rounds follow frontier, `/ein:eh` restates without acting, artefact shape is fixed.
  - learn: RED — group 001 test fails because SKILL.md doesn't exist. GREEN — create file with frontmatter (`name: intent-channel`, `description`, `license`), sections (`## /ein:intent`, `## /ein:eh`, `## Artefact template`), Spanish user-facing prose (rules, vocabulary), English identifiers (`intent.md`, `ein:intent`, etc.). TRIANGULATE — validate against group 001 contract tests; all assertions pass.
  - architecture: Skill lives in `core/skills/local/` and is NOT loaded into coordinator prompts (R4 verified in group 006). Deployed to both runtimes by existing sync.ts (lines 726–732); no new deployment code needed.
  - avoid: Replicating protocol body in extension or `.md` files; inline rules that belong in a linked section; verbose explanations (protocol is concise)
  - verify: Group 001 contract test `bun test tests/intent-channel.test.ts --grep "SKILL.md"` passes; file structure and vocabulary validated

## // 003. Pi surface: `ein-pi/agent/extensions/ein-intent.ts` + manifest update

- [x] 3.1 Create `ein-pi/agent/extensions/ein-intent.ts` with command registration and busy guard
  - skills: Pi extension API (`registerCommand`, `ExtensionContext`, `isIdle()`, `sendUserMessage()`)
  - why: Register `/ein:intent` and `/ein:eh` commands in Pi runtime (R2); inject kickoff message via `pi.sendUserMessage()` after validating agent is idle (R14, precedent: ein-skill-registry.ts:505)
  - learn: RED — test scans file for `registerCommand("ein:intent"` and `registerCommand("ein:eh"` and finds zero or wrong count. GREEN — register both commands with minimal handlers: each checks `ctx.isIdle()`, notifies if busy, calls kickoff builder from intent-channel.ts if idle. TRIANGULATE — busy-guard error message, skill name reference to `intent-channel` (or import from intent-channel.ts export).
  - architecture: Handlers are thin dispatchers; protocol logic lives in SKILL.md (not here). Kickoff builders (message shapes) are in intent-channel.ts, imported and called. Skill name is hardcoded constant (can be exported from intent-channel.ts for single source of truth).
  - avoid: Putting protocol logic in handler; mixing error handling with async phase navigation; inlining skill reference (use constant)
  - verify: `grep -c 'registerCommand' ein-pi/agent/extensions/ein-intent.ts` returns 2 (exactly two registrations)

- [x] 3.2 Add entry to `ein-pi/agent/extensions-manifest.json`
  - skills: JSON editing, manifest conventions
  - why: Installer verify gate (R14) must detect if extension file is missing after install. Without manifest entry, installer skips verification and command silently goes missing (silent absence is blocker per // 003).
  - learn: RED — grep `ein-intent` in manifest fails (entry missing). GREEN — add one line to manifest listing extension path (e.g., `"${AGENT_DIR}/extensions/ein-intent.ts"`). TRIANGULATE — validate manifest JSON parses.
  - architecture: Manifest is verification-only list, not a loader; Pi auto-loads all `extensions/` directory files. Manifest tells installer which files to check exist.
  - avoid: Confusing manifest with a dynamic loader; adding entries for non-existent files
  - verify: `grep 'ein-intent' ein-pi/agent/extensions-manifest.json` shows the entry; `jq . ein-pi/agent/extensions-manifest.json` parses cleanly

## // 004. Claude surface: `ein-cc/commands/ein/{intent,eh}.md`

- [x] 4.1 Create `ein-cc/commands/ein/intent.md` with frontmatter and skill reference
  - skills: Claude command `.md` format (YAML frontmatter, Markdown body), skill references
  - why: Register `/ein:intent` command in Claude runtime (R2) as static instruction; surface points to shared skill (R3), does NOT restate protocol body (R1)
  - learn: RED — file missing; `listClaudeCommands()` does not return it; sync.ts will not deploy it. GREEN — create `.md` with YAML frontmatter (`---` delimiters; keys: `description`, optional `allowed-tools`); body references `intent-channel` skill name and instructs Claude to run that skill protocol. TRIANGULATE — body is pointer to skill, not inline protocol; verify frontmatter YAML parses.
  - architecture: Body is instruction to Claude model; it is NOT the protocol itself — that lives in SKILL.md. Sync.ts already knows how to deploy `.md` files from `commands/ein/` (no new code needed).
  - avoid: Writing prompt-based decision-tree logic inline; restating protocol sections; overspecifying allowed-tools (let caller decide)
  - verify: File exists at `ein-cc/commands/ein/intent.md`; `grep 'intent-channel' ein-cc/commands/ein/intent.md` shows skill name reference; YAML frontmatter parses

- [x] 4.2 Create `ein-cc/commands/ein/eh.md` with empty `allowed-tools`
  - skills: Claude command `.md`, tool-allowlist enforcement
  - why: Register `/ein:eh` command in Claude (R2); enforce R13 (restate-only, no action) by declaring empty tool allowlist so Claude runtime prevents tool calls at dispatch time
  - learn: RED — file missing or allowed-tools lists any tools (violation of empty contract). GREEN — create `.md` with frontmatter including `allowed-tools: ""` (or `allowed-tools:` with no value); body instructs Claude to restate user message using project vocabulary, no tools, no edits. TRIANGULATE — verify frontmatter; test that allowed-tools is present and empty (empty string or null, not absent).
  - architecture: Tool allowlist enforcement is runtime-level (Claude obeys it at dispatch); test of actual /ein:eh behavior (no tool calls, pure restatement) is manual (R13 behavioral half). Structural requirement (empty allowed-tools) is verifiable here.
  - avoid: Listing any tools; writing restatement logic inline instead of delegating to skill; testing behavior instead of declaration
  - verify: File exists at `ein-cc/commands/ein/eh.md`; `grep 'allowed-tools' ein-cc/commands/ein/eh.md` shows empty value; YAML parses

## // 005. Parity test: `tests/intent-channel-parity.test.ts`

- [x] 5.1 Write test: canonical command names exist on both Pi and Claude surfaces
  - skills: `bun test`, file scanning (regex), array comparison
  - why: R2 — both runtimes must register the same command names; this is the unfilled parity test map.md flagged ("No test currently enforces that a command name exists in **both** runtimes"). Risk: silent divergence (one side gains/loses a command without the other noticing).
  - learn: RED — test imports canonical command list from intent-channel.ts (e.g., `["ein:intent", "ein:eh"]`), scans Pi extension with regex for `registerCommand("ein:...", ...)`, scans Claude with `listClaudeCommands()`, asserts all three match; test fails because surfaces don't exist yet. GREEN — scan real extension and .md files; compare against canonical list; all three align. TRIANGULATE — add a fake command to only one surface, verify test catches divergence.
  - architecture: Test is pure function (file reads, regex, string matching); does not execute actual commands or invoke handler logic. Test confirms presence, not behavior.
  - avoid: Mocking file I/O; testing command behavior (that's integration); confusing "command exists" with "command works"
  - verify: `bun test tests/intent-channel-parity.test.ts --grep "command presence"`

- [x] 5.2 Write test: both surfaces resolve to the same skill, compared against sync's declared destinations
  - skills: File I/O, path resolution, byte comparison
  - why: R3 — both runtimes must reach the same skill. The comparison MUST be repo source against the destinations `sync.ts` *declares* it would write (its path-resolution functions), NEVER against an installed `${CLAUDE_CONFIG_DIR}` tree. Ein runs the installed copy, so repo and installed home diverge until a reinstall: a test that reads the installed home measures when you last synced, not drift between runtimes, and degrades into a conditional skip. Deterministic in CI and on a cold clone.
  - learn: RED — test imports the canonical skill name and path builders from `intent-channel.ts`, asks `sync.ts` for the Pi and Claude destination paths it would produce for that skill, and asserts both derive from the SAME single repo source file; fails because neither the skill nor the builders exist. GREEN — one repo source, two declared destinations, same resolved basename and frontmatter `name: intent-channel`. TRIANGULATE — a second local skill resolves to its own pair of destinations without collision; a bogus skill name resolves to nothing rather than silently to this one.
  - architecture: Pure path-resolution test. Reads the repo source `SKILL.md` and calls sync's resolvers; does NOT read `${CLAUDE_CONFIG_DIR}`, does NOT run sync, does NOT touch the installed home. Depends on group 002 for the source file.
  - avoid: Reading or comparing against the installed home; calling actual sync; `test.skip`/conditional skip on a missing deployed path (a test that can skip itself is not a gate); asserting file existence without comparing resolved identity
  - verify: `bun test tests/intent-channel-parity.test.ts --grep "skill identity"`

- [x] 5.3 Write test: surfaces don't restate protocol body
  - skills: Grep/regex, text pattern matching
  - why: R1 — protocol lives in SKILL.md only; if a surface copies protocol text, it diverges silently when one is updated. This test guards against the drift failure mode.
  - learn: RED — extract unique rule sentences from SKILL.md (e.g., key vocabulary like "árbol de decisiones", "frontera", decision-tree rules); grep for these strings in ein-intent.ts extension source and in both .md command files; test fails if found in surfaces (expected: found only in SKILL.md). GREEN — strings appear only in SKILL.md, not in surfaces. TRIANGULATE — test matches specific vocabulary + structure phrases, not just any word (avoid false positives); surfaces may reference `intent-channel` skill name (that's OK) but not protocol rules.
  - architecture: Test guards structural integrity (no duplication); pattern matches are narrow (vocabulary keywords, rule openings)
  - avoid: Overly strict regex (allow neutral references like skill name); testing exact prose match (only key phrases); false positives on common words
  - verify: `bun test tests/intent-channel-parity.test.ts --grep "no restatement"`

## // 006. Zero-cost verification: prompt and router contracts

> **Verification group, not a TDD cycle.** These items assert that existing behaviour did NOT change, so there is no failing RED to record: the referenced files are read and grepped, never written. `sdd-verify` must expect assertions plus their output as evidence, not a red-green transcript.


- [x] 6.1 Verify skill adds zero fixed prompt cost (R4)
  - skills: Style contract mechanics, byte counting, coordinator prompt inspection
  - why: R4 — skill must NOT appear in generated `ein-cc/CLAUDE.md` or `core/AGENTS.md` or orchestrator prompts. `compileStyleContract` uses a fixed list (`comment-style`, `logging-style`); adding a new local skill must not grow that list or the per-turn prompt bill.
  - learn: RED — `bun test tests/style-contract.test.ts` initially passes (before changes, or with skill added to repo but not loaded). GREEN — create SKILL.md, verify test still passes; bytes unchanged. GREEN — grep for `intent-channel` in coordinator files (`core/AGENTS.md`, `ein-cc/CLAUDE.adapter.md`, generated `ein-cc/CLAUDE.md`, `assets/orchestrator.md`); should find zero matches (identifiers in code OK, protocol body must be absent).
  - architecture: Coordinator loads only fixed skills (line 79 of style-contract.ts); intent-channel is local, discovered but not auto-loaded
  - avoid: Importing skill into AGENTS.md; confusing "skill file exists" with "skill text is in prompt"; assuming compileStyleContract grows
  - verify: `bun test tests/style-contract.test.ts tests/style-parity-claude.test.ts` (existing tests, should still pass)

- [x] 6.2 Verify router unchanged by `intent.md` presence (R6)
  - skills: Router testing, fixture trees, phase-artifact contract
  - why: R6 — `intent.md` is NOT an SDD phase artefact; its presence/absence must not change deterministic router output. `listActiveChanges()` already ignores non-phase subdirectories, but router tests must confirm this holds.
  - learn: RED — fixture tree with `openspec/changes/<change>/intent.md` present (without scope.md/map.md); run router, verify next-phase answer is identical to same tree WITHOUT intent.md. GREEN — router returns same `next:` with/without intent.md; artefact map does not list it; no out-of-order diagnostic. TRIANGULATE — test multiple change states (scope done → map, map done → design, etc.) with/without intent.md present.
  - architecture: Router tests already exist in tests/sdd-router*.test.ts; add new cases or fixture to existing suite
  - avoid: Testing that router loads/parses intent.md (it shouldn't); confusing "optional" with "phase artifact"
  - verify: `bun test tests/sdd-router.test.ts tests/sdd-router-audit.test.ts` (add new test cases; existing suite should still pass)

- [x] 6.3 Verify intent.md is optional: no phase requires it (R7)
  - skills: Scope and lane validation
  - why: R7 — change without `intent.md` must not be blocked at any phase; sdd-scope and lane definitions are unchanged
  - learn: RED — run standard lane on fixture tree with no intent.md; scope phase should complete without error (it doesn't read intent.md as a prerequisite). GREEN — scope runs successfully, produces scope.md output, no error about missing artefact. TRIANGULATE — test that both tdd=strict and tdd=off lanes work with/without intent.md.
  - architecture: Scope phase reads scope.md input only; intent.md is not a scope prerequisite. This is verified by existing scope tests passing (they don't reference intent.md).
  - avoid: Adding intent.md as a prerequisite to any phase; confusing "artefact the user can create" with "artefact the phase requires"
  - verify: `bun test tests/sdd-scope.test.ts` (existing test; should still pass). Do NOT run a whole lane inside apply: the router-level proof already lives in 6.2, and the live spot-check belongs to the manual checks recorded in `verify-report.md`.

## // 007. Integration checks: deployment, types, full test suite

> **Verification group, not a TDD cycle.** These items assert that existing behaviour did NOT change, so there is no failing RED to record: the referenced files are read and grepped, never written. `sdd-verify` must expect assertions plus their output as evidence, not a red-green transcript.


- [x] 7.1 Verify sync deployment lists new commands and skill
  - skills: Bash, CLI tools (`bun ein-cc/sync.ts`)
  - why: End-to-end sanity check that sync.ts deploys both new Claude commands and the skill without modification. Design confirms sync.ts needs no edit; this verifies that claim.
  - learn: RED — run `bun ein-cc/sync.ts --dry` before files exist, output doesn't mention intent-channel. GREEN — create all files (groups 002–004), run sync dry-run, output includes paths for `intent.md`, `eh.md`, and SKILL.md. TRIANGULATE — spot-check that paths resolve (e.g., `~/.claude-ein/commands/ein/intent.md`, `~/.claude-ein/skills/intent-channel/SKILL.md`).
  - architecture: Deployment is deterministic; sync.ts already handles command `.md` (line 704: `listClaudeCommands()`) and skill flattening (lines 726–732). No code changes to sync.ts.
  - avoid: Modifying sync.ts (design says no edit); running actual sync (--dry only)
  - verify: `bun ein-cc/sync.ts --dry 2>&1 | grep -E '(intent|eh|SKILL)'` — must show paths for both commands and skill

- [x] 7.2 Typecheck at root and installer (two gates)
  - skills: TypeScript compiler (`bun run typecheck`), diagnostics
  - why: Project has two typecheck gates: root (ein-pi + ein-cc) and installer (separate). Both must pass; type errors in either block delivery.
  - learn: RED — run both typechecks before implementing, expect errors (new files don't exist or have type issues). GREEN — implement all groups (002–004), run both typechecks, zero errors. TRIANGULATE — test that a type error in intent-channel.ts is caught by root typecheck; a type error in manifest is caught by installer typecheck.
  - architecture: Two independent typecheck boundaries; memory note: zwei-gates. Root gate covers shared code (intent-channel.ts) and tests. Installer gate covers manifest + any installer-side references.
  - avoid: Assuming root typecheck covers installer; running only one gate
  - verify: `bun run typecheck` (from repo root) && `cd installer && bun run typecheck` (both must succeed)

- [x] 7.3 Run full test suite (new + existing tests)
  - skills: Test harness coordination, regression detection
  - why: Verify no regressions; existing tests (claude-project-settings, sdd-aliases, style-contract, sdd-router*) must still pass. New tests (intent-channel.test.ts, intent-channel-parity.test.ts) join the suite.
  - learn: RED — at this point, all group implementations are done. Run `bun test`; expect new tests to pass, existing to pass (the RED phase was during groups 001–005). GREEN — full suite green. TRIANGULATE — run specific test files and full suite.
  - architecture: Test runner is `bun test` with auto-discovery of `.test.ts` files. No test skipping or xfailing.
  - avoid: Skipping new tests; allowing existing tests to regress; committing with failing tests
  - verify: `bun test` (full suite); `bun test tests/intent-channel.test.ts tests/intent-channel-parity.test.ts tests/claude-project-settings.test.ts tests/sdd-aliases.test.ts tests/style-contract.test.ts tests/sdd-router.test.ts` (key test files)

## Manual verification (recorded in `verify-report.md`, not automated)

These requirements verify behavior through transcript inspection, not code assertions (per C6: "pretending otherwise would produce tests that assert nothing"):

- **R11 (Rounds over frontier)**: One live intent session on a non-trivial request. Verify round 1 contains only prerequisite-free decisions, numbered with recommendations, in plain text answerable as `"1A, 2B"`.
- **R12 (Facts vs. decisions)**: Same session. Verify scout findings (with `path:line` references) arrive with round 2 without delaying round 1; user is never asked for what the codebase answers.
- **R13 (Restate behavior)**: One `/ein:eh` run on a dense message. Verify output is plain-language restatement only; no tool call, no file edit (structural requirement `allowed-tools: ""` is verified in group 004).

Record these checks in `openspec/changes/add-intent-channel/verify-report.md` during `sdd-verify` phase with transcript excerpts as evidence.

---

## Execution notes

- **Group order**: 001 → 002 → {003, 004} (parallel) → 005 → 006 → 007.
- **TDD discipline**: Each group's `learn` section specifies RED → GREEN → TRIANGULATE → REFACTOR cycle explicitly. Apply will run one group per turn; RED phase tests should fail first, then GREEN passes them.
- **Verify commands are exact**: All listed `verify:` commands are copy-paste-ready; no interpretation needed.
- **Zero ambient interpretation**: Each checklist item specifies exactly what to create/change and how to know it works. Sdd-apply will not need to design decisions.
