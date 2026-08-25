# Verify report: deliver-style-contract

**status: pass**

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | The rules come from the skill, not a copy | pass | `style-contract.test.ts` asserts the skill's own phrases appear in the block; editing the skill changes the block |
| 2 | A missing core section fails explicitly, naming the skill | pass | Fixtures for each skill separately, plus an unreadable tree |
| 3 | The delivered block carries rules, and keeps the paths | pass | `style-block-delivery.test.ts`; the edge falls back to paths if compilation fails |
| 4 | The linter flags emojis and malformed tagged logs over supplied lines | pass | `style-lint.test.ts`, four malformed-log shapes each naming its own cause |
| 5 | Correct style produces no findings, and the report names its checks | pass | Clean fixtures plus `PERFORMED_CHECKS` published in the report |
| 6 | The byte cost is measured | pass | **2.010 bytes**, 36 lines — see below |
| 7 | Strict TDD evidence per group | partial, and declared | `apply-progress.md`: groups 001–002 and 004 have RED first; group 003 was written implementation-first and says so |

## Gates

- `bun test`: **2560 pass, 0 fail**, 185 files. Baseline before the change was
  2530 / 0.
- `bun run typecheck` (root): pass.
- `cd installer && bun run typecheck`: pass.

## The numbers that drove the redesign

| | bytes |
|---|---|
| Both skills in full | 10.592 |
| First implementation, five sections extracted | 4.889 |
| **Delivered now, the two core sections** | **2.010** |

No rule was dropped to get there. What shrank were examples repeated across
three syntaxes (`Visual Blocks` 931 B, `Vandal Layer` 1.054 B, logging
`Examples` 711 B) and tables turned into single lines.

## Linter noise, measured

Run over the 173 TypeScript files of `ein-pi`, `cc-ein` and `installer/src`:

- First version: **10 findings, 9 of them false positives.** The emoji rule was
  flagging the `✓ ✗ ✕` dingbats of Ein's own visual grammar.
- Tenth finding: `// [EXPORT] Registro en Pi`, flagged as an out-of-catalogue
  tag. It is a correct comment. The skill says *"use these tags only when
  useful"* — it suggests, it does not close, and the skill itself uses
  `[FEATURE]`, `[COMPOSABLE]` and `[CRITICAL]` outside the universal catalogue.
  The rule was removed.
- **Current version: 0 findings over the same 173 files.**

## What this deliberately does not do

- **It does not judge whether a comment explains the why.** That is judgement;
  a linter faking it would be one more screen asserting what it did not compute.
  The report publishes its two checks so silence is not read as approval.
- **It does not block anything.** Informative until its noise is measured in
  real use, not just across the current tree.
- **It does not touch existing comments.** The linter takes lines and never
  walks the tree, so the "touched blocks only" boundary is structural.

## Residual risk

- **7B, the Claude delivery parity, is still open.** `cc-ein/CLAUDE.md` carries
  one sentence where Pi now gets 2 KB of rules. The compiler this change creates
  is what that unit needs.
- **The core sections are written in Spanish inside skills whose body is in
  English.** It is what was approved, and the project's language directive is
  Spanish for documentation, but the mixture within one file is worth a decision.
- **`Essentials` is sliced by heading.** A rename fails closed, which is the
  loud failure rather than the quiet one, but it is still a coupling to a title.
