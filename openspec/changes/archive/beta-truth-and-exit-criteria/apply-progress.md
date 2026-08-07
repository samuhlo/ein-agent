status: complete
change: beta-truth-and-exit-criteria
phase: sdd-apply
group: // 001. Mantener la verdad canónica de beta

## Completed

- 1.1–1.3: `docs/roadmap-beta.md` is now the maintained beta truth record.
- Recorded the installer `0.42.0` baseline, historical `core-parity` and
  `installer-beta` evidence with residual limits, and the absence of B–E
  completion evidence.
- Added the explicit A–E sequence, complete requirement/posterior/
  discarded-for-beta matrix, BE-01–BE-06 gates, and installer-vs-launcher E2E
  boundary.
- Reconciled the historical 0.40.0, pending-parity, missing-runtime, and
  missing-E2E claims without changing archived evidence or changelog history.

## Verification

- Focused grep checks for `0.42.0`, `BE-01` through `BE-06`, historical claims,
  runtime capability, and E2E boundaries: passed.
- `git diff --check -- docs/roadmap-beta.md`: passed.
- TDD: off; no tests, builds, or typecheck run (documentation-only scope).

## Files changed

- `docs/roadmap-beta.md`
- `openspec/changes/beta-truth-and-exit-criteria/tasks.md` (1.1–1.3 checkboxes)
- This progress record.

## Deviations and remaining work

- User scope limited this apply to task group 001 and `docs/roadmap-beta.md`; the
  README tasks and perimeter/final-review tasks remain for later groups.
- Remaining tasks: 2.1, 3.1, 4.1, and 4.2.

## Group 002 — Actualizar la documentación pública raíz

- 2.1 complete: `README.md` now identifies installer `0.42.0` as the current
  baseline, describes isolated Pi/Claude installer surfaces, attributes
  `--runtime pi|claude|both` only to the installer, and links the maintained
  beta record without claiming the beta launcher is implemented.
- Verification passed: `grep -nF '0.42.0' README.md`,
  `grep -nF -- '--runtime pi|claude|both' README.md`, and
  `git diff --check -- README.md`.
- TDD: off; no tests, builds, or typecheck run as requested.
- Files changed in this group: `README.md`, this progress record, and the
  `2.1` checkbox in `tasks.md`.
- Remaining tasks: 3.1, 4.1, and 4.2.

## Group 003 — Alinear la documentación del instalador

- 3.1 complete: `installer/README.md` now documents isolated Pi/Claude runtime
  selection via `--runtime pi|claude|both`, keeps installation, update, release,
  and doctor under installer ownership, and labels the existing Docker check as
  installer E2E rather than launcher evidence.
- Verification passed: `grep -nF -- '--runtime pi|claude|both' installer/README.md` and
  `git diff --check -- installer/README.md`.
- TDD: off; no tests, builds, or typecheck run as requested.
- Files changed in this group: `installer/README.md`, this progress record, and the
  `3.1` checkbox in `tasks.md`.
- Remaining tasks: 4.1 and 4.2.

## Group 004 — Verificación del perímetro documental

- 4.1–4.2 complete: the attributable project-document diff is exactly
  `docs/roadmap-beta.md`, `README.md`, and `installer/README.md`; unrelated
  dirty/deleted/untracked state remains preserved. No behavior/spec delta exists;
  `spec_delta: none` remains explicit in the design and scope records.
- Allowlist `git diff --check` and focused checks for `BE-01`–`BE-06`, `0.42.0`,
  and `--runtime pi|claude|both`: passed. Semantic review against REQ-01–REQ-07
  and success criteria 1–10: all criteria passed, including historical limits,
  ownership, installer-vs-launcher E2E, and freshness invalidation boundaries.
- Ein discipline and cognitive-doc-design applied; web-design, web-quality, and
  best-practices skipped because this slice has no UI/web implementation.
- TDD off; no tests, builds, or typecheck run as requested. No project docs were
  corrected during verification. No deviations or remaining tasks.
- Files changed in this group: this progress record and the `4.1`/`4.2`
  checkboxes in `tasks.md`. Apply is complete.

## TDD Cycle Evidence

| Item | Evidence |
|---|---|
| Applicability | not applicable: this is a documentation-only change; no product behavior changed. |
| Decision | The design and tasks explicitly selected TDD off for this scoped change. |
| RED/GREEN | not applicable; no RED/GREEN cycle was fabricated. |
| Repository configuration | `openspec/config.yaml` still records `strict_tdd: true`; configuration was not changed. |
| Scoped exception | The non-behavioral documentation scope explains the exception; it does not override or rewrite the repository configuration. |

## Verify remediation — release wording, selector notation, and TDD evidence

- Corrected the repository/local `0.42.0` baseline wording in `README.md` so it does not claim independently verified remote publication or assets.
- Replaced the shell-looking runtime selector example in `installer/README.md` with three copy-safe commands and retained the `pi`/`claude`/`both` contract.
- All task checkboxes remain complete; no project files beyond the requested READMEs and this progress record were modified.
- Focused grep/manual checks passed for the local baseline, absence of remote 0.42.0 wording, copy-safe selectors, TDD evidence, and complete task checkboxes; `git diff --check -- README.md installer/README.md docs/roadmap-beta.md` passed.
- No tests, builds, or typechecks were run, per the documentation-only remediation scope.
- Remaining tasks: none.
