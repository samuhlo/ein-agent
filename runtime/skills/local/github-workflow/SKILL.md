---
name: github-workflow
description: GitHub delivery workflow using SSH + gh — feature -> dev -> main promotion model, Samuhlo-style commits, PR summaries, reviews, and Linear sync.
license: internal
---

# GitHub Workflow

Use this skill for GitHub delivery work:

- branch creation
- commit preparation
- PR creation
- PR summaries
- reviews
- CodeRabbit comment triage
- checks/status reading
- syncing PR links back to Linear

## Hard Stop Gates

Do not create, edit, push, commit, review, or sync GitHub delivery unless all relevant gates are complete.

Required gates for PRs:

- `github-workflow` is loaded before any `git`/`gh` delivery command.
- Engram context is recovered before acting: `mem_context` plus project-specific search for GitHub, PR style, auth, CodeRabbit, Linear, and delivery notes.
- Branch, remote, status, staged diff, unstaged diff, and base diff are inspected.
- Work branches are cut from `dev` and target base `dev`; only hotfixes branch from and target `main`. If `dev` is missing, create it from `main` before branching (see Branch Flow).
- Repo-local delivery files are read when present: `.github/pull_request_template.md`, `.coderabbit.yaml`, `AGENTS.md`, `CLAUDE.md`.
- PR body uses repo template and memory first, not generic copy.
- PR body is Spanish by default and uses rich Markdown unless user explicitly asks otherwise.
- Verification claims are evidence-backed. If a command/manual check did not run in the current session, write `Skipped` with reason.
- If `gh auth status` fails but `gh auth token` works, retry with `GH_TOKEN=$(gh auth token)`.
- After PR create/edit, run `gh pr view` and verify title, head branch, base branch, URL, state, and body.

If any gate cannot be completed, stop and report the blocker. Do not improvise around the gate.

## Tooling Rule

Use **SSH + GitHub CLI (`gh`)**.

- SSH = code transport (`clone`, `fetch`, `pull`, `push`).
- `gh` = GitHub operations (`pr create`, `pr view`, `pr checks`, comments, reviews).
- Do not use GitHub Issues as the primary task source. In Team mode the board is Linear; in Solo mode it is `openspec/changes/` + git + EIN.md.

## Account Rule

Default GitHub account: `samuhlo`.

The secondary account `samuhlo-training` is only for home projects, tests, and sandboxes.

Before any operation that creates/pushes/publishes when repo ownership is unclear:

1. Check `gh auth status` and git remote.
2. If the target account might be `samuhlo-training`, ask one short question.
3. Otherwise use `samuhlo`.

## Mental Model

- Linear = board: what work exists and status.
- SDD = workbench: how the work is planned and implemented.
- GitHub = delivery: branch, commit, PR, review. Code flows `feature -> dev -> main`.
- Engram = notebook: lessons and decisions.

## Branch Flow (Delivery Model)

Default promotion model for any project managed with ein. Code flows in **one direction only**: `feature -> dev -> main`.

- **`main` = production.** Only receives merges from `dev`. Never direct commits, never a feature branch merged straight in (except hotfixes below). Whatever is on `main` is what is live.
- **`dev` = integration / staging.** Where finished work lands and coexists before shipping. Conflicts and cross-feature breakage surface here against the real integrated state, not against a partial stack of PRs.
- **`feat/*`, `fix/*`, `chore/*` branch from `dev`**, and their PR base is `dev`.

Day to day:

1. Cut the work branch from `dev` (not `main`).
2. Open the PR with base `dev`.
3. Merge to `dev` after CI/review passes. Finished work accumulates here.
4. To ship: PR (or merge) `dev -> main`. That single merge is the deploy to prod.

Hotfix (the only exception):

- A production bug must not wait for whatever is cooking in `dev`.
- Cut `fix/*` from `main`, PR against `main`, ship it.
- Then merge `main` back into `dev` so `dev` does not fall behind. This is the only time code flows backward.

Bootstrapping a repo:

- If no `dev` branch exists yet, create it from `main` before cutting any work branch:

  ```bash
  git switch -c dev main && git push -u origin dev
  ```

- Skip the model only for throwaway sandboxes, and say you are skipping it and why.

Vercel note (when the project deploys on Vercel):

- `main` -> production deploy.
- `dev` -> connect it as a branch to get a stable, permanent staging URL.
- other branches -> automatic ephemeral preview URLs. No extra config needed.

Protection (optional hardening):

- Branch protection on `main` (require PR, block direct push) turns "main only receives merges from dev" from discipline into a guarantee.

## Branch Naming

Prefer Linear-linked names:

```text
sam-123-short-feature-slug
```

Fallback without issue:

```text
feature/short-feature-slug
fix/short-bug-slug
chore/short-task-slug
```

Rules:

- lowercase
- hyphen-separated
- no spaces
- no decorative names
- include Linear issue ID when available
- branch from `dev` (hotfixes branch from `main`) — see Branch Flow

## Commit Style

Commit title must stay conventional and tool-friendly:

```text
feat(portfolio): add animated project cards
fix(auth): fail closed on missing token
docs(sdd): document linear workflow
```

Commit body may use Samuhlo delivery style:

```md
// 001. INTENCION

Explica por que existe este cambio.

// 002. CAMBIO

- Item concreto
- Item concreto

// 003. BLINDAJE

Que protege este cambio: fallback, accesibilidad, performance, seguridad, mantenibilidad.

// 004. VERIFICACION

- `bun run build`
- `bun run test`
```

Rules:

- Never add `Co-authored-by` or AI attribution.
- Do not commit secrets.
- Do not commit unrelated changes.
- Inspect staged and unstaged diff before drafting.
- If there are unrelated user changes, leave them alone.

## PR Style

Use rich GitHub Markdown for PR bodies. Keep the `// 001.` identity, but give it better rhythm with headings, quotes, tables, and short sections.

```md
# // 001. INTENCION

> Que problema resuelve esta PR y por que importa.

Breve, directo, sin vender humo.

## // 002. CAMBIO

- Cambio concreto
- Cambio concreto
- Cambio concreto

## // 003. BLINDAJE

> Donde se ha cerrado la puerta al fallo.

- Fallbacks
- Validaciones
- Accesibilidad/performance si aplica

## // 004. VERIFICACION

| Check | Resultado |
| --- | --- |
| `bun run build` | Passed |
| `bun run test` | Skipped: no tests touched |

## // 005. RIESGOS

> Lo que todavia puede morder.

- None
```

Use this lighter format for GitHub status/sync comments:

```md
## // 000. RESUMEN

PR conectada con Linear.

> Lo importante: ya hay una entrega enlazada y ahora toca mirar checks/review.

## // 001. ESTADO

- **Branch:** `sam-123-project-grid`
- **PR:** #24
- **Checks:** Pending

## // 002. SIGUIENTE

Esperar checks y revisar preview.
```

Tone:

- Spanish from Spain by default.
- Direct, human, no corporate filler.
- Concrete facts only. Do not invent impact.
- Clear enough for future you.
- No emojis.
- No decoration without readability value.
- Commits stay more sober than PRs because they are read in terminals.

## Review Style

Findings first. No generic praise before issues.

Use this structure:

```md
# // 001. HARD STOP

> Este cambio puede romper comportamiento real.

## [HIGH] `path/file.ts:42`

Que falla.

### Por que importa

explicacion simple.

### Arreglo

accion concreta.
```

Severity:

- `[HIGH]` breaks behavior, security, data, deploy, or core UX.
- `[MED]` likely bug, maintainability risk, missing validation, weak test.
- `[LOW]` small improvement, clarity, naming, non-blocking polish.

If no findings:

```md
# // 001. RESULTADO

> No encuentro bloqueos claros.

## Riesgo residual

- <testing gap or assumption>
```

## GitHub + Linear Sync

When a Linear issue exists:

- include issue ID in branch name
- include issue link/reference in PR body
- comment PR URL back in Linear
- update Linear after checks/review when useful

## CodeRabbit Pass

Use this when CodeRabbit has commented on a PR or the user asks to analyze CodeRabbit feedback.

Command shape:

```bash
/github-coderabbit [pr-number-or-url] [--wait N] [--fix] [--push]
```

Behavior:

- Without `--fix`: analyze only. Do not edit files.
- With `--fix`: apply only safe local fixes from the APPLY bucket.
- With `--wait N`: poll for CodeRabbit comments for up to N minutes. Never wait indefinitely.
- With `--push`: push to the same PR branch only after safe fixes and successful verification.

Read CodeRabbit comments from:

- PR review comments
- issue comments
- review summaries

Filter authors case-insensitively for names containing `coderabbit`.

Triage buckets:

- APPLY: small, local, evidence-backed bug/risk fix with low blast radius.
- DISCARD: style preference, false positive, obsolete/stale comment, duplicate, or non-actionable suggestion.
- ASK: suggestion may be valid but changes behavior, API, data model, security, architecture, performance tradeoff, or user-facing contract.

Safety rules:

- Never trust CodeRabbit blindly.
- Never apply API, schema, auth/security, persistence, build-tooling, or architecture changes without asking.
- Never apply large refactors or subjective style changes unless explicitly requested.
- Never edit if the comment is stale or the referenced file/line no longer exists.
- Never claim a check passed unless it ran in the current session.

Report style:

```md
# // 001. CODERABBIT DROP

> CodeRabbit dejo <n> comentarios. Separado senal de ruido.

## // 002. APLICAR

- [HIGH] `path/file.ts:42`
  - Bug real.
  - Accion segura.

## // 003. DESCARTAR

- [LOW] `path/file.ts:10`
  - Falso positivo / obsoleto / estilo.

## // 004. PREGUNTAR

- [MED] `path/file.ts:80`
  - Puede ser correcto, pero cambia contrato.

## // 005. VERIFICACION

| Check | Resultado |
| --- | --- |
| `bun run test` | Passed / Failed / Skipped: reason |
```

## Energy Routing

- `github-light` for branch creation, PR/status reads, simple Linear sync.
- `github-writer` for commits and PR descriptions.
- `github-review-heavy` for serious PR/code reviews.
- `github-coderabbit-heavy` for CodeRabbit triage and safe fixes.

Escalate to heavy when review touches auth, security, data, architecture, performance, or large diffs.
