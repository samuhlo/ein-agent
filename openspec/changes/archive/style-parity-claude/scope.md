# Scope: style-parity-claude

**Change:** `style-parity-claude`
**Phase:** scope
**Lane:** micro
**TDD:** strict (explicit user choice; this phase records it only)
**Artifact language:** English

## Problem statement

Roadmap unit 7B. The preceding change gave Pi 2 KB of operative style rules in
the prompt of whoever writes code. Claude still had one sentence in
`cc-ein/CLAUDE.md:17` asking to "load `comment-style` and enforce it" — the same
pointer-instead-of-content defect, in the runtime that was supposed to be a
relay rather than a second standard.

## Scope boundary

### In scope

- Materialize the compiled style block into the Claude surface for whoever
  writes code: the `sdd-apply` agent and the coordinator.
- Prove that what is materialized still matches what the skill says, so an edit
  without a re-sync is loud instead of silent.
- Keep the block off the agents that do not write code.

### Out of scope

- Changing the skills or the compiler, both delivered by the previous change.
- Making the Pi injection dynamic in Claude. There is no per-turn mechanism in
  this runtime; the block is materialized at sync time and that difference is
  recorded rather than hidden.
- Cleaner/Architect parity, deferred elsewhere.

## Acceptance criteria

1. `sdd-apply` in the Claude surface carries the style rules themselves.
2. The coordinator carries them too, because in practice it also edits code.
3. What is materialized matches the contract compiled from the skill, so a stale
   deployment fails a test instead of passing silently.
4. Agents that do not write code do not carry the block.
5. A skill that cannot be compiled fails the sync explicitly rather than
   deploying a surface without style.
6. Strict TDD evidence.

## Evidence and likely seams

- `cc-ein/sync.ts:390-404` — `translateAgent`, which composes each agent file.
- `cc-ein/sync.ts:475-488` — `compileClaudeSurface`, where agents and the
  coordinator are assembled.
- `cc-ein/CLAUDE.md` — generated output; regenerated, never hand-edited.
- `ein-pi/agent/lib/style-contract.ts` — the compiler from the previous change.
