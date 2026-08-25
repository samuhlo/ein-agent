# Scope: deliver-style-contract

**Change:** `deliver-style-contract`
**Phase:** scope
**Lane:** micro
**TDD:** strict (explicit user choice; this phase records it only)
**Artifact language:** English

## Problem statement

`comment-style` and `logging-style` define the voice of Samu's code in detail —
tags, a bounded vandal vocabulary, visual blocks, a greppable log format — and
they are not applied. Not to Ein's own code, not to the code Ein writes
elsewhere. Roadmap unit 7 records the three-layer diagnosis; this change
executes 7A and 7C.

The wiring is not the problem. `codeConventionSkillBlock`
(`ein-pi/agent/extensions/ein-skill-registry.ts:376`) reaches both the parent and
`sdd-apply` (`ein-ai.ts:850,872`). What it delivers is the problem: a sentence
saying "read and follow these skills" plus **three paths**. `comment-style` is
258 lines; opening it costs context, and an executor on a budget writes the code
without having read it. Nothing distinguishes "did not read it" from "read it
and ignored it", because no gate ever looks at a comment.

## Scope boundary

### In scope

- Compile a normative extract from each style skill: the operative rules and the
  vocabulary, not the full document. Compiled from the skill, never a second
  copy of its content.
- Fail closed: if a required section is missing from a skill, the compiler says
  so instead of silently producing a shorter extract.
- Deliver that extract where code is written, replacing the list of paths. Keep
  the paths for the detail.
- A deterministic linter over **touched lines** covering what a machine can
  actually check, and declaring what it cannot.
- Measure the extract's byte cost against the orchestrator prompt baseline.

### Out of scope

- 7B, the Claude delivery parity. It needs the compiler this change creates and
  is a separate unit.
- Rewriting existing comments or logs anywhere in the repository. The style
  applies to touched blocks; a global pass would be the harness rewriting its own
  artifacts for aesthetics.
- Judging whether a comment truly explains the why. That is judgement, and a
  linter faking it would be one more screen asserting what it did not compute.
- Making the linter a hard gate on apply before its noise is measured.
- Changing either skill's content. They are the canonical source.

## Acceptance criteria

1. The compiler produces the extract from the skill files on disk, and a test
   proves the extract's rules are the skill's rules, not a copy that can drift.
2. A skill missing a required section produces an explicit failure, never a
   silently shorter extract.
3. The block delivered to code-writing agents carries the rules themselves; the
   skill paths remain available for the detail.
4. The linter flags, over touched lines: emojis in comments or logs, comment tags
   outside the catalogue, and log lines that break the documented format.
5. The linter does not flag correct style, proven over a fixture written to the
   skill, and it reports what it checked so its silence is not mistaken for a
   full endorsement.
6. The extract's byte cost is measured and recorded against the baseline.
7. Strict TDD evidence per group.

## Evidence and likely seams

- `ein-pi/core/skills/local/comment-style/SKILL.md` — sections `Core Principle`,
  `Vandal Layer` (the bounded vocabulary), `Universal Tags`, `Inline Why
  Comments`, `Strict Enforcement Contract`.
- `ein-pi/core/skills/local/logging-style/SKILL.md` — sections `Core Principle`,
  `Base Format`, `Tag Catalogue`, `Golden Rules`. The base format
  (`[TAG] SEP ACTION :: key: value`, tag ≤6 upper, action ≤12 upper) is almost
  entirely machine-checkable.
- `ein-pi/agent/extensions/ein-skill-registry.ts:359-390` — `CODE_CONVENTION_KEYS`
  and the block that currently emits paths.
- `ein-pi/agent/extensions/ein-ai.ts:850,872` — `writesCode` and the injection.
