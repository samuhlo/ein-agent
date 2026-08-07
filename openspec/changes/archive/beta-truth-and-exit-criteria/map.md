status: pass
scope_status: bounded
change: beta-truth-and-exit-criteria
phase: sdd-map
budget:
  max_tokens: 15000
  max_reads: 30
  budget_source: scope.md
  webfetch: false
ledger:
  reads:
    - { path: openspec/changes/beta-truth-and-exit-criteria/scope.md, lines: "1-6, 46-76, 78-186", estimated_tokens: 1600 }
    - { path: docs/roadmap-features-ein.md, lines: "1-75, 105-204, 320-396", estimated_tokens: 2400 }
    - { path: docs/roadmap-beta.md, lines: "1-4, 25-33, 95-141, 145-148", estimated_tokens: 1000 }
    - { path: docs/ein_futuras_features.md, lines: "34-155", estimated_tokens: 800 }
    - { path: README.md, lines: "11-40, 55-68, 84-142", estimated_tokens: 900 }
    - { path: installer/README.md, lines: "1-19, 40-81", estimated_tokens: 550 }
    - { path: CHANGELOG.md, lines: "1-70", estimated_tokens: 600 }
    - { path: installer/package.json, lines: "1-5", estimated_tokens: 60 }
    - { path: installer/src/core/version.ts, lines: "1-24, 31-57", estimated_tokens: 180 }
    - { path: openspec/changes/archive/core-parity/summary.md, lines: "1-31", estimated_tokens: 240 }
    - { path: openspec/changes/archive/core-parity/verify-report.md, lines: "1-12, 70-95", estimated_tokens: 500 }
    - { path: openspec/changes/archive/installer-beta/summary.md, lines: "1-29", estimated_tokens: 260 }
    - { path: openspec/changes/archive/installer-beta/verify-report.md, lines: "1-12, 24-34, 59-87, 103-204", estimated_tokens: 900 }
    - { path: .github/workflows/ci.yml, lines: "1-48", estimated_tokens: 250 }
    - { path: .github/workflows/e2e.yml, lines: "1-24", estimated_tokens: 130 }
    - { path: .github/workflows/installer-release.yml, lines: "1-97", estimated_tokens: 500 }
    - { path: e2e/docker-test.sh, lines: "1-216", estimated_tokens: 1300 }
    - { path: e2e/Dockerfile.ubuntu, lines: "1-18", estimated_tokens: 100 }
    - { path: openspec/config.yaml, lines: "1-58", estimated_tokens: 300 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed:
    tokens: 12190
    reads: 19

## Map conclusion

This is a documentation/release-truth reconciliation only. The authoritative roadmap defines A–E as: truth gate, shared state, runtime adapters, minimal launcher, then launcher-specific E2E; it explicitly keeps the launcher separate from installer ownership (`docs/roadmap-features-ein.md:9-24, 27-50, 105-143`). The repository evidence supports an installer/workbench foundation, not completion of the beta launcher path (`scope.md:64-76`).

No product behavior, workflow, installer implementation, E2E scenario, release, or OpenSpec behavior delta belongs in this change. `spec_delta: none` is explicit (`scope.md:184-186`).

## Authority and evidence map

| Authority layer | Exact references | Evidence and reconciliation decision | Blast radius |
|---|---|---|---|
| Canonical roadmap | `docs/roadmap-features-ein.md:1-24, 27-75, 105-143`; dependency diagram `:320-340`; locked decisions `:342-363` | Beta is a separate minimal CLI/workbench. Required flow is project + Pi/Claude, OpenSpec phase/next step, common session operations, launch, and compact doctor. State continuity transfers normalized project state, not private conversation history; relevant code changes invalidate verification. Universal updater, full dashboard/TUI, parallel writers, and cleaner/architect mutations are outside beta. A has no launcher or installer implementation (`:132-145`). | Governs all later B–E acceptance and prevents a stale MVP, general TUI, or installer-ownership model from entering design. This is read-only input and remains canonical despite being untracked (`scope.md:52, 58`). |
| Scope packet / current truth | `scope.md:6, 46-76, 78-102, 104-147` | Current local installer baseline is 0.42.0: scope records newest local tag `installer-v0.42.0`, package/source/changelog agreement, and 0.41 runtime/E2E groundwork. It also records no completion evidence for B–E and explicitly says installer E2E is not launcher E2E. The classification matrix and BE-01–BE-06 gates are the planning contract. | Direct handoff to design/tasks; these statements must be preserved, not re-inferred from stale docs. The tag claim is scope evidence; no Git inspection or publication was performed in this map. |
| Current release metadata | `installer/package.json:2-4`; `installer/src/core/version.ts:17, 21-24`; `CHANGELOG.md:6-29, 48-69`; tag assertion in `scope.md:64` | Package version, source marker, and current changelog heading all identify 0.42.0. The 0.41 entry records `--runtime pi|claude|both` and isolated-container installer scenarios (`CHANGELOG.md:17-29`); the 0.40 entry records isolated Pi/Claude surfaces and compiled Claude payload smoke (`:48-69`). These are installer/release facts, not launcher readiness. | Apply may update the three bounded docs to reference 0.42.0 and current installer capability. It must not rewrite `CHANGELOG.md`, version files, or release metadata. |
| Archived core parity | `openspec/changes/archive/core-parity/summary.md:2, 22-30`; `verify-report.md:3-12, 84-95` | Historical evidence is `status: pass`, `behavior_coverage: verified`, with generated parity and explicit Claude-side OpenSpec synchronization; no implementation blockers. Residual boundary: external/live Claude MCP was not exercised. The old roadmap statement that verification/closure is still pending is stale when read against this archived verification. | Only `docs/roadmap-beta.md` needs historical-status reconciliation. Archived artifacts stay immutable; do not promote this evidence into launcher completion. |
| Archived installer beta | `openspec/changes/archive/installer-beta/summary.md:2, 8, 16-29`; `verify-report.md:1-12, 24-34, 59-87` | Historical local pass is intentionally `behavior_coverage: partial`: runtime selection and installer E2E passed, but native macOS execution and a shared-Bun failure assertion were absent. No 0.41.0 remote tag/workflow/release publication was claimed (`verify-report.md:34, 62-81`). | `docs/roadmap-beta.md` must retain these residuals and separate local evidence from remote/platform evidence. No archived report or installer implementation is edited. |
| CI and release surfaces | `.github/workflows/ci.yml:3-4, 42-47`; `.github/workflows/e2e.yml:1-4, 8, 23-24`; `.github/workflows/installer-release.yml:3-13, 55-96` | CI runs root `bun test` and installer typecheck on Ubuntu/macOS. Installer E2E is manual and runs `./e2e/docker-test.sh` on Ubuntu. Release is tag/dispatch driven, typechecks, builds four targets, runs compiled Claude-payload smoke, writes checksums, and publishes via GitHub Actions. Workflow definitions prove available checks, not a live run. | Evidence-only. Apply must not change workflows, dispatch E2E, publish, or claim run/asset verification without separately captured evidence. |
| Installer E2E surface | `e2e/docker-test.sh:3-7, 31-45, 109-130, 134-215`; `e2e/Dockerfile.ubuntu:2-16` | The script defines invalid, default-Pi, Claude-only, and Both scenarios; valid cases rerun for convergence, Both checks Pi before Claude, and doctor/dry-run are installer checks. The Ubuntu image is a clean non-root environment. It does not select projects, project OpenSpec state, runtime sessions, runtime switching, or verification freshness. | Must be named installer E2E prerequisite/regression evidence, never BE-05 proof. No script/container changes belong in A. |
| Historical/public docs to reconcile | `docs/roadmap-beta.md:1-4, 25-33, 95-141`; `README.md:11-40, 55-68, 84-142`; `installer/README.md:1-19, 40-81`; idea catalog `docs/ein_futuras_features.md:34-155` | `roadmap-beta.md` still says core-parity and installer-beta are pending, describes latest release as 0.40.0, says E2E never ran, and says `--runtime` is unavailable. Root README has stale 0.40.0 release/source-of-truth links and mixed Pi-only installer wording. Installer README is Pi-only/legacy-path oriented and lacks current runtime-selection boundaries. The idea catalog contains broader proposals (configuration mutation, updater, arbitrary agents, LazyVim-like TUI, old MVP) and is explicitly non-authoritative. | Only the three named apply outputs are editable. Catalog, canonical roadmap, changelog, workflows, E2E, archived history, and unrelated dirty files remain read-only. |

## Requirement classification to preserve

The full matrix is in `scope.md:78-102`; the design record must carry these categories without expanding them:

- **Requirement / A–E:** project + Pi/Claude selection; active OpenSpec change/phase/next step; list/create/resume/launch sessions; compact doctor; deterministic normalized project state; continuity through normalized state; exact-code-state verification freshness; launcher-specific success/failure/stale-verification E2E.
- **Posterior or beta-excluded:** launcher configuration mutation, universal/advanced updater, per-session summaries, arbitrary future agents, cleaner/architect processes, and safe parallelism. These belong to later named slices or are deferred, not implicit D acceptance.
- **Discarded for beta:** full dashboard/general TUI, expanding installer TUI, launcher-owned install/update logic, private conversation-history migration, parallel writers, and cleaner/architect mutations. “Discarded” means not an unplanned A–E acceptance expansion, not necessarily forbidden forever.

Canonical backing is `docs/roadmap-features-ein.md:27-75, 107-143, 147-318`; the broader catalog's conflicting MVP/updater wording is historical idea input only (`docs/ein_futuras_features.md:34-155`).

## Acceptance-record shape / BE gates

The maintained record produced by apply must include the matrix, release baseline, A–E order, explicit exclusions, and evidence links. It must reconcile or label every stale historical claim and separate release evidence from launcher readiness (BE-01, `scope.md:108-113`). The remaining gates are:

- **BE-02, `scope.md:115-120`:** B defines authoritative project/OpenSpec/EIN/Git/runtime/freshness state, including known/incomplete/unavailable/stale values and explicit invalidation semantics; private histories remain out.
- **BE-03, `scope.md:122-126`:** C gives Pi and Claude an honest list/create/resume/launch surface or deterministic capability/error states, without false lifecycle equivalence or history transfer.
- **BE-04, `scope.md:128-133`:** D provides the minimal project/runtime workbench flow and visible incomplete/stale evidence without absorbing install/update, dashboard, or post-beta mutations.
- **BE-05, `scope.md:135-141`:** E proves success, runtime/session errors, incomplete state, actionable diagnostics, and freshness invalidation after a relevant code change; installer E2E remains separate.
- **BE-06, `scope.md:143-147`:** candidate package/source/changelog/tag/workflow/checksum evidence agrees; CI and launcher E2E match the exact candidate; manual/native gaps remain explicit; publication stays in the GitHub Actions release boundary and is not performed here.

## Bounded apply outputs and file-level blast radius

| File | Current contradiction / evidence | Allowed correction and downstream effect |
|---|---|---|
| `docs/roadmap-beta.md` | Stale pending-order header (`:1-4`), core-parity “verification pending” wording (`:25-33`), 0.40.0 release/E2E/runtime claims (`:95-141`). | Make this the maintained beta truth record: mark core-parity and installer-beta as completed historical foundations with residual limits; establish 0.42.0 baseline; add classification matrix, A–E order, BE-01–BE-06, and explicit installer-vs-launcher E2E boundary. This is the primary acceptance-record surface. |
| `README.md` | Current Pi + Claude isolation is already described (`:11-40, 84-104`), but release/source-of-truth remains 0.40.0 (`:121-142`) and installer command wording remains Pi-direct (`:110-113`). | Correct release/source-of-truth to current metadata and align public ownership/runtime wording. Mention `--runtime pi|claude|both` only as installer capability; do not claim the future launcher is implemented. |
| `installer/README.md` | Intro and command surface remain Pi-only (`:1-19`); install/deploy paths are legacy Pi paths (`:40-49`); E2E and release descriptions are installer-focused but lack current runtime-selection metadata (`:55-81`). | Describe current isolated Pi + Claude installer/runtime selection, retain installer-owned install/update/release workflow, and label E2E as installer E2E rather than launcher beta evidence. |

The exact allowlist is `scope.md:149-163`. Do not edit `docs/roadmap-features-ein.md`, `docs/ein_futuras_features.md`, `CHANGELOG.md`, workflow/E2E files, archived SDD artifacts, product code, specs, tests, or unrelated dirty/deleted docs.

## Explicit non-map / non-apply boundaries

- No launcher implementation, shared-state schema, adapter, session lifecycle, doctor integration, launcher E2E, or freshness algorithm is mapped as implementation work; those belong to B–E.
- No workflow dispatch, release publication, tag mutation, checksum generation, build, typecheck, or test execution was performed.
- `openspec/config.yaml:1-58` records `strict_tdd: true` but has stale/blank test-runner fields relative to repository evidence; this is context only and remains unchanged. The configured typecheck is `cd installer && bun run typecheck`.
- The working-tree safety boundary from `scope.md:46, 158-163, 169-174` is binding: preserve pre-existing dirty/untracked/deleted state and write only this `map.md` during map.

## Design handoff

Design should turn this map into a documentation-only acceptance record with the three-file allowlist, authority order, exact current release baseline, classifications, BE-01–BE-06 gates, historical residuals, and explicit exclusions. It should not create a spec delta or pull launcher implementation into A. Recommended next phase: `sdd-design`.

## Skill applicability

- `release`: applied to SemVer baseline, tag/workflow ownership, and no-local-publication boundaries.
- `cognitive-doc-design`: applied through answer-first sections, evidence tables, and explicit reviewer blast radius.
- `document-writer`: applied for clear complete Markdown prose; Nuxt MDC references are not relevant to this OpenSpec artifact.
- `nuxt`: skipped; no Nuxt route, component, server, or configuration surface is in scope.
- `vitest`: skipped; this repository evidence uses Bun tests, and map forbids test execution.
- `web-quality-audit`: skipped; this is not a web-surface quality audit.
