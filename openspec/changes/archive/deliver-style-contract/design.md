# Design: deliver-style-contract

**Change:** `deliver-style-contract`
**Phase:** design
**Lane:** micro
**TDD:** strict

## A. Proposal

Two pure modules. `style-contract.ts` compiles the extract from the skills;
`style-lint.ts` checks touched lines against the parts of that contract a
machine can verify. The extension stops emitting paths and emits the extract.

## B. Spec

- The compiler MUST read the skill files on disk and extract the declared
  sections, and MUST fail explicitly when a required section is absent.
- The compiler MUST NOT embed a second copy of the rules; the skill stays the
  only source of their text.
- The delivered block MUST carry the rules themselves, and MUST still name the
  skill paths for the detail.
- The linter MUST report emojis in comments or log lines, comment tags outside
  the catalogue, and log lines that break the documented base format.
- The linter MUST report which checks it ran, so silence is not read as a full
  endorsement of a comment's usefulness.
- The linter MUST operate over supplied lines, never by walking the repository.

## C. Decisions

### D1 — Compiled, not copied

An extract pasted into a TypeScript file is a second source that drifts the
first time Samu edits the skill, and it drifts silently. The compiler reads
`SKILL.md` and slices the sections by heading, so the delivered rules are the
skill's own words. A test asserts a phrase from the skill appears in the
extract: if the skill changes, the extract changes with it.

### D2 — Fail closed on a missing section

Slicing by heading is fragile against a rename, and the dangerous failure is the
quiet one: a shorter extract still looks like an extract. So a missing heading is
an error with the section named, and a test fixes the expected set. If Samu
renames a heading, the build says so instead of silently delivering less.

### D3 — The linter checks what is checkable, and says what it checked

Three checks, all mechanical, none of them a judgement:

- **Emojis** — both skills ban them outright. Zero ambiguity.
- **Tags outside the catalogue** — a comment opening with `[SOMETHING]` where
  `SOMETHING` is not a documented tag is a typo or an invention.
- **Log base format** — `[TAG] SEP ACTION :: key: value`, tag ≤6 uppercase,
  action ≤12 uppercase, separator from the catalogue.

What is deliberately absent: whether a comment explains the why, whether it is
stale, whether the vandal accent earns its place. Those are judgement. The
report therefore names the checks it ran, so a clean result reads as "these
three passed", not "the style is right".

### D4 — Touched lines, supplied by the caller

The linter takes lines; it does not walk the tree. That keeps it pure, keeps it
testable, and makes the scope boundary structural rather than a promise: it
*cannot* rewrite the repository's history of comments because it never sees it.

### D5 — Cost is measured before it is adopted

The extract rides on every code-writing turn. Its size is recorded against the
prompt baseline in this change's verify report, so adopting it is a decision
with a number attached rather than an assumption.

## D. Success Criteria

| # | Proven by |
|---|---|
| 1 | Extract contains the skill's own phrases; test reads both |
| 2 | A fixture skill missing a section produces a named failure |
| 3 | The block contains rules and still lists the paths |
| 4 | Linter fixtures: emoji, invented tag, malformed log |
| 5 | A fixture written to the skill produces zero findings, and the report lists the checks performed |
| 6 | Byte count recorded in `verify-report.md` |
| 7 | `apply-progress.md` per group |

## Risks

- **The extract costs bytes on every apply.** Measured, not assumed; if it is
  large the sections shrink before the idea is abandoned.
- **Heading-slicing breaks on a rename.** Mitigated by failing closed, which
  converts a silent degradation into a loud one.
- **Three checks can be read as "the style is verified".** The report naming its
  own checks is the mitigation, and it is the same honesty the screen-truth guard
  applies elsewhere.
