# Automatic intent discovery — verification

Base reviewed: `origin/main` at `a8e05228a6bf423688058d28a34d5c102e97840c` (includes PRs #392–#399). Implementation lives on `feat/intent-discovery`, in an isolated worktree.

## Results

- Complete suite: **3,242 passed, 0 failed**, 249 files (103.05 seconds).
- Intent-specific integration suite: **30 passed, 0 failed**.
- Final targeted path/intent/summary check: **44 passed, 0 failed**, including CRLF and the legacy `.sdd` root.
- TypeScript check: passed. Both runtime payloads built successfully.
- Real-model conversation: all five checks passed.
- Headroom: both hook registration orders passed.
- pi-lens: final integrated candidate pending; no pass claimed.

## Behavior verified

- New small work and explicit SDD cannot launch scope/design/apply without an agreement. `auto` does not bypass the conversation.
- The tool observes an actual interactive/RPC response tied to a pending revision. An invented response id, an extension-injected answer, another pending work or a repeated proposal cannot manufacture or discard that response.
- Confirmed SDD intent is canonical in `intent.md`; ad-hoc intent remains in session. New unanswered work creates no OpenSpec directory. Identical confirmed material resumes without another question.
- New product decisions reopen discovery, including decisions discovered after the objective was agreed. Earlier round answers survive in the canonical history.
- Cancellation stops work. A material revision invalidates old artifacts. Removing or corrupting a managed intent cannot turn it into a historical exception.
- Tasks/apply require the current design key. Routing identifies the first stale phase; close rejects unresolved/stale intent. The deterministic summary derives the current key from agreement-bound apply/verify evidence.
- A clear current no-questions instruction can delegate decisions. Auto, extension messages, examples and negative mentions cannot activate that exception.

## Reproduction

```sh
bun test tests/intent-discovery.test.ts
bun run typecheck
bun installer/scripts/bundle-template-host.ts
bun installer/scripts/bundle-ein-cc.ts
bun test
bun tooling/verify-intent-runtime.ts
bun tooling/verify-intent-headroom.ts /path/to/headroom-worktree
```

The live pilot reads the installed parent model/effort from `~/.pi-ein/agent/settings.json` (override the installed directory with `EIN_INTENT_PILOT_AGENT_HOME`). It copies authentication into a private temporary directory and removes that copy on exit. It neither updates the installed runtime nor publishes project changes.

## Real-model pilot

`conversation.json` contains the four actual user/assistant turns. `result.json` contains the checks and the design produced by a real child model. Configured model: `openai-codex/gpt-6-astra`, using the configured thinking level.

1. An ordinary CSV request in SDD auto mode produced product questions and zero writes to the sample project beyond its initial fixture.
2. The human answer selected filtered rows across pages, visible order, name/email only and generic UTF-8 CSV. The parent confirmed through the observed response id and delegated the design; the child wrote acceptance scenarios that preserve those choices.
3. A request to also export all rows reopened discovery and asked about the selection interaction; the design was not rewritten while awaiting that decision.
4. Cancellation left the existing design untouched and stopped the pending work.

Earlier pilot iterations usefully exposed an incomplete simulated user answer (the model correctly asked another round) and an overly strict plain-line key check. The check now accepts ordinary Markdown presentation of a unique key and still rejects duplicate/stale declarations.

This is a controlled Pi SDK pilot with the production intent tool/hooks and parent prompt, plus one real model-backed design executor. It is not a claim that all seven phases ran against a production repository. Full lifecycle binding and close behavior have deterministic integration coverage. Question relevance and semantic interpretation remain model responsibilities; response provenance is not proof of comprehension.

## Concurrent integrations

The Headroom compatibility probe loads both actual extensions in both registration orders, with Headroom mode `on`. It verifies the pending gate, intact human response, confirmation, and untouched intent/read/subagent outputs. The protected-output path does not call the compression service; this is hook compatibility coverage, not a benchmark of compression quality.

Candidate snapshots at verification:

- Headroom extension SHA-256: `e38addbe4d689c04fcb672645c6a9e6cd5289e038c976401d57a147c038459bf`.
- Headroom library SHA-256: `576dbe0b322ea0b58eac79253d3d22847359a1f02657bb3878f3c4d2e3108cc6`.

The pi-lens worktree currently exposes a probe configuration, not an integrated candidate on main. No pi-lens runtime compatibility pass is claimed. Repeat the combined run when that integration and the final Headroom revision are available.

## Compatibility boundary

Historical scoped changes without managed intent remain resumable. Existing legacy intent prose is preserved until an adoption round is answered. Claude can read confirmed agreements and shares routing/close validation, but this change does not implement Pi's response-capture tool in Claude: new or changed managed agreements must be resolved in Pi before handoff.
